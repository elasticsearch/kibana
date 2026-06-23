/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Rule, RuleChangeHistoryDocument } from '@kbn/alerting-plugin/server';
import { generateChangeHistoryDocument } from '@kbn/change-history/test_utils';
import { getQueryRuleParams } from '../../../../../rule_schema/mocks';
import type { RuleParams } from '../../../../../rule_schema';
import { mapRuleHistoryItem } from './map_rule_history_item';

describe('mapRuleHistoryItem', () => {
  it('returns the API-shaped item with `rule` converted to "RuleResponse"', () => {
    const item = mapRuleHistoryItem(buildHistoryDoc({ name: 'My Rule' }));

    expect(item).toMatchObject({
      timestamp: expect.any(String),
      id: 'event-1',
      user: { name: 'test-user' },
      action: 'rule_update',
      old_values: null,
      metadata: { reason: 'manual edit' },
    });
    expect(item.rule.name).toBe('My Rule');
  });

  it('omits rule_id, revision, and version from the API item', () => {
    const item = mapRuleHistoryItem(buildHistoryDoc());
    expect(item).not.toHaveProperty('rule_id');
    expect(item).not.toHaveProperty('revision');
    expect(item).not.toHaveProperty('version');
  });

  it('returns null `old_values` when no predecessor is supplied', () => {
    const item = mapRuleHistoryItem(buildHistoryDoc());
    expect(item.old_values).toBeNull();
  });

  it('returns the RFC 7396 merge patch in `old_values` when a predecessor differs', () => {
    const current = buildHistoryDoc({ name: 'B' });
    const previous = buildHistoryDoc({ name: 'A' });

    const item = mapRuleHistoryItem(current, previous);

    expect(item.old_values).toMatchObject({ name: 'A' });
  });

  it('returns a non-null `old_values` object when a predecessor is supplied', () => {
    const item = mapRuleHistoryItem(buildHistoryDoc(), buildHistoryDoc());
    expect(item.old_values).not.toBeNull();
    expect(typeof item.old_values).toBe('object');
  });

  it('returns a null `user` when the change history doc has no user', () => {
    const item = mapRuleHistoryItem(buildHistoryDoc({}, { user: undefined }));
    expect(item.user).toBeNull();
  });

  it('passes the user profile `id` through when present', () => {
    const item = mapRuleHistoryItem(
      buildHistoryDoc({}, { user: { id: 'profile-1', name: 'alice' } })
    );
    expect(item.user).toEqual({ id: 'profile-1', name: 'alice' });
  });

  it('forwards metadata as-is', () => {
    const item = mapRuleHistoryItem(
      buildHistoryDoc({}, { metadata: { reason: 'ui edit', extra: { key: 1 } } })
    );
    expect(item.metadata).toEqual({ reason: 'ui edit', extra: { key: 1 } });
  });

  it('normalizes metadata bulkCount to bulk_count', () => {
    const item = mapRuleHistoryItem(
      buildHistoryDoc({}, { metadata: { bulkCount: 3, reason: 'bulk op' } })
    );
    expect(item.metadata).toEqual({ bulk_count: 3, reason: 'bulk op' });
  });

  const buildRule = (overrides: Partial<Rule<RuleParams>> = {}): Rule<RuleParams> => ({
    id: '04128c15-0d1b-4716-a4c5-46997ac7f3bd',
    name: 'Rule',
    tags: [],
    alertTypeId: 'siem.queryRule',
    consumer: 'siem',
    enabled: true,
    actions: [],
    throttle: null,
    notifyWhen: null,
    createdBy: 'elastic',
    updatedBy: 'elastic',
    apiKeyOwner: 'elastic',
    muteAll: false,
    mutedInstanceIds: [],
    schedule: { interval: '5m' },
    revision: 0,
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    updatedAt: new Date('2026-05-01T10:00:00.000Z'),
    executionStatus: {
      status: 'unknown',
      lastExecutionDate: new Date('2026-05-01T10:00:00.000Z'),
    },
    params: getQueryRuleParams(),
    ...overrides,
  });

  const buildHistoryDoc = (
    ruleOverrides: Partial<Rule<RuleParams>> = {},
    docOverrides: Partial<RuleChangeHistoryDocument> = {}
  ): RuleChangeHistoryDocument<RuleParams> => ({
    ...generateChangeHistoryDocument({
      metadata: { reason: 'manual edit' },
      ...docOverrides,
    }),
    rule: buildRule(ruleOverrides),
  });
});
