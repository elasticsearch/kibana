/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Matrix, MatrixRow, MatrixDisplayColumn, TokenCostModel } from './build_matrix';
import type { MatrixColumnConfig, MatrixConfig } from './load_matrix_config';
import type { MatrixProvenance } from './render_matrix';
import type { MatrixTraceData, MatrixTraceEntry, TraceStep } from './trace_types';
import { traceKey } from './trace_types';

/** CSS copied from the reference agent_eval_smoke.html report. */
const REPORT_CSS = `
  :root {
    --bg:#0f1115; --panel:#171a21; --panel2:#1f2430; --border:#2a3140;
    --text:#e6e9ef; --muted:#9aa4b2; --accent:#6ea8fe;
    --ok:#5fd0a0; --err:#ff5d6c; --warn:#ffd166;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; }
  .wrap { max-width:1120px; margin:0 auto; padding:32px 20px 64px; }
  h1 { font-size:24px; margin:0 0 4px; }
  .sub { color:var(--muted); margin:0 0 24px; font-size:13px; }
  a { color:var(--accent); }
  table { width:100%; border-collapse:collapse; background:var(--panel);
    border:1px solid var(--border); border-radius:10px; overflow:hidden; margin-bottom:14px; }
  th,td { padding:10px 13px; text-align:left; border-bottom:1px solid var(--border);
    vertical-align:top; }
  th { background:var(--panel2); color:var(--muted); font-size:12px;
    text-transform:uppercase; letter-spacing:.04em; }
  tr:last-child td { border-bottom:none; }
  td.num { text-align:center; color:var(--muted); }
  td.model { font-weight:600; min-width:160px; }
  .model-id { color:var(--muted); font-weight:400; font-size:12px; font-family:ui-monospace,monospace; }
  .coverage { color:var(--muted); font-weight:400; font-size:12px; font-family:ui-monospace,monospace; }
  .coverage.partial { color:var(--warn); font-weight:600; }
  td.cell { font-size:13px; }
  td.cell.ok { color:var(--text); }
  td.cell.err { color:var(--err); font-weight:600; }
  .ok-dot { color:var(--ok); font-weight:700; }
  .sub-num { color:var(--muted); font-size:11px; }
  .legend { color:var(--muted); font-size:12px; margin:4px 0 30px; }
  details.methodology { margin:10px 0 14px; }
  details.methodology summary { cursor:pointer; color:var(--muted); font-size:13px; }
  details.methodology ul { margin:8px 0 0; padding-left:20px; color:var(--muted); font-size:13px; }
  .status { padding:2px 9px; border-radius:20px; font-size:12px; font-weight:600; flex:none; }
  .status.ok { background:rgba(95,208,160,.15); color:var(--ok); }
  .status.err { background:rgba(255,93,108,.15); color:var(--err); }
  .card { background:var(--panel); border:1px solid var(--border);
    border-radius:12px; padding:18px 20px; margin-bottom:22px; }
  .card-head { display:flex; align-items:baseline; justify-content:space-between;
    gap:12px; flex-wrap:wrap; margin-bottom:6px; }
  .card-head h2 { font-size:18px; margin:0; }
  .meta { color:var(--muted); font-size:13px; display:flex; gap:8px; flex-wrap:wrap; }
  details.prompt { border:1px solid var(--border); border-radius:9px;
    margin-top:10px; background:var(--panel2); }
  details.prompt > summary { list-style:none; cursor:pointer; padding:11px 14px;
    display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  details.prompt > summary::-webkit-details-marker { display:none; }
  .prompt-id { font-weight:600; font-family:ui-monospace,monospace; font-size:13px; }
  .skill-chip { font-size:11px; background:rgba(110,168,254,.14); color:var(--accent);
    border:1px solid rgba(110,168,254,.25); padding:2px 9px; border-radius:20px; flex:none; }
  .p-meta { color:var(--muted); font-size:12px; margin-left:auto; flex:none; }
  .prompt-body { padding:4px 16px 16px; border-top:1px solid var(--border); }
  .tool-trail { font-size:12px; color:var(--muted); margin:10px 0; }
  .tool-trail code { white-space:normal; }
  .question { background:rgba(110,168,254,.08); padding:10px 14px; border-radius:8px;
    margin:8px 0; border-left:3px solid var(--accent); }
  .question::before { content:"💬 Initial User Question: "; font-weight:600; color:var(--accent); }
  .answer { background:var(--panel); border:1px solid var(--border); border-radius:8px;
    padding:4px 16px; margin:8px 0; }
  .answer h3 { font-size:17px; } .answer h4 { font-size:15px; } .answer h5,.answer h6 { font-size:13px; }
  .answer table.md { margin:10px 0; font-size:13px; }
  .answer table.md th { text-transform:none; letter-spacing:0; }
  .answer table.md td, .answer table.md th { border:1px solid var(--border); padding:4px 8px; text-align:left; }
  .answer table.md th { background:var(--panel2); }
  .answer table.md tbody tr:nth-child(odd) { background:rgba(255,255,255,0.02); }
  .answer blockquote { margin:8px 0; padding:2px 12px; border-left:3px solid var(--accent); color:var(--muted, #9aa4b2); }
  .answer pre { background:#0b0d12; border:1px solid var(--border); border-radius:7px;
    padding:11px 13px; overflow:auto; }
  .answer pre code { background:none; padding:0; color:#cdd3dd; }
  .answer hr { border:none; border-top:1px solid var(--border); margin:14px 0; }
  details.trace { margin:8px 0 4px; }
  details.trace summary { cursor:pointer; color:var(--muted); font-size:13px; padding:6px 0; }
  .trace-body { border-left:2px solid var(--border); padding-left:12px; margin:6px 0 6px 4px; }
  .step { font-size:12.5px; margin:5px 0; display:flex; gap:8px; align-items:baseline; }
  .step-tag { flex:none; font-size:10px; text-transform:uppercase; letter-spacing:.05em;
    color:var(--muted); }
  /* Text tags (SKILL/THINK) reserve a real column so they never overlap the
     paragraph; numbered tool badges keep their own 18px circle via .tool-tag. */
  .step.reasoning .step-tag { min-width:44px; }
  .step.reasoning { color:#bcc4d2; }
  .step.tool { color:var(--text); }
  .step-text { flex:1; min-width:0; }
  .step-text code { display:inline; white-space:normal; font-size:11.5px;
    vertical-align:baseline; }
  .tool-tag { width:18px; height:18px; border-radius:50%; background:var(--border);
    color:var(--text); display:inline-grid; place-items:center; font-size:10px; font-weight:700; }
  .tool-id { color:#ffd9a8; }
  .tool-params { color:var(--muted); font-family:ui-monospace,monospace; font-size:11.5px; }
  code { background:rgba(255,255,255,.07); padding:1px 5px; border-radius:5px;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:13px; color:#ffd9a8; }
  .empty { color:var(--muted); font-style:italic; padding:8px 0; }
`;

/** Escape HTML special characters. */
const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');

/** Convert inline markdown (bold, code, links) to HTML. Input must be HTML-escaped already. */
const inlineMd = (s: string): string =>
  s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, url: string) =>
      // Only allow http(s) links — the markdown source is untrusted model
      // output, and escaped schemes like `javascript:` still execute.
      // Whitespace must also be rejected: the URL is interpolated into the
      // href unquoted-adjacent, so `https://e.com onmouseover=...` would
      // otherwise smuggle an event handler into the tag.
      /^https?:\/\/\S*$/i.test(url) ? `<a href="${url}">${text}</a>` : text
    );

const splitTableRow = (line: string): string[] =>
  line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());

/**
 * Minimal markdown → HTML (headings, lists, bold, code, hr, blockquotes,
 * pipe tables). Input is untrusted model output: every text run is
 * HTML-escaped before inline markdown is applied, and tables are only
 * recognized when EVERY row cell is well-formed (never mid-list).
 */
const mdToHtml = (md: string): string => {
  const lines = md.split('\n');
  const out: string[] = [];
  let inUl = false;
  let inNested = false;
  let inOl = false;
  const closeList = () => {
    if (inNested) {
      out.push('</ul></li>');
      inNested = false;
    }
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const indent = line.length - trimmed.length;
    // Fenced code block: ``` ... ``` — content must stay verbatim (ES|QL
    // queries legitimately contain pipes; treating those as tables mangles
    // them). esc() inside <pre><code> keeps untrusted content inert.
    if (trimmed.startsWith('```')) {
      closeList();
      const code: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].trimStart().startsWith('```')) {
        code.push(lines[j]);
        j++;
      }
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      i = j; // skip the closing fence (or EOF)
      continue;
    }
    if (trimmed.startsWith('### ')) {
      closeList();
      // Run heading content through inline markdown too — models emit
      // "### **Bold Heading**" and esc() alone shows literal asterisks.
      out.push(`<h6>${inlineMd(esc(trimmed.slice(4)))}</h6>`);
      continue;
    }
    if (trimmed.startsWith('## ')) {
      closeList();
      out.push(`<h5>${inlineMd(esc(trimmed.slice(3)))}</h5>`);
      continue;
    }
    if (trimmed.startsWith('# ')) {
      closeList();
      out.push(`<h4>${inlineMd(esc(trimmed.slice(2)))}</h4>`);
      continue;
    }
    if (line.startsWith('---')) {
      closeList();
      out.push('<hr>');
      continue;
    }
    // Pipe table: header row, then a |---|---| separator, then body rows.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      /^\|?[\s:-]*-{2,}[\s|:-]*\|/.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      closeList();
      const header = splitTableRow(line);
      let j = i + 2;
      const body: string[][] = [];
      while (j < lines.length && lines[j].includes('|') && lines[j].trim() !== '') {
        body.push(splitTableRow(lines[j]));
        j++;
      }
      out.push('<table class="md"><thead><tr>');
      for (const cell of header) {
        out.push(`<th>${inlineMd(esc(cell))}</th>`);
      }
      out.push('</tr></thead><tbody>');
      for (const row of body) {
        out.push('<tr>');
        for (const cell of row) {
          out.push(`<td>${inlineMd(esc(cell))}</td>`);
        }
        out.push('</tr>');
      }
      out.push('</tbody></table>');
      i = j - 1;
      continue;
    }
    if (/^\d+\.\s/.test(trimmed)) {
      if (!inOl) {
        closeList();
        inOl = true;
      }
      out.push(`<li>${inlineMd(esc(trimmed.replace(/^\d+\.\s/, '')))}</li>`);
      continue;
    }
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (!inUl) {
        closeList();
        inUl = true;
      }
      // Nested sub-bullets (indented "  * item") open a nested <ul> inside the
      // previous <li>. The old untrimmed startsWith('* ') check dropped them
      // to <p> paragraphs with a literal asterisk.
      const content = inlineMd(esc(trimmed.slice(2)));
      if (indent >= 2) {
        if (!inNested) {
          // Re-open the previous <li> as a container: strip its closing
          // </li> and start a nested <ul> inside it.
          const last = (out.pop() ?? '<li></li>').replace(/<\/li>$/, '');
          out.push(`${last}<ul>`);
          inNested = true;
        }
        out.push(`<li>${content}</li>`);
      } else {
        if (inNested) {
          out.push('</ul></li>');
          inNested = false;
        }
        out.push(`<li>${content}</li>`);
      }
      continue;
    }
    if (trimmed.startsWith('> ')) {
      closeList();
      out.push(`<blockquote><p>${inlineMd(esc(trimmed.slice(2)))}</p></blockquote>`);
      continue;
    }
    if (line.trim() === '') {
      closeList();
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(esc(line))}</p>`);
  }
  closeList();
  return out.join('\n');
};

const cellHtml = (row: MatrixRow, column: MatrixDisplayColumn): string => {
  const cell =
    column.kind === 'overall' ? row.overall : row.cells[column.id] ?? { kind: 'missing' };
  switch (cell.kind) {
    case 'score':
      // Publish the tie tier next to the Overall number. The tier is what the
      // data supports; the two-decimal score is not -- adjacent rows inside a
      // tier are separated by less than the measured run-to-run noise, so the
      // ordering between them is an artifact of rounding, not a ranking.
      return column.kind === 'overall' && row.tier !== undefined
        ? `<span class="ok-dot">✓</span> ${cell.value} <span class="sub-num" title="Tie tier ${row.tier}: rows sharing a tier are not distinguishable at the measured run-to-run noise level, so their relative order is not meaningful">T${row.tier}</span>`
        : `<span class="ok-dot">✓</span> ${cell.value}`;
    case 'not-recommended':
      return `<span class="status err">⛔ fail</span>`;
    // Distinct from 'missing' (—): scores existed but judge policy rejected all
    // of them. Re-running fills nothing until the judge assignment is fixed.
    case 'excluded':
      return `<span class="status warn" title="${cell.docs} score(s) rejected: ${cell.reason}">⚠ excluded</span>`;
    // Renders the ratio, not a score: the reader must see WHY there is no
    // number, or a thin run silently reads as a missing one.
    case 'insufficient-coverage':
      return `<span class="status warn" title="scored on ${cell.covered} of ${cell.required} required columns — too thin to aggregate">${cell.covered}/${cell.required} cols</span>`;
    // A partial instrument, not a model result. Naming the errored-out
    // evaluators keeps a broken pipeline from reading as a score the model earned.
    case 'insufficient-evaluators':
      return `<span class="status warn" title="evaluator(s) errored on every example and were dropped from the mean: ${cell.evaluators.join(
        ', '
      )} — a score here would rest on the surviving (often saturated) evaluators">⚠ ${cell.evaluators.join(
        ', '
      )} errored</span>`;
    case 'missing':
    default:
      return '<span class="sub-num">—</span>';
  }
};

/**
 * Renders a skill entry as a human label.
 *
 * Agent Builder emits `{ id, name, path, description }` objects; older fixtures use
 * bare strings. Interpolating an object yields `[object Object]`, so normalise here.
 */
const skillLabel = (skill: string | { id?: string; name?: string }): string =>
  typeof skill === 'string' ? skill : skill?.name ?? skill?.id ?? '';

const stepHtml = (step: TraceStep, index: number): string => {
  if (step.type === 'tool') {
    return `<div class="step tool"><span class="step-tag tool-tag">${index}</span><code class="tool-id">${esc(
      step.toolId ?? ''
    )}</code><span class="tool-params">${esc(step.toolParams ?? '')}</span></div>`;
  }
  if (step.type === 'skill') {
    return `<div class="step reasoning"><span class="step-tag">skill</span><span class="step-text">Selected: ${esc(
      (step.skills ?? []).map(skillLabel).filter(Boolean).join(', ')
    )}</span></div>`;
  }
  return `<div class="step reasoning"><span class="step-tag">think</span><span class="step-text">${inlineMd(
    esc(step.text ?? '')
  )}</span></div>`;
};

const renderTokenCost = (matrix: Matrix, config: MatrixConfig): string => {
  if (!matrix.tokenCost || matrix.tokenCost.models.length === 0) return '';
  const columns = matrix.columns; // base columns only
  const fmt = (n?: number) =>
    n === undefined ? '—' : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${Math.round(n)}`;
  const header = `<tr><th>Model</th>${columns
    .map((c) => `<th>${esc(c.label)}</th>`)
    .join('')}<th>Total</th></tr>`;
  const cellFor = (m: TokenCostModel, colId: string) => {
    const cell = m.cells.find((c) => c.columnId === colId);
    if (!cell) return '<td class="cell ok">—</td>';
    const title =
      cell.inputTokens && cell.outputTokens
        ? ` title="in ${Math.round(cell.inputTokens.mean).toLocaleString()} / out ${Math.round(
            cell.outputTokens.mean
          ).toLocaleString()} (min ${Math.round(cell.totalMean).toLocaleString()})"`
        : '';
    return `<td class="cell ok cost"${title}>${fmt(cell.totalMean)}</td>`;
  };
  const rows = matrix.tokenCost.models
    .map((m) => {
      const total = m.cells.reduce((s, c) => s + c.totalMean, 0);
      return `<tr><td class="model">${esc(m.modelLabel)}<br><span class="model-id">${esc(
        m.modelId
      )}</span></td>${columns.map((c) => cellFor(m, c.id)).join('')}<td class="cell ok cost">${fmt(
        total
      )}</td></tr>`;
    })
    .join('');
  return `<details class="methodology tokencost" open><summary>Token cost per (model, column) — input + output means, native units (hover for in/out split)</summary><table class="tokencost"><thead>${header}</thead><tbody>${rows}</tbody></table></details>`;
};

const renderSummaryTable = (matrix: Matrix, config: MatrixConfig): string => {
  const groupedColumns = matrix.displayColumns.map((col) => {
    const source = col.kind === 'overall' ? undefined : config.columns.find((c) => c.id === col.id);
    return { ...col, group: source?.group };
  });
  const hasGroups = groupedColumns.some((col) => col.group);

  const groupHeader = hasGroups
    ? `<tr><th></th>${(() => {
        let html = '';
        let i = 0;
        while (i < groupedColumns.length) {
          const group = groupedColumns[i].group;
          let span = 1;
          while (i + span < groupedColumns.length && groupedColumns[i + span].group === group) {
            span += 1;
          }
          html += group
            ? `<th colspan="${span}">${esc(group)}</th>`
            : `<th colspan="${span}"></th>`;
          i += span;
        }
        return html;
      })()}</tr>`
    : '';

  const header = `${groupHeader}<tr><th>Model</th>${matrix.displayColumns
    .map((c) => `<th>${esc(c.label)}</th>`)
    .join('')}</tr>`;
  const rows = [...matrix.proprietary, ...matrix.openSource]
    .map((row) => {
      // Partial coverage means overall/composites average fewer examples and
      // are not directly comparable to full-coverage rows — warn on any gap.
      const { covered, total } = row.coverage;
      const coverageClass = covered < total ? 'coverage partial' : 'coverage';
      return `<tr><td class="model">${esc(row.modelLabel)}<br><span class="model-id">${esc(
        row.modelId
      )}</span><br><span class="${coverageClass}" title="base columns with a scored run">${covered}/${total}</span></td>${matrix.displayColumns
        .map((col) => `<td class="cell ok">${cellHtml(row, col)}</td>`)
        .join('')}</tr>`;
    })
    .join('');
  return `<table><thead>${header}</thead><tbody>${rows}</tbody></table>`;
};

/**
 * Worst-case spread across repetitions, rendered as a `±` badge.
 *
 * A mean hides volatility — 10/10/10 and 0/10/20 both read as 10 — so the
 * report shows the widest observed swing next to it. Absent for single-rep
 * cells: their stability was never measured, and showing `±0` there would
 * assert a stability nobody tested.
 */
const spreadLabel = (trace?: { spread?: Record<string, number> }): string => {
  const values = Object.values(trace?.spread ?? {});
  if (values.length === 0) {
    return '';
  }
  const worst = Math.max(...values);
  if (worst === 0) {
    return 'stable';
  }
  return `±${worst % 1 === 0 ? worst : worst.toFixed(2)}`;
};

/**
 * Per-prompt score for a trace card, computed from the example's own
 * per-evaluator scores using the column's evaluator semantics (allowlist or
 * global exclusions) and scale. Returns an empty string when the trace
 * carries no score data — the caller falls back to the column aggregate.
 */
const variantScore = (
  trace: MatrixTraceEntry | undefined,
  column: MatrixColumnConfig | undefined,
  config: MatrixConfig
): string => {
  const scores = trace?.scores;
  if (!scores) {
    return '';
  }
  const excluded = config.excludeEvaluators ?? [];
  const allow = column?.evaluators;
  const values = Object.entries(scores)
    .filter(([name]) =>
      allow ? allow.includes(name) : !excluded.some((prefix) => name.startsWith(prefix))
    )
    .map(([, value]) => value);
  if (values.length === 0) {
    return '';
  }
  const scale = column?.scale ?? config.defaultScale ?? 10;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return `score ${(mean * scale).toFixed(config.decimals ?? 2)}`;
};

const renderModelCard = (
  rows: MatrixRow[],
  matrix: Matrix,
  config: MatrixConfig,
  traces?: MatrixTraceData
): string => {
  return rows
    .map((row) => {
      const completed = matrix.displayColumns.filter((col) => {
        const cell = col.kind === 'overall' ? row.overall : row.cells[col.id];
        return cell && cell.kind === 'score';
      }).length;
      const total = matrix.displayColumns.length;

      const prompts = matrix.displayColumns
        .map((col) => {
          const cell =
            col.kind === 'overall' ? row.overall : row.cells[col.id] ?? { kind: 'missing' };
          const status =
            cell.kind === 'score'
              ? '<span class="status ok">completed</span>'
              : cell.kind === 'not-recommended'
              ? '<span class="status err">failed</span>'
              : '<span class="status err">missing</span>';

          const column = config.columns.find((c) => c.id === col.id);
          // Per-VARIANT cards: a category column aggregates a/b/c variants, so
          // render one expandable card per variant that has a trace, not just
          // the first-wins representative. Without this, 2/3 of the suite's
          // 21 prompts are invisible in the report.
          const variantTraces: Array<{ label: string; trace: MatrixTraceEntry | undefined }> = [];
          if (column?.examplePrefixes?.length) {
            for (const p of column.examplePrefixes) {
              for (const suffix of ['-a', '-b', '-c']) {
                const key = traceKey(row.modelId, `${p}${suffix}`);
                if (traces?.[key] !== undefined) {
                  variantTraces.push({ label: `${p}${suffix}`, trace: traces[key] });
                }
              }
            }
          }
          const fallbackTrace =
            traces?.[traceKey(row.modelId, col.id)] ??
            // examplePrefixes columns consume synthetic `prefix:<p>` datasets;
            // resolve the trace for that prefix's own example.
            column?.examplePrefixes
              ?.map((p) => traces?.[traceKey(row.modelId, `prefix:${p}`)])
              .find((t) => t != null) ??
            // Column IDs (e.g. 'alert_triage') don't match suite IDs (e.g.
            // 'security-alert-triage'). Fall back to the current column's
            // configured suite IDs to find the first matching trace.
            column?.suites.map((s) => traces?.[traceKey(row.modelId, s)]).find((t) => t != null);
          // The card body/meta use the per-variant traces when present, else
          // the resolved representative (overall columns have no variants).
          const cards =
            variantTraces.length > 0 ? variantTraces : [{ label: col.id, trace: fallbackTrace }];
          return cards
            .map(({ label, trace }) => {
              const scoreStr =
                variantScore(trace, column, config) ||
                (cell.kind === 'score' ? `score ${cell.value}` : '');
              const metaParts = [
                scoreStr,
                trace?.repetitions
                  ? `${trace.repetitions} rep${trace.repetitions === 1 ? '' : 's'}`
                  : '',
                spreadLabel(trace),
                trace?.stepCount ? `${trace.stepCount} steps` : '',
                trace?.toolCount ? `${trace.toolCount} tools` : '',
              ].filter(Boolean);

              let body = '';
              if (trace?.question) {
                body += `<div class="question">${esc(trace.question)}</div>`;
              }
              if (trace?.toolTrail?.length) {
                body += `<p class="tool-trail"><strong>Tools called:</strong> <code>${esc(
                  trace.toolTrail.join(', ')
                )}</code></p>`;
              }
              if (trace?.answer) {
                body += `<div class="answer">${mdToHtml(trace.answer)}</div>`;
              } else if (trace?.question || (trace?.stepCount ?? 0) > 0) {
                body +=
                  '<div class="answer"><p class="empty">No final answer message captured.</p></div>';
              } else if (trace && Object.keys(trace.scores ?? {}).length > 0) {
                // Trace entry carries only evaluator scores — no question, no
                // steps. Extra-suite columns (rule/dashboard translation,
                // attack discovery) are code-evaluated with no agent
                // conversation; "No final answer captured" reads like a
                // capture failure there. Say what actually happened.
                body +=
                  '<p class="empty">No agent trace — this suite is evaluated without a conversational agent.</p>';
              } else {
                body += '<p class="empty">Trace unavailable.</p>';
              }
              if (trace?.steps?.length) {
                const stepsHtml = trace.steps.map((s, i) => stepHtml(s, i + 1)).join('\n');
                body += `<details class="trace"><summary>🔍 Step trace — ${trace.steps.length} steps</summary><div class="trace-body">${stepsHtml}</div></details>`;
              }

              return `<details class="prompt"><summary>${status}<span class="prompt-id">${esc(
                col.label
              )}</span><span class="skill-chip">${esc(label)}</span><span class="p-meta">${esc(
                metaParts.join(' · ')
              )}</span></summary><div class="prompt-body">${body}</div></details>`;
            })
            .join('\n');
        })
        .join('\n');

      return `<section class="card"><header class="card-head"><h2>${esc(
        row.modelLabel
      )}</h2><div class="meta"><span class="model-id">${esc(
        row.modelId
      )}</span><span>·</span><span>${completed}/${total} completed</span></div></header>${prompts}</section>`;
    })
    .join('\n');
};

/**
 * Renders a self-contained HTML report from the matrix data, matching the
 * `agent_eval_smoke.html` reference format. When `traces` is provided, each
 * prompt section includes the initial user question, tool trail, agent answer,
 * and step trace.
 */
export const renderMatrixHtml = (
  matrix: Matrix,
  config: MatrixConfig,
  provenance: MatrixProvenance = {},
  traces?: MatrixTraceData
): string => {
  const generatedAt = new Date().toISOString();
  const provenanceLine = [
    `Generated ${generatedAt}`,
    provenance.branch ? `branch \`${provenance.branch}\`` : undefined,
    provenance.lookbackDays !== undefined ? `${provenance.lookbackDays}-day lookback` : undefined,
    provenance.commitSha ? `commit \`${provenance.commitSha}\`` : undefined,
    provenance.buildUrl ? `<a href="${esc(provenance.buildUrl)}">build</a>` : undefined,
    provenance.fixtureFingerprint ? `fixtures \`${provenance.fixtureFingerprint}\`` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  // The saturated-evaluator exclusion changes what Overall means, so it has to
  // be stated on the page rather than only in matrix.json. A reader comparing
  // this artifact to an older one otherwise sees every score drop with no
  // explanation.
  const saturated = matrix.evaluatorSaturation.filter((entry) => entry.saturated);
  const saturationNote =
    saturated.length > 0
      ? [
          `Overall excludes ${saturated.length} non-discriminating evaluator(s): ` +
            `${saturated
              .map(
                (entry) =>
                  `${entry.evaluatorName} (spread ${entry.range.toFixed(2)} across ${
                    entry.observations
                  } models)`
              )
              .join(', ')}. ` +
            `These score every model within a narrow band, so averaging them into Overall ` +
            `divides the discriminating evaluators' signal without adding ranking information. ` +
            `Per-column cells are unaffected.`,
        ]
      : [];

  const allNotes = [...(provenance.methodologyNotes ?? []), ...saturationNote];
  const methodologyBlock = allNotes.length
    ? `<details class="methodology"><summary>Methodology &amp; scoring-semantics notes</summary><ul>${allNotes
        .map((note) => `<li>${esc(note)}</li>`)
        .join('')}</ul></details>`
    : '';

  const summaryTable = renderSummaryTable(matrix, config);
  const tokenCostTable = renderTokenCost(matrix, config);
  const modelCards =
    (matrix.proprietary.length > 0
      ? renderModelCard(matrix.proprietary, matrix, config, traces)
      : '') +
    (matrix.openSource.length > 0
      ? renderModelCard(matrix.openSource, matrix, config, traces)
      : '');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(config.title)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<div class="wrap">
<h1>${esc(config.title)}</h1>
<p class="sub">${provenanceLine}</p>
${methodologyBlock}
${summaryTable}
${tokenCostTable}
<p class="legend">Each cell shows the model's score (0–10). Expand a prompt below to read the agent's full answer, tool trail, and reasoning trace.</p>
${modelCards}
</div>
</body>
</html>`;
};
