/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  AntivirusRegistrationModes,
  DeviceControlAccessLevel,
  ProtectionModes,
} from '../../../../../../common/endpoint/types';
import {
  getPolicyProtectionsReference,
  POLICY_COUPLING_MALWARE_BOOLEAN_FIELDS,
  type PolicyCouplingMalwareBooleanField,
  type PolicyCouplingProtection,
} from '../../../../../../common/endpoint/models/policy_config_helpers';
import { getFieldRegistryEntry, isWritablePath } from '../field_registry';
import {
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
  invalidSetFieldValueMessage,
} from './policy_change_operation';

const enumValues =
  <T extends string>(values: readonly T[]) =>
  (path: string, value: unknown): T => {
    if (typeof value !== 'string' || !values.includes(value as T)) {
      throw new PolicyChangePreparationError(
        POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
        invalidSetFieldValueMessage(path)
      );
    }
    return value as T;
  };

const assertBoolean = (path: string, value: unknown): boolean => {
  if (typeof value !== 'boolean') {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      invalidSetFieldValueMessage(path)
    );
  }
  return value;
};

const protectionForKeyPath = (path: string): PolicyCouplingProtection | undefined => {
  const [, ...remainder] = path.split('.');
  if (remainder.length === 0) return undefined;
  const keyPath = remainder.join('.');
  return getPolicyProtectionsReference().some(({ keyPath: reference }) => reference === keyPath)
    ? (keyPath.split('.')[0] as PolicyCouplingProtection)
    : undefined;
};

const protectionModeOf = (path: string): PolicyCouplingProtection | undefined => {
  if (!path.endsWith('.mode')) return undefined;
  const protection = protectionForKeyPath(path);
  return protection &&
    ['malware', 'ransomware', 'memory_protection', 'behavior_protection'].includes(protection)
    ? protection
    : undefined;
};

const popupProtectionOf = (path: string): PolicyCouplingProtection | undefined => {
  const parts = path.split('.');
  if (parts.length !== 4 || parts[1] !== 'popup' || parts[3] !== 'enabled') return undefined;
  const protection = parts[2];
  return protection &&
    ['malware', 'ransomware', 'memory_protection', 'behavior_protection'].includes(protection)
    ? (protection as PolicyCouplingProtection)
    : undefined;
};

const malwareBooleanFieldOf = (path: string): PolicyCouplingMalwareBooleanField | undefined => {
  const parts = path.split('.');
  const field = parts.length === 3 && parts[1] === 'malware' ? parts[2] : undefined;
  return POLICY_COUPLING_MALWARE_BOOLEAN_FIELDS.find((candidate) => candidate === field);
};

const deviceControlFieldOf = (path: string): 'enabled' | 'usb_storage' | undefined => {
  const parts = path.split('.');
  if (
    parts.length !== 3 ||
    !['windows', 'mac'].includes(parts[0] ?? '') ||
    parts[1] !== 'device_control'
  ) {
    return undefined;
  }
  return parts[2] === 'enabled' || parts[2] === 'usb_storage' ? parts[2] : undefined;
};

export type ClassifiedSetFieldValue =
  | {
      readonly kind: 'protection_mode';
      readonly protection: PolicyCouplingProtection;
      readonly value: ProtectionModes;
    }
  | { readonly kind: 'antivirus_registration_mode'; readonly value: AntivirusRegistrationModes }
  | { readonly kind: 'device_control_enabled'; readonly value: boolean }
  | { readonly kind: 'device_control_usb_storage'; readonly value: DeviceControlAccessLevel }
  | {
      readonly kind: 'malware_boolean';
      readonly field: PolicyCouplingMalwareBooleanField;
      readonly value: boolean;
    }
  | { readonly kind: 'behavior_reputation_service'; readonly value: boolean }
  | {
      readonly kind: 'popup_enabled';
      readonly protection: PolicyCouplingProtection;
      readonly value: boolean;
    }
  | { readonly kind: 'linux_session_data'; readonly value: boolean }
  | { readonly kind: 'linux_tty_io'; readonly value: boolean }
  | { readonly kind: 'generic'; readonly value: unknown };

export const classifySetFieldValue = (path: string, value: unknown): ClassifiedSetFieldValue => {
  const entry = getFieldRegistryEntry(path);
  if (entry === undefined || !isWritablePath(entry)) return { kind: 'generic', value };
  const protection = protectionModeOf(path);
  if (protection)
    return {
      kind: 'protection_mode',
      protection,
      value: enumValues(Object.values(ProtectionModes))(path, value),
    };
  if (path === 'windows.antivirus_registration.mode') {
    return {
      kind: 'antivirus_registration_mode',
      value: enumValues(Object.values(AntivirusRegistrationModes))(path, value),
    };
  }
  const deviceField = deviceControlFieldOf(path);
  if (deviceField === 'enabled')
    return { kind: 'device_control_enabled', value: assertBoolean(path, value) };
  if (deviceField === 'usb_storage') {
    return {
      kind: 'device_control_usb_storage',
      value: enumValues(Object.values(DeviceControlAccessLevel))(path, value),
    };
  }
  const popupProtection = popupProtectionOf(path);
  if (popupProtection)
    return {
      kind: 'popup_enabled',
      protection: popupProtection,
      value: assertBoolean(path, value),
    };
  const malwareField = malwareBooleanFieldOf(path);
  if (malwareField)
    return { kind: 'malware_boolean', field: malwareField, value: assertBoolean(path, value) };
  if (path.endsWith('.behavior_protection.reputation_service')) {
    return { kind: 'behavior_reputation_service', value: assertBoolean(path, value) };
  }
  if (path === 'linux.events.session_data')
    return { kind: 'linux_session_data', value: assertBoolean(path, value) };
  if (path === 'linux.events.tty_io')
    return { kind: 'linux_tty_io', value: assertBoolean(path, value) };
  if (entry.defaultValue !== undefined && typeof value !== typeof entry.defaultValue) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.invalid_input,
      invalidSetFieldValueMessage(path)
    );
  }
  return { kind: 'generic', value };
};

export const isDeviceControlEnabledPath = (path: string): boolean =>
  deviceControlFieldOf(path) === 'enabled';
export const isDeviceControlUsbPath = (path: string): boolean =>
  deviceControlFieldOf(path) === 'usb_storage';
export const isDevicePopupEnabledPath = (path: string): boolean =>
  /^(windows|mac)\.popup\.device_control\.enabled$/.test(path);
