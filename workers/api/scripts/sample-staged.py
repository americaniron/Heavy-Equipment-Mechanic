#!/usr/bin/env python3
"""Print N random rows from the staged costex SQL files.

Used for pre-apply spot-checks. Parses the multi-row VALUES tuples by
ast.literal_eval after a tiny SQL-→Python adjustment (NULL → None).
"""
from __future__ import annotations
import argparse
import ast
import glob
import random
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "data" / ".staged"

# Match a complete (...) tuple, allowing newlines inside quoted strings.
TUPLE_RE = re.compile(
    r"\(\s*(?:'(?:[^']|'')*'|NULL|-?\d+(?:\.\d+)?)\s*"
    r"(?:,\s*(?:'(?:[^']|'')*'|NULL|-?\d+(?:\.\d+)?)\s*){7}\)",
    re.M,
)


def parse_tuple(t: str) -> tuple:
    py = re.sub(r"\bNULL\b", "None", t)
    py = py.replace("''", "<<APOS>>")
    py = py.replace("'", '"').replace("<<APOS>>", "'")
    return ast.literal_eval(py)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("source", choices=["cat", "costex"])
    ap.add_argument("-n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=None)
    args = ap.parse_args()

    files = sorted(glob.glob(str(STAGE / f"parts_{args.source}_*.sql")))
    if not files:
        sys.exit(f"no staged files for source={args.source}")

    rows: list[tuple] = []
    for fp in files:
        with open(fp) as f:
            text = f.read()
        for m in TUPLE_RE.finditer(text):
            try:
                rows.append(parse_tuple(m.group(0)))
            except Exception:
                pass
    rng = random.Random(args.seed)
    sample = rng.sample(rows, min(args.n, len(rows)))
    print(f"# total parsed tuples: {len(rows)}; sample size: {len(sample)}")
    print("# columns: part_number | description | category | make | "
          "model_compat | price_usd | stock | source_file")
    print("-" * 100)
    for r in sample:
        pn, desc, cat, make, mc, price, stock, src = r
        desc_short = (desc or "")[:80]
        cat_short = (cat or "-")[:30]
        mc_short = (mc or "-")[:30] if mc else "-"
        print(
            f"  {pn:<14}  | {desc_short:<80}  | "
            f"cat={cat_short:<30}  make={make:<7}  models={mc_short}"
        )


if __name__ == "__main__":
    main()
