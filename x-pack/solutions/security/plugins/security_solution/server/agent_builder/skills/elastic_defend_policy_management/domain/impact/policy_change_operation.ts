/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ProtectionModes } from '../../../../../../common/endpoint/types';
import type { PolicyConfig } from '../../../../../../common/endpoint/types';
import {
  POLICY_COUPLING_PROTECTIONS,
  type PolicyCouplingProtection,
} from '../../../../../../common/endpoint/models/policy_config_helpers';
import type { PolicyDiffEntry } from '../diff_policy_config';
import type { FieldRegistryEntry } from '../field_registry';
import { policyIdentifierInputSchema, policyPathInputSchema } from '../input_schemas';
import type { NormalizedEndpointPolicy } from '../normalized_endpoint_policy';
import type { NormalizedPolicyConfig } from '../normalized_policy_config';

const POLICY_CHANGES_MAX = 50;

export const POLICY_CHANGE_PROTECTIONS = POLICY_COUPLING_PROTECTIONS;

export type PolicyChangeProtection = PolicyCouplingProtection;

export const POLICY_CHANGE_PREPARATION_ERROR_CODE = {
  invalid_input: 'invalid_input',
  non_writable_path: 'non_writable_path',
  unsupported_operation: 'unsupported_operation',
  unknown_current_value: 'unknown_current_value',
} as const;

export type PolicyChangePreparationErrorCode =
  (typeof POLICY_CHANGE_PREPARATION_ERROR_CODE)[keyof typeof POLICY_CHANGE_PREPARATION_ERROR_CODE];

export const DEVICE_POPUP_ENABLED_UNSUPPORTED_MESSAGE =
  "Direct device notification enablement is not supported. Use set_field on a *.device_control.enabled or *.device_control.usb_storage path when that is the user's actual intent.";

export const DEVICE_CONTROL_MISSING_POPUP_MESSAGE =
  'Device control cannot be assessed for this policy because its device notification settings are not initialized. Open the policy in the UI to initialize those settings.';

export const POLICY_CHANGE_BOUNDS_MESSAGE =
  'Request exceeds the maximum serialized size or nesting depth';

export const POLICY_CHANGE_SCHEMA_MESSAGE = 'Request does not match the assess change schema';

export class PolicyChangePreparationError extends Error {
  public readonly code: PolicyChangePreparationErrorCode;

  constructor(code: PolicyChangePreparationErrorCode, message: string) {
    super(message);
    this.name = 'PolicyChangePreparationError';
    this.code = code;
  }
}

export const policyChangeOperationSchema = z.discriminatedUnion('op', [
  z
    .object({
      op: z.literal('set_protection_enabled'),
      protection: z.enum(POLICY_CHANGE_PROTECTIONS),
      enabled: z.boolean(),
    })
    .strict(),
  z
    .object({
      op: z.literal('set_protection_level'),
      protection: z.enum(POLICY_CHANGE_PROTECTIONS),
      mode: z.enum([ProtectionModes.detect, ProtectionModes.prevent]),
    })
    .strict()
    .describe(
      'Represents the product protection-level control for a protection area. It carries the protection-card OS coupling and popup synchronization that the product applies for that control.'
    ),
  z
    .object({
      op: z.literal('set_field'),
      path: policyPathInputSchema,
      value: z.unknown(),
    })
    .strict()
    .describe(
      'Changes exactly one requested policy leaf and does not apply protection-card coupling or popup synchronization. Use it only when that single-leaf intent is explicit.'
    ),
]);

export const assessPolicyChangeParamsSchema = z
  .object({
    idOrName: policyIdentifierInputSchema,
    changes: z.array(policyChangeOperationSchema).min(1).max(POLICY_CHANGES_MAX),
  })
  .strict();

export type PolicyChangeOperation = z.infer<typeof policyChangeOperationSchema>;
export type AssessPolicyChangeParams = z.infer<typeof assessPolicyChangeParamsSchema>;

export interface ExplicitPolicyChange {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly origin: {
    readonly operationIndex: number;
    readonly op: PolicyChangeOperation['op'];
    readonly kind: 'direct' | 'coupled';
  };
}

export interface PathEligibility {
  readonly eligible: boolean;
  readonly reason?: string;
}

export type DeviceControlEligibilityReason =
  | 'endpoint_trusted_devices_disabled'
  | 'trusted_devices_experimental_disabled';

export interface EligibilityContext {
  readonly proposedConfig: PolicyConfig;
  readonly licenseStripped: PolicyConfig;
  readonly platinumStripped: PolicyConfig;
  readonly enterpriseStripped: PolicyConfig;
  readonly protectionsStripped: PolicyConfig;
  readonly deviceControlStripped: PolicyConfig;
  readonly deviceControlReason: DeviceControlEligibilityReason;
  readonly endpointProtectionUpdates: boolean;
  readonly serverless: boolean;
}

export interface ObservedPolicyPatch {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
}

export interface PreparedPolicyOperation {
  readonly requested: PolicyChangeOperation;
  readonly originIndex: number;
  readonly primaryTargets: readonly string[];
  readonly semanticIdentity?: string;
  readonly observedPatch: readonly ObservedPolicyPatch[];
}

export interface PreparedPolicyChangeSet {
  readonly operations: readonly PolicyChangeOperation[];
  readonly preparedOperations: readonly PreparedPolicyOperation[];
  readonly proposedConfig: PolicyConfig;
  readonly explicitChanges: readonly ExplicitPolicyChange[];
}

export interface PolicyChangeFact {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly origin: ExplicitPolicyChange['origin'];
  readonly registry: Pick<
    FieldRegistryEntry,
    | 'path'
    | 'os'
    | 'kind'
    | 'tier'
    | 'documentation'
    | 'license'
    | 'minVersion'
    | 'maxVersion'
    | 'source'
    | 'userEditable'
    | 'productFeatureGate'
  >;
  readonly eligibility: PathEligibility;
}

export interface PolicyChangeSideEffect {
  readonly path: string;
  readonly from: unknown;
  readonly to: unknown;
  readonly reason: 'derived_field_update';
  readonly registry: Pick<FieldRegistryEntry, 'path' | 'os' | 'kind' | 'tier' | 'source'>;
}

export interface PreparedPolicyChangeAssessment extends PreparedPolicyChangeSet {
  readonly normalizedDiff: readonly PolicyDiffEntry[];
  readonly sideEffects: readonly PolicyChangeSideEffect[];
}

export interface PolicyAssessmentBlocker {
  readonly reason: string;
}

export interface PolicyChangeAssessment {
  readonly policy: NormalizedEndpointPolicy;
  readonly proposed: NormalizedPolicyConfig;
  readonly fields: readonly FieldRegistryEntry[];
  readonly requestedOperations: readonly PolicyChangeOperation[];
  readonly changes: readonly PolicyChangeFact[];
  readonly normalizedDiff: readonly PolicyDiffEntry[];
  readonly sideEffects: readonly PolicyChangeSideEffect[];
  readonly globalBlockers: readonly PolicyAssessmentBlocker[];
}

export const nonWritablePathMessage = (path: string): string =>
  `Path is not a writable policy field: ${path}`;

export const unknownCurrentValueMessage = (path: string): string =>
  `Cannot assess an exact before/after change for ${path}: the current value is not present in the live policy.`;

export const invalidSetFieldValueMessage = (path: string): string =>
  `Invalid set_field value for writable policy field: ${path}`;

export const parseAssessPolicyChangeParams = (value: unknown): AssessPolicyChangeParams => {
  const parsed = assessPolicyChangeParamsSchema.safeParse(value);
  if (!parsed.success) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      POLICY_CHANGE_SCHEMA_MESSAGE
    );
  }
  return parsed.data;
};
