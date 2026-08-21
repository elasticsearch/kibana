/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  isEndpointPolicyValidForLicense,
  unsetPolicyFeaturesAccordingToLicenseLevel,
} from './policy_config';
import {
  DefaultPolicyNotificationMessage,
  DefaultPolicyRuleNotificationMessage,
  DefaultPolicyDeviceNotificationMessage,
  policyFactory,
  policyFactoryWithoutPaidFeatures,
  policyFactoryWithSupportedFeatures,
} from '../endpoint/models/policy_config';
import { licenseMock } from '@kbn/licensing-plugin/common/licensing.mock';
import type { PolicyConfig } from '../endpoint/types';
import { ProtectionModes } from '../endpoint/types';

describe('policy_config and licenses', () => {
  const Platinum = licenseMock.createLicense({ license: { type: 'platinum', mode: 'platinum' } });
  const Enterprise = licenseMock.createLicense({ license: { type: 'enterprise' } });
  const Gold = licenseMock.createLicense({ license: { type: 'gold', mode: 'gold' } });
  const Basic = licenseMock.createLicense({ license: { type: 'basic', mode: 'basic' } });

  const disableEnterpriseFeatures = (policy: PolicyConfig) => {
    if (policy.windows.device_control) policy.windows.device_control.enabled = false;
    if (policy.mac.device_control) policy.mac.device_control.enabled = false;
    if (policy.windows.popup.device_control) policy.windows.popup.device_control.enabled = false;
    if (policy.mac.popup.device_control) policy.mac.popup.device_control.enabled = false;
  };

  describe('isEndpointPolicyValidForLicense', () => {
    it('allows malware notification to be disabled with a Platinum license', () => {
      const policy = policyFactory();
      disableEnterpriseFeatures(policy);
      policy.windows.popup.malware.enabled = false; // make policy change
      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });
    it('blocks windows malware notification changes below Platinum licenses', () => {
      const policy = policyFactory();
      policy.windows.popup.malware.enabled = false; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks mac malware notification changes below Platinum licenses', () => {
      const policy = policyFactory();
      policy.mac.popup.malware.enabled = false; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('allows malware notification message changes with a Platinum license', () => {
      const policy = policyFactory();
      disableEnterpriseFeatures(policy);
      policy.windows.popup.malware.message = 'BOOM'; // make policy change
      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });
    it('blocks windows malware notification message changes below Platinum licenses', () => {
      const policy = policyFactory();
      policy.windows.popup.malware.message = 'BOOM'; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });
    it('blocks mac malware notification message changes below Platinum licenses', () => {
      const policy = policyFactory();
      policy.mac.popup.malware.message = 'BOOM'; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('allows ransomware, memory and behavior to be turned on for Platinum licenses', () => {
      const policy = policyFactoryWithoutPaidFeatures();
      // ransomware protection
      policy.windows.ransomware.mode = ProtectionModes.prevent;
      policy.windows.ransomware.supported = true;
      policy.mac.ransomware.mode = ProtectionModes.prevent;
      policy.mac.ransomware.supported = true;
      // memory protection
      policy.windows.memory_protection.mode = ProtectionModes.prevent;
      policy.windows.memory_protection.supported = true;
      policy.mac.memory_protection.mode = ProtectionModes.prevent;
      policy.mac.memory_protection.supported = true;
      policy.linux.memory_protection.mode = ProtectionModes.prevent;
      policy.linux.memory_protection.supported = true;
      // behavior protection
      policy.windows.behavior_protection.mode = ProtectionModes.prevent;
      policy.windows.behavior_protection.supported = true;
      policy.mac.behavior_protection.mode = ProtectionModes.prevent;
      policy.mac.behavior_protection.supported = true;
      policy.linux.behavior_protection.mode = ProtectionModes.prevent;
      policy.linux.behavior_protection.supported = true;

      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('allows ransomware, memory  and behavior protection notification to be turned on with a Platinum license', () => {
      const policy = policyFactoryWithoutPaidFeatures();
      // ransomware protection
      policy.windows.popup.ransomware.enabled = true;
      policy.windows.ransomware.supported = true;
      policy.mac.popup.ransomware.enabled = true;
      policy.mac.ransomware.supported = true;
      // memory protection
      policy.windows.popup.memory_protection.enabled = true;
      policy.windows.memory_protection.supported = true;
      policy.mac.popup.memory_protection.enabled = true;
      policy.mac.memory_protection.supported = true;
      policy.linux.popup.memory_protection.enabled = true;
      policy.linux.memory_protection.supported = true;
      // behavior protection
      policy.windows.popup.behavior_protection.enabled = true;
      policy.windows.behavior_protection.supported = true;
      policy.mac.popup.behavior_protection.enabled = true;
      policy.mac.behavior_protection.supported = true;
      policy.linux.popup.behavior_protection.enabled = true;
      policy.linux.behavior_protection.supported = true;
      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('allows advanced rollback option when Platinum', () => {
      const policy = policyFactory();
      disableEnterpriseFeatures(policy);
      policy.windows.advanced = { alerts: { rollback: { self_healing: { enabled: true } } } }; // make policy change
      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('blocks advanced rollback option when below Platinum', () => {
      const policy = policyFactory();
      policy.windows.advanced = { alerts: { rollback: { self_healing: { enabled: true } } } }; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('allows credential hardening option when Platinum', () => {
      const policy = policyFactory();
      disableEnterpriseFeatures(policy);
      policy.windows.attack_surface_reduction.credential_hardening.enabled = true; // make policy change
      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('blocks credential hardening option when below Platinum', () => {
      const policy = policyFactory();
      policy.windows.attack_surface_reduction.credential_hardening.enabled = true; // make policy change
      let valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('allows protection updates custom date with an Enterprise license', () => {
      const policy = policyFactoryWithSupportedFeatures();
      policy.global_manifest_version = '2022-01-10';
      const valid = isEndpointPolicyValidForLicense(policy, Enterprise);
      expect(valid).toBeTruthy();
    });

    it('blocks protection updates custom date for Platinum and below license', () => {
      const policy = policyFactoryWithSupportedFeatures();
      policy.global_manifest_version = '2022-01-10';
      [Platinum, Gold, Basic].forEach((license) => {
        const valid = isEndpointPolicyValidForLicense(policy, license);
        expect(valid).toBeFalsy();
      });
    });

    describe('ransomware protection checks', () => {
      it('blocks ransomware to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.ransomware.mode = ProtectionModes.prevent;
        policy.mac.ransomware.mode = ProtectionModes.prevent;

        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();
        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('blocks ransomware notification to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.popup.ransomware.enabled = true;
        policy.mac.popup.ransomware.enabled = true;
        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('allows ransomware notification message changes with a Platinum license', () => {
        const policy = policyFactory();
        disableEnterpriseFeatures(policy);
        policy.windows.popup.ransomware.message = 'BOOM';
        policy.mac.popup.ransomware.message = 'BOOM';
        const valid = isEndpointPolicyValidForLicense(policy, Platinum);
        expect(valid).toBeTruthy();
      });
      it('blocks ransomware notification message changes for Gold and below licenses', () => {
        const policy = policyFactory();
        policy.windows.popup.ransomware.message = 'BOOM';
        policy.mac.popup.ransomware.message = 'BOOM';
        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });
    });

    describe('memory protection checks', () => {
      it('blocks memory_protection to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.memory_protection.mode = ProtectionModes.prevent;
        policy.mac.memory_protection.mode = ProtectionModes.prevent;
        policy.linux.memory_protection.mode = ProtectionModes.prevent;

        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();
        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('blocks memory_protection notification to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.popup.memory_protection.enabled = true;
        policy.mac.popup.memory_protection.enabled = true;
        policy.linux.popup.memory_protection.enabled = true;

        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('allows memory_protection notification message changes with a Platinum license', () => {
        const policy = policyFactory();
        disableEnterpriseFeatures(policy);
        policy.windows.popup.memory_protection.message = 'BOOM';
        policy.mac.popup.memory_protection.message = 'BOOM';
        policy.linux.popup.memory_protection.message = 'BOOM';
        const valid = isEndpointPolicyValidForLicense(policy, Platinum);
        expect(valid).toBeTruthy();
      });

      it('blocks memory_protection notification message changes for Gold and below licenses', () => {
        const policy = policyFactory();
        policy.windows.popup.memory_protection.message = 'BOOM';
        policy.mac.popup.memory_protection.message = 'BOOM';
        policy.linux.popup.memory_protection.message = 'BOOM';
        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });
    });

    describe('behavior protection checks', () => {
      it('blocks behavior_protection to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.behavior_protection.mode = ProtectionModes.prevent;
        policy.mac.behavior_protection.mode = ProtectionModes.prevent;
        policy.linux.behavior_protection.mode = ProtectionModes.prevent;

        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();
        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('blocks behavior_protection notification to be turned on for Gold and below licenses', () => {
        const policy = policyFactoryWithoutPaidFeatures();
        policy.windows.popup.behavior_protection.enabled = true;
        policy.mac.popup.behavior_protection.enabled = true;
        policy.linux.popup.behavior_protection.enabled = true;
        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });

      it('allows behavior_protection notification message changes with a Platinum license', () => {
        const policy = policyFactory();
        disableEnterpriseFeatures(policy);
        policy.windows.popup.behavior_protection.message = 'BOOM';
        policy.mac.popup.behavior_protection.message = 'BOOM';
        policy.linux.popup.behavior_protection.message = 'BOOM';
        const valid = isEndpointPolicyValidForLicense(policy, Platinum);
        expect(valid).toBeTruthy();
      });

      it('blocks behavior_protection notification message changes for Gold and below licenses', () => {
        const policy = policyFactory();
        policy.windows.popup.behavior_protection.message = 'BOOM';
        policy.mac.popup.behavior_protection.message = 'BOOM';
        policy.linux.popup.behavior_protection.message = 'BOOM';
        let valid = isEndpointPolicyValidForLicense(policy, Gold);
        expect(valid).toBeFalsy();

        valid = isEndpointPolicyValidForLicense(policy, Basic);
        expect(valid).toBeFalsy();
      });
    });

    it('allows default policyConfig with Basic', () => {
      const policy = policyFactoryWithoutPaidFeatures();
      const valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeTruthy();
    });
  });

  describe('unsetPolicyFeaturesAccordingToLicenseLevel', () => {
    it('does not change any malware fields with a Platinum license', () => {
      const policy = policyFactory();
      const popupMessage = 'WOOP WOOP';
      policy.windows.popup.malware.message = popupMessage;
      policy.mac.popup.malware.message = popupMessage;
      policy.windows.popup.malware.enabled = false;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);
      expect(retPolicy.windows.popup.malware.enabled).toBeFalsy();
      expect(retPolicy.windows.popup.malware.message).toEqual(popupMessage);
      expect(retPolicy.mac.popup.malware.message).toEqual(popupMessage);
    });

    it('does not change any ransomware fields with a Platinum license', () => {
      const policy = policyFactory();
      const popupMessage = 'WOOP WOOP';
      policy.windows.ransomware.mode = ProtectionModes.detect;
      policy.windows.popup.ransomware.enabled = false;
      policy.windows.popup.ransomware.message = popupMessage;
      policy.mac.ransomware.mode = ProtectionModes.detect;
      policy.mac.popup.ransomware.enabled = false;
      policy.mac.popup.ransomware.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);
      expect(retPolicy.windows.ransomware.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.windows.popup.ransomware.enabled).toBeFalsy();
      expect(retPolicy.windows.popup.ransomware.message).toEqual(popupMessage);
      expect(retPolicy.mac.ransomware.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.mac.popup.ransomware.enabled).toBeFalsy();
      expect(retPolicy.mac.popup.ransomware.message).toEqual(popupMessage);
    });

    it('does not change any memory fields with a Platinum license', () => {
      const policy = policyFactory();
      const popupMessage = 'WOOP WOOP';
      policy.windows.memory_protection.mode = ProtectionModes.detect;
      policy.windows.popup.memory_protection.enabled = false;
      policy.windows.popup.memory_protection.message = popupMessage;

      policy.linux.memory_protection.mode = ProtectionModes.detect;
      policy.linux.popup.memory_protection.enabled = false;
      policy.linux.popup.memory_protection.message = popupMessage;

      policy.mac.memory_protection.mode = ProtectionModes.detect;
      policy.mac.popup.memory_protection.enabled = false;
      policy.mac.popup.memory_protection.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);
      expect(retPolicy.windows.memory_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.windows.popup.memory_protection.enabled).toBeFalsy();
      expect(retPolicy.windows.popup.memory_protection.message).toEqual(popupMessage);

      expect(retPolicy.linux.memory_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.linux.popup.memory_protection.enabled).toBeFalsy();
      expect(retPolicy.linux.popup.memory_protection.message).toEqual(popupMessage);

      expect(retPolicy.mac.memory_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.mac.popup.memory_protection.enabled).toBeFalsy();
      expect(retPolicy.mac.popup.memory_protection.message).toEqual(popupMessage);
    });

    it('does not change any behavior fields with a Platinum license', () => {
      const policy = policyFactory();
      const popupMessage = 'WOOP WOOP';
      policy.windows.behavior_protection.mode = ProtectionModes.detect;
      policy.windows.popup.behavior_protection.enabled = false;
      policy.windows.popup.behavior_protection.message = popupMessage;
      policy.mac.behavior_protection.mode = ProtectionModes.detect;
      policy.mac.popup.behavior_protection.enabled = false;
      policy.mac.popup.behavior_protection.message = popupMessage;
      policy.linux.behavior_protection.mode = ProtectionModes.detect;
      policy.linux.popup.behavior_protection.enabled = false;
      policy.linux.popup.behavior_protection.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);
      expect(retPolicy.windows.behavior_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.windows.popup.behavior_protection.enabled).toBeFalsy();
      expect(retPolicy.windows.popup.behavior_protection.message).toEqual(popupMessage);
      expect(retPolicy.mac.behavior_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.mac.popup.behavior_protection.enabled).toBeFalsy();
      expect(retPolicy.mac.popup.behavior_protection.message).toEqual(popupMessage);
      expect(retPolicy.linux.behavior_protection.mode).toEqual(ProtectionModes.detect);
      expect(retPolicy.linux.popup.behavior_protection.enabled).toBeFalsy();
      expect(retPolicy.linux.popup.behavior_protection.message).toEqual(popupMessage);
    });

    it('does not change protection updates fields with an Enterprise license', () => {
      const policy = policyFactory();
      const date = '2022-10-01';
      policy.global_manifest_version = date;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Enterprise);
      expect(retPolicy.global_manifest_version).toEqual(date);
    });

    it('resets Enterprise-paid fields for lower license tiers', () => {
      const defaults = policyFactory(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.global_manifest_version = '2022-10-01';
      [Platinum, Gold, Basic].forEach((license) => {
        const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, license);
        expect(retPolicy.global_manifest_version).toEqual(defaults.global_manifest_version);
      });
    });

    it('resets Platinum-paid fields for lower license tiers', () => {
      const defaults = policyFactory(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      const popupMessage = 'WOOP WOOP';
      policy.windows.popup.malware.message = popupMessage;
      policy.mac.popup.malware.message = popupMessage;
      policy.windows.popup.malware.enabled = false;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);
      expect(retPolicy.windows.popup.malware.enabled).toEqual(
        defaults.windows.popup.malware.enabled
      );
      expect(retPolicy.windows.popup.malware.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyNotificationMessage]).toContain(
        retPolicy.windows.popup.malware.message
      );
    });

    it('resets Platinum-paid ransomware fields for lower license tiers', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      const popupMessage = 'WOOP WOOP';
      policy.windows.popup.ransomware.message = popupMessage;
      policy.mac.popup.ransomware.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.ransomware.mode).toEqual(defaults.windows.ransomware.mode);
      expect(retPolicy.windows.popup.ransomware.enabled).toEqual(
        defaults.windows.popup.ransomware.enabled
      );
      expect(retPolicy.windows.popup.ransomware.message).not.toEqual(popupMessage);
      expect(retPolicy.mac.ransomware.mode).toEqual(defaults.mac.ransomware.mode);
      expect(retPolicy.mac.popup.ransomware.enabled).toEqual(defaults.mac.popup.ransomware.enabled);
      expect(retPolicy.mac.popup.ransomware.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyNotificationMessage]).toContain(
        retPolicy.windows.popup.ransomware.message
      );
      expect(['', DefaultPolicyNotificationMessage]).toContain(
        retPolicy.mac.popup.ransomware.message
      );
    });

    it('resets Platinum-paid memory_protection fields for lower license tiers', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      const popupMessage = 'WOOP WOOP';
      policy.windows.popup.memory_protection.message = popupMessage;
      policy.mac.popup.memory_protection.message = popupMessage;
      policy.linux.popup.memory_protection.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.memory_protection.mode).toEqual(
        defaults.windows.memory_protection.mode
      );
      expect(retPolicy.windows.popup.memory_protection.enabled).toEqual(
        defaults.windows.popup.memory_protection.enabled
      );
      expect(retPolicy.windows.popup.memory_protection.message).not.toEqual(popupMessage);

      expect(retPolicy.mac.memory_protection.mode).toEqual(defaults.mac.memory_protection.mode);
      expect(retPolicy.mac.popup.memory_protection.enabled).toEqual(
        defaults.mac.popup.memory_protection.enabled
      );
      expect(retPolicy.mac.popup.memory_protection.message).not.toEqual(popupMessage);

      expect(retPolicy.linux.memory_protection.mode).toEqual(defaults.linux.memory_protection.mode);
      expect(retPolicy.linux.popup.memory_protection.enabled).toEqual(
        defaults.linux.popup.memory_protection.enabled
      );
      expect(retPolicy.linux.popup.memory_protection.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.windows.popup.memory_protection.message
      );
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.mac.popup.memory_protection.message
      );
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.linux.popup.memory_protection.message
      );
    });

    it('resets Platinum-paid behavior_protection fields for lower license tiers', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      const popupMessage = 'WOOP WOOP';
      policy.windows.popup.behavior_protection.message = popupMessage;
      policy.mac.popup.behavior_protection.message = popupMessage;
      policy.linux.popup.behavior_protection.message = popupMessage;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.behavior_protection.mode).toEqual(
        defaults.windows.behavior_protection.mode
      );
      expect(retPolicy.windows.popup.behavior_protection.enabled).toEqual(
        defaults.windows.popup.behavior_protection.enabled
      );
      expect(retPolicy.windows.popup.behavior_protection.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.windows.popup.behavior_protection.message
      );

      expect(retPolicy.mac.behavior_protection.mode).toEqual(defaults.mac.behavior_protection.mode);
      expect(retPolicy.mac.popup.behavior_protection.enabled).toEqual(
        defaults.mac.popup.behavior_protection.enabled
      );
      expect(retPolicy.mac.popup.behavior_protection.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.mac.popup.behavior_protection.message
      );

      expect(retPolicy.linux.behavior_protection.mode).toEqual(
        defaults.linux.behavior_protection.mode
      );
      expect(retPolicy.linux.popup.behavior_protection.enabled).toEqual(
        defaults.linux.popup.behavior_protection.enabled
      );
      expect(retPolicy.linux.popup.behavior_protection.message).not.toEqual(popupMessage);

      // need to invert the test, since it could be either value
      expect(['', DefaultPolicyRuleNotificationMessage]).toContain(
        retPolicy.linux.popup.behavior_protection.message
      );
    });

    it('resets Platinum-paid advanced fields for lower license tiers', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset

      policy.windows.advanced = {
        alerts: {
          rollback: {
            self_healing: {
              enabled: true,
            },
          },
          cloud_lookup: false,
        },
        another_advanced: true,
      };

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.advanced?.rollback).toEqual(defaults.windows.advanced?.rollback);

      // Preserves non-license gated advanced settings.
      expect(retPolicy.windows.advanced?.another_advanced).toEqual(true);
      expect(retPolicy.windows.advanced?.alerts?.cloud_lookup).toEqual(false);
    });

    it('sets ransomware supported field to false when license is below Platinum', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.ransomware.supported = true;
      policy.mac.ransomware.supported = true;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.ransomware.supported).toEqual(defaults.windows.ransomware.supported);
      expect(retPolicy.mac.ransomware.supported).toEqual(defaults.mac.ransomware.supported);
    });

    it('sets ransomware supported field to true when license is at Platinum', () => {
      const defaults = policyFactoryWithSupportedFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.ransomware.supported = false;
      policy.mac.ransomware.supported = false;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);

      expect(retPolicy.windows.ransomware.supported).toEqual(defaults.windows.ransomware.supported);
      expect(retPolicy.mac.ransomware.supported).toEqual(defaults.mac.ransomware.supported);
    });

    it('sets memory_protection supported field to false when license is below Platinum', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.memory_protection.supported = true;
      policy.mac.memory_protection.supported = true;
      policy.linux.memory_protection.supported = true;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.memory_protection.supported).toEqual(
        defaults.windows.memory_protection.supported
      );
      expect(retPolicy.mac.memory_protection.supported).toEqual(
        defaults.mac.memory_protection.supported
      );
      expect(retPolicy.linux.memory_protection.supported).toEqual(
        defaults.linux.memory_protection.supported
      );
    });

    it('sets memory_protection supported field to true when license is at Platinum', () => {
      const defaults = policyFactoryWithSupportedFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.memory_protection.supported = false;
      policy.mac.memory_protection.supported = false;
      policy.linux.memory_protection.supported = false;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);

      expect(retPolicy.windows.memory_protection.supported).toEqual(
        defaults.windows.memory_protection.supported
      );
      expect(retPolicy.mac.memory_protection.supported).toEqual(
        defaults.mac.memory_protection.supported
      );
      expect(retPolicy.linux.memory_protection.supported).toEqual(
        defaults.linux.memory_protection.supported
      );
    });
    it('sets behavior_protection supported field to false when license is below Platinum', () => {
      const defaults = policyFactoryWithoutPaidFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.behavior_protection.supported = true;
      policy.mac.behavior_protection.supported = true;
      policy.linux.behavior_protection.supported = true;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Gold);

      expect(retPolicy.windows.behavior_protection.supported).toEqual(
        defaults.windows.behavior_protection.supported
      );
      expect(retPolicy.mac.behavior_protection.supported).toEqual(
        defaults.mac.behavior_protection.supported
      );
      expect(retPolicy.linux.behavior_protection.supported).toEqual(
        defaults.linux.behavior_protection.supported
      );
    });

    it('sets behavior_protection supported field to true when license is at Platinum', () => {
      const defaults = policyFactoryWithSupportedFeatures(); // reference
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.behavior_protection.supported = false;
      policy.mac.behavior_protection.supported = false;
      policy.linux.behavior_protection.supported = false;

      const retPolicy = unsetPolicyFeaturesAccordingToLicenseLevel(policy, Platinum);

      expect(retPolicy.windows.behavior_protection.supported).toEqual(
        defaults.windows.behavior_protection.supported
      );
      expect(retPolicy.mac.behavior_protection.supported).toEqual(
        defaults.mac.behavior_protection.supported
      );
      expect(retPolicy.linux.behavior_protection.supported).toEqual(
        defaults.linux.behavior_protection.supported
      );
    });
  });

  describe('policyFactoryWithoutPaidFeatures for gold and below license', () => {
    it('preserves non license-gated features', () => {
      const policy = policyFactory(); // what we will modify, and should be reset
      policy.windows.events.file = false;
      const retPolicy = policyFactoryWithoutPaidFeatures(policy);
      expect(retPolicy.windows.events.file).toBeFalsy();
    });
  });

  describe('policyFactoryWithSupportedFeatures', () => {
    it('preserves each OS behavior_protection values while marking supported true', () => {
      const policy = policyFactory();
      policy.windows.behavior_protection.mode = ProtectionModes.off;
      policy.windows.behavior_protection.reputation_service = false;
      policy.mac.behavior_protection.mode = ProtectionModes.detect;
      policy.mac.behavior_protection.reputation_service = true;
      policy.linux.behavior_protection.mode = ProtectionModes.prevent;
      policy.linux.behavior_protection.reputation_service = false;

      const supported = policyFactoryWithSupportedFeatures(policy);

      expect(supported.mac.behavior_protection).toEqual({
        mode: ProtectionModes.detect,
        reputation_service: true,
        supported: true,
      });
      expect(supported.linux.behavior_protection).toEqual({
        mode: ProtectionModes.prevent,
        reputation_service: false,
        supported: true,
      });
    });
  });

  describe('isEndpointDeviceControlPolicyValidForLicense', () => {
    it('allows any device control configuration with Enterprise license', () => {
      const policy = policyFactory();
      // Enable all device control features
      if (policy.windows.device_control) {
        policy.windows.device_control.enabled = true;
      }
      if (policy.mac.device_control) {
        policy.mac.device_control.enabled = true;
      }
      if (policy.windows.popup.device_control) {
        policy.windows.popup.device_control.enabled = true;
        policy.windows.popup.device_control.message = 'Custom message';
      }
      if (policy.mac.popup.device_control) {
        policy.mac.popup.device_control.enabled = true;
        policy.mac.popup.device_control.message = 'Custom message';
      }

      const valid = isEndpointPolicyValidForLicense(policy, Enterprise);
      expect(valid).toBeTruthy();
    });

    it('blocks Windows device control when enabled with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.windows.device_control) {
        policy.windows.device_control.enabled = true;
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks Mac device control when enabled with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.mac.device_control) {
        policy.mac.device_control.enabled = true;
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks Windows popup device control when enabled with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.windows.popup.device_control) {
        policy.windows.popup.device_control.enabled = true;
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks Mac popup device control when enabled with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.mac.popup.device_control) {
        policy.mac.popup.device_control.enabled = true;
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks Windows popup device control custom message with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.windows.popup.device_control) {
        policy.windows.popup.device_control.enabled = false;
        policy.windows.popup.device_control.message = 'Custom message';
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('blocks Mac popup device control custom message with non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.mac.popup.device_control) {
        policy.mac.popup.device_control.enabled = false;
        policy.mac.popup.device_control.message = 'Custom message';
      }

      let valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Gold);
      expect(valid).toBeFalsy();

      valid = isEndpointPolicyValidForLicense(policy, Basic);
      expect(valid).toBeFalsy();
    });

    it('allows Mac and Windows popup device control with empty message and disabled state for non-Enterprise license', () => {
      const policy = policyFactory();
      if (policy.windows.device_control) {
        policy.windows.device_control.enabled = false;
      }
      if (policy.windows.popup.device_control) {
        policy.windows.popup.device_control.enabled = false;
        policy.windows.popup.device_control.message = '';
      }

      if (policy.mac.device_control) {
        policy.mac.device_control.enabled = false;
      }
      if (policy.mac.popup.device_control) {
        policy.mac.popup.device_control.enabled = false;
        policy.mac.popup.device_control.message = '';
      }

      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('allows Mac and Windows popup device control with default message and disabled state for non-Enterprise license', () => {
      const policy = policyFactory();

      if (policy.windows.device_control) policy.windows.device_control.enabled = false;
      if (policy.windows.popup.device_control) {
        policy.windows.popup.device_control.enabled = false;
        policy.windows.popup.device_control.message = DefaultPolicyDeviceNotificationMessage;
      }
      if (policy.mac.device_control) {
        policy.mac.device_control.enabled = false;
      }
      if (policy.mac.popup.device_control) {
        policy.mac.popup.device_control.enabled = false;
        policy.mac.popup.device_control.message = DefaultPolicyDeviceNotificationMessage;
      }

      const valid = isEndpointPolicyValidForLicense(policy, Platinum);
      expect(valid).toBeTruthy();
    });

    it('blocks device control with null license when features are enabled', () => {
      const policy = policyFactory();
      if (policy.windows.device_control) {
        policy.windows.device_control.enabled = true;
      }

      const valid = isEndpointPolicyValidForLicense(policy, null);
      expect(valid).toBeFalsy();
    });
  });
});
