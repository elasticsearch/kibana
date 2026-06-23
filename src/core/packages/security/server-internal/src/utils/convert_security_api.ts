/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSecurityDelegateContract } from '@kbn/core-security-server';
import type { InternalSecurityServiceStart } from '../internal_contracts';

export const convertSecurityApi = (
  privateApi: CoreSecurityDelegateContract
): InternalSecurityServiceStart => {
  return {
    authc: {
      getCurrentUser: privateApi.authc.getCurrentUser,
      getRedactedSessionId: privateApi.authc.getRedactedSessionId,
      apiKeys: privateApi.authc.apiKeys,
    },
    audit: privateApi.audit,
  };
};
