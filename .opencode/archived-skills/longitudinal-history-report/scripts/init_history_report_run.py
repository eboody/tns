#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import re
from datetime import datetime, timezone
from pathlib import Path


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = re.sub(r"-+", "-", value).strip("-")
    return value or "case"


def derive_case_id(source_dir: Path) -> str:
    return slugify(source_dir.name)


def write_if_missing(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(content, encoding="utf-8")


def template_text(base: Path, name: str) -> str:
    return (base / "templates" / name).read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Initialize a longitudinal history report workspace")
    parser.add_argument("--source-dir", required=True, help="Absolute or relative path to source directory")
    parser.add_argument("--workspace-root", help="Override workspace root; defaults to <repo>/.opencode-work/history-report")
    parser.add_argument("--case-id", help="Optional case identifier override")
    parser.add_argument("--run-id", help="Optional run identifier override")
    parser.add_argument("--style-exemplar", default="2026-report.md", help="Style exemplar path to record in the brief")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    skill_dir = script_dir.parent
    repo_root = skill_dir.parent.parent.parent
    source_dir = Path(args.source_dir).expanduser().resolve()

    workspace_root = (
        Path(args.workspace_root).expanduser().resolve()
        if args.workspace_root
        else repo_root / ".opencode-work" / "history-report"
    )
    case_id = args.case_id or derive_case_id(source_dir)
    run_id = args.run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    case_dir = workspace_root / case_id
    run_dir = case_dir / "runs" / run_id

    stage_dirs = [
        run_dir / "00-brief",
        run_dir / "01-inventory",
        run_dir / "02-evidence",
        run_dir / "03-derived",
        run_dir / "04-draft",
        run_dir / "05-audit",
        case_dir / "approved",
    ]
    for directory in stage_dirs:
        directory.mkdir(parents=True, exist_ok=True)

    brief = template_text(skill_dir, "report-brief.md")
    brief = brief.replace("<fill>", case_id, 1)
    brief = brief.replace("<absolute path>", str(source_dir))
    brief = brief.replace("<fill>", run_id, 1)
    brief = brief.replace("<path, e.g. 2026-report.md>", args.style_exemplar)
    write_if_missing(run_dir / "00-brief" / "report-brief.md", brief)

    templated_files = {
        run_dir / "01-inventory" / "source-inventory.md": "source-inventory.md",
        run_dir / "01-inventory" / "inclusion-log.md": "inclusion-log.md",
        run_dir / "03-derived" / "academic-summary.md": "academic-summary.md",
        run_dir / "03-derived" / "developmental-timeline.md": "developmental-timeline.md",
        run_dir / "03-derived" / "symptom-matrix.md": "symptom-matrix.md",
        run_dir / "03-derived" / "contradictions-confidence-memo.md": "contradictions-confidence-memo.md",
        run_dir / "03-derived" / "insights.md": "insights.md",
        run_dir / "03-derived" / "section-claim-bank.md": "section-claim-bank.md",
        run_dir / "03-derived" / "style-contract.md": "style-contract.md",
        run_dir / "04-draft" / "final-history-report.factual.md": "final-history-report-factual.md",
        run_dir / "04-draft" / "final-history-report.draft.md": "final-history-report.md",
        run_dir / "04-draft" / "provenance-map.md": "provenance-map.md",
        run_dir / "05-audit" / "self-audit.md": "self-audit.md",
        run_dir / "05-audit" / "sentence-traceability-check.md": "sentence-traceability-check.md",
        run_dir / "05-audit" / "run-summary.md": "run-summary.md",
    }
    for path, template_name in templated_files.items():
        write_if_missing(path, template_text(skill_dir, template_name))

    approved_latest = case_dir / "approved" / "latest.md"
    approved_provenance = case_dir / "approved" / "latest.provenance.md"
    write_if_missing(approved_latest, "<!-- no approved report yet -->\n")
    write_if_missing(approved_provenance, "<!-- no approved provenance map yet -->\n")

    payload = {
        "source_dir": str(source_dir),
        "workspace_root": str(workspace_root),
        "case_id": case_id,
        "run_id": run_id,
        "case_dir": str(case_dir),
        "run_dir": str(run_dir),
    }
    print(json.dumps(payload, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
