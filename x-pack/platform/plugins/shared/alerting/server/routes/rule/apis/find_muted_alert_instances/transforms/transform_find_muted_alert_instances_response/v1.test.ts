/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FindMutedAlertsResult } from '../../../../../../application/rule/methods/find_muted_alerts';
import { transformFindMutedAlertInstancesResponse } from './v1';

describe('transformFindMutedAlertInstancesResponse', () => {
  it('maps pagination metadata, renames muted instance ids and snoozed instances', () => {
    const result: FindMutedAlertsResult = {
      page: 1,
      perPage: 10,
      total: 2,
      data: [
        {
          id: 'rule-1',
          mutedInstanceIds: ['instance-1', 'instance-2'],
          snoozedInstances: [
            {
              instanceId: 'instance-1',
              expiresAt: '2099-01-01T00:00:00.000Z',
              conditions: [{ type: 'field_change', field: 'host.name' }],
              conditionOperator: 'any',
              snoozedAt: '2026-01-01T00:00:00.000Z',
              snoozedBy: 'elastic',
            },
          ],
        },
        { id: 'rule-2', mutedInstanceIds: ['instance-3'], snoozedInstances: [] },
      ],
    };

    expect(transformFindMutedAlertInstancesResponse(result)).toEqual({
      page: 1,
      per_page: 10,
      total: 2,
      data: [
        {
          id: 'rule-1',
          muted_alert_instance_ids: ['instance-1', 'instance-2'],
          snoozed_alert_instances: [
            {
              instance_id: 'instance-1',
              expires_at: '2099-01-01T00:00:00.000Z',
              conditions: [{ type: 'field_change', field: 'host.name' }],
              condition_operator: 'any',
              snoozed_at: '2026-01-01T00:00:00.000Z',
              snoozed_by: 'elastic',
            },
          ],
        },
        { id: 'rule-2', muted_alert_instance_ids: ['instance-3'], snoozed_alert_instances: [] },
      ],
    });
  });

  it('defaults muted_alert_instance_ids and snoozed_alert_instances to empty arrays when missing', () => {
    const result = {
      page: 1,
      perPage: 10,
      total: 1,
      // mutedInstanceIds and snoozedInstances intentionally omitted to exercise the `?? []` fallback
      data: [{ id: 'rule-1' }],
    } as unknown as FindMutedAlertsResult;

    expect(transformFindMutedAlertInstancesResponse(result)).toEqual({
      page: 1,
      per_page: 10,
      total: 1,
      data: [{ id: 'rule-1', muted_alert_instance_ids: [], snoozed_alert_instances: [] }],
    });
  });

  it('returns an empty data array when there are no rules', () => {
    const result: FindMutedAlertsResult = {
      page: 1,
      perPage: 10,
      total: 0,
      data: [],
    };

    expect(transformFindMutedAlertInstancesResponse(result)).toEqual({
      page: 1,
      per_page: 10,
      total: 0,
      data: [],
    });
  });
});
