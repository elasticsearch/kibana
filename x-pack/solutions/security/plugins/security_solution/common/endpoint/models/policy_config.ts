/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PolicyConfig } from '../types';
import { AntivirusRegistrationModes, DeviceControlAccessLevel, ProtectionModes } from '../types';

import { isBillablePolicy } from './policy_config_helpers';

/**
 * Return a new default `PolicyConfig` for platinum and above licenses
 */
export const policyFactory = ({
  license = '',
  cloud = false,
  licenseUuid = '',
  clusterUuid = '',
  clusterName = '',
  serverless = false,
  isGlobalTelemetryEnabled = false,
} = {}): PolicyConfig => {
  const policy: PolicyConfig = {
    meta: {
      license,
      license_uuid: licenseUuid,
      cluster_uuid: clusterUuid,
      cluster_name: clusterName,
      cloud,
      serverless,
    },
    global_manifest_version: 'latest',
    global_telemetry_enabled: isGlobalTelemetryEnabled,
    windows: {
      events: {
        credential_access: true,
        dll_and_driver_load: true,
        dns: true,
        file: true,
        network: true,
        process: true,
        registry: true,
        security: true,
      },
      device_control: {
        enabled: true,
        usb_storage: DeviceControlAccessLevel.deny_all,
      },
      malware: {
        mode: ProtectionModes.prevent,
        blocklist: true,
        on_write_scan: true,
      },
      ransomware: {
        mode: ProtectionModes.prevent,
        supported: true,
      },
      memory_protection: {
        mode: ProtectionModes.prevent,
        supported: true,
      },
      behavior_protection: {
        mode: ProtectionModes.prevent,
        reputation_service: cloud, // Defaults to true if on cloud
        supported: true,
      },
      popup: {
        malware: {
          message: '',
          enabled: true,
        },
        ransomware: {
          message: '',
          enabled: true,
        },
        memory_protection: {
          message: '',
          enabled: true,
        },
        behavior_protection: {
          message: '',
          enabled: true,
        },
        device_control: {
          message: '',
          enabled: true,
        },
      },
      logging: {
        file: 'info',
      },
      antivirus_registration: {
        mode: AntivirusRegistrationModes.sync,
        enabled: true, // Defaults to true since Malware protection is set to prevent and mode is set to sync
      },
      attack_surface_reduction: {
        credential_hardening: {
          enabled: true,
        },
      },
    },
    mac: {
      events: {
        dns: true,
        process: true,
        file: true,
        network: true,
        security: true,
      },
      malware: {
        mode: ProtectionModes.prevent,
        blocklist: true,
        on_write_scan: true,
      },
      ransomware: {
        mode: ProtectionModes.off,
        supported: true,
      },
      device_control: {
        enabled: true,
        usb_storage: DeviceControlAccessLevel.deny_all,
      },
      behavior_protection: {
        mode: ProtectionModes.prevent,
        reputation_service: cloud, // Defaults to true if on cloud
        supported: true,
      },
      memory_protection: {
        mode: ProtectionModes.prevent,
        supported: true,
      },
      popup: {
        malware: {
          message: '',
          enabled: true,
        },
        ransomware: {
          message: '',
          enabled: true,
        },
        behavior_protection: {
          message: '',
          enabled: true,
        },
        memory_protection: {
          message: '',
          enabled: true,
        },
        device_control: {
          message: '',
          enabled: true,
        },
      },
      logging: {
        file: 'info',
      },
      advanced: {
        capture_env_vars: 'DYLD_INSERT_LIBRARIES,DYLD_FRAMEWORK_PATH,DYLD_LIBRARY_PATH,LD_PRELOAD',
      },
    },
    linux: {
      events: {
        dns: true,
        file: true,
        process: true,
        network: true,
        session_data: false,
        tty_io: false,
      },
      malware: {
        mode: ProtectionModes.prevent,
        blocklist: true,
        on_write_scan: true,
      },
      behavior_protection: {
        mode: ProtectionModes.prevent,
        reputation_service: cloud, // Defaults to true if on cloud
        supported: true,
      },
      memory_protection: {
        mode: ProtectionModes.prevent,
        supported: true,
      },
      popup: {
        malware: {
          message: '',
          enabled: true,
        },
        behavior_protection: {
          message: '',
          enabled: true,
        },
        memory_protection: {
          message: '',
          enabled: true,
        },
      },
      logging: {
        file: 'info',
      },
      advanced: {
        capture_env_vars: 'LD_PRELOAD,LD_LIBRARY_PATH',
      },
    },
  };
  policy.meta.billable = isBillablePolicy(policy);

  return policy;
};

/**
 * Strips paid features from an existing or new `PolicyConfig` for license below enterprise
 */

export const policyFactoryWithoutPaidEnterpriseFeatures = (
  policy: PolicyConfig = policyFactory()
): PolicyConfig => {
  return {
    ...policy,
    global_manifest_version: 'latest',
    windows: {
      ...policy.windows,
      device_control: {
        enabled: false,
        usb_storage: DeviceControlAccessLevel.audit,
      },
      popup: {
        ...policy.windows.popup,
        device_control: {
          enabled: false,
          message: '',
        },
      },
    },
    mac: {
      ...policy.mac,
      device_control: {
        enabled: false,
        usb_storage: DeviceControlAccessLevel.audit,
      },
      popup: {
        ...policy.mac.popup,
        device_control: {
          enabled: false,
          message: '',
        },
      },
    },
  };
};

/**
 * Strips paid features from an existing or new `PolicyConfig` for gold and below license
 */
export const policyFactoryWithoutPaidFeatures = (
  policy: PolicyConfig = policyFactory()
): PolicyConfig => {
  const rollbackConfig = {
    rollback: {
      self_healing: {
        enabled: false,
      },
    },
  };

  return {
    ...policy,
    global_manifest_version: 'latest',
    windows: {
      ...policy.windows,
      advanced:
        policy.windows.advanced === undefined
          ? undefined
          : {
              ...policy.windows.advanced,
              alerts:
                policy.windows.advanced.alerts === undefined
                  ? {
                      ...rollbackConfig,
                    }
                  : {
                      ...policy.windows.advanced.alerts,
                      ...rollbackConfig,
                    },
            },
      ransomware: {
        mode: ProtectionModes.off,
        supported: false,
      },
      memory_protection: {
        mode: ProtectionModes.off,
        supported: false,
      },
      behavior_protection: {
        mode: ProtectionModes.off,
        reputation_service: false,
        supported: false,
      },
      attack_surface_reduction: {
        credential_hardening: {
          enabled: false,
        },
      },
      device_control: {
        enabled: false,
        usb_storage: DeviceControlAccessLevel.audit,
      },
      popup: {
        ...policy.windows.popup,
        malware: {
          message: '',
          enabled: true, // disabling/configuring malware popup is a paid feature
        },
        ransomware: {
          message: '',
          enabled: false,
        },
        memory_protection: {
          message: '',
          enabled: false,
        },
        behavior_protection: {
          message: '',
          enabled: false,
        },
        device_control: {
          message: '',
          enabled: false,
        },
      },
    },
    mac: {
      ...policy.mac,
      ransomware: {
        mode: ProtectionModes.off,
        supported: false,
      },
      behavior_protection: {
        mode: ProtectionModes.off,
        reputation_service: false,
        supported: false,
      },
      memory_protection: {
        mode: ProtectionModes.off,
        supported: false,
      },
      device_control: {
        enabled: false,
        usb_storage: DeviceControlAccessLevel.audit,
      },
      popup: {
        ...policy.mac.popup,
        malware: {
          message: '',
          enabled: true, // disabling/configuring malware popup is a paid feature
        },
        ransomware: {
          message: '',
          enabled: false,
        },
        memory_protection: {
          message: '',
          enabled: false,
        },
        behavior_protection: {
          message: '',
          enabled: false,
        },
        device_control: {
          message: '',
          enabled: false,
        },
      },
    },
    linux: {
      ...policy.linux,
      behavior_protection: {
        mode: ProtectionModes.off,
        reputation_service: false,
        supported: false,
      },
      memory_protection: {
        mode: ProtectionModes.off,
        supported: false,
      },
      popup: {
        ...policy.linux.popup,
        malware: {
          message: '',
          enabled: true, // disabling/configuring malware popup is a paid feature
        },
        memory_protection: {
          message: '',
          enabled: false,
        },
        behavior_protection: {
          message: '',
          enabled: false,
        },
      },
    },
  };
};

/**
 * Enables support for paid features for an existing or new `PolicyConfig` for platinum and above license
 */
export const policyFactoryWithSupportedFeatures = (
  policy: PolicyConfig = policyFactory()
): PolicyConfig => {
  return {
    ...policy,
    windows: {
      ...policy.windows,
      ransomware: {
        ...policy.windows.ransomware,
        supported: true,
      },
      memory_protection: {
        ...policy.windows.memory_protection,
        supported: true,
      },
      behavior_protection: {
        ...policy.windows.behavior_protection,
        supported: true,
      },
    },
    mac: {
      ...policy.mac,
      ransomware: {
        ...policy.mac.ransomware,
        supported: true,
      },
      behavior_protection: {
        ...policy.mac.behavior_protection,
        supported: true,
      },
      memory_protection: {
        ...policy.mac.memory_protection,
        supported: true,
      },
    },
    linux: {
      ...policy.linux,
      behavior_protection: {
        ...policy.linux.behavior_protection,
        supported: true,
      },
      memory_protection: {
        ...policy.linux.memory_protection,
        supported: true,
      },
    },
  };
};

/**
 * Reflects what string the Endpoint will use when message field is default/empty
 */
export const DefaultPolicyNotificationMessage = 'Elastic Security {action} {filename}';
export const DefaultPolicyRuleNotificationMessage = 'Elastic Security {action} {rule}';
export const DefaultPolicyDeviceNotificationMessage = 'Device Control activity was detected';
