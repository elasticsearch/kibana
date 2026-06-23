/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, SavedObjectsClientContract, Logger } from '@kbn/core/server';

import type { IndicesDataStream } from '@elastic/elasticsearch/lib/api/types';

import type {
  NewPackagePolicy,
  NewPackagePolicyInput,
  PackageInfo,
  PackagePolicy,
  RegistryDataStream,
} from '../../../types';
import {
  DATASET_VAR_NAME,
  DATA_STREAM_TYPE_VAR_NAME,
  FLEET_UNMANAGED_DATA_STREAM_TYPES,
  OTEL_COLLECTOR_INPUT_TYPE,
} from '../../../../common/constants';
import { PackagePolicyValidationError, PackageNotFoundError, FleetError } from '../../../errors';

import { dataStreamService } from '../..';

import * as Registry from '../registry';

import { createArchiveIteratorFromMap } from '../archive/archive_iterator';

import { getNormalizedDataStreams, hasDynamicSignalTypes } from '../../../../common/services';

import { generateESIndexPatterns } from '../elasticsearch/template/template';

import type { PackageInstallContext } from '../../../../common/types';

import { getInstallation, getInstalledPackageWithAssets } from './get';

import { installIndexTemplatesAndPipelines } from './install_index_template_pipeline';
import { optimisticallyAddEsAssetReferences } from './es_assets_reference';
import { cleanupAssets } from './remove';

export const getDatasetName = (packagePolicyInput: NewPackagePolicyInput[]): string =>
  packagePolicyInput[0].streams[0]?.vars?.[DATASET_VAR_NAME]?.value;

interface CustomDatasetStream {
  datasetName: string;
  dataStreamType: string;
  inputType: string;
  resolvedDataStream?: RegistryDataStream;
  originDataset?: string;
}

export const getCustomDatasetStreams = (
  packagePolicy: NewPackagePolicy | PackagePolicy,
  pkgInfo: PackageInfo
): CustomDatasetStream[] => {
  if (pkgInfo.type === 'input') {
    const datasetName = getDatasetName(packagePolicy.inputs);
    if (!datasetName) return [];

    const isDynamicSignalTypes = hasDynamicSignalTypes(pkgInfo);
    const signalTypes: string[] = (
      isDynamicSignalTypes
        ? ['logs', 'metrics', 'traces']
        : [
            packagePolicy.inputs[0].streams[0].vars?.[DATA_STREAM_TYPE_VAR_NAME]?.value ||
              packagePolicy.inputs[0].streams[0].data_stream?.type ||
              'logs',
          ]
    )
      // Fleet does not create data streams for unmanaged signal types (e.g. profiles);
      // those are owned by the producer/exporter (see FLEET_UNMANAGED_DATA_STREAM_TYPES).
      .filter((type) => !FLEET_UNMANAGED_DATA_STREAM_TYPES.includes(type));

    return signalTypes.map((type) => ({
      datasetName,
      dataStreamType: type,
      inputType: packagePolicy.inputs[0].type,
    }));
  }

  const defaultDatasets = new Set((pkgInfo.data_streams || []).map((ds) => ds.dataset));
  const seen = new Set<string>();
  const results: CustomDatasetStream[] = [];

  for (const input of packagePolicy.inputs || []) {
    if (input.enabled === false) continue;
    for (const stream of input.streams || []) {
      if (stream.enabled === false) continue;

      const datasetVarValue = stream.vars?.[DATASET_VAR_NAME]?.value;
      if (
        !datasetVarValue ||
        typeof datasetVarValue !== 'string' ||
        defaultDatasets.has(datasetVarValue)
      ) {
        continue;
      }

      const dataStreamType = stream.data_stream.type || 'logs';
      const dedupeKey = `${datasetVarValue}:${dataStreamType}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const templateDs = (pkgInfo.data_streams || []).find(
        (ds) => ds.dataset === stream.data_stream.dataset && ds.type === dataStreamType
      );

      results.push({
        datasetName: datasetVarValue,
        dataStreamType,
        inputType: input.type,
        resolvedDataStream: templateDs ? { ...templateDs, dataset: datasetVarValue } : undefined,
        originDataset: templateDs ? stream.data_stream.dataset : undefined,
      });
    }
  }

  return results;
};

export const findDataStreamsFromDifferentPackages = async (
  datasetName: string,
  pkgInfo: PackageInfo,
  esClient: ElasticsearchClient,
  dataStreamType?: string
) => {
  const [dataStream] = getNormalizedDataStreams(pkgInfo, datasetName, dataStreamType);
  if (!dataStream.type) {
    throw new FleetError(`Expected data_stream.type to be defined for dataset "${datasetName}"`);
  }
  const existingDataStreams = await dataStreamService.getMatchingDataStreams(esClient, {
    type: dataStream.type,
    dataset: datasetName,
  });
  return { dataStream, existingDataStreams };
};

export const checkExistingDataStreamsAreFromDifferentPackage = (
  pkgInfo: PackageInfo,
  existingDataStreams: IndicesDataStream[]
) => {
  return (existingDataStreams || []).some(
    (ds) => ds._meta?.package?.name && ds._meta.package.name !== pkgInfo.name
  );
};

export const isInputPackageDatasetUsedByMultiplePolicies = (
  packagePolicies: PackagePolicy[],
  datasetName: string,
  pkgName: string,
  excludePolicyId?: string
) => {
  const matchingPolicies = packagePolicies.filter((packagePolicy) => {
    if (packagePolicy?.package?.name !== pkgName) return false;
    if (excludePolicyId && packagePolicy.id === excludePolicyId) return false;
    return (packagePolicy?.inputs ?? []).some((input) =>
      (input?.streams ?? []).some(
        (stream) => stream.vars?.[DATASET_VAR_NAME]?.value === datasetName
      )
    );
  });

  return matchingPolicies.length > 0;
};

export async function installAssetsForCustomDatasetPolicy(opts: {
  pkgInfo: PackageInfo;
  logger: Logger;
  packagePolicy: NewPackagePolicy;
  esClient: ElasticsearchClient;
  soClient: SavedObjectsClientContract;
  force: boolean;
}) {
  const { pkgInfo, logger, packagePolicy, esClient, soClient, force } = opts;

  const customStreams = getCustomDatasetStreams(packagePolicy, pkgInfo);
  if (customStreams.length === 0) return;

  for (const {
    datasetName,
    dataStreamType,
    inputType,
    resolvedDataStream,
    originDataset,
  } of customStreams) {
    await installAssetsForDataStreamType({
      pkgInfo,
      logger,
      datasetName,
      dataStreamType,
      inputType,
      esClient,
      soClient,
      force,
      resolvedDataStream,
      originDataset,
    });
  }
}

export async function installAssetsForInputPackagePolicy(opts: {
  pkgInfo: PackageInfo;
  logger: Logger;
  packagePolicy: NewPackagePolicy;
  esClient: ElasticsearchClient;
  soClient: SavedObjectsClientContract;
  force: boolean;
}) {
  return installAssetsForCustomDatasetPolicy(opts);
}

async function installAssetsForDataStreamType(opts: {
  pkgInfo: PackageInfo;
  logger: Logger;
  datasetName: string;
  dataStreamType: string;
  inputType: string;
  esClient: ElasticsearchClient;
  soClient: SavedObjectsClientContract;
  force: boolean;
  resolvedDataStream?: RegistryDataStream;
  originDataset?: string;
}) {
  const {
    pkgInfo,
    logger,
    datasetName,
    dataStreamType,
    inputType,
    esClient,
    soClient,
    force,
    resolvedDataStream,
    originDataset,
  } = opts;

  let dataStream: RegistryDataStream;
  let existingDataStreams: IndicesDataStream[];

  if (resolvedDataStream) {
    dataStream = resolvedDataStream;
    if (!dataStream.type) {
      throw new FleetError(`Expected data_stream.type to be defined for dataset "${datasetName}"`);
    }
    existingDataStreams = await dataStreamService.getMatchingDataStreams(esClient, {
      type: dataStream.type,
      dataset: datasetName,
    });
  } else {
    ({ dataStream, existingDataStreams } = await findDataStreamsFromDifferentPackages(
      datasetName,
      pkgInfo,
      esClient,
      dataStreamType
    ));
  }

  if (pkgInfo.type === 'input') {
    applyTimeSeriesIndexMode({
      dataStream,
      inputType,
      dataStreamType,
      pkgName: pkgInfo.name,
      logger,
    });
  }

  if (existingDataStreams.length) {
    const existingDataStreamsAreFromDifferentPackage =
      checkExistingDataStreamsAreFromDifferentPackage(pkgInfo, existingDataStreams);
    if (existingDataStreamsAreFromDifferentPackage && !force) {
      // user has opted to send data to an existing data stream which is managed by another
      // package. This means certain custom setting such as elasticsearch settings
      // defined by the package will not have been applied which could lead
      // to unforeseen circumstances, so force flag must be used.
      const streamIndexPattern = dataStreamService.streamPartsToIndexPattern({
        type: dataStream.type,
        dataset: datasetName,
      });

      throw new PackagePolicyValidationError(
        `Datastreams matching "${streamIndexPattern}" already exist and are not managed by this package, force flag is required`
      );
    }
    if (existingDataStreamsAreFromDifferentPackage && force) {
      logger.info(
        `Data stream for dataset ${datasetName} already exists, but is managed by a different package, skipping index template creation`
      );
      return;
    }
    if (!force) {
      logger.info(
        `Data stream for dataset ${datasetName} already exists, skipping index template creation`
      );
      return;
    }
  }

  const existingIndexTemplate = await dataStreamService.getMatchingIndexTemplate(esClient, {
    type: dataStream.type,
    dataset: datasetName,
  });

  if (existingIndexTemplate) {
    const indexTemplateOwnedByDifferentPackage =
      existingIndexTemplate._meta?.package?.name &&
      existingIndexTemplate._meta.package.name !== pkgInfo.name;
    if (indexTemplateOwnedByDifferentPackage && !force) {
      // index template already exists but there is no data stream yet
      // we do not want to override the index template
      throw new PackagePolicyValidationError(
        `Index template "${dataStream.type}-${datasetName}" already exist and is not managed by this package, force flag is required`
      );
    }
    if (indexTemplateOwnedByDifferentPackage && force) {
      logger.info(
        `Index template "${dataStream.type}-${datasetName}" already exists, but is managed by a different package, skipping index template creation`
      );
      return;
    }
    if (!force) {
      logger.info(
        `Index template "${dataStream.type}-${datasetName}" already exists, skipping index template creation`
      );
      return;
    }
  }

  const installedPkgWithAssets = await getInstalledPackageWithAssets({
    savedObjectsClient: soClient,
    pkgName: pkgInfo.name,
    logger,
  });

  let packageInstallContext: PackageInstallContext | undefined;
  if (!installedPkgWithAssets) {
    throw new PackageNotFoundError(
      `Error while creating index templates: unable to find installed package ${pkgInfo.name}`
    );
  }
  try {
    if (installedPkgWithAssets.installation.version !== pkgInfo.version) {
      const pkg = await Registry.getPackage(pkgInfo.name, pkgInfo.version, {
        ignoreUnverified: force,
      });

      const archiveIterator = createArchiveIteratorFromMap(pkg.assetsMap);
      packageInstallContext = {
        packageInfo: pkg.packageInfo,
        paths: pkg.paths,
        archiveIterator,
      };
    } else {
      const archiveIterator = createArchiveIteratorFromMap(installedPkgWithAssets.assetsMap);
      packageInstallContext = {
        packageInfo: installedPkgWithAssets.packageInfo,
        paths: installedPkgWithAssets.paths,
        archiveIterator,
      };
    }

    await installIndexTemplatesAndPipelines({
      installedPkg: installedPkgWithAssets.installation,
      packageInstallContext,
      esReferences: installedPkgWithAssets.installation.installed_es || [],
      savedObjectsClient: soClient,
      esClient,
      logger,
      onlyForDataStreams: [dataStream],
      customDataStreamOriginDataset: resolvedDataStream ? originDataset : undefined,
      customDataStreamOriginType: resolvedDataStream ? dataStreamType : undefined,
    });

    // Update ES index patterns — use datasetName as the map key
    await optimisticallyAddEsAssetReferences(
      soClient,
      installedPkgWithAssets.installation.name,
      [],
      generateESIndexPatterns([{ ...dataStream, path: datasetName }])
    );
  } catch (error) {
    logger.warn(`installAssetsForInputPackagePolicy error: ${error}`);
  }
}

// Remove the assets installed for input-type packages
export async function removeAssetsForInputPackagePolicy(opts: {
  packageInfo: PackageInfo;
  datasetName: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  savedObjectsClient: SavedObjectsClientContract;
}) {
  const { logger, packageInfo, esClient, savedObjectsClient, datasetName } = opts;

  if (packageInfo.status === 'installed') {
    logger.info(`Removing assets for package ${packageInfo.name}:${packageInfo.version}`);
    try {
      const installation = await getInstallation({
        savedObjectsClient,
        pkgName: packageInfo.name,
      });

      if (!installation) {
        throw new FleetError(`${packageInfo.name} is not installed`);
      }
      const {
        installed_es: installedEs,
        installed_kibana: installedKibana,
        es_index_patterns: esIndexPatterns,
      } = installation;

      // regex matching names with word boundary, allows to match `generic` and not `generic1`
      const regex = new RegExp(`${datasetName}\\b`);
      const filteredInstalledEs = installedEs.filter((asset) => asset.id.search(regex) > -1);
      const filteredInstalledKibana = installedKibana.filter(
        (asset) => asset.id.search(regex) > -1
      );
      const filteredEsIndexPatterns: Record<string, string> = {};
      if (esIndexPatterns) {
        filteredEsIndexPatterns[datasetName] = esIndexPatterns[datasetName];
      }
      const installationToDelete = {
        ...installation,
        installed_es: filteredInstalledEs,
        installed_kibana: filteredInstalledKibana,
        es_index_patterns: filteredEsIndexPatterns,
        package_assets: [],
      };

      await cleanupAssets(
        datasetName,
        installationToDelete,
        installation,
        esClient,
        savedObjectsClient
      );
    } catch (error) {
      logger.error(
        `Failed to remove assets for package ${packageInfo.name}:${packageInfo.version}: ${error.message}`
      );
    }
  }
}

/**
 * Applies time_series index mode rules to a data stream:
 * - Removes time_series index mode for non-metrics data streams
 * - Adds time_series index mode for OTel metrics data streams if not present
 * - Preserves existing time_series index mode for metrics data streams
 */
export const applyTimeSeriesIndexMode = ({
  dataStream,
  inputType,
  dataStreamType,
  pkgName,
  logger,
}: {
  dataStream: RegistryDataStream;
  inputType: string;
  dataStreamType: string;
  pkgName: string;
  logger: Logger;
}): void => {
  const isOTelInput = inputType === OTEL_COLLECTOR_INPUT_TYPE;
  const isMetricsType = dataStreamType === 'metrics';

  // For OTel inputs with metrics type, preserve time_series index mode
  // For all other cases, only preserve time_series for metrics type
  const shouldRemoveTimeSeries =
    !isMetricsType && dataStream.elasticsearch?.index_mode === 'time_series';

  if (shouldRemoveTimeSeries) {
    logger.debug(
      `Ignoring time_series index mode for package "${pkgName}" ` +
        `because data stream type is "${dataStreamType}" (time_series only wanted with "metrics" type)`
    );

    // Remove time_series index mode from dataStream.
    if (dataStream.elasticsearch) {
      const { index_mode, ...restElasticsearch } = dataStream.elasticsearch;
      dataStream.elasticsearch = restElasticsearch;
    }
  } else if (isOTelInput && isMetricsType && !dataStream.elasticsearch?.index_mode) {
    // For OTel metrics data streams, add time_series index mode if not already present
    logger.debug(
      `Adding time_series index mode for OTel package "${pkgName}" ` +
        `because data stream type is "${dataStreamType}"`
    );

    if (!dataStream.elasticsearch) {
      dataStream.elasticsearch = {};
    }
    dataStream.elasticsearch.index_mode = 'time_series';
  }
};
