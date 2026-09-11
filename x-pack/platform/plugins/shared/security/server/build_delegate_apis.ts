/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type {
  CoreSecurityDelegateContract,
  GrantUiamAPIKeyParams,
  HTTPAuthorizationHeader,
  InvalidateUiamAPIKeyParams,
} from '@kbn/core-security-server';
import type { CoreUserProfileDelegateContract } from '@kbn/core-user-profile-server';
import type { Logger } from '@kbn/logging';
import type { AuditServiceSetup } from '@kbn/security-plugin-types-server';

import type { InternalAuthenticationServiceStart } from './authentication';
import { createFakeRequestEnrichment } from './authentication/fake_request_enrichment';
import type { ServiceAccountsServiceStart } from './service_accounts';
import type { Session } from './session_management';
import { getPrintableSessionId } from './session_management';
import type { UserProfileServiceStartInternal } from './user_profile';

export const buildSecurityApi = ({
  getAuthc,
  getSession,
  getServiceAccounts,
  audit,
  config,
  logger,
}: {
  getAuthc: () => InternalAuthenticationServiceStart;
  getSession: () => Pick<Session, 'getSID'>;
  getServiceAccounts: () => ServiceAccountsServiceStart | null;
  audit: AuditServiceSetup;
  config: { uiam?: { enabled: boolean }; serviceAccounts?: { enabled: boolean } };
  logger: Logger;
}): CoreSecurityDelegateContract => {
  const enrichment = createFakeRequestEnrichment(logger.get('fake-request-enrichment'));

  return {
    authc: {
      getCurrentUser: (request) => {
        if (request.isFakeRequest) {
          const override = enrichment.getOverride(request);
          if (override) return override;
        }
        return getAuthc().getCurrentUser(request);
      },
      getRedactedSessionId: async (request) => {
        const sid = await getSession().getSID(request);
        return sid ? getPrintableSessionId(sid) : undefined;
      },
      apiKeys: {
        areAPIKeysEnabled: () => getAuthc().apiKeys.areAPIKeysEnabled(),
        areCrossClusterAPIKeysEnabled: () => getAuthc().apiKeys.areAPIKeysEnabled(),
        grantAsInternalUser: (request, createParams, options) =>
          getAuthc().apiKeys.grantAsInternalUser(request, createParams, options),
        cloneAsInternalUser: (request, cloneParams) =>
          getAuthc().apiKeys.cloneAsInternalUser(request, cloneParams),
        create: (request, createParams) => getAuthc().apiKeys.create(request, createParams),
        update: (request, updateParams) => getAuthc().apiKeys.update(request, updateParams),
        validate: (apiKeyParams) => getAuthc().apiKeys.validate(apiKeyParams),
        invalidate: (request, params) => getAuthc().apiKeys.invalidate(request, params),
        invalidateAsInternalUser: (params) => getAuthc().apiKeys.invalidateAsInternalUser(params),
        uiam: config.uiam?.enabled
          ? {
              grant: (request: KibanaRequest, grantUiamApiKeyParams: GrantUiamAPIKeyParams) =>
                getAuthc().apiKeys.uiam!.grant(request, grantUiamApiKeyParams),
              invalidate: (
                request: KibanaRequest,
                invalidateUiamApiKeyParams: InvalidateUiamAPIKeyParams
              ) => getAuthc().apiKeys.uiam!.invalidate(request, invalidateUiamApiKeyParams),
              convert: (keys: string[]) => getAuthc().apiKeys.uiam!.convert(keys),
              getInternalCallerAttestationHeaders: (credential: HTTPAuthorizationHeader) =>
                getAuthc().apiKeys.uiam!.getInternalCallerAttestationHeaders(credential),
            }
          : null,
      },
    },
    audit: {
      asScoped(request) {
        return audit.asScoped(request);
      },
      withoutRequest: {
        log: audit.withoutRequest.log,
        enabled: audit.withoutRequest.enabled,
        includeSavedObjectNames: audit.withoutRequest.includeSavedObjectNames,
      },
    },
    serviceAccounts: {
      isEnabled: () => config.serviceAccounts?.enabled === true,
      // `async` so that a disabled feature surfaces as a rejected promise rather than a
      // synchronous throw, which callers of a promise-returning API would not expect.
      create: async (request, params) => {
        const serviceAccounts = getServiceAccounts();
        if (!serviceAccounts) {
          throw new Error('Service accounts are not enabled');
        }
        return serviceAccounts.create(request, params);
      },
    },
    fakeRequestEnricher: enrichment.enrichRequestWithUserProfile,
  };
};

export const buildUserProfileApi = ({
  getUserProfile,
}: {
  getUserProfile: () => UserProfileServiceStartInternal;
}): CoreUserProfileDelegateContract => {
  return {
    getCurrent: (params) => getUserProfile().getCurrent(params),
    getCurrentProfileId: (params) => getUserProfile().getCurrentProfileId(params),
    suggest: (params) => getUserProfile().suggest(params),
    bulkGet: (params) => getUserProfile().bulkGet(params),
    update: (uids, data) => getUserProfile().update(uids, data),
  };
};
