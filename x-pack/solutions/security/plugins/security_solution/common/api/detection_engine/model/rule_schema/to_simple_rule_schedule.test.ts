/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { toSimpleRuleSchedule } from './to_simple_rule_schedule';

describe('toSimpleRuleSchedule', () => {
  it.each([
    [
      { interval: '10s', from: 'now-20s', to: 'now' },
      { interval: '10s', lookback: '10s' },
    ],
    [
      { interval: '10m', from: 'now-30m', to: 'now' },
      { interval: '10m', lookback: '20m' },
    ],
    [
      { interval: '1h', from: 'now-3h', to: 'now' },
      { interval: '1h', lookback: '2h' },
    ],
    [
      { interval: '60s', from: 'now-2m', to: 'now' },
      { interval: '60s', lookback: '1m' },
    ],
    [
      { interval: '60s', from: 'now-2h', to: 'now' },
      { interval: '60s', lookback: '119m' },
    ],
    [
      { interval: '60m', from: 'now-3h', to: 'now' },
      { interval: '60m', lookback: '2h' },
    ],
    [
      { interval: '3600s', from: 'now-5h', to: 'now' },
      { interval: '3600s', lookback: '4h' },
    ],
    [
      { interval: '1m', from: 'now-120s', to: 'now' },
      { interval: '1m', lookback: '60s' },
    ],
    [
      { interval: '1h', from: 'now-7200s', to: 'now' },
      { interval: '1h', lookback: '3600s' },
    ],
    [
      { interval: '1h', from: 'now-120m', to: 'now' },
      { interval: '1h', lookback: '60m' },
    ],
    [
      { interval: '5m', from: 'now-660s', to: 'now' },
      { interval: '5m', lookback: '360s' },
    ],
    [
      { interval: '90s', from: 'now-90s', to: 'now' },
      { interval: '90s', lookback: '0s' },
    ],
    [
      { interval: '30m', from: 'now-30m', to: 'now' },
      { interval: '30m', lookback: '0s' },
    ],
    [
      { interval: '1h', from: 'now-1h', to: 'now' },
      { interval: '1h', lookback: '0s' },
    ],
    [
      { interval: '60s', from: 'now-1m', to: 'now' },
      { interval: '60s', lookback: '0s' },
    ],
    [
      { interval: '60m', from: 'now-1h', to: 'now' },
      { interval: '60m', lookback: '0s' },
    ],
    [
      { interval: '1m', from: 'now-60s', to: 'now' },
      { interval: '1m', lookback: '0s' },
    ],
    [
      { interval: '1h', from: 'now-60m', to: 'now' },
      { interval: '1h', lookback: '0s' },
    ],
    [
      { interval: '1h', from: 'now-3600s', to: 'now' },
      { interval: '1h', lookback: '0s' },
    ],
    [
      { interval: '0s', from: 'now', to: 'now' },
      { interval: '0s', lookback: '0s' },
    ],
  ])('transforms %j to simple rule schedule', (fullRuleSchedule, expected) => {
    const result = toSimpleRuleSchedule(fullRuleSchedule);

    expect(result).toEqual(expected);
  });

  it.each([
    [{ interval: 'invalid', from: 'now-11m', to: 'now' }],
    [{ interval: '10m', from: 'invalid', to: 'now' }],
    [{ interval: '10m', from: 'now-11m', to: 'invalid' }],
    [{ interval: '10m', from: 'now-11m', to: 'now-1m' }],
    [{ interval: '10m', from: 'now-5m', to: 'now' }],
  ])('returns "undefined" for %j', (fullRuleSchedule) => {
    const result = toSimpleRuleSchedule(fullRuleSchedule);

    expect(result).toBeUndefined();
  });
});
