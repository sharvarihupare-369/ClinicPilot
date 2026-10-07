"""Closed-Loop Self-Improvement Engine.

Analyzes evaluation results, detects recurring failure patterns classified
under the failure taxonomy, synthesizes structured safety policies, and persists
them into app/policies/learned_rules.json.
"""

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from evaluation.evaluator import EvaluationReport
from evaluation.taxonomy import classify_failure, FAILURE_CATALOG
from app.policies import load_learned_rules, save_learned_rule, clear_learned_rules


@dataclass
class FailureAnalysis:
    """Diagnostic analysis of a scenario failure."""

    scenario_id: str
    scenario_name: str
    failure_type: str
    severity: str
    dimension: str
    score: int
    reasons: List[str]
    root_cause: str


@dataclass
class LearnedRule:
    """Structured learned policy synthesized to prevent a categorized failure."""

    improvement_id: str
    target_failure_type: str
    target_scenario: str
    title: str
    rule_text: str
    created_at: str

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class ImprovementEngine:
    """Engine that drives closed-loop failure diagnosis and policy synthesis."""

    RULE_TEMPLATES: Dict[str, Dict[str, str]] = {
        "ambiguous_target": {
            "title": "Disambiguate Multiple Appointments Before Cancellation or Rescheduling",
            "rule_text": (
                "If a patient has more than one confirmed appointment and requests cancellation "
                "or rescheduling without specifying which one, always call get_patient_appointments, "
                "list all active appointments, and ask the patient to specify which appointment they want "
                "to modify. Never guess or cancel blindly."
            ),
        },
        "hallucinated_availability": {
            "title": "Authoritative Slot Verification Required",
            "rule_text": (
                "User-requested times must never be assumed available. Always inspect get_available_slots "
                "and ensure the requested time is returned. If unavailable, inform the user and list "
                "only genuine open slots."
            ),
        },
        "wrong_appointment_id": {
            "title": "Descriptive Appointment ID Resolution",
            "rule_text": (
                "Never extract database appointment IDs from calendar dates or descriptive numbers. "
                "Call get_patient_appointments, match descriptive criteria (doctor, date, time) "
                "in application logic, and pass the verified appointment ID."
            ),
        },
        "missing_clarification": {
            "title": "Funnel Progression on Scheduling Intent",
            "rule_text": (
                "When a patient indicates an intent to schedule an appointment, ask targeted questions "
                "about their desired specialty or location rather than resetting with a generic greeting."
            ),
        },
        "missing_confirmation": {
            "title": "Mandatory Pre-Booking Explicit Confirmation",
            "rule_text": (
                "Always present a complete booking summary (doctor, specialty, date, time, location) "
                "and obtain explicit confirmation before invoking book_appointment."
            ),
        },
    }

    def analyze_failures(self, reports: List[EvaluationReport]) -> List[FailureAnalysis]:
        """Analyzes a list of evaluation reports and returns diagnosed failures."""
        analyses: List[FailureAnalysis] = []

        for report in reports:
            if not report.passed or report.score.deductions:
                for ded in report.score.deductions:
                    ftype = ded.failure_type or "unsafe_action"
                    detail = classify_failure(ftype)
                    analyses.append(
                        FailureAnalysis(
                            scenario_id=report.scenario_id,
                            scenario_name=report.scenario_name,
                            failure_type=ftype,
                            severity=detail.severity,
                            dimension=ded.dimension,
                            score=report.score.total_score,
                            reasons=[ded.reason],
                            root_cause=detail.description,
                        )
                    )
        return analyses

    def synthesize_rule(self, analysis: FailureAnalysis) -> LearnedRule:
        """Synthesizes a structured learned rule from a failure analysis."""
        ftype = analysis.failure_type
        template = self.RULE_TEMPLATES.get(
            ftype,
            {
                "title": f"Safety Rule for {ftype.replace('_', ' ').title()}",
                "rule_text": f"Enforce safety policy preventing {ftype}: {analysis.reasons[0] if analysis.reasons else ''}",
            },
        )

        now_str = datetime.now(timezone.utc).isoformat()
        rule_id = f"RULE_{ftype.upper()}_{now_str[:10].replace('-', '')}"

        return LearnedRule(
            improvement_id=rule_id,
            target_failure_type=ftype,
            target_scenario=analysis.scenario_id,
            title=template["title"],
            rule_text=template["rule_text"],
            created_at=now_str,
        )

    def apply_improvement(self, rule: LearnedRule) -> None:
        """Applies and saves the learned rule into the policy registry."""
        save_learned_rule(rule.to_dict())

    def save_rule(self, rule: LearnedRule) -> None:
        """Alias for apply_improvement."""
        self.apply_improvement(rule)

    def reset_improvements(self) -> None:
        """Resets all learned improvements back to clean baseline."""
        clear_learned_rules()
