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
  generateNamespaceTemplateIndexPattern,
  getNamespaceTemplatePriority,
} from '../elasticsearch/template/template';
import { isUserSettingsTemplate } from '../elasticsearch/template/utils';
import { deleteComponentTemplates } from '../elasticsearch/template/remove';
import {
  getRegistryDataStreamAssetBaseName,
  dataStreamUsesOtelInput,
} from '../../../../common/services';
import { MAX_CONCURRENT_COMPONENT_TEMPLATES } from '../../../constants';
import { throwIfAborted } from '../../../tasks/utils';
import type { PackageInfo } from '../../../../common/types';

import { updateEsAssetReferences } from './es_assets_reference';
import { getInstalledPackageWithAssets, getInstallation } from './get';
import { handleIlmSettingsRestoreAfterPackageInstall } from './namespace_ilm_settings';

/**
 * Returns true if any of the data stream's streams effectively use the OTel collector input
 * type AND OTel integrations are enabled. Resolves named inputs so that a stream referencing
 * an input by name (e.g. `otel_logs`) is correctly identified as OTel when its backing input
 * has `type: otelcol`.
 */
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
 * Returns true if namespace-level customization is opted in for `namespace` on
 * the installed `packageName`. Reads the Installation saved object's
 * `namespace_customization_enabled_for` list.
 */
export async function isNamespaceCustomizationEnabledForPackage(
  soClient: SavedObjectsClientContract,
  packageName: string,
  namespace: string
): Promise<boolean> {
  const installation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  return !!installation?.namespace_customization_enabled_for?.includes(namespace);
}

/**
 * Inserts `<namespace>@custom` into a `composed_of` array at the correct position:
 *   - after the last package-level `@custom` (e.g. `system@custom`, no hyphen before `@custom`)
 *   - before the dataset-level `@custom` (e.g. `logs-system.application@custom`)
 *
 * If `<namespace>@custom` is already present, the array is returned unchanged.
 * This includes the case where a namespace name matches a package name (e.g.
 * namespace "nginx" for package "nginx") — the existing `nginx@custom` entry
 * already serves both the package-level and namespace-level roles, so no
 * duplicate is inserted.
 *
 * Used when building the `composed_of` for a namespace-scoped index template.
 */
export function insertNamespaceCustomTemplate(
  composedOf: string[],
  namespace: string,
  templateName: string
): string[] {
  const namespaceEntry = `${namespace}@custom`;
  if (composedOf.includes(namespaceEntry)) {
    return composedOf;
  }

  const datasetEntry = `${templateName}@custom`;
  // Package-level @custom: name contains no hyphen before `@custom`
  // e.g. "system@custom" matches, "logs@custom" matches
  // but "logs-system.application@custom" does NOT
  const isPackageLevelCustom = (name: string): boolean =>
    name.endsWith('@custom') && !name.slice(0, -7).includes('-');

  let insertAt: number;
  const datasetIdx = composedOf.indexOf(datasetEntry);

  if (datasetIdx !== -1) {
    // Insert immediately before the dataset-level entry
    insertAt = datasetIdx;
  } else {
    // Find the last package-level @custom entry and insert after it
    let lastPkgCustomIdx = -1;
    for (let i = 0; i < composedOf.length; i++) {
      if (isPackageLevelCustom(composedOf[i])) {
        lastPkgCustomIdx = i;
      }
    }
    insertAt = lastPkgCustomIdx !== -1 ? lastPkgCustomIdx + 1 : composedOf.length;
  }

  const result = [...composedOf];
  result.splice(insertAt, 0, namespaceEntry);
  return result;
}

/**
 * Fetches a base index template from ES and strips read-only date properties.
 * Returns the cleaned template or undefined if not found.
 */
async function fetchBaseTemplate(
  esClient: ElasticsearchClient,
  templateName: string,
  logContext: string,
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
    logger.debug(`[${logContext}] index template ${templateName} not found, skipping`);
    return undefined;
  }

  if (!rawTemplate) {
    return undefined;
  }

  // Strip system-managed date properties that cannot be set on PUT
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
 * Builds a namespace-scoped index template from a base template.
 * The namespace template has a more specific index pattern, higher priority,
 * and includes `<namespace>@custom` in its `composed_of`.
 */
function buildNamespaceTemplate({
  baseTemplate,
  dataStream,
  namespace,
  templateName,
  isOtelInputType,
}: {
  baseTemplate: IndexTemplate;
  dataStream: RegistryDataStream;
  namespace: string;
  templateName: string;
  isOtelInputType?: boolean;
}): { name: string; template: IndexTemplate } {
  const nsTemplateName = generateNamespaceTemplateName(templateName, namespace);
  const nsIndexPattern = generateNamespaceTemplateIndexPattern(
    dataStream,
    namespace,
    isOtelInputType
  );
  const nsPriority = getNamespaceTemplatePriority(dataStream);

  const composedOf = insertNamespaceCustomTemplate(
    [...(baseTemplate.composed_of ?? [])],
    namespace,
    templateName
  );

  const ignoreMissing = composedOf.filter(isUserSettingsTemplate);

  const nsTemplate: IndexTemplate = {
    ...baseTemplate,
    index_patterns: [nsIndexPattern],
    priority: nsPriority,
    composed_of: composedOf,
    ignore_missing_component_templates: ignoreMissing,
  };

  return { name: nsTemplateName, template: nsTemplate };
}

/**
 * Creates namespace-scoped index templates for every `(dataStream, namespace)` pair
 * and tracks them in `installed_es`. Returns the created template names.
 */
async function createNamespaceTemplatesForPackage({
  soClient,
  esClient,
  packageName,
  packageInfo,
  dataStreams,
  namespaces,
  logContext,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  packageInfo: Pick<PackageInfo, 'policy_templates'>;
  dataStreams: RegistryDataStream[];
  namespaces: string[];
  logContext: string;
  abortController?: AbortController;
}): Promise<string[]> {
  if (dataStreams.length === 0 || namespaces.length === 0) {
    return [];
  }
  const logger = appContextService.getLogger();
  const updatedIndexTemplates: IndexTemplateEntry[] = [];

  await pMap(
    dataStreams,
    async (dataStream) => {
      if (abortController) throwIfAborted(abortController);
      const isOtelInputType = isOtelDataStream(dataStream, packageInfo);
      const templateName = getRegistryDataStreamAssetBaseName(dataStream, isOtelInputType);
      const baseTemplate = await fetchBaseTemplate(
        esClient,
        templateName,
        logContext,
        abortController
      );
      if (!baseTemplate) return;

      for (const namespace of namespaces) {
        const { name: nsName, template: nsTemplate } = buildNamespaceTemplate({
          baseTemplate,
          dataStream,
          namespace,
          templateName,
          isOtelInputType,
        });

        await esClient.indices.putIndexTemplate(
          { name: nsName, ...nsTemplate },
          { signal: abortController?.signal }
        );
        updatedIndexTemplates.push({ templateName: nsName, indexTemplate: nsTemplate });
      }
    },
    { concurrency: MAX_CONCURRENT_COMPONENT_TEMPLATES }
  );

  if (updatedIndexTemplates.length === 0) {
    return [];
  }

  if (abortController) throwIfAborted(abortController);
  // A user can opt in a namespace before any data stream for that namespace exists
  // (no data has been ingested yet). In that case `getDataStream` 404s on the
  // namespace-scoped pattern; nothing to update, so just continue.
  try {
    await updateCurrentWriteIndices(esClient, logger, updatedIndexTemplates);
  } catch (err: unknown) {
    if ((err as { meta?: { statusCode?: number } })?.meta?.statusCode !== 404) {
      throw err;
    }
    logger.debug(`[${logContext}] no existing data streams to update for new namespace templates`);
  }

  const freshInstallation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const assetsToAdd = updatedIndexTemplates.map(({ templateName }) => ({
    id: templateName,
    type: ElasticsearchAssetType.indexTemplate,
  }));
  await updateEsAssetReferences(soClient, packageName, freshInstallation?.installed_es ?? [], {
    assetsToAdd,
  });

  return updatedIndexTemplates.map(({ templateName }) => templateName);
}

/**
 * Deletes namespace-scoped index templates for the given `(dataStream, namespace)`
 * pairs and removes them from `installed_es`. Returns the deleted template names.
 */
async function deleteNamespaceTemplatesForPackage({
  soClient,
  esClient,
  packageName,
  packageInfo,
  dataStreams,
  namespaces,
  logContext,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  packageInfo: Pick<PackageInfo, 'policy_templates'>;
  dataStreams: RegistryDataStream[];
  namespaces: string[];
  logContext: string;
  abortController?: AbortController;
}): Promise<string[]> {
  if (dataStreams.length === 0 || namespaces.length === 0) {
    return [];
  }
  const logger = appContextService.getLogger();
  const deleted: string[] = [];

  await pMap(
    dataStreams,
    async (dataStream) => {
      if (abortController) throwIfAborted(abortController);
      const templateName = getRegistryDataStreamAssetBaseName(
        dataStream,
        isOtelDataStream(dataStream, packageInfo)
      );
      for (const namespace of namespaces) {
        const nsName = generateNamespaceTemplateName(templateName, namespace);
        try {
          await esClient.indices.deleteIndexTemplate(
            { name: nsName },
            { ignore: [404], signal: abortController?.signal }
          );
          deleted.push(nsName);
        } catch (err: unknown) {
          logger.warn(
            `[${logContext}] Failed to delete namespace template ${nsName}: ${
              err instanceof Error ? err.message : String(err)
            }`
          );
        }
      }
    },
    { concurrency: MAX_CONCURRENT_COMPONENT_TEMPLATES }
  );

  if (deleted.length === 0) {
    return [];
  }

  // Also delete any Fleet-managed ILM component templates that share the same names.
  // These exist only for (data stream, namespace) pairs where an ILM policy was assigned,
  // so a 404 is expected and silently ignored.
  await deleteComponentTemplates(esClient, deleted);

  const freshInstallation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const assetsToRemove = [
    ...deleted.map((id) => ({ id, type: ElasticsearchAssetType.indexTemplate })),
    ...deleted.map((id) => ({ id, type: ElasticsearchAssetType.componentTemplate })),
  ];
  await updateEsAssetReferences(soClient, packageName, freshInstallation?.installed_es ?? [], {
    assetsToRemove,
  });

  return deleted;
}

// ---------------------------------------------------------------------------
// Package reinstall/upgrade hook
// ---------------------------------------------------------------------------

/**
 * After a package is (re)installed, rebuild the namespace-scoped index templates for
 * every namespace currently opted-in on the package (via
 * `Installation.namespace_customization_enabled_for`). Called from the state machine's
 * final step so namespace templates survive reinstalls and upgrades.
 *
 * On first install the opt-in list is empty, so this is a no-op.
 */
export async function handleNamespaceTemplateRestoreAfterPackageInstall({
  soClient,
  esClient,
  packageName,
  packageInfo,
  dataStreams,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  packageInfo: Pick<PackageInfo, 'policy_templates'>;
  dataStreams: RegistryDataStream[];
}) {
  if (dataStreams.length === 0) {
    return;
  }

  const installation = await getInstallation({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  const namespaces = installation?.namespace_customization_enabled_for ?? [];
  if (namespaces.length === 0) {
    return;
  }

  await createNamespaceTemplatesForPackage({
    soClient,
    esClient,
    packageName,
    packageInfo,
    dataStreams,
    namespaces,
    logContext: 'handleNamespaceTemplateRestoreAfterPackageInstall',
  });

  await handleIlmSettingsRestoreAfterPackageInstall({
    soClient,
    esClient,
    packageName,
  });
}

// ---------------------------------------------------------------------------
// syncNamespaceTemplates — opt-in driven, per-package
// ---------------------------------------------------------------------------

export interface SyncNamespaceTemplatesSummary {
  packageName: string;
  created: string[]; // namespace names for which templates were created
  removed: string[]; // namespace names for which templates were deleted
  skipped: boolean;
}

/**
 * Creates or deletes namespace-scoped index templates for a single package, driven
 * by additions to and removals from `Installation.namespace_customization_enabled_for`.
 *
 * Called from the `fleet:sync_namespace_templates` task after the Installation SO's
 * opt-in list has been updated by the API handler.
 */
export async function syncNamespaceTemplates({
  soClient,
  esClient,
  packageName,
  addedNamespaces,
  removedNamespaces,
  abortController,
}: {
  soClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  packageName: string;
  addedNamespaces: string[];
  removedNamespaces: string[];
  abortController?: AbortController;
}): Promise<SyncNamespaceTemplatesSummary> {
  const summary: SyncNamespaceTemplatesSummary = {
    packageName,
    created: [],
    removed: [],
    skipped: false,
  };
  if (addedNamespaces.length === 0 && removedNamespaces.length === 0) {
    return summary;
  }

  const installedPkg = await getInstalledPackageWithAssets({
    savedObjectsClient: soClient,
    pkgName: packageName,
  });
  if (!installedPkg) {
    appContextService
      .getLogger()
      .debug(`[syncNamespaceTemplates] Package ${packageName} not installed, skipping`);
    summary.skipped = true;
    return summary;
  }

  const { packageInfo } = installedPkg;
  const dataStreams = packageInfo.data_streams ?? [];
  if (dataStreams.length === 0) {
    return summary;
  }

  if (addedNamespaces.length > 0) {
    if (abortController) throwIfAborted(abortController);
    const createdTemplates = await createNamespaceTemplatesForPackage({
      soClient,
      esClient,
      packageName,
      packageInfo,
      dataStreams,
      namespaces: addedNamespaces,
      logContext: 'syncNamespaceTemplates',
      abortController,
    });
    if (createdTemplates.length > 0) {
      summary.created = addedNamespaces;
    }
  }

  if (removedNamespaces.length > 0) {
    if (abortController) throwIfAborted(abortController);
    const deletedTemplates = await deleteNamespaceTemplatesForPackage({
      soClient,
      esClient,
      packageName,
      packageInfo,
      dataStreams,
      namespaces: removedNamespaces,
      logContext: 'syncNamespaceTemplates',
      abortController,
    });
    if (deletedTemplates.length > 0) {
      summary.removed = removedNamespaces;
    }
  }

  return summary;
}
