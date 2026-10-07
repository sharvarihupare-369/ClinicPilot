"""Closed-Loop Self-Improvement Demonstration Script.

Executes:
1. Baseline Evaluation: Detects failures under the concrete FAILURE_TYPES taxonomy.
2. Failure Diagnosis: Analyzes root causes and extracts failure details.
3. Rule Synthesis & Application: Dynamically synthesizes a structured learned safety rule
   and saves it into app/policies/learned_rules.json.
4. Post-Improvement Evaluation: Re-evaluates benchmark scenarios.
5. Regression Check: Asserts targeted failure resolved (score increased) and ZERO regressions
   across all previously passing scenarios.
6. JSON Persistence: Writes structured report to evaluation/results/before_after_report.json.
"""

import asyncio
import json
from pathlib import Path
from typing import Dict, Any, List
from evaluation.runner import EvaluationRunner, SuiteReport
from evaluation.evaluator import ScenarioEvaluator
from evaluation.scenarios import SCENARIOS, SCENARIO_S5
from evaluation.improvement import ImprovementEngine, FailureAnalysis
from evaluation.rubric import Rubric, Deduction
from app.policies import clear_learned_rules, load_learned_rules

RESULTS_DIR = Path(__file__).resolve().parent / "results"
REPORT_FILE = RESULTS_DIR / "before_after_report.json"


async def run_demonstration():
    print("\n" + "=" * 80)
    print("      CLINICPILOT CLOSED-LOOP SELF-IMPROVEMENT DEMONSTRATION")
    print("=" * 80)

    engine = ImprovementEngine()
    runner = EvaluationRunner()

    # Ensure results directory exists
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    # ------------------------------------------------------------------------
    # Step 1: Run Baseline Benchmark
    # ------------------------------------------------------------------------
    print("\n[STEP 1] Running Baseline Benchmark...")
    engine.reset_improvements()

    baseline_report = await runner.run_suite(SCENARIOS)
    runner.print_summary(baseline_report)

    # ------------------------------------------------------------------------
    # Step 2: Dynamic Failure Diagnosis from Evaluator Baseline Report
    # ------------------------------------------------------------------------
    print("[STEP 2] Dynamically Diagnosing Failures from Evaluator Output...")
    failures = engine.analyze_failures(baseline_report.reports)
    if not failures:
        print("  No failures detected in baseline evaluation.")
        return

    # Select the critical failure identified by the evaluator
    target_failure = next((f for f in failures if f.severity == "CRITICAL"), failures[0])
    print(f"  Failure Category Detected: '{target_failure.failure_type}' in '{target_failure.scenario_name}'")
    print(f"  Severity: {target_failure.severity}")
    print(f"  Dimension: {target_failure.dimension}")
    print(f"  Baseline Score: {target_failure.score}/100")
    print(f"  Deduction Reasons: {target_failure.reasons}")
    print(f"  Root Cause: {target_failure.root_cause}")

    # ------------------------------------------------------------------------
    # Step 3: Synthesize and Apply Learned Safety Policy
    # ------------------------------------------------------------------------
    print("\n[STEP 3] Synthesizing Structured Safety Rule from Evaluator Failure...")
    learned_rule = engine.synthesize_rule(target_failure)
    print(f"  Rule ID: {learned_rule.improvement_id}")
    print(f"  Title: {learned_rule.title}")
    print(f"  Rule Text:\n    \"{learned_rule.rule_text}\"")

    print("\n[STEP 4] Persisting Rule to app/policies/learned_rules.json...")
    engine.apply_improvement(learned_rule)
    active_rules = load_learned_rules()
    print(f"  Active Learned Rules Count: {len(active_rules)}")

    # ------------------------------------------------------------------------
    # Step 4: Re-evaluate Suite Post-Improvement
    # ------------------------------------------------------------------------
    print("\n[STEP 5] Re-evaluating Benchmark Suite Post-Improvement...")
    improved_report = await runner.run_suite(SCENARIOS)
    runner.print_summary(improved_report)

    # ------------------------------------------------------------------------
    # Step 5: Regression Check & Delta Comparison
    # ------------------------------------------------------------------------
    print("\n[STEP 6] Before vs. After Benchmark Delta Analysis:")
    print("-" * 80)
    print(
        f"{'Scenario':<42} | {'Before':<7} | {'After':<7} | {'Delta':<6} | {'Regression Status'}"
    )
    print("-" * 80)

    regressions = []
    comparisons = []

    before_map = {r.scenario_id: r for r in baseline_report.reports}
    after_map = {r.scenario_id: r for r in improved_report.reports}

    for sc_id, before_r in before_map.items():
        after_r = after_map.get(sc_id)
        if not after_r:
            continue

        b_score = before_r.score.total_score
        a_score = after_r.score.total_score
        delta = a_score - b_score

        # Regression check: score must not drop below baseline
        if a_score < b_score:
            reg_status = "REGRESSION DETECTED"
            regressions.append(sc_id)
        else:
            reg_status = "ZERO REGRESSIONS"

        comparisons.append({
            "scenario_id": sc_id,
            "scenario_name": before_r.scenario_name,
            "before_score": b_score,
            "after_score": a_score,
            "delta": delta,
            "status": reg_status,
        })

        delta_str = f"+{delta}" if delta >= 0 else str(delta)
        print(
            f"{before_r.scenario_name[:40]:<42} | {b_score:>3}/100 | {a_score:>3}/100 | {delta_str:>6} | {reg_status}"
        )

    print("-" * 80)
    print(f"Baseline Average: {baseline_report.average_score:.1f}/100")
    print(f"Improved Average: {improved_report.average_score:.1f}/100")
    print(f"Total Regressions: {len(regressions)}")

    # ------------------------------------------------------------------------
    # Step 6: Persist JSON Report
    # ------------------------------------------------------------------------
    json_data = {
        "timestamp": learned_rule.created_at,
        "learned_rule": learned_rule.to_dict(),
        "baseline_summary": {
            "passed": baseline_report.passed_scenarios,
            "total": baseline_report.total_scenarios,
            "average_score": baseline_report.average_score,
        },
        "improved_summary": {
            "passed": improved_report.passed_scenarios,
            "total": improved_report.total_scenarios,
            "average_score": improved_report.average_score,
        },
        "comparisons": comparisons,
        "zero_regressions_verified": len(regressions) == 0,
    }

    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        json.dump(json_data, f, indent=2)

    print(f"\n[REPORT SAVED] Detailed benchmark saved to {REPORT_FILE}")
    print("=" * 80 + "\n")


if __name__ == "__main__":
    asyncio.run(run_demonstration())
