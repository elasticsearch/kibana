#!/usr/bin/env python3
"""Render the attack-discovery board from the golden ES aggregate.

Rules enforced here (the point of the script, not decoration):
* Every number comes from the aggregate JSON; nothing is hardcoded or imputed.
* A field with no source renders as a visible blank marker, never a guess.
* Coverage (n) rides next to each mean so a 1-doc mean cannot pose as many.
* Trace cards show the FINAL ANSWER (task.output.insights) per execution;
  a board without them would hide what the model actually concluded.
* Refuses to emit if the aggregate is empty or every discovery cell is null.
"""
import argparse
import datetime
import html
import json
import sys

BLANK = '<span class="na" title="no source field in our schema">--</span>'


def cell(mean, n, digits=2):
    if mean is None:
        return BLANK
    return f'{mean:.{digits}f}<span class="n">n={n}</span>'


def status_badge(m):
    counts = m["status"]["counts"]
    if not counts:
        return BLANK
    if "failed" in counts:
        return f'<span class="bad">failed</span>'
    if counts.get("succeeded"):
        return f'<span class="ok">succeeded</span>'
    return html.escape("/".join(sorted(counts.keys())))


def build_rows(models):
    out = []
    for m in sorted(models, key=lambda r: (r["discoveryCount"]["mean"] is None, -(r["discoveryCount"]["mean"] or 0))):
        lat = m.get("generateLatencySeconds")
        rub = (m.get("evaluators") or {}).get("AttackDiscoveryRubric") or {}
        errs = m.get("generateErrors") or []
        err_html = (
            f'<div class="err">{"; ".join(html.escape(e) for e in errs[:1])}</div>'
            if errs else ""
        )
        out.append(
            "<tr>"
            f'<td class="model">{html.escape(m["modelId"])}</td>'
            f"<td>{status_badge(m)}</td>"
            f'<td>{cell(m["discoveryCount"]["mean"], m["discoveryCount"]["n"], 0)}</td>'
            f'<td>{cell(m["alertsContextCount"]["mean"], m["alertsContextCount"]["n"], 0)}</td>'
            f'<td>{f"{lat:.1f}s" if lat is not None else BLANK}</td>'
            f'<td>{cell(rub.get("mean"), rub.get("n", 0))}</td>'
            f'<td>{BLANK if m["totalRisk"] is None else m["totalRisk"]}</td>'
            f'<td class="dim">{m["docs"]}</td>'
            f"{err_html and ''}"
            "</tr>"
            + (f'<tr class="errrow"><td></td><td colspan="7">{err_html}</td></tr>' if err_html else "")
        )
    return "\n".join(out)


def trace_cards(models):
    """Per-model final-answer cards. Each card carries the execution id, the
    OTel trace id, and every insight the model produced (title, risk, tactics,
    summary excerpt). This is the answer itself, not a pointer to it."""
    blocks = []
    for m in models:
        cards = m.get("traceCards") or []
        if not cards:
            blocks.append(
                f'<div class="tcard empty"><div class="thead">{html.escape(m["modelId"])} '
                f'&mdash; no final answer on golden (generation failed or no insights)</div></div>'
            )
            continue
        for t in cards:
            items = []
            for i, ins in enumerate(t["insights"], 1):
                tactics = ", ".join(ins.get("mitre_attack_tactics") or []) or "--"
                risk = ins.get("risk_score")
                summary = (ins.get("summary_markdown") or "").strip()
                if len(summary) > 220:
                    summary = summary[:217] + "..."
                items.append(
                    f'<li><span class="t">{html.escape(str(ins.get("title") or f"insight {i}"))}</span>'
                    f'<span class="meta">risk {html.escape(str(risk))} &middot; {html.escape(tactics)}</span>'
                    f'<div class="sum">{html.escape(summary)}</div></li>'
                )
            blocks.append(
                f'<details class="tcard"><summary>{html.escape(m["modelId"])} &mdash; '
                f'{t["insightCount"]} insights '
                f'<span class="dim">exec <code>{html.escape(t["executionId"][:16])}&hellip;</code> '
                f'trace <code>{html.escape((t.get("traceId") or "")[:16])}&hellip;</code></span></summary>'
                f'<ul class="ins">{" ".join(items)}</ul></details>'
            )
    return "\n".join(blocks)


CSS = """
body{background:#0b0e14;color:#e6e6e6;font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;margin:0;padding:32px}
h1{font-size:22px;margin:0 0 4px}
.sub{color:#9aa4b2;margin-bottom:20px}
table{border-collapse:collapse;width:100%;max-width:1100px}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid #1e2430}
th{color:#9aa4b2;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.model{font-family:ui-monospace,Menlo,monospace;color:#7dd3fc}
.n{color:#5b6472;font-size:11px;margin-left:6px}
.na{color:#5b6472}
.ok{color:#4ade80}.warn{color:#fbbf24}.bad{color:#f87171}
.dim{color:#5b6472}
.err{color:#f87171;font-size:12px}
tr.errrow td{border-bottom:1px solid #1e2430;padding-top:0}
.disc{background:#141a24;border-left:3px solid #fbbf24;padding:14px 18px;margin:22px 0;max-width:1100px;border-radius:4px}
.disc h2{font-size:13px;margin:0 0 8px;text-transform:uppercase;color:#fbbf24;letter-spacing:.04em}
.disc li{margin:4px 0;color:#c7cdd6}
code{background:#1e2430;padding:1px 5px;border-radius:3px;font-size:12px}
h2.sec{font-size:14px;margin:26px 0 10px;color:#9aa4b2;text-transform:uppercase;letter-spacing:.04em}
table.sources td{font-size:13px;color:#c7cdd6;vertical-align:top}
table.sources td.src-col{color:#7dd3fc;font-weight:600;width:170px;white-space:nowrap}
tr.missing td{color:#5b6472;font-style:italic}
tr.missing td.model{color:#6b7480;font-style:normal}
.tcard{background:#141a24;border:1px solid #1e2430;border-radius:4px;margin:8px 0;max-width:1100px}
.tcard summary{padding:10px 14px;cursor:pointer;font-family:ui-monospace,Menlo,monospace;color:#7dd3fc;font-size:13px}
.tcard.empty{padding:10px 14px;color:#6b7480;font-size:13px}
.tcard .thead{font-family:ui-monospace,Menlo,monospace}
.ins{list-style:none;margin:0;padding:4px 14px 12px}
.ins li{margin:8px 0;padding-bottom:8px;border-bottom:1px solid #1e2430}
.ins .t{color:#e6e6e6;font-weight:600;display:block}
.ins .meta{color:#9aa4b2;font-size:12px;display:block;margin:2px 0}
.ins .sum{color:#c7cdd6;font-size:12px}
"""


# Criterion 1: every column states exactly where its number comes from, so a
# reader never has to guess whether a value was measured, derived, or missing.
COLUMN_SOURCES = [
    ("Model", "<code>task.model.id</code> from the golden score documents."),
    ("Status", "<code>task.output.raw.status</code> &mdash; the product-level attack-discovery generate result."),
    ("Discoveries", "count of <code>task.output.insights</code> (the final AD answer), once per execution."),
    ("Alerts in context", "<code>task.output.raw.alerts_context_count</code> (input volume, 95-alert corpus)."),
    ("Gen latency", "<code>task.output.raw.latency_ms</code> &mdash; the <code>_generate</code> call wall clock, ms &rarr; s."),
    ("Rubric", "mean score of the <code>AttackDiscoveryRubric</code> evaluator (Gemini 3.1 Pro judge)."),
    ("Total risk", "no per-board aggregate field exists in our schema; always blank."),
    ("Docs", "count of scored documents contributing to that row."),
]


def render_missing_rows(missing):
    """Reference/board-candidate models absent from our data are shown as
    explicitly missing. Their cells stay blank -- never filled by hand."""
    if not missing:
        return ""
    cells = "\n".join(
        "<tr class='missing'>"
        f'<td class="model">{html.escape(m["model"])}</td>'
        f'<td colspan="7"><span class="na">{html.escape(m["reason"])}</span></td>'
        "</tr>"
        for m in missing
    )
    return cells


def render(agg, source_note, missing_models=(), disclosure_extra=""):
    rows = build_rows(agg["models"])
    absent = agg["absentFields"]
    absent_html = (
        "".join(f"<li><code>{html.escape(f)}</code> has no source field in our golden schema; "
                "every cell renders <code>--</code>. Never imputed.</li>" for f in absent)
        or "<li>All reference columns were recovered from our data.</li>"
    )
    ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    sources_html = "\n".join(
        f"<tr><td class='src-col'>{name}</td><td>{desc}</td></tr>"
        for name, desc in COLUMN_SOURCES
    )
    missing_html = render_missing_rows(missing_models)
    cards = trace_cards(agg["models"])
    return f"""<!doctype html><meta charset="utf-8">
<title>Attack Discovery -- golden results</title><style>{CSS}</style>
<h1>Attack Discovery &mdash; model board</h1>
<div class="sub">{agg['modelCount']} models &middot; {agg['sourceDocCount']} scored documents &middot;
suite <code>{html.escape(agg['suiteId'])}</code> &middot; rendered {ts}</div>

<div class="disc"><h2>What this board is</h2><ul>
<li><strong>Real corpus, real product API.</strong> Every run restores the
<code>oh-my-malware-95-deduped</code> GCS snapshot (95 alerts) and drives the production
attack-discovery <code>_generate</code> API against it. No synthetic seeds, no scenario fixtures.</li>
<li><strong>Judge:</strong> <code>eis-google-gemini-3-1-pro</code> (Gemini 3.1 Pro) via the
<code>AttackDiscoveryRubric</code> evaluator. The judge never scores its own generation
(it is excluded from the candidate set).</li>
<li>Each mean carries its own <code>n</code>. A model with one execution shows n=1 &mdash;
this is a single-shot sweep, not a multi-rep average.</li>
<li>Trace cards below the table carry the final answer per execution: every insight title,
risk, MITRE tactics and summary excerpt, straight from <code>task.output.insights</code>.</li>
{disclosure_extra}
{absent_html}
<li>Source: {html.escape(source_note)}</li>
</ul></div>

<h2 class="sec">Where each column comes from</h2>
<table class="sources"><tbody>
{sources_html}
</tbody></table>

<h2 class="sec">Results</h2>
<table><thead><tr>
<th>Model</th><th>Status</th><th>Discoveries</th><th>Alerts in context</th>
<th>Gen latency</th><th>Rubric</th><th>Total risk</th><th>Docs</th>
</tr></thead><tbody>
{rows}
{missing_html}
</tbody></table>

<h2 class="sec">Final answers &mdash; trace cards per execution</h2>
{cards}
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--aggregate", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--missing", help="JSON list of {model, reason} rows to show as explicitly absent")
    args = ap.parse_args()

    agg = json.load(open(args.aggregate))
    if not agg.get("models"):
        sys.exit("aggregate has no models -- refusing to render an empty board")
    if all(m["discoveryCount"]["mean"] is None for m in agg["models"]):
        sys.exit("no model carries a discoveryCount -- refusing to render a vacuous board")

    missing_models = []
    if args.missing:
        missing_models = json.load(open(args.missing))
        if not isinstance(missing_models, list) or not all(
            isinstance(x, dict) and "model" in x and "reason" in x for x in missing_models
        ):
            sys.exit("--missing must be a JSON list of {model, reason} objects")

    html_out = render(
        agg,
        f"golden ES, suite_id={agg['suiteId']}, {agg['sourceDocCount']} docs",
        missing_models=missing_models,
    )
    with open(args.out, "w") as fh:
        fh.write(html_out)
    print(f"wrote {args.out} ({len(html_out)} bytes, {agg['modelCount']} models, "
          f"{len(missing_models)} listed as missing)")


if __name__ == "__main__":
    main()
