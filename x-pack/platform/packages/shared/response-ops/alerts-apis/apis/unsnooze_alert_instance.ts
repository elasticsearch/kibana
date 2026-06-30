/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpStart } from '@kbn/core-http-browser';
import { BASE_ALERTING_API_PATH } from '../constants';

export interface UnsnoozeAlertInstanceParams {
  id: string;
  instanceId: string;
  http: HttpStart;
}

export const unsnoozeAlertInstance = ({ id, instanceId, http }: UnsnoozeAlertInstanceParams) => {
  return http.post<void>(
    `${BASE_ALERTING_API_PATH}/rule/${encodeURIComponent(id)}/alert/${encodeURIComponent(
      instanceId
    )}/_unsnooze`
  );
};
