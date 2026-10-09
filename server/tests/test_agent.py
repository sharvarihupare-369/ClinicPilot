"""Tests for the AI Agent Orchestrator and multi-turn conversation flows."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db import Base
from app.repositories import ClinicRepository
from app.services import ClinicService
from app.agent import AgentOrchestrator, SessionStore


@pytest.fixture
def agent_fixture():
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine)
    session = TestingSession()
    repo = ClinicRepository(session)
    repo.seed_default_clinic_data()
    service = ClinicService(repo)
    sessions = SessionStore()
    # Pin to a deterministic date so date-relative tests ("Tomorrow", "next week") are stable.
    agent = AgentOrchestrator(
        clinic_service=service,
        session_store=sessions,
        current_date="2026-10-05",
        current_time="09:00",
    )

    yield agent, repo, session

    session.close()
    Base.metadata.drop_all(engine)


@pytest.mark.anyio
async def test_agent_multi_turn_booking_flow(agent_fixture):
    agent, repo, _ = agent_fixture

    # Turn 1: Inquire about specialty and city
    t1 = await agent.run(patient_id="pat_101", message="I need a dermatologist in Pune")
    assert "Dr. Sharma" in t1.response
    assert len(t1.tool_calls) == 1
    assert t1.tool_calls[0]["name"] == "search_doctors"

    # Turn 2: Provide explicit date (not 'Tomorrow' to avoid time-dependency)
    t2 = await agent.run(patient_id="pat_101", message="2026-10-06")
    assert "Available slots" in t2.response
    assert len(t2.tool_calls) == 1
    assert t2.tool_calls[0]["name"] == "get_available_slots"

    # Turn 3: Select time -> triggers confirmation request, DOES NOT book yet
    t3 = await agent.run(patient_id="pat_101", message="10:00 AM")
    assert "confirm and book" in t3.response.lower()
    assert len(t3.tool_calls) == 0  # Crucial safety: No booking tool executed yet!

    # Verify no appointment exists in DB yet
    assert len(repo.get_patient_appointments("pat_101")) == 0

    # Turn 4: Patient explicitly confirms -> executes book_appointment
    t4 = await agent.run(patient_id="pat_101", message="Yes, please confirm")
    assert "successfully booked and confirmed" in t4.response.lower()
    assert len(t4.tool_calls) == 1
    assert t4.tool_calls[0]["name"] == "book_appointment"

    # Verify appointment now authoritatively exists in DB
    db_apts = repo.get_patient_appointments("pat_101")
    assert len(db_apts) == 1
    assert db_apts[0].status == "CONFIRMED"
    assert db_apts[0].time == "10:00"


@pytest.mark.anyio
async def test_agent_clarification_on_vague_request(agent_fixture):
    agent, _, _ = agent_fixture
    res = await agent.run(patient_id="pat_102", message="Book me a doctor")
    assert "specialty" in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_agent_handles_service_outage(agent_fixture):
    agent, repo, _ = agent_fixture
    # Inject simulated outage
    agent.service.simulate_availability_failure = True

    # Ask for doctor first
    await agent.run(patient_id="pat_103", message="Dermatology in Pune")

    # Ask for date -> availability tool returns simulated outage
    res = await agent.run(patient_id="pat_103", message="2026-10-10")
    assert "technical difficulties" in res.response.lower() or "unavailable" in res.response.lower()


@pytest.mark.anyio
async def test_agent_never_invents_defaults_on_unprompted_confirmation(agent_fixture):
    """Safety Test: A patient saying 'Yes' or 'Confirm' out of context must not book with defaults."""
    agent, repo, _ = agent_fixture

    # Patient sends 'Yes' out of nowhere
    res = await agent.run(patient_id="pat_unprompted", message="Yes, confirm")
    assert "which doctor" in res.response.lower() or "specialty" in res.response.lower()
    assert len(res.tool_calls) == 0

    # Ensure no appointment was created in DB
    assert len(repo.get_patient_appointments("pat_unprompted")) == 0


@pytest.mark.anyio
async def test_agent_never_invents_doctor_when_date_provided_first(agent_fixture):
    """Safety Test: A patient providing only a date must not default to Dr. Sharma."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_date_only", message="Tomorrow")
    assert "which doctor" in res.response.lower() or "specialty" in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_agent_never_invents_defaults_when_time_provided_first(agent_fixture):
    """Safety Test: A patient providing only a time must not default to Dr. Sharma and today."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_time_only", message="10:00 AM")
    assert "which doctor" in res.response.lower() or "specialty" in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_agent_relative_date_resolution_based_on_current_date(agent_fixture):
    """Test: 'Tomorrow' must resolve to Oct 6 when current_date is Oct 5, not Oct 10."""
    agent, _, _ = agent_fixture

    # 1. Search doctor
    await agent.run(patient_id="pat_rel_date", message="Dermatology in Pune", current_date="2026-10-05")

    # 2. Say 'Tomorrow' with frozen current_date '2026-10-05'
    res = await agent.run(patient_id="pat_rel_date", message="Tomorrow", current_date="2026-10-05")
    assert len(res.tool_calls) == 1
    assert res.tool_calls[0]["name"] == "get_available_slots"
    # Must query 2026-10-06 (NOT hardcoded 2026-10-10!)
    assert res.tool_calls[0]["args"]["date"] == "2026-10-06"


def test_time_parsing_utility():
    """Test: Time parsing must normalize explicit times and avoid substring false positives."""
    from app.agent.parsers import parse_and_normalize_time, resolve_date_expression

    # Explicit times
    assert parse_and_normalize_time("10:00 AM") == "10:00"
    assert parse_and_normalize_time("10 AM") == "10:00"
    assert parse_and_normalize_time("10:00") == "10:00"
    assert parse_and_normalize_time("3 PM") == "15:00"
    assert parse_and_normalize_time("15:00") == "15:00"
    assert parse_and_normalize_time("4:30 pm") == "16:30"

    # Non-time strings that would trigger naive substring matching
    assert parse_and_normalize_time("2026-10-10") is None
    assert parse_and_normalize_time("appointment") is None
    assert parse_and_normalize_time("Dr. Sharma") is None

    # Date resolution
    assert resolve_date_expression("today", current_date="2026-10-05") == "2026-10-05"
    assert resolve_date_expression("tomorrow", current_date="2026-10-05") == "2026-10-05" or "2026-10-06"
    assert resolve_date_expression("2026-10-10", current_date="2026-10-05") == "2026-10-10"


def test_gemini_client_raises_without_silent_fallback():
    """Test: GeminiLLMClient must raise RuntimeError upon API failure, never silently fall back."""
    from app.agent.llm import GeminiLLMClient
    from unittest.mock import MagicMock

    client = GeminiLLMClient(api_key="fake_key", model="gemini-3.8-flash")
    client.client = MagicMock()
    client.client.models.generate_content.side_effect = Exception("API quota exceeded")

    with pytest.raises(RuntimeError, match="Gemini API execution error"):
        client.generate(
            system_instruction="test",
            messages=[{"role": "user", "content": "hi"}],
            tools=[],
        )


@pytest.mark.anyio
async def test_agent_prompts_for_region_when_multiple_doctors_found(agent_fixture):
    """Test: When multiple doctors across regions are found, agent must ask for preferred region/city."""
    agent, _, _ = agent_fixture

    res = await agent.run(
        patient_id="pat_multi_region",
        message="I want to book an appointment for dermatologist and see all dermatologists",
    )
    assert len(res.tool_calls) == 1
    assert res.tool_calls[0]["name"] == "search_doctors"
    # Agent must ask which city/region the patient prefers
    assert "which city or region" in res.response.lower() or "region" in res.response.lower()


@pytest.mark.anyio
async def test_agent_handles_unsupported_region_flow(agent_fixture):
    """Test: When patient specifies an unsupported region (e.g. Bangalore), agent checks and guides them."""
    agent, _, _ = agent_fixture

    # Turn 1: Ask for all dermatologists
    t1 = await agent.run(
        patient_id="pat_bangalore",
        message="I want to book an appointment for dermatologist for that I want to see all dermatologists",
    )
    assert "which city or region" in t1.response.lower()

    # Turn 2: Patient says "banglore"
    t2 = await agent.run(
        patient_id="pat_bangalore",
        message="banglore",
    )
    assert len(t2.tool_calls) == 1
    assert t2.tool_calls[0]["name"] == "search_doctors"
    assert "bangalore" in t2.response.lower()
    assert "pune" in t2.response.lower() or "mumbai" in t2.response.lower()

    # Turn 3: Patient redirects to Pune
    t3 = await agent.run(
        patient_id="pat_bangalore",
        message="Pune",
    )
    assert len(t3.tool_calls) == 1
    assert "Dr. Sharma" in t3.response
    assert "date" in t3.response.lower()


@pytest.mark.anyio
async def test_agent_slot_inquiry_and_direct_booking_phrase(agent_fixture):
    """Test: Asking for slots prompts for date; providing natural date & time prompts for confirmation."""
    agent, repo, _ = agent_fixture

    # Turn 1: Check cardiologist in Mumbai (not found)
    t1 = await agent.run(patient_id="pat_natural", message="Find me a cardiologist in Mumbai.")
    assert "don't currently have any doctors matching that specialty in mumbai" in t1.response.lower()

    # Turn 2: Switch to Dr. Sharma and ask for available slots
    t2 = await agent.run(patient_id="pat_natural", message="Show me available slots for Dr. Sharma.")
    # Agent should ask for the date, NOT search for a cardiologist in Mumbai!
    assert "what date would you like to check available slots for dr. sharma" in t2.response.lower()

    # Turn 3: Full booking phrase: "I want to book Dr. Sharma on October 10 at 10 AM."
    t3 = await agent.run(patient_id="pat_natural", message="I want to book Dr. Sharma on October 10 at 10 AM.")
    # Agent must summarize and ask for confirmation
    assert "confirm and book" in t3.response.lower()
    assert "dr. sharma" in t3.response.lower()
    assert "2026-10-10" in t3.response
    assert "10:00" in t3.response

    # Turn 4: Patient confirms
    t4 = await agent.run(patient_id="pat_natural", message="Yes")
    assert "successfully booked and confirmed" in t4.response.lower()
    assert len(t4.tool_calls) == 1
    assert t4.tool_calls[0]["name"] == "book_appointment"


@pytest.mark.anyio
async def test_invalid_date_validation_blocks_tool(agent_fixture):
    """Test: Impossible calendar dates (e.g. 2026-99-99) must be rejected before reaching tools."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_inv_date", message="Book it on 2026-99-99.")
    assert "not a valid calendar date" in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_invalid_time_detection_does_not_reset(agent_fixture):
    """Test: Impossible times (e.g. 35 PM) must be rejected with an explanation, not reset to generic greeting."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_inv_time", message="Book it at 35 PM.")
    assert "isn't a valid time" in res.response.lower()
    assert "how can i assist" not in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_vague_booking_request_advances_funnel(agent_fixture):
    """Test: 'Book me an appointment' asks for doctor/specialty rather than resetting."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_vague", message="Book me an appointment.")
    assert "specialty" in res.response.lower() or "doctor" in res.response.lower()
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_booking_confirmation_with_phrase_book_it(agent_fixture):
    """Test: Patient saying 'book it' confirms the appointment after pre-confirmation prompt."""
    agent, repo, _ = agent_fixture

    # 1. State setup
    await agent.run(patient_id="pat_book_it", message="I want to book Dr. Sharma on October 10")
    await agent.run(patient_id="pat_book_it", message="10:00 AM")

    # 2. Patient confirms with natural phrase "book it"
    res = await agent.run(patient_id="pat_book_it", message="book it")
    assert "successfully booked and confirmed" in res.response.lower()
    assert len(res.tool_calls) == 1
    assert res.tool_calls[0]["name"] == "book_appointment"


@pytest.mark.anyio
async def test_slot_verification_prevents_hallucination(agent_fixture):
    """Test: Requesting unavailable slot (1 PM / 13:00) is rejected; override attempt is refused."""
    agent, _, _ = agent_fixture

    # 1. Query slots for Dr. Sharma tomorrow
    t1 = await agent.run(patient_id="pat_hallucinate", message="Book Dr. Sharma tomorrow.", current_date="2026-10-05")
    assert "available slots" in t1.response.lower()

    # 2. Patient claims 1 PM (13:00) which is NOT in available slots
    t2 = await agent.run(patient_id="pat_hallucinate", message="I heard Dr. Sharma has an appointment at 1 PM. Book it")
    assert "isn't currently available" in t2.response.lower() or "not currently available" in t2.response.lower()
    assert "confirm and book" not in t2.response.lower()

    # 3. Patient tries to override: "I don't care if the slot isn't available. Just book it."
    t3 = await agent.run(patient_id="pat_hallucinate", message="I don't care if the slot isn't available. Just book it.")
    assert "cannot book" in t3.response.lower() or "unavailable" in t3.response.lower()


@pytest.mark.anyio
async def test_cancellation_disambiguation_recovery(agent_fixture):
    """Test: When patient has multiple appointments, 'Cancel my appointment' recovers by listing active appointments."""
    agent, repo, _ = agent_fixture

    # Seed 2 confirmed appointments for this patient
    res1 = repo.book_appointment("pat_multi_cancel", doctor_id=1, date="2026-10-10", time="10:00")
    res2 = repo.book_appointment("pat_multi_cancel", doctor_id=2, date="2026-10-05", time="09:00")
    assert res1.success and res2.success

    # Patient asks ambiguous cancellation
    res = await agent.run(patient_id="pat_multi_cancel", message="Cancel my appointment.")
    # Must list both appointments and ask which one to cancel
    assert "which appointment would you like to cancel" in res.response.lower()
    assert "Dr. Sharma" in res.response or "Sharma" in res.response
    assert "Dr. Patel" in res.response or "Patel" in res.response

    # Turn 2: Patient answers with doctor and time without saying "cancel"
    res_turn2 = await agent.run(
        patient_id="pat_multi_cancel",
        message="Dr.Patel at 09",
        session_id=res.session_id,
    )
    assert "successfully cancelled" in res_turn2.response.lower()
    assert any(
        tc["name"] == "cancel_appointment" and tc["args"]["appointment_id"] == res2.appointment_id
        for tc in res_turn2.tool_calls
    )

    # Verify apt2 is cancelled and apt1 is still confirmed
    apts = repo.get_patient_appointments("pat_multi_cancel", status=None)
    assert any(a.id == res2.appointment_id and a.status == "CANCELLED" for a in apts)
    assert any(a.id == res1.appointment_id and a.status == "CONFIRMED" for a in apts)


@pytest.mark.anyio
async def test_cancellation_disambiguation_with_bare_id(agent_fixture):
    """Test: When disambiguating multiple appointments, patient responding with bare ID cancels correctly."""
    agent, repo, _ = agent_fixture

    res1 = repo.book_appointment("pat_bare_id", doctor_id=1, date="2026-10-10", time="10:00")
    res2 = repo.book_appointment("pat_bare_id", doctor_id=2, date="2026-10-05", time="09:00")
    assert res1.success and res2.success

    res = await agent.run(patient_id="pat_bare_id", message="Cancel my appointment.")
    assert "which appointment would you like to cancel" in res.response.lower()

    # Patient responds with bare ID of the second appointment
    res_turn2 = await agent.run(
        patient_id="pat_bare_id",
        message=str(res2.appointment_id),
        session_id=res.session_id,
    )
    assert "successfully cancelled" in res_turn2.response.lower()
    assert any(
        tc["name"] == "cancel_appointment" and tc["args"]["appointment_id"] == res2.appointment_id
        for tc in res_turn2.tool_calls
    )


@pytest.mark.anyio
async def test_cancellation_disambiguation_with_ordinal(agent_fixture):
    """Test: When disambiguating multiple appointments, patient responding with 'second one' cancels correctly."""
    agent, repo, _ = agent_fixture

    res1 = repo.book_appointment("pat_ordinal", doctor_id=1, date="2026-10-10", time="10:00")
    res2 = repo.book_appointment("pat_ordinal", doctor_id=2, date="2026-10-05", time="09:00")
    assert res1.success and res2.success

    res = await agent.run(patient_id="pat_ordinal", message="I want to cancel my appointment")
    assert "which appointment would you like to cancel" in res.response.lower()

    res_turn2 = await agent.run(
        patient_id="pat_ordinal",
        message="the second one",
        session_id=res.session_id,
    )
    assert "successfully cancelled" in res_turn2.response.lower()
    # Chronologically: apt 1 is 2026-10-05 (1st), apt 2 is 2026-10-10 (2nd: res1)
    assert any(
        tc["name"] == "cancel_appointment" and tc["args"]["appointment_id"] == res1.appointment_id
        for tc in res_turn2.tool_calls
    )


@pytest.mark.anyio
async def test_descriptive_cancellation_resolves_correct_id_not_day_number(agent_fixture):
    """Test: 'Cancel my appointment with Dr. Sharma on October 10 at 10 AM' must resolve to actual appointment ID, NOT 10."""
    agent, repo, _ = agent_fixture

    # Seed appointments
    res1 = repo.book_appointment("pat_desc_cancel", doctor_id=1, date="2026-10-10", time="10:00")
    res2 = repo.book_appointment("pat_desc_cancel", doctor_id=2, date="2026-10-05", time="09:00")
    assert res1.success and res2.success
    apt1_id = res1.appointment_id
    apt2_id = res2.appointment_id

    # Patient asks to cancel with descriptive info containing "October 10"
    res = await agent.run(
        patient_id="pat_desc_cancel",
        message="Cancel my appointment with Dr. Sharma on October 10 at 10 AM.",
    )
    # Must cancel apt1, NOT fail looking for ID 10!
    assert "successfully cancelled" in res.response.lower()
    assert any(tc["name"] == "cancel_appointment" and tc["args"]["appointment_id"] == apt1_id for tc in res.tool_calls)

    # Verify apt1 is cancelled and apt2 is still confirmed
    apts = repo.get_patient_appointments("pat_desc_cancel", status=None)
    assert any(a.id == apt1_id and a.status == "CANCELLED" for a in apts)
    assert any(a.id == apt2_id and a.status == "CONFIRMED" for a in apts)


@pytest.mark.anyio
async def test_book_me_for_friday_clarifies_missing_doctor_and_location(agent_fixture):
    """Test: 'Book me for Friday' asks for missing doctor/specialty & location without resetting."""
    agent, _, _ = agent_fixture

    res = await agent.run(patient_id="pat_friday", message="Book me for Friday.")
    assert "what type of doctor" in res.response.lower() or "specialty" in res.response.lower()
    assert "location" in res.response.lower() or "prefer" in res.response.lower()
    assert "how can i assist" not in res.response.lower()


@pytest.mark.anyio
async def test_doctor_saw_last_time_uses_history_never_infers_from_search(agent_fixture):
    """Test: 'Book me with the doctor I saw last time' must query appointment history, not search doctors."""
    agent, repo, _ = agent_fixture

    # Case 1: Patient has NO previous appointment history
    res1 = await agent.run(patient_id="pat_new_no_history", message="Book me with the doctor I saw last time.")
    # Must use get_patient_appointments, NOT search_doctors
    assert any(tc["name"] == "get_patient_appointments" for tc in res1.tool_calls)
    assert not any(tc["name"] == "search_doctors" for tc in res1.tool_calls)
    assert "history" in res1.response.lower() or "previous doctor" in res1.response.lower()

    # Case 2: Patient DOES have previous appointment history (saw Dr. Patel)
    repo.book_appointment("pat_with_history", doctor_id=2, date="2026-10-05", time="09:00")
    res2 = await agent.run(patient_id="pat_with_history", message="Book me with the doctor I saw last time.")
    assert any(tc["name"] == "get_patient_appointments" for tc in res2.tool_calls)
    assert "Dr. Patel" in res2.response
    assert "date" in res2.response.lower()


@pytest.mark.anyio
async def test_changing_time_or_date_invalidates_prior_confirmation(agent_fixture):
    """Test: If user changes time from 10 AM to 3 PM, previous confirmation is invalidated and requires re-confirmation."""
    agent, repo, _ = agent_fixture

    # 1. User sets up booking for Dr. Sharma on Oct 10 at 10 AM
    await agent.run(patient_id="pat_change_time", message="I want to book Dr. Sharma on October 10 at 10 AM.")
    # User confirms 10 AM
    t2 = await agent.run(patient_id="pat_change_time", message="Yes, confirm")
    assert "successfully booked and confirmed" in t2.response.lower()

    # 2. In a new flow, user requests 10 AM tomorrow
    await agent.run(patient_id="pat_change_time", message="Book Dr. Sharma tomorrow at 10 AM.")
    # State has confirmation_requested
    # User now changes their mind: "Actually, 3 PM works better."
    t4 = await agent.run(patient_id="pat_change_time", message="Actually, 3 PM works better.")
    # Must propose 15:00 and ask for confirmation again, NOT immediately execute booking!
    assert "15:00" in t4.response
    assert "confirm and book" in t4.response.lower()
    assert len(t4.tool_calls) == 0  # Crucial: Not booked yet!

    # 3. Explicit confirmation for 3 PM
    t5 = await agent.run(patient_id="pat_change_time", message="book it")
    assert "successfully booked and confirmed" in t5.response.lower()
    assert any(tc["name"] == "book_appointment" and tc["args"]["time"] == "15:00" for tc in t5.tool_calls)


@pytest.mark.anyio
async def test_rejection_and_hesitation_never_confirmed(agent_fixture):
    """Test: 'Actually, don't book it. I'll think about it' cancels confirmation prompt and never books."""
    agent, repo, _ = agent_fixture

    # 1. Propose appointment
    await agent.run(patient_id="pat_hesitant", message="Book Dr. Sharma tomorrow at 10 AM.")

    # 2. Patient hesitates / rejects
    res = await agent.run(patient_id="pat_hesitant", message="Actually, don't book it. I'll think about it.")
    assert "not booked" in res.response.lower() or "no problem" in res.response.lower()
    assert len(res.tool_calls) == 0

    # Ensure no appointment booked in DB
    apts = repo.get_patient_appointments("pat_hesitant")
    assert len(apts) == 0


@pytest.mark.anyio
async def test_booking_past_time_for_today_is_rejected(agent_fixture):
    """Test: When reference time is 17:42, requesting 9 AM today must be rejected as already passed."""
    agent, repo, _ = agent_fixture

    res = await agent.run(
        patient_id="pat_past_time",
        message="I want to book an appointment with Dr. Sharma for today at 9am",
        current_date="2026-10-05",
        current_time="17:42",
    )
    assert "already passed" in res.response.lower()
    # Must not invoke booking
    assert not any(tc["name"] == "book_appointment" for tc in res.tool_calls)
    assert len(repo.get_patient_appointments("pat_past_time")) == 0


@pytest.mark.anyio
async def test_today_slots_all_passed_notifies_patient(agent_fixture):
    """Test: When all clinic slots for today have passed (17:42 > 16:00), agent reports all slots passed."""
    agent, repo, _ = agent_fixture

    res = await agent.run(
        patient_id="pat_today_slots",
        message="What slots are available for Dr. Sharma today?",
        current_date="2026-10-05",
        current_time="17:42",
    )
    assert "passed" in res.response.lower() or "tomorrow" in res.response.lower()


@pytest.mark.anyio
async def test_skin_doctor_synonym_maps_to_dermatology(agent_fixture):
    """Test: Colloquial 'skin doctor' maps to Dermatology and searches location in Pune."""
    agent, repo, _ = agent_fixture

    res = await agent.run(
        patient_id="pat_skin_doc",
        message="I need a skin doctor somewhere around Pune tomorrow afternoon.",
        current_date="2026-10-05",
        current_time="18:00",
    )
    assert "Dr. Sharma" in res.response
    assert len(res.tool_calls) >= 1
    assert res.tool_calls[0]["name"] == "search_doctors"
    assert res.tool_calls[0]["args"]["specialty"] == "Dermatology"
    assert res.tool_calls[0]["args"]["location"] == "Pune"


@pytest.mark.anyio
async def test_standalone_no_cancels_booking_confirmation(agent_fixture):
    """Test: When confirmation is requested, a standalone 'No' cancels booking without calling tools."""
    agent, repo, _ = agent_fixture

    # 1. Request slot
    await agent.run(patient_id="pat_no_test", message="I want an appointment with Dr. Sharma tomorrow at 10 AM.")
    # 2. Reject with standalone 'No'
    r2 = await agent.run(patient_id="pat_no_test", message="No")
    assert "not booked" in r2.response.lower() or "no problem" in r2.response.lower()
    assert len(r2.tool_calls) == 0
    # Verify no appointment in DB
    assert len(repo.get_patient_appointments("pat_no_test")) == 0


@pytest.mark.anyio
async def test_race_condition_slot_already_booked_rejection(agent_fixture):
    """Test: When a slot is claimed behind the scenes between inquiry and confirmation, agent handles SLOT_ALREADY_BOOKED authoritatively."""
    agent, repo, _ = agent_fixture

    # 1. User inquires about slot
    await agent.run(patient_id="pat_race_user", message="I want an appointment with Dr. Sharma tomorrow at 10 AM.")

    # 2. Intervening event: competitor books the 10:00 AM slot
    comp_res = repo.book_appointment(patient_id="competitor", doctor_id=1, date="2026-10-06", time="10:00")
    assert comp_res.success is True

    # 3. User attempts to confirm
    r2 = await agent.run(patient_id="pat_race_user", message="Yes, book it.")
    assert "just booked" in r2.response.lower() or "remaining" in r2.response.lower()
    assert not ("successfully booked and confirmed" in r2.response.lower())
    assert any(tc["name"] == "book_appointment" and tc["result"]["error_code"] == "SLOT_ALREADY_BOOKED" for tc in r2.tool_calls)

    # 4. Verify authoritative DB outcome: user has 0 appointments
    user_apts = repo.get_patient_appointments("pat_race_user")
    assert len(user_apts) == 0


@pytest.mark.anyio
async def test_vague_booking_phrase_variants_advance_funnel(agent_fixture):
    """Test: Booking intent variations ask for missing info rather than returning generic fallback."""
    agent, _, _ = agent_fixture

    variations = [
        "Book me an appointment",
        "I want to book an appointment",
        "I'd like to book an appointment",
        "I need an appointment",
        "Can I schedule an appointment?",
        "I want to see a doctor",
        "I need to see a doctor",
    ]

    for i, v in enumerate(variations):
        r = await agent.run(patient_id=f"pat_vague_var_{i}", message=v)
        assert "how can i assist" not in r.response.lower()
        assert "Sure. Which specialty or doctor would you like to see, and what date would you prefer?" in r.response


@pytest.mark.anyio
async def test_task_frame_state_preservation_and_scope_widening(agent_fixture):
    """Test: State is preserved on task continuation (Tomorrow), but constraints cleared on new broad query."""
    agent, repo, _ = agent_fixture
    pat_id = "pat_task_frame"

    # Turn 1: Explicit constraint
    r1 = await agent.run(patient_id=pat_id, message="I want a dermatologist.")
    state1 = agent.sessions.get_or_create(patient_id=pat_id)
    assert state1.specialty == "Dermatology"

    # Turn 2: Task continuation (Tomorrow) -> preserves specialty
    r2 = await agent.run(patient_id=pat_id, message="Tomorrow.")
    state2 = agent.sessions.get_or_create(patient_id=pat_id)
    assert state2.specialty == "Dermatology"
    assert state2.date is not None

    # Turn 3: New broad request (Which doctors are available?) -> clears specialty constraint
    r3 = await agent.run(patient_id=pat_id, message="Which doctors are available?")
    state3 = agent.sessions.get_or_create(patient_id=pat_id)
    assert state3.specialty is None
    assert len(r3.tool_calls) >= 1
    assert r3.tool_calls[0]["name"] == "search_doctors"
    assert r3.tool_calls[0]["args"].get("specialty") is None
    assert r3.tool_calls[0]["result"]["count"] == 8



@pytest.mark.anyio
async def test_skin_category_and_dermats_synonyms(agent_fixture):
    """Test: 'skin category' and 'dermats' correctly map to Dermatology and find doctors."""
    agent, repo, _ = agent_fixture

    # 1. 'skin category'
    r1 = await agent.run(patient_id="pat_skin_cat", message="can you give me which doctors are available in skin category ?")
    assert len(r1.tool_calls) >= 1
    assert r1.tool_calls[0]["name"] == "search_doctors"
    assert r1.tool_calls[0]["result"]["count"] >= 1
    assert "Sharma" in r1.response or "Mehta" in r1.response or "city" in r1.response.lower()

    # 2. 'dermats'
    r2 = await agent.run(patient_id="pat_dermats", message="Can you give me dermats ?")
    assert len(r2.tool_calls) >= 1
    assert r2.tool_calls[0]["name"] == "search_doctors"
    assert r2.tool_calls[0]["result"]["count"] >= 1
    assert "Sharma" in r2.response or "Mehta" in r2.response or "city" in r2.response.lower()


@pytest.mark.anyio
async def test_broad_doctor_search_clears_stale_specialty(agent_fixture):
    """Test: Broad doctor query ('which doctors are available currenlty ?' or 'I want to see doctors ?')

    clears previously stored specialty filter so it does not retain stale 'skin' state.
    """
    agent, repo, _ = agent_fixture

    # Turn 1: Ask for skin category
    t1 = await agent.run(patient_id="pat_stale_spec", message="can you give me which doctors are available in skin category ?")
    assert t1.tool_calls[0]["result"]["count"] == 2  # Dr. Sharma and Dr. Mehta

    # Turn 2: Ask broad question: 'which doctors are available currenlty ?'
    t2 = await agent.run(patient_id="pat_stale_spec", message="which doctors are available currenlty ?")
    assert len(t2.tool_calls) >= 1
    assert t2.tool_calls[0]["name"] == "search_doctors"
    # Must search with specialty=None, finding ALL 3 doctors (both Dermatology & Cardiology)
    assert t2.tool_calls[0]["args"].get("specialty") is None
    assert t2.tool_calls[0]["result"]["count"] == 8

    # Turn 3: Ask another broad question: 'I want to see doctors ?'
    t3 = await agent.run(patient_id="pat_stale_spec", message="I want to see doctors ?")
    assert len(t3.tool_calls) >= 1
    assert t3.tool_calls[0]["name"] == "search_doctors"
    assert t3.tool_calls[0]["args"].get("specialty") is None
    assert t3.tool_calls[0]["result"]["count"] == 8


@pytest.mark.anyio
async def test_doctor_consultation_fee_inquiry(agent_fixture):
    """Test: When patient asks for doctor consultation fee, agent directly provides fee and does not ask for region/city."""
    agent, repo, _ = agent_fixture

    # 1. Ask for Dr. Mrunal's consultation fee
    r1 = await agent.run(patient_id="pat_fee_1", message="what is consulting fee for dr. mrunal")
    assert "1000" in r1.response
    assert "Mrunal" in r1.response
    assert "Which city or region" not in r1.response

    # 2. Ask for Dr. Rohan Joshi's consultation fee
    r2 = await agent.run(patient_id="pat_fee_2", message="what is the consulting fee for dr. rohan joshi")
    assert "850" in r2.response
    assert "Rohan Joshi" in r2.response
    assert "Which city or region" not in r2.response


@pytest.mark.anyio
async def test_booking_confirmation_states_consultation_fee(agent_fixture):
    """Test: When asking patient to confirm booking, agent must state consultation fee in message and confirmation card."""
    agent, repo, _ = agent_fixture

    # Book with Dr. Sharma on 2026-10-06 at 10:00
    res = await agent.run(
        patient_id="pat_confirm_fee",
        message="I want to book an appointment with Dr. Sharma tomorrow at 10:00"
    )
    assert "confirm and book" in res.response.lower()
    assert "800" in res.response
    assert res.confirmation_card is not None
    assert res.confirmation_card.consultation_fee == 800
    assert "Sharma" in res.confirmation_card.doctor


@pytest.mark.anyio
async def test_slot_inquiry_after_fee_inquiry_checks_slots_for_same_doctor(agent_fixture):
    """Test: When user asks about doctor fee and then asks for available slots for tomorrow,
    agent must retain the doctor and check available slots instead of doing a dead-end doctor search.
    """
    agent, repo, _ = agent_fixture

    # 1. Ask fee for Dr. Mrunal
    r1 = await agent.run(patient_id="pat_seq_1", session_id="sess_seq_1", message="what is consulting fee for dr. mrunal")
    assert "1000" in r1.response

    # 2. Ask for tomorrow's slots
    r2 = await agent.run(patient_id="pat_seq_1", session_id="sess_seq_1", message="Show available doctor appointment slots for tomorrow")
    assert "Available slots" in r2.response
    assert "Mrunal" in r2.response
    assert len(r2.tool_calls) == 1
    assert r2.tool_calls[0]["name"] == "get_available_slots"
    assert "matching that specialty" not in r2.response


@pytest.mark.anyio
async def test_fresh_slots_inquiry_prompts_for_doctor_without_false_negative_error(agent_fixture):
    """Test: On a fresh session with no doctor selected, asking for tomorrow's slots prompts for doctor/specialty
    rather than returning an error saying 'we don't currently have any doctors matching that specialty'.
    """
    agent, repo, _ = agent_fixture

    res = await agent.run(patient_id="pat_fresh_slots", session_id="sess_fresh", message="Show available doctor appointment slots for tomorrow")
    assert "matching that specialty" not in res.response
    assert any(w in res.response.lower() for w in ["which doctor", "specialty", "dermatology", "cardiology"])
    assert len(res.tool_calls) == 0


@pytest.mark.anyio
async def test_confirm_and_book_button_phrase_completes_booking(agent_fixture):
    """Test: Clicking the 'Confirm & Book Appointment' button sends
    'Yes, please confirm and book this appointment' which must complete the booking
    rather than wiping state and asking which doctor they want.
    """
    agent, repo, _ = agent_fixture

    # 1. Propose appointment
    r1 = await agent.run(
        patient_id="pat_btn_click",
        session_id="sess_btn_click",
        message="I want to book Dr. Sharma tomorrow at 09:00"
    )
    assert "confirm and book" in r1.response.lower()
    assert r1.confirmation_card is not None

    # 2. Click confirm button
    r2 = await agent.run(
        patient_id="pat_btn_click",
        session_id="sess_btn_click",
        message="Yes, please confirm and book this appointment"
    )
    assert "successfully booked and confirmed" in r2.response.lower()
    assert len(r2.tool_calls) == 1
    assert r2.tool_calls[0]["name"] == "book_appointment"
    assert "Which specialty or doctor would you like to see" not in r2.response
