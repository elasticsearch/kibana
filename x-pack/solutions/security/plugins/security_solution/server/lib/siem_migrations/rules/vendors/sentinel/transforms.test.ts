/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SentinelRule } from '../../../../../../common/siem_migrations/parsers/sentinel/types';
import {
  SENTINEL_DEFAULT_QUERY_FREQUENCY,
  SENTINEL_NRT_RULE_KIND,
  SENTINEL_RULE_KIND_ANNOTATION_KEY,
  SENTINEL_SCHEDULED_RULE_KIND,
} from './constants';
import { transformSentinelMitreMapping, transformSentinelRuleToOriginalRule } from './transforms';

const baseSentinelRule: SentinelRule = {
  id: 'rule-id-1',
  kind: SENTINEL_SCHEDULED_RULE_KIND,
  displayName: 'Suspicious sign-in',
  description: 'Detects suspicious sign-in activity',
  query: 'SigninLogs | where ResultType != 0',
  severity: 'Medium',
};

describe('transformSentinelMitreMapping', () => {
  it('returns an empty array when tactics are undefined', () => {
    expect(transformSentinelMitreMapping(undefined, ['T1078'])).toEqual([]);
  });

  it('returns an empty array when tactics are empty', () => {
    expect(transformSentinelMitreMapping([], ['T1078'])).toEqual([]);
  });

  it('filters out tactics that are not in the known map', () => {
    expect(transformSentinelMitreMapping(['NotARealTactic'], [])).toEqual([]);
  });

  it('maps a single tactic with techniques attached', () => {
    const result = transformSentinelMitreMapping(['InitialAccess'], ['T1078', 'T1566']);

    expect(result).toEqual([
      {
        framework: 'MITRE ATT&CK',
        tactic: {
          id: 'TA0001',
          reference: expect.stringContaining('TA0001'),
          name: 'Initial Access',
        },
        technique: [
          {
            id: 'T1078',
            reference: expect.stringContaining('T1078'),
            name: 'T1078',
          },
          {
            id: 'T1566',
            reference: expect.stringContaining('T1566'),
            name: 'T1566',
          },
        ],
      },
    ]);
  });

  it('omits techniques when multiple tactics are present (ambiguous mapping)', () => {
    const result = transformSentinelMitreMapping(
      ['InitialAccess', 'Execution'],
      ['T1078', 'T1059']
    );

    expect(result).toHaveLength(2);
    expect(result.every((threat) => threat.technique?.length === 0)).toBe(true);
    expect(result.map((threat) => threat.tactic.id)).toEqual(['TA0001', 'TA0002']);
  });
});

describe('transformSentinelRuleToOriginalRule', () => {
  it('maps required fields and hardcodes vendor and query language', () => {
    const result = transformSentinelRuleToOriginalRule(baseSentinelRule);

    expect(result).toMatchObject({
      id: 'rule-id-1',
      vendor: 'microsoft-sentinel',
      title: 'Suspicious sign-in',
      description: 'Detects suspicious sign-in activity',
      query: 'SigninLogs | where ResultType != 0',
      query_language: 'kql',
      annotations: {
        [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      },
    });
  });

  it('lowercases the severity value', () => {
    const result = transformSentinelRuleToOriginalRule({ ...baseSentinelRule, severity: 'High' });

    expect(result.severity).toBe('high');
  });

  it('omits the threat field when no tactics are present', () => {
    const result = transformSentinelRuleToOriginalRule(baseSentinelRule);

    expect(result.threat).toBeUndefined();
  });

  it('includes the threat field when tactics map to a known MITRE entry', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      tactics: ['InitialAccess'],
      techniques: ['T1078'],
    });

    expect(result.threat).toHaveLength(1);
    expect(result.threat?.[0].tactic.id).toBe('TA0001');
    expect(result.threat?.[0].technique).toHaveLength(1);
    expect(result.threat?.[0].technique?.[0].id).toBe('T1078');
  });

  it('adds converted Sentinel timing overrides to annotations', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: 'PT5M',
      queryPeriod: 'PT5M30S',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      from: 'now-330s',
      to: 'now',
      interval: '5m',
    });
  });

  it('converts mixed Sentinel ISO durations to seconds', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: 'PT1M30S',
      queryPeriod: 'PT2M30S',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      from: 'now-150s',
      to: 'now',
      interval: '90s',
    });
  });

  it('converts Sentinel ISO durations with years and months', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: 'P1Y',
      queryPeriod: 'P2M',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      from: 'now-2M',
      to: 'now',
      interval: '1y',
    });
  });

  it('omits mixed calendar durations that cannot be represented as one unit', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: 'P1Y2M',
      queryPeriod: 'P2M1D',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
    });
  });

  it.each([
    ['week duration', 'P1W'],
    ['fractional duration', 'PT0.5H'],
    ['date-plus-time duration', 'P1DT2H'],
  ])('omits unsupported %s overrides', (_description, duration) => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: duration,
      queryPeriod: duration,
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
    });
  });

  it('omits the time range when queryPeriod is empty', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: 'PT1M',
      queryPeriod: '',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      interval: '1m',
    });
  });

  it('omits the interval when queryFrequency is empty', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      queryFrequency: '',
      queryPeriod: 'PT1M',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_SCHEDULED_RULE_KIND,
      from: 'now-1m',
      to: 'now',
    });
  });

  it('adds the Sentinel NRT default interval when queryFrequency is missing', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      kind: SENTINEL_NRT_RULE_KIND,
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_NRT_RULE_KIND,
      interval: SENTINEL_DEFAULT_QUERY_FREQUENCY,
    });
  });

  it('adds the Sentinel NRT default interval when queryFrequency is empty', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      kind: SENTINEL_NRT_RULE_KIND,
      queryFrequency: '',
      queryPeriod: 'PT1M',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_NRT_RULE_KIND,
      from: 'now-1m',
      to: 'now',
      interval: SENTINEL_DEFAULT_QUERY_FREQUENCY,
    });
  });

  it('uses custom queryFrequency instead of the Sentinel NRT default interval', () => {
    const result = transformSentinelRuleToOriginalRule({
      ...baseSentinelRule,
      kind: SENTINEL_NRT_RULE_KIND,
      queryFrequency: 'PT10M',
    });

    expect(result.annotations).toEqual({
      [SENTINEL_RULE_KIND_ANNOTATION_KEY]: SENTINEL_NRT_RULE_KIND,
      interval: '10m',
    });
  });
});
