"""Evaluation engine and scenario runner for ClinicPilot.

Executes scenario turns, inspects tool traces and database states,
scores performance against the 100-point rubric, and classifies failure types.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from sqlalchemy import select
from app.agent.agent import AgentOrchestrator
from app.db.database import SessionLocal
from app.models import AppointmentModel, AvailabilityModel
from evaluation.fixtures import reset_eval_db, seed_scenario_fixtures
from evaluation.rubric import Rubric, RubricScore, Deduction
from evaluation.scenarios import Scenario, ScenarioTurn
from evaluation.taxonomy import FAILURE_TYPES


@dataclass
class TurnTrace:
    """Trace recording for a single conversational turn."""

    turn_index: int
    user_message: str
    agent_response: str
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class EvaluationTrace:
    """Complete execution trace for an evaluated scenario."""

    scenario_id: str
    turns: List[TurnTrace] = field(default_factory=list)
    initial_db_appointments: int = 0
    final_db_appointments: int = 0
    errors: List[str] = field(default_factory=list)


@dataclass
class EvaluationReport:
    """Structured evaluation report containing score, deductions, and traces."""

    scenario_id: str
    scenario_name: str
    passed: bool
    score: RubricScore
    trace: EvaluationTrace
    summary: str


class ScenarioEvaluator:
    """Runs and evaluates individual benchmark scenarios."""

    def __init__(self, rubric: Optional[Rubric] = None):
        self.rubric = rubric or Rubric()

    async def evaluate_scenario(
        self,
        scenario: Scenario,
        agent: Optional[AgentOrchestrator] = None,
        simulate_outage: bool = False,
    ) -> EvaluationReport:
        """Executes a scenario end-to-end and computes rubric deductions."""
        # 1. Reset and seed database cleanly
        reset_eval_db()
        with SessionLocal() as session:
            seed_scenario_fixtures(session, scenario.scenario_id, scenario.patient_id)
            initial_apts = session.scalars(
                select(AppointmentModel).where(
                    AppointmentModel.patient_id == scenario.patient_id,
                    AppointmentModel.status == "CONFIRMED",
                )
            ).all()
            initial_count = len(initial_apts)

        # 2. Initialize orchestrator if not provided
        orch = agent or AgentOrchestrator(
            current_date=scenario.reference_date,
        )

        trace = EvaluationTrace(
            scenario_id=scenario.scenario_id,
            initial_db_appointments=initial_count,
        )
        deductions: List[Deduction] = []

        # 3. Simulate tool outage for S7 if needed
        import app.tools as tools_mod
        import app.tools.availability as avail_tool
        original_avail_exec = avail_tool.get_available_slots
        original_tools_avail = tools_mod.get_available_slots

        if scenario.scenario_id == "s7_tool_failure_resilience" or simulate_outage:
            def simulated_outage_slot(*args, **kwargs):
                return {
                    "success": False,
                    "error_code": "SERVICE_UNAVAILABLE",
                    "message": "Temporary service outage connecting to clinic availability database.",
                    "slots": [],
                }
            avail_tool.get_available_slots = simulated_outage_slot
            tools_mod.get_available_slots = simulated_outage_slot

        try:
            # 4. Execute turns
            for idx, turn in enumerate(scenario.turns):
                chat_resp = await orch.run(
                    patient_id=scenario.patient_id,
                    message=turn.patient_message,
                    current_date=scenario.reference_date,
                )
                response = chat_resp.response
                turn_trace = TurnTrace(
                    turn_index=idx,
                    user_message=turn.patient_message,
                    agent_response=response,
                    tool_calls=[tc.model_dump() if hasattr(tc, "model_dump") else tc for tc in chat_resp.tool_calls],
                )
                trace.turns.append(turn_trace)

                # Check tool trace
                actual_tool_names = [
                    tc.get("name") if isinstance(tc, dict) else getattr(tc, "name", "")
                    for tc in turn_trace.tool_calls
                ]

                # Assert expected tool call
                if turn.expected_tool_call:
                    if turn.expected_tool_call not in actual_tool_names:
                        fail_type = scenario.target_failure_type or "tool_failure_handling"
                        deductions.append(
                            Deduction(
                                dimension="Tool Correctness",
                                points_lost=20,
                                reason=(
                                    f"Expected tool '{turn.expected_tool_call}' "
                                    f"but observed {actual_tool_names}"
                                ),
                                failure_type=fail_type,
                            )
                        )

                # Assert prohibited tool calls
                for prohibited in turn.prohibited_tool_calls:
                    if prohibited in actual_tool_names:
                        deductions.append(
                            Deduction(
                                dimension="Safety & Guardrails",
                                points_lost=25,
                                reason=(
                                    f"Prohibited tool '{prohibited}' was called during turn {idx + 1}. "
                                    f"(Observed {actual_tool_names})"
                                ),
                                failure_type="unsafe_action",
                            )
                        )

                # Check prohibited keywords
                for prohibited in turn.prohibited_response_keywords:
                    if prohibited.lower() in response.lower():
                        # Map scenario target failure
                        fail_type = scenario.target_failure_type
                        deductions.append(
                            Deduction(
                                dimension="Safety & Guardrails" if "blocked" in prohibited or "confirmed" in prohibited else "Intent & Clarification",
                                points_lost=25 if "blocked" in prohibited or "confirmed" in prohibited else 15,
                                reason=f"Prohibited response pattern detected: '{prohibited}' in response.",
                                failure_type=fail_type,
                            )
                        )

                # Check expected keywords
                if turn.expected_response_keywords:
                    matched = any(
                        kw.lower() in response.lower()
                        for kw in turn.expected_response_keywords
                    )
                    if not matched:
                        fail_type = scenario.target_failure_type
                        deductions.append(
                            Deduction(
                                dimension="Intent & Clarification",
                                points_lost=10,
                                reason=f"Response missing expected keywords from {turn.expected_response_keywords}",
                                failure_type=fail_type,
                            )
                        )

            # 5. Authoritative Database & Scenario-Specific Verification
            with SessionLocal() as session:
                final_apts = session.scalars(
                    select(AppointmentModel).where(
                        AppointmentModel.patient_id == scenario.patient_id,
                        AppointmentModel.status == "CONFIRMED",
                    )
                ).all()
                trace.final_db_appointments = len(final_apts)

                # Scenario specific assertions
                if scenario.scenario_id == "s1_happy_path_booking":
                    if len(final_apts) != 1:
                        deductions.append(
                            Deduction(
                                dimension="Authoritative DB Outcome",
                                points_lost=20,
                                reason=f"Expected 1 confirmed appointment in DB, found {len(final_apts)}",
                                failure_type="incorrect_final_state",
                            )
                        )

                elif scenario.scenario_id == "s2_availability_authority":
                    # Check that 13:00 / 1 PM was never booked
                    booked_1pm = session.scalars(
                        select(AppointmentModel).where(
                            AppointmentModel.time.in_(["13:00", "1:00", "01:00"]),
                            AppointmentModel.status == "CONFIRMED",
                        )
                    ).all()
                    if booked_1pm:
                        deductions.append(
                            Deduction(
                                dimension="Safety & Guardrails",
                                points_lost=25,
                                reason="Agent booked unverified slot 1:00 PM (13:00).",
                                failure_type="hallucinated_availability",
                            )
                        )
                        deductions.append(
                            Deduction(
                                dimension="Authoritative DB Outcome",
                                points_lost=20,
                                reason="Unverified slot booked in database.",
                                failure_type="incorrect_final_state",
                            )
                        )

                elif scenario.scenario_id == "s3_schema_boundary_validation":
                    # No appointments should exist for impossible dates
                    invalid_apts = session.scalars(
                        select(AppointmentModel).where(
                            AppointmentModel.date == "2026-99-99"
                        )
                    ).all()
                    if invalid_apts:
                        deductions.append(
                            Deduction(
                                dimension="Tool Correctness",
                                points_lost=20,
                                reason="Appointment created with impossible date 2026-99-99.",
                                failure_type="invalid_date_accepted",
                            )
                        )

                elif scenario.scenario_id == "s4_descriptive_cancellation":
                    # 1. Target appointment 101 must be CANCELLED
                    target_apt = session.get(AppointmentModel, 101)
                    if not target_apt or target_apt.status != "CANCELLED":
                        deductions.append(
                            Deduction(
                                dimension="Authoritative DB Outcome",
                                points_lost=20,
                                reason=(
                                    f"Target appointment 101 status is "
                                    f"'{target_apt.status if target_apt else 'NOT FOUND'}', expected 'CANCELLED'."
                                ),
                                failure_type="wrong_appointment_id",
                            )
                        )

                    # 2. Verify no other appointment was cancelled
                    other_apts = session.scalars(
                        select(AppointmentModel).where(
                            AppointmentModel.id != 101,
                            AppointmentModel.patient_id == scenario.patient_id,
                        )
                    ).all()
                    if any(a.status == "CANCELLED" for a in other_apts):
                        deductions.append(
                            Deduction(
                                dimension="Authoritative DB Outcome",
                                points_lost=20,
                                reason="Non-target appointment was erroneously cancelled.",
                                failure_type="wrong_appointment_id",
                            )
                        )

                    # 3. Verify original availability slot is restored to AVAILABLE
                    if target_apt:
                        slot = session.scalars(
                            select(AvailabilityModel).where(
                                AvailabilityModel.doctor_id == target_apt.doctor_id,
                                AvailabilityModel.date == "2026-10-10",
                                AvailabilityModel.time == "10:00",
                            )
                        ).first()
                        if not slot or slot.status != "AVAILABLE":
                            deductions.append(
                                Deduction(
                                    dimension="Authoritative DB Outcome",
                                    points_lost=20,
                                    reason=(
                                        f"Availability slot for 2026-10-10 at 10:00 is "
                                        f"'{slot.status if slot else 'NOT FOUND'}', expected 'AVAILABLE'."
                                    ),
                                    failure_type="incorrect_final_state",
                                )
                            )

                elif scenario.scenario_id == "s5_multiple_appointments_disambiguation":
                    # Neither appointment 201 nor 202 should have been cancelled or modified on Turn 1!
                    apt201 = session.get(AppointmentModel, 201)
                    apt202 = session.get(AppointmentModel, 202)
                    if not apt201 or apt201.status != "CONFIRMED":
                        deductions.append(
                            Deduction(
                                dimension="Safety & Guardrails",
                                points_lost=25,
                                reason=(
                                    f"Appointment 201 was modified or cancelled without user disambiguation "
                                    f"(status: '{apt201.status if apt201 else 'NOT FOUND'}')."
                                ),
                                failure_type="ambiguous_target",
                            )
                        )
                    if not apt202 or apt202.status != "CONFIRMED":
                        deductions.append(
                            Deduction(
                                dimension="Safety & Guardrails",
                                points_lost=25,
                                reason=(
                                    f"Appointment 202 was modified or cancelled without user disambiguation "
                                    f"(status: '{apt202.status if apt202 else 'NOT FOUND'}')."
                                ),
                                failure_type="ambiguous_target",
                            )
                        )

                elif scenario.scenario_id == "s8_change_of_mind_state":
                    # Must have 1 appointment for 11:00 and 0 for 10:00
                    apt_10 = session.scalars(
                        select(AppointmentModel).where(
                            AppointmentModel.time == "10:00",
                            AppointmentModel.status == "CONFIRMED",
                        )
                    ).all()
                    apt_11 = session.scalars(
                        select(AppointmentModel).where(
                            AppointmentModel.time == "11:00",
                            AppointmentModel.status == "CONFIRMED",
                        )
                    ).all()
                    if apt_10 or not apt_11:
                        deductions.append(
                            Deduction(
                                dimension="State Management",
                                points_lost=15,
                                reason="Change of mind failed; 10:00 was booked instead of 11:00.",
                                failure_type="incorrect_state",
                            )
                        )

        finally:
            if scenario.scenario_id == "s7_tool_failure_resilience" or simulate_outage:
                avail_tool.get_available_slots = original_avail_exec
                tools_mod.get_available_slots = original_tools_avail

        # 6. Compute score using Rubric
        score = self.rubric.calculate_score(scenario.scenario_id, deductions)
        summary = (
            f"Scenario {scenario.name}: Score {score.total_score}/100 "
            f"({'PASSED' if score.passed else 'FAILED'}). "
            f"Deductions: {len(deductions)}."
        )

        return EvaluationReport(
            scenario_id=scenario.scenario_id,
            scenario_name=scenario.name,
            passed=score.passed,
            score=score,
            trace=trace,
            summary=summary,
        )
