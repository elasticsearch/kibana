/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { get, isEqual } from 'lodash';
import {
  classifyGlobalManifestVersion,
  isPinnedGlobalManifestVersion,
  type GlobalManifestVersionStatus,
} from '../../../../../../common/endpoint/utils/global_manifest_version';
import type { PolicyConfig } from '../../../../../../common/endpoint/types';
import type {
  EligibilityContext,
  PathEligibility,
  PolicyAssessmentBlocker,
} from './policy_change_operation';

const ineligible = (reason: string): PathEligibility => ({
  eligible: false,
  reason,
});

const isLicenseUnconstrainedPath = (path: string): boolean =>
  path.endsWith('.device_control.usb_storage') ||
  path.endsWith('.behavior_protection.reputation_service');

const licenseReason = (
  path: string,
  context: EligibilityContext,
  proposedValue: unknown
): string => {
  if (isEqual(proposedValue, get(context.platinumStripped, path))) {
    return 'license_below_platinum';
  }
  if (isEqual(proposedValue, get(context.enterpriseStripped, path))) {
    return 'license_below_enterprise';
  }
  return 'license_insufficient';
};

const MANIFEST_STATUS_REASONS: Partial<Record<GlobalManifestVersionStatus, string>> = {
  invalid_format: 'global_manifest_version_invalid_format',
  too_old: 'global_manifest_version_too_old',
  in_future: 'global_manifest_version_in_future',
};

const pinnedManifestReason = (
  value: string,
  context: Pick<EligibilityContext, 'endpointProtectionUpdates'>
): string | undefined => {
  const status = classifyGlobalManifestVersion(value);
  if (!isPinnedGlobalManifestVersion(status)) {
    return undefined;
  }

  if (!context.endpointProtectionUpdates) {
    return 'endpoint_protection_updates_disabled';
  }

  return MANIFEST_STATUS_REASONS[status];
};

const GLOBAL_MANIFEST_VERSION_PATH = 'global_manifest_version';
const TTY_IO_PATH = 'linux.events.tty_io';
const SESSION_DATA_PATH = 'linux.events.session_data';

export const computeGlobalManifestBlockers = (
  proposedConfig: PolicyConfig,
  context: Pick<EligibilityContext, 'endpointProtectionUpdates'>
): readonly PolicyAssessmentBlocker[] => {
  const proposedValue = get(proposedConfig, GLOBAL_MANIFEST_VERSION_PATH);

  if (typeof proposedValue !== 'string') {
    return [];
  }

  const reason = pinnedManifestReason(proposedValue, context);
  if (reason !== undefined) {
    return [{ reason }];
  }

  return [];
};

export const computePathEligibility = (
  path: string,
  context: EligibilityContext
): PathEligibility => {
  const proposedValue = get(context.proposedConfig, path);

  if (
    !context.serverless &&
    !isLicenseUnconstrainedPath(path) &&
    !isEqual(proposedValue, get(context.licenseStripped, path))
  ) {
    return ineligible(licenseReason(path, context, proposedValue));
  }

  if (path === GLOBAL_MANIFEST_VERSION_PATH) {
    const [blocker] = computeGlobalManifestBlockers(context.proposedConfig, context);
    if (blocker !== undefined) {
      return ineligible(blocker.reason);
    }
  }

  if (
    path === TTY_IO_PATH &&
    proposedValue === true &&
    !get(context.proposedConfig, SESSION_DATA_PATH)
  ) {
    return ineligible('tty_io_requires_session_data');
  }

  if (
    path === SESSION_DATA_PATH &&
    proposedValue === true &&
    !get(context.proposedConfig, 'linux.events.process')
  ) {
    return ineligible('session_data_requires_process');
  }

  if (!isEqual(proposedValue, get(context.protectionsStripped, path))) {
    return ineligible('endpoint_policy_protections_disabled');
  }

  if (!isEqual(proposedValue, get(context.deviceControlStripped, path))) {
    return ineligible(context.deviceControlReason);
  }

  return { eligible: true };
};
