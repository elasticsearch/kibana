/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import type { ILicense } from '@kbn/licensing-types';
import type {
  GetAgentStatusResponse,
  GetOnePackagePolicyResponse,
  GetPackagePoliciesResponse,
  UpdatePackagePolicyResponse,
} from '@kbn/fleet-plugin/common';
import type {
  AppLocation,
  Immutable,
  ProtectionFields,
  PolicyData,
  UIPolicyConfig,
  MaybeImmutable,
  DeviceControlFields,
} from '../../../../common/endpoint/types';
import type { ServerApiError } from '../../../common/types';
import type { ImmutableMiddlewareAPI } from '../../../common/store';
import type { AppAction } from '../../../common/store/actions';

export type PolicyDetailsStore = ImmutableMiddlewareAPI<PolicyDetailsState, AppAction>;

/**
 * Function that runs Policy Details middleware
 */
export type MiddlewareRunner = (
  context: MiddlewareRunnerContext,
  store: PolicyDetailsStore,
  action: MaybeImmutable<AppAction>
) => Promise<void>;

export interface MiddlewareRunnerContext {
  coreStart: CoreStart;
}

export type PolicyDetailsSelector<T = unknown> = (
  state: Immutable<PolicyDetailsState>
) => Immutable<T>;

/**
 * Policy details store state
 */
export interface PolicyDetailsState {
  /** A single policy item  */
  policyItem?: PolicyData;
  /** API error if loading data failed */
  apiError?: ServerApiError;
  isLoading: boolean;
  /** current location of the application */
  location?: Immutable<AppLocation>;
  /** artifacts namespace inside policy details page */
  artifacts: PolicyArtifactsState;
  /** A summary of stats for the agents associated with a given Fleet Agent Policy */
  agentStatusSummary?: Omit<
    GetAgentStatusResponse['results'],
    'updating' | 'inactive' | 'unenrolled'
  >;
  /** Status of an update to the policy  */
  updateStatus?: {
    success: boolean;
    error?: ServerApiError;
  };
  /** current license */
  license?: ILicense;
}

/**
 * Policy artifacts store state
 */
export interface PolicyArtifactsState {
  /** artifacts location params  */
  location: PolicyDetailsArtifactsPageLocation;
}

export interface PolicyDetailsArtifactsPageListLocationParams {
  page: number;
  pageSize: number;
  filter: string;
}

export interface PolicyDetailsArtifactsPageLocation
  extends PolicyDetailsArtifactsPageListLocationParams {
  show?: 'list';
}

/**
 * Returns the keys of an object whose values meet a criteria.
 *  Ex) interface largeNestedObject = {
 *         a: {
 *           food: Foods;
 *           toiletPaper: true;
 *         };
 *         b: {
 *           food: Foods;
 *           streamingServices: Streams;
 *         };
 *         c: {};
 *    }
 *
 *    type hasFoods = KeysByValueCriteria<largeNestedObject, { food: Foods }>;
 *    The above type will be: [a, b] only, and will not include c.
 *
 */
export type KeysByValueCriteria<O, Criteria> = {
  [K in keyof O]: O[K] extends Criteria ? K : never;
}[keyof O];

/** Returns an array of the policy OSes that have a malware protection field */
export type MalwareProtectionOSes = KeysByValueCriteria<
  UIPolicyConfig,
  { malware: ProtectionFields }
>;

/** Returns an array of the policy OSes that have a memory protection field */
export type MemoryProtectionOSes = KeysByValueCriteria<
  UIPolicyConfig,
  { memory_protection: ProtectionFields }
>;

/** Returns an array of the policy OSes that have a behavior protection field */
export type BehaviorProtectionOSes = KeysByValueCriteria<
  UIPolicyConfig,
  { behavior_protection: ProtectionFields }
>;

export type DeviceControlOSes = KeysByValueCriteria<
  UIPolicyConfig,
  { device_control?: DeviceControlFields }
>;

/** Returns an array of the policy OSes that have a ransomware protection field */
export type RansomwareProtectionOSes = KeysByValueCriteria<
  UIPolicyConfig,
  { ransomware: ProtectionFields }
>;

export type PolicyProtection =
  | keyof Pick<
      UIPolicyConfig['windows'],
      'malware' | 'ransomware' | 'memory_protection' | 'behavior_protection'
    >
  | keyof Pick<
      UIPolicyConfig['mac'],
      'malware' | 'ransomware' | 'behavior_protection' | 'memory_protection'
    >
  | keyof Pick<UIPolicyConfig['linux'], 'malware' | 'behavior_protection' | 'memory_protection'>;

export type MacPolicyProtection = keyof Pick<
  UIPolicyConfig['mac'],
  'malware' | 'ransomware' | 'behavior_protection' | 'memory_protection'
>;

export type LinuxPolicyProtection = keyof Pick<
  UIPolicyConfig['linux'],
  'malware' | 'behavior_protection' | 'memory_protection'
>;

export interface GetPolicyListResponse extends GetPackagePoliciesResponse {
  items: PolicyData[];
}

export interface GetPolicyResponse extends GetOnePackagePolicyResponse {
  item: PolicyData;
}

export interface UpdatePolicyResponse extends UpdatePackagePolicyResponse {
  item: PolicyData;
}
