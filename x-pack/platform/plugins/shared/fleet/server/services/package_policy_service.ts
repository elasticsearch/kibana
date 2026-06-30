/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AuthenticatedUser,
  KibanaRequest,
  Logger,
  RequestHandlerContext,
  ElasticsearchClient,
  SavedObjectsClientContract,
  SavedObjectsFindResponse,
  SavedObjectsFindOptions,
  SavedObjectsFindResult,
} from '@kbn/core/server';

import type { SavedObjectError } from '@kbn/core-saved-objects-common';

import type {
  PostDeletePackagePoliciesResponse,
  UpgradePackagePolicyResponse,
  PackageInfo,
  ListWithKuery,
  ListResult,
  UpgradePackagePolicyDryRunResponseItem,
} from '../../common';
import type { PackagePolicyAssetsMap } from '../../common/types';
import type { DeletePackagePoliciesResponse } from '../../common/types';
import type {
  NewPackagePolicy,
  UpdatePackagePolicy,
  UpdatePackagePolicyWithId,
  PackagePolicy,
  PackagePolicySOAttributes,
} from '../types';
import type { ExternalCallback } from '..';

import type { NewPackagePolicyWithId } from './package_policy';

export interface PackagePolicyService {
  asScoped(request: KibanaRequest): PackagePolicyClient;
  get asInternalUser(): PackagePolicyClient;
}

export type RunExternalCallbacksPackagePolicyArgument<A extends ExternalCallback[0]> =
  A extends 'packagePolicyDelete'
    ? DeletePackagePoliciesResponse
    : A extends 'packagePolicyPostDelete'
    ? PostDeletePackagePoliciesResponse
    : A extends 'packagePolicyCreate'
    ? NewPackagePolicy
    : A extends 'packagePolicyPostCreate'
    ? PackagePolicy
    : A extends 'packagePolicyUpdate'
    ? UpdatePackagePolicyWithId
    : A extends 'packagePolicyPostUpdate'
    ? PackagePolicy
    : never;

export type RunExternalCallbacksPackagePolicyResponse<A extends ExternalCallback[0]> =
  A extends 'packagePolicyDelete'
    ? void
    : A extends 'packagePolicyPostDelete'
    ? void
    : A extends 'packagePolicyCreate'
    ? NewPackagePolicy
    : A extends 'packagePolicyPostCreate'
    ? PackagePolicy
    : A extends 'packagePolicyUpdate'
    ? UpdatePackagePolicy
    : A extends 'packagePolicyPostUpdate'
    ? PackagePolicy
    : undefined;

export interface PackagePolicyClient {
  create(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicy: NewPackagePolicy,
    options?: {
      spaceId?: string;
      id?: string;
      user?: AuthenticatedUser;
      bumpRevision?: boolean;
      force?: boolean;
      skipEnsureInstalled?: boolean;
      skipUniqueNameVerification?: boolean;
      overwrite?: boolean;
      packageInfo?: PackageInfo;
      createDatasetTemplates?: boolean;
    },
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<PackagePolicy>;

  inspect(
    soClient: SavedObjectsClientContract,
    packagePolicy: NewPackagePolicyWithId
  ): Promise<NewPackagePolicy>;

  bulkCreate(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicies: NewPackagePolicyWithId[],
    options?: {
      user?: AuthenticatedUser;
      bumpRevision?: boolean;
      force?: true;
      asyncDeploy?: boolean;
    },
    request?: KibanaRequest
  ): Promise<{
    created: PackagePolicy[];
    failed: Array<{ packagePolicy: NewPackagePolicy; error?: Error | SavedObjectError }>;
  }>;

  bulkUpdate(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    packagePolicyUpdates: UpdatePackagePolicyWithId[],
    options?: PackagePolicyClientBulkUpdateOptions,
    currentVersion?: string
  ): Promise<{
    updatedPolicies: PackagePolicy[] | null;
    failedPolicies: Array<{
      packagePolicy: NewPackagePolicyWithId;
      error: Error | SavedObjectError;
    }>;
  }>;

  bulkUpgrade(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    ids: string[],
    options?: { user?: AuthenticatedUser; force?: boolean },
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyResponse>;

  get(
    soClient: SavedObjectsClientContract,
    id: string,
    options?: PackagePolicyClientGetOptions
  ): Promise<PackagePolicy | null>;

  findAllForAgentPolicy(
    soClient: SavedObjectsClientContract,
    agentPolicyId: string,
    options?: PackagePolicyClientFindAllForAgentPolicyOptions
  ): Promise<PackagePolicy[]>;

  compilePackagePolicyForVersions(
    soClient: SavedObjectsClientContract,
    packageInfo: PackageInfo,
    assetsMap: PackagePolicyAssetsMap,
    packagePolicy: PackagePolicy,
    agentVersions?: string[]
  ): Promise<void>;

  getByIDs(
    soClient: SavedObjectsClientContract,
    ids: string[],
    options?: PackagePolicyClientGetByIdsOptions
  ): Promise<PackagePolicy[]>;

  list(
    soClient: SavedObjectsClientContract,
    options: ListWithKuery & { spaceId?: string }
  ): Promise<ListResult<PackagePolicy>>;

  listIds(
    soClient: SavedObjectsClientContract,
    options: PackagePolicyClientListIdsOptions
  ): Promise<ListResult<string>>;

  update(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    packagePolicyUpdate: UpdatePackagePolicy,
    options?: {
      user?: AuthenticatedUser;
      force?: boolean;
      skipUniqueNameVerification?: boolean;
      bumpRevision?: boolean;
    },
    currentVersion?: string
  ): Promise<PackagePolicy>;

  delete(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    ids: string[],
    options?: PackagePolicyClientDeleteOptions,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<PostDeletePackagePoliciesResponse>;

  upgrade(
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    id: string,
    options?: { user?: AuthenticatedUser; force?: boolean },
    packagePolicy?: PackagePolicy,
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyResponse>;

  getUpgradeDryRunDiff(
    soClient: SavedObjectsClientContract,
    id: string,
    packagePolicy?: PackagePolicy,
    pkgVersion?: string
  ): Promise<UpgradePackagePolicyDryRunResponseItem>;

  enrichPolicyWithDefaultsFromPackage(
    soClient: SavedObjectsClientContract,
    newPolicy: NewPackagePolicy
  ): Promise<NewPackagePolicy>;

  buildPackagePolicyFromPackage(
    soClient: SavedObjectsClientContract,
    pkgName: string,
    options?: { logger?: Logger; installMissingPackage?: boolean }
  ): Promise<NewPackagePolicy | undefined>;

  runExternalCallbacks<A extends ExternalCallback[0]>(
    externalCallbackType: A,
    packagePolicy: RunExternalCallbacksPackagePolicyArgument<A>,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<RunExternalCallbacksPackagePolicyResponse<A>>;

  runDeleteExternalCallbacks(
    deletedPackagePolicies: DeletePackagePoliciesResponse,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<void>;

  runPostDeleteExternalCallbacks(
    deletedPackagePolicies: PostDeletePackagePoliciesResponse,
    soClient: SavedObjectsClientContract,
    esClient: ElasticsearchClient,
    context?: RequestHandlerContext,
    request?: KibanaRequest
  ): Promise<void>;

  /**
   * Remove an output from all package policies that are using it, and replace the output by the default ones.
   * @param soClient
   * @param esClient
   * @param outputId
   */
  removeOutputFromAll(
    esClient: ElasticsearchClient,
    outputId: string,
    options?: { force?: boolean }
  ): Promise<void>;

  /**
   * Returns an `AsyncIterable` for retrieving all integration policy IDs
   * @param soClient
   * @param options
   */
  fetchAllItemIds(
    soClient: SavedObjectsClientContract,
    options?: PackagePolicyClientFetchAllItemIdsOptions
  ): Promise<AsyncIterable<string[]>>;

  /**
   * Returns an `AsyncIterable` for retrieving all integration policies
   * @param soClient
   * @param options
   */
  fetchAllItems(
    soClient: SavedObjectsClientContract,
    options?: PackagePolicyClientFetchAllItemsOptions
  ): Promise<AsyncIterable<PackagePolicy[]>>;

  getPackagePolicySavedObjects(
    soClient: SavedObjectsClientContract,
    options: PackagePolicyClientRollbackOptions
  ): Promise<SavedObjectsFindResponse<PackagePolicySOAttributes, unknown>>;

  rollback(
    soClient: SavedObjectsClientContract,
    packagePolicies: Array<SavedObjectsFindResult<PackagePolicySOAttributes>>,
    previousVersion: string
  ): Promise<RollbackResult>;

  restoreRollback(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ): Promise<void>;

  cleanupRollbackSavedObjects(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ): Promise<void>;

  bumpAgentPolicyRevisionAfterRollback(
    soClient: SavedObjectsClientContract,
    rollbackResult: RollbackResult
  ): Promise<void>;
}

interface WithSpaceIdsOption {
  /**
   * The space IDs that should be targeted for data retrieval. The SO client provided to the services
   * still needs to have access to those spaces.
   * When using an un-scoped so client (has access to all spaces) and wanting to retrieve data across
   * all space, use a value of `*` (ex. `spaceIds: ['*']`)
   */
  spaceIds?: string[];
}

export interface RollbackResult {
  updatedPolicies: Record<string, Array<SavedObjectsFindResult<PackagePolicySOAttributes>>>;
  copiedPolicies: Record<string, Array<SavedObjectsFindResult<PackagePolicySOAttributes>>>;
  previousVersionPolicies: Record<string, Array<SavedObjectsFindResult<PackagePolicySOAttributes>>>;
}

export type PackagePolicyClientFetchAllItemIdsOptions = Pick<ListWithKuery, 'perPage' | 'kuery'> &
  WithSpaceIdsOption;

export type PackagePolicyClientFetchAllItemsOptions = Pick<
  ListWithKuery,
  'perPage' | 'kuery' | 'sortField' | 'sortOrder'
> &
  WithSpaceIdsOption;

export interface PackagePolicyClientGetByIdsOptions extends WithSpaceIdsOption {
  ignoreMissing?: boolean;
}

export interface PackagePolicyClientDeleteOptions extends WithSpaceIdsOption {
  user?: AuthenticatedUser;
  skipUnassignFromAgentPolicies?: boolean;
  force?: boolean;
  asyncDeploy?: boolean;
  ignoreMissing?: boolean;
}

export interface PackagePolicyClientBulkUpdateOptions {
  user?: AuthenticatedUser;
  force?: boolean;
  asyncDeploy?: boolean;
  fromBulkUpgrade?: boolean;
  oldPackagePolicies?: PackagePolicy[];
}

export type PackagePolicyClientFindAllForAgentPolicyOptions = WithSpaceIdsOption;

export interface PackagePolicyClientGetOptions {
  /**
   * The space IDs that should be targeted for data retrieval. The SO client provided to the services
   * still needs to have access to the space defined here.
   * When using an un-scoped so client (has access to all spaces) and wanting to retrieve data across
   * all space, use a value of `*` (ex. `spaceId: '*'`)
   */
  spaceId?: string;
}

export type PackagePolicyClientListIdsOptions = ListWithKuery & WithSpaceIdsOption;

export type PackagePolicyClientRollbackOptions = Omit<SavedObjectsFindOptions, 'type'> &
  WithSpaceIdsOption;
