/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEndpointPolicyValidForLicense } from '../../../../../../common/license/policy_config';
import { getFieldRegistry, getFieldRegistryEntry } from '../field_registry';
import { normalize } from '../normalize_policy_config';
import type { NormalizedEndpointPolicy } from '../normalized_endpoint_policy';
import type { BuildEligibilityContextInput } from './build_eligibility_context';
import { buildEligibilityContext } from './build_eligibility_context';
import { computeGlobalManifestBlockers, computePathEligibility } from './compute_path_eligibility';
import {
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
  nonWritablePathMessage,
} from './policy_change_operation';
import type {
  EligibilityContext,
  ExplicitPolicyChange,
  PolicyChangeAssessment,
  PolicyChangeFact,
  PolicyChangeOperation,
} from './policy_change_operation';
import { prepareChangeSet } from './prepare_change_set';

export type PolicyChangeCapabilities = Omit<BuildEligibilityContextInput, 'proposedConfig'>;

const toPolicyChangeFact = (
  change: ExplicitPolicyChange,
  eligibilityContext: EligibilityContext
): PolicyChangeFact => {
  const entry = getFieldRegistryEntry(change.path);
  if (entry === undefined) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.non_writable_path,
      nonWritablePathMessage(change.path)
    );
  }

  return {
    path: change.path,
    from: change.from,
    to: change.to,
    origin: change.origin,
    registry: {
      path: entry.path,
      os: entry.os,
      kind: entry.kind,
      tier: entry.tier,
      documentation: entry.documentation,
      license: entry.license,
      minVersion: entry.minVersion,
      maxVersion: entry.maxVersion,
      source: entry.source,
      userEditable: entry.userEditable,
      productFeatureGate: entry.productFeatureGate,
    },
    eligibility: computePathEligibility(change.path, eligibilityContext),
  };
};

export const buildPolicyChangeAssessment = (
  policy: NormalizedEndpointPolicy,
  operations: readonly PolicyChangeOperation[],
  capabilities: PolicyChangeCapabilities
): PolicyChangeAssessment => {
  const prepared = prepareChangeSet(
    {
      idOrName: policy.snapshot.identity.id,
      changes: [...operations],
    },
    policy.storedConfig
  );
  const eligibilityContext = buildEligibilityContext({
    ...capabilities,
    proposedConfig: prepared.proposedConfig,
  });

  return {
    policy,
    proposed: normalize(prepared.proposedConfig),
    fields: getFieldRegistry(),
    requestedOperations: operations,
    changes: prepared.explicitChanges.map((change) =>
      toPolicyChangeFact(change, eligibilityContext)
    ),
    normalizedDiff: prepared.normalizedDiff,
    sideEffects: prepared.sideEffects,
    globalBlockers: [
      ...computeGlobalManifestBlockers(prepared.proposedConfig, eligibilityContext),
      ...(isEndpointPolicyValidForLicense(prepared.proposedConfig, capabilities.licenseInformation)
        ? []
        : [{ reason: 'license_invalid_policy' }]),
    ],
  };
};
