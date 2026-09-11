#!/usr/bin/env python3
"""Render the connector false-green bug report from the measurement JSON.

Every number comes from connector_false_green.json, so the report cannot
drift from the measurement it describes.
"""
import argparse
import html
import json

CSS = """
:root { color-scheme: dark; }
body { background:#0b0e14; color:#d7dce5; font:15px/1.65 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
       max-width:900px; margin:0; padding:32px 28px; }
h1 { font-size:24px; margin:0 0 4px; color:#fff; }
h2 { font-size:17px; margin:30px 0 10px; color:#fff; border-bottom:1px solid #232833; padding-bottom:6px; }
.sub { color:#8b94a7; font-size:13px; margin-bottom:22px; }
code { background:#151a23; border:1px solid #232833; border-radius:4px; padding:1px 5px;
       font:13px ui-monospace,SFMono-Regular,Menlo,monospace; color:#9ecbff; }
pre { background:#151a23; border:1px solid #232833; border-left:3px solid #4a9eff; border-radius:5px;
      padding:12px 14px; overflow-x:auto; font:12.5px ui-monospace,SFMono-Regular,Menlo,monospace; color:#c8d1e0; }
table { border-collapse:collapse; width:100%; margin:14px 0; font-size:14px; }
th,td { border:1px solid #232833; padding:7px 10px; text-align:left; }
th { background:#151a23; color:#fff; font-weight:600; }
td.n { text-align:right; font-variant-numeric:tabular-nums; }
.bad { color:#ff7b72; font-weight:600; }
.ok { color:#7ee787; }
.callout { background:#1a1410; border-left:3px solid #d29922; border-radius:5px; padding:12px 16px; margin:16px 0; }
.callout.imp { background:#101a14; border-left-color:#3fb950; }
li { margin:5px 0; }
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--measurement", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()

    d = json.load(open(args.measurement))
    scan, s, per = d["scan"], d["summary"], d["perModel"]
    pct = 100.0 * s["falseGreen"] / max(1, s["expectedToolCalledPass"] + s["falseGreen"] - s["reallyTargetsConnector"])

    rows = "\n".join(
        f'<tr><td><code>{html.escape(r["model"])}</code></td>'
        f'<td class="n">{r["real"]}/{r["total"]}</td>'
        f'<td class="n {"bad" if r["rate"] < 20 else ""}">{r["rate"]:.1f}%</td></tr>'
        for r in per
    )

    doc = f"""<!doctype html><meta charset="utf-8">
<title>ExpectedToolCalled scores tool identity, not tool effect</title>
<style>{CSS}</style>
<h1>ExpectedToolCalled scores tool identity, not tool effect</h1>
<div class="sub">Agent Builder &middot; workflow-authoring evaluation &middot;
measured against golden ES over {scan['docsScanned']} scored documents</div>

<h2>Summary</h2>
<p>Cells that ask a model to author a workflow targeting a Slack connector score
<strong>1.0</strong> on <code>ExpectedToolCalled</code> whenever the model calls
<code>generate_workflow</code> &mdash; regardless of whether the workflow it produced
targets the connector, or any connector at all.</p>

<div class="callout">
<strong>{s['falseGreen']} false greens.</strong>
{s['expectedToolCalledPass']} cells score 1.0, but only
<span class="ok">{s['reallyTargetsConnector']}</span> author a real
<code>type: http</code> step pointing at the expected connector id.
</div>

<h2>Root cause</h2>
<p>The evaluator maps tool-call steps to their <code>tool_id</code> and asserts the
required ids appear. Arguments and output are never inspected:</p>
<pre>export const getUsedToolIds = (output: TaskOutput): string[] =&gt;
  getToolCallSteps(output)
    .map((toolCall) =&gt; toolCall.tool_id)
    .filter((toolId): toolId is string =&gt; Boolean(toolId));

const missingToolIds = requiredToolIds.filter((id) =&gt; !usedToolIds.includes(id));

return {{ score: missingToolIds.length === 0 ? 1 : 0, ... }};</pre>
<p><code>x-pack/platform/packages/shared/kbn-evals-suite-alerting-v2/src/evaluators/expected_tool_called.ts</code></p>
<p>This is correct for its stated purpose &mdash; it answers &ldquo;was this tool
called?&rdquo;. The defect is that workflow-authoring cells rely on it to answer
&ldquo;did the model wire up the connector?&rdquo;, which it cannot.</p>

<h2>Evidence</h2>
<ul>
<li><strong>Positive control:</strong> {scan['positiveControlDocsMentioningSlack']} scanned
documents mention Slack, so the scan detects the signal it looks for. This is not a null instrument.</li>
<li><strong>{scan['slackRelatedCells']}</strong> distinct Slack-related cells examined.</li>
<li><strong>{s['cellsWithoutHttpStep']}</strong> cells produced no <code>type: http</code> step at all.</li>
<li><strong>{s['cellsGivenIdButOmittedIt']}</strong> cell was handed a connector id and still omitted it.</li>
</ul>

<h2>Per-model rate of actually targeting the connector</h2>
<table><thead><tr><th>Model</th><th>Real</th><th>Rate</th></tr></thead>
<tbody>
{rows}
</tbody></table>

<div class="callout">
<strong>Sampling caveat.</strong> {html.escape(scan['caveat'])}
Treat per-model rates as indicative of the gap, not as a certified leaderboard.
</div>

<h2>Suggested fix</h2>
<p>A deterministic <code>ConnectorInvoked</code> evaluator that parses the authored
workflow YAML and asserts the expected connector id appears in a <code>type: http</code>
step. Implemented and unit-tested on
<code>feat/evals-extensions-matrix-v3</code>; removing the Slack step from the fixture
flips its score from 1 to 0, while <code>ExpectedToolCalled</code> stays at 1.0 &mdash;
which is precisely the gap.</p>

<div class="callout imp">
<strong>Why this matters beyond one suite.</strong> Any capability scored by
&ldquo;was the tool called&rdquo; inherits this weakness. The tool-call step is evidence
of an attempt, not of an effect. Where the effect is what the capability claims,
the assertion has to read the artifact the model produced.
</div>
"""
    with open(args.out, "w") as fh:
        fh.write(doc)
    print(f"wrote {args.out} ({len(doc)} bytes, {len(per)} models)")


if __name__ == "__main__":
    main()
