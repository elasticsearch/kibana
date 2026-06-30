/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { RulesClientApi } from '@kbn/alerting-plugin/server/types';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import type { Logger, SavedObjectsClientContract } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';

import pMap from 'p-map';

import { FLEET_ELASTIC_AGENT_PACKAGE, FleetError } from '../../../../../../common';
import { type KibanaAssetReference, KibanaSavedObjectType } from '../../../../../../common/types';
import type { InstallablePackage } from '../../../../../../common/types';
import { appContextService } from '../../../../app_context';
import { withPackageSpan } from '../../utils';
import type { InstallContext } from '../_state_machine_package_install';
import type { ArchiveAsset } from '../../../kibana/assets/install';
import { getSpaceScopedAssetId } from '../../../kibana/assets/install';
import { saveKibanaAssetsRefs } from '../../install';
import { MAX_CONCURRENT_RULE_CREATION_OPERATIONS } from '../../../../../constants';
import { generateTemplateIndexPattern } from '../../../elasticsearch/template/template';

function getRuleId({
  pkgName,
  templateId,
  spaceId,
}: {
  pkgName: string;
  templateId: string;
  spaceId?: string;
}) {
  return `fleet-${spaceId ? spaceId : DEFAULT_SPACE_ID}-${pkgName}-${templateId}`;
}

export async function createAlertingRuleFromTemplate(
  deps: { rulesClient?: RulesClientApi; logger: InstallContext['logger'] },
  params: {
    alertTemplateArchiveAsset: ArchiveAsset;
    spaceId?: string;
    pkgName: string;
    installAsAdditionalSpace?: boolean;
  }
): Promise<KibanaAssetReference> {
  const { rulesClient, logger } = deps;
  const { pkgName, alertTemplateArchiveAsset, spaceId, installAsAdditionalSpace } = params;
  const ruleId = getRuleId({ pkgName, templateId: alertTemplateArchiveAsset.id, spaceId });
  try {
    if (!rulesClient) {
      throw new FleetError('Rules client is not available');
    }

    // When the package was installed in an additional space its alerting_rule_template SOs
    // were saved with a space-scoped hashed ID (originId = archive ID). Look up by that
    // hashed ID so the template can be found in this space.
    const templateLookupId =
      installAsAdditionalSpace && spaceId
        ? getSpaceScopedAssetId(alertTemplateArchiveAsset.id, spaceId)
        : alertTemplateArchiveAsset.id;

    const template = await rulesClient.getTemplate({ id: templateLookupId }).catch((err) => {
      if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
        return undefined;
      }
      throw err;
    });
    if (!template) {
      throw new FleetError(`Rule template ${alertTemplateArchiveAsset.id} not found`);
    }

    const rule = await rulesClient.get({ id: ruleId }).catch((err) => {
      if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
        return undefined;
      }
      throw err;
    });
    // Already created
    if (rule) {
      return {
        id: ruleId,
        type: KibanaSavedObjectType.alert,
        deferred: false,
      };
    }

    const { ruleTypeId, id: _id, ...rest } = template;

    logger.debug(`Creating rule: ${ruleId} for package ${pkgName}`);
    await rulesClient.create({
      data: {
        alertTypeId: ruleTypeId,
        ...rest,
        enabled: false,
        actions: [],
        consumer: 'alerts',
      }, // what value for consumer will make sense?
      options: { id: ruleId },
    });

    return {
      id: ruleId,
      type: KibanaSavedObjectType.alert,
      deferred: false,
    };
  } catch (e) {
    logger.error(`Error creating rule: ${ruleId} for package ${pkgName}`, { error: e });

    return {
      id: ruleId,
      type: KibanaSavedObjectType.alert,
      deferred: true,
    };
  }
}

function getInactivityMonitoringTemplateId(pkgName: string, spaceId?: string): string {
  const targetSpace = spaceId ?? DEFAULT_SPACE_ID;
  if (targetSpace === DEFAULT_SPACE_ID) {
    return `fleet-${pkgName}-inactivity-monitoring`;
  }
  return `fleet-${pkgName}-inactivity-monitoring-${targetSpace}`;
}

function getDataStreamPatterns(packageInfo: InstallablePackage): string[] {
  const { data_streams: dataStreams } = packageInfo;
  if (!dataStreams || dataStreams.length === 0) {
    return [];
  }
  return dataStreams.map((ds) => generateTemplateIndexPattern(ds));
}

export async function createInactivityMonitoringTemplate(
  deps: { logger: Logger; savedObjectsClient: SavedObjectsClientContract },
  params: {
    packageInfo: InstallablePackage;
    spaceId: string;
    installAsAdditionalSpace?: boolean;
  }
): Promise<KibanaAssetReference | undefined> {
  const { logger, savedObjectsClient } = deps;
  const { packageInfo, spaceId, installAsAdditionalSpace = false } = params;
  const { name: pkgName, title: pkgTitle } = packageInfo;

  if (!appContextService.getExperimentalFeatures().enableIntegrationInactivityAlerting) {
    return;
  }

  if (packageInfo.type !== 'integration') {
    return;
  }

  const dataStreamPatterns = getDataStreamPatterns(packageInfo);
  if (dataStreamPatterns.length === 0) {
    logger.debug(`Skipping inactivity monitoring template for ${pkgName}: no data streams defined`);
    return;
  }

  const templateId = getInactivityMonitoringTemplateId(pkgName, spaceId);
  const templateRef: KibanaAssetReference = {
    id: templateId,
    type: KibanaSavedObjectType.alertingRuleTemplate,
  };

  return withPackageSpan(`Create inactivity monitoring template for ${pkgName}`, async () => {
    try {
      // Always use explicit namespace scoping via asScopedToNamespace because
      // alerting_rule_template is a multiple-isolated SO type. Using an implicitly
      // scoped or unscoped client causes incorrect namespace resolution for get/create.
      const internalSoClient = appContextService
        .getInternalUserSOClient()
        .asScopedToNamespace(spaceId);

      // Check if the template already exists
      const existing = await internalSoClient
        .get<{ params?: Record<string, unknown> }>(
          KibanaSavedObjectType.alertingRuleTemplate,
          templateId
        )
        .catch((err) => {
          if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
            return undefined;
          }
          throw err;
        });

      if (existing) {
        logger.debug(
          `Inactivity monitoring template ${templateId} already exists for package ${pkgName}`
        );

        // Update index patterns if data streams have changed (e.g. on package upgrade)
        const existingParams = existing.attributes?.params;
        const existingIndexPatterns = (existingParams?.index as string[]) ?? [];
        const patternsChanged =
          dataStreamPatterns.length !== existingIndexPatterns.length ||
          dataStreamPatterns.some((p) => !existingIndexPatterns.includes(p));

        if (patternsChanged) {
          logger.debug(
            `Updating inactivity monitoring template ${templateId} for package ${pkgName}: data stream patterns changed`
          );
          await internalSoClient.update(KibanaSavedObjectType.alertingRuleTemplate, templateId, {
            params: {
              ...(existingParams ?? {}),
              index: dataStreamPatterns,
            },
          });
        }

        // Re-register the asset ref (it may have been overwritten by stepInstallKibanaAssets)
        await saveKibanaAssetsRefs(
          savedObjectsClient,
          pkgName,
          [templateRef],
          spaceId,
          installAsAdditionalSpace,
          true
        );
        return templateRef;
      }

      logger.debug(`Creating inactivity monitoring template ${templateId} for package ${pkgName}`);

      try {
        await internalSoClient.create(
          KibanaSavedObjectType.alertingRuleTemplate,
          {
            name: `[${pkgTitle}] Idle data streams`,
            ruleTypeId: '.es-query',
            tags: [pkgTitle],
            schedule: { interval: '24h' },
            params: {
              searchType: 'esQuery',
              esQuery: JSON.stringify({ query: { match_all: {} } }),
              index: dataStreamPatterns,
              timeField: '@timestamp',
              timeWindowSize: 24,
              timeWindowUnit: 'h',
              threshold: [1],
              thresholdComparator: '<',
              size: 0,
              aggType: 'count',
              groupBy: 'all',
              excludeHitsFromPreviousRun: true,
            },
          },
          { id: templateId }
        );
      } catch (createErr) {
        if (SavedObjectsErrorHelpers.isConflictError(createErr)) {
          logger.debug(
            `Inactivity monitoring template ${templateId} already exists for package ${pkgName} (conflict on create)`
          );
        } else {
          throw createErr;
        }
      }

      await saveKibanaAssetsRefs(
        savedObjectsClient,
        pkgName,
        [templateRef],
        spaceId,
        installAsAdditionalSpace,
        true
      );

      return templateRef;
    } catch (e) {
      logger.error(
        `Error creating inactivity monitoring template for package ${pkgName}: ${e.message}`,
        { error: e }
      );
      return;
    }
  });
}

export async function stepCreateAlertingAssets(
  context: Pick<
    InstallContext,
    | 'logger'
    | 'savedObjectsClient'
    | 'packageInstallContext'
    | 'spaceId'
    | 'request'
    | 'installedPkg'
  > & { installAsAdditionalSpace?: boolean }
) {
  const {
    logger,
    savedObjectsClient,
    packageInstallContext,
    spaceId,
    installAsAdditionalSpace: explicitInstallAsAdditionalSpace,
    installedPkg,
  } = context;

  // When called from the state machine the flag is not set on InstallContext; derive it from
  // the package's primary installation space so that secondary-space reinstalls save refs to
  // additional_spaces_installed_kibana instead of installed_kibana.
  const installAsAdditionalSpace =
    explicitInstallAsAdditionalSpace ??
    (installedPkg
      ? (installedPkg.attributes.installed_kibana_space_id ?? DEFAULT_SPACE_ID) !== spaceId
      : false);
  const { packageInfo } = packageInstallContext;
  const { name: pkgName } = packageInfo;

  // Create or re-create inactivity monitoring template for integration packages
  await createInactivityMonitoringTemplate(
    { logger, savedObjectsClient },
    { packageInfo, spaceId, installAsAdditionalSpace }
  );

  // When running from the primary space during a full reinstall, also recreate the inactivity
  // monitoring template for every registered secondary space. The archive-asset reinstall step
  // deletes the template SO (it is an alerting_rule_template hidden type) but does not recreate
  // it because it lives outside the package archive. stepCreateAlertingAssets is only invoked
  // once per install (for the primary space), so without this loop secondary spaces would be
  // left without their inactivity template after any primary-space reinstall.
  if (!installAsAdditionalSpace && installedPkg) {
    const primarySpaceId = installedPkg.attributes.installed_kibana_space_id ?? DEFAULT_SPACE_ID;
    for (const additionalSpaceId of Object.keys(
      installedPkg.attributes.additional_spaces_installed_kibana ?? {}
    ).filter((s) => s !== primarySpaceId)) {
      const spaceScopedClient =
        appContextService.getInternalUserSOClientForSpaceId(additionalSpaceId);
      await createInactivityMonitoringTemplate(
        { logger, savedObjectsClient: spaceScopedClient },
        { packageInfo, spaceId: additionalSpaceId, installAsAdditionalSpace: true }
      );
    }
  }

  // Create alerting rules templates from archive assets
  if (pkgName !== FLEET_ELASTIC_AGENT_PACKAGE) {
    return;
  }

  await withPackageSpan('Install elastic agent rules', async () => {
    const rulesClient = context.request
      ? await appContextService
          .getAlertingStart()
          ?.getRulesClientWithRequestInSpace(context.request, spaceId)
      : undefined;

    const alertTemplateAssets: ArchiveAsset[] = [];
    await packageInstallContext.archiveIterator.traverseEntries(
      async (entry) => {
        if (!entry.buffer) {
          return;
        }

        const alertTemplate = JSON.parse(entry.buffer.toString('utf8')) as ArchiveAsset;
        alertTemplateAssets.push(alertTemplate);
      },
      (path) => path.match(/\/alerting_rule_template\//) !== null
    );

    const assetRefs: KibanaAssetReference[] = [];
    await pMap(
      alertTemplateAssets,
      async (alertTemplate) => {
        const ref = await createAlertingRuleFromTemplate(
          { rulesClient, logger },
          { alertTemplateArchiveAsset: alertTemplate, spaceId, pkgName, installAsAdditionalSpace }
        );

        assetRefs.push(ref);
      },
      { concurrency: MAX_CONCURRENT_RULE_CREATION_OPERATIONS }
    );

    await saveKibanaAssetsRefs(
      savedObjectsClient,
      pkgName,
      assetRefs,
      spaceId,
      installAsAdditionalSpace ?? false,
      true,
      [KibanaSavedObjectType.alert]
    );
  });
}
