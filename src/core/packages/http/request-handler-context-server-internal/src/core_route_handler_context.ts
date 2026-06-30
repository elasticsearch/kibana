/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import type { CoreRequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import {
  CoreElasticsearchRouteHandlerContext,
  type InternalElasticsearchServiceStart,
} from '@kbn/core-elasticsearch-server-internal';
import {
  CoreSavedObjectsRouteHandlerContext,
  type InternalSavedObjectsServiceStart,
} from '@kbn/core-saved-objects-server-internal';
import {
  CoreDeprecationsRouteHandlerContext,
  type InternalDeprecationsServiceStart,
} from '@kbn/core-deprecations-server-internal';
import {
  CoreUiSettingsRouteHandlerContext,
  type InternalUiSettingsServiceStart,
} from '@kbn/core-ui-settings-server-internal';
import {
  CoreSecurityRouteHandlerContext,
  type InternalSecurityServiceStart,
} from '@kbn/core-security-server-internal';
import {
  CoreUserProfileRouteHandlerContext,
  type InternalUserProfileServiceStart,
} from '@kbn/core-user-profile-server-internal';
import { CoreFeatureFlagsRouteHandlerContext } from '@kbn/core-feature-flags-server-internal';
import type { FeatureFlagsStart } from '@kbn/core-feature-flags-server';
import type { I18nServiceStart } from '@kbn/core-i18n-server';
import { CoreI18nRouteHandlerContext } from './core_i18n_route_handler_context';

/**
 * Subset of `InternalCoreStart` used by {@link CoreRouteHandlerContext}
 * @internal
 */
export interface CoreRouteHandlerContextParams {
  featureFlags: FeatureFlagsStart;
  elasticsearch: InternalElasticsearchServiceStart;
  savedObjects: InternalSavedObjectsServiceStart;
  uiSettings: InternalUiSettingsServiceStart;
  deprecations: InternalDeprecationsServiceStart;
  security: InternalSecurityServiceStart;
  userProfile: InternalUserProfileServiceStart;
  i18n: I18nServiceStart;
}

/**
 * The concrete implementation for Core's route handler context.
 *
 * @internal
 */
export class CoreRouteHandlerContext implements CoreRequestHandlerContext {
  #featureFlags?: CoreFeatureFlagsRouteHandlerContext;
  #elasticsearch?: CoreElasticsearchRouteHandlerContext;
  #savedObjects?: CoreSavedObjectsRouteHandlerContext;
  #uiSettings?: CoreUiSettingsRouteHandlerContext;
  #deprecations?: CoreDeprecationsRouteHandlerContext;
  #security?: CoreSecurityRouteHandlerContext;
  #userProfile?: CoreUserProfileRouteHandlerContext;
  #i18n?: CoreI18nRouteHandlerContext;

  constructor(
    private readonly coreStart: CoreRouteHandlerContextParams,
    private readonly request: KibanaRequest
  ) {}

  public get featureFlags() {
    if (!this.#featureFlags) {
      this.#featureFlags = new CoreFeatureFlagsRouteHandlerContext(this.coreStart.featureFlags);
    }
    return this.#featureFlags;
  }

  public get elasticsearch() {
    if (!this.#elasticsearch) {
      this.#elasticsearch = new CoreElasticsearchRouteHandlerContext(
        this.coreStart.elasticsearch,
        this.request
      );
    }
    return this.#elasticsearch;
  }

  public get savedObjects() {
    if (!this.#savedObjects) {
      this.#savedObjects = new CoreSavedObjectsRouteHandlerContext(
        this.coreStart.savedObjects,
        this.request
      );
    }
    return this.#savedObjects;
  }

  public get uiSettings() {
    if (!this.#uiSettings) {
      this.#uiSettings = new CoreUiSettingsRouteHandlerContext(
        this.coreStart.uiSettings,
        this.savedObjects
      );
    }
    return this.#uiSettings;
  }

  public get deprecations() {
    if (!this.#deprecations) {
      this.#deprecations = new CoreDeprecationsRouteHandlerContext(
        this.coreStart.deprecations,
        this.elasticsearch,
        this.savedObjects,
        this.request
      );
    }
    return this.#deprecations;
  }

  public get security() {
    if (!this.#security) {
      this.#security = new CoreSecurityRouteHandlerContext(this.coreStart.security, this.request);
    }
    return this.#security;
  }

  public get userProfile() {
    if (!this.#userProfile) {
      this.#userProfile = new CoreUserProfileRouteHandlerContext(
        this.coreStart.userProfile,
        this.request
      );
    }
    return this.#userProfile;
  }

  public get i18n() {
    if (!this.#i18n) {
      this.#i18n = new CoreI18nRouteHandlerContext(this.coreStart.i18n, this.request);
    }
    return this.#i18n;
  }
}
