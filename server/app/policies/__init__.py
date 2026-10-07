"""Policy loading and system prompt compilation."""

import json
from pathlib import Path
from typing import List, Dict, Any

POLICY_DIR = Path(__file__).resolve().parent
BASE_POLICY_FILE = POLICY_DIR / "base_policy.json"
LEARNED_RULES_FILE = POLICY_DIR / "learned_rules.json"


def load_base_rules() -> List[str]:
    """Loads baseline static policies."""
    if not BASE_POLICY_FILE.exists():
        return []
    with open(BASE_POLICY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        return data.get("base_rules", [])


def load_learned_rules() -> List[Dict[str, Any]]:
    """Loads structured rules discovered by the improvement loop."""
    if not LEARNED_RULES_FILE.exists():
        return []
    with open(LEARNED_RULES_FILE, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except json.JSONDecodeError:
            return []


def save_learned_rule(rule: Dict[str, Any]) -> None:
    """Appends a new structured rule to the learned rules registry."""
    rules = load_learned_rules()
    # Avoid duplicate rules
    if not any(r.get("improvement_id") == rule.get("improvement_id") for r in rules):
        rules.append(rule)
        with open(LEARNED_RULES_FILE, "w", encoding="utf-8") as f:
            json.dump(rules, f, indent=2)


def clear_learned_rules() -> None:
    """Resets learned rules back to clean baseline."""
    with open(LEARNED_RULES_FILE, "w", encoding="utf-8") as f:
        json.dump([], f, indent=2)


def compile_system_prompt(current_date: str = "2026-10-05") -> str:
    """Dynamically compiles prompt from BASE RULES + LEARNED RULES + TEMPORAL CONTEXT."""
    base_rules = load_base_rules()
    learned_rules = load_learned_rules()

    prompt_lines = [
        "### CLINICPILOT SCHEDULING AGENT INSTRUCTIONS",
        "",
        f"**TEMPORAL CONTEXT**: Today's reference date is {current_date}.",
        "Resolve relative dates (e.g. 'today', 'tomorrow') relative to this reference date.",
        "Never guess or invent missing booking parameters (doctor, date, time).",
        "",
        "#### CORE POLICIES:",
    ]
    for i, rule in enumerate(base_rules, 1):
        prompt_lines.append(f"{i}. {rule}")

    if learned_rules:
        prompt_lines.append("")
        prompt_lines.append("#### LEARNED SAFETY POLICIES (FROM PREVIOUS RUN EVALUATIONS):")
        for i, rule in enumerate(learned_rules, 1):
            rule_text = rule.get("rule_text", "")
            title = rule.get("title", f"Rule {i}")
            prompt_lines.append(f"{i}. [{title}]: {rule_text}")

    return "\n".join(prompt_lines)
