/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook } from '@testing-library/react';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { useInvestigateAttackInTimeline } from './use_investigate_attack_in_timeline';
import { useKibana } from '../../../../common/lib/kibana';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useInvestigateInTimeline } from '../../../../common/hooks/timeline/use_investigate_in_timeline';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../common/components/user_privileges');
jest.mock('../../../../common/hooks/timeline/use_investigate_in_timeline');

const useKibanaMock = useKibana as jest.Mock;
const useUserPrivilegesMock = useUserPrivileges as jest.Mock;
const useInvestigateInTimelineMock = useInvestigateInTimeline as jest.Mock;

const investigateInTimeline = jest.fn();
const reportEvent = jest.fn();

/** Two anonymised ids resolving to one original alert, plus one that has no replacement. */
const attack = {
  id: 'attack-id-1',
  alertIds: ['anon-1', 'anon-2', 'alert-2'],
  replacements: { 'anon-1': 'alert-1', 'anon-2': 'alert-1' },
  timestamp: '2024-05-01T08:30:00.000Z',
} as unknown as AttackDiscoveryAlert;

describe('useInvestigateAttackInTimeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useKibanaMock.mockReturnValue({ services: { telemetry: { reportEvent } } });
    useUserPrivilegesMock.mockReturnValue({ timelinePrivileges: { crud: false, read: true } });
    useInvestigateInTimelineMock.mockReturnValue({ investigateInTimeline });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('reports the action as unavailable when the user cannot read timelines', () => {
    useUserPrivilegesMock.mockReturnValue({ timelinePrivileges: { crud: false, read: false } });

    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    expect(result.current.canInvestigateInTimeline).toBe(false);
  });

  it('opens Timeline filtered to the de-anonymised, deduplicated constituent alert ids', () => {
    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline(attack);

    expect(investigateInTimeline).toHaveBeenCalledTimes(1);
    const [{ filters }] = investigateInTimeline.mock.calls[0];
    expect(filters).toEqual([
      expect.objectContaining({
        query: { bool: { filter: { ids: { values: ['alert-1', 'alert-2'] } } } },
      }),
    ]);
  });

  // A scheduled attack is stamped with the rule's `startedAt` but draws in alerts retrieved
  // moments later, so ending the range at the attack itself would hide its newest alerts.
  it('opens Timeline over the window the attack was drawn from, ending at the present', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-05-01T12:00:00.000Z'));

    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline(attack);

    const [{ timeRange }] = investigateInTimeline.mock.calls[0];
    expect(timeRange).toEqual({
      kind: 'absolute',
      from: '2024-04-30T08:30:00.000Z',
      to: '2024-05-01T12:00:00.000Z',
    });
  });

  it.each([
    ['carries no timestamp', undefined],
    ['carries an unparseable timestamp', 'not-a-date'],
  ])('leaves the time range to the global picker when the attack %s', (_label, timestamp) => {
    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline({
      ...attack,
      timestamp,
    } as unknown as AttackDiscoveryAlert);

    const [{ timeRange }] = investigateInTimeline.mock.calls[0];
    expect(timeRange).toBeUndefined();
  });

  it('reports the investigation against the case attachment table', () => {
    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline(attack);

    expect(reportEvent).toHaveBeenCalledWith(AttacksEventTypes.TimelineInvestigationOpened, {
      source: 'case_attachment_table',
    });
  });

  it('does nothing for an attack that could not be resolved', () => {
    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline(undefined);

    expect(investigateInTimeline).not.toHaveBeenCalled();
    expect(reportEvent).not.toHaveBeenCalled();
  });

  it('does nothing for an attack with no constituent alerts', () => {
    const { result } = renderHook(() => useInvestigateAttackInTimeline());

    result.current.investigateAttackInTimeline({
      ...attack,
      alertIds: [],
    } as unknown as AttackDiscoveryAlert);

    expect(investigateInTimeline).not.toHaveBeenCalled();
    expect(reportEvent).not.toHaveBeenCalled();
  });
});
