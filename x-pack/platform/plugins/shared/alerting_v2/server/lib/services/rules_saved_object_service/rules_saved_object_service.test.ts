/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { RULE_SAVED_OBJECT_TYPE } from '../../../saved_objects';
import type { RulesSavedObjectService } from './rules_saved_object_service';
import { createRulesSavedObjectService } from './rules_saved_object_service.mock';

const mockAggregationResponse = (buckets: Array<{ key: string; doc_count: number }>) =>
  ({
    saved_objects: [],
    total: 0,
    page: 1,
    per_page: 0,
    aggregations: {
      schedule_intervals: { sum_other_doc_count: 0, buckets },
    },
  } as unknown as Awaited<ReturnType<SavedObjectsClientContract['find']>>);

describe('RulesSavedObjectService', () => {
  let rulesSavedObjectService: RulesSavedObjectService;
  let mockSavedObjectsClient: jest.Mocked<SavedObjectsClientContract>;

  beforeEach(() => {
    ({ rulesSavedObjectService, mockSavedObjectsClient } = createRulesSavedObjectService());
  });

  describe('getTotalScheduledPerMinute', () => {
    it('aggregates enabled rules across all spaces and sums their per-minute frequency', async () => {
      mockSavedObjectsClient.find.mockResolvedValue(
        mockAggregationResponse([
          { key: '1m', doc_count: 3 }, // 3 * 1 = 3
          { key: '30s', doc_count: 2 }, // 2 * 2 = 4
          { key: '5m', doc_count: 5 }, // 5 * 0.2 = 1
        ])
      );

      const total = await rulesSavedObjectService.getTotalScheduledPerMinute();

      expect(total).toBeCloseTo(8);
      expect(mockSavedObjectsClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: RULE_SAVED_OBJECT_TYPE,
          perPage: 0,
          namespaces: ['*'],
          filter: `${RULE_SAVED_OBJECT_TYPE}.attributes.enabled: true`,
          aggs: expect.objectContaining({
            schedule_intervals: {
              terms: expect.objectContaining({
                field: `${RULE_SAVED_OBJECT_TYPE}.attributes.schedule.every`,
              }),
            },
          }),
        })
      );
    });

    it('returns 0 when there are no aggregation results', async () => {
      mockSavedObjectsClient.find.mockResolvedValue({
        saved_objects: [],
        total: 0,
        page: 1,
        per_page: 0,
      } as Awaited<ReturnType<SavedObjectsClientContract['find']>>);

      expect(await rulesSavedObjectService.getTotalScheduledPerMinute()).toBe(0);
    });
  });
});
