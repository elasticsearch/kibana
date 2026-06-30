/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import type { TypeOf } from '@kbn/config-schema';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import { FleetError, FleetNotFoundError } from '../../errors';
import { appContextService } from '../../services';
import {
  deleteKibanaAssetsAndReferencesForSpace,
  installKibanaAssetsAndReferences,
} from '../../services/epm/kibana/assets/install';
import {
  getInstallationObject,
  getInstalledPackageWithAssets,
} from '../../services/epm/packages/get';
import type {
  DeleteKibanaAssetsRequestSchema,
  FleetRequestHandler,
  InstallKibanaAssetsRequestSchema,
  InstallRuleAssetsRequestSchema,
} from '../../types';
import { createArchiveIteratorFromMap } from '../../services/epm/archive/archive_iterator';
import { stepCreateAlertingAssets } from '../../services/epm/packages/install_state_machine/steps/step_create_alerting_assets';

export async function checkIntegrationsAllPrivilegesForSpaces(
  request: KibanaRequest,
  spaceIds: string[]
) {
  const security = appContextService.getSecurity();
  const res = await security.authz.checkPrivilegesWithRequest(request).atSpaces(spaceIds, {
    kibana: [security.authz.actions.api.get(`integrations-all`)],
  });
  if (!res.hasAllRequested) {
    throw new FleetError(
      `No enough permissions to install assets in spaces ${spaceIds.join(', ')}`
    );
  }
}

export const installPackageKibanaAssetsHandler: FleetRequestHandler<
  TypeOf<typeof InstallKibanaAssetsRequestSchema.params>,
  undefined,
  TypeOf<typeof InstallKibanaAssetsRequestSchema.body>
> = async (context, request, response) => {
  const fleetContext = await context.fleet;
  const savedObjectsClient = fleetContext.internalSoClient;
  const logger = appContextService.getLogger();
  const spaceId = fleetContext.spaceId;
  const { pkgName, pkgVersion } = request.params;

  if (request.body?.space_ids) {
    await checkIntegrationsAllPrivilegesForSpaces(request, request.body?.space_ids);
  }

  const installedPkgWithAssets = await getInstalledPackageWithAssets({
    savedObjectsClient,
    pkgName,
    logger,
  });

  const installation = await getInstallationObject({
    pkgName,
    savedObjectsClient,
  });

  if (
    !installation ||
    !installedPkgWithAssets ||
    installedPkgWithAssets?.installation.version !== pkgVersion
  ) {
    throw new FleetNotFoundError('Requested version is not installed');
  }

  const { packageInfo } = installedPkgWithAssets;

  const spaceIds = request.body?.space_ids ?? [spaceId];

  for (const spaceToInstallId of spaceIds) {
    const spaceScopedClient = appContextService.getInternalUserSOClientForSpaceId(spaceToInstallId);
    const installAsAdditionalSpace =
      (installation.attributes.installed_kibana_space_id ?? DEFAULT_SPACE_ID) !== spaceToInstallId;

    const packageInstallContext = {
      packageInfo,
      paths: installedPkgWithAssets.paths,
      archiveIterator: createArchiveIteratorFromMap(installedPkgWithAssets.assetsMap),
    };

    await installKibanaAssetsAndReferences({
      savedObjectsClient: spaceScopedClient,
      logger,
      pkgName,
      pkgTitle: packageInfo.title,
      installAsAdditionalSpace,
      spaceId: spaceToInstallId,
      assetTags: installedPkgWithAssets.packageInfo?.asset_tags,
      installedPkg: installation,
      packageInstallContext,
    });

    await stepCreateAlertingAssets({
      logger,
      savedObjectsClient: spaceScopedClient,
      packageInstallContext,
      spaceId: spaceToInstallId,
      request,
      installAsAdditionalSpace,
    });
  }

  return response.ok({ body: { success: true } });
};

export const deletePackageKibanaAssetsHandler: FleetRequestHandler<
  TypeOf<typeof DeleteKibanaAssetsRequestSchema.params>,
  undefined
> = async (context, request, response) => {
  const fleetContext = await context.fleet;
  const savedObjectsClient = fleetContext.internalSoClient;
  const logger = appContextService.getLogger();
  const spaceId = fleetContext.spaceId;
  const { pkgName, pkgVersion } = request.params;

  const installation = await getInstallationObject({
    pkgName,
    savedObjectsClient,
  });

  if (!installation || installation.attributes.version !== pkgVersion) {
    throw new FleetNotFoundError('Version is not installed');
  }

  await deleteKibanaAssetsAndReferencesForSpace({
    savedObjectsClient,
    logger,
    pkgName,
    spaceId,
    installedPkg: installation,
  });

  return response.ok({ body: { success: true } });
};

export const installRuleAssetsHandler: FleetRequestHandler<
  TypeOf<typeof InstallRuleAssetsRequestSchema.params>,
  undefined,
  TypeOf<typeof InstallRuleAssetsRequestSchema.body>
> = async (context, request, response) => {
  const fleetContext = await context.fleet;
  const savedObjectsClient = fleetContext.internalSoClient;
  const logger = appContextService.getLogger();
  const spaceId = fleetContext.spaceId;
  const { pkgName, pkgVersion } = request.params;

  const installedPkgWithAssets = await getInstalledPackageWithAssets({
    savedObjectsClient,
    pkgName,
    logger,
  });

  const installation = await getInstallationObject({
    pkgName,
    savedObjectsClient,
  });

  if (
    !installation ||
    !installedPkgWithAssets ||
    installedPkgWithAssets?.installation.version !== pkgVersion
  ) {
    throw new FleetNotFoundError('Requested version is not installed');
  }

  const { packageInfo } = installedPkgWithAssets;

  const installAsAdditionalSpace =
    (installation.attributes.installed_kibana_space_id ?? DEFAULT_SPACE_ID) !== spaceId;

  const spaceScopedClient = installAsAdditionalSpace
    ? appContextService.getInternalUserSOClientForSpaceId(spaceId)
    : savedObjectsClient;

  const packageInstallContext = {
    packageInfo,
    paths: installedPkgWithAssets.paths,
    archiveIterator: createArchiveIteratorFromMap(installedPkgWithAssets.assetsMap),
  };

  // Ensure archive SO assets (including alerting_rule_template SOs) are present in this space
  // before attempting rule creation. Only required for secondary spaces that have not yet had
  // assets installed via the "Install Kibana assets" flow; the primary space already has them
  // from the original install, and reinstalling unconditionally would wipe and recreate all
  // Kibana assets (dashboards, visualizations, etc.) as an unintended side effect.
  if (installAsAdditionalSpace) {
    await installKibanaAssetsAndReferences({
      savedObjectsClient: spaceScopedClient,
      logger,
      pkgName,
      pkgTitle: packageInfo.title,
      installAsAdditionalSpace,
      spaceId,
      assetTags: installedPkgWithAssets.packageInfo?.asset_tags,
      installedPkg: installation,
      packageInstallContext,
    });
  }

  await stepCreateAlertingAssets({
    logger,
    savedObjectsClient: spaceScopedClient,
    packageInstallContext,
    spaceId,
    request,
    installAsAdditionalSpace,
  });

  return response.ok({ body: { success: true } });
};
