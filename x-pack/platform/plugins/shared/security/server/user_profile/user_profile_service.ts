/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  SecurityActivateUserProfileRequest,
  SecurityUserProfile,
} from '@elastic/elasticsearch/lib/api/types';
import pLimit from 'p-limit';

import type { IClusterClient, KibanaRequest, Logger } from '@kbn/core/server';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import { extractApiKeyIdFromAuthzHeader } from '@kbn/core-security-server';
import type {
  CheckUserProfilesPrivilegesResponse,
  UserProfileBulkGetParams,
  UserProfileGetCurrentParams,
  UserProfileRequiredPrivileges,
  UserProfileServiceStart,
  UserProfileSuggestParams,
} from '@kbn/security-plugin-types-server';
import type { PublicMethodsOf } from '@kbn/utility-types';

import type { UserProfileGrant } from './user_profile_grant';
import type {
  SecurityLicense,
  UserProfile,
  UserProfileData,
  UserProfileWithSecurity,
} from '../../common';
import type { AuthorizationServiceSetupInternal } from '../authorization';
import { getDetailedErrorMessage, getErrorStatusCode } from '../errors';
import { securityTelemetry } from '../otel/instrumentation';
import { getPrintableSessionId, type Session } from '../session_management';

const KIBANA_DATA_ROOT = 'kibana';
const ACTIVATION_MAX_RETRIES = 10;
const ACTIVATION_RETRY_SCALE_DURATION_MS = 150;
const MAX_SUGGESTIONS_COUNT = 100;
const DEFAULT_SUGGESTIONS_COUNT = 10;
const MIN_SUGGESTIONS_FOR_PRIVILEGES_CHECK = 10;
const BULK_GET_MAX_UIDS_PER_BATCH = 50;
const BULK_GET_MAX_CONCURRENT_BATCH_REQUESTS = 5;
const RUNAS_HEADER = 'es-security-runas-user';

export interface UserProfileServiceStartInternal extends UserProfileServiceStart {
  /**
   * Activates user profile using provided user profile grant.
   * @param grant User profile grant (username/password or access token).
   */
  activate(grant: UserProfileGrant): Promise<UserProfileWithSecurity>;

  /**
   * Updates user preferences by identifier.
   * @param uid User ID
   * @param data Application data to be written (merged with existing data).
   */
  update<D extends UserProfileData>(uid: string, data: D): Promise<void>;
}

export interface UserProfileServiceSetupParams {
  authz: AuthorizationServiceSetupInternal;
  license: SecurityLicense;
}

export interface UserProfileServiceStartParams {
  clusterClient: IClusterClient;
  session: PublicMethodsOf<Session>;
  getCurrentUser: (request: KibanaRequest) => AuthenticatedUser | null;
}

function parseUserProfile<D extends UserProfileData>(
  rawUserProfile: SecurityUserProfile
): UserProfile<D> {
  return {
    uid: rawUserProfile.uid,
    // Get User Profile API returns `enabled` property, but Suggest User Profile API doesn't since it's assumed that the
    // API returns only enabled profiles. To simplify the API in Kibana we use the same interfaces for user profiles
    // irrespective to the source they are coming from, so we need to "normalize" `enabled` property here.
    enabled: rawUserProfile.enabled ?? true,
    data: rawUserProfile.data?.[KIBANA_DATA_ROOT] ?? {},
    user: {
      username: rawUserProfile.user.username,
      // @elastic/elasticsearch types support `null` values for the `email`, but we don't.
      email: rawUserProfile.user.email ?? undefined,
      // @elastic/elasticsearch types support `null` values for the `full_name`, but we don't.
      full_name: rawUserProfile.user.full_name ?? undefined,
    },
  };
}

function parseUserProfileWithSecurity<D extends UserProfileData>(
  rawUserProfile: SecurityUserProfile
): UserProfileWithSecurity<D> {
  const userProfile = parseUserProfile<D>(rawUserProfile);
  return {
    ...userProfile,
    labels: rawUserProfile.labels?.[KIBANA_DATA_ROOT] ?? {},
    user: {
      ...userProfile.user,
      roles: rawUserProfile.user.roles,
      realm_name: rawUserProfile.user.realm_name,
      realm_domain: rawUserProfile.user.realm_domain,
    },
  };
}

export class UserProfileService {
  private authz?: AuthorizationServiceSetupInternal;
  private license?: SecurityLicense;
  constructor(private readonly logger: Logger) {}

  setup({ authz, license }: UserProfileServiceSetupParams) {
    this.authz = authz;
    this.license = license;
  }

  start({ clusterClient, session, getCurrentUser }: UserProfileServiceStartParams) {
    return {
      activate: this.activate.bind(this, clusterClient),
      getCurrent: this.getCurrent.bind(this, clusterClient, session, getCurrentUser),
      bulkGet: this.bulkGet.bind(this, clusterClient),
      update: this.update.bind(this, clusterClient),
      suggest: this.suggest.bind(this, clusterClient),
    } as UserProfileServiceStartInternal;
  }

  /**
   * See {@link UserProfileServiceStartInternal} for documentation.
   */
  private async activate(clusterClient: IClusterClient, grant: UserProfileGrant) {
    this.logger.debug(`Activating user profile via ${grant.type} grant.`);

    const activateRequest: SecurityActivateUserProfileRequest =
      grant.type === 'password'
        ? { grant_type: 'password', username: grant.username, password: grant.password }
        : {
            grant_type: 'access_token',
            access_token: grant.accessToken,
            ...(grant.type === 'uiamAccessToken'
              ? { client_authentication: grant.clientAuthentication }
              : {}),
          };

    // Profile activation is a multistep process that might or might not cause profile document to be created or
    // updated. If Elasticsearch needs to handle multiple profile activation requests for the same user in parallel
    // it can hit document version conflicts and fail (409 status code). In this case it's safe to retry activation
    // request after some time. Most of the Kibana users won't be affected by this issue, but there are edge cases
    // when users can be hit by the conflicts during profile activation, e.g. for PKI or Kerberos authentication when
    // client certificate/ticket changes and multiple requests can trigger profile re-activation at the same time.
    let activationRetriesLeft = ACTIVATION_MAX_RETRIES;
    do {
      try {
        const response = await clusterClient.asInternalUser.security.activateUserProfile({
          ...activateRequest,
        });

        this.logger.debug(`Successfully activated profile for "${response.user.username}".`);

        return parseUserProfileWithSecurity<{}>(response);
      } catch (err) {
        const detailedErrorMessage = getDetailedErrorMessage(err);
        const statusCode = getErrorStatusCode(err);
        // Retry on 409 (conflict) and 503 (service unavailable) errors
        if (statusCode !== 409 && statusCode !== 503) {
          this.logger.error(`Failed to activate user profile: ${detailedErrorMessage}.`);
          throw err;
        }

        activationRetriesLeft--;
        this.logger.error(
          `Failed to activate user profile (retries left: ${activationRetriesLeft}): ${detailedErrorMessage}.`
        );

        if (activationRetriesLeft === 0) {
          throw err;
        }
      }

      await new Promise((resolve) =>
        setTimeout(
          resolve,
          (ACTIVATION_MAX_RETRIES - activationRetriesLeft) * ACTIVATION_RETRY_SCALE_DURATION_MS
        )
      );
    } while (activationRetriesLeft > 0);

    // This should be unreachable code, unless we have a bug in retry handling logic.
    throw new Error('Failed to activate user profile, max retries exceeded.');
  }

  /**
   * Determines the type of authorization from the Authorization header.
   * @param authHeader The Authorization header value
   * @returns The type of authorization ('basic', 'apikey', or null if neither)
   */
  private getAuthHeaderType(authHeader: string | string[] | undefined): 'basic' | 'apikey' | null {
    if (!authHeader || typeof authHeader !== 'string') {
      return null;
    }

    const normalizedHeader = authHeader.trim().toLowerCase();

    if (normalizedHeader.startsWith('basic ')) {
      return 'basic';
    }

    if (normalizedHeader.startsWith('apikey ')) {
      return 'apikey';
    }

    return null;
  }

  /**
   * Retrieves the current user profile ID from a session-authenticated request.
   * @param session Session service instance
   * @param request The HTTP request
   * @returns The profile ID if found, null otherwise
   */
  private async getCurrentUserProfileIdViaSession(
    session: PublicMethodsOf<Session>,
    request: UserProfileGetCurrentParams['request']
  ): Promise<{ profileId?: string; sessionId?: string }> {
    let userSession;
    try {
      userSession = await session.get(request);
    } catch (error) {
      this.logger.error(`Failed to retrieve user session: ${getDetailedErrorMessage(error)}`);
      throw error;
    }

    if (userSession.error) {
      this.logger.debug(`Retrieved user session has error: ${userSession.error.message}`);
      return {
        profileId: undefined,
        sessionId: undefined,
      };
    }

    if (!userSession.value.userProfileId) {
      this.logger.debug(
        `User profile missing from the current session [sid=${getPrintableSessionId(
          userSession.value.sid
        )}].`
      );
    }

    return {
      profileId: userSession.value.userProfileId ?? undefined,
      sessionId: userSession.value.sid,
    };
  }

  /**
   * Activates the user profile from a Basic auth authenticated request.
   * @param clusterClient The cluster client
   * @param request The HTTP request
   * @returns The activated profile
   */
  private async activateProfileViaBasicAuth(
    clusterClient: IClusterClient,
    request: UserProfileGetCurrentParams['request']
  ): Promise<UserProfileWithSecurity | undefined> {
    const authHeader = request.headers.authorization as string;
    const base64Credentials = authHeader.trim().substring('basic '.length);
    const [username, password] = Buffer.from(base64Credentials, 'base64').toString().split(':');
    if (!username || !password) {
      throw new Error(`Malformed basic credentials in Authorization header.`);
    }

    const activatedProfile = await this.activate(clusterClient, {
      type: 'password',
      username,
      password,
    });

    return activatedProfile;
  }

  /**
   * Retrieves the user profile ID from an API key authenticated request by retrieving the API Key itself.
   * @param clusterClient The cluster client
   * @param request The HTTP request
   * @returns The profile ID if found, undefined otherwise
   */
  private async getCurrentUserProfileIdViaApiKey(
    clusterClient: IClusterClient,
    request: UserProfileGetCurrentParams['request']
  ): Promise<string | undefined> {
    try {
      const id = extractApiKeyIdFromAuthzHeader(request.headers.authorization);
      if (!id) {
        this.logger.debug(`Failed to decode API key ID from Authorization header.`);
        return undefined;
      }

      const response = await clusterClient.asScoped(request).asCurrentUser.security.getApiKey({
        with_profile_uid: true,
        id,
      });

      if (response.api_keys && response.api_keys.length > 0) {
        return response.api_keys[0].profile_uid;
      } else {
        this.logger.debug(
          `No API keys were returned from query, cannot retrieve associated profile id.`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to retrieve API key for user profile retrieval: ${getDetailedErrorMessage(error)}`
      );
    }
  }

  private recordGetCurrentSuccess(params: {
    profileActivationRequired?: boolean;
    apiKeyRetrievalRequired?: boolean;
    fakeRequestProfileResolution?: boolean;
  }) {
    securityTelemetry.recordGetCurrentProfileInvocation({
      profileActivationRequired: params.profileActivationRequired,
      apiKeyRetrievalRequired: params.apiKeyRetrievalRequired,
      fakeRequestProfileResolution: params.fakeRequestProfileResolution,
      outcome: 'success',
    });
  }

  private recordGetCurrentFailure(params: {
    profileActivationRequired?: boolean;
    apiKeyRetrievalRequired?: boolean;
    fakeRequestProfileResolution?: boolean;
  }) {
    securityTelemetry.recordGetCurrentProfileInvocation({
      profileActivationRequired: params.profileActivationRequired,
      apiKeyRetrievalRequired: params.apiKeyRetrievalRequired,
      fakeRequestProfileResolution: params.fakeRequestProfileResolution,
      outcome: 'failure',
    });
  }

  /**
   * See {@link UserProfileServiceStart} for documentation.
   */
  private async getCurrent<D extends UserProfileData>(
    clusterClient: IClusterClient,
    session: PublicMethodsOf<Session>,
    getCurrentUser: (request: KibanaRequest) => AuthenticatedUser | null,
    { request, dataPath }: UserProfileGetCurrentParams
  ) {
    if (!this.license?.isEnabled()) {
      this.logger.debug(
        'Skipping user profile retrieval: security features are disabled in Elasticsearch.'
      );
      return null;
    }

    // Fake requests carry a bound `profile_uid` instead of an HTTP auth state,
    // so the standard `auth.isAuthenticated === false` gate doesn't apply.
    if (!request.isFakeRequest && request.auth.isAuthenticated === false) {
      throw new Error('Request to get current user profile is not authenticated.');
    }

    let profileId: string | undefined;
    let sessionId: string | undefined;
    let profileActivationRequired: boolean | undefined;
    let apiKeyRetrievalRequired: boolean | undefined;
    let fakeRequestProfileResolution: boolean | undefined;

    if (request.isFakeRequest) {
      profileId = getCurrentUser(request)?.profile_uid;
      if (profileId) {
        fakeRequestProfileResolution = true;
        this.logger.debug(`Resolving current user profile directly from profile_uid [fake=true].`);
      }
    }

    if (!profileId && (await session.getSID(request))) {
      this.logger.debug(`Request to get current user profile is authenticated via session.`);
      ({ profileId, sessionId } = await this.getCurrentUserProfileIdViaSession(session, request));
    } else if (!profileId && request.headers[RUNAS_HEADER]) {
      // When a proxy sets `es-security-runas-user`, the Authorization header belongs to the proxy
      // credential (e.g. `elastic`), not the effective user. Activating a profile from those
      // credentials would associate the avatar with the proxy account, not the impersonated user.
      // Return null because a user profile is not applicable in this context.
      this.logger.debug(
        `Skipping user profile retrieval for request with 'es-security-runas-user' header.`
      );
      return null;
    } else if (!profileId) {
      const authType = this.getAuthHeaderType(request.headers.authorization);

      if (authType === 'basic') {
        profileActivationRequired = true;

        this.logger.debug(
          `Request to get current user profile is authenticated via Basic credentials [fake=${!!fakeRequestProfileResolution}].`
        );

        let activatedProfile: UserProfileWithSecurity | undefined;
        try {
          activatedProfile = await this.activateProfileViaBasicAuth(clusterClient, request);
        } catch (error) {
          this.recordGetCurrentFailure({
            profileActivationRequired,
            apiKeyRetrievalRequired,
            fakeRequestProfileResolution,
          });
          this.logger.debug(
            `Failed to activate profile via basic credentials: ${getDetailedErrorMessage(error)}`
          );
          throw error;
        }

        // It is not possible to select/filter profile data when activating, so unless the dataPath is empty,
        // we will need to re-fetch the profile like in the other cases (session, API key).
        if (activatedProfile && !dataPath) {
          this.recordGetCurrentSuccess({
            profileActivationRequired,
            apiKeyRetrievalRequired,
            fakeRequestProfileResolution,
          });
          return activatedProfile;
        }
        profileId = activatedProfile?.uid;
      } else if (authType === 'apikey') {
        apiKeyRetrievalRequired = true;
        this.logger.debug(
          `Request to get current user profile is authenticated via API key [fake=${!!fakeRequestProfileResolution}].`
        );
        profileId = await this.getCurrentUserProfileIdViaApiKey(clusterClient, request);
      }
    }

    if (!profileId) {
      this.recordGetCurrentFailure({
        profileActivationRequired,
        apiKeyRetrievalRequired,
        fakeRequestProfileResolution,
      });
      return null;
    }

    const requestDescriptor = sessionId
      ? ` [sid=${getPrintableSessionId(sessionId)}]`
      : ` [fake=${!!fakeRequestProfileResolution}]`;

    let body;
    try {
      body = await clusterClient.asInternalUser.security.getUserProfile({
        uid: profileId,
        data: dataPath ? prefixCommaSeparatedValues(dataPath, KIBANA_DATA_ROOT) : undefined,
      });
    } catch (error) {
      this.recordGetCurrentFailure({
        profileActivationRequired,
        apiKeyRetrievalRequired,
        fakeRequestProfileResolution,
      });
      this.logger.error(
        `Failed to retrieve user profile for the current user${requestDescriptor}: ${getDetailedErrorMessage(
          error
        )}`
      );
      throw error;
    }

    if (body.profiles.length === 0) {
      this.recordGetCurrentFailure({
        profileActivationRequired,
        apiKeyRetrievalRequired,
        fakeRequestProfileResolution,
      });
      this.logger.error(`The user profile for the current user${requestDescriptor} is not found.`);
      throw new Error(`User profile is not found.`);
    }

    this.recordGetCurrentSuccess({
      profileActivationRequired,
      apiKeyRetrievalRequired,
      fakeRequestProfileResolution,
    });
    this.logger.debug(`Returning current user profile.`);
    return parseUserProfileWithSecurity<D>(body.profiles[0]);
  }

  /**
   * See {@link UserProfileServiceStart} for documentation.
   */
  private async bulkGet<D extends UserProfileData>(
    clusterClient: IClusterClient,
    { uids, dataPath }: UserProfileBulkGetParams
  ): Promise<Array<UserProfile<D>>> {
    if (uids.size === 0) {
      return [];
    }

    const uidArray = [...uids];

    // Because the Bulk Get User Profile API is a GET there is a limit on how many UIDs we can pass in a single request.
    // To avoid hitting the limit we split UIDs into batches and perform multiple requests if needed
    const batches = [];
    for (let i = 0; i < uidArray.length; i += BULK_GET_MAX_UIDS_PER_BATCH) {
      batches.push(uidArray.slice(i, i + BULK_GET_MAX_UIDS_PER_BATCH));
    }

    try {
      const limit = pLimit(BULK_GET_MAX_CONCURRENT_BATCH_REQUESTS);
      const batchPromises = batches.map((batchUids) => {
        return limit(async () => {
          const body = await clusterClient.asInternalUser.security.getUserProfile({
            uid: batchUids.join(','),
            data: dataPath ? prefixCommaSeparatedValues(dataPath, KIBANA_DATA_ROOT) : undefined,
          });
          return body.profiles.map((rawUserProfile) => parseUserProfile<D>(rawUserProfile));
        });
      });

      const batchResults = await Promise.all(batchPromises);
      return batchResults.flat();
    } catch (error) {
      this.logger.error(`Failed to bulk get user profiles: ${getDetailedErrorMessage(error)}`);
      throw error;
    }
  }

  /**
   * See {@link UserProfileServiceStartInternal} for documentation.
   */
  private async update<D extends UserProfileData>(
    clusterClient: IClusterClient,
    uid: string,
    data: D
  ) {
    try {
      await clusterClient.asInternalUser.security.updateUserProfileData({
        uid,
        data: { [KIBANA_DATA_ROOT]: data },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update user profile [uid=${uid}]: ${getDetailedErrorMessage(error)}`
      );
      throw error;
    }
  }

  /**
   * See {@link UserProfileServiceStart} for documentation.
   */
  private async suggest<D extends UserProfileData>(
    clusterClient: IClusterClient,
    params: UserProfileSuggestParams
  ): Promise<Array<UserProfile<D>>> {
    if (!this.license?.getFeatures().allowUserProfileCollaboration) {
      throw Error("Current license doesn't support user profile collaboration APIs.");
    }

    const { name, hint, size = DEFAULT_SUGGESTIONS_COUNT, dataPath, requiredPrivileges } = params;
    if (size > MAX_SUGGESTIONS_COUNT) {
      throw Error(
        `Can return up to ${MAX_SUGGESTIONS_COUNT} suggestions, but ${size} suggestions were requested.`
      );
    }

    // 1. If privileges are not defined, request as many results as has been requested
    // 2. If privileges are defined, request two times more suggestions than requested to account
    // for the results that don't pass privileges check, but not less than minimal batch size
    // used to perform privileges check (fetching is cheap, privileges check is not).
    const numberOfResultsToRequest =
      (requiredPrivileges?.privileges.kibana.length ?? 0) > 0
        ? Math.max(size * 2, MIN_SUGGESTIONS_FOR_PRIVILEGES_CHECK)
        : size;

    try {
      const body = await clusterClient.asInternalUser.security.suggestUserProfiles({
        name,
        size: numberOfResultsToRequest,
        hint,
        // If fetching data turns out to be a performance bottleneck, we can try to fetch data
        // only for the profiles that pass privileges check as a separate bulkGet request.
        data: dataPath ? prefixCommaSeparatedValues(dataPath, KIBANA_DATA_ROOT) : undefined,
      });

      const filteredProfiles =
        requiredPrivileges && requiredPrivileges?.privileges.kibana.length > 0
          ? await this.filterProfilesByPrivileges(body.profiles, requiredPrivileges, size)
          : body.profiles;
      return filteredProfiles.map((rawProfile) => parseUserProfile<D>(rawProfile));
    } catch (error) {
      this.logger.error(
        `Failed to get user profiles suggestions [name=${name}]: ${getDetailedErrorMessage(error)}`
      );
      throw error;
    }
  }

  private async filterProfilesByPrivileges(
    profilesToFilter: SecurityUserProfile[],
    requiredPrivileges: UserProfileRequiredPrivileges,
    requiredSize: number
  ): Promise<SecurityUserProfile[]> {
    // First try to check privileges for the maximum amount of profiles prioritizing a happy path i.e. first
    // `requiredSize` profiles have all necessary privileges. Otherwise, check privileges for the remaining profiles in
    // reasonably sized batches to optimize network round-trips until we find `requiredSize` profiles with necessary
    // privileges, or we check all returned profiles.
    const filteredProfiles = [];
    while (profilesToFilter.length > 0 && filteredProfiles.length < requiredSize) {
      const profilesBatch: Map<string, SecurityUserProfile> = new Map(
        profilesToFilter
          .splice(
            0,
            Math.max(requiredSize - filteredProfiles.length, MIN_SUGGESTIONS_FOR_PRIVILEGES_CHECK)
          )
          .map((profile) => [profile.uid, profile])
      );

      const profileUidsToFilter = new Set(profilesBatch.keys());
      let response: CheckUserProfilesPrivilegesResponse;
      try {
        response = await this.authz!.checkUserProfilesPrivileges(profileUidsToFilter).atSpace(
          requiredPrivileges.spaceId,
          requiredPrivileges.privileges
        );
      } catch (error) {
        this.logger.error(
          `Failed to check required privileges for the suggested profiles: ${getDetailedErrorMessage(
            error
          )}`
        );
        throw error;
      }

      const unknownUids = [];
      for (const profileUid of response.hasPrivilegeUids) {
        const filteredProfile = profilesBatch.get(profileUid);
        // We check privileges in batches and the batch can have more users than requested. We ignore "excessive" users,
        // but still iterate through entire batch to collect and report all unknown uids.
        if (filteredProfile && filteredProfiles.length < requiredSize) {
          filteredProfiles.push(filteredProfile);
        } else if (!filteredProfile) {
          unknownUids.push(profileUid);
        }
      }

      // Log unknown profile UIDs.
      if (unknownUids.length > 0) {
        this.logger.error(`Privileges check API returned unknown profile UIDs: ${unknownUids}.`);
      }

      // Log profile UIDs and reason for which an error was encountered.
      if (response.errors?.count) {
        const uids = Object.keys(response.errors.details);

        for (const uid of uids) {
          this.logger.error(
            `Privileges check API failed for UID ${uid} because ${response.errors.details[uid].reason}.`
          );
        }
      }
    }

    return filteredProfiles;
  }
}

/**
 * Returns string of comma separated values prefixed with `prefix`.
 * @param str String of comma separated values
 * @param prefix Prefix to use prepend to each value
 */
export function prefixCommaSeparatedValues(str: string, prefix: string) {
  return str
    .split(',')
    .reduce<string[]>((accumulator, value) => {
      const trimmedValue = value.trim();
      if (trimmedValue) {
        accumulator.push(`${prefix}.${trimmedValue}`);
      }
      return accumulator;
    }, [])
    .join(',');
}
