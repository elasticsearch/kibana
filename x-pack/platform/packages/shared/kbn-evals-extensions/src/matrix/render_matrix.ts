/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MatrixConfig } from './load_matrix_config';
import type { Matrix, MatrixCell, MatrixDisplayColumn, MatrixRow } from './build_matrix';
import type { MatrixTraceData } from './trace_types';

/**
 * Where the numbers came from. Without this, a published matrix is an
 * undated table of scores with no way to tell which eval run, branch, or
 * lookback window produced it — so a stale artifact is indistinguishable
 * from a fresh one.
 */
export interface MatrixProvenance {
  /** Branch filter applied to the query (undefined = any branch). */
  branch?: string;
  /** Lookback window in days used to select experiments. */
  lookbackDays?: number;
  /**
   * Epoch-ms cutoff the matrix was rendered at, when not "now". A time-boxed
   * matrix that does not say so reads as current data.
   */
  asOf?: number;
  /** Suite ids the scores were drawn from. */
  suiteIds?: string[];
  /** Commit the generator ran against, when known. */
  commitSha?: string;
  /**
   * True when the generator's working tree had uncommitted changes. An artifact
   * built from a dirty tree cannot be reproduced from `commitSha` alone, and a
   * regen at a later commit may not match it.
   */
  dirtyWorkingTree?: boolean;
  /** Trace-cache file the run loaded, or `none` when it fetched from the server. */
  traceCache?: string;
  /** CI build URL that produced the artifact, when known. */
  buildUrl?: string;
  /** sha256 of the dataset/tool seed files the runs were scored against. */
  fixtureFingerprint?: string;
  /** Scoring-semantics notes a reader needs before comparing matrices. */
  methodologyNotes?: string[];
}

export interface RenderedMatrix {
  /** CSV for the proprietary-models table (first row = header). */
  proprietaryCsv: string;
  /** CSV for the open-source-models table (first row = header). */
  openSourceCsv: string;
  /** Combined human-readable markdown document. */
  markdown: string;
  /** Structured JSON artifact (machine-readable). */
  json: string;
}

const cellToString = (cell: MatrixCell, notRecommendedLabel: string): string => {
  switch (cell.kind) {
    case 'score':
      return String(cell.value);
    case 'not-recommended':
      return notRecommendedLabel;
    // Rendered distinctly from 'missing': the model ran, but every grade was
    // rejected. Publishing this as a blank invites a re-sweep that cannot fill it.
    case 'excluded':
      return `excluded:${cell.reason}`;
    // Never a bare number: an average over too few columns is not comparable
    // to a full row, and publishing one as a score invites a false ranking.
    case 'insufficient-coverage':
      return `insufficient-coverage:${cell.covered}/${cell.required}`;
    // Same principle applied to the evaluator axis: an evaluator that errored
    // on every example means the instrument failed, not that the model earned this.
    case 'insufficient-evaluators':
      return `insufficient-evaluators:${cell.evaluators.join('+')}`;
    case 'missing':
    default:
      return '';
  }
};

/** Escapes a value for inclusion in a CSV field per RFC 4180. */
const csvEscape = (value: string): string => {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

const cellForColumn = (row: MatrixRow, column: MatrixDisplayColumn): MatrixCell =>
  column.kind === 'overall' ? row.overall : row.cells[column.id] ?? { kind: 'missing' };

const buildHeader = (displayColumns: MatrixDisplayColumn[]): string[] => [
  'Model',
  ...displayColumns.map((column) => column.label),
];

const rowToValues = (
  displayColumns: MatrixDisplayColumn[],
  row: MatrixRow,
  notRecommendedLabel: string
): string[] => [
  row.modelLabel,
  ...displayColumns.map((column) => cellToString(cellForColumn(row, column), notRecommendedLabel)),
];

const renderCsv = (
  displayColumns: MatrixDisplayColumn[],
  rows: MatrixRow[],
  notRecommendedLabel: string
): string => {
  const lines = [
    buildHeader(displayColumns),
    ...rows.map((row) => rowToValues(displayColumns, row, notRecommendedLabel)),
  ];
  return lines.map((cells) => cells.map(csvEscape).join(',')).join('\n') + '\n';
};

const renderMarkdownTable = (
  displayColumns: MatrixDisplayColumn[],
  rows: MatrixRow[],
  notRecommendedLabel: string
): string => {
  const coverageOf = (row: MatrixRow): string => `${row.coverage.covered}/${row.coverage.total}`;
  const header = [...buildHeader(displayColumns), 'Coverage'];
  const separator = header.map(() => ':---');
  const body = rows.map((row) => [
    ...rowToValues(displayColumns, row, notRecommendedLabel),
    coverageOf(row),
  ]);

  const toRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;

  return [toRow(header), toRow(separator), ...body.map(toRow)].join('\n');
};

export const renderMatrix = (
  matrix: Matrix,
  config: MatrixConfig,
  provenance: MatrixProvenance = {},
  traces?: MatrixTraceData
): RenderedMatrix => {
  const { notRecommendedLabel } = config;
  const displayColumns = matrix.displayColumns;
  const generatedAt = new Date().toISOString();

  const proprietaryCsv = renderCsv(displayColumns, matrix.proprietary, notRecommendedLabel);
  const openSourceCsv = renderCsv(displayColumns, matrix.openSource, notRecommendedLabel);

  // Rendered as a plain line rather than a comment so it survives into the
  // published docs — a provenance footer nobody can see defeats the purpose.
  const provenanceLine = [
    `Generated ${generatedAt}`,
    provenance.branch ? `branch \`${provenance.branch}\`` : undefined,
    provenance.lookbackDays !== undefined ? `${provenance.lookbackDays}-day lookback` : undefined,
    provenance.asOf !== undefined
      ? `as of ${new Date(provenance.asOf).toISOString().slice(0, 10)} (later runs excluded)`
      : undefined,
    provenance.commitSha ? `commit \`${provenance.commitSha}\`` : undefined,
    provenance.buildUrl ? `[build](${provenance.buildUrl})` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');

  const markdown = [
    `# ${config.title}`,
    '',
    provenanceLine,
    '',
    'Higher scores indicate better performance. A score of 10 on a task means the model met or exceeded all task-specific benchmarks. ' +
      `Models with a score of "${notRecommendedLabel}" failed testing.`,
    '',
    '## Proprietary models',
    '',
    matrix.proprietary.length > 0
      ? renderMarkdownTable(displayColumns, matrix.proprietary, notRecommendedLabel)
      : '_No proprietary models with results._',
    '',
    '## Open-source models',
    '',
    matrix.openSource.length > 0
      ? renderMarkdownTable(displayColumns, matrix.openSource, notRecommendedLabel)
      : '_No open-source models with results._',
    '',
  ].join('\n');

  const json = JSON.stringify(
    {
      title: config.title,
      generatedAt,
      provenance,
      columns: matrix.columns,
      composites: matrix.composites ?? [],
      displayColumns,
      overallLabel: matrix.overallLabel,
      // Which evaluators were judged non-discriminating, and the numbers
      // behind the verdict. Overall is computed WITHOUT the saturated ones
      // when the config opts in, so the exclusion has to be auditable from
      // the artifact alone -- otherwise a reader cannot tell why a score
      // moved between two runs of the same data.
      evaluatorSaturation: matrix.evaluatorSaturation ?? [],
      proprietary: matrix.proprietary,
      openSource: matrix.openSource,
      ...(matrix.tokenCost ? { tokenCost: matrix.tokenCost } : {}),
      // Traces are embedded at generation time so the artifact is
      // reproducible: a reader can audit any cell's full conversation without
      // re-querying the evals cluster. Present only when the caller queried
      // trace data (the --html path).
      ...(traces ? { traces } : {}),
    },
    null,
    2
  );

  return { proprietaryCsv, openSourceCsv, markdown, json };
};
