/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import semverGt from 'semver/functions/gt';
import semverValid from 'semver/functions/valid';
import type { EpmPackageItem, RequestDeps } from './api';
import { getAllIntegrations, getInstalledPackages } from './api';
import { normalizeTitleName } from './helper_functions';

export type UploadPackageEvaluation =
  | { kind: 'ok' }
  | {
      kind: 'upgrade';
      packageName: string;
      installedVersion: string;
      zipVersion: string;
    }
  | {
      kind: 'error';
      reason: 'duplicate' | 'not_newer' | 'invalid_version' | 'automatic_import';
      packageName: string;
      installedVersion?: string;
      zipVersion?: string;
    };

interface AutoImportIntegrationName {
  integrationId: string;
  title: string;
}

const getInstalledVersion = (catalogItem: EpmPackageItem): string | undefined =>
  catalogItem.installationInfo?.version ?? catalogItem.version;

const compareCustomPackageVersion = (
  packageName: string,
  packageVersion: string | null | undefined,
  installedVersion: string | undefined
): UploadPackageEvaluation => {
  const zipVersion = packageVersion ?? undefined;

  if (
    !zipVersion ||
    !semverValid(zipVersion) ||
    !installedVersion ||
    !semverValid(installedVersion)
  ) {
    return {
      kind: 'error',
      reason: 'invalid_version',
      packageName,
      installedVersion,
      zipVersion,
    };
  }

  if (semverGt(zipVersion, installedVersion)) {
    return {
      kind: 'upgrade',
      packageName,
      installedVersion,
      zipVersion,
    };
  }

  return {
    kind: 'error',
    reason: 'not_newer',
    packageName,
    installedVersion,
    zipVersion,
  };
};

const hasAutoImportIntegration = (
  packageName: string,
  autoImportIntegrations: AutoImportIntegrationName[]
): boolean =>
  autoImportIntegrations.some(
    (integration) =>
      integration.integrationId === packageName ||
      normalizeTitleName(integration.title) === packageName
  );

export const evaluateUploadPackage = (
  packageName: string,
  packageVersion: string | null | undefined,
  catalogItems: EpmPackageItem[],
  autoImportIntegrations: AutoImportIntegrationName[]
): UploadPackageEvaluation => {
  if (hasAutoImportIntegration(packageName, autoImportIntegrations)) {
    return { kind: 'error', reason: 'automatic_import', packageName };
  }

  const catalogItem = catalogItems.find((pkg) => pkg.id === packageName);
  const isUploadedInstall = catalogItem?.installationInfo?.install_source === 'upload';

  if (isUploadedInstall && catalogItem) {
    return compareCustomPackageVersion(
      packageName,
      packageVersion,
      getInstalledVersion(catalogItem)
    );
  }

  if (catalogItem) {
    return { kind: 'error', reason: 'duplicate', packageName };
  }

  return { kind: 'ok' };
};

export const evaluateUploadedZipPackage = async (
  packageName: string,
  packageVersion: string | null,
  deps: RequestDeps
): Promise<UploadPackageEvaluation> => {
  const [packagesResponse, aiv2Integrations] = await Promise.all([
    getInstalledPackages(deps),
    getAllIntegrations(deps),
  ]);

  return evaluateUploadPackage(
    packageName,
    packageVersion,
    packagesResponse?.items ?? [],
    aiv2Integrations ?? []
  );
};
