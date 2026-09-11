/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash';
import type { NewPackagePolicy } from '@kbn/fleet-plugin/common';
import { ProtectionModes } from '../../common/endpoint/types';
import type { PolicyConfig, PolicyData } from '../../common/endpoint/types';
import { FleetPackagePolicyGenerator } from '../../common/endpoint/data_generators/fleet_package_policy_generator';
import { createFeatureUsageServiceMock } from '../endpoint/services/feature_usage/mocks';
import { notifyProtectionFeatureUsage } from './notify_protection_feature_usage';

describe('notifyProtectionFeatureUsage', () => {
  const generator = new FleetPackagePolicyGenerator();
  let featureUsageService: ReturnType<typeof createFeatureUsageServiceMock>;
  let currentPackagePolicy: PolicyData;
  let newPackagePolicy: PolicyData;

  beforeEach(() => {
    featureUsageService = createFeatureUsageServiceMock();
    currentPackagePolicy = generator.generateEndpointPackagePolicy();
    newPackagePolicy = cloneDeep(currentPackagePolicy);
  });

  const notify = async (newPolicy: NewPackagePolicy = newPackagePolicy) => {
    await notifyProtectionFeatureUsage(newPolicy, currentPackagePolicy, featureUsageService);
  };

  describe('ransomware', () => {
    it('notifies RANSOMWARE_PROTECTION once when Windows ransomware goes from off to prevent', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('RANSOMWARE_PROTECTION');
    });

    it('notifies RANSOMWARE_PROTECTION once when macOS ransomware goes from off to detect', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.mac.ransomware.mode = ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.mac.ransomware.mode = ProtectionModes.detect;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('RANSOMWARE_PROTECTION');
    });

    it('notifies RANSOMWARE_PROTECTION once when Windows and macOS both enable ransomware in the same update', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.off;
      currentPackagePolicy.inputs[0].config.policy.value.mac.ransomware.mode = ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.mac.ransomware.mode = ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('RANSOMWARE_PROTECTION');
    });

    it('does not notify when ransomware stays prevent', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).not.toHaveBeenCalled();
    });

    it('does not notify when ransomware transitions to off', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode = ProtectionModes.off;

      await notify();

      expect(featureUsageService.notifyUsage).not.toHaveBeenCalled();
    });

    // Policies stored before macOS ransomware shipped in 9.4 have no `mac.ransomware` branch at
    // all. `fleet_integration.ts:288` guards for that shape on the way in, and this module has to
    // as well — reading it unguarded threw a TypeError that failed the whole update callback.
    it('treats a missing macOS ransomware branch as off rather than throwing', async () => {
      const currentMac = currentPackagePolicy.inputs[0].config.policy.value.mac as Partial<
        PolicyConfig['mac']
      >;
      delete currentMac.ransomware;
      currentPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode =
        ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.windows.ransomware.mode = ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.mac.ransomware.mode = ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('RANSOMWARE_PROTECTION');
    });
  });

  describe('memory_protection and behavior_protection', () => {
    it('notifies MEMORY_THREAT_PROTECTION once when memory_protection is newly enabled across OSes', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.memory_protection.mode =
        ProtectionModes.off;
      currentPackagePolicy.inputs[0].config.policy.value.mac.memory_protection.mode =
        ProtectionModes.off;
      currentPackagePolicy.inputs[0].config.policy.value.linux.memory_protection.mode =
        ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.windows.memory_protection.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.mac.memory_protection.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.linux.memory_protection.mode =
        ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('MEMORY_THREAT_PROTECTION');
    });

    it('notifies BEHAVIOR_PROTECTION once when behavior_protection is newly enabled across OSes', async () => {
      currentPackagePolicy.inputs[0].config.policy.value.windows.behavior_protection.mode =
        ProtectionModes.off;
      currentPackagePolicy.inputs[0].config.policy.value.mac.behavior_protection.mode =
        ProtectionModes.off;
      currentPackagePolicy.inputs[0].config.policy.value.linux.behavior_protection.mode =
        ProtectionModes.off;
      newPackagePolicy.inputs[0].config.policy.value.windows.behavior_protection.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.mac.behavior_protection.mode =
        ProtectionModes.prevent;
      newPackagePolicy.inputs[0].config.policy.value.linux.behavior_protection.mode =
        ProtectionModes.prevent;

      await notify();

      expect(featureUsageService.notifyUsage).toHaveBeenCalledTimes(1);
      expect(featureUsageService.notifyUsage).toHaveBeenCalledWith('BEHAVIOR_PROTECTION');
    });
  });

  describe('early-return guard', () => {
    it('returns without notifying when the new policy has no id', async () => {
      const { id, ...withoutId } = newPackagePolicy;

      await notify(withoutId as NewPackagePolicy);

      expect(featureUsageService.notifyUsage).not.toHaveBeenCalled();
    });

    it('returns without notifying when the new policy has no inputs', async () => {
      await notify({
        ...newPackagePolicy,
        inputs: undefined as unknown as NewPackagePolicy['inputs'],
      });

      expect(featureUsageService.notifyUsage).not.toHaveBeenCalled();
    });

    it('returns without notifying when the new policy has no config.policy.value', async () => {
      await notify({
        ...newPackagePolicy,
        inputs: [{ ...newPackagePolicy.inputs[0], config: {} }],
      } as NewPackagePolicy);

      expect(featureUsageService.notifyUsage).not.toHaveBeenCalled();
    });
  });
});
