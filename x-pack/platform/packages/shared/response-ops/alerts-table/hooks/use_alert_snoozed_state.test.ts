/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import { ALERT_INSTANCE_ID, ALERT_RULE_UUID } from '@kbn/rule-data-utils';
import type { Alert } from '@kbn/alerting-types';
import type { SnoozedInstance } from '@kbn/response-ops-alerts-apis/types';
import { useAlertSnoozedState } from './use_alert_snoozed_state';
import { useAlertsTableContext } from '../contexts/alerts_table_context';

jest.mock('../contexts/alerts_table_context');

const mockUseAlertsTableContext = useAlertsTableContext as jest.MockedFunction<
  typeof useAlertsTableContext
>;

const RULE_ID = 'rule-1';
const INSTANCE_ID = 'instance-1';

const snoozedInstance: SnoozedInstance = {
  instanceId: INSTANCE_ID,
  expiresAt: '2026-06-01T00:00:00.000Z',
  snoozedAt: '2026-05-15T00:00:00.000Z',
  snoozedBy: 'user1',
};

const makeAlert = (ruleId: string, instanceId: string): Alert =>
  ({
    [ALERT_RULE_UUID]: [ruleId],
    [ALERT_INSTANCE_ID]: [instanceId],
  } as unknown as Alert);

describe('useAlertSnoozedState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns isSnoozed: false when snoozedAlerts is empty', () => {
    mockUseAlertsTableContext.mockReturnValue({ snoozedAlerts: {} } as any);

    const { result } = renderHook(() => useAlertSnoozedState(makeAlert(RULE_ID, INSTANCE_ID)));

    expect(result.current.isSnoozed).toBe(false);
    expect(result.current.snoozedInstance).toBeUndefined();
    expect(result.current.expiresAt).toBeUndefined();
  });

  it('returns isSnoozed: false when the rule has no matching instance', () => {
    mockUseAlertsTableContext.mockReturnValue({
      snoozedAlerts: { [RULE_ID]: [{ ...snoozedInstance, instanceId: 'other-instance' }] },
    } as any);

    const { result } = renderHook(() => useAlertSnoozedState(makeAlert(RULE_ID, INSTANCE_ID)));

    expect(result.current.isSnoozed).toBe(false);
    expect(result.current.snoozedInstance).toBeUndefined();
  });

  it('returns isSnoozed: true with the matching snoozedInstance', () => {
    mockUseAlertsTableContext.mockReturnValue({
      snoozedAlerts: { [RULE_ID]: [snoozedInstance] },
    } as any);

    const { result } = renderHook(() => useAlertSnoozedState(makeAlert(RULE_ID, INSTANCE_ID)));

    expect(result.current.isSnoozed).toBe(true);
    expect(result.current.snoozedInstance).toEqual(snoozedInstance);
    expect(result.current.expiresAt).toBe(snoozedInstance.expiresAt);
  });

  it('returns the ruleId and alertInstanceId from the alert', () => {
    mockUseAlertsTableContext.mockReturnValue({ snoozedAlerts: {} } as any);

    const { result } = renderHook(() => useAlertSnoozedState(makeAlert(RULE_ID, INSTANCE_ID)));

    expect(result.current.ruleId).toBe(RULE_ID);
    expect(result.current.alertInstanceId).toBe(INSTANCE_ID);
  });

  it('returns isSnoozed: false when alert is undefined', () => {
    mockUseAlertsTableContext.mockReturnValue({ snoozedAlerts: {} } as any);

    const { result } = renderHook(() => useAlertSnoozedState(undefined));

    expect(result.current.isSnoozed).toBe(false);
    expect(result.current.ruleId).toBeUndefined();
    expect(result.current.alertInstanceId).toBeUndefined();
  });

  it('handles a condition-only snooze (no expiresAt)', () => {
    const conditionOnlySnooze: SnoozedInstance = {
      instanceId: INSTANCE_ID,
      snoozedAt: '2026-05-15T00:00:00.000Z',
      snoozedBy: 'user1',
      conditions: [{ type: 'severity_change' }],
      conditionOperator: 'any',
    };

    mockUseAlertsTableContext.mockReturnValue({
      snoozedAlerts: { [RULE_ID]: [conditionOnlySnooze] },
    } as any);

    const { result } = renderHook(() => useAlertSnoozedState(makeAlert(RULE_ID, INSTANCE_ID)));

    expect(result.current.isSnoozed).toBe(true);
    expect(result.current.expiresAt).toBeUndefined();
    expect(result.current.snoozedInstance).toEqual(conditionOnlySnooze);
  });
});
