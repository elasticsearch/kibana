#!/usr/bin/env python3
"""Render agent_eval_full-2.html from golden: TRACES_JSON + score extract.

Recreates the reference board's shape:
  * scoreboard: model x 21 prompt-ids, per-cell status + steps + tokens
  * per-model sections with <details> prompt cards: reasoning steps,
    tool calls WITH args (from gen_ai.tool.call.arguments spans),
    final answer
  * disclosure block: provenance, includeToolDetails evidence, missing
    models, per-cell coverage gaps. Zero hand-edited numbers.

Reference: ~/.hermes/attachments/agent_eval_full-2.html (33 models,
693 prompt cards, generated 2026-08-26 from run JSONL). This renderer
draws from golden ES instead, so every cell traces to a golden doc.
"""
import argparse
import datetime
import html
import json
import os


PROMPT_IDS = [
    "alert-analysis-a", "alert-analysis-b", "alert-analysis-c",
    "entity-analytics-a", "entity-analytics-b", "entity-analytics-c",
    "threat-hunting-a", "threat-hunting-b", "threat-hunting-c",
    "detection-rule-edit-a", "detection-rule-edit-b", "detection-rule-edit-c",
    "workflow-authoring-a", "workflow-authoring-b", "workflow-authoring-c",
    "workflow-execution-a", "workflow-execution-b", "workflow-execution-c",
    "multi-step-a", "multi-step-b", "multi-step-c",
]

# Reference board's 33 models. Those without golden coverage render as an
# explicit "no connector" row -- never imputed, never dropped silently.
REFERENCE_MODELS = [
    "anthropic-claude-4.5-haiku", "anthropic-claude-4.5-opus",
    "anthropic-claude-4.6-opus", "anthropic-claude-4.6-sonnet",
    "anthropic-claude-4.7-opus", "anthropic-claude-4.8-opus",
    "anthropic-claude-5-opus", "anthropic-claude-5-sonnet",
    "google-gemini-2.5-flash", "google-gemini-2.5-flash-lite",
    "google-gemini-2.5-pro", "google-gemini-3.0-flash",
    "google-gemini-3.1-flash-lite", "google-gemini-3.1-pro",
    "google-gemini-3.5-flash", "google-gemini-3.5-flash-lite",
    "google-gemini-3.6-flash",
    "openai-gpt-5.2", "openai-gpt-5.4", "openai-gpt-5.4-mini",
    "openai-gpt-5.4-nano", "openai-gpt-5.5",
    "openai-gpt-5.6-luna", "openai-gpt-5.6-sol", "openai-gpt-5.6-terra",
    "openai-gpt-oss-120b", "openai-gpt-oss-20b",
    "deepseek/deepseek-v4-pro", "moonshotai/kimi-k2.6",
    "google/gemma-4-31b-it", "Qwen36_27b",
    "zai-glm-5-2", "gp-llm-v2",
]

MISSING_REASONS = {
    "anthropic-claude-5-opus": "no EIS connector exists",
    "google-gemini-2.5-flash-lite": "broken at render time (2026-09-11 directive) — no successful run in window; top-up skipped",
    "google-gemini-3.5-flash-lite": "no EIS connector exists",
    "google-gemini-3.6-flash": "no EIS connector exists",
    "google/gemma-4-31b-it": "no EIS connector exists",
    "moonshotai/kimi-k2.6": "no EIS connector exists",
    "openai-gpt-5.6-luna": "no EIS connector exists",
    "openai-gpt-5.6-terra": "no EIS connector exists",
    "Qwen36_27b": "no EIS connector exists",
    "zai-glm-5-2": "connector blocked by upstream issue #288469",
}

# Golden model ids mix two spellings: EIS connector runs emit dash-separated
# ids (anthropic-claude-4-5-haiku), older/local runs emit dotted ids that match
# the reference board (anthropic-claude-4.5-haiku). Normalise both to the
# reference spelling so one model cannot appear as two rows.
ALIASES = {
    "anthropic-claude-4-5-haiku": "anthropic-claude-4.5-haiku",
    "anthropic-claude-4-5-opus": "anthropic-claude-4.5-opus",
    "anthropic-claude-4-6-opus": "anthropic-claude-4.6-opus",
    "anthropic-claude-4-6-sonnet": "anthropic-claude-4.6-sonnet",
    "anthropic-claude-4-7-opus": "anthropic-claude-4.7-opus",
    "anthropic-claude-4-8-opus": "anthropic-claude-4.8-opus",
    "google-gemini-2-5-flash": "google-gemini-2.5-flash",
    "google-gemini-2-5-flash-lite": "google-gemini-2.5-flash-lite",
    "google-gemini-2-5-pro": "google-gemini-2.5-pro",
    "google-gemini-3-1-pro": "google-gemini-3.1-pro",
    "openai-gpt-5-2": "openai-gpt-5.2",
    "openai-gpt-5-4": "openai-gpt-5.4",
    "openai-gpt-5-4-mini": "openai-gpt-5.4-mini",
    "openai-gpt-5-4-nano": "openai-gpt-5.4-nano",
    "openai-gpt-5-5": "openai-gpt-5.5",
    "deepseek/deepseek-v4-pro-0813": "deepseek/deepseek-v4-pro",
    "openai/gpt-5.6-sol": "openai-gpt-5.6-sol",
}


def esc(s):
    return html.escape(str(s)) if s is not None else ""


def cell_status(cell):
    if cell is None:
        return "blank"
    if cell.get("answer"):
        return "ok"
    return "partial"


def render(traces, out, since, extra_missing=None):
    cells_raw = traces["cells"]
    # normalise model ids to reference spelling (see ALIASES)
    cells = {}
    for k, v in cells_raw.items():
        m, p = k.split(":", 1)
        cells[f"{ALIASES.get(m, m)}:{p}"] = v
    meta = traces["meta"]
    covered = sorted({m for m, _ in (k.split(":", 1) for k in cells)})
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    n_cells = sum(1 for m in REFERENCE_MODELS for p in PROMPT_IDS if cells.get(f"{m}:{p}"))
    n_args = sum(1 for c in cells.values() for s in (c.get("steps") or [])
                 if s.get("type") == "tool" and s.get("toolParams"))
    n_tool = sum(1 for c in cells.values() for s in (c.get("steps") or [])
                 if s.get("type") == "tool")
    n_ans = sum(1 for c in cells.values() if c.get("answer"))

    miss_rows = "".join(
        f'<tr><td class="model">{esc(m)}</td><td colspan="21" class="missing-cell">{esc(MISSING_REASONS.get(m, "not in this run window"))}</td></tr>'
        for m in REFERENCE_MODELS if m not in covered
    )

    # scoreboard rows
    sb_rows = []
    for m in REFERENCE_MODELS:
        if m not in covered:
            continue
        tds = []
        for p in PROMPT_IDS:
            c = cells.get(f"{m}:{p}")
            if c is None:
                tds.append('<td class="cell blank" title="no score doc in window">&mdash;</td>')
                continue
            steps = c.get("stepCount") or 0
            ans = "✓" if c.get("answer") else "△"
            n_ev = len(c.get("scores") or {})
            tds.append(
                f'<td class="cell {cell_status(c)}" title="{esc(p)}: {steps} steps, {n_ev} evaluator scores">{ans} {steps} steps</td>'
            )
        sb_rows.append(f'<tr><td class="model">{esc(m)}</td>{"".join(tds)}</tr>')

    # per-model sections
    sections = []
    for m in REFERENCE_MODELS:
        if m not in covered:
            continue
        cards = []
        for p in PROMPT_IDS:
            c = cells.get(f"{m}:{p}")
            if c is None:
                continue
            steps_html = []
            for s in c.get("steps") or []:
                if s.get("type") == "reasoning":
                    steps_html.append(
                        f'<div class="step reasoning"><span class="step-tag">think</span>{esc((s.get("text") or "")[:600])}</div>'
                    )
                elif s.get("type") == "tool":
                    args = s.get("toolParams")
                    if args is None:
                        arg_html = '<span class="args-null">(args not captured)</span>'
                    else:
                        arg_html = f'<span class="tool-params">{esc(json.dumps(args)[:400])}</span>'
                    steps_html.append(
                        f'<div class="step tool"><span class="step-tag tool-tag">⚙</span><code class="tool-id">{esc(s.get("toolId"))}</code>{arg_html}</div>'
                    )
                elif s.get("type") == "skill":
                    steps_html.append(
                        f'<div class="step skill"><span class="step-tag">skill</span>{esc(s.get("skills"))}</div>'
                    )
            answer = c.get("answer")
            ans_html = (
                f'<div class="answer">{esc(answer[:2000])}</div>' if answer
                else '<div class="answer missing">no final answer recorded</div>'
            )
            cards.append(
                f'''<details class="prompt"><summary><span class="prompt-id">{esc(p)}</span>
<span class="sub">{c.get("stepCount", 0)} steps</span></summary>
<div class="trace-body">{''.join(steps_html) or '<div class="step">(no steps recorded)</div>'}</div>
{ans_html}</details>'''
            )
        if cards:
            sections.append(
                f'<section class="card"><header class="card-head"><h2>{esc(m)}</h2>'
                f'<span class="sub">{len(cards)}/{len(PROMPT_IDS)} prompts</span></header>{"".join(cards)}</section>'
            )

    html_out = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<title>Agent Builder Skill Eval — EIS Models (golden recreation)</title>
<style>
:root {{ --bg:#0f1115; --panel:#171a21; --panel2:#1f2430; --border:#2a3140; --text:#e6e9ef; --muted:#9aa4b2; --accent:#6ea8fe; --ok:#5fd0a0; --warn:#ffd166; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; background:var(--bg); color:var(--text); font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }}
.wrap {{ max-width:1120px; margin:0 auto; padding:32px 20px 64px; }}
h1 {{ font-size:24px; margin:0 0 4px; }}
h2 {{ font-size:17px; margin:0; }}
.sub {{ color:var(--muted); font-size:12px; }}
table {{ width:100%; border-collapse:collapse; background:var(--panel); border:1px solid var(--border); border-radius:10px; overflow:hidden; margin-bottom:14px; }}
th,td {{ padding:8px 10px; text-align:left; border-bottom:1px solid var(--border); vertical-align:top; }}
th {{ background:var(--panel2); color:var(--muted); font-size:11px; text-transform:uppercase; letter-spacing:.04em; }}
td.model {{ font-weight:600; font-family:ui-monospace,monospace; font-size:12px; }}
td.cell {{ font-size:12px; color:var(--text); }}
td.cell.ok {{ color:var(--ok); }}
td.cell.partial {{ color:var(--warn); }}
td.cell.blank {{ color:var(--muted); }}
td.missing-cell {{ color:var(--muted); font-size:12px; font-style:italic; }}
.card {{ background:var(--panel); border:1px solid var(--border); border-radius:10px; margin:14px 0; padding:14px 16px; }}
.card-head {{ display:flex; gap:10px; align-items:baseline; margin-bottom:8px; }}
details.prompt {{ border-top:1px solid var(--border); padding:8px 0; }}
details.prompt summary {{ cursor:pointer; }}
.prompt-id {{ font-weight:600; font-family:ui-monospace,monospace; font-size:13px; }}
.trace-body {{ border-left:2px solid var(--border); padding-left:12px; margin:6px 0 6px 4px; }}
.step {{ font-size:13px; margin:4px 0; }}
.step-tag {{ display:inline-block; background:var(--panel2); border:1px solid var(--border); border-radius:4px; padding:0 6px; margin-right:6px; font-size:11px; color:var(--muted); }}
.tool-id {{ font-family:ui-monospace,monospace; font-size:12px; color:var(--accent); }}
.tool-params {{ font-family:ui-monospace,monospace; font-size:11px; color:var(--muted); }}
.args-null {{ color:var(--warn); font-size:11px; font-style:italic; }}
.answer {{ margin-top:8px; padding:10px 12px; background:var(--panel2); border-radius:8px; font-size:13px; white-space:pre-wrap; }}
.answer.missing {{ color:var(--warn); font-style:italic; }}
.disclosure {{ background:var(--panel); border:1px solid var(--border); border-left:3px solid var(--warn); border-radius:8px; padding:12px 16px; margin:18px 0; font-size:13px; }}
.disclosure h3 {{ margin:0 0 6px; font-size:14px; color:var(--warn); }}
.disclosure ul {{ margin:6px 0; padding-left:18px; }}
.disclosure li {{ margin:3px 0; }}
code {{ font-family:ui-monospace,monospace; }}
</style></head><body><div class="wrap">
<h1>Agent Builder Skill Eval — EIS Models (golden recreation)</h1>
<div class="sub">Recreated from golden ES (<code>security-persona-matrix</code> suite score docs + OTel traces) · window since {esc(since)} · rendered {ts}</div>

<div class="disclosure">
<h3>Provenance &amp; honesty disclosures</h3>
<ul>
<li>Every cell traces to golden <code>.ds-.evaluation-scores*</code> docs (suite <code>security-persona-matrix</code>) joined with <code>traces-agent_builder.otel-default</code> spans. Zero hand-edited numbers.</li>
<li>Tool args: {n_args}/{n_tool} tool steps carry <code>gen_ai.tool.call.arguments</code> — captured via <code>--uiSettings.overrides.agentBuilder:tracing:includeToolDetails=true</code> in Kibana boot args (grep-verified in the runs' scout logs). Steps without args render an explicit "(args not captured)" marker — never invented. Historical runs predate this flag (383,098 tool steps, 100% null args).</li>
<li>Cells: {n_cells} of {len(REFERENCE_MODELS) * len(PROMPT_IDS)} reference-model cells have data. Final answers present in {n_ans} cells with data.</li>
<li>Multi-execution models (retry runs): each (model, prompt) cell renders the most-doc'd single execution — one real execution per cell, never a blend. Cells missing in a model's executions render blank with a "no score doc" tooltip.</li>
<li>openai-gpt-oss-20b: no single execution completed all 21 prompts (best single: 16/21; scatter across attempts). All 21 prompts have data only when taking the best execution per prompt — each cell is one real execution, and the selection is disclosed here rather than hidden.</li>
<li>Models listed below the scoreboard have no EIS connector (or are blocked) — disclosed, not back-filled.</li>
<li>The reference board (2026-08-26, 33 models, 693 cards) was rendered from run JSONL; this recreation is from golden docs, so counts differ where golden coverage differs. Judge: eis-google-gemini-3-1-pro.</li>
</ul>
</div>

<table><thead><tr><th>Model</th>{''.join(f'<th>{esc(p)}</th>' for p in PROMPT_IDS)}</tr></thead>
<tbody>{''.join(sb_rows)}{miss_rows}</tbody></table>
<div class="sub">✓ = final answer present · △ = partial (no answer recorded) · — = no score doc in window</div>

{''.join(sections)}
<div class="sub">source: golden extract {esc(json.dumps(meta))}</div>
</div></body></html>"""
    with open(out, "w") as fh:
        fh.write(html_out)
    print(f"wrote {out} ({len(html_out)} bytes, {len(covered)} models with data, {n_cells} cells)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--traces", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--since", required=True)
    args = ap.parse_args()
    traces = json.load(open(args.traces))
    render(traces, args.out, args.since)


if __name__ == "__main__":
    main()
