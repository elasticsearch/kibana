/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Matrix, MatrixCell, MatrixRow } from './build_matrix';
import type { MatrixProvenance } from './render_matrix';
import type { MatrixTraceData } from './trace_types';
import {
  judgeAgreementForModel,
  type JudgeAgreementRow,
  type JudgeVerdict,
} from './judge_agreement';
import {
  intervalsOverlap,
  resolveProbe,
  rowAgreement,
  type ReliabilityRow,
  type TrajectoryCell,
} from './trajectory_agreement';

const esc = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const cellValue = (cell: MatrixCell): string => {
  switch (cell.kind) {
    case 'score':
      return cell.value.toFixed(2);
    case 'not-recommended':
      return 'Not recommended';
    case 'excluded':
      return `Excluded: ${cell.reason}`;
    case 'insufficient-coverage':
      return `Insufficient: ${cell.covered}/${cell.required}`;
    case 'insufficient-evaluators':
      return `Unmeasured (${cell.evaluators.join(', ')} errored)`;
    case 'missing':
      return 'Unmeasured';
  }
};

/**
 * Converts only direct example trace keys into reliability cells. Prefix and
 * suite aliases do not carry repTrails, preventing double-counting.
 */
export const reliabilityCellsFromTraces = (traces: MatrixTraceData = {}): TrajectoryCell[] =>
  Object.entries(traces).flatMap(([key, trace]) => {
    if (!trace.repTrails) {
      return [];
    }
    const split = key.indexOf(':');
    if (split < 1) {
      return [];
    }
    const example = key.slice(split + 1);
    // Prefer the contract the dataset declared; fall back to the legacy prefix
    // list only for corpora recorded before that field existed, and carry the
    // source through so the page can disclose how many cells were guessed.
    const { probe, source } = resolveProbe(example, trace.pathContract);
    return [
      {
        model: key.slice(0, split),
        example,
        trails: trace.repTrails,
        answers: trace.repAnswers,
        probe,
        probeSource: source,
      },
    ];
  });

const pct = (value: number): string => `${(value * 100).toFixed(0)}%`;

/**
 * Renders the agreement rate with its Wilson interval and pair count. The
 * point estimate alone invites ordering two models that the data cannot
 * separate, so the interval and sample size are not optional decoration.
 */
const reliabilityHtml = (agreement: ReliabilityRow, tied: boolean): string => {
  if (agreement.status === 'unmeasured') {
    return (
      '<span class="unmeasured">Unmeasured</span>' +
      `<small>needs k&ge;5 repeats · ${agreement.cells} rankable cells at 1 rep</small>`
    );
  }
  const interval = agreement.interval;
  const range = interval ? ` (${pct(interval.low)}–${pct(interval.high)})` : '';
  const answer =
    agreement.answerSimilarity === undefined
      ? ''
      : ` · ${pct(agreement.answerSimilarity)} answer similarity`;
  const hotspot = agreement.divergenceHotspot
    ? `<small>first diverges at <code>${esc(agreement.divergenceHotspot.tool)}</code> in ${
        agreement.divergenceHotspot.cells
      }/${agreement.measuredCells} cells</small>`
    : '';
  const tiedNote = tied ? '<small class="tied">tied — intervals overlap</small>' : '';
  const orderOnly =
    agreement.toolSetRate !== undefined && agreement.identicalRate !== undefined
      ? ` · ${pct(agreement.toolSetRate)} same tool set`
      : '';
  return (
    `<strong>${pct(agreement.identicalRate ?? 0)}</strong>${range}` +
    `<small>${agreement.pairs ?? 0} pairs · ${agreement.measuredCells} repeated cells · ${pct(
      agreement.sequenceSimilarity ?? 0
    )} path similarity${orderOnly}${answer}</small>` +
    hotspot +
    tiedNote
  );
};

const judgeHtml = (row: JudgeAgreementRow): string => {
  if (row.status === 'unmeasured') {
    return '<span class="unmeasured">Unmeasured</span><small>no verdicts</small>';
  }
  if (row.status === 'single-judge') {
    // Never render this as agreement. One judge scoring a model is an absence
    // of corroboration, and a percentage here would read as its opposite.
    return `<span class="unmeasured">Single judge</span><small>${esc(
      row.judges.join(', ')
    )} · no second opinion</small>`;
  }

  const agreementPct = `${((row.verdictAgreement ?? 0) * 100).toFixed(1)}%`;
  const ci = row.interval
    ? ` <small>95% CI ${(row.interval.low * 100).toFixed(0)}–${(row.interval.high * 100).toFixed(
        0
      )}</small>`
    : '';
  const bias =
    row.bias !== undefined && row.biasJudges
      ? `<small>bias ${row.bias >= 0 ? '+' : ''}${row.bias.toFixed(3)} (${esc(
          row.biasJudges[0]
        )} − ${esc(row.biasJudges[1])})</small>`
      : '';
  const worst = row.worstEvaluators.length
    ? `<small>worst: ${row.worstEvaluators
        .slice(0, 2)
        .map(
          (e) =>
            `${esc(e.evaluator)} ${((e.flips / e.pairs) * 100).toFixed(0)}% [${(
              e.interval.low * 100
            ).toFixed(0)}–${(e.interval.high * 100).toFixed(0)}]`
        )
        .join(', ')}</small>`
    : '';
  // Disclose one-sided coverage. Without this a row computed over 395 of 531
  // cells reads identically to one where both judges scored everything.
  const coverage =
    row.unpaired > 0
      ? `<small class="caveat">${row.unpaired} cell${
          row.unpaired === 1 ? '' : 's'
        } scored by one judge only, excluded</small>`
      : '';
  return `${agreementPct}${ci}<small>${row.pairs} paired verdicts</small>${coverage}${bias}${worst}`;
};

const rowHtml = (
  row: MatrixRow,
  agreement: ReliabilityRow,
  tied: boolean,
  judge: JudgeAgreementRow
): string => {
  const tier = row.tier === undefined ? '—' : `Tier ${row.tier}`;
  return `<tr>
    <td class="model">${esc(row.modelLabel)}<small>${esc(row.modelId)}</small></td>
    <td class="metric">${esc(
      cellValue(row.capability ?? { kind: 'missing' })
    )}<small>deterministic contract evaluators</small></td>
    <td class="metric">${reliabilityHtml(agreement, tied)}</td>
    <td class="metric">${judgeHtml(judge)}</td>
    <td class="metric">${esc(cellValue(row.judgedQuality ?? { kind: 'missing' }))}<small>${esc(
    tier
  )} · ${row.coverage.covered}/${row.coverage.total} columns</small></td>
  </tr>`;
};

/**
 * Separate artifact. It deliberately does not replace matrix.html: reliability
 * is currently measured for only a subset of models, and absence must remain
 * visibly "Unmeasured" rather than silently ranking as 0.
 */
export const renderReliabilityHtml = (
  matrix: Matrix,
  traces: MatrixTraceData = {},
  provenance: MatrixProvenance = {},
  judgeVerdicts: readonly JudgeVerdict[] = []
): string => {
  const cells = reliabilityCellsFromTraces(traces);
  const rows = [...matrix.proprietary, ...matrix.openSource];
  const agreements = new Map(rows.map((row) => [row.modelId, rowAgreement(cells, row.modelId)]));
  const measured = [...agreements.values()].filter((a) => a.status === 'measured');
  const judgeRows = new Map(
    rows.map((row) => [row.modelId, judgeAgreementForModel(judgeVerdicts, row.modelId)])
  );
  const judgeMeasured = [...judgeRows.values()].filter((j) => j.status === 'measured');

  // A row is "tied" when its interval overlaps any other measured row's. With
  // ~27 pairs per model the intervals span roughly 30pp, so two point
  // estimates 4pp apart are the same measurement, not a ranking.
  const tiedModels = new Set<string>();
  for (const a of measured) {
    for (const b of measured) {
      if (a.modelId !== b.modelId && a.interval && b.interval) {
        if (intervalsOverlap(a.interval, b.interval)) {
          tiedModels.add(a.modelId);
        }
      }
    }
  }

  const legacyCells = cells.filter((c) => c.probeSource === 'legacy-prefix').length;
  const probeCells = cells.filter((c) => c.probe).length;
  const generated = new Date().toISOString();
  const prov = [
    `Generated ${generated}`,
    provenance.branch ? `branch ${provenance.branch}` : undefined,
    provenance.commitSha ? `commit ${provenance.commitSha}` : undefined,
    // An artifact built from a dirty tree does not correspond to any commit;
    // saying so is the difference between provenance and decoration.
    provenance.dirtyWorkingTree ? 'uncommitted changes present' : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Matrix reliability view</title><style>
:root{--bg:#0f1115;--panel:#171a21;--panel2:#1f2430;--border:#2a3140;--text:#e6e9ef;--muted:#9aa4b2;--accent:#6ea8fe;--ok:#5fd0a0;--warn:#ffd166}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:38px 22px 70px}h1{margin:0 0 4px;font-size:26px}.sub{color:var(--muted);font-size:13px;margin:0 0 24px}.callout{border-left:4px solid var(--warn);background:rgba(255,209,102,.08);padding:14px 18px;margin:18px 0 24px;border-radius:0 8px 8px 0}.callout strong{color:var(--warn)}table{width:100%;border-collapse:collapse;background:var(--panel);border:1px solid var(--border)}th,td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:top}th{background:var(--panel2);color:var(--muted);text-transform:uppercase;font-size:11px;letter-spacing:.05em;text-align:left}.model{font-weight:650;min-width:230px}.model small,.metric small{display:block;color:var(--muted);font-weight:400;font-size:11px}.metric{min-width:170px}.unmeasured{color:var(--muted);font-style:italic}.tied{color:var(--warn)!important}.legend{color:var(--muted);font-size:12px;margin-top:14px}code{font-family:ui-monospace,monospace;background:var(--panel2);padding:2px 5px;border-radius:4px}
</style></head><body><div class="wrap"><h1>Capability · Reliability · Judged quality</h1><p class="sub">${esc(
    prov
  )}</p>
<div class="callout"><strong>${measured.length}/${
    rows.length
  } models have repeated cells.</strong> Reliability is blank by design for the rest. A single run is neither stable nor unstable.${
    measured.length > 1 && tiedModels.size === measured.length
      ? ' Every measured row is statistically tied — the intervals overlap, so this column does not order them.'
      : ''
  }${
    legacyCells > 0
      ? ` ${legacyCells} of ${cells.length} cells were classified by the legacy example-prefix list because their score documents predate the <code>pathContract</code> field.`
      : ''
  }${probeCells > 0 ? ` ${probeCells} probe cells are excluded from agreement.` : ''}${
    judgeMeasured.length > 0
      ? ` ${judgeMeasured.length}/${rows.length} models were scored by two judge families; agreement below is verdict-level concordance, not correctness — both judges can agree and both be wrong.`
      : ''
  }</div>
<table><thead><tr><th>Model</th><th>Capability</th><th>Reliability</th><th>Judge agreement</th><th>Judged quality</th></tr></thead><tbody>${rows
    .map((row) =>
      rowHtml(
        row,
        agreements.get(row.modelId) ?? {
          modelId: row.modelId,
          status: 'unmeasured',
          cells: 0,
          measuredCells: 0,
        },
        tiedModels.has(row.modelId),
        judgeRows.get(row.modelId) ?? {
          modelId: row.modelId,
          status: 'unmeasured',
          judges: [],
          pairs: 0,
          unpaired: 0,
          worstEvaluators: [],
        }
      )
    )
    .join('\n')}</tbody></table>
<p class="legend"><b>Capability</b> is the mean of deterministic contract evaluators (<code>ExpectedToolCalled</code>, <code>FinalAnswerPresent</code>, <code>MinExpectedSteps</code>, and <code>SkillInvoked</code>). <b>Reliability</b> is pairwise exact agreement of ordered <code>tool_id</code> sequences; provider-generated <code>tool_call_id</code> is never compared. Rates carry a Wilson 95% interval and their pair count, and rows whose intervals overlap are marked tied rather than ordered. <b>Answer similarity</b> is reported separately because path stability barely predicts it (r=0.14 on the pilot corpus). <b>Judge agreement</b> is pass/fail concordance between two judge families on the identical example, repetition, and evaluator; cost and latency instruments are excluded because they are not verdicts. A model scored by one judge reads <i>Single judge</i>, never 100% — an absent second opinion is not consensus. Agreement measures reproducibility, not correctness. <b>Judged quality</b> is the mean of the remaining maximize-direction evaluators. The four axes are never averaged into a rank.</p>
</div></body></html>`;
};
