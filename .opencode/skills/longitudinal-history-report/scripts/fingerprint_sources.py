#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a fingerprint manifest for admitted sources")
    parser.add_argument("--output", required=True, help="Path to JSON output manifest")
    parser.add_argument("files", nargs="+", help="Admitted source files")
    args = parser.parse_args()

    records = []
    for raw_path in args.files:
        path = Path(raw_path).expanduser().resolve()
        stat = path.stat()
        records.append(
            {
                "path": str(path),
                "size": stat.st_size,
                "modified_time": stat.st_mtime,
                "sha256": sha256(path),
            }
        )

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(records, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(output_path), "count": len(records)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
