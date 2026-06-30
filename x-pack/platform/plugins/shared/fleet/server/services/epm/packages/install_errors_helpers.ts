/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lt } from 'semver';

import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import type { SavedObjectsClientContract } from '@kbn/core/server';

import type { Logger } from '@kbn/core/server';

import type { InstallFailedAttempt, InstallSource, Installation } from '../../../types';
import { auditLoggingService } from '../../audit_logging';
import { PACKAGES_SAVED_OBJECT_TYPE } from '../../../constants';

import { getInstallationObject } from './get';

const MAX_ATTEMPTS_TO_KEEP = 5;

export function clearLatestFailedAttempts(
  installedVersion: string,
  latestAttempts: InstallFailedAttempt[] = []
) {
  return latestAttempts.filter((attempt) => lt(installedVersion, attempt.target_version));
}

export function addErrorToLatestFailedAttempts({
  error,
  createdAt,
  targetVersion,
  latestAttempts = [],
  missingAssets,
}: {
  createdAt: string;
  targetVersion: string;
  error: Error;
  latestAttempts?: InstallFailedAttempt[];
  missingAssets?: Array<{ id: string; type: string }>;
}): InstallFailedAttempt[] {
  const attempt: InstallFailedAttempt = {
    created_at: createdAt,
    target_version: targetVersion,
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
  };
  if (missingAssets && missingAssets.length > 0) {
    attempt.missing_assets = missingAssets;
  }
  return [attempt, ...latestAttempts].slice(0, MAX_ATTEMPTS_TO_KEEP);
}

export const createOrUpdateFailedInstallStatus = async ({
  logger,
  savedObjectsClient,
  pkgName,
  pkgVersion,
  error,
  installSource = 'registry',
}: {
  logger: Logger;
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  pkgVersion: string;
  error: Error;
  installSource?: InstallSource;
}) => {
  const installation = await getInstallationObject({
    pkgName,
    savedObjectsClient,
  });

  if (installation) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'update',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
    const latestInstallFailedAttempts = addErrorToLatestFailedAttempts({
      error,
      targetVersion: pkgVersion,
      createdAt: new Date().toISOString(),
      latestAttempts: installation?.attributes?.latest_install_failed_attempts,
    });

    try {
      return await savedObjectsClient.update(PACKAGES_SAVED_OBJECT_TYPE, pkgName, {
        latest_install_failed_attempts: latestInstallFailedAttempts,
      });
    } catch (err) {
      logger.warn(`Error occurred while updating installation failed attempts: ${err}`);
    }
  } else {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'create',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
    const installFailedAttempts = addErrorToLatestFailedAttempts({
      error,
      targetVersion: pkgVersion,
      createdAt: new Date().toISOString(),
      latestAttempts: [],
    });
    const savedObject: Installation = {
      installed_kibana: [],
      installed_es: [],
      package_assets: [],
      name: pkgName,
      version: pkgVersion,
      install_version: pkgVersion,
      install_status: 'install_failed',
      install_started_at: new Date().toISOString(),
      verification_status: 'unknown',
      latest_install_failed_attempts: installFailedAttempts,
      es_index_patterns: {},
      install_source: installSource,
    };
    try {
      return await savedObjectsClient.create<Installation>(
        PACKAGES_SAVED_OBJECT_TYPE,
        savedObject,
        {
          id: pkgName,
          overwrite: true,
        }
      );
    } catch (err) {
      if (!SavedObjectsErrorHelpers.isNotFoundError(err)) {
        logger.error(`Failed to create package installation: ${err}`);
      }
    }
  }
};
