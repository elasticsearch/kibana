/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApiServicesFixture } from '@kbn/scout';

/** Fleet packages required for ML data stream modules (apache_data_stream, nginx_data_stream). */
export const ML_DATA_STREAM_FLEET_PACKAGES = [
  { name: 'apache', version: '3.0.2' },
  { name: 'nginx', version: '3.2.2' },
] as const;

/**
 * Sets up Fleet and installs packages so ML data stream modules are registered.
 * Mirrors FTR `ml.testResources.setupFleet` + `installFleetPackage`.
 */
export async function setupFleetPackages(
  apiServices: Pick<ApiServicesFixture, 'fleet'>,
  packages: readonly { name: string; version: string }[] = ML_DATA_STREAM_FLEET_PACKAGES
): Promise<void> {
  await apiServices.fleet.internal.setup();

  for (const pkg of packages) {
    await apiServices.fleet.integration.installPackage(pkg.name, pkg.version, {
      force: true,
    });
  }
}

/**
 * Removes Fleet packages installed for ML data stream module tests.
 * Mirrors FTR `ml.testResources.removeFleetPackage`.
 */
export async function removeFleetPackages(
  apiServices: Pick<ApiServicesFixture, 'fleet'>,
  packages: readonly { name: string; version: string }[] = ML_DATA_STREAM_FLEET_PACKAGES
): Promise<void> {
  for (const pkg of packages) {
    await apiServices.fleet.integration.delete(pkg.name);
  }
}
