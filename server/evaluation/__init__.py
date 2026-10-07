"""Evaluation framework for ClinicPilot scheduling agent.

Provides deterministic benchmarking, failure taxonomy classification,
rubric scoring, database integrity auditing, and closed-loop self-improvement.
"""

from evaluation.taxonomy import FAILURE_TYPES, FailureDetail, classify_failure
from evaluation.rubric import Rubric, RubricScore, DimensionScore
from evaluation.scenarios import SCENARIOS, Scenario
from evaluation.evaluator import ScenarioEvaluator, EvaluationTrace, EvaluationReport
from evaluation.improvement import ImprovementEngine, LearnedRule


def __getattr__(name: str):
    if name == "EvaluationRunner":
        from evaluation.runner import EvaluationRunner
        return EvaluationRunner
    raise AttributeError(f"module '{__name__}' has no attribute '{name}'")


__all__ = [
    "FAILURE_TYPES",
    "FailureDetail",
    "classify_failure",
    "Rubric",
    "RubricScore",
    "DimensionScore",
    "SCENARIOS",
    "Scenario",
    "ScenarioEvaluator",
    "EvaluationTrace",
    "EvaluationReport",
    "ImprovementEngine",
    "LearnedRule",
    "EvaluationRunner",
]
