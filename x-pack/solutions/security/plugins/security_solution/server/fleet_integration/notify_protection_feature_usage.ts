/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { NewPackagePolicy } from '@kbn/fleet-plugin/common';
import type { PolicyConfig, PolicyData, ProtectionModes } from '../../common/endpoint/types';
import { PolicyOperatingSystem } from '../../common/endpoint/types';
import type { FeatureUsageService } from '../endpoint/services/feature_usage/service';

const OS_KEYS = Object.values(PolicyOperatingSystem);
const PROTECTION_KEYS = ['memory_protection', 'behavior_protection'] as const;
const RANSOMWARE_OS_KEYS = [PolicyOperatingSystem.windows, PolicyOperatingSystem.mac] as const;

// A protection counts as newly enabled when it moves to an active mode from `off`, or from a
// branch that does not exist at all — the shape of policies stored before that protection shipped.
const isNewlyEnabled = (current: ProtectionModes | undefined, next: ProtectionModes | undefined) =>
  (current === undefined || current === 'off') && (next === 'prevent' || next === 'detect');

function notifyProtection(type: string, featureUsageService: FeatureUsageService) {
  switch (type) {
    case 'ransomware':
      featureUsageService.notifyUsage('RANSOMWARE_PROTECTION');
      return;
    case 'memory_protection':
      featureUsageService.notifyUsage('MEMORY_THREAT_PROTECTION');
      return;
    case 'behavior_protection':
      featureUsageService.notifyUsage('BEHAVIOR_PROTECTION');
  }
}

export async function notifyProtectionFeatureUsage(
  newPackagePolicy: NewPackagePolicy,
  currentPackagePolicy: PolicyData,
  featureUsageService: FeatureUsageService
) {
  if (
    !newPackagePolicy?.id ||
    !newPackagePolicy?.inputs ||
    !newPackagePolicy.inputs[0]?.config?.policy?.value
  ) {
    return;
  }

  const newPolicyConfig = newPackagePolicy.inputs[0].config?.policy?.value as PolicyConfig;
  const currentPolicyConfig = currentPackagePolicy.inputs[0].config.policy.value;

  // ransomware is supported on windows and mac only; notify once across both
  let ransomwareNotified = false;

  RANSOMWARE_OS_KEYS.forEach((osKey) => {
    if (
      !ransomwareNotified &&
      isNewlyEnabled(
        currentPolicyConfig[osKey]?.ransomware?.mode,
        newPolicyConfig[osKey]?.ransomware?.mode
      )
    ) {
      notifyProtection('ransomware', featureUsageService);
      ransomwareNotified = true;
    }
  });

  PROTECTION_KEYS.forEach((protectionKey) => {
    // only notify once per protection since protection can't be configured per os
    let notified = false;

    OS_KEYS.forEach((osKey) => {
      if (
        !notified &&
        isNewlyEnabled(
          currentPolicyConfig[osKey]?.[protectionKey]?.mode,
          newPolicyConfig[osKey]?.[protectionKey]?.mode
        )
      ) {
        notifyProtection(protectionKey, featureUsageService);
        notified = true;
      }
    });
  });
}
