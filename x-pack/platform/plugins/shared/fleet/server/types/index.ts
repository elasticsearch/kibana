/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  Agent,
  AgentMetadata,
  AgentStatus,
  AgentType,
  AgentAction,
  AgentActionType,
  ActionStatus,
  ActionErrorResult,
  CurrentUpgrade,
  PackagePolicy,
  PackagePolicyInput,
  PackagePolicyInputStream,
  NewPackagePolicy,
  UpdatePackagePolicy,
  UpdatePackagePolicyWithId,
  DryRunPackagePolicy,
  FullAgentPolicyInput,
  FullAgentPolicy,
  FullAgentPolicyOutput,
  AgentPolicy,
  NewAgentPolicy,
  PreconfiguredAgentPolicy,
  AgentPolicyStatus,
  DataStream,
  ShipperOutput,
  Output,
  NewOutput,
  OutputType,
  EnrollmentAPIKey,
  NewFleetServerHost,
  FleetServerHost,
  NewFleetProxy,
  FleetProxy,
  Installation,
  EpmPackageInstallStatus,
  InstallationStatus,
  InstallFailedAttempt,
  FailedAttempt,
  PackageInfo,
  ArchivePackage,
  RegistryVarsEntry,
  RegistryDataStream,
  RegistryElasticsearch,
  AssetReference,
  EsAssetReference,
  KibanaAssetReference,
  RegistryPackage,
  BundledPackage,
  InstallablePackage,
  AssetType,
  Installable,
  AssetParts,
  AssetsGroupedByServiceByType,
  CategoryId,
  CategorySummaryList,
  IndexTemplate,
  RegistrySearchResults,
  RegistrySearchResult,
  IndexTemplateEntry,
  IndexTemplateMappings,
  TemplateMap,
  TemplateMapEntry,
  Settings,
  InstallType,
  InstallSource,
  InstallResult,
  GetCategoriesRequest,
  GetPackagesRequest,
  DataType,
  FleetServerEnrollmentAPIKey,
  FleetServerAgent,
  FleetServerAgentAction,
  FleetServerPolicy,
  FullAgentPolicyInputStream,
  DownloadSourceBase,
  DownloadSource,
  PackageVerificationStatus,
  BulkInstallPackageInfo,
  PackageAssetReference,
  ExperimentalDataStreamFeature,
  Secret,
  SecretElasticDoc,
  SecretPath,
  VarSecretReference,
  SecretReference,
  DeletedSecretResponse,
  DeletedSecretReference,
  PackageListItem,
  PackageList,
  InstallationInfo,
  ActionStatusOptions,
  PackageSpecTags,
  AssetsMap,
  InstallResultStatus,
  InstallLatestExecutedState,
  TemplateAgentPolicyInput,
  NewPackagePolicyInput,
  OutputsForAgentPolicy,
  RegistryPolicyInputOnlyTemplate,
} from '../../common/types';
export { ElasticsearchAssetType, KibanaAssetType, KibanaSavedObjectType } from '../../common/types';
export { dataTypes } from '../../common/constants';

export type AgentPolicyUpdateHandler = (
  action: 'created' | 'updated' | 'deleted',
  agentPolicyId: string
) => Promise<void>;

export interface BulkActionResult {
  id: string;
  success: boolean;
  error?: Error;
}

import { type PackageVerificationStatus } from '../../common/types';

export interface PackageVerificationResult {
  verificationKeyId?: string;
  verificationStatus: PackageVerificationStatus;
}

import { GetAutoUpgradeAgentsStatusResponseSchema } from '../../common/types/rest_spec/agent_policy';
export { GetAutoUpgradeAgentsStatusResponseSchema };

export * from './models';
export * from './rest_spec';
export type * from './extensions';
export type * from './so_attributes';
export type { FleetRequestHandler, FleetRequestHandlerContext } from './request_context';
