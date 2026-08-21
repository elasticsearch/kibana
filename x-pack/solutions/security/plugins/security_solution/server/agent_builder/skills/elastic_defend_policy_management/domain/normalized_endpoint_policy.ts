/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PolicyConfig } from '../../../../../common/endpoint/types';
import { hashPolicyConfig } from './hash_policy_config';
import type { EndpointPolicySnapshot } from './endpoint_policy_snapshot';
import type { NormalizedPolicyConfig } from './normalized_policy_config';
import { normalize } from './normalize_policy_config';

export type EndpointPolicySummary = Readonly<{
  windowsProtectionModes: Readonly<{
    malware: string;
    ransomware: string;
    memoryThreat: string;
    behavior: string;
  }>;
  macProtectionModes: Readonly<{
    malware: string;
    behavior: string;
  }>;
  linuxProtectionModes: Readonly<{
    malware: string;
    behavior: string;
  }>;
  globalTelemetryEnabled: boolean;
}>;

export type NormalizedEndpointPolicy = Readonly<{
  snapshot: EndpointPolicySnapshot;
  storedConfig: PolicyConfig;
  normalizedConfig: NormalizedPolicyConfig;
  normalizedHash: string;
  summary: EndpointPolicySummary;
}>;

const extractStoredConfig = (snapshot: EndpointPolicySnapshot): PolicyConfig => {
  const endpointInput = snapshot.source.inputs.find((input) => input.type === 'endpoint');
  const policyValue = endpointInput?.config?.policy?.value;
  const { version } = snapshot.identity;

  if (policyValue == null || version.length === 0) {
    throw new TypeError('Invalid endpoint policy configuration');
  }

  return policyValue as PolicyConfig;
};

const summarizeEndpointPolicy = (config: NormalizedPolicyConfig): EndpointPolicySummary => ({
  windowsProtectionModes: {
    malware: config.windows.malware.mode,
    ransomware: config.windows.ransomware.mode,
    memoryThreat: config.windows.memory_protection.mode,
    behavior: config.windows.behavior_protection.mode,
  },
  macProtectionModes: {
    malware: config.mac.malware.mode,
    behavior: config.mac.behavior_protection.mode,
  },
  linuxProtectionModes: {
    malware: config.linux.malware.mode,
    behavior: config.linux.behavior_protection.mode,
  },
  globalTelemetryEnabled: config.global_telemetry_enabled,
});

export const normalizeEndpointPolicy = (
  snapshot: EndpointPolicySnapshot
): NormalizedEndpointPolicy => {
  const storedConfig = extractStoredConfig(snapshot);
  const normalizedConfig = normalize(storedConfig);

  return {
    snapshot,
    storedConfig,
    normalizedConfig,
    normalizedHash: hashPolicyConfig(normalizedConfig),
    summary: summarizeEndpointPolicy(normalizedConfig),
  };
};
