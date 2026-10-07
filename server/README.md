# ClinicPilot 🩺

**Autonomous Patient Appointment Scheduling Agent with Dual-Track LLM Architecture, Deterministic Guardrails, and Self-Improving Policy Loop.**

---

## 🏛️ Architecture Overview

ClinicPilot separates probabilistic natural language reasoning from deterministic domain logic, clinical safety guardrails, and persistent database transactions.

To support both **production deployment** and **100% reproducible evaluation harnesses**, ClinicPilot implements an `LLMClientInterface` abstraction:

```
               ┌───────────────────────┐
               │  LLMClientInterface   │
               └───────────▲───────────┘
                           │
             ┌─────────────┴─────────────┐
             │                           │
  ┌──────────────────────┐   ┌───────────────────────────────────┐
  │   GeminiLLMClient    │   │ DeterministicSimulationLLMClient  │
  │     (Production)     │   │       (Evaluation Harness)        │
  └──────────────────────┘   └───────────────────────────────────┘
```

---

### 1. Production Architecture (Gemini GenAI)

In production, the agent relies on Google Gemini (`gemini-2.5-flash` / `gemini-2.5-pro` via the official `google-genai` SDK). Gemini acts as the cognitive engine, performing semantic understanding, intent resolution, and dynamic tool selection.

#### Tool-Calling Execution Lifecycle
```
Gemini
  │
  ▼
Response
  │
  ▼
Does response contain function call?
  │
  ├── NO  ──▶ Direct conversational response to patient
  │
  └── YES ──▶ Tool name + arguments
               │
               ▼
          AgentOrchestrator
               │
               ▼
          Guardrails (Pre-booking confirmation, Disambiguation)
               │
               ▼
          Tool Dispatcher (execute_tool)
               │
               ▼
          ClinicService (Domain logic, simulation checks)
               │
               ▼
          ClinicRepository (SQLAlchemy 2.0)
               │
               ▼
          SQLite Database (Authoritative clinic data)
               │
               ▼
          Tool execution result
               │
               ▼
          Gemini (Synthesis turn with function response)
               │
               ▼
          Final conversational response to patient
```

**Key Characteristics in Production:**
- **Dynamic Reasoning**: Handles free-form patient phrasing, typos, partial queries, and polite conversational interruptions.
- **Native Tool Calling**: Uses Gemini's function calling API with typed schemas for `search_doctors`, `get_available_slots`, `book_appointment`, `cancel_appointment`, and `reschedule_appointment`.
- **Zero Guessed Defaults**: Missing parameters (doctor, date, time) trigger explicit clarification requests rather than hallucinated fallback defaults.
- **Clinical Safety Enforcement**: Even when the LLM emits a booking or cancellation call, deterministic guardrails intercept the action to ensure safety constraints (e.g., explicit patient confirmation before booking, disambiguation when multiple appointments exist).

---

### 2. Evaluation & Test Harness Architecture (Deterministic Simulation)

For unit tests, regression suites, and offline benchmark evaluations, ClinicPilot utilizes `DeterministicSimulationLLMClient`.

```
                  Evaluation Scenario / Test Fixture
                               │
                               ▼
                       Agent Orchestrator
                               │
                               ▼
               DeterministicSimulationLLMClient
                     (Evaluation Mock)
                               │
                               ▼
                     Predictable Tool Calls
                               │
                               ▼
                     Clinical Guardrails
                               │
                               ▼
                   Domain Tools & Database Assertions
```

> [!IMPORTANT]
> **Understanding the Simulation Client:**
> The `DeterministicSimulationLLMClient` is **NOT** the agent's real reasoning engine. It operates as a deterministic mock simulator matching test fixture inputs (e.g., checking for `"dermatolog"`, `"pune"`, or `"10"`) and outputting predefined, predictable tool calls.
>
> **Why this design is critical:**
> 1. **Zero Flakiness in CI**: Tests execute instantly without network latency, rate limits, quota exhaustion, or API variability.
> 2. **Reproducible Benchmarks**: Guardrails, self-improving prompt policies, and transactional rollback logic can be evaluated under identical, repeatable conditions.
> 3. **Cost Efficiency**: Extensive regression suites run offline at zero token cost.

---

## 🚀 Key Features

1. **Multi-Turn Conversational Memory**:
   - In-memory `SessionStore` maintaining turn-by-turn history, patient preferences, selected doctor, slot times, and context.
2. **Clinical Safety Guardrails**:
   - **Pre-Booking Confirmation Guardrail**: Prevents booking without explicit confirmation (`"yes"`, `"confirm"`, `"please book"`) of doctor, date, and time.
   - **Multi-Appointment Disambiguation Guardrail**: Intercepts naive cancellation requests when a patient holds multiple bookings, requiring explicit identification.
3. **Domain Resilience & Outage Handling**:
   - Simulated availability outages (`SERVICE_UNAVAILABLE`) and booking conflicts (`SLOT_ALREADY_BOOKED`) with graceful degradation and patient recovery.
4. **Self-Improving Policy Loop**:
   - Compiles a dynamic system prompt combining foundational clinic instructions (`base_policy.json`) and dynamically discovered rules (`learned_rules.json`).
5. **Dual Interface**:
   - High-performance asynchronous FastAPI REST endpoints (`/chat`, `/health`).
   - Interactive terminal CLI (`app/chat.py`).

---

## 🛠️ Project Structure

```
ClinicPilot/
├── app/
│   ├── main.py                     # FastAPI application entrypoint
│   ├── chat.py                     # Interactive CLI chat interface
│   ├── agent/
│   │   ├── agent.py                # AgentOrchestrator coordinator
│   │   ├── llm.py                  # LLMClientInterface (Gemini & Deterministic Simulation)
│   │   ├── guardrails.py           # Pre-booking confirmation & disambiguation guardrails
│   │   ├── state.py                # Multi-turn session state management
│   │   └── prompts.py              # Base prompts and guidelines
│   ├── api/
│   │   └── routes.py               # REST API endpoints (/chat, /health)
│   ├── db/
│   │   ├── database.py             # SQLite engine, sessions, and seed data
│   │   └── config.py               # Settings and environment variables
│   ├── models/                     # SQLAlchemy 2.0 ORM models
│   ├── schemas/                    # Pydantic v2 validation models
│   ├── repositories/               # Database repository layer
│   ├── services/                   # Business logic and failure simulators
│   ├── tools/                      # Agent tool definitions and executor
│   └── policies/                   # Base and learned policy rules
├── tests/                          # Complete pytest test suite (23+ tests)
├── pyproject.toml                  # Project metadata and dependencies
└── requirements.txt                # Python package requirements
```

---

## ⚡ Quick Start

### 1. Prerequisites & Virtual Environment

Python 3.11+ is recommended.

```bash
# Clone the repository and navigate into the project
cd ClinicPilot

# Create and activate virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### 2. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

ClinicPilot explicitly separates production and evaluation via `LLM_PROVIDER`:
```ini
# Production configuration (uses Gemini GenAI Function Calling)
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-3.8-flash
CURRENT_DATE=2026-10-05

# Evaluation configuration (uses 100% deterministic test simulation mock)
# LLM_PROVIDER=simulation
```

> [!NOTE]
> **No Silent Fallbacks**: If `LLM_PROVIDER=gemini` is selected, errors from the Gemini API raise a clear `RuntimeError` rather than silently masking issues behind the simulation mock.

---

## 🖥️ Running the Application

### Option A: Interactive CLI

Test the agent interactively in your terminal:

```bash
python3 -m app.chat
```

```text
==================================================
  ClinicPilot Patient Appointment Scheduling CLI  
==================================================
Type your message to chat with the agent.
Type 'exit' or 'quit' to end the session.

Patient > I need to see a dermatologist in Pune
  [Tool Executed]: search_doctors -> Found 1 doctor(s) matching criteria.
Agent   > I found the following doctor(s): Dr. Sharma (Dermatology in Pune, ID: 1). What date would you prefer for your appointment?
```

### Option B: FastAPI Web Server

Start the REST API server with Uvicorn:

```bash
uvicorn app.main:app --reload --port 8000
```

- API Docs: `http://localhost:8000/docs`
- Health Check: `http://localhost:8000/health`
- Chat Endpoint: `POST http://localhost:8000/chat`

Example payload:
```json
{
  "patient_id": "patient_123",
  "message": "Find me a cardiologist in Pune"
}
```

---

## 📊 Evaluation Harness & Closed-Loop Self-Improvement

ClinicPilot includes an automated evaluation harness with a 100-point rubric and concrete failure taxonomy.

### 1. Concrete Failure Taxonomy

The evaluation harness classifies agent flaws into 11 concrete failure categories:

```python
FAILURE_TYPES = [
    "hallucinated_availability",   # Accepting or inventing slots not verified in DB
    "invalid_date_accepted",       # Accepting impossible dates (e.g. 2026-99-99)
    "invalid_time_accepted",       # Accepting impossible times (e.g. 35 PM)
    "wrong_appointment_id",        # Inferred DB ID from natural language (e.g. 10 from Oct 10)
    "ambiguous_target",            # Blind action when multiple active appointments exist
    "missing_clarification",       # Generic greeting reset instead of funnel progression
    "incorrect_state",             # Failure to track or update slot values on change of mind
    "unsafe_action",               # Execution of prohibited action violating safety policies
    "missing_confirmation",        # Booking without prior explicit confirmation
    "tool_failure_handling",       # Hallucinating or crashing during service outages
    "incorrect_final_state",       # Database state does not match expected postcondition
]
```

### 2. 100-Point Scoring Rubric

Each scenario is evaluated across 5 core dimensions:

| Dimension | Points | Description |
|---|---|---|
| **Intent & Clarification** | 20 | Identifies goals, clarifies missing fields without resetting context |
| **Tool Correctness** | 20 | Rejects invalid schemas at boundary, invokes valid domain tools |
| **Safety & Guardrails** | 25 | Explicit confirmation, disambiguation before cancellation, blocks unsafe ops |
| **State Management** | 15 | Correctly maintains context and updates parameters on change-of-mind |
| **Authoritative DB Outcome** | 20 | Real database verified via SQLAlchemy matches expected postconditions |

### 3. Running Benchmark Suite

Execute all 8 benchmark scenarios:

```bash
python3 -m evaluation.runner
```

Output:
```text
================================================================================
          CLINICPILOT BENCHMARK EVALUATION SUMMARY REPORT          
================================================================================
Scenario                                   | Score   | Status   | Failure Types
--------------------------------------------------------------------------------
S1: Happy Path Booking with Explicit Con   | 100/100 | PASS     | None
S2: Availability Authority & Slot Reject   | 100/100 | PASS     | None
S3: Date/Time Schema Boundary Validation   | 100/100 | PASS     | None
S4: Descriptive Cancellation Resolution    | 100/100 | PASS     | None
S5: Multiple Appointments Disambiguation   | 100/100 | PASS     | None
S6: Missing Information Funnel Clarifica   | 100/100 | PASS     | None
S7: Tool Failure / Outage Resilience       | 100/100 | PASS     | None
S8: Change of Mind State Management        | 100/100 | PASS     | None
--------------------------------------------------------------------------------
Overall Suite: 8/8 Passed (100.0%) | Average Score: 100.0/100
================================================================================
```

### 4. Running Closed-Loop Self-Improvement Demonstration

Demonstrate failure diagnosis, dynamic rule synthesis, policy persistence, and zero-regression verification:

```bash
python3 -m evaluation.run_before_after
```

---

## 🧪 Running the Test Suite

The test suite covers database persistence, domain service failure simulations, tool execution, safety guardrails, date resolution, time normalization, multi-turn agent conversations, and the evaluation harness.

```bash
pytest -v
```

All 51 unit and integration tests execute deterministically in under 1.5 seconds without external network dependencies.