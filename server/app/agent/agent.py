"""Agent Orchestrator managing multi-turn dialogue, safety guardrails, and tool dispatch."""

import re
from typing import Optional, List, Dict, Any

from app.db import SessionLocal
from app.repositories import ClinicRepository
from app.services import ClinicService
from app.schemas.chat import ChatResponse
from app.agent.state import SessionStore, SessionState
from app.tools import ALL_TOOL_DEFINITIONS, execute_tool
from app.agent.llm import LLMClientInterface, get_llm_client
from app.policies import compile_system_prompt, load_learned_rules
from app.agent.parsers import (
    resolve_date_expression,
    parse_and_normalize_time,
    detect_invalid_date_expression,
    detect_invalid_time_expression,
    extract_specialty,
    is_vague_booking_request,
    is_broad_doctor_search,
)
from app.db.config import CURRENT_DATE
from app.agent.guardrails import (
    check_pre_booking_confirmation,
    check_multiple_appointment_disambiguation,
    check_past_time_scheduling,
)

DOCTORS_DIRECTORY = [
    (1, "Dr. Sharma", "Dermatology", "Pune", ["sharma"]),
    (2, "Dr. Patel", "Cardiology", "Pune", ["patel"]),
    (3, "Dr. Mehta", "Dermatology", "Mumbai", ["mehta"]),
    (4, "Dr. Ananya Iyer", "Pediatrics", "Pune", ["iyer", "ananya"]),
    (5, "Dr. Rajesh Verma", "Orthopedics", "Mumbai", ["verma", "rajesh"]),
    (6, "Dr. Vikram Deshmukh", "General Medicine", "Pune", ["deshmukh", "vikram"]),
    (7, "Dr. Sneha Kulkarni", "Neurology", "Mumbai", ["kulkarni", "sneha"]),
    (8, "Dr. Rajiv Joshi", "ENT", "Pune", ["joshi", "rajiv"]),
]


class AgentOrchestrator:
    """Core AI agent coordinating LLM reasoning, deterministic guardrails, and clinic tools."""

    def __init__(
        self,
        clinic_service: Optional[ClinicService] = None,
        llm_client: Optional[LLMClientInterface] = None,
        session_store: Optional[SessionStore] = None,
        current_date: Optional[str] = None,
        current_time: Optional[str] = None,
    ):
        self.service = clinic_service
        self.llm = llm_client or get_llm_client()
        self.sessions = session_store or SessionStore()
        from app.db.config import get_current_datetime
        def_date, def_time = get_current_datetime()
        self.current_date = current_date or def_date
        self.current_time = current_time or def_time

    def _get_service(self) -> ClinicService:
        if self.service:
            return self.service
        # Default fresh DB session
        db_session = SessionLocal()
        repo = ClinicRepository(db_session)
        return ClinicService(repo)

    async def run(
        self,
        patient_id: str,
        message: str,
        session_id: Optional[str] = None,
        current_date: Optional[str] = None,
        current_time: Optional[str] = None,
    ) -> ChatResponse:
        """Executes a single conversational turn for a patient."""
        service = self._get_service()
        state = self.sessions.get_or_create(patient_id, session_id)
        from app.db.config import get_current_datetime
        def_date, def_time = get_current_datetime()
        if current_date:
            state.current_date = current_date
        elif not state.current_date:
            state.current_date = self.current_date or def_date

        if current_time:
            state.current_time = current_time
        elif not state.current_time:
            state.current_time = self.current_time or def_time

        # Direct input validation: Check for malformed dates/times before routing
        inv_date = detect_invalid_date_expression(message)
        if inv_date:
            direct_text = f"'{inv_date}' is not a valid calendar date. Please provide a valid date in YYYY-MM-DD format (such as 2026-10-10) or say 'tomorrow'."
            state.add_assistant_message(text=direct_text)
            return ChatResponse(
                patient_id=patient_id,
                session_id=state.session_id,
                response=direct_text,
                tool_calls=[],
                state=state.to_summary_dict(),
            )

        inv_time = detect_invalid_time_expression(message)
        if inv_time:
            direct_text = f"'{inv_time}' isn't a valid time. Please provide a valid appointment time such as 10:00 AM, 3 PM, or 15:00."
            state.add_assistant_message(text=direct_text)
            return ChatResponse(
                patient_id=patient_id,
                session_id=state.session_id,
                response=direct_text,
                tool_calls=[],
                state=state.to_summary_dict(),
            )

        # Input validation: Check for dates or times in the past
        parsed_t = parse_and_normalize_time(message)
        date_in_msg = resolve_date_expression(message, current_date=state.current_date)
        effective_date = date_in_msg or state.date

        if date_in_msg and date_in_msg < state.current_date:
            direct_text = f"The date '{date_in_msg}' has already passed. Please provide an upcoming date (such as today or tomorrow)."
            state.add_assistant_message(text=direct_text)
            return ChatResponse(
                patient_id=patient_id,
                session_id=state.session_id,
                response=direct_text,
                tool_calls=[],
                state=state.to_summary_dict(),
            )

        if parsed_t and effective_date:
            if effective_date < state.current_date or (effective_date == state.current_date and state.current_time and parsed_t <= state.current_time):
                direct_text = (
                    f"'{parsed_t}' on {effective_date} has already passed (current time: {state.current_time} on {state.current_date}). "
                    f"We cannot schedule appointments in the past. Please choose a future appointment time or check tomorrow's openings."
                )
                state.add_assistant_message(text=direct_text)
                return ChatResponse(
                    patient_id=patient_id,
                    session_id=state.session_id,
                    response=direct_text,
                    tool_calls=[],
                    state=state.to_summary_dict(),
                )

        # 1. Update session state with incoming user message
        state.add_user_message(message)
        self._update_state_from_user_text(message, state)

        # 2. Compile dynamic system prompt (Base + Learned Rules + Temporal Context)
        system_instruction = compile_system_prompt(current_date=state.current_date)

        # Build message history for LLM
        formatted_messages = []
        for m in state.messages:
            msg_dict = {"role": m.role, "content": m.content}
            if m.tool_calls:
                msg_dict["tool_calls"] = m.tool_calls
            if m.tool_results:
                msg_dict["tool_results"] = m.tool_results
            formatted_messages.append(msg_dict)

        current_messages = list(formatted_messages)
        executed_tool_calls = []
        max_tool_iterations = 4

        # 3. Iterative Tool Execution & Reasoning Loop
        for iteration in range(max_tool_iterations):
            llm_output = self.llm.generate(
                system_instruction=system_instruction,
                messages=current_messages,
                tools=ALL_TOOL_DEFINITIONS,
                context_state=state.to_summary_dict(),
            )

            # If LLM produces no tool calls, it has returned its final conversational text
            if not llm_output.tool_calls:
                direct_text = llm_output.text or "How can I assist you with your clinic appointment today?"
                if is_vague_booking_request(message) or (state.intent == "BOOK" and not state.doctor_id and not state.specialty and not state.date):
                    if not direct_text or direct_text.strip() == "How can I assist you with your clinic appointment today?":
                        direct_text = "Sure. Which specialty or doctor would you like to see, and what date would you prefer?"
                if any(w in direct_text.lower() for w in ["confirm and book", "should i confirm", "would you like me to confirm"]):
                    state.confirmation_requested = True

                state.add_assistant_message(
                    text=direct_text,
                    tool_calls=[{"name": tc["name"], "args": tc["args"]} for tc in executed_tool_calls] if executed_tool_calls else None,
                    tool_results=[tc["result"] for tc in executed_tool_calls] if executed_tool_calls else None,
                )
                return ChatResponse(
                    patient_id=patient_id,
                    session_id=state.session_id,
                    response=direct_text,
                    tool_calls=executed_tool_calls,
                    state=state.to_summary_dict(),
                )

            # Process tool calls
            for tool_call in llm_output.tool_calls:
                tool_name = tool_call.name
                tool_args = tool_call.arguments

                # --- GUARDRAIL 1: Pre-booking confirmation ---
                if tool_name == "book_appointment":
                    guard_res = check_pre_booking_confirmation(tool_args, state)
                    if not guard_res.allowed:
                        tool_result = guard_res.to_dict()
                        executed_tool_calls.append({"name": tool_name, "args": tool_args, "result": tool_result})
                        state.add_assistant_message(
                            text=guard_res.message,
                            tool_calls=[{"name": tool_name, "args": tool_args}],
                            tool_results=[tool_result],
                        )
                        return ChatResponse(
                            patient_id=patient_id,
                            session_id=state.session_id,
                            response=guard_res.message,
                            tool_calls=executed_tool_calls,
                            state=state.to_summary_dict(),
                        )

                # --- GUARDRAIL 2: Prevent scheduling in the past ---
                if tool_name in ["book_appointment", "reschedule_appointment"]:
                    guard_res = check_past_time_scheduling(tool_name, tool_args, state)
                    if not guard_res.allowed:
                        tool_result = guard_res.to_dict()
                        executed_tool_calls.append({"name": tool_name, "args": tool_args, "result": tool_result})
                        state.add_assistant_message(
                            text=guard_res.message,
                            tool_calls=[{"name": tool_name, "args": tool_args}],
                            tool_results=[tool_result],
                        )
                        return ChatResponse(
                            patient_id=patient_id,
                            session_id=state.session_id,
                            response=guard_res.message,
                            tool_calls=executed_tool_calls,
                            state=state.to_summary_dict(),
                        )

                # --- GUARDRAIL 3: Multiple appointment disambiguation ---
                if tool_name == "cancel_appointment":
                    guard_res = check_multiple_appointment_disambiguation(
                        tool_args, state, service
                    )
                    if not guard_res.allowed:
                        tool_result = guard_res.to_dict()
                        executed_tool_calls.append({"name": tool_name, "args": tool_args, "result": tool_result})
                        
                        # Recover gracefully from disambiguation guardrail by listing active appointments
                        active_apts = service.get_patient_appointments(patient_id=patient_id, status="CONFIRMED")
                        if active_apts:
                            lines = [f"- Dr. {a.doctor_name.replace('Dr. ', '')} on {a.date} at {a.time} (ID: {a.id})" for a in active_apts]
                            friendly_msg = (
                                f"You currently have {len(active_apts)} confirmed appointments:\n"
                                + "\n".join(lines)
                                + "\nWhich appointment would you like to cancel? Please specify the doctor, date, or appointment ID."
                            )
                        else:
                            friendly_msg = "You do not have any active appointments to cancel."

                        state.add_assistant_message(
                            text=friendly_msg,
                            tool_calls=[{"name": tool_name, "args": tool_args}],
                            tool_results=[tool_result],
                        )
                        return ChatResponse(
                            patient_id=patient_id,
                            session_id=state.session_id,
                            response=friendly_msg,
                            tool_calls=executed_tool_calls,
                            state=state.to_summary_dict(),
                        )

                # Execute domain tool
                tool_result = execute_tool(tool_name, tool_args, service)
                executed_tool_calls.append({"name": tool_name, "args": tool_args, "result": tool_result})
                state.last_tool_called = tool_name
                state.last_tool_result = tool_result

                # Update state based on tool results
                self._update_state_from_tool_result(tool_name, tool_args, tool_result, state)

                # Append assistant tool call and tool result to current_messages for next LLM iteration
                current_messages.append({
                    "role": "assistant",
                    "content": llm_output.text or "",
                    "tool_calls": [{"name": tool_name, "args": tool_args}],
                })
                current_messages.append({
                    "role": "tool",
                    "tool_name": tool_name,
                    "content": str(tool_result),
                    "tool_result": tool_result,
                })

        # Fallback if loop reaches max iterations
        fallback_text = "I've processed your requests. Is there anything else I can help you with?"
        state.add_assistant_message(
            text=fallback_text,
            tool_calls=[{"name": tc["name"], "args": tc["args"]} for tc in executed_tool_calls] if executed_tool_calls else None,
            tool_results=[tc["result"] for tc in executed_tool_calls] if executed_tool_calls else None,
        )
        return ChatResponse(
            patient_id=patient_id,
            session_id=state.session_id,
            response=fallback_text,
            tool_calls=executed_tool_calls,
            state=state.to_summary_dict(),
        )

    def _update_state_from_user_text(self, text: str, state: SessionState) -> None:
        """Progressively extracts clinical slots and intent from user message."""
        text_lower = text.lower()

        # Fresh booking inquiry resets previous booking state
        if is_vague_booking_request(text):
            state.intent = "BOOK"
            state.doctor_id = None
            state.doctor_name = None
            state.specialty = None
            state.location = None
            state.date = None
            state.time = None
            state.available_slots = None
            state.target_appointment_id = None
            state.confirmation_requested = False
            state.patient_confirmed = False
            return

        # Broad doctor inquiry resets stale specialty/doctor filters unless a new specialty is explicitly specified
        if is_broad_doctor_search(text):
            parsed_spec = extract_specialty(text)
            if not parsed_spec:
                state.specialty = None
                state.doctor_id = None
                state.doctor_name = None
                state.available_slots = None
                state.confirmation_requested = False
                state.patient_confirmed = False
                if not any(c in text_lower for c in ["pune", "mumbai", "bangalore", "delhi"]):
                    state.location = None

        # Intent
        if "cancel" in text_lower:
            state.intent = "CANCEL"
            state.confirmation_requested = False
            state.patient_confirmed = False
            state.target_appointment_id = None

            # Only retain doctor if mentioned in this cancellation turn
            state.doctor_id = None
            state.doctor_name = None
            for did, dname, dspec, dloc, dkeys in DOCTORS_DIRECTORY:
                if any(k in text_lower for k in dkeys):
                    state.doctor_id = did
                    state.doctor_name = dname
                    break

            state.date = resolve_date_expression(text, current_date=state.current_date)
            state.time = parse_and_normalize_time(text)

            apt_match = re.search(r"\b(?:apt_?|appointment\s*(?:id)?\s*(?:#|:)?|#)\s*(\d+)\b", text_lower)
            if apt_match:
                state.target_appointment_id = int(apt_match.group(1))
            return

        # Check explicit appointment view / inquiry intent
        inquire_patterns = [
            "show me my appointment", "show my appointment", "show my appointments",
            "view my appointment", "view my appointments", "check my appointment",
            "check my appointments", "what appointment", "what appointments",
            "my appointment", "my appointments", "list my appointment", "list my appointments",
            "do i have any appointment", "do i have an appointment",
        ]
        if any(p in text_lower for p in inquire_patterns) and not any(w in text_lower for w in ["cancel", "reschedule", "book"]):
            state.intent = "INQUIRE"
            state.confirmation_requested = False
            state.patient_confirmed = False
        elif "reschedule" in text_lower:
            state.intent = "RESCHEDULE"
        elif any(w in text_lower for w in ["book", "appointment", "doctor", "see a"]):
            state.intent = "BOOK"

        # Specialty
        parsed_spec = extract_specialty(text)
        if parsed_spec:
            if state.specialty != parsed_spec:
                state.doctor_id = None
                state.doctor_name = None
                state.available_slots = None
                state.patient_confirmed = False
                state.confirmation_requested = False
            state.specialty = parsed_spec

        # Location
        if "pune" in text_lower:
            state.location = "Pune"
        elif "mumbai" in text_lower:
            state.location = "Mumbai"
        elif any(b in text_lower for b in ["bangalore", "banglore", "bengaluru"]):
            state.location = "Bangalore"
        elif "delhi" in text_lower:
            state.location = "Delhi"
        else:
            # Check pattern like "in <city> region" or "near <city> city"
            reg_match = re.search(r"\b(?:in|near|at)\s+([a-zA-Z]+)\s+(?:region|city)\b", text_lower)
            if reg_match:
                cand = reg_match.group(1).lower()
                if not extract_specialty(cand) and cand not in ["doctor", "appointment", "clinic", "hospital", "the", "a"]:
                    state.location = cand.title()
            elif len(text.strip().split()) == 1 and text.strip().isalpha():
                # Single word response, check if previous assistant turn asked for city/region
                cand = text.strip().lower()
                if not extract_specialty(cand):
                    last_asst = next((m.content for m in reversed(state.messages[:-1]) if m.role == "assistant"), "")
                    if "which city or region" in last_asst.lower() or "city location" in last_asst.lower():
                        state.location = cand.title()

        # Doctor
        new_doc_id = None
        new_doc_name = None
        new_spec = None
        new_loc = None
        for did, dname, dspec, dloc, dkeys in DOCTORS_DIRECTORY:
            if any(k in text_lower for k in dkeys):
                new_doc_id = did
                new_doc_name = dname
                new_spec = dspec
                new_loc = dloc
                break

        if new_doc_id:
            if state.doctor_id != new_doc_id:
                # Doctor changed: invalidate previous confirmation
                state.patient_confirmed = False
                state.confirmation_requested = False
                state.available_slots = None
            state.doctor_id = new_doc_id
            state.doctor_name = new_doc_name
            state.specialty = new_spec
            state.location = new_loc

        # Date (resolve relative dates e.g. 'tomorrow' or explicit ISO dates)
        resolved_date = resolve_date_expression(text, current_date=state.current_date)
        if resolved_date:
            if state.date != resolved_date:
                # Date changed: reset cached available slots and invalidate confirmation
                state.available_slots = None
                state.patient_confirmed = False
                state.confirmation_requested = False
            state.date = resolved_date

        # Time (parse and normalize explicit times without substring collisions)
        resolved_time = parse_and_normalize_time(text)
        if resolved_time:
            effective_date = state.date or state.current_date
            is_past = False
            if effective_date < state.current_date:
                is_past = True
            elif effective_date == state.current_date and state.current_time and resolved_time <= state.current_time:
                is_past = True

            if not is_past:
                if state.time != resolved_time:
                    # Time changed: invalidate previous confirmation
                    state.patient_confirmed = False
                    state.confirmation_requested = False
                state.time = resolved_time

        # Target appointment id: MUST be an explicit appointment ID, NOT a date or time number!
        apt_match = re.search(r"\b(?:apt_?|appointment\s*(?:id)?\s*(?:#|:)?|#)\s*(\d+)\b", text_lower)
        if apt_match:
            state.target_appointment_id = int(apt_match.group(1))

        # Check Rejection / Hesitation (never treat hesitation as confirmation)
        rejection_patterns = [
            r"^(?:no|nope|no thanks|no, thanks)[\.!]?$",
            r"\bdon'?t\s+book\b",
            r"\bdo\s+not\s+book\b",
            r"\bcancel\s+that\b",
            r"\bnever\s*mind\b",
            r"\bnot\s+yet\b",
            r"\bwait\b",
            r"\bthink\s+about\s+it\b",
            r"\bconsider\s+it\b",
            r"\bmaybe\b",
            r"\bnot\s+sure\b",
            r"\bhold\s+on\b",
        ]
        if any(re.search(p, text_lower.strip()) for p in rejection_patterns):
            state.patient_confirmed = False
            state.confirmation_requested = False
            return

        # Positive Confirmation (only if no rejection/hesitation is present)
        confirm_patterns = [
            r"\b(?:yes|yeah|yep)\b",
            r"\byes\s+please\b",
            r"\bbook\s+it\b",
            r"\bbook\s+this\b",
            r"\bbook\s+that\b",
            r"\bplease\s+book\b",
            r"\bgo\s+ahead\b",
            r"\bconfirm\b",
            r"\bthat'?s\s+fine\b",
            r"\bsure\b",
            r"\bdo\s+it\b",
        ]
        is_positive = any(re.search(p, text_lower) for p in confirm_patterns)
        if is_positive and state.confirmation_requested:
            # If user also specifies a time in this turn (e.g. "book Dr. Sharma tomorrow at 1 PM"), that is a new time, not confirmation
            if not resolved_time:
                state.patient_confirmed = True

    def _update_state_from_tool_result(
        self,
        tool_name: str,
        arguments: Dict[str, Any],
        result: Dict[str, Any],
        state: SessionState,
    ) -> None:
        """Enriches session state from authoritative tool returns."""
        if tool_name == "search_doctors" and result.get("success"):
            docs = result.get("doctors", [])
            if len(docs) == 1:
                state.doctor_id = int(docs[0]["id"])
                state.doctor_name = docs[0]["name"]
                state.specialty = docs[0]["specialty"]
                state.location = docs[0]["location"]
        elif tool_name == "get_available_slots" and result.get("success"):
            slots = result.get("slots", [])
            state.available_slots = [s["time"] for s in slots]
        elif tool_name == "get_patient_appointments" and result.get("success"):
            apts = result.get("appointments", [])
            last_user_msg = next((m.content for m in reversed(state.messages) if m.role == "user"), "").lower()
            # If user asked for doctor seen last time, populate state from most recent appointment
            if any(w in last_user_msg for w in ["saw last time", "last time", "previous doctor", "seen before"]) and apts:
                last_apt = apts[-1]
                state.doctor_id = last_apt.get("doctor_id")
                state.doctor_name = last_apt.get("doctor_name")
                state.specialty = last_apt.get("specialty")
                state.location = last_apt.get("location")
            # If user requested cancellation without explicit ID and exactly 1 appointment exists:
            elif state.intent == "CANCEL" and len(apts) == 1:
                state.target_appointment_id = apts[0].get("id")
                state.confirmation_requested = True
        elif tool_name == "book_appointment" and result.get("success"):
            # Booking completed: reset booking-specific slots for subsequent requests
            state.confirmation_requested = False
            state.patient_confirmed = False
            state.doctor_id = None
            state.doctor_name = None
            state.specialty = None
            state.location = None
            state.date = None
            state.time = None
            state.available_slots = None
            state.target_appointment_id = None
            state.intent = None
        elif tool_name == "cancel_appointment" and result.get("success"):
            # Cancellation completed: reset target criteria
            state.target_appointment_id = None
            state.doctor_id = None
            state.doctor_name = None
            state.specialty = None
            state.location = None
            state.date = None
            state.time = None
            state.confirmation_requested = False
            state.patient_confirmed = False
            state.intent = None





_global_agent: Optional[AgentOrchestrator] = None


def get_agent() -> AgentOrchestrator:
    """Dependency injector for AgentOrchestrator."""
    global _global_agent
    if _global_agent is None:
        _global_agent = AgentOrchestrator()
    return _global_agent
