"""Interactive CLI conversation interface for ClinicPilot."""

import asyncio
import sys
from app.agent import AgentOrchestrator
from app.db import init_db, seed_db
from app.repositories import ClinicRepository


async def main():
    from app.db.config import get_current_datetime
    ref_date, ref_time = get_current_datetime()
    print("==================================================")
    print("  ClinicPilot Patient Appointment Scheduling CLI  ")
    print(f"  Reference Date: {ref_date} | Time: {ref_time}")
    print("==================================================")
    print("Type your message to chat with the agent.")
    print("Type 'exit' or 'quit' to end the session.\n")

    # Ensure DB is ready and seeded
    init_db()
    seed_db()

    agent = AgentOrchestrator(current_date=ref_date, current_time=ref_time)
    patient_id = "cli_patient_1"
    session_id = "cli_session_1"

    while True:
        try:
            user_input = input("Patient > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ["exit", "quit"]:
                print("\nGoodbye! Have a healthy day.")
                break

            response = await agent.run(
                patient_id=patient_id,
                message=user_input,
                session_id=session_id,
            )

            if response.tool_calls:
                for tc in response.tool_calls:
                    print(f"  [Tool Executed]: {tc.get('name')} -> {tc.get('result', {}).get('message', 'done')}")

            print(f"Agent   > {response.response}\n")

        except (KeyboardInterrupt, EOFError):
            print("\nSession ended.")
            break


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        print("\nSession ended cleanly. Goodbye!")

