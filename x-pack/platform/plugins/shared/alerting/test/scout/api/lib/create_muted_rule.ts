/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiClientFixture } from '@kbn/scout/src/playwright/fixtures/scope/worker';
import { ES_QUERY_RULE_PARAMS, ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED } from '../fixtures/constants';
import { waitForSuccessfulEventLogEntry } from './wait_for_successful_event_log';

/**
 * Creates an enabled `.es-query` rule, waits for it to produce its alert
 * instance, and mutes that instance. Returns the created rule id.
 *
 * The `alerts` consumer is generic and accessible across deployments, so the
 * default lets a single rule serve every feature-privilege variant.
 */
export const createMutedRule = async ({
  apiClient,
  headers,
  consumer = 'alerts',
  name = 'Scout find-muted-alerts rule',
  tags = ['scout-find-muted-alerts'],
  encodedInstanceId = ES_QUERY_DEFAULT_INSTANCE_ID_ENCODED,
}: {
  apiClient: ApiClientFixture;
  headers: Record<string, string>;
  consumer?: string;
  name?: string;
  tags?: string[];
  encodedInstanceId?: string;
}): Promise<string> => {
  const ruleResponse = await apiClient.post('api/alerting/rule', {
    headers,
    body: {
      name,
      rule_type_id: '.es-query',
      consumer,
      schedule: { interval: '1m' },
      enabled: true,
      params: ES_QUERY_RULE_PARAMS,
      actions: [],
      tags,
    },
    responseType: 'json',
  });
  if (ruleResponse.statusCode !== 200) {
    throw new Error(
      `Failed to create rule (status ${ruleResponse.statusCode}): ${JSON.stringify(
        ruleResponse.body
      )}`
    );
  }
  const ruleId = (ruleResponse.body as { id: string }).id;

  // Let the rule execute so the alert instance actually exists, then mute that
  // real instance (validate_alerts_existence defaults to true).
  await waitForSuccessfulEventLogEntry(apiClient, ruleId, headers);

  const muteResponse = await apiClient.post(
    `api/alerting/rule/${ruleId}/alert/${encodedInstanceId}/_mute`,
    { headers }
  );
  if (muteResponse.statusCode !== 204) {
    throw new Error(
      `Failed to mute alert instance (status ${muteResponse.statusCode}): ${JSON.stringify(
        muteResponse.body
      )}`
    );
  }

  return ruleId;
};
