/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * The Kibana Core APIs for client-side plugins.
 *
 * A plugin's `public/index` file must contain a named import, `plugin`, that
 * implements {@link PluginInitializer} which returns an object that implements
 * {@link Plugin}.
 *
 * The plugin integrates with the core system via lifecycle events: `setup`,
 * `start`, and `stop`. In each lifecycle method, the plugin will receive the
 * corresponding core services available (either {@link CoreSetup} or
 * {@link CoreStart}) and any interfaces returned by dependency plugins'
 * lifecycle method. Anything returned by the plugin's lifecycle method will be
 * exposed to downstream dependencies when their corresponding lifecycle methods
 * are invoked.
 *
 * @packageDocumentation
 */

import 'reflect-metadata/lite';
import './index.scss';

export type { DocLinksStart } from '@kbn/core-doc-links-browser';
export type { HttpSetup, HttpStart } from '@kbn/core-http-browser';
export type { I18nStart } from '@kbn/core-i18n-browser';
export type {
  FatalErrorsSetup,
  FatalErrorsStart,
  FatalError,
} from '@kbn/core-fatal-errors-browser';
export type {
  EvaluationContext,
  FeatureFlagsSetup,
  FeatureFlagsStart,
} from '@kbn/core-feature-flags-browser';
export type {
  UiSettingsState,
  UiSettingsRuntimeState,
  UiSettingsMetadataState,
  IUiSettingsClient,
  IUiSettingsMetadataClient,
  PublicUiSettingsParams,
} from '@kbn/core-ui-settings-browser';
export type { Capabilities } from '@kbn/core-capabilities-common';
export type {
  NotificationsSetup,
  NotificationsStart,
  FeedbackStart,
  ToursStart,
} from '@kbn/core-notifications-browser';
export type {
  ChromeBadge,
  ChromeBreadcrumb,
  ChromeHelpExtension,
  ChromeHelpExtensionMenuLink,
  ChromeHelpExtensionLinkBase,
  ChromeHelpExtensionMenuCustomLink,
  ChromeHelpExtensionMenuDocumentationLink,
  ChromeNavControl,
  ChromeNavControls,
  ChromeNavLink,
  ChromeNavLinks,
  ChromeDocTitle,
  ChromeStart,
  ChromeRecentlyAccessed,
  ChromeRecentlyAccessedHistoryItem,
  ChromeUserBanner,
} from '@kbn/core-chrome-browser';
export type {
  Plugin,
  PluginInitializer,
  PluginInitializerContext,
} from '@kbn/core-plugins-browser';
export type {
  PluginsServiceSetup,
  PluginsServiceStart,
  PluginContractResolver,
  PluginContractMap,
  PluginContractResolverResponse,
  PluginContractResolverResponseItem,
  FoundPluginContractResolverResponseItem,
  NotFoundPluginContractResolverResponseItem,
} from '@kbn/core-plugins-contracts-browser';
export type { PluginOpaqueId } from '@kbn/core-base-common';

export type { PackageInfo, EnvironmentMode } from '@kbn/config';
export type { DomainDeprecationDetails } from '@kbn/core-deprecations-common';
export type { CoreContext } from '@kbn/core-base-browser-internal';
export {
  DEFAULT_APP_CATEGORIES,
  APP_WRAPPER_CLASS,
  type AppCategory,
} from '@kbn/core-application-common';
export type {
  UiSettingsParams,
  UserProvidedValues,
  UiSettingsType,
} from '@kbn/core-ui-settings-common';

export type {
  AnalyticsClient,
  AnalyticsClientInitContext,
  AnalyticsServiceSetup,
  AnalyticsServiceStart,
  KbnAnalyticsWindowApi,
  // Types for the registerShipper API
  ShipperClassConstructor,
  RegisterShipperOpts,
  // Types for the optIn API
  OptInConfig,
  OptInConfigPerType,
  ShipperName,
  // Types for the registerContextProvider API
  ContextProviderOpts,
  ContextProviderName,
  // Types for the registerEventType API
  EventTypeOpts,
  // Events
  Event,
  EventContext,
  EventType,
  TelemetryCounter,
  TelemetryCounterType,
  // Schema
  RootSchema,
  SchemaObject,
  SchemaArray,
  SchemaChildValue,
  SchemaMeta,
  SchemaValue,
  SchemaMetaOptional,
  PossibleSchemaTypes,
  AllowedSchemaBooleanTypes,
  AllowedSchemaNumberTypes,
  AllowedSchemaStringTypes,
  AllowedSchemaTypes,
  // Shippers
  IShipper,
} from '@kbn/core-analytics-browser';

export { AppStatus } from '@kbn/core-application-browser';
export type {
  ApplicationSetup,
  ApplicationStart,
  App,
  AppDeepLinkLocations,
  AppMount,
  AppUnmount,
  AppMountParameters,
  AppLeaveHandler,
  AppLeaveActionType,
  AppLeaveAction,
  AppLeaveDefaultAction,
  AppLeaveConfirmAction,
  AppUpdatableFields,
  AppUpdater,
  AppNavOptions,
  AppDeepLink,
  PublicAppInfo,
  PublicAppDeepLinkInfo,
  NavigateToAppOptions,
  NavigateToUrlOptions,
  ScopedHistory,
} from '@kbn/core-application-browser';
export { CoreScopedHistory } from '@kbn/core-application-browser-internal';

export type { SavedObjectsFindOptionsReference } from '@kbn/core-saved-objects-api-server';
export type {
  SavedObject,
  SavedObjectTypeIdTuple,
  SavedObjectAttribute,
  SavedObjectAttributes,
  SavedObjectAttributeSingle,
  SavedObjectError,
  SavedObjectReference,
  SavedObjectsMigrationVersion,
  SavedObjectsImportResponse,
  SavedObjectsImportSuccess,
  SavedObjectsImportConflictError,
  SavedObjectsImportAmbiguousConflictError,
  SavedObjectsImportUnsupportedTypeError,
  SavedObjectsImportMissingReferencesError,
  SavedObjectsImportUnexpectedAccessControlMetadataError,
  SavedObjectsImportUnknownError,
  SavedObjectsImportFailure,
  SavedObjectsImportRetry,
  SavedObjectsNamespaceType,
  SavedObjectsImportSimpleWarning,
  SavedObjectsImportActionRequiredWarning,
  SavedObjectsImportWarning,
} from '@kbn/core-saved-objects-common';

export type {
  HttpHeadersInit,
  HttpRequestInit,
  HttpFetchOptions,
  HttpFetchOptionsWithPath,
  HttpFetchQuery,
  HttpInterceptorResponseError,
  HttpInterceptorRequestError,
  HttpInterceptor,
  HttpResponse,
  HttpHandler,
  IBasePath,
  IStaticAssets,
  IAnonymousPaths,
  IExternalUrl,
  IHttpInterceptController,
  ResponseErrorBody,
  IHttpResponseInterceptorOverrides,
} from '@kbn/core-http-browser';

export type { IHttpFetchError } from '@kbn/core-http-browser';

export type {
  AuthenticatedUser,
  User,
  AuthenticationProvider,
  UserRealm,
} from '@kbn/core-security-common';
export type {
  SecurityServiceSetup,
  SecurityServiceStart,
  CoreAuthenticationService,
  CoreSecurityDelegateContract,
} from '@kbn/core-security-browser';

export type {
  UserProfile,
  UserProfileLabels,
  UserProfileWithSecurity,
  UserProfileUserInfoWithSecurity,
  UserProfileUserInfo,
  UserProfileData,
} from '@kbn/core-user-profile-common';
export type {
  UserProfileServiceSetup,
  UserProfileServiceStart,
  UserProfileService,
  CoreUserProfileDelegateContract,
} from '@kbn/core-user-profile-browser';

export type {
  OverlayStart,
  OverlayBannersStart,
  OverlayFlyoutStart,
  OverlayFlyoutOpenOptions,
  OverlayModalOpenOptions,
  OverlayModalConfirmOptions,
  OverlayModalStart,
} from '@kbn/core-overlays-browser';

export type {
  Toast,
  ToastInput,
  IToasts,
  ToastInputFields,
  ToastsSetup,
  ToastsStart,
  ToastOptions,
  ErrorToastOptions,
} from '@kbn/core-notifications-browser';

export type { PricingServiceStart } from '@kbn/core-pricing-browser';

export type { ToastsApi } from '@kbn/core-notifications-browser-internal';

export type { CustomBrandingStart, CustomBrandingSetup } from '@kbn/core-custom-branding-browser';

export type { ThemeServiceSetup, ThemeServiceStart, CoreTheme } from '@kbn/core-theme-browser';

export type {
  DeprecationsServiceStart,
  ResolveDeprecationResponse,
} from '@kbn/core-deprecations-browser';

export type { MountPoint, UnmountCallback, OverlayRef } from '@kbn/core-mount-utils-browser';

export type { KibanaExecutionContext } from '@kbn/core-execution-context-common';

export type {
  ExecutionContextSetup,
  ExecutionContextStart,
} from '@kbn/core-execution-context-browser';

export type { CoreSetup, CoreStart, StartServicesAccessor } from '@kbn/core-lifecycle-browser';

export type { CoreSystem } from '@kbn/core-root-browser-internal';

export { __kbnBootstrap__ } from '@kbn/core-root-browser-internal';
