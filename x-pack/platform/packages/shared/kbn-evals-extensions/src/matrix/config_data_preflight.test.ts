/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import { parseMatrixConfig } from './load_matrix_config';
import type { AggregatedModelScores } from './query_matrix_scores';
import { warnOnDataAboutToLeaveLookback } from './config_data_preflight';

const collectWarnings = () => {
  const warnings: string[] = [];
  const log = {
    warning: (msg: string) => warnings.push(String(msg)),
    info: () => {},
    debug: () => {},
  } as unknown as ToolingLog;
  return { warnings, log };
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-09-02T00:00:00.000Z');

const config = parseMatrixConfig({
  lookbackDays: 45,
  columns: [
    {
      id: 'migrations-rules',
      label: 'Rule Translation',
      suites: ['security-automatic-migrations'],
    },
    { id: 'triage', label: 'Triage', suites: ['persona-matrix'] },
  ],
  models: [{ id: 'model-a', label: 'A' }],
});

const scores = (suiteId: string, ageDays: number): AggregatedModelScores[] => [
  {
    modelId: 'model-a',
    provider: 'p',
    suites: [
      {
        suiteId,
        experimentId: 'e1',
        timestamp: new Date(NOW - ageDays * DAY).toISOString(),
        datasets: [
          {
            datasetId: 'd',
            datasetName: 'd',
            evaluators: [{ evaluatorName: 'Rubric', mean: 0.8, count: 10 }],
          },
        ],
      },
    ],
  },
];

describe('warnOnDataAboutToLeaveLookback', () => {
  // The migrations columns are pinned to a branch whose newest run is 34 days
  // old against a 45-day window. Nothing is wrong today and nothing will fail
  // loudly on 2026-09-13 either: the columns will simply go blank, exactly the
  // silent-blanking failure this module exists to catch.
  it('warns when a suite is inside the window but close to falling out', () => {
    const { warnings, log } = collectWarnings();

    warnOnDataAboutToLeaveLookback(config, scores('security-automatic-migrations', 34), log, {
      now: NOW,
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('security-automatic-migrations');
    // Says when it goes blank, so the reader can act before it does.
    expect(warnings[0]).toContain('11 day');
  });

  it('stays silent for data with comfortable headroom', () => {
    const { warnings, log } = collectWarnings();

    warnOnDataAboutToLeaveLookback(config, scores('persona-matrix', 3), log, { now: NOW });

    expect(warnings).toEqual([]);
  });

  // A column whose data already aged out is a different (louder) failure: the
  // cell is blank NOW, so warning about a future expiry would be misleading.
  it('does not warn about data that already left the window', () => {
    const { warnings, log } = collectWarnings();

    warnOnDataAboutToLeaveLookback(config, scores('security-automatic-migrations', 60), log, {
      now: NOW,
    });

    expect(warnings).toEqual([]);
  });
});
