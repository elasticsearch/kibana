/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EvaluationResult, Evaluator } from '@kbn/evals';
import type { DashboardAgentTaskOutput, DashboardDatasetExample } from './evaluate_dataset';

interface DashboardPanel {
  panels?: DashboardPanel[];
  grid?: {
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  };
  title?: string;
  [key: string]: unknown;
}

interface DashboardAttachmentContent {
  title?: string;
  description?: string;
  panels?: DashboardPanel[];
  [key: string]: unknown;
}

interface DashboardSummaryContainer {
  data?: {
    dashboard?: DashboardAttachmentContent;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getDashboardAttachmentContent = (value: unknown): DashboardAttachmentContent | undefined => {
  // The generate_dashboard tool result exposes a compact dashboard summary at
  // `data.dashboard` (title, description, and panels/sections with their grids).
  const content = (value as DashboardSummaryContainer).data?.dashboard;
  if (content && Array.isArray(content.panels)) {
    return content;
  }

  if (Array.isArray(value)) {
    for (const item of value.toReversed()) {
      const nestedContent = getDashboardAttachmentContent(item);
      if (nestedContent) {
        return nestedContent;
      }
    }
  }

  if (isRecord(value)) {
    for (const nestedValue of Object.values(value).toReversed()) {
      const nestedContent = getDashboardAttachmentContent(nestedValue);
      if (nestedContent) {
        return nestedContent;
      }
    }
  }

  return undefined;
};

export const getLatestDashboardAttachmentContent = (
  output: DashboardAgentTaskOutput
): DashboardAttachmentContent | undefined => {
  for (const step of (output.steps ?? []).toReversed()) {
    const content = getDashboardAttachmentContent(step);
    if (content) {
      return content;
    }
  }

  return undefined;
};

const getDashboardContentPanels = (output: DashboardAgentTaskOutput): DashboardPanel[] => {
  return getLatestDashboardAttachmentContent(output)?.panels ?? [];
};

const getDashboardSections = (panels: DashboardPanel[]): DashboardPanel[] => {
  return panels.filter((panel) => Array.isArray(panel.panels));
};

const getDashboardLeafPanels = (panels: DashboardPanel[]): DashboardPanel[] => {
  return panels.flatMap((panel) =>
    Array.isArray(panel.panels) ? getDashboardLeafPanels(panel.panels) : [panel]
  );
};

const countDashboardPanels = (panels: DashboardPanel[]): number => {
  return panels.reduce((total, panel) => {
    if (Array.isArray(panel.panels)) {
      return total + countDashboardPanels(panel.panels);
    }
    return total + 1;
  }, 0);
};

const countDashboardSections = (panels: DashboardPanel[]): number => {
  return panels.reduce((total, panel) => {
    const nestedPanels = Array.isArray(panel.panels) ? panel.panels : undefined;
    return total + (nestedPanels ? 1 + countDashboardSections(nestedPanels) : 0);
  }, 0);
};

const getGridOverflowViolations = (
  panels: DashboardPanel[],
  maxColumns: number
): Array<{ id?: unknown; x?: number; w?: number }> => {
  const violations: Array<{ id?: unknown; x?: number; w?: number }> = [];

  for (const panel of panels) {
    const { grid } = panel;
    if (typeof grid?.x === 'number' && typeof grid.w === 'number' && grid.x + grid.w > maxColumns) {
      violations.push({ id: panel.id, x: grid.x, w: grid.w });
    }

    if (Array.isArray(panel.panels)) {
      violations.push(...getGridOverflowViolations(panel.panels, maxColumns));
    }
  }

  return violations;
};

const getGridRows = (
  panels: DashboardPanel[]
): Array<{ y: number; panels: DashboardPanel[]; maxHeight: number }> => {
  const rowMap = new Map<number, DashboardPanel[]>();

  for (const panel of getDashboardLeafPanels(panels)) {
    const { grid } = panel;
    if (typeof grid?.y !== 'number') {
      continue;
    }
    const row = rowMap.get(grid.y) ?? [];
    row.push(panel);
    rowMap.set(grid.y, row);
  }

  return [...rowMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, rowPanels]) => {
      const panelsSortedByX = rowPanels.sort((a, b) => (a.grid?.x ?? 0) - (b.grid?.x ?? 0));
      const maxHeight = Math.max(...panelsSortedByX.map((panel) => panel.grid?.h ?? 0));

      return {
        y,
        panels: panelsSortedByX,
        maxHeight,
      };
    });
};

const rowFillsWidth = (panels: DashboardPanel[], maxColumns: number): boolean => {
  let nextX = 0;

  for (const panel of panels) {
    const { grid } = panel;
    if (typeof grid?.x !== 'number' || typeof grid.w !== 'number') {
      return false;
    }
    if (grid.x !== nextX) {
      return false;
    }
    nextX = grid.x + grid.w;
  }

  return nextX === maxColumns;
};

const isInRange = (
  value: number | undefined,
  range: { min?: number; max?: number } | undefined
): boolean => {
  if (!range) {
    return true;
  }
  if (typeof value !== 'number') {
    return false;
  }
  return (
    (typeof range.min !== 'number' || value >= range.min) &&
    (typeof range.max !== 'number' || value <= range.max)
  );
};

const sectionMatchesExpectation = (
  section: DashboardPanel,
  expectedSection: NonNullable<
    NonNullable<DashboardDatasetExample['output']['expectedDashboardAttachment']>['sections']
  >[number]
): boolean => {
  const title = section.title?.toLowerCase() ?? '';
  const requiredTitleTerms = expectedSection.titleIncludes ?? [];
  const optionalTitleTerms = expectedSection.titleIncludesAny ?? [];

  if (requiredTitleTerms.some((term) => !title.includes(term.toLowerCase()))) {
    return false;
  }

  if (
    optionalTitleTerms.length > 0 &&
    !optionalTitleTerms.some((term) => title.includes(term.toLowerCase()))
  ) {
    return false;
  }

  const panelCount = section.panels?.length ?? 0;
  if (typeof expectedSection.minPanels === 'number' && panelCount < expectedSection.minPanels) {
    return false;
  }
  if (typeof expectedSection.maxPanels === 'number' && panelCount > expectedSection.maxPanels) {
    return false;
  }

  return true;
};

const describeExpectedSection = (
  expectedSection: NonNullable<
    NonNullable<DashboardDatasetExample['output']['expectedDashboardAttachment']>['sections']
  >[number]
): string => {
  const titleTerms = [
    ...(expectedSection.titleIncludes ?? []),
    ...(expectedSection.titleIncludesAny ?? []),
  ];
  const titleDescription =
    titleTerms.length > 0 ? `title terms [${titleTerms.join(', ')}]` : 'any title';
  const panelDescription =
    typeof expectedSection.minPanels === 'number' || typeof expectedSection.maxPanels === 'number'
      ? `panel count ${expectedSection.minPanels ?? '-∞'}-${expectedSection.maxPanels ?? '∞'}`
      : 'any panel count';

  return `${titleDescription}, ${panelDescription}`;
};

export const dashboardAttachmentExistsEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard attachment exists',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const expectedExists = expected?.expectedDashboardAttachment?.exists;
    if (typeof expectedExists !== 'boolean') {
      return { score: 1, label: 'SKIPPED' };
    }

    const exists = Boolean(getLatestDashboardAttachmentContent(output));
    const passed = exists === expectedExists;

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: expectedExists
        ? `Expected a dashboard attachment. Found attachment: ${exists}.`
        : `Expected no dashboard attachment. Found attachment: ${exists}.`,
      metadata: { expectedExists, exists },
    };
  },
};

export const dashboardAttachmentTitleEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard attachment title',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const expectsNonEmptyTitle = expected?.expectedDashboardAttachment?.title?.nonEmpty;
    if (expectsNonEmptyTitle !== true) {
      return { score: 1, label: 'SKIPPED' };
    }

    const title = getLatestDashboardAttachmentContent(output)?.title;
    const passed = typeof title === 'string' && title.trim().length > 0;

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: `Expected a non-empty dashboard title. Found: ${title ?? 'none'}.`,
      metadata: { title },
    };
  },
};

export const dashboardPanelCountEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard panel count',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const panelCountExpectation = expected?.expectedDashboardAttachment?.panelCount;
    const { min, max } = panelCountExpectation ?? {};
    if (typeof min !== 'number' && typeof max !== 'number') {
      return { score: 1, label: 'SKIPPED' };
    }

    const panels = getDashboardContentPanels(output);
    const panelCount = countDashboardPanels(panels);
    const passed =
      (typeof min !== 'number' || panelCount >= min) &&
      (typeof max !== 'number' || panelCount <= max);

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: `Expected dashboard panel count in range ${min ?? '-∞'}-${
        max ?? '∞'
      }, found ${panelCount}.`,
      metadata: { min, max, panelCount },
    };
  },
};

export const dashboardSectionShapeEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard section shape',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const expectedAttachment = expected?.expectedDashboardAttachment;
    const expectedSectionCount = expectedAttachment?.sectionCount;
    const expectedSections = expectedAttachment?.sections ?? [];
    if (typeof expectedSectionCount !== 'number' && expectedSections.length === 0) {
      return { score: 1, label: 'SKIPPED' };
    }

    const panels = getDashboardContentPanels(output);
    const sections = getDashboardSections(panels);
    const sectionCount = sections.length;
    const sectionCountPassed =
      typeof expectedSectionCount !== 'number' || sectionCount === expectedSectionCount;
    const sectionFailures: string[] = [];

    const matchedSectionIndexes = new Set<number>();
    for (const [index, expectedSection] of expectedSections.entries()) {
      const matchingSectionIndex = sections.findIndex((section, sectionIndex) => {
        return (
          !matchedSectionIndexes.has(sectionIndex) &&
          sectionMatchesExpectation(section, expectedSection)
        );
      });

      if (matchingSectionIndex === -1) {
        sectionFailures.push(
          `Expected section ${index} was not found (${describeExpectedSection(expectedSection)}).`
        );
        continue;
      }
      matchedSectionIndexes.add(matchingSectionIndex);
    }

    const passed = sectionCountPassed && sectionFailures.length === 0;

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: passed
        ? `Dashboard section shape matched expectations. Found ${sectionCount} section(s).`
        : `Dashboard section shape did not match expectations. Expected ${
            expectedSectionCount ?? 'any'
          } section(s), found ${sectionCount}. ${sectionFailures.join(' ')}`,
      metadata: {
        expectedSectionCount,
        sectionCount,
        sectionFailures,
        matchedSectionCount: matchedSectionIndexes.size,
      },
    };
  },
};

export const dashboardGridBoundsEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard grid bounds',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const gridExpectation = expected?.expectedDashboardAttachment?.grid;
    if (gridExpectation?.noOverflow !== true) {
      return { score: 1, label: 'SKIPPED' };
    }

    const maxColumns = gridExpectation.maxColumns ?? 48;
    const panels = getDashboardContentPanels(output);
    const violations = getGridOverflowViolations(panels, maxColumns);
    const passed = violations.length === 0;

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: passed
        ? `All dashboard panels fit within ${maxColumns} columns.`
        : `${violations.length} dashboard panel(s) overflow ${maxColumns} columns.`,
      metadata: { maxColumns, violations },
    };
  },
};

export const dashboardGridRowLayoutEvaluator: Evaluator<
  DashboardDatasetExample,
  DashboardAgentTaskOutput
> = {
  name: 'Dashboard grid row layout',
  kind: 'CODE',
  evaluate: async ({ expected, output }): Promise<EvaluationResult> => {
    const gridExpectation = expected?.expectedDashboardAttachment?.grid;
    const expectedRows = gridExpectation?.rows ?? [];
    if (expectedRows.length === 0) {
      return { score: 1, label: 'SKIPPED' };
    }

    const maxColumns = gridExpectation?.maxColumns ?? 48;
    const rows = getGridRows(getDashboardContentPanels(output));
    const failures: string[] = [];

    for (const [index, expectedRow] of expectedRows.entries()) {
      const row = rows[index];
      if (!row) {
        failures.push(`Missing row at index ${index}.`);
        continue;
      }

      if (
        typeof expectedRow.panelCount === 'number' &&
        row.panels.length !== expectedRow.panelCount
      ) {
        failures.push(
          `Row ${index} expected ${expectedRow.panelCount} panel(s), found ${row.panels.length}.`
        );
      }

      if (typeof expectedRow.y === 'number' && row.y !== expectedRow.y) {
        failures.push(`Row ${index} expected y=${expectedRow.y}, found y=${row.y}.`);
      }

      if (expectedRow.yAfterPreviousRow === true && index > 0) {
        const previousRow = rows[index - 1];
        const expectedY = previousRow.y + previousRow.maxHeight;
        if (row.y !== expectedY) {
          failures.push(`Row ${index} expected y=${expectedY}, found y=${row.y}.`);
        }
      }

      if (expectedRow.widths) {
        const widths = row.panels.map((panel) => panel.grid?.w);
        if (
          widths.length !== expectedRow.widths.length ||
          widths.some((width, widthIndex) => width !== expectedRow.widths?.[widthIndex])
        ) {
          failures.push(
            `Row ${index} expected widths [${expectedRow.widths.join(', ')}], found [${widths.join(
              ', '
            )}].`
          );
        }
      }

      if (
        expectedRow.widthRange &&
        row.panels.some((panel) => !isInRange(panel.grid?.w, expectedRow.widthRange))
      ) {
        failures.push(
          `Row ${index} expected every panel width to be in range ${
            expectedRow.widthRange.min ?? '-∞'
          }-${expectedRow.widthRange.max ?? '∞'}.`
        );
      }

      if (
        typeof expectedRow.height === 'number' &&
        row.panels.some((panel) => panel.grid?.h !== expectedRow.height)
      ) {
        failures.push(`Row ${index} expected every panel height to be ${expectedRow.height}.`);
      }

      if (
        expectedRow.heightRange &&
        row.panels.some((panel) => !isInRange(panel.grid?.h, expectedRow.heightRange))
      ) {
        failures.push(
          `Row ${index} expected every panel height to be in range ${
            expectedRow.heightRange.min ?? '-∞'
          }-${expectedRow.heightRange.max ?? '∞'}.`
        );
      }

      if (expectedRow.fillsWidth === true && !rowFillsWidth(row.panels, maxColumns)) {
        failures.push(`Row ${index} does not fill ${maxColumns} columns without gaps.`);
      }
    }

    const passed = failures.length === 0;

    return {
      score: passed ? 1 : 0,
      label: passed ? 'PASS' : 'FAIL',
      explanation: passed
        ? `Dashboard grid rows matched expectations.`
        : `Dashboard grid rows did not match expectations. ${failures.join(' ')}`,
      metadata: { failures, rowCount: rows.length },
    };
  },
};
