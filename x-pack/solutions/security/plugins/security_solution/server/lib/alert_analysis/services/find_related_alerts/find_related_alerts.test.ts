/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core/server';
import { findRelatedAlerts } from './find_related_alerts';
import { RELATED_ALERT_ENTITY_SOURCE_INCLUDES } from './utils/entity_utils';

describe('findRelatedAlerts', () => {
  const esClient = {
    search: jest.fn(),
  } as unknown as ElasticsearchClient;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockSourceAlert = (source?: Record<string, unknown>) => {
    (esClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        hits: source ? [{ _source: source }] : [],
      },
    });
  };

  it('returns empty result when no source entities are present', async () => {
    mockSourceAlert({ 'kibana.alert.rule.name': 'Rule' });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.relatedAlerts).toEqual([]);
      expect(result.returnedCount).toBe(0);
      expect(result.isTruncated).toBe(false);
    }
  });

  it('returns alert_not_found when alert is missing and no entity shortcuts are provided', async () => {
    mockSourceAlert();

    const result = await findRelatedAlerts(esClient, {
      alertId: 'missing-alert',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('alert_not_found');
      expect(result.message).toContain('missing-alert');
    }
    expect(esClient.search).toHaveBeenCalledTimes(1);
  });

  it('returns search_failed when loading the source alert fails', async () => {
    (esClient.search as jest.Mock).mockRejectedValueOnce({
      meta: { statusCode: 403 },
      message: 'security_exception',
    });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('search_failed');
      expect(result.message).toContain('Failed to find related alerts');
    }
    expect(esClient.search).toHaveBeenCalledTimes(1);
  });

  it('extracts entities from nested ECS fields on the source alert', async () => {
    mockSourceAlert({ host: { name: 'host-from-alert' } });
    (esClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        total: { value: 0, relation: 'eq' },
        hits: [],
      },
    });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
    });

    expect(esClient.search).toHaveBeenNthCalledWith(1, {
      index: '.alerts-security.alerts-default',
      size: 1,
      query: { ids: { values: ['alert-1'] } },
      _source: [...RELATED_ALERT_ENTITY_SOURCE_INCLUDES],
      ignore_unavailable: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceEntities.hostNames).toEqual(['host-from-alert']);
    }
  });

  it('continues with provided entities when loading the source alert fails', async () => {
    (esClient.search as jest.Mock)
      .mockRejectedValueOnce({
        meta: { statusCode: 400 },
        message: 'source alert lookup failed',
      })
      .mockResolvedValueOnce({
        hits: {
          total: { value: 0, relation: 'eq' },
          hits: [],
        },
      });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
      hostNames: ['host-from-model'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceEntities.hostNames).toEqual(['host-from-model']);
    }
    expect(esClient.search).toHaveBeenCalledTimes(2);
  });

  it('merges partial entity shortcut params with alert source entities', async () => {
    mockSourceAlert({
      'host.name': 'host-from-alert',
      'user.name': 'user-from-alert',
    });
    (esClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        total: { value: 0, relation: 'eq' },
        hits: [],
      },
    });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
      hostNames: ['host-from-model'],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.sourceEntities.hostNames).toEqual(['host-from-alert', 'host-from-model']);
      expect(result.sourceEntities.userNames).toEqual(['user-from-alert']);
    }
  });

  it('builds a bool query that excludes the source alert and matches entity terms', async () => {
    mockSourceAlert({
      'host.name': 'host-a',
      'source.ip': '10.0.0.1',
    });
    (esClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        total: { value: 0, relation: 'eq' },
        hits: [],
      },
    });

    await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 48,
    });

    expect(esClient.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        index: '.alerts-security.alerts-default',
        query: {
          bool: {
            must: [{ range: { '@timestamp': { gte: 'now-48h' } } }],
            should: [
              { terms: { 'host.name': ['host-a'] } },
              { terms: { 'source.ip': ['10.0.0.1'] } },
            ],
            minimum_should_match: 1,
            must_not: [{ ids: { values: ['alert-1'] } }],
          },
        },
      })
    );
  });

  it('uses token-budgeted defaults, emits truncation metadata, and includes a truncation hint in the message', async () => {
    mockSourceAlert({ 'host.name': 'host-a' });
    (esClient.search as jest.Mock).mockResolvedValueOnce({
      hits: {
        total: { value: 99, relation: 'eq' },
        hits: [
          {
            _id: 'related-1',
            _index: '.alerts-security.alerts-default',
            _source: { message: 'related' },
          },
        ],
      },
    });

    const result = await findRelatedAlerts(esClient, {
      alertId: 'alert-1',
      alertsIndex: '.alerts-security.alerts-default',
      timeWindowHours: 24,
      hostNames: ['host-a'],
    });

    expect(esClient.search).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        size: 25,
        _source: expect.arrayContaining(['@timestamp', 'message', 'host.name']),
      })
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.totalMatched).toBe(99);
      expect(result.returnedCount).toBe(1);
      expect(result.isTruncated).toBe(true);
      expect(result.message).toBe(
        'Found 1 of 99 related alerts sharing entities with alert alert-1.'
      );
    }
  });
});
