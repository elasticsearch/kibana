/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import {
  collectRuleCoverageByTechnique,
  coverageGap,
  enrichTechniquesWithRuleCoverage,
} from './coverage_gap';

const TIME_RANGE = { from: '2026-05-01T00:00:00Z', to: '2026-05-14T00:00:00Z' } as const;

const buildEsClientWithTechnique = (techniqueId: string) => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  esClient.search.mockResolvedValue({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, skipped: 0, failed: 0 },
    hits: { total: { value: 0, relation: 'eq' }, max_score: null, hits: [] },
    aggregations: {
      techniques_from_behaviors: {
        techniques: {
          buckets: [
            {
              key: techniqueId,
              doc_count: 3,
              severity_on_reports: {
                severity_max: { buckets: [{ key: 'high', doc_count: 2 }] },
              },
            },
          ],
        },
      },
      techniques_from_ttps: { buckets: [] },
    },
  } as unknown as Awaited<ReturnType<typeof esClient.search>>);
  return esClient;
};

describe('collectRuleCoverageByTechnique', () => {
  it('tracks enabled and disabled rules separately per technique', async () => {
    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      page: 1,
      per_page: 200,
      total: 2,
      saved_objects: [
        {
          id: 'enabled-rule',
          type: 'alert',
          attributes: {
            enabled: true,
            params: {
              threat: [{ technique: [{ id: 'T1059', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
        {
          id: 'disabled-rule',
          type: 'alert',
          attributes: {
            enabled: false,
            params: {
              threat: [{ technique: [{ id: 'T1059', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
        {
          id: 'disabled-other',
          type: 'alert',
          attributes: {
            enabled: false,
            params: {
              threat: [{ technique: [{ id: 'T1071', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
      ],
    });

    const coverage = await collectRuleCoverageByTechnique(savedObjectsClient);

    expect(coverage.get('T1059')).toEqual({
      enabledCount: 1,
      disabledCount: 1,
      disabledRuleIds: ['disabled-rule'],
    });
    expect(coverage.get('T1071')).toEqual({
      enabledCount: 0,
      disabledCount: 1,
      disabledRuleIds: ['disabled-other'],
    });
  });
});

describe('enrichTechniquesWithRuleCoverage', () => {
  it('merges rule coverage onto dashboard technique rows', async () => {
    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      page: 1,
      per_page: 200,
      total: 1,
      saved_objects: [
        {
          id: 'disabled-rule',
          type: 'alert',
          attributes: {
            enabled: false,
            params: {
              threat: [{ technique: [{ id: 'T1071', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
      ],
    });

    const coverage = await collectRuleCoverageByTechnique(savedObjectsClient);
    const enriched = enrichTechniquesWithRuleCoverage(
      [
        { technique_id: 'T1059', report_count: 5 },
        { technique_id: 'T1071', report_count: 3 },
      ],
      coverage
    );

    expect(enriched[0]).toMatchObject({
      technique_id: 'T1059',
      coverage_recommendation: 'create_rule',
    });
    expect(enriched[1]).toMatchObject({
      technique_id: 'T1071',
      coverage_recommendation: 'enable_existing',
      matching_disabled_rule_ids: ['disabled-rule'],
    });
  });
});

describe('coverageGap', () => {
  it('recommends enable_existing when only disabled rules match', async () => {
    const esClient = buildEsClientWithTechnique('T1059');
    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      page: 1,
      per_page: 200,
      total: 1,
      saved_objects: [
        {
          id: 'rule-disabled-1',
          type: 'alert',
          attributes: {
            enabled: false,
            params: {
              threat: [{ technique: [{ id: 'T1059', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
      ],
    });

    const result = await coverageGap(
      esClient,
      savedObjectsClient,
      loggingSystemMock.create().get(),
      'default',
      { time_range: TIME_RANGE, max_techniques: 10 }
    );

    expect(result.counts).toMatchObject({
      covered: 0,
      enable_existing: 1,
      uncovered: 0,
    });
    expect(result.techniques_to_enable).toEqual(['T1059']);
    expect(result.uncovered_techniques).toEqual([]);
    expect(result.techniques[0]).toMatchObject({
      technique_id: 'T1059',
      has_coverage: false,
      matching_rule_count: 0,
      matching_disabled_rule_count: 1,
      coverage_recommendation: 'enable_existing',
      matching_disabled_rule_ids: ['rule-disabled-1'],
    });
    expect(result.next_step).toContain('enable_existing');
    expect(result.next_step).not.toContain('create_detection_rule');
  });

  it('marks technique covered when an enabled rule exists', async () => {
    const esClient = buildEsClientWithTechnique('T1059');
    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      page: 1,
      per_page: 200,
      total: 1,
      saved_objects: [
        {
          id: 'rule-enabled-1',
          type: 'alert',
          attributes: {
            enabled: true,
            params: {
              threat: [{ technique: [{ id: 'T1059', subtechnique: [] }] }],
            },
          },
          references: [],
          score: 0,
        },
      ],
    });

    const result = await coverageGap(
      esClient,
      savedObjectsClient,
      loggingSystemMock.create().get(),
      'default',
      { time_range: TIME_RANGE, max_techniques: 10 }
    );

    expect(result.counts).toMatchObject({
      covered: 1,
      enable_existing: 0,
      uncovered: 0,
    });
    expect(result.techniques[0]).toMatchObject({
      coverage_recommendation: 'covered',
      has_coverage: true,
      matching_rule_count: 1,
    });
  });

  it('recommends create_rule when no matching rules exist', async () => {
    const esClient = buildEsClientWithTechnique('T1059');
    const savedObjectsClient = savedObjectsClientMock.create();
    savedObjectsClient.find.mockResolvedValue({
      page: 1,
      per_page: 200,
      total: 0,
      saved_objects: [],
    });

    const result = await coverageGap(
      esClient,
      savedObjectsClient,
      loggingSystemMock.create().get(),
      'default',
      { time_range: TIME_RANGE, max_techniques: 10 }
    );

    expect(result.counts).toMatchObject({
      covered: 0,
      enable_existing: 0,
      uncovered: 1,
    });
    expect(result.uncovered_techniques).toEqual(['T1059']);
    expect(result.techniques_to_enable).toEqual([]);
    expect(result.techniques[0]).toMatchObject({
      coverage_recommendation: 'create_rule',
      matching_disabled_rule_count: 0,
    });
    expect(result.next_step).toContain('create_rule');
  });
});
