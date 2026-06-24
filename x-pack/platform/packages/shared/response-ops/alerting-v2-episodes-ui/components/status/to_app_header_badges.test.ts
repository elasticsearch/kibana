/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ALERT_EPISODE_ACTION_TYPE, ALERT_EPISODE_STATUS } from '@kbn/alerting-v2-schemas';
import { episodeStatusToAppHeaderBadges } from './to_app_header_badges';

describe('episodeStatusToAppHeaderBadges', () => {
  it('returns a single status badge by default', () => {
    const badges = episodeStatusToAppHeaderBadges(
      ALERT_EPISODE_STATUS.ACTIVE,
      undefined,
      undefined
    );
    expect(badges).toHaveLength(1);
    expect(badges[0]).toMatchObject({ label: 'Active', color: 'danger' });
  });

  it('returns no badges when status is undefined', () => {
    expect(episodeStatusToAppHeaderBadges(undefined, undefined, undefined)).toEqual([]);
  });

  it('overrides status to Inactive when group is deactivated', () => {
    const badges = episodeStatusToAppHeaderBadges(ALERT_EPISODE_STATUS.ACTIVE, undefined, {
      lastDeactivateAction: ALERT_EPISODE_ACTION_TYPE.DEACTIVATE,
    } as any);
    expect(badges[0]).toMatchObject({ label: 'Inactive', color: 'success' });
  });

  it('appends a Snoozed badge with expiry tooltip', () => {
    const badges = episodeStatusToAppHeaderBadges(ALERT_EPISODE_STATUS.ACTIVE, undefined, {
      lastSnoozeAction: ALERT_EPISODE_ACTION_TYPE.SNOOZE,
      snoozeExpiry: '2026-08-01T10:00:00Z',
    } as any);
    expect(badges).toHaveLength(2);
    expect(badges[1].label).toBe('Snoozed');
    expect(badges[1].tooltip).toContain('snoozed until');
  });

  it('appends an Acknowledged badge', () => {
    const badges = episodeStatusToAppHeaderBadges(
      ALERT_EPISODE_STATUS.ACTIVE,
      { lastAckAction: ALERT_EPISODE_ACTION_TYPE.ACK } as any,
      undefined
    );
    expect(badges).toHaveLength(2);
    expect(badges[1].label).toBe('Acknowledged');
  });
});
