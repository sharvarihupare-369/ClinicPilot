"""Evaluation REST API — benchmark results, before/after delta, and live run trigger."""

import json
import asyncio
from pathlib import Path
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/evaluation", tags=["evaluation"])

RESULTS_DIR = Path(__file__).parent.parent.parent / "evaluation" / "results"
BEFORE_AFTER_PATH = RESULTS_DIR / "before_after_report.json"

# ── Response models ───────────────────────────────────────────────────────────

class ScenarioScore(BaseModel):
    scenario_id: str
    scenario_name: str
    score: int
    max_score: int = 100
    passed: bool
    deductions: List[Dict[str, Any]] = []


class EvaluationSummaryResponse(BaseModel):
    """Aggregated benchmark results from the latest evaluation run."""
    total_scenarios: int
    passed: int
    failed: int
    average_score: float
    pass_rate: float
    scenarios: List[ScenarioScore]
    run_timestamp: Optional[str] = None


class ComparisonEntry(BaseModel):
    scenario_id: str
    scenario_name: str
    before_score: int
    after_score: int
    delta: int
    status: str


class LearnedRule(BaseModel):
    improvement_id: str
    title: str
    rule_text: str
    target_failure_type: str
    target_scenario: str
    created_at: str


class BeforeAfterResponse(BaseModel):
    """Complete before/after self-improvement report."""
    timestamp: str
    learned_rule: Optional[LearnedRule] = None
    baseline_summary: Dict[str, Any]
    improved_summary: Dict[str, Any]
    comparisons: List[ComparisonEntry]
    zero_regressions_verified: bool


class EvaluationRunResponse(BaseModel):
    status: str
    message: str
    report_path: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/summary", response_model=EvaluationSummaryResponse)
def get_evaluation_summary():
    """Return the latest evaluation benchmark results from the stored report."""
    if not BEFORE_AFTER_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="No evaluation results found. Run POST /api/evaluation/run first."
        )

    with open(BEFORE_AFTER_PATH) as f:
        report = json.load(f)

    comparisons = report.get("comparisons", [])
    summary = report.get("improved_summary", report.get("baseline_summary", {}))
    total = summary.get("total", len(comparisons))
    passed = summary.get("passed", 0)

    scenarios = []
    for comp in comparisons:
        score = comp.get("after_score", comp.get("before_score", 0))
        scenarios.append(ScenarioScore(
            scenario_id=comp["scenario_id"],
            scenario_name=comp["scenario_name"],
            score=score,
            passed=score >= 85,
        ))

    avg_score = summary.get("average_score", 0.0)
    return EvaluationSummaryResponse(
        total_scenarios=total,
        passed=passed,
        failed=total - passed,
        average_score=avg_score,
        pass_rate=round(passed / total * 100, 1) if total else 0.0,
        scenarios=scenarios,
        run_timestamp=report.get("timestamp"),
    )


@router.get("/before-after", response_model=BeforeAfterResponse)
def get_before_after():
    """Return the full before/after self-improvement delta and learned rule."""
    if not BEFORE_AFTER_PATH.exists():
        raise HTTPException(
            status_code=404,
            detail="No before/after report found. Run python -m evaluation.run_before_after first."
        )

    with open(BEFORE_AFTER_PATH) as f:
        report = json.load(f)

    rule_data = report.get("learned_rule")
    learned_rule = None
    if rule_data:
        learned_rule = LearnedRule(
            improvement_id=rule_data.get("improvement_id", ""),
            title=rule_data.get("title", ""),
            rule_text=rule_data.get("rule_text", ""),
            target_failure_type=rule_data.get("target_failure_type", ""),
            target_scenario=rule_data.get("target_scenario", ""),
            created_at=rule_data.get("created_at", ""),
        )

    comparisons = [
        ComparisonEntry(
            scenario_id=c["scenario_id"],
            scenario_name=c["scenario_name"],
            before_score=c["before_score"],
            after_score=c["after_score"],
            delta=c["delta"],
            status=c["status"],
        )
        for c in report.get("comparisons", [])
    ]

    return BeforeAfterResponse(
        timestamp=report.get("timestamp", ""),
        learned_rule=learned_rule,
        baseline_summary=report.get("baseline_summary", {}),
        improved_summary=report.get("improved_summary", {}),
        comparisons=comparisons,
        zero_regressions_verified=report.get("zero_regressions_verified", False),
    )


_evaluation_running = False


@router.post("/run", response_model=EvaluationRunResponse)
async def run_evaluation(background_tasks: BackgroundTasks):
    """Trigger a live evaluation run. Returns immediately; run executes in background."""
    global _evaluation_running
    if _evaluation_running:
        return EvaluationRunResponse(
            status="already_running",
            message="An evaluation run is already in progress. Please wait.",
        )

    def _execute_run():
        global _evaluation_running
        _evaluation_running = True
        try:
            import subprocess, sys
            subprocess.run(
                [sys.executable, "-m", "evaluation.run_before_after"],
                cwd=RESULTS_DIR.parent.parent,
                capture_output=True,
                timeout=300,
            )
        finally:
            _evaluation_running = False

    background_tasks.add_task(_execute_run)
    return EvaluationRunResponse(
        status="started",
        message="Evaluation run started in background. Poll GET /api/evaluation/before-after for updated results.",
        report_path=str(BEFORE_AFTER_PATH),
    )


@router.get("/status", response_model=dict)
def evaluation_status():
    """Check whether an evaluation run is currently in progress."""
    return {"running": _evaluation_running}
