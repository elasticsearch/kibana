/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SYNTHETICS_API_URLS,
  type SyntheticsIndexPrivilegesResponse,
} from '../../../common/constants';
import { checkIndicesReadPrivileges } from '../../synthetics_service/authentication/check_has_privilege';
import type { SyntheticsRestApiRouteFactory } from '../types';

export const getSyntheticsIndexPrivilegesRoute: SyntheticsRestApiRouteFactory<
  SyntheticsIndexPrivilegesResponse
> = () => ({
  method: 'GET',
  writeAccess: false,
  path: SYNTHETICS_API_URLS.INDEX_PRIVILEGES,
  validate: {},
  handler: async ({ syntheticsEsClient }): Promise<SyntheticsIndexPrivilegesResponse> => {
    const privileges = await checkIndicesReadPrivileges(syntheticsEsClient);
    return { canRead: Boolean(privileges.has_all_requested) };
  },
});
