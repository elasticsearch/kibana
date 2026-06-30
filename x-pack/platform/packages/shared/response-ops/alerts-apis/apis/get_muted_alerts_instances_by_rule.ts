/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import { nodeBuilder } from '@kbn/es-query';
import type { SnoozedInstance, SnoozeCondition } from '../types';

const INTERNAL_FIND_MUTED_ALERT_INSTANCES_URL = '/internal/alerting/rules/_find_muted_alerts';

interface SnoozedAlertInstanceApiResponse {
  instance_id: string;
  expires_at?: string;
  conditions?: SnoozeCondition[];
  condition_operator?: 'any' | 'all';
  snoozed_at: string;
  snoozed_by: string;
}

export interface MutedAlertRecord {
  id: string;
  muted_alert_instance_ids: string[];
  snoozed_alert_instances?: SnoozedAlertInstanceApiResponse[];
}

export interface FindMutedAlertsResponse {
  data: MutedAlertRecord[];
}

export interface GetAlertSnoozeStateByRuleParams {
  ruleIds: string[];
  http: HttpStart;
  signal?: AbortSignal;
}

const transformSnoozedInstance = (raw: SnoozedAlertInstanceApiResponse): SnoozedInstance => ({
  instanceId: raw.instance_id,
  expiresAt: raw.expires_at,
  conditions: raw.conditions,
  conditionOperator: raw.condition_operator,
  snoozedAt: raw.snoozed_at,
  snoozedBy: raw.snoozed_by,
});

export const getAlertSnoozeStateByRule = async ({
  http,
  ruleIds,
  signal,
}: GetAlertSnoozeStateByRuleParams) => {
  const filterNode = nodeBuilder.or(ruleIds.map((id) => nodeBuilder.is('alert.id', `alert:${id}`)));
  const { data } = await http.post<FindMutedAlertsResponse>(
    INTERNAL_FIND_MUTED_ALERT_INSTANCES_URL,
    {
      body: JSON.stringify({
        filter: JSON.stringify(filterNode),
        page: 1,
        per_page: ruleIds.length,
      }),
      signal,
    }
  );

  return {
    data: data.map((rule) => ({
      id: rule.id,
      mutedAlertIds: rule.muted_alert_instance_ids,
      snoozedInstances: (rule.snoozed_alert_instances ?? []).map(transformSnoozedInstance),
    })),
  };
};

/**
 * @deprecated Use {@link getAlertSnoozeStateByRule} instead.
 */
export const getMutedAlertsInstancesByRule = getAlertSnoozeStateByRule;
