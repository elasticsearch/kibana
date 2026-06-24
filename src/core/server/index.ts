/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * The Kibana Core APIs for server-side plugins.
 *
 * A plugin requires a `kibana.json` file at it's root directory that follows
 * {@link PluginManifest | the manfiest schema} to define static plugin
 * information required to load the plugin.
 *
 * A plugin's `server/index` file must contain a named import, `plugin`, that
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

import 'reflect-metadata';
import type { Type } from '@kbn/config-schema';
import type { AppenderConfigType } from '@kbn/core-logging-server';
import { appendersSchema } from '@kbn/core-logging-server-internal';
import type {
  ExecutionContextSetup,
  ExecutionContextStart,
} from '@kbn/core-execution-context-server';
import type {
  RequestHandler,
  KibanaResponseFactory,
  RouteMethod,
  HttpServiceSetup,
  IRouter,
} from '@kbn/core-http-server';
import { configSchema as elasticsearchConfigSchema } from '@kbn/core-elasticsearch-server-internal';
import type { CapabilitiesSetup, CapabilitiesStart } from '@kbn/core-capabilities-server';
import type { RequestHandlerContext } from '@kbn/core-http-request-handler-context-server';
import type { HttpResources } from '@kbn/core-http-resources-server';
import type {
  InternalPluginsServiceSetup,
  InternalPluginsServiceStart,
} from '@kbn/core-plugins-server-internal';

export { bootstrap } from '@kbn/core-root-server-internal';

export type { PluginOpaqueId } from '@kbn/core-base-common';
export type {
  CoreUsageStats,
  CoreUsageData,
  CoreConfigUsageData,
  CoreEnvironmentUsageData,
  CoreServicesUsageData,
  ConfigUsageData,
  CoreUsageDataSetup,
  CoreUsageDataStart,
  CoreUsageCounter,
  CoreIncrementUsageCounter,
  CoreIncrementCounterParams,
} from '@kbn/core-usage-data-server';

export type { KibanaExecutionContext } from '@kbn/core-execution-context-common';
export type { IExecutionContextContainer } from '@kbn/core-execution-context-server';
export type {
  EvaluationContext,
  FeatureFlagsStart,
  FeatureFlagsSetup,
} from '@kbn/core-feature-flags-server';
export type { Capabilities } from '@kbn/core-capabilities-common';
export type {
  CapabilitiesProvider,
  CapabilitiesSwitcher,
  ResolveCapabilitiesOptions,
} from '@kbn/core-capabilities-server';
export type {
  ConfigPath,
  ConfigService,
  ConfigDeprecation,
  ConfigDeprecationContext,
  ConfigDeprecationProvider,
  ConfigDeprecationFactory,
  AddConfigDeprecation,
  EnvironmentMode,
  PackageInfo,
} from '@kbn/config';

export type { CoreId } from '@kbn/core-base-common-internal';

export { ElasticsearchConfig, pollEsNodesVersion } from '@kbn/core-elasticsearch-server-internal';
export type {
  NodesVersionCompatibility,
  PollEsNodesVersionOptions,
} from '@kbn/core-elasticsearch-server-internal';
export type {
  ElasticsearchServicePreboot,
  ElasticsearchServiceSetup,
  ElasticsearchServiceStart,
  ElasticsearchConfigPreboot,
  ElasticsearchRequestHandlerContext,
  FakeRequest,
  ScopeableRequest,
  ElasticsearchClient,
  ElasticsearchRequestLoggingOptions,
  IClusterClient,
  ICustomClusterClient,
  ElasticsearchClientConfig,
  ElasticsearchClientSslConfig,
  IScopedClusterClient,
  UnauthorizedErrorHandlerOptions,
  UnauthorizedErrorHandlerResultRetryParams,
  UnauthorizedErrorHandlerRetryResult,
  UnauthorizedErrorHandlerNotHandledResult,
  UnauthorizedErrorHandlerResult,
  UnauthorizedErrorHandlerToolkit,
  UnauthorizedErrorHandler,
} from '@kbn/core-elasticsearch-server';

export type {
  SecurityServiceSetup,
  SecurityServiceStart,
  CoreAuthenticationService,
  CoreAuditService,
  AuditEvent,
  AuditHttp,
  AuditKibana,
  AuditRequest,
  AuditLogger,
} from '@kbn/core-security-server';
export type {
  User,
  UserRealm,
  AuthenticatedUser,
  AuthenticationProvider,
} from '@kbn/core-security-common';

export type {
  UserProfileUserInfo,
  UserProfile,
  UserProfileUserInfoWithSecurity,
  UserProfileWithSecurity,
  UserProfileLabels,
  UserProfileData,
} from '@kbn/core-user-profile-common';
export type {
  UserProfileRequestHandlerContext,
  UserProfileServiceSetup,
  UserProfileServiceStart,
} from '@kbn/core-user-profile-server';

export { CspConfig } from '@kbn/core-http-server-internal';
export { kibanaResponseFactory } from '@kbn/core-http-router-server-internal';

export type {
  AuthenticationHandler,
  AuthHeaders,
  AuthResultParams,
  AuthToolkit,
  AuthResultRedirected,
  AuthRedirectedParams,
  AuthResult,
  AuthResultType,
  AuthResultAuthenticated,
  AuthResultNotHandled,
  IContextProvider,
  HandlerFunction,
  HandlerContextType,
  HandlerParameters,
  DestructiveRouteMethod,
  SafeRouteMethod,
  KibanaRequest,
  ResponseError,
  ResponseErrorAttributes,
  ResponseHeaders,
  KibanaResponseFactory,
  RouteConfig,
  RouteRegistrar,
  RouteMethod,
  RouteConfigOptions,
  RouteConfigOptionsBody,
  RouteContentType,
  RouteValidatorConfig,
  RouteValidationSpec,
  RouteValidationFunction,
  RouteValidatorOptions,
  RouteValidatorFullConfigRequest,
  RouteValidationResultFactory,
  RouteValidationError,
  RedirectResponseOptions,
  RequestHandlerWrapper,
  KibanaRequestEvents,
  KibanaRequestRoute,
  KibanaRequestRouteOptions,
  IKibanaResponse,
  KnownHeaders,
  ErrorHttpResponseOptions,
  IKibanaSocket,
  HttpResponseOptions,
  HttpResponsePayload,
  Headers,
  CustomHttpResponseOptions,
  OnPreAuthHandler,
  OnPreAuthToolkit,
  OnPreRoutingHandler,
  OnPreRoutingToolkit,
  OnPostAuthHandler,
  OnPostAuthToolkit,
  OnPreResponseHandler,
  OnPreResponseToolkit,
  OnPreResponseRender,
  OnPreResponseExtensions,
  OnPreResponseInfo,
  ICspConfig,
  IExternalUrlConfig,
  IBasePath,
  IStaticAssets,
  SessionStorage,
  SessionStorageCookieOptions,
  SessionStorageSetOptions,
  SessionCookieValidationResult,
  SessionStorageFactory,
  GetAuthState,
  IsAuthenticated,
  AuthStatus,
  GetAuthHeaders,
  IContextContainer,
  HttpAuth,
  HttpServerInfo,
  HttpServicePreboot,
  HttpServiceStart,
  RawRequest,
  FakeRawRequest,
  HttpProtocol,
} from '@kbn/core-http-server';
export type { IExternalUrlPolicy } from '@kbn/core-http-common';

export {
  validBodyOutput,
  OnPostAuthResultType,
  ReservedPrivilegesSet,
} from '@kbn/core-http-server';

export type {
  HttpResourcesRenderOptions,
  HttpResourcesResponseOptions,
  HttpResourcesServiceToolkit,
  HttpResourcesRequestHandler,
} from '@kbn/core-http-resources-server';

export type {
  LoggingServiceSetup,
  LoggerContextConfigInput,
  LoggerConfigType,
  AppenderConfigType,
} from '@kbn/core-logging-server';
export type { Logger, LoggerFactory, LogMeta, LogRecord, LogLevel } from '@kbn/logging';
export type { Ecs, EcsEvent } from '@elastic/ecs';

export type { NodeInfo, NodeRoles } from '@kbn/core-node-server';

export { PluginType } from '@kbn/core-base-common';

export type {
  PrebootPlugin,
  Plugin,
  PluginConfigDescriptor,
  PluginConfigSchema,
  PluginInitializer,
  PluginInitializerContext,
  PluginManifest,
  SharedGlobalConfig,
  MakeUsageFromSchema,
  ExposedToBrowserDescriptor,
} from '@kbn/core-plugins-server';
export type {
  PluginsServiceSetup,
  PluginsServiceStart,
  NotFoundPluginContractResolverResponseItem,
  FoundPluginContractResolverResponseItem,
  PluginContractResolverResponseItem,
  PluginContractMap,
  PluginContractResolverResponse,
  PluginContractResolver,
} from '@kbn/core-plugins-contracts-server';

export type { PluginName, DiscoveredPlugin } from '@kbn/core-base-common';

export type {
  SavedObjectsMigrationVersion,
  SavedObjectsImportConflictError,
  SavedObjectsImportAmbiguousConflictError,
  SavedObjectsImportFailure,
  SavedObjectsImportMissingReferencesError,
  SavedObjectsImportResponse,
  SavedObjectsImportRetry,
  SavedObjectsImportSuccess,
  SavedObjectsImportUnknownError,
  SavedObjectsImportUnsupportedTypeError,
  SavedObjectsNamespaceType,
  SavedObjectsImportSimpleWarning,
  SavedObjectsImportActionRequiredWarning,
  SavedObjectsImportWarning,
  SavedObjectTypeIdTuple,
} from '@kbn/core-saved-objects-common';

export type {
  SavedObjectsBulkCreateObject,
  SavedObjectsBulkGetObject,
  SavedObjectsBulkUpdateObject,
  SavedObjectsBulkUpdateOptions,
  SavedObjectsBulkResponse,
  SavedObjectsBulkUpdateResponse,
  SavedObjectsCheckConflictsObject,
  SavedObjectsCheckConflictsResponse,
  SavedObjectsClosePointInTimeOptions,
  SavedObjectsClosePointInTimeResponse,
  ISavedObjectsPointInTimeFinder,
  SavedObjectsCreatePointInTimeFinderDependencies,
  SavedObjectsCreatePointInTimeFinderOptions,
  SavedObjectsCreateOptions,
  SavedObjectsFindResult,
  SavedObjectsFindResponse,
  SavedObjectsOpenPointInTimeOptions,
  SavedObjectsOpenPointInTimeResponse,
  SavedObjectsBulkResolveObject,
  SavedObjectsBulkResolveResponse,
  SavedObjectsResolveResponse,
  SavedObjectsUpdateOptions,
  SavedObjectsUpdateResponse,
  SavedObjectsRemoveReferencesToOptions,
  SavedObjectsRemoveReferencesToResponse,
  SavedObjectsCollectMultiNamespaceReferencesObject,
  SavedObjectsCollectMultiNamespaceReferencesOptions,
  SavedObjectReferenceWithContext,
  SavedObjectsCollectMultiNamespaceReferencesResponse,
  SavedObjectsUpdateObjectsSpacesObject,
  SavedObjectsUpdateObjectsSpacesOptions,
  SavedObjectsUpdateObjectsSpacesResponse,
  SavedObjectsUpdateObjectsSpacesResponseObject,
  SavedObjectsDeleteOptions,
  ISavedObjectsRepository,
  SavedObjectsDeleteByNamespaceOptions,
  SavedObjectsIncrementCounterOptions,
  SavedObjectsIncrementCounterField,
  SavedObjectsBaseOptions,
  MutatingOperationRefreshSetting,
  SavedObjectsClientContract,
  SavedObjectsFindOptions,
  SavedObjectsFindOptionsReference,
  SavedObjectsPitParams,
  SavedObjectsBulkDeleteObject,
  SavedObjectsBulkDeleteOptions,
  SavedObjectsBulkDeleteResponse,
  SavedObjectsPointInTimeFinderClient,
  SavedObjectsBulkDeleteStatus,
} from '@kbn/core-saved-objects-api-server';
export type {
  SavedObject,
  SavedObjectErrorResult,
  SavedObjectBulkResult,
  SavedObjectAccessControl,
  SavedObjectAttribute,
  SavedObjectAttributes,
  SavedObjectAttributeSingle,
  SavedObjectReference,
  SavedObjectsServiceSetup,
  SavedObjectsServiceStart,
  SavedObjectsClientProviderOptions,
  SavedObjectsClientFactory,
  SavedObjectsClientFactoryProvider,
  SavedObjectsEncryptionExtensionFactory,
  SavedObjectsSecurityExtensionFactory,
  SavedObjectsSpacesExtensionFactory,
  SavedObjectsExtensionFactory,
  SavedObjectTypeExcludeFromUpgradeFilterHook,
  SavedObjectsExportResultDetails,
  SavedObjectsExportExcludedObject,
  SavedObjectsImportOptions,
  SavedObjectMigrationContext,
  SavedObjectsMigrationLogger,
  SavedObjectsRawDoc,
  SavedObjectsRawDocSource,
  SavedObjectsRawDocParseOptions,
  SavedObjectSanitizedDoc,
  SavedObjectUnsanitizedDoc,
  SavedObjectsRepositoryFactory,
  SavedObjectsResolveImportErrorsOptions,
  SavedObjectStatusMeta,
  SavedObjectsFieldMapping,
  SavedObjectsTypeMappingDefinition,
  SavedObjectsMappingProperties,
  ISavedObjectTypeRegistry,
  SavedObjectsType,
  SavedObjectsTypeManagementDefinition,
  SavedObjectMigrationMap,
  SavedObjectMigrationFn,
  ISavedObjectsExporter,
  SavedObjectExportBaseOptions,
  SavedObjectsExportByObjectOptions,
  SavedObjectsExportByTypeOptions,
  SavedObjectsExportTransform,
  SavedObjectsExportTransformContext,
  ISavedObjectsImporter,
  SavedObjectsImportHook,
  SavedObjectsImportHookResult,
  SavedObjectsValidationMap,
  SavedObjectsValidationSpec,
  ISavedObjectsSerializer,
  SavedObjectsRequestHandlerContext,
  EncryptedObjectDescriptor,
  ISavedObjectsEncryptionExtension,
  AuthorizationTypeEntry,
  AuthorizationTypeMap,
  CheckAuthorizationResult,
  RedactNamespacesParams,
  ISavedObjectsSecurityExtension,
  ISavedObjectsSpacesExtension,
  SavedObjectsExtensions,
} from '@kbn/core-saved-objects-server';
export {
  ENCRYPTION_EXTENSION_ID,
  SECURITY_EXTENSION_ID,
  SPACES_EXTENSION_ID,
  SavedObjectsErrorHelpers,
} from '@kbn/core-saved-objects-server';
export { isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
export {
  SavedObjectsUtils,
  mergeSavedObjectMigrationMaps,
} from '@kbn/core-saved-objects-utils-server';
export { SavedObjectTypeRegistry } from '@kbn/core-saved-objects-base-server-internal';
export type { SavedObjectsRepository } from '@kbn/core-saved-objects-api-server-internal';
export { SavedObjectsClient } from '@kbn/core-saved-objects-api-server-internal';
export type {
  SavedObjectsExportError,
  SavedObjectsImportError,
} from '@kbn/core-saved-objects-import-export-server-internal';

export type {
  UiSettingsParams,
  UiSettingsType,
  UserProvidedValues,
  DeprecationSettings,
} from '@kbn/core-ui-settings-common';
export type {
  IUiSettingsClient,
  UiSettingsServiceSetup,
  UiSettingsServiceStart,
  UiSettingsRequestHandlerContext,
} from '@kbn/core-ui-settings-server';

export type {
  OpsMetrics,
  OpsOsMetrics,
  OpsServerMetrics,
  OpsProcessMetrics,
  MetricsServiceSetup,
  MetricsServiceStart,
  IntervalHistogram,
  IEventLoopDelaysMonitor,
} from '@kbn/core-metrics-server';
export { EventLoopDelaysMonitor } from '@kbn/core-metrics-collectors-server-internal';

export type { I18nServiceSetup } from '@kbn/core-i18n-server';
export type {
  RegisterDeprecationsConfig,
  GetDeprecationsContext,
  DeprecationsServiceSetup,
  DeprecationsClient,
  DeprecationsRequestHandlerContext,
} from '@kbn/core-deprecations-server';
export type {
  DeprecationsDetails,
  DomainDeprecationDetails,
  DeprecationsGetResponse,
} from '@kbn/core-deprecations-common';

export type { AppCategory } from '@kbn/core-application-common';
export { DEFAULT_APP_CATEGORIES, APP_WRAPPER_CLASS } from '@kbn/core-application-common';

export { ServiceStatusLevels } from '@kbn/core-status-common';
export type { CoreStatus, ServiceStatus, ServiceStatusLevel } from '@kbn/core-status-common';
export type { StatusServiceSetup } from '@kbn/core-status-server';

export type { DocLinksServiceStart, DocLinksServiceSetup } from '@kbn/core-doc-links-server';

export type {
  AnalyticsClient,
  AnalyticsClientInitContext,
  AnalyticsServiceSetup,
  AnalyticsServicePreboot,
  AnalyticsServiceStart,
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
} from '@kbn/core-analytics-server';
export type {
  RequestHandlerContext,
  CoreRequestHandlerContext,
  CustomRequestHandlerContext,
  PrebootRequestHandlerContext,
  PrebootCoreRequestHandlerContext,
} from '@kbn/core-http-request-handler-context-server';

export type {
  CorePreboot,
  CoreSetup,
  CoreStart,
  StartServicesAccessor,
} from '@kbn/core-lifecycle-server';

export type {
  CapabilitiesSetup,
  CapabilitiesStart,
  ExecutionContextSetup,
  ExecutionContextStart,
  HttpResources,
  InternalPluginsServiceSetup,
  InternalPluginsServiceStart,
};

/**
 * Config schemas for the platform services.
 *
 * @alpha
 */
export const config = {
  elasticsearch: {
    schema: elasticsearchConfigSchema,
  },
  logging: {
    appenders: appendersSchema as Type<AppenderConfigType>,
  },
};

/**
 * Public version of RequestHandler, default-scoped to {@link RequestHandlerContext}
 * See [@link RequestHandler}
 * @public
 */
type PublicRequestHandler<
  P = unknown,
  Q = unknown,
  B = unknown,
  Context extends RequestHandlerContext = RequestHandlerContext,
  Method extends RouteMethod = any,
  ResponseFactory extends KibanaResponseFactory = KibanaResponseFactory
> = RequestHandler<P, Q, B, Context, Method, ResponseFactory>;

export type { PublicRequestHandler as RequestHandler, RequestHandler as BaseRequestHandler };

/**
 * Public version of IRouter, default-scoped to {@link RequestHandlerContext}
 * See [@link IRouter}
 * @public
 */
type PublicRouter<ContextType extends RequestHandlerContext = RequestHandlerContext> =
  IRouter<ContextType>;

export type { PublicRouter as IRouter, IRouter as IBaseRouter };

/**
 * Public version of RequestHandlerContext, default-scoped to {@link RequestHandlerContext}
 * See [@link RequestHandlerContext}
 * @public
 */
type PublicHttpServiceSetup<ContextType extends RequestHandlerContext = RequestHandlerContext> =
  HttpServiceSetup<ContextType>;

export type {
  PublicHttpServiceSetup as HttpServiceSetup,
  HttpServiceSetup as BaseHttpServiceSetup,
};

export type { CustomBrandingSetup } from '@kbn/core-custom-branding-server';
export type {
  AuthzDisabled,
  AuthzEnabled,
  RouteAuthz,
  RouteSecurity,
  RouteSecurityGetter,
  Privilege,
  PrivilegeSet,
  AllRequiredCondition,
  AnyRequiredCondition,
} from '@kbn/core-http-server';
