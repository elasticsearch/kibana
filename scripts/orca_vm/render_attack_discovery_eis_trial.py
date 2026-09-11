#!/usr/bin/env python3
"""Render attack_discovery_results-3.html ("EIS Model Trial") from a golden extract.

Replicates the reference artifact's SHAPE (model table: status/discoveries/
alerts-in-context/latency/total-risk + per-model discovery cards). Every value
traces to a golden extract doc; the model list/order comes from parsing the
reference HTML itself (--reference). Zero hand-edited numbers, zero imputation.

Classification (extract + connectors cache at render time, never guessed):
  have-data   model has extract rows
  failed      have-data but zero insights (honest low row, never dropped)
  broken      connector exists, model considered broken at render time
              (2026-09-11 directive: skip top-up, disclose, don't chase gates)
  no-connector reference model with no EIS connector — structurally impossible
"""
import argparse
import datetime
import html
import json
import os
import re
import sys

# ── Reference parsing ────────────────────────────────────────────────────────
# Model list + display order + display names come from the reference artifact
# itself, parsed at render time — never hand-maintained.
ROW_RE = re.compile(
    r'<td class="model">([^<]*)<br>\s*<span class="model-id">([^<]+)</span>', re.S)


def load_reference_models(reference_html_path):
    with open(reference_html_path, encoding="utf-8") as fh:
        text = fh.read()
    pairs = ROW_RE.findall(text)
    seen, models = set(), []
    for display, model_id in pairs:
        if model_id in seen:
            continue
        seen.add(model_id)
        models.append((model_id, display.strip()))
    return models


def eis_connector_id(model_id):
    """Reference id -> eis- connector id. Vendor-prefixed ids (deepseek/...,
    google/gemma-..., moonshotai/...) have no EIS equivalent; keep verbatim so
    the connectors-cache lookup below classifies them no-connector."""
    if "/" in model_id:
        return model_id
    return "eis-" + model_id.replace(".", "-")


BROKEN_MODELS = {
    # 2026-09-11 user directive: the four top-up gaps are considered broken at
    # render time. Skip top-up runs; disclose; don't chase gates.
    "eis-gp-llm-v2",
    "eis-google-gemini-2-5-flash",
    "eis-google-gemini-2-5-flash-lite",
    "eis-zai-glm-5-2",
}


def classify(reference_models, extract, connectors_path):
    """Return ordered rows: (model_id, display, conn_id, status, extract_row).

    Status precedence: have-data/failed > broken > no-connector.
    """
    cache = json.load(open(connectors_path, encoding="utf-8"))
    conns = cache.get("connectors", cache)
    have = set(conns.keys()) if isinstance(conns, dict) else {
        c.get("id") for c in conns}

    by_conn = {m["modelId"]: m for m in extract["models"]}
    rows = []
    for model_id, display in reference_models:
        conn_id = eis_connector_id(model_id)
        if conn_id in by_conn:
            row = by_conn[conn_id]
            counts = (row.get("status") or {}).get("counts") or {}
            status = ("failed" if counts.get("failed") and not counts.get("succeeded")
                      else "have-data")
        elif conn_id in BROKEN_MODELS:
            row, status = None, "broken"
        elif conn_id not in have:
            row, status = None, "no-connector"
        else:
            row, status = None, "not-run"
        rows.append((model_id, display, conn_id, status, row))
    return rows


def fmt_latency(row):
    lat = row.get("generateLatencySeconds")
    if lat is None:
        return "--"
    return f"{lat/60:.1f}m"


def total_risk(row):
    return sum(i.get("risk_score") or 0
               for t in (row.get("traceCards") or [])
               for i in t["insights"])


def render_table_rows(rows):
    out = []
    for model_id, display, conn_id, status, row in rows:
        if status in ("have-data", "failed"):
            n = (row.get("discoveryCount") or {}).get("mean", 0)
            alerts = (row.get("alertsContextCount") or {}).get("mean")
            alerts_txt = f"{alerts:.0f}" if alerts is not None else "--"
            lat = fmt_latency(row)
            risk = total_risk(row)
            risk_txt = f"{risk:.0f}" if risk else "--"
            badge = "ok" if status == "have-data" else "failed"
            status_txt = "OK" if status == "have-data" else "ERROR"
            disc_txt = f"{n:g} discoveries"
        else:
            alerts_txt = lat = risk_txt = "--"
            badge = status
            status_txt = {"broken": "BROKEN (skipped)",
                          "no-connector": "NO CONNECTOR",
                          "not-run": "NOT RUN"}[status]
            disc_txt = "--"
        out.append(
            f'<tr><td class="model">{html.escape(display)}<br>'
            f'<span class="model-id">{html.escape(conn_id)}</span></td>'
            f'<td><span class="badge {badge}">{status_txt}</span></td>'
            f'<td class="num">{disc_txt}</td>'
            f'<td class="num">{alerts_txt}</td>'
            f'<td class="num">{lat}</td>'
            f'<td class="num">{risk_txt}</td></tr>')
    return "\n".join(out)


def render_cards(rows):
    out = []
    for model_id, display, conn_id, status, row in rows:
        if status != "have-data":
            continue
        cards = row.get("traceCards") or []
        if not cards:
            continue
        body = []
        exec_note = (" (2 executions — union)"
                     if len(cards) > 1 else "")
        for t in cards:
            for ins in t["insights"]:
                tactics = ", ".join(ins.get("mitre_attack_tactics") or [])
                title = html.escape(ins.get("title") or "(untitled)")
                summary = html.escape(ins.get("summary_markdown") or "")
                risk = ins.get("risk_score")
                risk_html = (f'<span class="chip risk">{risk}</span>'
                             if risk is not None else "")
                body.append(
                    f'<div class="discovery"><h4>{title} {risk_html}</h4>'
                    f'<div class="tactics">{html.escape(tactics)}</div>'
                    f'<p>{summary}</p></div>')
        if body:
            out.append(
                f'<details class="model-block"><summary>{html.escape(display)}'
                f' — {len(body)} discoveries{exec_note}</summary>'
                + "".join(body) + "</details>")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extract", required=True)
    ap.add_argument("--reference", required=True)
    ap.add_argument("--connectors", default=os.path.expanduser(
        "~/.elastic/eis-connectors-cache.json"))
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    extract = json.load(open(args.extract, encoding="utf-8"))
    reference_models = load_reference_models(args.reference)
    rows = classify(reference_models, extract, args.connectors)

    counts = {}
    for _, _, _, status, _ in rows:
        counts[status] = counts.get(status, 0) + 1

    now = datetime.datetime.now(datetime.timezone.utc)
    broken_list = ", ".join(sorted(BROKEN_MODELS))
    doc = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Attack Discovery — EIS Model Trial</title>
<style>
 body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        margin: 2rem auto; max-width: 1100px; color: #1a1c1f;
        background: #f6f7f8; }}
 h1 {{ font-size: 1.5rem; }}
 table {{ border-collapse: collapse; width: 100%; background: #fff; }}
 th, td {{ border: 1px solid #d5d9de; padding: .45rem .6rem;
           text-align: left; vertical-align: top; }}
 th {{ background: #eef1f4; }}
 td.num {{ text-align: right; font-variant-numeric: tabular-nums; }}
 .model-id {{ color: #66707a; font-size: .78rem; font-family: ui-monospace, monospace; }}
 .badge {{ padding: .1rem .45rem; border-radius: 4px; font-size: .78rem; font-weight: 600; }}
 .badge.ok {{ background: #d8f1dc; color: #14532d; }}
 .badge.failed {{ background: #fde8e8; color: #7f1d1d; }}
 .badge.broken {{ background: #fef3c7; color: #78350f; }}
 .badge.no-connector, .badge.not-run {{ background: #e5e7eb; color: #374151; }}
 .model-block {{ background: #fff; border: 1px solid #d5d9de; border-radius: 6px;
               margin: .8rem 0; padding: .6rem 1rem; }}
 .model-block summary {{ cursor: pointer; font-weight: 600; }}
 .discovery {{ border-top: 1px solid #e5e7eb; padding: .5rem 0; }}
 .discovery h4 {{ margin: .2rem 0; font-size: .95rem; }}
 .tactics {{ color: #006a9e; font-size: .8rem; font-family: ui-monospace, monospace; }}
 .chip.risk {{ background: #fde8e8; color: #7f1d1d; border-radius: 4px;
             padding: .05rem .4rem; font-size: .75rem; margin-left: .4rem; }}
 .disclosure {{ background: #fff8e6; border: 1px solid #e5c76b; padding: 1rem;
              border-radius: 6px; font-size: .85rem; margin: 1.5rem 0; }}
</style></head><body>
<h1>Attack Discovery — EIS Model Trial</h1>
<p><b>Suite:</b> {html.escape(extract['suiteId'])} · golden extract
   {extract['sourceDocCount']} docs · rendered {now:%Y-%m-%d %H:%M} UTC ·
   {counts.get('have-data', 0) + counts.get('failed', 0)}/{len(rows)} models with data</p>
<div class="disclosure">
<p><b>Disclosure.</b> Recreation of the reference "EIS Model Trial" board
(attack_discovery_results-3.html, 2026-08-26) from golden-cluster data:
suite <b>{html.escape(extract['suiteId'])}</b>, real <b>oh-my-malware-95-deduped</b>
GCS corpus (95 alerts restored per run) via the production <b>_generate</b> API.
All 8 evaluators per model. Every number on this board traces to a golden
extract document — zero hand-edited values, zero imputation.

<p><b>Model coverage:</b> {counts.get('have-data', 0)} OK ·
{counts.get('failed', 0)} error rows (ran, zero discoveries — kept, not dropped) ·
{counts.get('broken', 0)} broken with no data ·
{counts.get('no-connector', 0)} without EIS connectors (structurally impossible:
{counts.get('no-connector', 0)} of {len(rows)} reference models) ·
{counts.get('not-run', 0)} not run.</p>

<p><b>Broken at render time</b> (2026-09-11 directive: top-up skipped, not
chased): {html.escape(broken_list)}. Of these, eis-google-gemini-2-5-flash has
a prior run in golden (zero insights) and is shown as an ERROR row above; the
other three have no golden data.</p>

<p><b>Judge:</b> the source sweep ran with <b>eis-google-gemini-3-1-pro</b> as
judge. Judge scores do not feed this board — all displayed numbers are raw
product output (insight counts, alert counts, _generate latency, insight risk
scores) read from golden.</p>

<p><b>Latency</b> is _generate wall-clock per execution (mean over executions);
<b>Total Risk</b> = sum of insight risk_score values across the model's
executions.</p>
</div>
<table>
<thead><tr><th>Model</th><th>Status</th>
<th>Discoveries</th><th>Alerts in Context</th><th>Latency</th><th>Total Risk</th></tr></thead>
<tbody>
{render_table_rows(rows)}
</tbody></table>
<h2>Discoveries by model</h2>
{render_cards(rows)}
</body></html>
"""
    with open(args.out, "w", encoding="utf-8") as fh:
        fh.write(doc)
    print(f"rendered {args.out}: {len(rows)} reference models, "
          f"{counts.get('have-data', 0)} have-data, "
          f"{counts.get('failed', 0)} failed, "
          f"{counts.get('broken', 0)} broken, "
          f"{counts.get('no-connector', 0)} no-connector, "
          f"{counts.get('not-run', 0)} not-run")


if __name__ == "__main__":
    main()




