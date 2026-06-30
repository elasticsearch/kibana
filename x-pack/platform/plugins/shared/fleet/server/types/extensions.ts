/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, RequestHandlerContext } from '@kbn/core/server';
import type { ElasticsearchClient, SavedObjectsClientContract } from '@kbn/core/server';

import type { DeepReadonly } from 'utility-types';

import type {
  PostDeletePackagePoliciesResponse,
  NewPackagePolicy,
  UpdatePackagePolicy,
  UpdatePackagePolicyWithId,
  PackagePolicy,
  DeletePackagePoliciesResponse,
  NewAgentPolicy,
  AgentPolicy,
} from '../../common/types';

export type PostPackagePolicyDeleteCallback = (
  packagePolicies: DeletePackagePoliciesResponse,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<void>;

export type PostPackagePolicyPostDeleteCallback = (
  deletedPackagePolicies: DeepReadonly<PostDeletePackagePoliciesResponse>,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<void>;

export type PostPackagePolicyCreateCallback = (
  newPackagePolicy: NewPackagePolicy,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<NewPackagePolicy>;

export type PostPackagePolicyPostCreateCallback = (
  packagePolicy: PackagePolicy,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<PackagePolicy>;

export type PutPackagePolicyUpdateCallback = (
  updatePackagePolicy: UpdatePackagePolicyWithId,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<UpdatePackagePolicy>;

export type PutPackagePolicyPostUpdateCallback = (
  packagePolicy: PackagePolicy,
  soClient: SavedObjectsClientContract,
  esClient: ElasticsearchClient,
  context?: RequestHandlerContext,
  request?: KibanaRequest
) => Promise<PackagePolicy>;

export type PostAgentPolicyCreateCallback = (
  agentPolicy: NewAgentPolicy
) => Promise<NewAgentPolicy>;

export type PostAgentPolicyUpdateCallback = (
  agentPolicy: Partial<AgentPolicy>
) => Promise<Partial<AgentPolicy>>;

export type PostAgentPolicyPostUpdateCallback = (
  agentPolicy: AgentPolicy,
  requestSpaceId?: string
) => Promise<AgentPolicy>;

export type ExternalCallbackCreate = ['packagePolicyCreate', PostPackagePolicyCreateCallback];
export type ExternalCallbackPostCreate = [
  'packagePolicyPostCreate',
  PostPackagePolicyPostCreateCallback
];

export type ExternalCallbackDelete = ['packagePolicyDelete', PostPackagePolicyDeleteCallback];
export type ExternalCallbackPostDelete = [
  'packagePolicyPostDelete',
  PostPackagePolicyPostDeleteCallback
];

export type ExternalCallbackUpdate = ['packagePolicyUpdate', PutPackagePolicyUpdateCallback];
export type ExternalCallbackPostUpdate = [
  'packagePolicyPostUpdate',
  PutPackagePolicyPostUpdateCallback
];

export type ExternalCallbackAgentPolicyCreate = [
  'agentPolicyCreate',
  PostAgentPolicyCreateCallback
];
export type ExternalCallbackAgentPolicyUpdate = [
  'agentPolicyUpdate',
  PostAgentPolicyUpdateCallback
];
export type ExternalCallbackAgentPolicyPostUpdate = [
  'agentPolicyPostUpdate',
  PostAgentPolicyPostUpdateCallback
];

/**
 * Callbacks supported by the Fleet plugin
 */
export type ExternalCallback =
  | ExternalCallbackCreate
  | ExternalCallbackPostCreate
  | ExternalCallbackDelete
  | ExternalCallbackPostDelete
  | ExternalCallbackUpdate
  | ExternalCallbackPostUpdate
  | ExternalCallbackAgentPolicyCreate
  | ExternalCallbackAgentPolicyUpdate
  | ExternalCallbackAgentPolicyPostUpdate;

export type ExternalCallbacksStorage = Map<ExternalCallback[0], Set<ExternalCallback[1]>>;
