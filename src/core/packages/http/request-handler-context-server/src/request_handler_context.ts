/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { RequestHandlerContextBase } from '@kbn/core-http-server';
import type { ElasticsearchRequestHandlerContext } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsRequestHandlerContext } from '@kbn/core-saved-objects-server';
import type { DeprecationsRequestHandlerContext } from '@kbn/core-deprecations-server';
import type { UiSettingsRequestHandlerContext } from '@kbn/core-ui-settings-server';
import type { SecurityRequestHandlerContext } from '@kbn/core-security-server';
import type { UserProfileRequestHandlerContext } from '@kbn/core-user-profile-server';
import type { FeatureFlagsRequestHandlerContext } from '@kbn/core-feature-flags-server';
import type { I18nRequestHandlerContext } from '@kbn/core-i18n-server';

/**
 * The `core` context provided to route handler.
 *
 * Provides the following clients and services:
 *    - {@link SavedObjectsClient | savedObjects.client} - Saved Objects client
 *      which uses the credentials of the incoming request
 *    - {@link ISavedObjectTypeRegistry | savedObjects.typeRegistry} - Type registry containing
 *      all the registered types.
 *    - {@link IScopedClusterClient | elasticsearch.client} - Elasticsearch
 *      data client which uses the credentials of the incoming request
 *    - {@link IUiSettingsClient | uiSettings.client} - uiSettings client
 *      which uses the credentials of the incoming request
 * @public
 */
export interface CoreRequestHandlerContext {
  /**
   * {@link SavedObjectsRequestHandlerContext}
   */
  savedObjects: SavedObjectsRequestHandlerContext;
  /**
   * {@link ElasticsearchRequestHandlerContext}
   */
  elasticsearch: ElasticsearchRequestHandlerContext;
  /**
   * {@link FeatureFlagsRequestHandlerContext}
   */
  featureFlags: FeatureFlagsRequestHandlerContext;
  /**
   * {@link UiSettingsRequestHandlerContext}
   */
  uiSettings: UiSettingsRequestHandlerContext;
  /**
   * {@link DeprecationsRequestHandlerContext}
   */
  deprecations: DeprecationsRequestHandlerContext;
  /**
   * {@link SecurityRequestHandlerContext}
   */
  security: SecurityRequestHandlerContext;
  /**
   * {@link UserProfileRequestHandlerContext}
   */
  userProfile: UserProfileRequestHandlerContext;
  /**
   * {@link I18nRequestHandlerContext} - translates strings into the locale
   * resolved for the current request (profile → cookie → Accept-Language on
   * serverless → `i18n.defaultLocale`).
   */
  i18n: I18nRequestHandlerContext;
}

/**
 * Base context passed to a route handler, containing the `core` context part.
 *
 * @public
 */
export interface RequestHandlerContext extends RequestHandlerContextBase {
  /**
   * Promise that resolves the {@link CoreRequestHandlerContext}
   */
  core: Promise<CoreRequestHandlerContext>;
}

/**
 * Mixin allowing plugins to define their own request handler contexts.
 *
 * @public
 */
export type CustomRequestHandlerContext<T> = RequestHandlerContext & {
  [Key in keyof T]: T[Key] extends Promise<unknown> ? T[Key] : Promise<T[Key]>;
};
