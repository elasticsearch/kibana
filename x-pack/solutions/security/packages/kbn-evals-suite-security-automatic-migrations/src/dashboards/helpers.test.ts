/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  splHasLookups,
  esqlHasLookupJoin,
  markdownHasError,
  extractIndexPatterns,
  extractEsqlQueries,
  countTranslatedPanels,
  type MigrationResult,
} from './helpers';

const LAYER_ID = '3a5310ab-2832-41db-bdbe-1b6939dd5651';

/**
 * Builds a realistic elastic_dashboard.data JSON string containing the given panels.
 */
function makeElasticDashboardData(
  panels: Array<{
    title: string;
    esqlQuery?: string;
    indexPattern?: string;
    visualizationType?: string;
  }>
): string {
  const panelObjects = panels.map((p, i) => {
    const layerId = LAYER_ID;
    const hasEsql = !!p.esqlQuery;
    return {
      type: 'lens',
      panelIndex: `panel-${i}`,
      title: p.title,
      gridData: { x: 0, y: i * 6, w: 24, h: 6, i: `panel-${i}` },
      embeddableConfig: {
        attributes: {
          visualizationType: p.visualizationType ?? 'lnsXY',
          state: {
            datasourceStates: {
              textBased: {
                layers: hasEsql
                  ? {
                      [layerId]: {
                        index: 'adhoc-id',
                        query: { esql: p.esqlQuery },
                        columns: [],
                      },
                    }
                  : {},
                indexPatternRefs: p.indexPattern
                  ? [{ id: 'adhoc-id', title: p.indexPattern, timeField: '@timestamp' }]
                  : [],
              },
            },
            filters: [],
            query: { esql: hasEsql ? p.esqlQuery : '' },
            visualization: {},
          },
        },
      },
    };
  });

  const dashboardData = {
    attributes: {
      title: 'Test Dashboard',
      description: '',
      panelsJSON: JSON.stringify(panelObjects),
    },
    type: 'dashboard',
  };
  return JSON.stringify(dashboardData);
}

function makeMigrationResult(
  panels: Array<{
    title: string;
    esqlQuery?: string;
    indexPattern?: string;
    visualizationType?: string;
  }>,
  translationResult: string = 'full'
): MigrationResult {
  return {
    migrationId: 'test',
    dashboards: [
      {
        id: 'd1',
        original_dashboard: { id: 'orig1', title: 'Original Dashboard' },
        elastic_dashboard: {
          title: 'Test Dashboard',
          description: '',
          data: makeElasticDashboardData(panels),
        },
        translation_result: translationResult,
        comments: '',
      },
    ],
    stats: {},
  };
}

describe('splHasLookups', () => {
  it('detects piped lookup commands', () => {
    expect(splHasLookups('index=main | lookup users_lookup user_id')).toBe(true);
  });

  it('ignores inputlookup', () => {
    expect(splHasLookups('| inputlookup users.csv')).toBe(false);
  });

  it('ignores outputlookup', () => {
    expect(splHasLookups('| outputlookup results.csv')).toBe(false);
  });

  it('returns false when no lookups present', () => {
    expect(splHasLookups('index=main | stats count by src_ip')).toBe(false);
  });

  it('detects standalone lookup even when inputlookup/outputlookup also present', () => {
    expect(splHasLookups('lookup users | inputlookup extra.csv')).toBe(true);
    expect(splHasLookups('| inputlookup a.csv | lookup users user_id')).toBe(true);
  });
});

describe('esqlHasLookupJoin', () => {
  it('detects LOOKUP JOIN clause', () => {
    expect(esqlHasLookupJoin('FROM logs-* | LOOKUP JOIN users ON user_id')).toBe(true);
  });

  it('returns false when no LOOKUP JOIN', () => {
    expect(esqlHasLookupJoin('FROM logs-* | STATS count = COUNT(*)')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(esqlHasLookupJoin('FROM logs-* | lookup join users ON id')).toBe(true);
  });
});

describe('markdownHasError', () => {
  it('detects Error: prefix', () => {
    expect(markdownHasError('Error: translation failed')).toBe(true);
  });

  it('detects with leading whitespace', () => {
    expect(markdownHasError('  Error: something went wrong')).toBe(true);
  });

  it('returns false for clean content', () => {
    expect(markdownHasError('## Dashboard Notes\nThis dashboard shows...')).toBe(false);
  });

  it('returns false for legitimate error metric names', () => {
    expect(markdownHasError('This panel tracks error rates')).toBe(false);
  });
});

describe('extractEsqlQueries', () => {
  it('extracts queries from translated panels', () => {
    const result = makeMigrationResult([
      { title: 'Panel 1', esqlQuery: 'FROM logs-* | STATS count()', indexPattern: 'logs-*' },
      { title: 'No Query Panel' },
    ]);
    const queries = extractEsqlQueries(result);
    expect(queries).toEqual([{ panelTitle: 'Panel 1', query: 'FROM logs-* | STATS count()' }]);
  });

  it('returns empty array when no queries', () => {
    const result = makeMigrationResult([{ title: 'No Query Panel' }]);
    expect(extractEsqlQueries(result)).toEqual([]);
  });

  it('returns empty array when elastic_dashboard is missing', () => {
    const result: MigrationResult = {
      migrationId: 'test',
      dashboards: [
        {
          id: 'd1',
          original_dashboard: {},
        },
      ],
      stats: {},
    };
    expect(extractEsqlQueries(result)).toEqual([]);
  });

  it('returns empty array when elastic_dashboard.data is invalid JSON', () => {
    const result: MigrationResult = {
      migrationId: 'test',
      dashboards: [
        {
          id: 'd1',
          original_dashboard: {},
          elastic_dashboard: { data: 'not-json', title: 'T', description: '' },
        },
      ],
      stats: {},
    };
    expect(extractEsqlQueries(result)).toEqual([]);
  });
});

describe('extractIndexPatterns', () => {
  it('extracts index from indexPatternRefs', () => {
    const result = makeMigrationResult([
      {
        title: 'Panel 1',
        esqlQuery: 'FROM logs-network.* | STATS count()',
        indexPattern: 'logs-network.*',
      },
    ]);
    const patterns = extractIndexPatterns(result);
    expect(patterns).toEqual([{ panelTitle: 'Panel 1', indexPattern: 'logs-network.*' }]);
  });

  it('falls back to parsing FROM clause when no indexPatternRefs', () => {
    const result = makeMigrationResult([
      {
        title: 'Panel 1',
        esqlQuery: 'FROM logs-endpoint.events.* | WHERE agent.type == "endpoint"',
      },
    ]);
    const patterns = extractIndexPatterns(result);
    expect(patterns).toEqual([{ panelTitle: 'Panel 1', indexPattern: 'logs-endpoint.events.*' }]);
  });
});

describe('countTranslatedPanels', () => {
  it('counts panels across dashboards', () => {
    const result = makeMigrationResult([
      { title: 'P1', esqlQuery: 'FROM logs-*' },
      { title: 'P2', esqlQuery: 'FROM logs-*' },
    ]);
    expect(countTranslatedPanels(result)).toBe(2);
  });

  it('returns 0 when no elastic_dashboard', () => {
    const result: MigrationResult = {
      migrationId: 'test',
      dashboards: [{ id: 'd1', original_dashboard: {} }],
      stats: {},
    };
    expect(countTranslatedPanels(result)).toBe(0);
  });
});
