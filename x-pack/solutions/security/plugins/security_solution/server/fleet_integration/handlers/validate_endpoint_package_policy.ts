/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment';

import type { NewPackagePolicyInput } from '@kbn/fleet-plugin/common';
import { EndpointIntegrationFleetError } from './errors';
import {
  classifyGlobalManifestVersion,
  isPinnedGlobalManifestVersion,
} from '../../../common/endpoint/utils/global_manifest_version';
import { DeviceControlAccessLevel } from '../../../common/endpoint/types';

export const validateEndpointPackagePolicy = (
  inputs: NewPackagePolicyInput[],
  operation: 'update' | 'create' = 'create'
) => {
  const input = inputs.find((i) => i.type === 'endpoint');

  // An elastic defend policy MUST have an input with expected policy and manifest data
  if (
    operation === 'update' &&
    (!input?.config?.policy?.value || !input?.config?.artifact_manifest?.value)
  ) {
    throw new EndpointIntegrationFleetError(
      `Invalid Elastic Defend security policy. 'inputs[0].config.policy.value' and 'inputs[0].config.artifact_manifest.value' are required.`
    );
  }

  // Validate global manifest versions
  if (input?.config?.policy?.value?.global_manifest_version) {
    const globalManifestVersion = input.config.policy.value.global_manifest_version;

    const manifestStatus = classifyGlobalManifestVersion(globalManifestVersion);
    if (isPinnedGlobalManifestVersion(manifestStatus)) {
      if (manifestStatus === 'invalid_format') {
        throw createManifestVersionError(
          'Invalid date format. Use "latest" or "YYYY-MM-DD" format. UTC time.'
        );
      }

      if (manifestStatus === 'too_old') {
        throw createManifestVersionError(
          'Global manifest version is too far in the past. Please use either "latest" or a date within the last 18 months. The earliest valid date is October 1, 2023, in UTC time.'
        );
      }

      if (manifestStatus === 'in_future') {
        const minAllowedDate = moment.utc().subtract(1, 'day');
        throw createManifestVersionError(
          `Global manifest version cannot be in the future. Latest selectable date is ${minAllowedDate.format(
            'MMMM DD, YYYY'
          )} UTC time.`
        );
      }
    }
  }

  // Validate device control notifications
  const policyValue = input?.config?.policy?.value;
  if (policyValue?.windows?.device_control || policyValue?.mac?.device_control) {
    const windowsAccessLevel = policyValue?.windows?.device_control?.usb_storage;
    const macAccessLevel = policyValue?.mac?.device_control?.usb_storage;
    const windowsNotificationEnabled = policyValue?.windows?.popup?.device_control?.enabled;
    const macNotificationEnabled = policyValue?.mac?.popup?.device_control?.enabled;

    if (
      windowsNotificationEnabled &&
      windowsAccessLevel &&
      windowsAccessLevel !== DeviceControlAccessLevel.deny_all
    ) {
      throw new EndpointIntegrationFleetError(
        `Device Control user notifications are only supported when USB storage access level is set to deny_all. Current Windows access level is "${windowsAccessLevel}". Please either set the access level to deny_all or disable user notifications.`
      );
    }

    if (
      macNotificationEnabled &&
      macAccessLevel &&
      macAccessLevel !== DeviceControlAccessLevel.deny_all
    ) {
      throw new EndpointIntegrationFleetError(
        `Device Control user notifications are only supported when USB storage access level is set to deny_all. Current Mac access level is "${macAccessLevel}". Please either set the access level to deny_all or disable user notifications.`
      );
    }
  }
};

const createManifestVersionError = (
  message: string
): Error & { statusCode?: number; apiPassThrough?: boolean } => {
  const manifestVersionError: Error & { statusCode?: number; apiPassThrough?: boolean } = new Error(
    message
  );
  manifestVersionError.statusCode = 400;
  manifestVersionError.apiPassThrough = true;
  return manifestVersionError;
};
