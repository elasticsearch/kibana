/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable max-classes-per-file */

import type { BuildFlavor } from '@kbn/config';
import type { IClusterClient, KibanaRequest, Logger } from '@kbn/core/server';
import { HTTPAuthorizationHeader, isUiamCredential } from '@kbn/core-security-server';
import type { KibanaFeature } from '@kbn/features-plugin/server';
import type {
  ClientAuthentication,
  CloneAPIKeyParams,
  CloneAPIKeyResult,
  CreateAPIKeyParams,
  CreateAPIKeyResult,
  CreateRestAPIKeyParams,
  CreateRestAPIKeyWithKibanaPrivilegesParams,
  GrantAPIKeyResult,
  InvalidateAPIKeyResult,
  InvalidateAPIKeysParams,
  NativeAPIKeysType,
  ValidateAPIKeyParams,
} from '@kbn/security-plugin-types-server';
import { isCreateRestAPIKeyParams } from '@kbn/security-plugin-types-server';

import { getFakeKibanaRequest } from './fake_kibana_request';
import type { SecurityLicense } from '../../../common';
import { transformPrivilegesToElasticsearchPrivileges, validateKibanaPrivileges } from '../../lib';
import type { UpdateAPIKeyParams, UpdateAPIKeyResult } from '../../routes/api_keys';
import { type UiamServicePublic } from '../../uiam';
import { BasicHTTPAuthorizationHeaderCredentials } from '../http_authentication';

export type { UpdateAPIKeyParams, UpdateAPIKeyResult };

const ELASTICSEARCH_CLIENT_AUTHENTICATION_HEADER = 'es-client-authentication';

/**
 * Represents the options to create an APIKey class instance that will be
 * shared between functions (create, invalidate, etc).
 */
export interface ConstructorOptions {
  logger: Logger;
  clusterClient: IClusterClient;
  license: SecurityLicense;
  applicationName: string;
  kibanaFeatures: KibanaFeature[];
  buildFlavor?: BuildFlavor;
  uiam?: UiamServicePublic;
}

type GrantAPIKeyParams =
  | {
      api_key: CreateRestAPIKeyParams | CreateRestAPIKeyWithKibanaPrivilegesParams;
      grant_type: 'password';
      username: string;
      password: string;
    }
  | {
      api_key: CreateRestAPIKeyParams | CreateRestAPIKeyWithKibanaPrivilegesParams;
      grant_type: 'access_token';
      access_token: string;
    };

/**
 * Class responsible for managing Elasticsearch API keys.
 */
export class APIKeys implements NativeAPIKeysType {
  private readonly logger: Logger;
  private readonly clusterClient: IClusterClient;
  private readonly license: SecurityLicense;
  private readonly applicationName: string;
  private readonly kibanaFeatures: KibanaFeature[];
  private readonly buildFlavor?: BuildFlavor;
  private readonly uiam?: UiamServicePublic;

  constructor({
    logger,
    clusterClient,
    license,
    applicationName,
    kibanaFeatures,
    buildFlavor,
    uiam,
  }: ConstructorOptions) {
    this.logger = logger;
    this.clusterClient = clusterClient;
    this.license = license;
    this.applicationName = applicationName;
    this.kibanaFeatures = kibanaFeatures;
    this.buildFlavor = buildFlavor;
    this.uiam = uiam;
  }

  /**
   * Determines if API Keys are enabled in Elasticsearch.
   */
  async areAPIKeysEnabled(): Promise<boolean> {
    if (!this.license.isEnabled()) {
      return false;
    }

    const id = 'kibana-api-key-service-test';

    this.logger.debug(
      `Testing if API Keys are enabled by attempting to invalidate a non-existant key: ${id}`
    );
    try {
      await this.clusterClient.asInternalUser.security.invalidateApiKey({ ids: [id] });
      return true;
    } catch (e) {
      if (this.doesErrorIndicateAPIKeysAreDisabled(e)) {
        return false;
      }
      throw e;
    }
  }

  /**
   * Determines if cross-cluster API Keys are enabled in Elasticsearch.
   */
  async areCrossClusterAPIKeysEnabled(): Promise<boolean> {
    if (!this.license.isEnabled() || this.buildFlavor === 'serverless') {
      return false;
    }

    const id = 'kibana-api-key-service-test';

    this.logger.debug(
      `Testing if cross-cluster API Keys are enabled by attempting to update a non-existant key: ${id}`
    );
    try {
      await this.clusterClient.asInternalUser.transport.request({
        method: 'PUT',
        path: `/_security/cross_cluster/api_key/${id}`,
        body: {}, // We are sending an empty request body and expect a validation error if Update cross-cluster API key endpoint is available.
      });
      return false;
    } catch (error) {
      return !this.doesErrorIndicateCrossClusterAPIKeysAreDisabled(error);
    }
  }

  /**
   * Tries to create an API key for the current user.
   *
   * Returns newly created API key or `null` if API keys are disabled.
   *
   * User needs `manage_api_key` privilege to create REST API keys and `manage_security` for cross-cluster API keys.
   *
   * @param request Request instance.
   * @param createParams The params to create an API key
   */
  async create(
    request: KibanaRequest,
    createParams: CreateAPIKeyParams
  ): Promise<CreateAPIKeyResult | null> {
    if (!this.license.isEnabled()) {
      return null;
    }
    const { type, expiration, name, metadata } = createParams;
    const scopedClusterClient = this.clusterClient.asScoped(request);

    this.logger.debug('Trying to create an API key');

    let result: CreateAPIKeyResult;

    try {
      if (type === 'cross_cluster') {
        result = await scopedClusterClient.asCurrentUser.transport.request<CreateAPIKeyResult>({
          method: 'POST',
          path: '/_security/cross_cluster/api_key',
          body: {
            name,
            expiration,
            metadata,
            access: createParams.access,
            certificate_identity: createParams.certificate_identity,
          },
        });
      } else {
        result = await scopedClusterClient.asCurrentUser.security.createApiKey({
          name,
          expiration,
          metadata,
          role_descriptors: isCreateRestAPIKeyParams(createParams)
            ? createParams.role_descriptors
            : this.parseRoleDescriptorsWithKibanaPrivileges(
                createParams.kibana_role_descriptors,
                this.kibanaFeatures,
                false
              ),
        });
      }

      this.logger.debug('API key was created successfully');
    } catch (error) {
      this.logger.error(`Failed to create API key: ${error.message}`);
      throw error;
    }
    return result;
  }

  /**
   * Attempts update an API key with the provided 'role_descriptors' and 'metadata'
   *
   * Returns `updated`, `true` if the update was successful, `false` if there was nothing to update
   *
   * User needs `manage_api_key` privilege to update REST API keys and `manage_security` for cross-cluster API keys.
   *
   * @param request Request instance.
   * @param updateParams The params to edit an API key
   */
  async update(
    request: KibanaRequest,
    updateParams: UpdateAPIKeyParams
  ): Promise<UpdateAPIKeyResult | null> {
    if (!this.license.isEnabled()) {
      return null;
    }

    const { type, id, expiration, metadata } = updateParams;
    const scopedClusterClient = this.clusterClient.asScoped(request);

    this.logger.debug('Trying to edit an API key');

    let result: UpdateAPIKeyResult;
    try {
      if (type === 'cross_cluster') {
        result = await scopedClusterClient.asCurrentUser.transport.request<UpdateAPIKeyResult>({
          method: 'PUT',
          path: `/_security/cross_cluster/api_key/${id}`,
          body: {
            expiration,
            metadata,
            access: updateParams.access,
            certificate_identity: updateParams.certificate_identity,
          },
        });
      } else {
        result = await scopedClusterClient.asCurrentUser.security.updateApiKey({
          id,
          expiration,
          metadata,
          role_descriptors:
            'role_descriptors' in updateParams
              ? updateParams.role_descriptors
              : this.parseRoleDescriptorsWithKibanaPrivileges(
                  updateParams.kibana_role_descriptors,
                  this.kibanaFeatures,
                  true
                ),
        });
      }

      if (result.updated) {
        this.logger.debug('API key was updated successfully');
      } else {
        this.logger.debug('There were no updates to make for API key');
      }
    } catch (error) {
      this.logger.error(`Failed to update API key: ${error.message}`);
      throw error;
    }
    return result;
  }

  /**
   * Tries to grant an API key for the current user.
   * @param request Request instance.
   * @param createParams Create operation parameters.
   */
  async grantAsInternalUser(
    request: KibanaRequest,
    createParams: CreateRestAPIKeyParams | CreateRestAPIKeyWithKibanaPrivilegesParams
  ) {
    if (!this.license.isEnabled()) {
      return null;
    }

    this.logger.debug('Trying to grant an API key');
    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    if (authorizationHeader == null) {
      throw new Error(
        `Unable to grant an API Key, request does not contain an authorization header`
      );
    }

    // If API key is granted for UIAM credentials, we need to pass UIAM client authentication and ignore any other
    // client credentials that might have been provided. Otherwise, try to extract optional Elasticsearch client
    // credentials from `es-client-authentication` HTTP header (currently only used by JWT).
    let clientAuthentication: ClientAuthentication | undefined;

    if (this.uiam && isUiamCredential(authorizationHeader)) {
      clientAuthentication = this.uiam.getClientAuthentication();
    } else {
      const clientAuthorizationHeader = HTTPAuthorizationHeader.parseFromRequest(
        request,
        ELASTICSEARCH_CLIENT_AUTHENTICATION_HEADER
      );

      if (clientAuthorizationHeader) {
        clientAuthentication = {
          scheme: clientAuthorizationHeader.scheme,
          value: clientAuthorizationHeader.credentials,
        };
      }
    }

    const { expiration, metadata, name } = createParams;
    const roleDescriptors =
      'role_descriptors' in createParams
        ? createParams.role_descriptors
        : this.parseRoleDescriptorsWithKibanaPrivileges(
            createParams.kibana_role_descriptors,
            this.kibanaFeatures,
            false
          );

    const params = this.getGrantParams(
      { expiration, metadata, name, role_descriptors: roleDescriptors },
      authorizationHeader,
      clientAuthentication
    );
    // User needs `manage_api_key` or `grant_api_key` privilege to use this API
    let result: GrantAPIKeyResult;
    try {
      result = await this.clusterClient.asInternalUser.security.grantApiKey(params);
      this.logger.debug('API key was granted successfully');
    } catch (e) {
      this.logger.error(`Failed to grant API key: ${e.message}`);
      throw e;
    }

    return result;
  }

  /**
   * Clones an existing API key using the internal user. Extracts the source key credential
   * from the request's Authorization header and calls the ES clone endpoint to create a new
   * independent key with the same role descriptors and no expiration.
   */
  async cloneAsInternalUser(
    request: KibanaRequest,
    cloneParams: CloneAPIKeyParams
  ): Promise<CloneAPIKeyResult | null> {
    if (!this.license.isEnabled()) {
      return null;
    }

    this.logger.debug('Trying to clone an API key');

    const authorizationHeader = HTTPAuthorizationHeader.parseFromRequest(request);
    if (authorizationHeader == null) {
      throw new Error(
        'Unable to clone an API key, request does not contain an authorization header'
      );
    }

    if (authorizationHeader.scheme.toLowerCase() !== 'apikey') {
      throw new Error(
        `Unable to clone an API key, expected ApiKey authorization scheme but got "${authorizationHeader.scheme}"`
      );
    }

    try {
      const result = await this.clusterClient.asInternalUser.transport.request<CloneAPIKeyResult>({
        method: 'POST',
        path: '/_security/api_key/clone',
        body: {
          api_key: authorizationHeader.credentials,
          name: cloneParams.name,
          expiration: null,
          ...(cloneParams.metadata ? { metadata: cloneParams.metadata } : {}),
        },
      });

      this.logger.debug('API key was cloned successfully');
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      this.logger.debug(`Failed to clone API key: ${message}`);
      throw e;
    }
  }

  /**
   * Tries to invalidate an API keys.
   * @param request Request instance.
   * @param params The params to invalidate an API keys.
   */
  async invalidate(request: KibanaRequest, params: InvalidateAPIKeysParams) {
    if (!this.license.isEnabled()) {
      return null;
    }

    this.logger.debug(`Trying to invalidate ${params.ids.length} an API key as current user`);
    let result: InvalidateAPIKeyResult;
    try {
      // User needs `manage_api_key` privilege to use this API
      result = await this.clusterClient.asScoped(request).asCurrentUser.security.invalidateApiKey({
        ids: params.ids,
      });
      this.logger.debug(
        `API keys by ids=[${params.ids.join(', ')}] was invalidated successfully as current user`
      );
    } catch (e) {
      this.logger.error(
        `Failed to invalidate API keys by ids=[${params.ids.join(', ')}] as current user: ${
          e.message
        }`
      );
      throw e;
    }

    return result;
  }

  /**
   * Tries to invalidate the API keys by using the internal user.
   * @param params The params to invalidate the API keys.
   */
  async invalidateAsInternalUser(params: InvalidateAPIKeysParams) {
    if (!this.license.isEnabled()) {
      return null;
    }

    this.logger.debug(`Trying to invalidate ${params.ids.length} API keys`);

    let result: InvalidateAPIKeyResult;

    try {
      // Internal user needs `cluster:admin/xpack/security/api_key/invalidate` privilege to use this API
      result = await this.clusterClient.asInternalUser.security.invalidateApiKey({
        ids: params.ids,
      });
      this.logger.debug(`API keys by ids=[${params.ids.join(', ')}] was invalidated successfully`);
    } catch (e) {
      this.logger.error(
        `Failed to invalidate API keys by ids=[${params.ids.join(', ')}]: ${e.message}`
      );
      throw e;
    }

    return result;
  }

  /**
   * Tries to validate an API key.
   * @param apiKeyPrams ValidateAPIKeyParams.
   */
  async validate(apiKeyPrams: ValidateAPIKeyParams): Promise<boolean> {
    if (!this.license.isEnabled()) {
      return false;
    }

    const fakeRequest = getFakeKibanaRequest(apiKeyPrams);

    this.logger.debug(`Trying to validate an API key`);
    try {
      await this.clusterClient.asScoped(fakeRequest).asCurrentUser.security.authenticate();
      this.logger.debug(`API key was validated successfully`);
      return true;
    } catch (e) {
      this.logger.info(`Failed to validate API key: ${e.message}`);
    }

    return false;
  }

  private doesErrorIndicateAPIKeysAreDisabled(e: Record<string, any>) {
    const disabledFeature = e.body?.error?.['disabled.feature'];
    return disabledFeature === 'api_keys';
  }

  private doesErrorIndicateCrossClusterAPIKeysAreDisabled(error: Record<string, any>) {
    return (
      error.statusCode !== 400 || error.body?.error?.type !== 'action_request_validation_exception'
    );
  }

  private getGrantParams(
    createParams: CreateRestAPIKeyParams | CreateRestAPIKeyWithKibanaPrivilegesParams,
    authorizationHeader: HTTPAuthorizationHeader,
    clientAuthentication?: ClientAuthentication
  ): GrantAPIKeyParams {
    if (authorizationHeader.scheme.toLowerCase() === 'bearer') {
      return {
        api_key: createParams,
        grant_type: 'access_token',
        access_token: authorizationHeader.credentials,
        ...(clientAuthentication ? { client_authentication: clientAuthentication } : {}),
      };
    }

    if (authorizationHeader.scheme.toLowerCase() === 'basic') {
      const basicCredentials = BasicHTTPAuthorizationHeaderCredentials.parseFromCredentials(
        authorizationHeader.credentials
      );
      return {
        api_key: createParams,
        grant_type: 'password',
        username: basicCredentials.username,
        password: basicCredentials.password,
      };
    }

    throw new Error(`Unsupported scheme "${authorizationHeader.scheme}" for granting API Key`);
  }

  private parseRoleDescriptorsWithKibanaPrivileges(
    kibanaRoleDescriptors: CreateRestAPIKeyWithKibanaPrivilegesParams['kibana_role_descriptors'],
    features: KibanaFeature[],
    isEdit: boolean
  ) {
    const roleDescriptors = Object.create(null);

    const allValidationErrors: string[] = [];
    if (kibanaRoleDescriptors) {
      Object.entries(kibanaRoleDescriptors).forEach(([roleKey, roleDescriptor]) => {
        const { validationErrors } = validateKibanaPrivileges(features, roleDescriptor.kibana);
        allValidationErrors.push(...validationErrors);

        const applications = transformPrivilegesToElasticsearchPrivileges(
          this.applicationName,
          roleDescriptor.kibana
        );
        if (applications.length > 0 && roleDescriptors) {
          roleDescriptors[roleKey] = {
            ...roleDescriptor.elasticsearch,
            applications,
          };
        }
      });
    }
    if (allValidationErrors.length) {
      if (isEdit) {
        throw new UpdateApiKeyValidationError(
          `API key cannot be updated due to validation errors: ${JSON.stringify(
            allValidationErrors
          )}`
        );
      } else {
        throw new CreateApiKeyValidationError(
          `API key cannot be created due to validation errors: ${JSON.stringify(
            allValidationErrors
          )}`
        );
      }
    }

    return roleDescriptors;
  }
}

export class CreateApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class UpdateApiKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
  }
}
