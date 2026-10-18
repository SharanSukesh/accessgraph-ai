#!/usr/bin/env python3
"""Fail CI only on mypy errors that are not in the saved baseline.

The baseline (mypy-baseline.txt) is the list of errors mypy reported when it
was saved, one per line as "path: message  [code]". Line numbers are left out
so that editing a file doesn't turn its old errors into new ones; an error
counts as new when its file has more of that exact message than the baseline.

    python scripts/mypy_baseline.py            # check (what CI runs)
    python scripts/mypy_baseline.py --update   # re-save after fixing errors

Run from apps/backend. Fixed errors never fail the check; re-save the
baseline when you fix some, so they can't come back unnoticed.
"""
from __future__ import annotations

import argparse
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path

BASELINE = Path(__file__).resolve().parent.parent / "mypy-baseline.txt"
MYPY_ARGS = ["app", "--ignore-missing-imports"]

# "app/x.py:12: error: Message  [code]" (mypy's default output format).
ERROR_RE = re.compile(r"^(?P<path>[^:]+):(?P<line>\d+): error: (?P<rest>.*)$")
# Messages that mention another line ("defined on line 40") would shift too.
LINE_REF_RE = re.compile(r"\bline \d+\b")


def run_mypy() -> tuple[int, str]:
    proc = subprocess.run(
        [sys.executable, "-m", "mypy", *MYPY_ARGS],
        capture_output=True,
        text=True,
    )
    return proc.returncode, proc.stdout + proc.stderr


def parse(output: str) -> list[tuple[str, str]]:
    """(key, original line) for every error line in mypy's output."""
    errors = []
    for line in output.splitlines():
        m = ERROR_RE.match(line)
        if m:
            key = f"{m['path']}: {LINE_REF_RE.sub('line N', m['rest'])}"
            errors.append((key, line))
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--update", action="store_true", help="save the current errors as the baseline")
    args = parser.parse_args()

    code, output = run_mypy()
    # mypy exits 0 (clean) or 1 (errors found); anything else is a crash or a
    # usage error, which must fail the check rather than read as "no errors".
    if code not in (0, 1):
        print(output)
        print(f"mypy exited with {code}", file=sys.stderr)
        return code

    errors = parse(output)
    current = Counter(key for key, _ in errors)

    if args.update:
        BASELINE.write_text("".join(f"{k}\n" for k in sorted(current.elements())))
        print(f"Saved {sum(current.values())} mypy errors to {BASELINE.name}")
        return 0

    baseline = Counter(BASELINE.read_text().splitlines()) if BASELINE.exists() else Counter()
    new = current - baseline
    fixed = baseline - current

    print(f"mypy: {sum(current.values())} errors, {sum(baseline.values())} in the baseline")
    if fixed:
        print(f"{sum(fixed.values())} baseline errors are gone; run with --update to re-save the baseline")
    if new:
        print(f"\n{sum(new.values())} new mypy errors (not in {BASELINE.name}):")
        # A file with N baseline copies of a message and N+1 now lists all N+1
        # lines, since there's no telling which one is new.
        for key, line in errors:
            if key in new:
                print(f"  {line}")
        return 1
    print("No new mypy errors.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
