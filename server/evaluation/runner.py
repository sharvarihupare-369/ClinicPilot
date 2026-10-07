"""Evaluation Suite Runner.

Executes all defined benchmark scenarios, computes summary statistics,
and generates structured reports and terminal summaries.
"""

import asyncio
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from evaluation.evaluator import ScenarioEvaluator, EvaluationReport
from evaluation.scenarios import SCENARIOS, Scenario
from evaluation.rubric import Rubric


@dataclass
class SuiteReport:
    """Summary report across the full scenario suite."""

    total_scenarios: int
    passed_scenarios: int
    failed_scenarios: int
    average_score: float
    reports: List[EvaluationReport] = field(default_factory=list)
    failure_breakdown: Dict[str, int] = field(default_factory=dict)

    @property
    def passed_all(self) -> bool:
        return self.failed_scenarios == 0


class EvaluationRunner:
    """Orchestrates benchmark evaluation runs."""

    def __init__(self, evaluator: Optional[ScenarioEvaluator] = None):
        self.evaluator = evaluator or ScenarioEvaluator(Rubric())

    async def run_suite(
        self,
        scenarios: Optional[List[Scenario]] = None,
    ) -> SuiteReport:
        """Runs the suite of scenarios and aggregates scores."""
        target_scenarios = scenarios or SCENARIOS
        reports: List[EvaluationReport] = []
        failure_breakdown: Dict[str, int] = {}

        for sc in target_scenarios:
            report = await self.evaluator.evaluate_scenario(sc)
            reports.append(report)

            for ftype in report.score.failure_types:
                failure_breakdown[ftype] = failure_breakdown.get(ftype, 0) + 1

        total = len(reports)
        passed = sum(1 for r in reports if r.passed)
        failed = total - passed
        avg_score = sum(r.score.total_score for r in reports) / total if total else 0.0

        return SuiteReport(
            total_scenarios=total,
            passed_scenarios=passed,
            failed_scenarios=failed,
            average_score=avg_score,
            reports=reports,
            failure_breakdown=failure_breakdown,
        )

    def print_summary(self, suite_report: SuiteReport) -> None:
        """Pretty-prints the benchmark results table."""
        print("\n" + "=" * 80)
        print("          CLINICPILOT BENCHMARK EVALUATION SUMMARY REPORT          ")
        print("=" * 80)
        print(
            f"{'Scenario':<42} | {'Score':<7} | {'Status':<8} | {'Failure Types'}"
        )
        print("-" * 80)

        for rep in suite_report.reports:
            status_str = "PASS" if rep.passed else "FAIL"
            failures_str = ", ".join(rep.score.failure_types) or "None"
            print(
                f"{rep.scenario_name[:40]:<42} | {rep.score.total_score:>3}/100 | {status_str:<8} | {failures_str}"
            )

        print("-" * 80)
        print(
            f"Overall Suite: {suite_report.passed_scenarios}/{suite_report.total_scenarios} Passed "
            f"({(suite_report.passed_scenarios/suite_report.total_scenarios)*100:.1f}%) | "
            f"Average Score: {suite_report.average_score:.1f}/100"
        )
        if suite_report.failure_breakdown:
            print("\nFailure Categories Detected:")
            for ftype, count in suite_report.failure_breakdown.items():
                print(f"  - {ftype}: {count} occurrence(s)")
        print("=" * 80 + "\n")


async def main():
    runner = EvaluationRunner()
    report = await runner.run_suite()
    runner.print_summary(report)


if __name__ == "__main__":
    asyncio.run(main())
