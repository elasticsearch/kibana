/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';

import type { ExperimentalIndexingFeature } from '../../../../common/types';

import { PACKAGES_SAVED_OBJECT_TYPE } from '../../../constants';
import type { Installation, UpdatePackageRequestSchema } from '../../../types';
import { PackageNotFoundError } from '../../../errors';

import { auditLoggingService } from '../../audit_logging';

import { getInstallationObject, getPackageInfo } from './get';

export interface NamespaceCustomizationDiff {
  addedNamespaces: string[];
  removedNamespaces: string[];
}

export interface IlmPolicyChange {
  namespace: string;
  ilmPolicy: string | undefined;
}

export async function updatePackage(
  options: {
    savedObjectsClient: SavedObjectsClientContract;
    pkgName: string;
    keepPoliciesUpToDate?: boolean;
  } & TypeOf<typeof UpdatePackageRequestSchema.body>
): Promise<{
  packageInfo: Awaited<ReturnType<typeof getPackageInfo>>;
  namespaceCustomizationDiff: NamespaceCustomizationDiff;
  ilmPolicyChanges: IlmPolicyChange[];
}> {
  const {
    savedObjectsClient,
    pkgName,
    keepPoliciesUpToDate,
    namespace_customization_enabled_for: newNamespaceCustomization,
    namespace_customization_settings: newNamespaceCustomizationSettings,
  } = options;
  const installedPackage = await getInstallationObject({ savedObjectsClient, pkgName });

  if (!installedPackage) {
    throw new PackageNotFoundError(`Error while updating package: ${pkgName} is not installed`);
  }

  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: installedPackage.id,
    name: installedPackage.attributes.name,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  const updateAttrs: Partial<Installation> = {};
  const namespaceCustomizationDiff: NamespaceCustomizationDiff = {
    addedNamespaces: [],
    removedNamespaces: [],
  };
  const ilmPolicyChanges: IlmPolicyChange[] = [];

  if (keepPoliciesUpToDate !== undefined) {
    updateAttrs.keep_policies_up_to_date = keepPoliciesUpToDate;
    if (keepPoliciesUpToDate === false) {
      updateAttrs.pending_upgrade_review = undefined;
    }
  }

  if (newNamespaceCustomization) {
    const oldList = installedPackage.attributes.namespace_customization_enabled_for ?? [];
    const newList = [...new Set(newNamespaceCustomization)];
    namespaceCustomizationDiff.addedNamespaces = newList.filter((ns) => !oldList.includes(ns));
    namespaceCustomizationDiff.removedNamespaces = oldList.filter((ns) => !newList.includes(ns));
    updateAttrs.namespace_customization_enabled_for = newList;

    // When a namespace is opted out, automatically clear its ILM policy setting.
    if (namespaceCustomizationDiff.removedNamespaces.length > 0) {
      const currentSettings = installedPackage.attributes.namespace_customization_settings ?? {};
      const patchedSettings = { ...currentSettings };
      for (const ns of namespaceCustomizationDiff.removedNamespaces) {
        if (patchedSettings[ns]?.ilm_policy) {
          ilmPolicyChanges.push({ namespace: ns, ilmPolicy: undefined });
          const { ilm_policy: _removed, ...rest } = patchedSettings[ns];
          if (Object.keys(rest).length > 0) {
            patchedSettings[ns] = rest;
          } else {
            delete patchedSettings[ns];
          }
        }
      }
      if (ilmPolicyChanges.length > 0) {
        updateAttrs.namespace_customization_settings = patchedSettings;
      }
    }
  }

  if (newNamespaceCustomizationSettings) {
    const oldSettings = installedPackage.attributes.namespace_customization_settings ?? {};
    for (const [namespace, newNsSettings] of Object.entries(newNamespaceCustomizationSettings)) {
      const oldIlmPolicy = oldSettings[namespace]?.ilm_policy;
      const newIlmPolicy = newNsSettings.ilm_policy;
      if (oldIlmPolicy !== newIlmPolicy) {
        ilmPolicyChanges.push({ namespace, ilmPolicy: newIlmPolicy });
      }
    }
    updateAttrs.namespace_customization_settings = newNamespaceCustomizationSettings;
  }

  await savedObjectsClient.update<Installation>(
    PACKAGES_SAVED_OBJECT_TYPE,
    installedPackage.id,
    updateAttrs
  );

  const packageInfo = await getPackageInfo({
    savedObjectsClient,
    pkgName,
    pkgVersion: installedPackage.attributes.version,
  });

  return { packageInfo, namespaceCustomizationDiff, ilmPolicyChanges };
}

export async function reviewUpgrade(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  action: 'accept' | 'decline' | 'pending';
  targetVersion: string;
}) {
  const { savedObjectsClient, pkgName, action: userAction, targetVersion } = options;
  const installedPackage = await getInstallationObject({ savedObjectsClient, pkgName });

  if (!installedPackage) {
    throw new PackageNotFoundError(`Error while reviewing upgrade: ${pkgName} is not installed`);
  }

  const review = installedPackage.attributes.pending_upgrade_review;
  if (!review || review.target_version !== targetVersion) {
    throw new PackageNotFoundError(`No pending upgrade review for ${pkgName}@${targetVersion}`);
  }

  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: installedPackage.id,
    name: installedPackage.attributes.name,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  await savedObjectsClient.update<Installation>(PACKAGES_SAVED_OBJECT_TYPE, installedPackage.id, {
    pending_upgrade_review: {
      ...review,
      action: { accept: 'accepted', decline: 'declined', pending: 'pending' }[userAction] as
        | 'accepted'
        | 'declined'
        | 'pending',
    },
  });
}

export async function updateDatastreamExperimentalFeatures(
  savedObjectsClient: SavedObjectsClientContract,
  pkgName: string,
  dataStreamFeatureMapping: Array<{
    data_stream: string;
    features: Partial<Record<ExperimentalIndexingFeature, boolean>>;
  }>
) {
  auditLoggingService.writeCustomSoAuditLog({
    action: 'update',
    id: pkgName,
    name: pkgName,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  await savedObjectsClient.update<Installation>(
    PACKAGES_SAVED_OBJECT_TYPE,
    pkgName,
    {
      experimental_data_stream_features: dataStreamFeatureMapping,
    },
    { refresh: 'wait_for' }
  );
}
