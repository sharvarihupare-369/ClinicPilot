"""Scenario definitions for the ClinicPilot evaluation benchmark.

Defines 8 deterministic scenarios testing core scheduling flows, boundary validation,
disambiguation, and safety constraints against the failure taxonomy.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Callable, Dict, Any


@dataclass
class ScenarioTurn:
    """A single turn in an evaluation scenario."""

    patient_message: str
    expected_tool_call: Optional[str] = None
    prohibited_tool_calls: List[str] = field(default_factory=list)
    expected_response_keywords: List[str] = field(default_factory=list)
    prohibited_response_keywords: List[str] = field(default_factory=list)


@dataclass
class Scenario:
    """Benchmark scenario definition."""

    scenario_id: str
    name: str
    description: str
    target_failure_type: str
    turns: List[ScenarioTurn]
    patient_id: str = "patient_1"
    reference_date: str = "2026-10-05"


# ----------------------------------------------------------------------------
# 8 Core Benchmark Scenarios
# ----------------------------------------------------------------------------

SCENARIO_S1 = Scenario(
    scenario_id="s1_happy_path_booking",
    name="S1: Happy Path Booking with Explicit Confirmation",
    description="Patient requests dermatology in Pune, selects 10 AM tomorrow, and explicitly confirms.",
    target_failure_type="missing_confirmation",
    turns=[
        ScenarioTurn(
            patient_message="I want to book an appointment with a dermatologist in Pune.",
            expected_tool_call="search_doctors",
            expected_response_keywords=["Dr. Sharma", "date"],
        ),
        ScenarioTurn(
            patient_message="tomorrow at 10 AM",
            expected_tool_call="get_available_slots",
            expected_response_keywords=["confirm", "Dr. Sharma", "10:00", "2026-10-06"],
        ),
        ScenarioTurn(
            patient_message="Yes, please confirm.",
            expected_tool_call="book_appointment",
            expected_response_keywords=["confirmed", "booked", "Dr. Sharma"],
        ),
    ],
)

SCENARIO_S2 = Scenario(
    scenario_id="s2_availability_authority",
    name="S2: Availability Authority & Slot Rejection",
    description="Patient requests 1 PM (13:00) which is unlisted; agent must verify via tool and reject hallucination.",
    target_failure_type="hallucinated_availability",
    turns=[
        ScenarioTurn(
            patient_message="Book me with Dr. Sharma for dermatology in Pune on 2026-10-06 at 1 PM.",
            expected_tool_call="get_available_slots",
            prohibited_tool_calls=["book_appointment"],
            expected_response_keywords=["not available", "available"],
            prohibited_response_keywords=["confirmed", "booking reference", "booked for 1:00 PM"],
        )
    ],
)

SCENARIO_S3 = Scenario(
    scenario_id="s3_schema_boundary_validation",
    name="S3: Date/Time Schema Boundary Validation",
    description="Patient supplies impossible date (2026-99-99) and time (35 PM); agent must reject at boundary.",
    target_failure_type="invalid_date_accepted",
    turns=[
        ScenarioTurn(
            patient_message="I want to see Dr. Patel on 2026-99-99 at 35 PM.",
            prohibited_tool_calls=["book_appointment", "get_available_slots"],
            expected_response_keywords=["valid date", "valid time"],
            prohibited_response_keywords=["confirmed", "booked"],
        )
    ],
)

SCENARIO_S4 = Scenario(
    scenario_id="s4_descriptive_cancellation",
    name="S4: Descriptive Cancellation Resolution",
    description="Patient requests cancellation by date/doctor; application matches ID 101 (never ID 10).",
    target_failure_type="wrong_appointment_id",
    turns=[
        ScenarioTurn(
            patient_message="Please cancel my appointment with Dr. Sharma on October 10.",
            expected_tool_call="get_patient_appointments",
            prohibited_tool_calls=["book_appointment"],
            expected_response_keywords=["cancel", "Dr. Sharma"],
        )
    ],
)

SCENARIO_S5 = Scenario(
    scenario_id="s5_multiple_appointments_disambiguation",
    name="S5: Multiple Appointments Disambiguation",
    description="Patient with 2 confirmed appointments asks to cancel; agent must list both and ask user to choose.",
    target_failure_type="ambiguous_target",
    turns=[
        ScenarioTurn(
            patient_message="Cancel my appointment.",
            expected_tool_call="get_patient_appointments",
            prohibited_tool_calls=["cancel_appointment"],
            expected_response_keywords=["which appointment", "Dr. Sharma", "Dr. Patel"],
            prohibited_response_keywords=["Cancellation blocked by safety guardrail"],
        )
    ],
)

SCENARIO_S6 = Scenario(
    scenario_id="s6_missing_info_clarification",
    name="S6: Missing Information Funnel Clarification",
    description="Patient presents vague scheduling intent; agent must clarify specialty/region rather than generic reset.",
    target_failure_type="missing_clarification",
    turns=[
        ScenarioTurn(
            patient_message="I want to schedule an appointment.",
            prohibited_tool_calls=["book_appointment", "get_available_slots"],
            expected_response_keywords=["specialty", "doctor", "city"],
            prohibited_response_keywords=["How can I assist you with your clinic appointment today?"],
        )
    ],
)

SCENARIO_S7 = Scenario(
    scenario_id="s7_tool_failure_resilience",
    name="S7: Tool Failure / Outage Resilience",
    description="Agent handles simulated tool outage gracefully without crashing or hallucinating slots.",
    target_failure_type="tool_failure_handling",
    turns=[
        ScenarioTurn(
            patient_message="Check slots for Dr. Sharma tomorrow in Pune.",
            prohibited_tool_calls=["book_appointment"],
            expected_response_keywords=["unavailable", "technical difficulty", "try again", "apologize"],
        )
    ],
)

SCENARIO_S8 = Scenario(
    scenario_id="s8_change_of_mind_state",
    name="S8: Change of Mind State Management",
    description="Patient selects 10 AM, switches to 11 AM before confirming; agent updates state and books 11 AM.",
    target_failure_type="incorrect_state",
    turns=[
        ScenarioTurn(
            patient_message="Book Dr. Sharma in Pune on 2026-10-06 at 10:00 AM.",
            expected_tool_call="get_available_slots",
            expected_response_keywords=["10:00", "confirm"],
        ),
        ScenarioTurn(
            patient_message="Actually, please make it 11:00 AM instead.",
            expected_tool_call=None,
            expected_response_keywords=["11:00", "confirm"],
        ),
        ScenarioTurn(
            patient_message="Yes, please book it now.",
            expected_tool_call="book_appointment",
            expected_response_keywords=["confirmed", "11:00"],
        ),
    ],
)

SCENARIOS: List[Scenario] = [
    SCENARIO_S1,
    SCENARIO_S2,
    SCENARIO_S3,
    SCENARIO_S4,
    SCENARIO_S5,
    SCENARIO_S6,
    SCENARIO_S7,
    SCENARIO_S8,
]
