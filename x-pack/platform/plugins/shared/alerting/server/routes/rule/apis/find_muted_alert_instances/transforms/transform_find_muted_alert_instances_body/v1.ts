/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FindMutedAlertInstancesRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/find_muted_alert_instances';
import type { FindMutedAlertsOptions } from '../../../../../../application/rule/methods/find_muted_alerts';

export const transformFindMutedAlertInstancesBody = (
  params: FindMutedAlertInstancesRequestBodyV1
): FindMutedAlertsOptions => {
  const { per_page: perPage, page, filter } = params;
  return {
    ...(page ? { page } : {}),
    ...(filter ? { filter } : {}),
    ...(perPage ? { perPage } : {}),
  };
};
