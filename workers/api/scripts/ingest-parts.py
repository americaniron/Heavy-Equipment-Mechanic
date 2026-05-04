#!/usr/bin/env python3
"""Parts ingest for fixmyiron.

Reads:
  data/cat_parts_inventory.xls    — single 'Inventory' sheet, columnar
  data/costex_2026.pdf            — 580-page catalog, heterogeneous tables

Writes batched SQL files of multi-row INSERT OR IGNORE statements to
  data/.staged/parts_<source>_<batch>.sql
and (optionally, with --apply) submits each via:
  wrangler d1 execute fixmyiron-staging --remote --file <path>

Rerunnable: parts UNIQUE(part_number, source_file) plus INSERT OR IGNORE.

Extraction policy for the PDF (matters for row count):
  A column is treated as a "part-number column" if ANY of:
    H1. Header CONTAINS "Part No." / "Parts No." / "Part Number" / "Parts
        Number" anywhere in the string. Catches "Pin Part No.",
        "Cylinder Gr. Part No.", and the plural-typo "Parts No.".
    H1b. Header ends with " No." / " Number" preceded by at least one
         word, AND the header is not in the non-PN blacklist. Catches
         "Piston No.", "Cylinder No.", "Pump No." (component-named
         columns where "Part" is implicit).
    H2. Header is exactly "Part" or "Parts".
    H3. Header matches the SKU-pack cross-reference pattern
        /^(SINGLE|\d+ PACK|J\d+(\s?/\s?J\d+)?)$/i (V-belts, J-series
        teeth, etc.) — every non-empty cell IS a PN for that variant.
    H4. Body autodetect — header is NOT in the non-PN blacklist
        {Application(s), Engine, Engine Model, Equipment, Equipment
         Model, Family, Machine, Model, Description, Capacity, Width,
         Length, Height, Size, Type, Prefix, Notes} AND >=50% of
         non-empty body cells match the PN cell regex AND the column
         has >=3 non-empty cells. Catches "Cone | Cup",
         "Cartridge | Turbo GP", "Pump | Shaft | Impeller".

  Each accepted cell is emitted as ONE parts row. The column header
  becomes a variant_label suffix on the description so multi-PN rows
  stay distinguishable in search results
  (e.g. "Engine overhaul kit — Pin"). part_number is the PN alone, so
  FTS search and joins work the same way regardless of variant.

If the PDF row count drifts >2% from ~17,740, the script aborts before
any DB write.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator

import pdfplumber  # type: ignore
import xlrd  # type: ignore

ROOT = Path(__file__).resolve().parents[3]
DATA = ROOT / "data"
STAGE = DATA / ".staged"
WRANGLER_CFG = ROOT / "workers" / "api" / "wrangler.toml"
DB_NAME = "fixmyiron-staging"

ROWS_PER_FILE = 1000
ROWS_PER_INSERT = 50  # multi-row VALUES per INSERT statement

# XLS is a real spreadsheet — count is precise; tight tolerance.
EXPECTED_XLS_ROWS = 26_000
XLS_TOLERANCE = 0.02
# PDF row count depends on extraction policy; the catalog is heterogeneous.
# Sanity range based on the source's structure:
#   <14k → policy is too narrow, missing real columns
#   >32k → policy is too broad, picking up equipment classifiers as parts
PDF_MIN_ROWS = 14_000
PDF_MAX_ROWS = 32_000

# Caterpillar part-number heuristic for *cells already in PN columns*
# (or for body-autodetect). Used for sanity, NOT for free-text scraping.
PN_CELL_RE = re.compile(r"^[0-9][0-9A-Za-z]{3,9}$|^[0-9A-Za-z]{1,3}\d{3,8}$")

# H1: "Part No." / "Part Number" / "Parts No." / "Parts Number" anywhere
#     in the header (catches prefixed "Pin Part No." etc.).
PN_HEADER_PHRASE_RE = re.compile(r"\bparts?\s*(?:no\.?|number)\b", re.I)
# H1b: header ENDS with " No." / " Number" preceded by at least one
#     word — "Piston No.", "Pump No.", "Cylinder No.". The "Part" is
#     implicit. Guarded by NON_PN_HEADER_RE in the caller so things
#     like "Application No." can't sneak in.
PN_HEADER_NO_SUFFIX_RE = re.compile(r"^\S.*\s(?:no\.?|number)\s*$", re.I)
# H2: bare "Part" / "Parts".
PN_HEADER_BARE_RE = re.compile(r"^\s*parts?\s*$", re.I)
# H3: cross-reference pack columns (V-belts, J-series).
PACK_HEADER_RE = re.compile(
    r"^\s*(SINGLE|\d+\s*PACK|J\d+(\s*/\s*J\d+)?)\s*$", re.I
)
# H4 + H1b confounder blacklist — these headers are descriptive (equipment
# classifiers, dimensions), not PN columns, even when cells look PN-shaped.
# Extended (2026-05-04) to also drop bare 'engine'/'equipment'/'machine'/
# 'family' and the plural 'applications'.
NON_PN_HEADER_RE = re.compile(
    r"\b("
    r"applications?|engine(?:\s*model)?|equipment(?:\s*model)?|"
    r"family|machine|model|description|capacity|width|length|height|"
    r"size|type|prefix|notes?"
    r")\b",
    re.I,
)
# Body-autodetect thresholds.
AUTODETECT_MIN_NON_EMPTY = 3
AUTODETECT_MIN_PN_RATIO = 0.50


@dataclass
class PartRow:
    part_number: str
    description: str
    category: str | None
    make: str
    model_compat: list[str] | None
    price_usd: float | None
    stock_status: str | None
    source_file: str

    def values(self) -> tuple:
        return (
            self.part_number,
            self.description,
            self.category,
            self.make,
            json.dumps(self.model_compat) if self.model_compat else None,
            self.price_usd,
            self.stock_status,
            self.source_file,
        )


def sql_str(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def write_batches(
    out_dir: Path, source: str, rows: Iterable[PartRow]
) -> tuple[int, int]:
    """Write multi-row INSERT files. Returns (file_count, row_count)."""
    out_dir.mkdir(parents=True, exist_ok=True)
    file_count = 0
    row_count = 0
    buf: list[PartRow] = []
    cols = (
        "part_number, description, category, make, "
        "model_compat_json, price_usd, stock_status, source_file"
    )

    def flush():
        nonlocal file_count, buf
        if not buf:
            return
        file_count += 1
        path = out_dir / f"parts_{source}_{file_count:04d}.sql"
        with path.open("w") as f:
            for i in range(0, len(buf), ROWS_PER_INSERT):
                chunk = buf[i : i + ROWS_PER_INSERT]
                f.write(f"INSERT OR IGNORE INTO parts ({cols}) VALUES\n")
                values = ",\n".join(
                    "(" + ", ".join(sql_str(v) for v in r.values()) + ")"
                    for r in chunk
                )
                f.write(values + ";\n")
        buf = []

    for r in rows:
        buf.append(r)
        row_count += 1
        if len(buf) >= ROWS_PER_FILE:
            flush()
    flush()
    return file_count, row_count


# -------------------------------------------------------------------- XLS --

def extract_xls() -> Iterator[PartRow]:
    src = "cat_parts_inventory.xls"
    book = xlrd.open_workbook(str(DATA / src))
    sh = book.sheet_by_name("Inventory")
    headers = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    needed = {
        "Part Number",
        "Description",
        "Category/Section",
        "Quantity",
        "Price USD",
    }
    missing = needed - set(headers)
    if missing:
        raise RuntimeError(f"XLS missing headers: {missing}")
    idx = {h: headers.index(h) for h in needed}

    seen: set[str] = set()
    for r in range(1, sh.nrows):
        pn = str(sh.cell_value(r, idx["Part Number"])).strip()
        if not pn:
            continue
        # Dedup within source — schema UNIQUE(part_number, source_file)
        # would dedupe via INSERT OR IGNORE anyway, but skipping early
        # keeps batch files smaller.
        if pn in seen:
            continue
        seen.add(pn)
        desc = str(sh.cell_value(r, idx["Description"])).strip() or pn
        cat = str(sh.cell_value(r, idx["Category/Section"])).strip() or None
        qty_raw = sh.cell_value(r, idx["Quantity"])
        try:
            qty = float(qty_raw) if qty_raw not in ("", None) else 0.0
        except (TypeError, ValueError):
            qty = 0.0
        stock = "in_stock" if qty > 0 else "out_of_stock"
        price_raw = sh.cell_value(r, idx["Price USD"])
        try:
            price = float(price_raw) if price_raw not in ("", None) else None
        except (TypeError, ValueError):
            price = None
        yield PartRow(
            part_number=pn,
            description=desc[:1000],  # safety
            category=cat,
            make="CAT",
            model_compat=None,
            price_usd=price,
            stock_status=stock,
            source_file=src,
        )


# -------------------------------------------------------------------- PDF --

def header_pn_variant(h_clean: str) -> str | None:
    """If a header is a 'Part No.'-style header, return the variant label
    extracted from any prefix ("Pin Part No." → "Pin"). Returns None for
    bare "Part" / "Part No." with no descriptive prefix."""
    if PN_HEADER_BARE_RE.match(h_clean):
        return None
    # "Pin Part No." / "Cylinder Gr. Part No." / "Cone Part Number"
    m = re.match(
        r"^(.*?)\s*\bparts?\s*(?:no\.?|number)\s*$", h_clean, re.I
    )
    if m:
        prefix = m.group(1).strip()
        return prefix or None
    # "Part No.\nApplication" or other in-string occurrences — strip the
    # phrase and use the remainder, if any, as variant.
    if PN_HEADER_PHRASE_RE.search(h_clean):
        rem = PN_HEADER_PHRASE_RE.sub("", h_clean).strip(" |\n\t")
        return rem or None
    return None


def detect_pn_columns(
    headers: list[str], body_rows: list[list]
) -> list[tuple[int, str | None]]:
    """For each PN column return (col_idx, variant_label_or_None).

    variant_label is the column header text when it carries variant info
    ("3 PACK", "J400", "Pin", "Cone", etc.) so the description can record
    which variant the part number is. None when the column is a bare
    "Part No." with no descriptive prefix.

    Detection runs in priority order H1→H2→H3→H4 (see module docstring).
    """
    out: list[tuple[int, str | None]] = []
    used: set[int] = set()
    for i, h in enumerate(headers):
        h_clean = (h or "").strip()
        # H1: "...Part No.", "Parts No.", "Part Number", etc. anywhere.
        if PN_HEADER_PHRASE_RE.search(h_clean):
            out.append((i, header_pn_variant(h_clean)))
            used.add(i)
            continue
        # H1b: ends in " No." / " Number" with no blacklisted word in front
        # ("Piston No.", "Cylinder No.", "Pump No.").
        if (
            PN_HEADER_NO_SUFFIX_RE.match(h_clean)
            and not NON_PN_HEADER_RE.search(h_clean)
        ):
            variant = re.sub(
                r"\s*(?:no\.?|number)\s*$", "", h_clean, flags=re.I
            ).strip()
            out.append((i, variant or None))
            used.add(i)
            continue
        # H2: bare "Part" / "Parts".
        if PN_HEADER_BARE_RE.match(h_clean):
            out.append((i, None))
            used.add(i)
            continue
        # H3: pack / cross-reference column.
        if PACK_HEADER_RE.match(h_clean):
            out.append((i, h_clean))
            used.add(i)
    # H4: body autodetect on remaining columns.
    for i, h in enumerate(headers):
        if i in used:
            continue
        h_clean = (h or "").strip()
        if NON_PN_HEADER_RE.search(h_clean):
            continue
        non_empty = 0
        pn_like = 0
        for row in body_rows:
            if i >= len(row):
                continue
            cell = row[i]
            if cell is None:
                continue
            s = str(cell).replace("\n", " ").strip()
            if not s:
                continue
            non_empty += 1
            first = re.split(r"[\s,/]+", s)[0]
            if PN_CELL_RE.match(first):
                pn_like += 1
        if (
            non_empty >= AUTODETECT_MIN_NON_EMPTY
            and pn_like / non_empty >= AUTODETECT_MIN_PN_RATIO
        ):
            out.append((i, h_clean or None))
    return out


def _de_rotate(s: str) -> str:
    """pdfplumber renders side-tab labels (drawn vertically in the PDF)
    as bottom-to-top character sequences with their case half-mangled.
    Examples we observe in costex_2026.pdf:
      'sTNeNOPMOC'   ← 'COMPONENTS'
      'YdOB'         ← 'BODY'
      'METSyS'       ← 'SYSTEM'
      'SEIROSSEccA'  ← 'ACCESSORIES'

    Heuristic: a candidate that has BOTH (a) >=50% uppercase letters
    AND (b) lowercase letters in *interior* positions (immediately after
    another letter, not at a word boundary) is almost certainly such a
    rotated label. Reverse + uppercase to recover the section name.
    Real proper-noun mixes (eBay, iPhone) fail (a) — they're <50%
    uppercase — and are returned unchanged.
    """
    if not s:
        return s
    letters = [c for c in s if c.isalpha()]
    if not letters:
        return s
    # Pure-uppercase strings (real titles like "EXHAUST MANIFOLDS") and
    # pure-lowercase strings (rotated single-glyph rows like "sgniraeb"
    # we already filter out elsewhere) are unambiguous.
    if all(c.isupper() for c in letters):
        return s
    upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
    if upper_ratio < 0.5:
        return s
    has_interior_lower = False
    prev_alpha = False
    for c in s:
        if c.isalpha():
            if c.islower() and prev_alpha:
                has_interior_lower = True
                break
            prev_alpha = True
        else:
            prev_alpha = False
    if not has_interior_lower:
        return s
    return s[::-1].upper()


# All-uppercase strings reverse to themselves under our case-based heuristic
# (no mixed-case signal), so we maintain a small known-reversed set for the
# common all-caps tab labels in this catalog. Extend as new ones surface.
KNOWN_REVERSED_SECTIONS = {
    "SLOOT": "TOOLS",
    "SRETLIF": "FILTERS",
    "NOITCEJNI": "INJECTION",
}


def section_title(page_text: str) -> str | None:
    """First all-caps title line on the page. We treat it as the
    section/category. The PDF prints these above each table block."""
    for raw_line in page_text.splitlines():
        s = raw_line.strip()
        if s in KNOWN_REVERSED_SECTIONS:
            s = KNOWN_REVERSED_SECTIONS[s]
        else:
            s = _de_rotate(s)
        if not s:
            continue
        # Skip very short tokens (often residual rotated single-glyph rows)
        if len(s) < 4:
            continue
        letters = [c for c in s if c.isalpha()]
        if not letters:
            continue
        upper_ratio = sum(1 for c in letters if c.isupper()) / len(letters)
        if upper_ratio < 0.6:
            continue
        # Drop trailing "(CONT.)"
        s = re.sub(r"\s*\(CONT\.\)\s*$", "", s, flags=re.I).strip()
        # Reject obvious non-titles
        if "©" in s or "rights reserved" in s.lower():
            continue
        if s.isdigit():
            continue
        return s[:200]
    return None


def clean_pn(raw: str) -> str | None:
    """Trim, drop newlines, uppercase, validate against PN_CELL_RE."""
    s = (raw or "").strip().replace("\n", " ")
    if not s:
        return None
    # Strip obvious trailing notes in parens
    s = re.sub(r"\s*\([^)]+\)\s*$", "", s).strip()
    # Multi-PN cells (rare, comma-separated) are handled by caller.
    if not PN_CELL_RE.match(s):
        return None
    return s.upper()


def split_multi_pn_cell(raw: str) -> list[str]:
    """Some cells contain "1386552 / 6Y2553" (slash-separated alternates)."""
    out: list[str] = []
    for tok in re.split(r"[\s,/]+", (raw or "").strip()):
        c = clean_pn(tok)
        if c:
            out.append(c)
    return out


def row_description(
    row: list,
    headers: list[str],
    pn_col_indices: set[int],
    variant: str | None,
) -> str:
    """Build a description for a part-number cell from the row context.

    Skips every column that detect_pn_columns identified as a PN column
    (those produce their own rows). The variant label, if any, is
    appended as a suffix ("...Application — Pin") so multi-PN rows stay
    distinguishable in search.
    """
    parts: list[str] = []
    for i, cell in enumerate(row):
        if i in pn_col_indices:
            continue
        if cell is None:
            continue
        s = str(cell).replace("\n", " ").strip()
        if not s:
            continue
        h = headers[i].strip() if i < len(headers) and headers[i] else ""
        if h and h.lower() not in ("description", "application", "type", "picture"):
            parts.append(f"{h}: {s}")
        else:
            parts.append(s)
    base = " | ".join(parts).strip(" |") or "(no description)"
    if variant:
        base = f"{base} — {variant}"
    return base[:1000]


def extract_model_compat(
    row: list[str | None], headers: list[str]
) -> list[str] | None:
    for i, h in enumerate(headers):
        if not h:
            continue
        if re.search(r"(application|equipment\s*model|model)", h, re.I) and i < len(row):
            cell = row[i]
            if not cell:
                continue
            s = str(cell).replace("\n", " ").strip()
            if not s:
                continue
            tokens = [t.strip() for t in re.split(r",", s) if t.strip()]
            return tokens or None
    return None


def extract_pdf() -> Iterator[PartRow]:
    src = "costex_2026.pdf"
    seen: set[str] = set()
    skipped_pages = 0
    accepted_tables = 0
    rejected_tables = 0
    pn_yielded = 0
    section: str | None = None

    with pdfplumber.open(str(DATA / src)) as pdf:
        total = len(pdf.pages)
        for n, page in enumerate(pdf.pages, start=1):
            if n % 50 == 0:
                print(
                    f"  pdf page {n}/{total}  "
                    f"yielded={pn_yielded}  tables_ok={accepted_tables}  "
                    f"tables_skipped={rejected_tables}",
                    file=sys.stderr,
                )
            try:
                text = page.extract_text() or ""
            except Exception as e:  # noqa: BLE001
                skipped_pages += 1
                print(f"  page {n}: text extract failed: {e}", file=sys.stderr)
                text = ""
            t = section_title(text)
            if t:
                section = t

            try:
                tables = page.extract_tables() or []
            except Exception as e:  # noqa: BLE001
                skipped_pages += 1
                print(f"  page {n}: table extract failed: {e}", file=sys.stderr)
                continue

            for tbl in tables:
                if not tbl or not tbl[0]:
                    continue
                headers = [
                    (h or "").strip() if h is not None else "" for h in tbl[0]
                ]
                body = tbl[1:]
                pn_cols = detect_pn_columns(headers, body)
                if not pn_cols:
                    rejected_tables += 1
                    continue
                accepted_tables += 1
                pn_idx_set = {ci for ci, _ in pn_cols}
                for row in body:
                    if not row:
                        continue
                    # Pad row to header width.
                    row_padded: list = list(row)
                    while len(row_padded) < len(headers):
                        row_padded.append(None)
                    models = extract_model_compat(row_padded, headers)
                    for col_idx, variant in pn_cols:
                        if col_idx >= len(row_padded):
                            continue
                        raw = row_padded[col_idx]
                        if raw is None or not str(raw).strip():
                            continue
                        candidates = split_multi_pn_cell(str(raw))
                        for pn in candidates:
                            key = f"{pn}|{variant or ''}"
                            if key in seen:
                                continue
                            seen.add(key)
                            desc = row_description(
                                row_padded, headers, pn_idx_set, variant
                            )
                            yield PartRow(
                                part_number=pn,
                                description=desc,
                                category=section,
                                make="Costex",
                                model_compat=models,
                                price_usd=None,
                                stock_status=None,
                                source_file=src,
                            )
                            pn_yielded += 1

    print(
        f"  pdf done  yielded={pn_yielded}  "
        f"tables_accepted={accepted_tables}  tables_skipped={rejected_tables}  "
        f"pages_with_errors={skipped_pages}",
        file=sys.stderr,
    )


# ----------------------------------------------------------------- driver --

def run_wrangler_command(sql: str, label: str) -> None:
    """Submit a single SQL command via wrangler d1 execute --command.

    We do NOT use --file here: wrangler's --file path POSTs to the D1
    `/import` endpoint, which requires elevated permissions beyond the
    OAuth scope `d1:write`. The --command path uses `/query` and works
    with the standard write scope.

    Per-call wrangler overhead is ~1.5s; we keep each command ~10KB
    (one 50-row multi-VALUES INSERT) — well under the OS cmd-line limit.
    """
    cmd = [
        "npx", "wrangler", "d1", "execute", DB_NAME,
        "--remote", f"--config={WRANGLER_CFG}",
        f"--command={sql}",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stdout)
        sys.stderr.write(res.stderr)
        raise SystemExit(f"wrangler failed for {label}: rc={res.returncode}")


# Split file content into individual INSERT statements. Statements end
# with `;` at end-of-line; descriptions can contain semicolons inside
# quoted strings, so we walk character-by-character with a string-mode
# flag instead of a naive split.
def iter_statements(sql_text: str):
    in_string = False
    buf = []
    i = 0
    n = len(sql_text)
    while i < n:
        ch = sql_text[i]
        buf.append(ch)
        if ch == "'":
            # SQL escapes a quote by doubling it.
            if in_string and i + 1 < n and sql_text[i + 1] == "'":
                buf.append("'")
                i += 2
                continue
            in_string = not in_string
        elif ch == ";" and not in_string:
            stmt = "".join(buf).strip()
            if stmt:
                yield stmt
            buf = []
        i += 1
    tail = "".join(buf).strip()
    if tail:
        yield tail


def in_tolerance(actual: int, expected: int, tol: float) -> bool:
    if expected == 0:
        return actual == 0
    return abs(actual - expected) / expected <= tol


def in_range(actual: int, lo: int, hi: int) -> bool:
    return lo <= actual <= hi


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source", choices=["xls", "pdf", "both"], default="both")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Submit batches to D1 via wrangler. Without this flag the "
        "script only writes SQL files and reports counts.",
    )
    parser.add_argument(
        "--clean", action="store_true", help="Wipe data/.staged/ before writing."
    )
    args = parser.parse_args()

    if args.clean and STAGE.exists():
        shutil.rmtree(STAGE)

    summaries: list[tuple[str, int, int]] = []  # (source, files, rows)

    if args.source in ("xls", "both"):
        print("=== XLS extract ===", file=sys.stderr)
        files, rows = write_batches(STAGE, "cat", extract_xls())
        summaries.append(("cat_parts_inventory.xls", files, rows))
        if not in_tolerance(rows, EXPECTED_XLS_ROWS, XLS_TOLERANCE):
            raise SystemExit(
                f"ABORT: XLS row count {rows} is outside "
                f"±{XLS_TOLERANCE*100:.0f}% of expected "
                f"{EXPECTED_XLS_ROWS}. Refusing to apply."
            )

    if args.source in ("pdf", "both"):
        print("=== PDF extract ===", file=sys.stderr)
        files, rows = write_batches(STAGE, "costex", extract_pdf())
        summaries.append(("costex_2026.pdf", files, rows))
        if not in_range(rows, PDF_MIN_ROWS, PDF_MAX_ROWS):
            raise SystemExit(
                f"ABORT: PDF row count {rows} is outside the sanity range "
                f"[{PDF_MIN_ROWS}, {PDF_MAX_ROWS}]. "
                f"<{PDF_MIN_ROWS} suggests too-narrow policy; "
                f">{PDF_MAX_ROWS} suggests false positives. "
                f"Tweak the extraction policy and re-run."
            )

    print("\n=== summary ===")
    for src, files, rows in summaries:
        print(f"  {src}: {rows} rows in {files} batch file(s)")

    if not args.apply:
        print(
            "\nNot applied (use --apply to submit each batch via wrangler "
            "d1 execute --remote)."
        )
        return

    # Apply each batch in deterministic order. Each batch file holds
    # multiple INSERT statements; we submit one statement per wrangler
    # call (see run_wrangler_command for the rationale).
    print("\n=== apply ===", file=sys.stderr)
    files = sorted(STAGE.glob("parts_*.sql"))
    total_stmts = 0
    for f in files:
        with f.open() as fp:
            total_stmts += sum(1 for _ in iter_statements(fp.read()))
    print(f"  {len(files)} files, {total_stmts} statements total", file=sys.stderr)
    submitted = 0
    import time as _time
    started = _time.time()
    for i, f in enumerate(files, start=1):
        with f.open() as fp:
            text = fp.read()
        for j, stmt in enumerate(iter_statements(text), start=1):
            submitted += 1
            run_wrangler_command(stmt, label=f"{f.name}#{j}")
            if submitted % 25 == 0:
                elapsed = _time.time() - started
                rate = submitted / max(elapsed, 0.001)
                remaining = (total_stmts - submitted) / max(rate, 0.001)
                print(
                    f"  [{submitted}/{total_stmts}] "
                    f"{rate:.1f} stmts/s, ~{remaining/60:.1f} min remaining",
                    file=sys.stderr,
                )
    print(
        f"apply done: {submitted} statements in "
        f"{(_time.time()-started)/60:.1f} min",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
