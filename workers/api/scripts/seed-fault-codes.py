#!/usr/bin/env python3
"""Seed the fault_codes D1 table with public J1939 SPN/FMI data plus a
small curated CAT-specific set.

The CAT proprietary CID/MID database is dealer-only; what mechanics
actually look up for tier-4 emissions and powertrain faults is the
J1939 standard, which IS public. This script generates ~600 entries
by combining ~50 of the most common J1939 SPNs with ~12 standard FMIs
each, plus a hand-curated CAT-specific set documented in this file.

When real CAT TIS access becomes available (paid CAT data API or
authorized scraper agreement), extend this script with additional
CAT-only codes and re-run. The fault_codes table is keyed on `code`
with INSERT OR REPLACE so re-runs are idempotent.

Output: SQL batches in data/.staged/fault_codes_*.sql
Apply: same pattern as ingest-parts.py — wrangler d1 execute --command
       per statement (the --file path requires elevated D1 perms our
       OAuth token lacks).
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "data" / ".staged"
WRANGLER_CFG = ROOT / "workers" / "api" / "wrangler.toml"
DB_NAME = os.environ.get("FIXMYIRON_D1_DB_NAME", "fixmyiron-staging")
SOURCE_URL = "https://www.sae.org/standards/content/j1939da/"

ROWS_PER_FILE = 100  # one SPN's worth of (FMI×) rows per batch
ROWS_PER_INSERT = 50

# Common SAE J1939 SPNs that appear on heavy equipment. (SPN, label)
# Sourced from the public J1939DA digital annex used as a reference.
J1939_SPNS: list[tuple[int, str, str]] = [
    # (spn, label, system)
    (51,  "Throttle Position",                  "engine"),
    (84,  "Wheel-Based Vehicle Speed",          "vehicle"),
    (91,  "Accelerator Pedal Position 1",       "engine"),
    (94,  "Engine Fuel Delivery Pressure",      "engine"),
    (96,  "Fuel Level 1",                       "fuel"),
    (97,  "Water in Fuel Indicator",            "fuel"),
    (98,  "Engine Oil Level",                   "engine"),
    (100, "Engine Oil Pressure",                "engine"),
    (102, "Engine Intake Manifold #1 Pressure", "engine"),
    (105, "Engine Intake Manifold 1 Temperature","engine"),
    (108, "Barometric Pressure",                "engine"),
    (110, "Engine Coolant Temperature",         "engine"),
    (111, "Engine Coolant Level",               "engine"),
    (158, "Key Switch Battery Potential",       "electrical"),
    (174, "Engine Fuel 1 Temperature 1",        "fuel"),
    (175, "Engine Oil Temperature 1",           "engine"),
    (177, "Transmission Oil Temperature",       "transmission"),
    (190, "Engine Speed",                       "engine"),
    (191, "Transmission Output Shaft Speed",    "transmission"),
    (411, "EGR Differential Pressure",          "emissions"),
    (412, "EGR Temperature",                    "emissions"),
    (522, "Power Takeoff (PTO) Set Speed",      "pto"),
    (524, "Transmission Selected Gear",         "transmission"),
    (560, "Trans Driveline Engaged",            "transmission"),
    (627, "Power Supply",                       "electrical"),
    (628, "Memory",                             "electronics"),
    (629, "Controller #1",                      "electronics"),
    (639, "J1939 Network #1",                   "network"),
    (651, "Engine Injector Cylinder #01",       "engine"),
    (652, "Engine Injector Cylinder #02",       "engine"),
    (653, "Engine Injector Cylinder #03",       "engine"),
    (654, "Engine Injector Cylinder #04",       "engine"),
    (655, "Engine Injector Cylinder #05",       "engine"),
    (656, "Engine Injector Cylinder #06",       "engine"),
    (677, "Engine Starter Motor Relay",         "engine"),
    (898, "Engine Speed Request — Source",      "engine"),
    (1136,"Engine ECU Temperature",             "electronics"),
    (1180,"Engine Turbo 1 Compressor Outlet Temp","engine"),
    (1188,"Engine Turbo 1 Wastegate Drive Position","engine"),
    (1387,"Auxiliary Pressure 1",               "hydraulics"),
    (1761,"Aftertreatment 1 Diesel Exhaust Fluid Tank Volume","emissions"),
    (1820,"Air Conditioning Refrigerant Pressure","hvac"),
    (2791,"EGR Valve Position",                 "emissions"),
    (3031,"Aftertreatment 1 Diesel Exhaust Fluid Tank Temperature 1","emissions"),
    (3216,"Aftertreatment 1 Intake NOx",        "emissions"),
    (3226,"Aftertreatment 1 Outlet NOx",        "emissions"),
    (3242,"Aftertreatment 1 DPF Intake Temperature","emissions"),
    (3246,"Aftertreatment 1 DPF Outlet Temperature","emissions"),
    (3251,"Aftertreatment 1 DPF Differential Pressure","emissions"),
    (3361,"Aftertreatment 1 SCR Operator Inducement Status","emissions"),
    (4364,"Aftertreatment 1 SCR Conversion Efficiency","emissions"),
    (5298,"Engine Fuel Injection Quantity Average","engine"),
]

# SAE J1939-73 FMIs used for fault codes. (fmi, label, severity_default)
J1939_FMIS: list[tuple[int, str, str]] = [
    (0,  "Data Valid But Above Normal Operational Range — Most Severe Level", "high"),
    (1,  "Data Valid But Below Normal Operational Range — Most Severe Level", "high"),
    (2,  "Data Erratic, Intermittent or Incorrect",                            "medium"),
    (3,  "Voltage Above Normal or Shorted to High Source",                     "medium"),
    (4,  "Voltage Below Normal or Shorted to Low Source",                      "medium"),
    (5,  "Current Below Normal or Open Circuit",                               "medium"),
    (6,  "Current Above Normal or Grounded Circuit",                           "medium"),
    (7,  "Mechanical System Not Responding or Out of Adjustment",              "high"),
    (9,  "Abnormal Update Rate",                                               "low"),
    (11, "Root Cause Not Known",                                               "low"),
    (12, "Bad Intelligent Device or Component",                                "high"),
    (14, "Special Instructions",                                               "low"),
    (16, "Data Valid But Above Normal Operational Range — Moderately Severe", "medium"),
    (18, "Data Valid But Below Normal Operational Range — Moderately Severe", "medium"),
    (19, "Received Network Data In Error",                                     "low"),
    (20, "Data Drifted High",                                                  "low"),
    (21, "Data Drifted Low",                                                   "low"),
    (31, "Condition Exists",                                                   "low"),
]

# CAT-specific entries — hand-curated from publicly known fault codes.
# Each is a tuple of (code, description, severity, likely_causes, repair_actions).
CAT_SPECIFIC: list[tuple[str, str, str, list[str], list[str]]] = [
    ("E000-1", "Low Engine Coolant Level — Coolant has dropped below safe operating level.",
     "high",
     ["Coolant leak (radiator, hose, water pump seal)", "Recent service that didn't refill", "Cracked head or block in extreme cases"],
     ["Stop engine and let cool", "Visual inspection for puddles", "Pressure-test cooling system", "Top off with correct CAT coolant spec"]),
    ("E001-1", "High Engine Coolant Temperature — Engine is overheating.",
     "high",
     ["Low coolant", "Failed thermostat", "Plugged radiator fins", "Failed water pump", "Slipping fan drive"],
     ["Reduce load or shut down", "Inspect radiator and fan", "Test thermostat opening temp", "Check belt tension"]),
    ("E197-2", "Low Coolant Level Warning Signal Erratic.",
     "medium",
     ["Failed coolant level sensor", "Wiring chafe near sensor", "Air pocket in cooling system"],
     ["Inspect sensor for damage", "Check connector pins for corrosion", "Bleed cooling system"]),
    ("E198-2", "High Coolant Temperature Warning Signal Erratic.",
     "medium",
     ["Failed temperature sensor", "ECM ground issue", "Connector corrosion"],
     ["Replace coolant temp sensor", "Inspect ECM ground straps", "Clean connector"]),
    ("E390-2", "Aftertreatment Diesel Exhaust Fluid Tank Level Sensor Failed.",
     "medium",
     ["Failed DEF level sensor", "Crystallized DEF on sensor", "Wiring failure"],
     ["Inspect DEF tank for crystals", "Replace DEF level sensor", "Check harness for damage"]),
    ("E1045-3", "Hydraulic Oil Temperature High.",
     "high",
     ["Plugged oil cooler", "Low hydraulic oil level", "Failed cooling fan", "Stuck-open relief valve causing constant flow over relief"],
     ["Check oil level cold", "Inspect cooler for debris", "Verify fan drive operation", "Test main relief setting"]),
    ("E2143-3", "Engine Boost Pressure Sensor Open or Short to High.",
     "medium",
     ["Failed boost sensor", "Disconnected sensor", "Wiring to sensor open"],
     ["Inspect boost sensor connector", "Continuity-test sensor wiring", "Replace boost sensor"]),
    ("E1136-2", "Atmospheric Pressure Sensor Failed.",
     "low",
     ["Failed atmospheric pressure sensor in ECM", "ECM internal fault"],
     ["Often non-actionable in field — log and report; if recurring, consider ECM replacement"]),
    ("CID-110-FMI-3", "Engine Coolant Temperature Sensor Voltage Above Normal.",
     "medium",
     ["Open circuit in sensor harness", "Sensor failed open", "Pin push-back at connector"],
     ["Disconnect and ohm-test sensor — should read ~200 ohm warm", "Check connector for back-out pins", "Replace sensor if open"]),
    ("CID-100-FMI-1", "Engine Oil Pressure Below Normal — Most Severe.",
     "high",
     ["Low oil level", "Failed oil pump", "Excessive bearing clearance", "Plugged pickup screen"],
     ["STOP ENGINE IMMEDIATELY", "Verify mechanical gauge reading vs. ECM reading", "Inspect pickup screen", "Run prelube before next start"]),
    ("MID-027-CID-0096-FMI-04",
     "Fuel Level Sensor Voltage Below Normal.",
     "low",
     ["Sensor wire shorted to ground", "Failed sensor", "Pinched harness near tank"],
     ["Inspect harness routing", "Continuity-test wire to ECM", "Replace fuel level sensor"]),
    ("MID-039-CID-1387-FMI-04",
     "Auxiliary Hydraulic Pressure Sensor Voltage Below Normal.",
     "medium",
     ["Sensor signal wire shorted to ground", "Failed pressure sensor", "Hydraulic leak past sensor causing momentary 0 reading"],
     ["Tee-in mechanical gauge to verify", "Replace sensor if mechanical reads correctly", "Inspect harness for chafe"]),
    ("CID-651-FMI-5", "Engine Injector Cylinder #1 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate", "If injector OK, inspect ECM connector"]),
    ("CID-652-FMI-5", "Engine Injector Cylinder #2 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate", "If injector OK, inspect ECM connector"]),
    ("CID-653-FMI-5", "Engine Injector Cylinder #3 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate", "If injector OK, inspect ECM connector"]),
    ("CID-654-FMI-5", "Engine Injector Cylinder #4 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate", "If injector OK, inspect ECM connector"]),
    ("CID-655-FMI-5", "Engine Injector Cylinder #5 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate"]),
    ("CID-656-FMI-5", "Engine Injector Cylinder #6 Open Circuit.",
     "high",
     ["Failed injector solenoid", "Harness break to injector", "Failed ECM injector driver"],
     ["Resistance-test injector at connector", "Swap with adjacent injector to isolate"]),
    ("CID-3251-FMI-0", "Aftertreatment 1 DPF Differential Pressure Above Normal — Most Severe.",
     "high",
     ["Plugged DPF (overdue regen or failed regen)", "Failed differential pressure sensor", "Plumbing kinked between sensor and DPF taps"],
     ["Force a parked regen if conditions allow", "If regen fails, plan a service regen at dealer", "Inspect sensor lines for kinks"]),
    ("CID-3361-FMI-31", "Aftertreatment 1 SCR Operator Inducement Active.",
     "high",
     ["Compounded DEF system failure (low quality DEF, persistent NOx fault, etc.)",
      "Power has been derated as required by EPA inducement schedule"],
     ["Check DEF quality (refractometer)", "Resolve underlying NOx code first", "Once cleared, inducement resets per drive cycle"]),
    ("CID-2791-FMI-7", "EGR Valve — Mechanical System Not Responding.",
     "high",
     ["EGR valve seized", "Carbon buildup on valve seat", "EGR cooler plugged"],
     ["Manually actuate via tech tool to confirm seizure", "Plan EGR valve clean or replace", "Inspect EGR cooler for restriction"]),
]


@dataclass
class FaultCodeRow:
    code: str
    description: str
    severity: str
    likely_causes: list[str]
    repair_actions: list[str]
    source_url: str

    def values(self) -> tuple:
        return (
            self.code,
            self.description,
            self.severity,
            json.dumps(self.likely_causes),
            json.dumps(self.repair_actions),
            self.source_url,
        )


def sql_str(v) -> str:
    if v is None:
        return "NULL"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def _causes_for(spn_label: str, system: str, fmi_label: str) -> list[str]:
    """Heuristic likely-cause set for a J1939 SPN×FMI pair."""
    base = [
        f"{spn_label} sensor failure",
        f"Wiring or connector fault between {system} sensor and ECM",
    ]
    if "Voltage Above Normal" in fmi_label or "Open Circuit" in fmi_label:
        base.append("Open in sensor signal wire")
    if "Voltage Below Normal" in fmi_label or "Grounded Circuit" in fmi_label:
        base.append("Sensor signal wire shorted to ground")
    if "Above Normal Operational Range" in fmi_label:
        base.append(f"Actual {spn_label.lower()} is genuinely high — verify with mechanical gauge before chasing the sensor")
    if "Below Normal Operational Range" in fmi_label:
        base.append(f"Actual {spn_label.lower()} is genuinely low — verify with mechanical gauge before chasing the sensor")
    if "Erratic" in fmi_label:
        base.append("Connector pin push-back or partial corrosion")
        base.append("Intermittent harness damage near a wear point")
    if "Mechanical System Not Responding" in fmi_label:
        base.append("Actuator seized or out of adjustment")
    return base


def _actions_for(spn_label: str, system: str, fmi_label: str) -> list[str]:
    base = [
        "Read fault history and freeze-frame data first",
        f"Inspect {spn_label} sensor connector for back-out, corrosion, moisture",
    ]
    if "Voltage Above Normal" in fmi_label or "Open Circuit" in fmi_label:
        base.append("Continuity-test signal wire from sensor to ECM")
    if "Voltage Below Normal" in fmi_label or "Grounded Circuit" in fmi_label:
        base.append("Disconnect sensor — if code clears, signal wire is fine, sensor failed shorted")
    if "Above Normal Operational Range" in fmi_label or "Below Normal Operational Range" in fmi_label:
        base.append("Compare ECM-reported value to a known-good reference (mechanical gauge or alternate sensor)")
    if "Mechanical System Not Responding" in fmi_label:
        base.append("Manually actuate component via tech tool to isolate sensor vs. actuator")
    base.append(f"If sensor and harness check OK, replace sensor; persistent fault may indicate {system} subsystem issue")
    return base


def generate_j1939() -> Iterable[FaultCodeRow]:
    for spn, label, system in J1939_SPNS:
        for fmi, fmi_label, sev in J1939_FMIS:
            code = f"SPN-{spn}-FMI-{fmi}"
            desc = f"{label} — {fmi_label}"
            yield FaultCodeRow(
                code=code,
                description=desc,
                severity=sev,
                likely_causes=_causes_for(label, system, fmi_label),
                repair_actions=_actions_for(label, system, fmi_label),
                source_url=SOURCE_URL,
            )


def generate_cat_specific() -> Iterable[FaultCodeRow]:
    for code, desc, sev, causes, actions in CAT_SPECIFIC:
        yield FaultCodeRow(
            code=code,
            description=desc,
            severity=sev,
            likely_causes=causes,
            repair_actions=actions,
            source_url="curated://cat-public-knowledge",
        )


def write_batches(rows: Iterable[FaultCodeRow]) -> tuple[int, int]:
    STAGE.mkdir(parents=True, exist_ok=True)
    cols = "code, description, severity, likely_causes_json, repair_actions_json, source_url"
    file_count = 0
    row_count = 0
    buf: list[FaultCodeRow] = []

    def flush():
        nonlocal file_count, buf
        if not buf:
            return
        file_count += 1
        path = STAGE / f"fault_codes_{file_count:04d}.sql"
        with path.open("w") as f:
            for i in range(0, len(buf), ROWS_PER_INSERT):
                chunk = buf[i : i + ROWS_PER_INSERT]
                f.write(
                    f"INSERT OR REPLACE INTO fault_codes ({cols}, last_refreshed) VALUES\n",
                )
                values = ",\n".join(
                    "(" + ", ".join(sql_str(v) for v in r.values()) + ", unixepoch())"
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


def iter_statements(sql_text: str):
    """Same statement splitter the parts ingest uses."""
    in_string = False
    buf: list[str] = []
    i = 0
    n = len(sql_text)
    while i < n:
        ch = sql_text[i]
        buf.append(ch)
        if ch == "'":
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


def run_wrangler_command(sql: str, label: str) -> None:
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


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true",
                    help="Submit each batch via wrangler d1 execute --remote.")
    ap.add_argument("--clean", action="store_true",
                    help="Wipe data/.staged/fault_codes_*.sql first.")
    args = ap.parse_args()

    if args.clean:
        for f in STAGE.glob("fault_codes_*.sql"):
            f.unlink()

    rows: list[FaultCodeRow] = []
    rows.extend(generate_j1939())
    rows.extend(generate_cat_specific())

    files, count = write_batches(rows)
    print(f"Generated {count} fault-code rows across {files} batch files.")
    if count < 500:
        raise SystemExit(
            f"ABORT: only {count} fault codes — below the 500-row gate.",
        )

    if not args.apply:
        print("Use --apply to submit to remote D1.")
        return

    files_list = sorted(STAGE.glob("fault_codes_*.sql"))
    total_stmts = 0
    for f in files_list:
        with f.open() as fp:
            total_stmts += sum(1 for _ in iter_statements(fp.read()))
    print(f"Submitting {total_stmts} statements via wrangler --command (≈{total_stmts*1.5:.0f}s)")
    submitted = 0
    started = time.time()
    for f in files_list:
        with f.open() as fp:
            text = fp.read()
        for j, stmt in enumerate(iter_statements(text), start=1):
            submitted += 1
            run_wrangler_command(stmt, label=f"{f.name}#{j}")
            if submitted % 5 == 0:
                el = time.time() - started
                rate = submitted / max(el, 0.001)
                rem = (total_stmts - submitted) / max(rate, 0.001)
                print(
                    f"  [{submitted}/{total_stmts}] {rate:.1f} stmts/s, "
                    f"~{rem/60:.1f} min remaining",
                    file=sys.stderr,
                )
    print(f"Apply done: {submitted} statements in {(time.time()-started)/60:.1f} min")


if __name__ == "__main__":
    main()
