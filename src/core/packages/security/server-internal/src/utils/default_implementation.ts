/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CoreSecurityDelegateContract } from '@kbn/core-security-server';

const API_KEYS_DISABLED_ERROR = new Error('API keys are disabled');
const REJECT_WHEN_API_KEYS_DISABLED = () => Promise.reject(API_KEYS_DISABLED_ERROR);

export const getDefaultSecurityImplementation = (): CoreSecurityDelegateContract => {
  return {
    authc: {
      getCurrentUser: () => null,
      getRedactedSessionId: () => Promise.resolve(undefined),
      apiKeys: {
        areAPIKeysEnabled: () => Promise.resolve(false),
        areCrossClusterAPIKeysEnabled: () => Promise.resolve(false),
        create: REJECT_WHEN_API_KEYS_DISABLED,
        update: REJECT_WHEN_API_KEYS_DISABLED,
        grantAsInternalUser: REJECT_WHEN_API_KEYS_DISABLED,
        cloneAsInternalUser: REJECT_WHEN_API_KEYS_DISABLED,
        validate: REJECT_WHEN_API_KEYS_DISABLED,
        invalidate: REJECT_WHEN_API_KEYS_DISABLED,
        invalidateAsInternalUser: REJECT_WHEN_API_KEYS_DISABLED,
        uiam: null,
      },
    },
    audit: {
      asScoped: () => {
        return { log: () => undefined, enabled: false, includeSavedObjectNames: false };
      },
      withoutRequest: {
        log: () => undefined,
        enabled: false,
        includeSavedObjectNames: false,
      },
    },
    // No security delegate registered, so there are no user profiles to bind.
    fakeRequestEnricher: () => undefined,
  };
};
