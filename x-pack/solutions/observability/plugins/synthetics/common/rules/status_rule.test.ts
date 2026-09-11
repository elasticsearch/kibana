/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getConditionType } from './status_rule';

describe('Status Rule', () => {
  it('should return the correct condition type for empty', () => {
    const { useLatestChecks } = getConditionType({} as any);
    expect(useLatestChecks).toBe(true);
  });

  it('should return the correct condition type check based', () => {
    const { useLatestChecks, useTimeWindow } = getConditionType({
      window: {
        numberOfChecks: 5,
      },
    });
    expect(useLatestChecks).toBe(true);
    expect(useTimeWindow).toBe(false);
  });

  it('should return the correct condition type time based', () => {
    const { useTimeWindow, useLatestChecks } = getConditionType({
      window: {
        time: {
          unit: 'm',
          size: 5,
        },
      },
    });
    expect(useTimeWindow).toBe(true);
    expect(useLatestChecks).toBe(false);
  });

  it('defaults pendingThreshold to 2 when omitted', () => {
    expect(getConditionType({} as any).pendingThreshold).toBe(2);
    expect(
      getConditionType({
        window: { numberOfChecks: 5 },
        alertOnNoData: true,
      }).pendingThreshold
    ).toBe(2);
  });

  it('surfaces a configured pendingThreshold', () => {
    expect(
      getConditionType({
        window: { numberOfChecks: 5 },
        pendingThreshold: 1,
      }).pendingThreshold
    ).toBe(1);
    expect(
      getConditionType({
        alertOnNoData: true,
        pendingThreshold: 1,
      } as any).pendingThreshold
    ).toBe(1);
  });
});
