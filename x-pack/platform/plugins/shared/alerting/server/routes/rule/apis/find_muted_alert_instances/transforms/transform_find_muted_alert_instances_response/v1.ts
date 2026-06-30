/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FindMutedAlertInstancesResponseV1 } from '../../../../../../../common/routes/rule/apis/find_muted_alert_instances';
import type { FindMutedAlertsResult } from '../../../../../../application/rule/methods/find_muted_alerts';

export const transformFindMutedAlertInstancesResponse = (
  result: FindMutedAlertsResult
): FindMutedAlertInstancesResponseV1 => {
  return {
    page: result.page,
    per_page: result.perPage,
    total: result.total,
    data: result.data.map((rule) => ({
      id: rule.id,
      muted_alert_instance_ids: rule.mutedInstanceIds ?? [],
      snoozed_alert_instances: (rule.snoozedInstances ?? []).map((si) => ({
        instance_id: si.instanceId,
        ...(si.expiresAt !== undefined && { expires_at: si.expiresAt }),
        ...(si.conditions !== undefined && { conditions: si.conditions }),
        ...(si.conditionOperator !== undefined && { condition_operator: si.conditionOperator }),
        snoozed_at: si.snoozedAt,
        snoozed_by: si.snoozedBy,
      })),
    })),
  };
};
