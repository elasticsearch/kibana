/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject } from '@kbn/core/server';

import { KibanaSavedObjectType } from '../../../../common/types';
import { installationStatuses } from '../../../../common/constants';
import { KibanaAssetType } from '../../../types';
import type { AssetType, Installable, Installation } from '../../../types';

export { bulkInstallPackages, isBulkInstallError } from './bulk_install_packages';
export {
  getCategories,
  getFile,
  getInstallationObject,
  getInstallation,
  getInstallations,
  getPackageInfo,
  getPackages,
  getInstalledPackages,
  getLimitedPackages,
  getPackageKnowledgeBase,
} from './get';

export { getBundledPackages } from './bundled_packages';
export { getBulkAssets } from './get_bulk_assets';
export { getTemplateInputs } from './get_template_inputs';

export type { BulkInstallResponse, IBulkInstallPackageError } from './install';
export { handleInstallPackageFailure, installPackage, ensureInstalledPackage } from './install';
export { reinstallPackageForInstallation } from './reinstall';
export { removeInstallation } from './remove';
export { updateCustomIntegration, incrementVersionAndUpdate } from './update_custom_integration';
export {
  handleNamespaceTemplateRestoreAfterPackageInstall,
  insertNamespaceCustomTemplate,
  isNamespaceCustomizationEnabledForPackage,
  syncNamespaceTemplates,
} from './namespace_datastream_templates';
export type { SyncNamespaceTemplatesSummary } from './namespace_datastream_templates';
export {
  handleIlmSettingsRestoreAfterPackageInstall,
  insertIlmComponentTemplate,
  syncIlmPolicy,
} from './namespace_ilm_settings';
export type { SyncIlmPolicySummary } from './namespace_ilm_settings';
export class PackageNotInstalledError extends Error {
  constructor(pkgkey: string) {
    super(`${pkgkey} is not installed`);
  }
}

// only Kibana Assets use Saved Objects at this point
export const savedObjectTypes: AssetType[] = Object.values(KibanaAssetType);
export const kibanaSavedObjectTypes: KibanaSavedObjectType[] = Object.values(KibanaSavedObjectType);
export function createInstallableFrom<T>(
  from: T,
  savedObject?: SavedObject<Installation>
): Installable<T> {
  return savedObject
    ? {
        ...from,
        status: savedObject.attributes.install_status,
        savedObject,
      }
    : {
        ...from,
        status: installationStatuses.NotInstalled,
      };
}
