/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';

import type { IndexTemplate, IndexTemplateEntry, RegistryDataStream } from '../../../types';
import { ElasticsearchAssetType } from '../../../../common/types';
import { appContextService } from '../../app_context';
import {
  updateCurrentWriteIndices,
  generateNamespaceTemplateName,
} from '../elasticsearch/template/template';
import { deleteComponentTemplates } from '../elasticsearch/template/remove';
import { retryTransientEsErrors } from '../elasticsearch/retry';
import {
  getRegistryDataStreamAssetBaseName,
  dataStreamUsesOtelInput,
} from '../../../../common/services';
import { MAX_CONCURRENT_COMPONENT_TEMPLATES } from '../../../constants';
import { throwIfAborted } from '../../../tasks/utils';
import type { PackageInfo } from '../../../../common/types';

import { updateEsAssetReferences } from './es_assets_reference';
import { getInstalledPackageWithAssets, getInstallation } from './get';

function isOtelDataStream(
  dataStream: RegistryDataStream,
  packageInfo: Pick<PackageInfo, 'policy_templates'>
): boolean {
  const experimentalFeature = appContextService.getExperimentalFeatures();
  return (
    !!experimentalFeature?.enableOtelIntegrations &&
    dataStreamUsesOtelInput(packageInfo, dataStream)
  );
}

/**
 * Fetches a namespace index template from ES and strips read-only date properties.
 * Returns the cleaned template or undefined if not found.
 */
async function fetchNamespaceTemplate(
  esClient: ElasticsearchClient,
  templateName: string,
  abortController?: AbortController
): Promise<IndexTemplate | undefined> {
  const logger = appContextService.getLogger();
  let rawTemplate;
  try {
    const res = await esClient.indices.getIndexTemplate(
      { name: templateName },
      { signal: abortController?.signal }
    );
    rawTemplate = res.index_templates[0]?.index_template;
  } catch (err: unknown) {
    if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
      throw err;
    }
    logger.debug(`[syncIlmPolicy] namespace index template ${templateName} not found, skipping`);
    return undefined;
  }

  if (!rawTemplate) {
    return undefined;
  }

  const {
    created_date: _cd,
    created_date_millis: _cdm,
    modified_date: _md,
    modified_date_millis: _mdm,
    ...indexTemplate
  } = rawTemplate as IndexTemplate;

  return indexTemplate;
}

/**
 * Inserts `nsTemplateName` (the ILM component template) into `composed_of` after
 * `{namespace}@custom` and before `{templateName}@custom` (dataset-level). If already
 * present the array is returned unchanged.
 */
export function insertIlmComponentTemplate(
  composedOf: string[],
  namespace: string,
  templateName: string,
  nsTemplateName: string
): string[] {
  if (composedOf.includes(nsTemplateName)) {
    return composedOf;
  }

  const namespaceEntry = `${namespace}@custom`;
  const datasetEntry = `${templateName}@custom`;

  const namespaceIdx = composedOf.indexOf(namespaceEntry);
  const datasetIdx = composedOf.indexOf(datasetEntry);

  let insertAt: number;
  if (namespaceIdx !== -1) {
    insertAt = namespaceIdx + 1;
  } else if (datasetIdx !== -1) {
    insertAt = datasetIdx;
  } else {
    insertAt = composedOf.length;
  }

  const result = [...composedOf];
  result.splice(insertAt, 0, nsTemplateName);
  return result;
}

function removeIlmComponentTemplate(composedOf: string[], nsTemplateName: string): string[] {
  return composedOf.filter((t) => t !== nsTemplateName);
}

export interface SyncIlmPolicySummary {
  packageName: string;
  namespace: string;
  updatedTemplates: string[];
  removedTemplates: string[];
  skipped: boolean;
}

/**
 * Creates or removes Fleet-managed ILM component templates for a single
 * `(package, namespace)` pair and patches each namespace index template's
 * `composed_of` accordingly. Called from the `fleet:sync_ilm_policy` task.
 *
 * When `ilmPolicy` is a non-empty string the component templates are created or
 * updated.  When it is `undefined` or an empty string the component templates are
 * deleted and the references are removed from the namespace index templates.
 */
export async function syncIlmPolicy({
  soClient,
  esClient,
  packageName,
  namespace,
  ilmPolicy,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  namespace: string;
  ilmPolicy: string | undefined;
  abortController?: AbortController;
}): Promise<SyncIlmPolicySummary> {
  const logger = appContextService.getLogger();
  const summary: SyncIlmPolicySummary = {
    packageName,
    namespace,
    updatedTemplates: [],
    removedTemplates: [],
    skipped: false,
  };

  const installedPkg = await getInstalledPackageWithAssets({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  if (!installedPkg) {
    logger.debug(`[syncIlmPolicy] Package ${packageName} not installed, skipping`);
    summary.skipped = true;
    return summary;
  }

  const { packageInfo } = installedPkg;
  const dataStreams = packageInfo.data_streams ?? [];
  if (dataStreams.length === 0) {
    return summary;
  }

  const clearing = !ilmPolicy;

  if (clearing) {
    await syncClearIlmPolicy({
      soClient,
      esClient,
      packageName,
      packageInfo,
      dataStreams,
      namespace,
      summary,
      abortController,
    });
  } else {
    await syncSetIlmPolicy({
      soClient,
      esClient,
      packageName,
      packageInfo,
      dataStreams,
      namespace,
      ilmPolicy,
      summary,
      abortController,
    });
  }

  return summary;
}

async function syncSetIlmPolicy({
  soClient,
  esClient,
  packageName,
  packageInfo,
  dataStreams,
  namespace,
  ilmPolicy,
  summary,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  packageInfo: Pick<PackageInfo, 'policy_templates' | 'data_streams'>;
  dataStreams: RegistryDataStream[];
  namespace: string;
  ilmPolicy: string;
  summary: SyncIlmPolicySummary;
  abortController?: AbortController;
}) {
  const logger = appContextService.getLogger();
  const updatedIndexTemplates: IndexTemplateEntry[] = [];

  await pMap(
    dataStreams,
    async (dataStream) => {
      if (abortController) throwIfAborted(abortController);

      const isOtelInputType = isOtelDataStream(dataStream, packageInfo);
      const templateName = getRegistryDataStreamAssetBaseName(dataStream, isOtelInputType);
      const nsTemplateName = generateNamespaceTemplateName(templateName, namespace);

      // Create or update the ILM component template
      await retryTransientEsErrors(
        () =>
          esClient.cluster.putComponentTemplate({
            name: nsTemplateName,
            template: {
              settings: {
                'index.lifecycle.name': ilmPolicy,
              },
            },
          }),
        { logger }
      );
      logger.debug(`[syncIlmPolicy] Created/updated ILM component template ${nsTemplateName}`);

      // Patch the namespace index template's composed_of to reference the component template
      const nsIndexTemplate = await fetchNamespaceTemplate(
        esClient,
        nsTemplateName,
        abortController
      );
      if (!nsIndexTemplate) {
        logger.debug(
          `[syncIlmPolicy] Namespace index template ${nsTemplateName} not found, component template created but composed_of not patched`
        );
        return;
      }

      const patchedComposedOf = insertIlmComponentTemplate(
        nsIndexTemplate.composed_of ?? [],
        namespace,
        templateName,
        nsTemplateName
      );
      if (patchedComposedOf !== nsIndexTemplate.composed_of) {
        const {
          created_date: _cd,
          created_date_millis: _cdm,
          modified_date: _md,
          modified_date_millis: _mdm,
          ...templateBody
        } = nsIndexTemplate as IndexTemplate;
        await retryTransientEsErrors(
          () =>
            esClient.indices.putIndexTemplate({
              name: nsTemplateName,
              ...templateBody,
              composed_of: patchedComposedOf,
            }),
          { logger }
        );
      }

      updatedIndexTemplates.push({
        templateName: nsTemplateName,
        indexTemplate: { ...nsIndexTemplate, composed_of: patchedComposedOf },
      });
    },
    { concurrency: MAX_CONCURRENT_COMPONENT_TEMPLATES }
  );

  if (updatedIndexTemplates.length === 0) {
    return;
  }

  if (abortController) throwIfAborted(abortController);

  // Rollover existing data streams so new backing indices pick up the ILM policy
  try {
    await updateCurrentWriteIndices(esClient, logger, updatedIndexTemplates);
  } catch (err: unknown) {
    if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
      throw err;
    }
    logger.debug(`[syncIlmPolicy] No existing data streams to roll over for ${packageName}`);
  }

  // Track the new component templates in installed_es
  const freshInstallation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const assetsToAdd = updatedIndexTemplates.map(({ templateName }) => ({
    id: templateName,
    type: ElasticsearchAssetType.componentTemplate,
  }));
  await updateEsAssetReferences(soClient, packageName, freshInstallation?.installed_es ?? [], {
    assetsToAdd,
  });

  summary.updatedTemplates = updatedIndexTemplates.map(({ templateName }) => templateName);
}

async function syncClearIlmPolicy({
  soClient,
  esClient,
  packageName,
  packageInfo,
  dataStreams,
  namespace,
  summary,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  packageInfo: Pick<PackageInfo, 'policy_templates' | 'data_streams'>;
  dataStreams: RegistryDataStream[];
  namespace: string;
  summary: SyncIlmPolicySummary;
  abortController?: AbortController;
}) {
  const logger = appContextService.getLogger();
  const deletedTemplateNames: string[] = [];
  const patchedIndexTemplates: IndexTemplateEntry[] = [];

  await pMap(
    dataStreams,
    async (dataStream) => {
      if (abortController) throwIfAborted(abortController);

      const isOtelInputType = isOtelDataStream(dataStream, packageInfo);
      const templateName = getRegistryDataStreamAssetBaseName(dataStream, isOtelInputType);
      const nsTemplateName = generateNamespaceTemplateName(templateName, namespace);

      // Remove the ILM component template name from the namespace index template's composed_of
      const nsIndexTemplate = await fetchNamespaceTemplate(
        esClient,
        nsTemplateName,
        abortController
      );
      if (nsIndexTemplate) {
        const patchedComposedOf = removeIlmComponentTemplate(
          nsIndexTemplate.composed_of ?? [],
          nsTemplateName
        );
        if (patchedComposedOf.length !== (nsIndexTemplate.composed_of ?? []).length) {
          const {
            created_date: _cd,
            created_date_millis: _cdm,
            modified_date: _md,
            modified_date_millis: _mdm,
            ...templateBody
          } = nsIndexTemplate as IndexTemplate;
          await retryTransientEsErrors(
            () =>
              esClient.indices.putIndexTemplate({
                name: nsTemplateName,
                ...templateBody,
                composed_of: patchedComposedOf,
              }),
            { logger }
          );
          patchedIndexTemplates.push({
            templateName: nsTemplateName,
            indexTemplate: { ...nsIndexTemplate, composed_of: patchedComposedOf },
          });
        }
      }

      deletedTemplateNames.push(nsTemplateName);
    },
    { concurrency: MAX_CONCURRENT_COMPONENT_TEMPLATES }
  );

  if (deletedTemplateNames.length === 0) {
    return;
  }

  // Delete the ILM component templates
  await deleteComponentTemplates(esClient, deletedTemplateNames);

  if (abortController) throwIfAborted(abortController);

  // Rollover so the ILM policy no longer applies to new backing indices
  if (patchedIndexTemplates.length > 0) {
    try {
      await updateCurrentWriteIndices(esClient, logger, patchedIndexTemplates);
    } catch (err: unknown) {
      if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
        throw err;
      }
      logger.debug(`[syncIlmPolicy] No existing data streams to roll over for ${packageName}`);
    }
  }

  // Remove the component templates from installed_es tracking
  const freshInstallation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const assetsToRemove = deletedTemplateNames.map((id) => ({
    id,
    type: ElasticsearchAssetType.componentTemplate,
  }));
  await updateEsAssetReferences(soClient, packageName, freshInstallation?.installed_es ?? [], {
    assetsToRemove,
  });

  summary.removedTemplates = deletedTemplateNames;
}

/**
 * After a package is (re)installed, re-create ILM component templates for each
 * namespace that has an `ilm_policy` set in `Installation.namespace_customization_settings`.
 * Called alongside `handleNamespaceTemplateRestoreAfterPackageInstall` so ILM settings
 * survive reinstalls and upgrades.
 */
export async function handleIlmSettingsRestoreAfterPackageInstall({
  soClient,
  esClient,
  packageName,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
}) {
  const installation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const settings = installation?.namespace_customization_settings ?? {};
  const namespacesWithIlm = Object.entries(settings).filter(([, s]) => !!s.ilm_policy);
  if (namespacesWithIlm.length === 0) {
    return;
  }

  for (const [namespace, { ilm_policy: ilmPolicy }] of namespacesWithIlm) {
    await syncIlmPolicy({
      soClient,
      esClient,
      packageName,
      namespace,
      ilmPolicy,
    });
  }
}
