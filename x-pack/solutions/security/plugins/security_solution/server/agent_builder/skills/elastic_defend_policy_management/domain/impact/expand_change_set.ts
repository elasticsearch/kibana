/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get } from 'lodash';
import { set } from '@kbn/safer-lodash-set';
import type { PolicyConfig } from '../../../../../../common/endpoint/types';
import { ProtectionModes } from '../../../../../../common/endpoint/types';
import {
  getPolicyProtectionsReference,
  POLICY_COUPLING_MALWARE_BOOLEAN_FIELDS,
  type PolicyCouplingProtection,
} from '../../../../../../common/endpoint/models/policy_config_helpers';
import * as helpers from '../../../../../../common/endpoint/models/policy_config_helpers';
import * as fieldRegistry from '../field_registry';
import { policyValuesEqual } from '../policy_value_equality';
import type { ClassifiedSetFieldValue } from './validate_set_field_value';
import {
  classifySetFieldValue,
  isDeviceControlEnabledPath,
  isDeviceControlUsbPath,
  isDevicePopupEnabledPath,
} from './validate_set_field_value';
import type {
  ExplicitPolicyChange,
  PolicyChangeOperation,
  PreparedPolicyChangeSet,
} from './policy_change_operation';
import {
  DEVICE_CONTROL_MISSING_POPUP_MESSAGE,
  DEVICE_POPUP_ENABLED_UNSUPPORTED_MESSAGE,
  POLICY_CHANGE_PREPARATION_ERROR_CODE,
  PolicyChangePreparationError,
  nonWritablePathMessage,
  unknownCurrentValueMessage,
} from './policy_change_operation';

interface Evidence {
  readonly operation: PolicyChangeOperation;
  readonly index: number;
  readonly target: ClassifiedSetFieldValue | undefined;
  readonly patch: Array<{ path: string; from: unknown; to: unknown }>;
  readonly primary: readonly string[];
  readonly semantic: string | undefined;
}

const protectionReference = (protection: PolicyCouplingProtection) =>
  getPolicyProtectionsReference().find(({ keyPath }) => keyPath === `${protection}.mode`);

const pathProtection = (path: string): string | undefined => {
  const reference = getPolicyProtectionsReference().find(({ keyPath, osList }) =>
    osList.some((os) => path === `${os}.${keyPath}`)
  );
  const protection = reference?.keyPath.split('.')[0];
  return protection &&
    ['malware', 'ransomware', 'memory_protection', 'behavior_protection'].includes(protection)
    ? reference?.keyPath
    : undefined;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const leaves = (
  from: unknown,
  to: unknown,
  path = ''
): Array<{ path: string; from: unknown; to: unknown }> => {
  if (policyValuesEqual(from, to)) return [];
  if (isObject(from) && isObject(to)) {
    return [...new Set([...Object.keys(from), ...Object.keys(to)])].flatMap((key) =>
      leaves(from[key], to[key], path ? `${path}.${key}` : key)
    );
  }
  if (isObject(from))
    return Object.keys(from).flatMap((key) =>
      leaves(from[key], undefined, path ? `${path}.${key}` : key)
    );
  if (isObject(to))
    return Object.keys(to).flatMap((key) =>
      leaves(undefined, to[key], path ? `${path}.${key}` : key)
    );
  return [{ path, from, to }];
};

const assertWritable = (path: string): void => {
  const entry = fieldRegistry.getFieldRegistryEntry(path);
  if (!entry || !fieldRegistry.isWritablePath(entry)) {
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.non_writable_path,
      nonWritablePathMessage(path)
    );
  }
};

const hasPopup = (policy: PolicyConfig): boolean =>
  policy.windows.popup.device_control != null && policy.mac.popup.device_control != null;

const primaryTargets = (operation: PolicyChangeOperation): readonly string[] => {
  if (operation.op !== 'set_field') {
    const reference = protectionReference(operation.protection);
    return reference ? reference.osList.map((os) => `${os}.${operation.protection}.mode`) : [];
  }
  return [operation.path];
};

const semanticIdentity = (operation: PolicyChangeOperation): string | undefined =>
  operation.op === 'set_field' ? pathProtection(operation.path) : `${operation.protection}.mode`;

const protectionModeIntent = (evidence: Evidence): ProtectionModes | undefined => {
  const { operation, target } = evidence;
  if (operation.op === 'set_protection_enabled') {
    return operation.enabled ? ProtectionModes.prevent : ProtectionModes.off;
  }
  if (operation.op === 'set_protection_level') {
    return operation.mode;
  }
  return target?.kind === 'protection_mode' ? target.value : undefined;
};

const involvesDeviceControl = (evidence: Evidence): boolean =>
  evidence.operation.op === 'set_field' &&
  (isDeviceControlEnabledPath(evidence.operation.path) ||
    isDeviceControlUsbPath(evidence.operation.path));

const dispatch = (
  policy: PolicyConfig,
  operation: PolicyChangeOperation,
  classified?: ClassifiedSetFieldValue
): void => {
  if (operation.op === 'set_protection_enabled' || operation.op === 'set_protection_level') {
    const protection = operation.protection;
    const reference = protectionReference(protection);
    if (!reference)
      throw new PolicyChangePreparationError(
        POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
        `Unknown protection: ${protection}`
      );
    const mode =
      operation.op === 'set_protection_enabled'
        ? operation.enabled
          ? ProtectionModes.prevent
          : ProtectionModes.off
        : operation.mode;
    helpers.setProtectionModeAndPopup({
      policy,
      protection,
      osList: reference.osList,
      mode,
      syncPopupEnabled: true,
      popupEnabled: mode === ProtectionModes.prevent,
    });
    if (operation.op === 'set_protection_enabled' && protection === 'malware') {
      for (const field of POLICY_COUPLING_MALWARE_BOOLEAN_FIELDS)
        helpers.setMalwareBoolean(policy, field, operation.enabled, reference.osList);
    }
    if (operation.op === 'set_protection_enabled' && protection === 'behavior_protection')
      helpers.setBehaviorReputationService(policy, mode !== ProtectionModes.off);
    return;
  }
  const target = classified ?? classifySetFieldValue(operation.path, operation.value);
  switch (target.kind) {
    case 'protection_mode': {
      const reference = protectionReference(target.protection);
      if (!reference)
        throw new PolicyChangePreparationError(
          POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
          `Unknown protection: ${target.protection}`
        );
      const os = operation.path.split('.')[0];
      const osList = reference.osList.filter((candidate) => candidate === os);
      if (osList.length === 0) {
        set(policy, operation.path, target.value);
        break;
      }
      helpers.setProtectionModeAndPopup({
        policy,
        protection: target.protection,
        osList,
        mode: target.value,
        syncPopupEnabled: false,
        popupEnabled: false,
      });
      break;
    }
    case 'device_control_enabled':
      helpers.setDeviceControlSwitch(policy, target.value);
      break;
    case 'device_control_usb_storage':
      helpers.setDeviceControlUsbStorage(policy, target.value);
      break;
    case 'linux_session_data':
      policy.linux.events.session_data = target.value;
      helpers.constrainLinuxTtyIo(policy);
      break;
    case 'linux_tty_io':
      policy.linux.events.tty_io = target.value;
      break;
    case 'popup_enabled': {
      const reference = protectionReference(target.protection);
      if (reference)
        helpers.setPopupEnabled(policy, target.protection, reference.osList, target.value);
      break;
    }
    case 'malware_boolean': {
      const reference = protectionReference('malware');
      if (reference)
        helpers.setMalwareBoolean(policy, target.field, target.value, reference.osList);
      break;
    }
    case 'behavior_reputation_service':
      helpers.setBehaviorReputationService(policy, target.value);
      break;
    default:
      set(policy, operation.path, operation.value);
  }
};

const validateOperation = (
  operation: PolicyChangeOperation,
  current: PolicyConfig
): ClassifiedSetFieldValue | undefined => {
  if (operation.op !== 'set_field') return undefined;
  if (isDevicePopupEnabledPath(operation.path))
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
      DEVICE_POPUP_ENABLED_UNSUPPORTED_MESSAGE
    );
  assertWritable(operation.path);
  if (get(current, operation.path) === undefined)
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.unknown_current_value,
      unknownCurrentValueMessage(operation.path)
    );
  if (isDeviceControlEnabledPath(operation.path) && !hasPopup(current))
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
      DEVICE_CONTROL_MISSING_POPUP_MESSAGE
    );
  return classifySetFieldValue(operation.path, operation.value);
};

const coupledFieldConflict = (identity: string): PolicyChangePreparationError =>
  new PolicyChangePreparationError(
    POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
    `Conflicting values for coupled policy field: ${identity}`
  );

const assertPairHasNoCoupledConflict = (
  first: Evidence | undefined,
  second: Evidence | undefined
): void => {
  if (!first || !second) return;
  const sameRequestedPath =
    first.operation.op === 'set_field' &&
    second.operation.op === 'set_field' &&
    first.operation.path === second.operation.path;
  if (sameRequestedPath) return;
  if (first.semantic !== undefined && first.semantic === second.semantic) {
    const firstValue = protectionModeIntent(first);
    const secondValue = protectionModeIntent(second);
    if (
      firstValue !== undefined &&
      secondValue !== undefined &&
      !Object.is(firstValue, secondValue)
    )
      throw coupledFieldConflict(first.semantic);
    return;
  }
  if (involvesDeviceControl(first) || involvesDeviceControl(second)) return;
  for (const a of first.patch)
    for (const b of second.patch) {
      const bothCoupled = !first.primary.includes(a.path) && !second.primary.includes(b.path);
      if (a.path === b.path && bothCoupled && !Object.is(a.to, b.to))
        throw coupledFieldConflict(a.path);
    }
};

const assertNoCoupledConflicts = (evidence: readonly Evidence[]): void => {
  for (let left = 0; left < evidence.length; left++)
    for (let right = left + 1; right < evidence.length; right++)
      assertPairHasNoCoupledConflict(evidence[left], evidence[right]);
};

const assertFinalState = (proposal: PolicyConfig): void => {
  if (proposal.linux.events.session_data === false && proposal.linux.events.tty_io === true)
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
      'Linux tty_io cannot be enabled while session_data is disabled.'
    );
};

export const expandChangeSet = (
  operations: readonly PolicyChangeOperation[],
  currentConfig: PolicyConfig
): PreparedPolicyChangeSet => {
  const classified = operations.map((operation) => ({
    operation,
    target: validateOperation(operation, currentConfig),
  }));

  const proposal = structuredClone(currentConfig);
  const origins = new Map<string, ExplicitPolicyChange['origin']>();

  const recordOrigins = (
    evidenceOperation: PolicyChangeOperation,
    index: number,
    primary: readonly string[],
    patch: Array<{ path: string; from: unknown; to: unknown }>
  ): void => {
    for (const change of patch)
      origins.set(change.path, {
        operationIndex: index,
        op: evidenceOperation.op,
        kind: primary.includes(change.path) ? ('direct' as const) : ('coupled' as const),
      });
  };

  const evidence: Evidence[] = classified.map(({ operation, target }, index) => {
    const before = structuredClone(proposal);
    dispatch(proposal, operation, target);
    const patch = leaves(before, proposal);
    const primary = primaryTargets(operation);
    recordOrigins(operation, index, primary, patch);
    return { operation, index, target, patch, primary, semantic: semanticIdentity(operation) };
  });

  const latestExactPathIndex = new Map<string, number>();
  for (const item of evidence) {
    if (item.operation.op === 'set_field')
      latestExactPathIndex.set(item.operation.path, item.index);
  }
  assertNoCoupledConflicts(
    evidence.filter(
      (item) =>
        item.operation.op !== 'set_field' ||
        latestExactPathIndex.get(item.operation.path) === item.index
    )
  );

  const intents = new Map<
    string,
    {
      operation: Extract<PolicyChangeOperation, { op: 'set_field' }>;
      target: ClassifiedSetFieldValue;
      index: number;
    }
  >();
  classified.forEach(({ operation, target }, index) => {
    if (operation.op !== 'set_field' || target === undefined) return;
    intents.set(operation.path, { operation, target, index });
  });

  let converged = false;
  for (let pass = 0; pass <= intents.size && !converged; pass++) {
    converged = true;
    for (const [path, intent] of intents) {
      const satisfied = policyValuesEqual(get(proposal, path), intent.operation.value);
      if (!satisfied) {
        converged = false;
        const before = structuredClone(proposal);
        dispatch(proposal, intent.operation, intent.target);
        recordOrigins(
          intent.operation,
          intent.index,
          [intent.operation.path],
          leaves(before, proposal)
        );
      }
    }
  }
  if (!converged) {
    const path = intents.keys().next().value ?? 'unknown';
    throw new PolicyChangePreparationError(
      POLICY_CHANGE_PREPARATION_ERROR_CODE.unsupported_operation,
      `Conflicting values for coupled policy field: ${path}`
    );
  }

  assertFinalState(proposal);

  const explicitChanges = leaves(currentConfig, proposal).map((change) => {
    const origin = origins.get(change.path);
    if (!origin)
      throw new PolicyChangePreparationError(
        POLICY_CHANGE_PREPARATION_ERROR_CODE.non_writable_path,
        nonWritablePathMessage(change.path)
      );
    return { ...change, origin };
  });

  return {
    operations,
    preparedOperations: evidence.map(({ operation, index, patch, primary, semantic }) => ({
      requested: operation,
      originIndex: index,
      primaryTargets: primary,
      ...(semantic ? { semanticIdentity: semantic } : {}),
      observedPatch: patch,
    })),
    proposedConfig: proposal,
    explicitChanges,
  };
};
