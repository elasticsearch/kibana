/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import { RULE_ATTACHMENT_TYPE } from '@kbn/alerting-v2-schemas';
import { RULE_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type { RulesClient } from '../../lib/rules_client';
import { RULE_SAVED_OBJECT_TYPE, type RuleSavedObjectAttributes } from '../../saved_objects';
import { createRuleSmlType } from './rule_sml_type';

const baseRuleAttrs: RuleSavedObjectAttributes = {
  kind: 'alert',
  metadata: {
    name: 'High CPU',
    description: 'CPU breach detection',
    tags: ['ops', 'cpu'],
    owner: 'observability',
  },
  time_field: '@timestamp',
  schedule: { every: '5m', lookback: '15m' },
  query: {
    format: 'standalone',
    breach: { query: 'FROM metrics-* | STATS avg_cpu = AVG(cpu) BY host.name' },
  },
  state_transition: null,
  enabled: true,
  createdBy: 'elastic',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedBy: 'elastic',
  updatedAt: '2026-04-10T00:00:00.000Z',
} as RuleSavedObjectAttributes;

// `getRule` returns the snake_case API response, not the saved object attributes.
const { createdBy, createdAt, updatedBy, updatedAt, ...restRuleAttrs } = baseRuleAttrs;
const baseRuleResponse = {
  ...restRuleAttrs,
  created_by: createdBy,
  created_at: createdAt,
  updated_by: updatedBy,
  updated_at: updatedAt,
  metadata: { ...baseRuleAttrs.metadata, version: baseRuleAttrs.metadata?.version ?? 1 },
};

const buildToAttachmentContext = () => ({
  request: {} as KibanaRequest,
  savedObjectsClient: {} as SavedObjectsClientContract,
  spaceId: 'default',
});

describe('createRuleSmlType', () => {
  let getRule: jest.Mock;
  let getIsAlertingV2Enabled: jest.Mock;
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;
  let rulesClient: RulesClient;

  const buildSmlContext = (logger = loggingSystemMock.createLogger()) => ({
    esClient: {} as ElasticsearchClient,
    savedObjectsClient: soClient,
    logger,
  });

  const stubFinder = (find: () => AsyncGenerator<unknown>) => {
    const close = jest.fn().mockResolvedValue(undefined);
    soClient.createPointInTimeFinder.mockReturnValue({ find, close } as unknown as ReturnType<
      typeof soClient.createPointInTimeFinder
    >);
    return close;
  };

  beforeEach(() => {
    getRule = jest.fn();
    getIsAlertingV2Enabled = jest.fn().mockResolvedValue(true);
    soClient = savedObjectsClientMock.create();
    rulesClient = { getRule } as unknown as RulesClient;
  });

  const buildDefinition = () =>
    createRuleSmlType({
      getScopedRulesClient: () => rulesClient,
      getIsAlertingV2Enabled: () => getIsAlertingV2Enabled(),
    });

  describe('id and fetchFrequency', () => {
    it('uses the shared RULE_KI_TYPE constant', () => {
      expect(buildDefinition().id).toBe(RULE_KI_TYPE);
    });

    it('returns "1m" as fetch frequency', () => {
      expect(buildDefinition().fetchFrequency!()).toBe('1m');
    });
  });

  describe('list', () => {
    const drainList = async () => {
      const items = [];
      const def = buildDefinition();
      for await (const page of def.list(buildSmlContext())) {
        items.push(...page);
      }
      return items;
    };

    it('yields items from the saved objects finder and closes it when done', async () => {
      const close = stubFinder(async function* () {
        yield {
          saved_objects: [
            {
              id: 'rule-1',
              updated_at: '2026-04-10T00:00:00.000Z',
              namespaces: ['default', 'space-a'],
            },
            {
              id: 'rule-2',
              updated_at: '2026-04-11T00:00:00.000Z',
              namespaces: ['default'],
            },
          ],
        };
      });

      const items = await drainList();

      expect(items).toEqual([
        {
          id: 'rule-1',
          updatedAt: '2026-04-10T00:00:00.000Z',
          spaces: ['default', 'space-a'],
        },
        { id: 'rule-2', updatedAt: '2026-04-11T00:00:00.000Z', spaces: ['default'] },
      ]);
      expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RULE_SAVED_OBJECT_TYPE,
          namespaces: ['*'],
          fields: [],
        })
      );
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('falls back to "default" namespace and a fresh timestamp when missing', async () => {
      stubFinder(async function* () {
        yield {
          saved_objects: [{ id: 'rule-no-meta' }],
        };
      });

      const items = await drainList();

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        id: 'rule-no-meta',
        spaces: ['default'],
        updatedAt: expect.any(String),
      });
      expect(() => new Date(items[0].updatedAt).toISOString()).not.toThrow();
    });

    it('closes the finder even if iteration throws', async () => {
      const close = stubFinder(async function* () {
        yield { saved_objects: [{ id: 'rule-1' }] };
        throw new Error('boom');
      });

      await expect(drainList()).rejects.toThrow('boom');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('yields nothing and never opens a PIT finder when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const items = await drainList();

      expect(items).toEqual([]);
      expect(soClient.createPointInTimeFinder).not.toHaveBeenCalled();
    });
  });

  describe('getSmlEntry', () => {
    it('reads the origin through the shared client and builds an entry from metadata + query', async () => {
      soClient.get.mockResolvedValueOnce({
        id: 'rule-1',
        type: RULE_SAVED_OBJECT_TYPE,
        references: [],
        attributes: baseRuleAttrs,
      });

      const result = await buildDefinition().getSmlEntry('rule-1', buildSmlContext());

      expect(soClient.get).toHaveBeenCalledWith(RULE_SAVED_OBJECT_TYPE, 'rule-1');
      expect(result).toEqual({
        type: RULE_KI_TYPE,
        title: 'High CPU',
        content: [
          'High CPU',
          'CPU breach detection',
          'alert',
          'ops, cpu',
          (baseRuleAttrs.query as { breach: { query: string } }).breach.query,
        ].join('\n'),
      });
      expect(result).not.toHaveProperty('permissions');
    });

    it('falls back to originId for title when metadata.name is missing', async () => {
      soClient.get.mockResolvedValueOnce({
        id: 'rule-bare',
        type: RULE_SAVED_OBJECT_TYPE,
        references: [],
        attributes: {
          ...baseRuleAttrs,
          metadata: undefined,
        } as unknown as RuleSavedObjectAttributes,
      });

      const result = await buildDefinition().getSmlEntry('rule-bare', buildSmlContext());

      expect(result?.title).toBe('rule-bare');
    });

    it('returns undefined and logs a warning when the saved object lookup throws', async () => {
      soClient.get.mockRejectedValueOnce(new Error('not found'));
      const logger = loggingSystemMock.createLogger();

      const result = await buildDefinition().getSmlEntry('rule-missing', buildSmlContext(logger));

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("SML rule: failed to get data for 'rule-missing'")
      );
    });

    it('returns undefined without reading the saved object when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const result = await buildDefinition().getSmlEntry('rule-1', buildSmlContext());

      expect(result).toBeUndefined();
      expect(soClient.get).not.toHaveBeenCalled();
    });
  });

  describe('getPermissions', () => {
    it('returns the registered ai_index read action for rules', () => {
      const permissions = buildDefinition().getPermissions!('rule-1', buildSmlContext());
      expect(permissions).toEqual({
        kibana: { privileges: { name: [`ai_index:${RULE_KI_TYPE}/read`] } },
      });
    });
  });

  describe('toAttachment', () => {
    const buildSmlDocument = (overrides: Partial<{ origin_id: string }> = {}) => {
      const originId = overrides.origin_id ?? 'rule-1';
      return {
        type: RULE_KI_TYPE,
        title: 'High CPU',
        content: '',
        permissions: { kibana: { privileges: [] } },
        attributes: {
          id: 'sml-1',
          origin: { uri: `${RULE_KI_TYPE}://${originId}` },
          created_at: '2026-04-10T00:00:00.000Z',
          updated_at: '2026-04-10T00:00:00.000Z',
          ingestion_method: 'crawled' as const,
        },
      };
    };

    it('returns an attachment input wrapping the parsed rule', async () => {
      getRule.mockResolvedValueOnce({
        ...baseRuleResponse,
        id: 'rule-1',
      });

      const result = await buildDefinition().toAttachment(
        buildSmlDocument(),
        buildToAttachmentContext()
      );

      expect(getRule).toHaveBeenCalledWith({ id: 'rule-1' });
      expect(result?.type).toBe(RULE_ATTACHMENT_TYPE);
      expect(result?.data).toEqual(expect.objectContaining({ id: 'rule-1', kind: 'alert' }));
    });

    it('returns undefined when getRule throws', async () => {
      getRule.mockRejectedValueOnce(new Error('not found'));

      const result = await buildDefinition().toAttachment(
        buildSmlDocument({ origin_id: 'rule-missing' }),
        buildToAttachmentContext()
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined when the response fails schema parsing', async () => {
      getRule.mockResolvedValueOnce({ id: 'rule-broken' });

      const result = await buildDefinition().toAttachment(
        buildSmlDocument({ origin_id: 'rule-broken' }),
        buildToAttachmentContext()
      );

      expect(result).toBeUndefined();
    });

    it('returns undefined without calling the rules client when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const result = await buildDefinition().toAttachment(
        buildSmlDocument(),
        buildToAttachmentContext()
      );

      expect(result).toBeUndefined();
      expect(getRule).not.toHaveBeenCalled();
    });
  });
});
