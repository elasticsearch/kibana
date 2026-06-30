/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MatrixConfig } from './load_matrix_config';
import type { Matrix, MatrixCell, MatrixRow } from './build_matrix';

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

const buildHeader = (matrix: Matrix): string[] => [
  'Model',
  ...matrix.columns.map((column) => column.label),
  matrix.overallLabel,
];

const rowToValues = (matrix: Matrix, row: MatrixRow, notRecommendedLabel: string): string[] => [
  row.modelLabel,
  ...matrix.columns.map((column) => cellToString(row.cells[column.id], notRecommendedLabel)),
  cellToString(row.overall, notRecommendedLabel),
];

const renderCsv = (matrix: Matrix, rows: MatrixRow[], notRecommendedLabel: string): string => {
  const lines = [
    buildHeader(matrix),
    ...rows.map((row) => rowToValues(matrix, row, notRecommendedLabel)),
  ];
  return lines.map((cells) => cells.map(csvEscape).join(',')).join('\n') + '\n';
};

const renderMarkdownTable = (
  matrix: Matrix,
  rows: MatrixRow[],
  notRecommendedLabel: string
): string => {
  const header = buildHeader(matrix);
  const separator = header.map(() => ':---');
  const body = rows.map((row) => rowToValues(matrix, row, notRecommendedLabel));

  const toRow = (cells: string[]): string => `| ${cells.join(' | ')} |`;

  return [toRow(header), toRow(separator), ...body.map(toRow)].join('\n');
};

export const renderMatrix = (matrix: Matrix, config: MatrixConfig): RenderedMatrix => {
  const { notRecommendedLabel } = config;

  const proprietaryCsv = renderCsv(matrix, matrix.proprietary, notRecommendedLabel);
  const openSourceCsv = renderCsv(matrix, matrix.openSource, notRecommendedLabel);

  const markdown = [
    `# ${config.title}`,
    '',
    'Higher scores indicate better performance. A score of 10 on a task means the model met or exceeded all task-specific benchmarks. ' +
      `Models with a score of "${notRecommendedLabel}" failed testing.`,
    '',
    '## Proprietary models',
    '',
    matrix.proprietary.length > 0
      ? renderMarkdownTable(matrix, matrix.proprietary, notRecommendedLabel)
      : '_No proprietary models with results._',
    '',
    '## Open-source models',
    '',
    matrix.openSource.length > 0
      ? renderMarkdownTable(matrix, matrix.openSource, notRecommendedLabel)
      : '_No open-source models with results._',
    '',
  ].join('\n');

  const json = JSON.stringify(
    {
      title: config.title,
      generatedAt: new Date().toISOString(),
      columns: matrix.columns,
      overallLabel: matrix.overallLabel,
      proprietary: matrix.proprietary,
      openSource: matrix.openSource,
    },
    null,
    2
  );

  return { proprietaryCsv, openSourceCsv, markdown, json };
};
