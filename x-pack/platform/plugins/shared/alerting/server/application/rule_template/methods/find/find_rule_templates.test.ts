/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import { findRuleTemplates } from './find_rule_templates';
import type { SavedObjectsClientContract } from '@kbn/core/server';
import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core/server/mocks';
import { alertingAuthorizationMock } from '../../../../authorization/alerting_authorization.mock';
import type { RulesClientContext } from '../../../../rules_client/types';
import { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../../../saved_objects';
import { nodeBuilder } from '@kbn/es-query';
import { auditLoggerMock } from '@kbn/security-plugin/server/audit/mocks';

import type { AlertingAuthorization } from '../../../../authorization/alerting_authorization';

const unsecuredSavedObjectsClient = savedObjectsClientMock.create();
const authorization = alertingAuthorizationMock.create();
const auditLogger = auditLoggerMock.create();

const rulesClientContext = {
  unsecuredSavedObjectsClient,
  authorization: authorization as unknown as AlertingAuthorization,
  logger: loggingSystemMock.create().get(),
  spaceId: 'default',
} as unknown as RulesClientContext;

const rulesClientContextWithAuditLogger = {
  ...rulesClientContext,
  auditLogger,
} as unknown as RulesClientContext;

const buildRuleTypeFilter = (...ruleTypeIds: string[]) =>
  nodeBuilder.or(
    ruleTypeIds.map((id) =>
      nodeBuilder.is(`${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.attributes.ruleTypeId`, id)
    )
  );

beforeEach(() => {
  jest.resetAllMocks();
  authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
    filter: buildRuleTypeFilter('test.rule.type', 'another.rule.type'),
    ensureRuleTypeIsAuthorized: jest.fn(),
  });
});

describe('findRuleTemplates', () => {
  const mockTemplate1 = {
    id: 'template-1',
    type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
    attributes: {
      name: 'Template 1',
      description: 'My first template',
      ruleTypeId: 'test.rule.type',
      schedule: { interval: '1m' },
      params: { foo: 'bar' },
      tags: ['tag1'],
    },
    score: 1,
    references: [],
  };

  const mockTemplate2 = {
    id: 'template-2',
    type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
    attributes: {
      name: 'Template 2',
      ruleTypeId: 'another.rule.type',
      schedule: { interval: '5m' },
      params: { baz: 123 },
      tags: ['tag2'],
      artifacts: {
        dashboards: [
          {
            id: 'dashboard-1',
          },
        ],
        investigation_guide: {
          blob: 'http://example.com/guide',
        },
      },
    },
    score: 1,
    references: [],
  };

  const searchResponse = (
    ...templates: Array<{ id: string; attributes: Record<string, unknown> }>
  ): Awaited<ReturnType<SavedObjectsClientContract['search']>> => ({
    took: 1,
    timed_out: false,
    _shards: { total: 1, successful: 1, failed: 0 },
    hits: {
      total: { value: templates.length, relation: 'eq' },
      hits: templates.map((template) => ({
        _index: '.kibana',
        _id: `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}:${template.id}`,
        _source: {
          type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
          [RULE_TEMPLATE_SAVED_OBJECT_TYPE]: template.attributes,
          references: [],
        },
      })),
    },
  });

  const lastSearchQuery = () =>
    JSON.stringify(unsecuredSavedObjectsClient.search.mock.calls[0][0].query);

  test('finds rule templates with proper parameters', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(
      searchResponse(mockTemplate1, mockTemplate2)
    );

    const result = await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
    });

    expect(result).toEqual({
      page: 1,
      perPage: 10,
      total: 2,
      data: [
        {
          id: 'template-1',
          name: 'Template 1',
          description: 'My first template',
          ruleTypeId: 'test.rule.type',
          schedule: { interval: '1m' },
          params: { foo: 'bar' },
          tags: ['tag1'],
        },
        {
          id: 'template-2',
          name: 'Template 2',
          ruleTypeId: 'another.rule.type',
          schedule: { interval: '5m' },
          params: { baz: 123 },
          tags: ['tag2'],
          artifacts: {
            dashboards: [
              {
                id: 'dashboard-1',
              },
            ],
            investigation_guide: {
              blob: 'http://example.com/guide',
            },
          },
        },
      ],
    });

    expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
        namespaces: ['default'],
        from: 0,
        size: 10,
      })
    );
    expect(lastSearchQuery()).toContain('alerting_rule_template.ruleTypeId');
    expect(lastSearchQuery()).toContain('alerting_rule_template.engine');
    expect(lastSearchQuery()).not.toContain('.attributes.');

    expect(authorization.getByRuleTypeAuthorizationFilter).toHaveBeenCalledWith({
      authorizationEntity: 'rule',
      filterOpts: {
        type: 'kql',
        fieldNames: {
          ruleTypeId: `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.attributes.ruleTypeId`,
        },
      },
      operation: 'find',
    });
  });

  test('filters by specific rule type', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

    const result = await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      ruleTypeId: 'custom.rule.type',
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);

    expect(lastSearchQuery()).toContain('custom.rule.type');
  });

  test('filters by tags', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

    const result = await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      tags: ['tag1'],
    });

    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].tags).toContain('tag1');

    expect(lastSearchQuery()).toContain('tag1');
  });

  test('filters by multiple tags', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(
      searchResponse(mockTemplate1, mockTemplate2)
    );

    await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      tags: ['tag1', 'tag2'],
    });

    expect(lastSearchQuery()).toContain('tag1');
    expect(lastSearchQuery()).toContain('tag2');
  });

  test('combines ruleTypeId and tags filters', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

    await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      ruleTypeId: 'custom.rule.type',
      tags: ['tag1'],
    });

    expect(lastSearchQuery()).toContain('custom.rule.type');
    expect(lastSearchQuery()).toContain('tag1');
  });

  test('empty search omits the wildcard must clause', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValue(searchResponse(mockTemplate1));

    await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      search: '   ',
    });
    expect(lastSearchQuery()).not.toContain('wildcard');

    await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      search: 'kub',
    });
    expect(JSON.stringify(unsecuredSavedObjectsClient.search.mock.calls[1][0].query)).toContain(
      '*kub*'
    );
  });

  test('applies ascending sort order', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

    await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
      sortField: 'name',
      sortOrder: 'asc',
    });

    expect(unsecuredSavedObjectsClient.search).toHaveBeenCalledWith(
      expect.objectContaining({
        sort: [{ 'alerting_rule_template.name.keyword': { order: 'asc' } }],
      })
    );
  });

  test('handles errors from saved objects client', async () => {
    const error = new Error('Something went wrong');
    unsecuredSavedObjectsClient.search.mockRejectedValueOnce(error);

    await expect(
      findRuleTemplates(rulesClientContext, {
        perPage: 10,
        page: 1,
      })
    ).rejects.toThrow('Something went wrong');
  });

  test('returns empty results when no templates found', async () => {
    unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse());

    const result = await findRuleTemplates(rulesClientContext, {
      perPage: 10,
      page: 1,
    });

    expect(result).toEqual({
      page: 1,
      perPage: 10,
      total: 0,
      data: [],
    });
  });

  describe('authorization', () => {
    test('throws 403 when user has no access to any rule types', async () => {
      authorization.getByRuleTypeAuthorizationFilter.mockRejectedValueOnce(
        Boom.forbidden('Unauthorized to find rules for any rule types.')
      );

      await expect(
        findRuleTemplates(rulesClientContext, {
          perPage: 10,
          page: 1,
        })
      ).rejects.toMatchObject({
        output: {
          statusCode: 403,
        },
        message: 'Unauthorized to find rules for any rule types.',
      });

      expect(unsecuredSavedObjectsClient.search).not.toHaveBeenCalled();
    });

    test('filters templates to only authorized rule types', async () => {
      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type'),
        ensureRuleTypeIsAuthorized: jest.fn(),
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

      const result = await findRuleTemplates(rulesClientContext, {
        perPage: 10,
        page: 1,
      });

      expect(result.data).toHaveLength(1);
      expect(result.data[0].ruleTypeId).toBe('test.rule.type');

      expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
    });

    test('throws 403 if unauthorized template slips through filter', async () => {
      const ensureRuleTypeIsAuthorized = jest
        .fn()
        .mockImplementation((ruleTypeId: string, _authType: string) => {
          if (ruleTypeId === 'another.rule.type') {
            throw Boom.forbidden(`Unauthorized to find rule for rule type "${ruleTypeId}"`);
          }
        });

      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type'),
        ensureRuleTypeIsAuthorized,
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate2));

      await expect(
        findRuleTemplates(rulesClientContext, {
          perPage: 10,
          page: 1,
        })
      ).rejects.toMatchObject({
        output: {
          statusCode: 403,
        },
        message: 'Unauthorized to find rule for rule type "another.rule.type"',
      });
    });

    test('applies authorization filter combined with user filters', async () => {
      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type'),
        ensureRuleTypeIsAuthorized: jest.fn(),
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate1));

      await findRuleTemplates(rulesClientContext, {
        perPage: 10,
        page: 1,
        ruleTypeId: 'test.rule.type',
        tags: ['tag1'],
      });

      expect(unsecuredSavedObjectsClient.search).toHaveBeenCalled();
    });

    test('verifies all returned templates are authorized', async () => {
      const ensureRuleTypeIsAuthorized = jest.fn();
      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type', 'another.rule.type'),
        ensureRuleTypeIsAuthorized,
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(
        searchResponse(mockTemplate1, mockTemplate2)
      );

      const result = await findRuleTemplates(rulesClientContext, {
        perPage: 10,
        page: 1,
      });

      expect(result.data).toHaveLength(2);
      expect(result.data[0].ruleTypeId).toBe('test.rule.type');
      expect(result.data[1].ruleTypeId).toBe('another.rule.type');
      expect(ensureRuleTypeIsAuthorized).toHaveBeenCalledWith('test.rule.type', 'rule');
      expect(ensureRuleTypeIsAuthorized).toHaveBeenCalledWith('another.rule.type', 'rule');
    });
  });

  describe('audit logging', () => {
    test('logs audit event for each found template', async () => {
      const ensureRuleTypeIsAuthorized = jest.fn();
      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type', 'another.rule.type'),
        ensureRuleTypeIsAuthorized,
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(
        searchResponse(mockTemplate1, mockTemplate2)
      );

      await findRuleTemplates(rulesClientContextWithAuditLogger, {
        perPage: 10,
        page: 1,
      });

      expect(auditLogger.log).toHaveBeenCalledTimes(2);
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_template_find',
            outcome: 'success',
          }),
          kibana: {
            saved_object: {
              type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
              id: 'template-1',
              name: 'Template 1',
            },
          },
        })
      );
      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_template_find',
            outcome: 'success',
          }),
          kibana: {
            saved_object: {
              type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
              id: 'template-2',
              name: 'Template 2',
            },
          },
        })
      );
    });

    test('throws on authorization failure without audit logging', async () => {
      authorization.getByRuleTypeAuthorizationFilter.mockRejectedValueOnce(
        Boom.forbidden('Unauthorized to find rules for any rule types.')
      );

      await expect(
        findRuleTemplates(rulesClientContextWithAuditLogger, {
          perPage: 10,
          page: 1,
        })
      ).rejects.toThrow('Unauthorized to find rules for any rule types.');

      expect(auditLogger.log).not.toHaveBeenCalled();
    });

    test('logs audit event when unauthorized template slips through filter', async () => {
      const ensureRuleTypeIsAuthorized = jest
        .fn()
        .mockImplementation((ruleTypeId: string, _authType: string) => {
          if (ruleTypeId === 'another.rule.type') {
            throw Boom.forbidden(`Unauthorized to find rule for rule type "${ruleTypeId}"`);
          }
        });

      authorization.getByRuleTypeAuthorizationFilter.mockResolvedValue({
        filter: buildRuleTypeFilter('test.rule.type'),
        ensureRuleTypeIsAuthorized,
      });

      unsecuredSavedObjectsClient.search.mockResolvedValueOnce(searchResponse(mockTemplate2));

      await expect(
        findRuleTemplates(rulesClientContextWithAuditLogger, {
          perPage: 10,
          page: 1,
        })
      ).rejects.toThrow();

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          event: expect.objectContaining({
            action: 'rule_template_find',
            outcome: 'failure',
          }),
          error: expect.objectContaining({
            message: 'Unauthorized to find rule for rule type "another.rule.type"',
          }),
          kibana: {
            saved_object: {
              type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
              id: 'template-2',
              name: 'Template 2',
            },
          },
        })
      );
    });
  });
});
