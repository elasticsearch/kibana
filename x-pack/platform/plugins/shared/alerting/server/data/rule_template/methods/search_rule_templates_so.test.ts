/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import { nodeBuilder } from '@kbn/es-query';
import { RULE_TEMPLATE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import { buildTemplateSearchQuery } from '../../../rules_client/common/filters';
import { searchRuleTemplatesSo } from './search_rule_templates_so';

describe('searchRuleTemplatesSo', () => {
  const savedObjectsClient = savedObjectsClientMock.create();
  const attributes = {
    name: 'Kubernetes idle data threshold',
    ruleTypeId: 'test.rule.type',
    schedule: { interval: '1m' },
    params: {},
    tags: ['k8s'],
  };

  it('maps hits, applies the v1 engine filter, and rewrites KQL field names', async () => {
    savedObjectsClient.search.mockResolvedValue({
      took: 1,
      timed_out: false,
      _shards: { total: 1, successful: 1, failed: 0 },
      hits: {
        total: { value: 1, relation: 'eq' },
        hits: [
          {
            _index: '.kibana',
            _id: `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}:template-1`,
            _source: {
              type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
              [RULE_TEMPLATE_SAVED_OBJECT_TYPE]: attributes,
              references: [],
            },
          },
        ],
      },
    });

    const searchQuery = buildTemplateSearchQuery('idle data');
    expect(searchQuery).toBeDefined();
    if (!searchQuery) {
      return;
    }

    const result = await searchRuleTemplatesSo({
      savedObjectsClient,
      namespaces: ['default'],
      page: 1,
      perPage: 10,
      searchQuery,
      filter: nodeBuilder.is(
        `${RULE_TEMPLATE_SAVED_OBJECT_TYPE}.attributes.ruleTypeId`,
        'test.rule.type'
      ),
    });

    expect(result.saved_objects).toEqual([
      {
        id: 'template-1',
        type: RULE_TEMPLATE_SAVED_OBJECT_TYPE,
        attributes,
        references: [],
        score: 0,
      },
    ]);

    const serialized = JSON.stringify(savedObjectsClient.search.mock.calls[0][0].query);
    expect(serialized).toContain('alerting_rule_template.engine');
    expect(serialized).toContain('alerting_rule_template.ruleTypeId');
    expect(serialized).not.toContain('alerting_rule_template.attributes.ruleTypeId');
    expect(serialized).toContain('*idle data*');
  });
});
