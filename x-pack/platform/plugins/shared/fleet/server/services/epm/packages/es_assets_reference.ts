/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import pRetry from 'p-retry';
import { uniqBy } from 'lodash';

import type { EsAssetReference, Installation } from '../../../types';

import { PACKAGES_SAVED_OBJECT_TYPE } from '../../../constants';
import { auditLoggingService } from '../../audit_logging';

/**
 * Utility function for updating the installed_es field of a package.
 * Uses optimistic concurrency control: re-reads the SO on every retry attempt so that
 * concurrent writers (e.g. the parallel Kibana-assets update) cannot have their additions
 * silently overwritten.
 */
export const updateEsAssetReferences = async (
  savedObjectsClient: SavedObjectsClientContract,
  pkgName: string,
  _currentAssets: EsAssetReference[],
  {
    assetsToAdd = [],
    assetsToRemove = [],
    refresh = false,
  }: {
    assetsToAdd?: EsAssetReference[];
    assetsToRemove?: EsAssetReference[];
    /**
     * Whether or not the update should force a refresh on the SO index.
     * Defaults to `false` for faster updates, should only be `wait_for` if the update needs to be queried back from ES
     * immediately.
     */
    refresh?: 'wait_for' | false;
  }
): Promise<EsAssetReference[]> => {
  const doUpdate = async () => {
    // Re-read on every attempt so a conflict retry picks up concurrent changes instead of
    // overwriting them with a stale payload.
    const so = await savedObjectsClient.get<Installation>(PACKAGES_SAVED_OBJECT_TYPE, pkgName);
    auditLoggingService.writeCustomSoAuditLog({
      action: 'get',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });

    const freshAssets = so.attributes.installed_es ?? [];

    const withAssetsRemoved = freshAssets.filter(
      ({ type, id }) =>
        !assetsToRemove.some(
          ({ type: removeType, id: removeId }) => removeType === type && removeId === id
        )
    );

    const deduplicatedAssets = uniqBy(
      [...withAssetsRemoved, ...assetsToAdd],
      ({ type, id }) => `${type}-${id}`
    );

    auditLoggingService.writeCustomSoAuditLog({
      action: 'update',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });

    const {
      attributes: { installed_es: updatedAssets },
    } = await savedObjectsClient.update<Installation>(
      PACKAGES_SAVED_OBJECT_TYPE,
      pkgName,
      { installed_es: deduplicatedAssets },
      { version: so.version, refresh }
    );

    return updatedAssets ?? [];
  };

  const onlyRetryConflictErrors = (err: Error) => {
    if (!SavedObjectsErrorHelpers.isConflictError(err)) {
      throw err;
    }
  };

  // Because Kibana assets are installed in parallel with ES assets, we almost always encounter
  // a conflict error due to https://github.com/elastic/kibana/issues/126240. Re-reading on each
  // retry (above) ensures concurrent adds are not lost.
  return pRetry(doUpdate, { retries: 5, onFailedAttempt: onlyRetryConflictErrors });
};
/**
 * Utility function for adding assets the installed_es field of a package
 * uses optimistic concurrency control to prevent missed updates
 */
export const optimisticallyAddEsAssetReferences = async (
  savedObjectsClient: SavedObjectsClientContract,
  pkgName: string,
  assetsToAdd: EsAssetReference[],
  esIndexPatterns?: Record<string, string>
): Promise<EsAssetReference[]> => {
  const addEsAssets = async () => {
    // TODO: Should this be replaced by a `get()` call from epm/get.ts?
    const so = await savedObjectsClient.get<Installation>(PACKAGES_SAVED_OBJECT_TYPE, pkgName);
    auditLoggingService.writeCustomSoAuditLog({
      action: 'get',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });

    const installedEs = so.attributes.installed_es ?? [];

    const deduplicatedAssets = uniqBy(
      [...assetsToAdd, ...installedEs],
      ({ type, id }) => `${type}-${id}`
    );

    const deduplicatedIndexPatterns = Object.assign(
      {},
      so.attributes.es_index_patterns ?? {},
      esIndexPatterns
    );

    auditLoggingService.writeCustomSoAuditLog({
      action: 'update',
      id: pkgName,
      name: pkgName,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });

    const {
      attributes: { installed_es: updatedAssets },
    } = await savedObjectsClient.update<Installation>(
      PACKAGES_SAVED_OBJECT_TYPE,
      pkgName,
      {
        installed_es: deduplicatedAssets,
        es_index_patterns: deduplicatedIndexPatterns,
      },
      {
        version: so.version,
      }
    );

    return updatedAssets ?? [];
  };

  const onlyRetryConflictErrors = (err: Error) => {
    if (!SavedObjectsErrorHelpers.isConflictError(err)) {
      throw err;
    }
  };

  return pRetry(addEsAssets, { retries: 10, onFailedAttempt: onlyRetryConflictErrors });
};
