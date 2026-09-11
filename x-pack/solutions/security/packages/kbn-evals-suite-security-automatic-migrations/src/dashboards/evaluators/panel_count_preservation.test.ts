/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createPanelCountPreservationEvaluator } from './panel_count_preservation';
import type { MigrationResult } from '../migration_client';
import type { DashboardExample, DashboardExpected } from '../../../datasets/dashboards/types';

function makeMigrationResult(panelCount: number): MigrationResult {
  const panelObjects = Array.from({ length: panelCount }, (_, i) => ({
    type: 'lens',
    panelIndex: `panel-${i}`,
    title: `Panel ${i}`,
    gridData: { x: 0, y: i * 6, w: 24, h: 6, i: `panel-${i}` },
    embeddableConfig: {},
  }));

  return {
    migrationId: 'test',
    dashboards: [
      {
        id: 'd1',
        migration_id: 'test',
        original_dashboard: { id: 'orig1', title: 'Original Dashboard' },
        elastic_dashboard: {
          title: 'Test Dashboard',
          description: '',
          data: JSON.stringify({
            attributes: {
              title: 'Test Dashboard',
              description: '',
              panelsJSON: JSON.stringify(panelObjects),
            },
            type: 'dashboard',
          }),
        },
        status: 'completed',
        translation_result: 'full',
        comments: '',
      },
    ],
  } as unknown as MigrationResult;
}

function evaluate(actualPanels: number, expectedPanelCount: number | undefined) {
  const evaluator = createPanelCountPreservationEvaluator();
  return evaluator.evaluate({
    input: {
      original_dashboard_export: '',
      resources: [],
    } as unknown as DashboardExample['input'],
    output: makeMigrationResult(actualPanels),
    expected: { panel_count: expectedPanelCount } as unknown as DashboardExpected,
    metadata: {
      category: 'standard',
      has_lookups: false,
      has_markdown_panels: false,
      panel_count: expectedPanelCount ?? 0,
      complexity: 'low',
    } as unknown as DashboardExample['metadata'],
  });
}

describe('Panel Count Preservation evaluator', () => {
  it('scores 1 when the panel count matches', async () => {
    const result = await evaluate(4, 4);

    expect(result.score).toBe(1);
    expect(result.explanation).toContain('Panel count matches: 4');
  });

  it('scores 0 on a genuine mismatch between two non-zero counts', async () => {
    const result = await evaluate(3, 4);

    expect(result.score).toBe(0);
    expect(result.explanation).toContain('expected 4, got 3');
  });

  it('scores 1 when the source dashboard genuinely has no panels', async () => {
    const result = await evaluate(0, 0);

    expect(result.score).toBe(1);
  });

  it('returns null when panel_count is absent from the dataset', async () => {
    const result = await evaluate(4, undefined);

    expect(result.score).toBeNull();
    expect(result.explanation).toBe('No expected panel_count in dataset');
  });

  // The biting case: 3 of the 5 standard-dashboard dataset entries ship
  // `panel_count: 0` while their source Splunk XML defines real panels, so every
  // run scored a hard 0 regardless of migration quality. An unpopulated ground
  // truth must not be reported as a model failure.
  it('returns null instead of 0 when ground truth is unpopulated', async () => {
    const result = await evaluate(20, 0);

    expect(result.score).toBeNull();
    expect(result.explanation).toContain('produced 20 panels');
    expect(result.explanation).toContain('unscored');
    expect(result.metadata).toMatchObject({
      expectedCount: 0,
      actualCount: 20,
      unpopulatedGroundTruth: true,
    });
  });
});
