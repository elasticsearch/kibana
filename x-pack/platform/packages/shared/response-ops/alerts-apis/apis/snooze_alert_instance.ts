/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import { BASE_ALERTING_API_PATH } from '../constants';
import type { SnoozeCondition } from '../types';

export interface SnoozeAlertInstanceParams {
  id: string;
  instanceId: string;
  http: HttpStart;
  /**
   * ISO date string for when the snooze expires. Omit when using conditions-only snooze.
   */
  expiresAt?: string;
  conditions?: SnoozeCondition[];
  conditionOperator?: 'any' | 'all';
}

export const snoozeAlertInstance = ({
  id,
  instanceId,
  http,
  expiresAt,
  conditions,
  conditionOperator,
}: SnoozeAlertInstanceParams) => {
  return http.post<void>(
    `${BASE_ALERTING_API_PATH}/rule/${encodeURIComponent(id)}/alert/${encodeURIComponent(
      instanceId
    )}/_snooze`,
    {
      body: JSON.stringify({
        ...(expiresAt !== undefined && { expires_at: expiresAt }),
        ...(conditions !== undefined && { conditions }),
        ...(conditionOperator !== undefined && { condition_operator: conditionOperator }),
      }),
    }
  );
};
