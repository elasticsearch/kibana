/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

export type {
  SavedObjectsClientFactory,
  SavedObjectsClientFactoryProvider,
  SavedObjectsRepositoryFactory,
  SavedObjectsClientProviderOptions,
  SavedObjectsEncryptionExtensionFactory,
  SavedObjectsSecurityExtensionFactory,
  SavedObjectsSpacesExtensionFactory,
  SavedObjectsExtensionFactory,
} from './src/client_factory';
export type { SavedObjectsServiceSetup, SavedObjectsServiceStart } from './src/contracts';
export type {
  ISavedObjectsExporter,
  SavedObjectsExportTransform,
  SavedObjectsExportByObjectOptions,
  SavedObjectsExportByTypeOptions,
  SavedObjectExportBaseOptions,
  SavedObjectsExportExcludedObject,
  SavedObjectsExportTransformContext,
  SavedObjectsExportResultDetails,
} from './src/export';
export type {
  ISavedObjectsImporter,
  SavedObjectsImportHook,
  SavedObjectsImportHookResult,
  SavedObjectsImportOptions,
  SavedObjectsResolveImportErrorsOptions,
  CreatedObject,
  AccessControlImportTransforms,
  AccessControlImportTransformsFactory,
} from './src/import';
export type {
  SavedObjectsTypeMappingDefinition,
  SavedObjectsFieldMapping,
  SavedObjectsMappingProperties,
  SavedObjectsMappingPropertiesSafe,
} from './src/mapping_definition';
export type {
  SavedObjectMigration,
  SavedObjectMigrationMap,
  SavedObjectMigrationContext,
  SavedObjectMigrationParams,
  SavedObjectsMigrationLogger,
  SavedObjectMigrationFn,
} from './src/migration';
export type { SavedObjectsRequestHandlerContext } from './src/request_handler_context';
export type {
  SavedObjectsTypeManagementDefinition,
  SavedObjectsExportablePredicate,
} from './src/saved_objects_management';
export type { SavedObjectStatusMeta } from './src/saved_objects_status';
export {
  MAIN_SAVED_OBJECT_INDEX,
  TASK_MANAGER_SAVED_OBJECT_INDEX,
  INGEST_SAVED_OBJECT_INDEX,
  ALERTING_CASES_SAVED_OBJECT_INDEX,
  SECURITY_SOLUTION_SAVED_OBJECT_INDEX,
  ANALYTICS_SAVED_OBJECT_INDEX,
  USAGE_COUNTERS_SAVED_OBJECT_INDEX,
  ALL_SAVED_OBJECT_INDICES,
  SEARCH_SOLUTION_SAVED_OBJECT_INDEX,
} from './src/saved_objects_index_pattern';
export type {
  SavedObjectsType,
  SavedObjectTypeExcludeFromUpgradeFilterHook,
  SavedObjectTypeVersionGuesser,
} from './src/saved_objects_type';
export type {
  ISavedObjectsSerializer,
  SavedObjectsRawDoc,
  SavedObjectSanitizedDoc,
  SavedObjectsRawDocParseOptions,
  SavedObjectDoc,
  SavedObjectUnsanitizedDoc,
} from './src/serialization';
export type { ISavedObjectTypeRegistry } from './src/type_registry';
export type { SavedObjectsValidationMap, SavedObjectsValidationSpec } from './src/validation';
export type {
  ISavedObjectsEncryptionExtension,
  EncryptedObjectDescriptor,
} from './src/extensions/encryption';
export type {
  AuthorizeObject,
  AuthorizationResult,
  AuthorizationTypeEntry,
  AuthorizationTypeMap,
  CheckAuthorizationResult,
  RedactNamespacesParams,
  ISavedObjectsSecurityExtension,
  AuthorizeCreateObject,
  AuthorizeUpdateObject,
  AuthorizeBulkGetObject,
  AuthorizeCreateParams,
  AuthorizeUpdateParams,
  AuthorizeAndRedactMultiNamespaceReferencesParams,
  AuthorizeAndRedactInternalBulkResolveParams,
  AuthorizeGetParams,
  AuthorizeBulkGetParams,
  AuthorizeObjectWithExistingSpaces,
  AuthorizeBulkCreateParams,
  AuthorizeBulkDeleteParams,
  AuthorizeBulkUpdateParams,
  AuthorizeCheckConflictsParams,
  AuthorizeDeleteParams,
  GetFindRedactTypeMapParams,
  AuthorizeOpenPointInTimeParams,
  AuthorizeUpdateSpacesParams,
  AuthorizeFindParams,
  WithAuditName,
  AuthorizeChangeAccessControlParams,
  SetAccessControlToWriteParams,
} from './src/extensions/security';
export type { ISavedObjectsSpacesExtension } from './src/extensions/spaces';
export type { SavedObjectsExtensions } from './src/extensions/extensions';
export {
  ENCRYPTION_EXTENSION_ID,
  SECURITY_EXTENSION_ID,
  SPACES_EXTENSION_ID,
} from './src/extensions/extensions';
export {
  SavedObjectsErrorHelpers,
  errorContent,
  type DecoratedError,
  type BulkResolveError,
} from './src/saved_objects_error_helpers';

export type {
  ModelVersionIdentifier,
  SavedObjectsModelVersion,
  SavedObjectsModelVersionMap,
  SavedObjectsModelVersionMapProvider,
  SavedObjectsModelChange,
  SavedObjectsModelMappingsAdditionChange,
  SavedObjectsModelMappingsDeprecationChange,
  SavedObjectsModelDataBackfillChange,
  SavedObjectsModelDataRemovalChange,
  SavedObjectsModelUnsafeTransformChange,
  SavedObjectModelTransformationDoc,
  SavedObjectModelTransformationContext,
  SavedObjectModelTransformationFn,
  SavedObjectModelTransformationResult,
  SavedObjectModelDataBackfillFn,
  SavedObjectModelDataBackfillResult,
  SavedObjectModelUnsafeTransformFn,
  SavedObjectsModelVersionSchemaDefinitions,
  SavedObjectModelVersionForwardCompatibilityFn,
  SavedObjectModelVersionForwardCompatibilityObjectSchema,
  SavedObjectModelVersionForwardCompatibilitySchema,
  SavedObjectsFullModelVersion,
  SavedObjectsFullModelVersionSchemaDefinitions,
} from './src/model_version';

// We re-export the SavedObject types here for convenience.
export type {
  SavedObject,
  SavedObjectAccessControl,
  SavedObjectAttribute,
  SavedObjectAttributes,
  SavedObjectAttributeSingle,
  SavedObjectReference,
  SavedObjectsRawDocSource,
  SavedObjectErrorResult,
  SavedObjectBulkResult,
} from '@kbn/core-saved-objects-api-server';
export { isSavedObjectErrorResult } from '@kbn/core-saved-objects-api-server';
