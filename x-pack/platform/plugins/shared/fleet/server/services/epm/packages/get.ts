/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse } from 'yaml';
import pMap from 'p-map';
import type { MMRegExp } from 'minimatch';
import { minimatch } from 'minimatch';
import type {
  ElasticsearchClient,
  SavedObjectsClientContract,
  SavedObjectsFindOptions,
} from '@kbn/core/server';
import semverGte from 'semver/functions/gte';
import type { Logger } from '@kbn/core/server';
import { withSpan } from '@kbn/apm-utils';
import { errors } from '@elastic/elasticsearch';
import type { IndicesDataStream, SortResults } from '@elastic/elasticsearch/lib/api/types';

import { nodeBuilder } from '@kbn/es-query';

import { buildNode as buildFunctionNode } from '@kbn/es-query/src/kuery/node_types/function';
import { buildNode as buildWildcardNode } from '@kbn/es-query/src/kuery/node_types/wildcard';

import {
  ASSETS_SAVED_OBJECT_TYPE,
  installationStatuses,
  SO_SEARCH_LIMIT,
} from '../../../../common/constants';
import { isPackageLimited } from '../../../../common/services';
import type {
  PackageUsageStats,
  Installable,
  PackageDataStreamTypes,
  PackageList,
  InstalledPackage,
  PackageSpecManifest,
  AssetsMap,
  PackagePolicyAssetsMap,
  PackageKnowledgeBase,
  RegistryPolicyIntegrationTemplate,
  ArchiveIterator,
} from '../../../../common/types';

import {
  PACKAGES_SAVED_OBJECT_TYPE,
  MAX_CONCURRENT_EPM_PACKAGES_INSTALLATIONS,
} from '../../../constants';

import type {
  ArchivePackage,
  RegistryPackage,
  EpmPackageAdditions,
  GetCategoriesRequest,
  GetPackagesRequest,
} from '../../../../common/types';
import type { Installation, PackageInfo, PackagePolicySOAttributes } from '../../../types';
import {
  PackageFailedVerificationError,
  PackageNotFoundError,
  RegistryResponseError,
  PackageInvalidArchiveError,
  FleetUnauthorizedError,
} from '../../../errors';
import { appContextService } from '../..';
import { dataStreamService } from '../../data_streams';
import * as Registry from '../registry';
import type { PackageAsset } from '../archive/storage';
import { getEsPackage } from '../archive/storage';
import { normalizeKuery } from '../../saved_object';
import { getPackagePolicySavedObjectType } from '../../package_policy';
import { auditLoggingService } from '../../audit_logging';

import { getFilteredSearchPackages } from '../filtered_packages';
import { filterAssetPathForParseAndVerifyArchive } from '../archive/parse';
import { airGappedUtils } from '../airgapped';

import type {
  PackageAssetReference,
  RegistryPolicyTemplate,
} from '../../../../common/types/models/epm';

import { createInstallableFrom } from '.';
import { getPackageKnowledgeBaseFromIndex } from './knowledge_base_index';
import {
  getPackageAssetsMapCache,
  setPackageAssetsMapCache,
  getPackageInfoCache,
  setPackageInfoCache,
  getAgentTemplateAssetsMapCache,
  setAgentTemplateAssetsMapCache,
} from './cache';
import {
  shouldIncludePackageWithDatastreamTypes,
  filterOutExcludedDataStreamTypes,
  shouldIncludePolicyTemplateWithDatastreamTypes,
} from './exclude_datastreams_helper';

export { getFile } from '../registry';

function nameAsTitle(name: string) {
  return name.charAt(0).toUpperCase() + name.substr(1).toLowerCase();
}

export async function getCategories(options: GetCategoriesRequest['query']) {
  return Registry.fetchCategories(options);
}

export async function getPackages(
  options: {
    savedObjectsClient: SavedObjectsClientContract;
    excludeInstallStatus?: boolean;
  } & GetPackagesRequest['query']
) {
  const logger = appContextService.getLogger();
  const {
    savedObjectsClient,
    category,
    excludeInstallStatus = false,
    prerelease = false,
  } = options;

  const registryItems = await Registry.fetchList({ category, prerelease }).then((items) => {
    return items.map((item) =>
      Object.assign({}, item, { title: item.title || nameAsTitle(item.name) }, { id: item.name })
    );
  });
  // get the installed packages
  const packageSavedObjects = await getPackageSavedObjects(savedObjectsClient);
  const MAX_PKGS_TO_LOAD_TITLE = 10;

  const packagesNotInRegistry = packageSavedObjects.saved_objects.filter(
    (pkg) => !registryItems.some((item) => item.name === pkg.id)
  );

  const uploadedPackagesNotInRegistry = (
    await pMap(
      packagesNotInRegistry.entries(),
      async ([i, pkg]) => {
        // fetching info of uploaded packages to populate title, description
        // limit to 10 for performance
        if (i < MAX_PKGS_TO_LOAD_TITLE) {
          try {
            const packageInfo = await withSpan({ name: 'get-package-info', type: 'package' }, () =>
              getPackageInfo({
                savedObjectsClient,
                pkgName: pkg.id,
                pkgVersion: pkg.attributes.version,
              })
            );
            return createInstallableFrom({ ...packageInfo, id: pkg.id }, pkg);
          } catch (err) {
            if (err instanceof PackageInvalidArchiveError) {
              logger.warn(
                `Installed package ${pkg.id} ${pkg.attributes.version} is not a valid package anymore`
              );
              return null;
            }
            // ignoring errors of type PackageNotFoundError to avoid blocking the UI over a package not found in the registry
            if (err instanceof PackageNotFoundError) {
              logger.warn(`Package ${pkg.id} ${pkg.attributes.version} not found in registry`);
              return null;
            }
            throw err;
          }
        } else {
          return createInstallableFrom(
            { ...pkg.attributes, title: nameAsTitle(pkg.id), id: pkg.id },
            pkg
          );
        }
      },
      { concurrency: MAX_CONCURRENT_EPM_PACKAGES_INSTALLATIONS }
    )
  ).filter((p): p is Installable<any> => p !== null);

  const filteredPackages = getFilteredSearchPackages();
  let packageList = registryItems
    .map((item) =>
      createInstallableFrom(
        item,
        packageSavedObjects.saved_objects.find(({ id }) => id === item.name)
      )
    )
    .concat(uploadedPackagesNotInRegistry as Installable<any>)
    .filter((item) => !filteredPackages.includes(item.id))
    .sort(sortByName);

  for (const pkg of packageList) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'get',
      id: pkg.id,
      name: pkg.name,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
  }

  const excludeDataStreamTypes =
    appContextService.getConfig()?.internal?.excludeDataStreamTypes ?? [];
  packageList = filterOutExcludedDataStreamTypes(packageList, excludeDataStreamTypes);

  if (!excludeInstallStatus) {
    return packageList;
  }

  // Exclude the `installStatus` value if the `excludeInstallStatus` query parameter is set to true
  // to better facilitate response caching
  const packageListWithoutStatus = packageList.map((pkg) => {
    const newPkg = {
      ...pkg,
      status: undefined,
    };

    return newPkg;
  });

  return packageListWithoutStatus as PackageList;
}

interface GetInstalledPackagesOptions {
  savedObjectsClient: SavedObjectsClientContract;
  esClient: ElasticsearchClient;
  dataStreamType?: PackageDataStreamTypes;
  nameQuery?: string;
  searchAfter?: SortResults;
  perPage: number;
  sortOrder: 'asc' | 'desc';
  showOnlyActiveDataStreams?: boolean;
  dependencyPackageName?: string;
}
export async function getInstalledPackages(options: GetInstalledPackagesOptions) {
  const { savedObjectsClient, esClient, showOnlyActiveDataStreams, ...otherOptions } = options;
  const { dataStreamType } = otherOptions;

  const packageSavedObjects = await getInstalledPackageSavedObjects(
    savedObjectsClient,
    otherOptions
  );

  let allFleetDataStreams: IndicesDataStream[] | undefined;

  if (showOnlyActiveDataStreams) {
    allFleetDataStreams = await dataStreamService.getAllFleetDataStreams(esClient).catch((err) => {
      const isResponseError = err instanceof errors.ResponseError;
      if (isResponseError && err?.body?.error?.type === 'security_exception') {
        throw new FleetUnauthorizedError(`Unauthorized to query fleet datastreams: ${err.message}`);
      }
      throw err;
    });
  }

  const integrations = packageSavedObjects.saved_objects.map((integrationSavedObject) => {
    const {
      name,
      version,
      install_status: installStatus,
      es_index_patterns: esIndexPatterns,
    } = integrationSavedObject.attributes;

    const dataStreams = getInstalledPackageSavedObjectDataStreams(
      esIndexPatterns,
      dataStreamType,
      allFleetDataStreams
    );

    return {
      name,
      version,
      status: installStatus,
      dataStreams,
      rolledBack: integrationSavedObject.attributes.rolled_back,
    };
  });

  const integrationManifests =
    integrations.length > 0
      ? await getInstalledPackageManifests(savedObjectsClient, integrations)
      : new Map<string, PackageSpecManifest>();

  const integrationsWithManifestContent = integrations.map((integration) => {
    const { name, version } = integration;
    const integrationAsset = integrationManifests.get(`${name}-${version}/manifest.yml`);

    return {
      ...integration,
      title: integrationAsset?.title ?? undefined,
      description: integrationAsset?.description ?? undefined,
      icons: integrationAsset?.icons ?? undefined,
    };
  });

  return {
    items: integrationsWithManifestContent,
    total: packageSavedObjects.total,
    searchAfter: packageSavedObjects.saved_objects.at(-1)?.sort, // Enable ability to use searchAfter in subsequent queries
  };
}

// Get package names for packages which cannot have more than one package policy on an agent policy
export async function getLimitedPackages(options: {
  savedObjectsClient: SavedObjectsClientContract;
  prerelease?: boolean;
}): Promise<string[]> {
  const { savedObjectsClient, prerelease } = options;
  const allPackages = await getPackages({
    savedObjectsClient,
    prerelease,
  });
  const installedPackages = allPackages.filter(
    (pkg) => pkg.status === installationStatuses.Installed
  );
  const installedPackagesInfo = await Promise.all(
    installedPackages.map((pkgInstall) => {
      return getPackageInfo({
        savedObjectsClient,
        pkgName: pkgInstall.name,
        pkgVersion: pkgInstall.version,
      });
    })
  );

  const packages = installedPackagesInfo.filter(isPackageLimited).map((pkgInfo) => pkgInfo.name);

  for (const pkg of installedPackages) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: pkg.id,
      name: pkg.name,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
  }

  return packages;
}

export async function getPackageSavedObjects(
  savedObjectsClient: SavedObjectsClientContract,
  options?: Omit<SavedObjectsFindOptions, 'type'>
) {
  const result = await savedObjectsClient.find<Installation>({
    ...(options || {}),
    type: PACKAGES_SAVED_OBJECT_TYPE,
    perPage: SO_SEARCH_LIMIT,
  });

  for (const savedObject of result.saved_objects) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: savedObject.id,
      name: savedObject.attributes.name,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
  }

  return result;
}

export async function getInstalledPackageSavedObjects(
  savedObjectsClient: SavedObjectsClientContract,
  options: Omit<GetInstalledPackagesOptions, 'savedObjectsClient' | 'esClient'>
) {
  const { searchAfter, sortOrder, perPage, nameQuery, dataStreamType, dependencyPackageName } =
    options;

  const result = await savedObjectsClient.find<Installation>({
    type: PACKAGES_SAVED_OBJECT_TYPE,
    // Pagination
    perPage,
    ...(searchAfter && { searchAfter }),
    // Sort
    sortField: 'name',
    sortOrder,
    // Name filter
    ...(nameQuery && { searchFields: ['name'] }),
    ...(nameQuery && { search: `${nameQuery}* | ${nameQuery}` }),
    filter: nodeBuilder.and([
      // Filter to installed packages only
      nodeBuilder.is(
        `${PACKAGES_SAVED_OBJECT_TYPE}.attributes.install_status`,
        installationStatuses.Installed
      ),
      ...(dependencyPackageName
        ? [
            buildFunctionNode(
              'nested',
              `${PACKAGES_SAVED_OBJECT_TYPE}.attributes.dependencies`,
              nodeBuilder.is('name', dependencyPackageName)
            ),
          ]
        : []),
      ...(dataStreamType
        ? [
            // Filter for a "queryable" marker
            buildFunctionNode(
              'nested',
              `${PACKAGES_SAVED_OBJECT_TYPE}.attributes.installed_es`,
              nodeBuilder.is('type', 'index_template')
            ),
            // "Type" filter
            buildFunctionNode(
              'nested',
              `${PACKAGES_SAVED_OBJECT_TYPE}.attributes.installed_es`,
              nodeBuilder.is('id', buildWildcardNode(`${dataStreamType}-*`))
            ),
          ]
        : []),
    ]),
  });

  for (const savedObject of result.saved_objects) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: savedObject.id,
      name: savedObject.attributes.name,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
  }

  return result;
}

export async function getInstalledPackageManifests(
  savedObjectsClient: SavedObjectsClientContract,
  installedPackages: InstalledPackage[]
) {
  const pathFilters = installedPackages.map((installedPackage) => {
    const { name, version } = installedPackage;
    return nodeBuilder.is(
      `${ASSETS_SAVED_OBJECT_TYPE}.attributes.asset_path`,
      `${name}-${version}/manifest.yml`
    );
  });

  const result = await savedObjectsClient.find<PackageAsset>({
    type: ASSETS_SAVED_OBJECT_TYPE,
    filter: nodeBuilder.or(pathFilters),
  });

  const parsedManifests = result.saved_objects.reduce<Map<string, PackageSpecManifest>>(
    (acc, asset) => {
      acc.set(asset.attributes.asset_path, parse(asset.attributes.data_utf8));
      return acc;
    },
    new Map()
  );

  for (const savedObject of result.saved_objects) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: savedObject.id,
      savedObjectType: ASSETS_SAVED_OBJECT_TYPE,
    });
  }

  return parsedManifests;
}

function getInstalledPackageSavedObjectDataStreams(
  indexPatterns: Record<string, string>,
  dataStreamType?: string,
  filterActiveDatastreams?: IndicesDataStream[]
) {
  const filterActiveDatastreamsName = filterActiveDatastreams
    ? filterActiveDatastreams.map((ds) => ds.name)
    : undefined;

  return Object.entries(indexPatterns)
    .map(([key, value]) => {
      return {
        name: value,
        title: key,
      };
    })
    .filter((stream) => {
      if (dataStreamType && !stream.name.startsWith(`${dataStreamType}-`)) {
        return false;
      }

      if (filterActiveDatastreamsName) {
        const patternRegex = new minimatch.Minimatch(stream.name, {
          noglobstar: true,
          nonegate: true,
        }).makeRe() as MMRegExp;

        return filterActiveDatastreamsName.some((dataStreamName) =>
          dataStreamName.match(patternRegex)
        );
      }

      return true;
    });
}

export const getInstallations = getPackageSavedObjects;

export async function getPackageInfo({
  savedObjectsClient,
  pkgName,
  pkgVersion,
  skipArchive = false,
  ignoreUnverified = false,
  prerelease,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  pkgVersion: string;
  /** Avoid loading the registry archive into the cache (only use for performance reasons). Defaults to `false` */
  skipArchive?: boolean;
  ignoreUnverified?: boolean;
  prerelease?: boolean;
}): Promise<PackageInfo> {
  const cacheResult = getPackageInfoCache(pkgName, pkgVersion);
  if (cacheResult) {
    return cacheResult;
  }
  const [savedObject, latestPackage] = await Promise.all([
    getInstallationObject({ savedObjectsClient, pkgName }),
    Registry.fetchFindLatestPackageOrUndefined(pkgName, { prerelease }),
  ]);

  if (!savedObject && !latestPackage) {
    throw new PackageNotFoundError(`[${pkgName}] package not installed or found in registry`);
  }

  // If no package version is provided, use the installed version in the response, fallback to package from registry
  const resolvedPkgVersion =
    pkgVersion !== ''
      ? pkgVersion
      : savedObject?.attributes.install_version ?? latestPackage!.version;

  // If same version is available in registry and skipArchive is true, use the info from the registry (faster),
  // otherwise build it from the archive
  let paths: string[];
  const registryInfo = await Registry.fetchInfo(pkgName, resolvedPkgVersion).catch(() => undefined);
  let packageInfo;
  // We need to get input only packages from source to get all fields
  // see https://github.com/elastic/package-registry/issues/864
  if (
    registryInfo &&
    (skipArchive || airGappedUtils().shouldSkipRegistryRequests) &&
    registryInfo.type !== 'input'
  ) {
    packageInfo = registryInfo;
    // Fix the paths
    paths =
      packageInfo.assets?.map((path) =>
        path.replace(`/package/${pkgName}/${pkgVersion}`, `${pkgName}-${pkgVersion}`)
      ) ?? [];
  } else {
    ({ paths, packageInfo } = await getPackageFromSource({
      pkgName,
      pkgVersion: resolvedPkgVersion,
      savedObjectsClient,
      installedPkg: savedObject?.attributes,
      ignoreUnverified,
    }));
  }

  const additions: EpmPackageAdditions = {
    latestVersion:
      latestPackage?.version && semverGte(latestPackage.version, resolvedPkgVersion)
        ? latestPackage.version
        : resolvedPkgVersion,
    title: packageInfo.title || nameAsTitle(packageInfo.name),
    assets: Registry.groupPathsByService(paths || []),
    notice: Registry.getNoticePath(paths || []),
    licensePath: Registry.getLicensePath(paths || []),
    keepPoliciesUpToDate: savedObject?.attributes.keep_policies_up_to_date ?? false,
  };

  const { filteredDataStreams, filteredPolicyTemplates } =
    getFilteredDataStreamsAndPolicyTemplates(packageInfo);

  const excludeDataStreamTypes =
    appContextService.getConfig()?.internal?.excludeDataStreamTypes ?? [];

  if (
    !savedObject &&
    !shouldIncludePackageWithDatastreamTypes(packageInfo, excludeDataStreamTypes)
  ) {
    throw new PackageNotFoundError(
      'Package is not compatible with the current project data stream types'
    );
  }

  const updated = {
    ...packageInfo,
    ...additions,
    data_streams: filteredDataStreams,
    policy_templates: filteredPolicyTemplates,
  };

  const installable = createInstallableFrom(updated, savedObject);
  setPackageInfoCache(pkgName, pkgVersion, installable);

  return installable;
}

function getFilteredDataStreamsAndPolicyTemplates(packageInfo: ArchivePackage | RegistryPackage) {
  const excludeDataStreamTypes =
    appContextService.getConfig()?.internal?.excludeDataStreamTypes ?? [];
  let filteredDataStreams = packageInfo.data_streams;
  let filteredPolicyTemplates = packageInfo.policy_templates;

  if (excludeDataStreamTypes.length > 0) {
    filteredDataStreams = packageInfo.data_streams?.filter(
      (dataStream) => !excludeDataStreamTypes.includes(dataStream.type)
    );
    // filter out matching types e.g. nginx/metrics
    filteredPolicyTemplates = packageInfo.policy_templates?.reduce(
      (acc: RegistryPolicyTemplate[], policyTemplate: RegistryPolicyTemplate) => {
        const policyTemplateIntegrationTemplate =
          policyTemplate as RegistryPolicyIntegrationTemplate;

        const shouldIncludePolicyTemplate = shouldIncludePolicyTemplateWithDatastreamTypes(
          packageInfo,
          policyTemplate,
          excludeDataStreamTypes
        );
        if (!shouldIncludePolicyTemplate) {
          return acc;
        }

        if (policyTemplateIntegrationTemplate.inputs) {
          const filteredInputs = policyTemplateIntegrationTemplate.inputs.filter((input: any) => {
            const shouldInclude = !excludeDataStreamTypes.some((excludedType) =>
              input.type.includes(excludedType)
            );
            return shouldInclude;
          });
          acc.push({ ...policyTemplate, inputs: filteredInputs ?? [] });
        } else {
          acc.push(policyTemplate);
        }
        return acc;
      },
      []
    );
  }

  return { filteredDataStreams, filteredPolicyTemplates };
}

export const getPackageUsageStats = async ({
  savedObjectsClient,
  pkgName,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
}): Promise<PackageUsageStats> => {
  const packagePolicySavedObjectType = await getPackagePolicySavedObjectType();

  const filter = normalizeKuery(
    packagePolicySavedObjectType,
    `${packagePolicySavedObjectType}.package.name: ${pkgName} AND NOT ${packagePolicySavedObjectType}.latest_revision: false`
  );
  const agentPolicyCount = new Set<string>();
  // using saved Objects client directly, instead of the `list()` method of `package_policy` service
  // in order to not cause a circular dependency (package policy service imports from this module)
  const packagePolicies = await savedObjectsClient.find<
    Pick<PackagePolicySOAttributes, 'name' | 'policy_ids'>
  >({
    type: packagePolicySavedObjectType,
    fields: ['name', 'policy_ids'],
    perPage: SO_SEARCH_LIMIT,
    filter,
  });

  for (const packagePolicy of packagePolicies.saved_objects) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: packagePolicy.id,
      name: packagePolicy.attributes.name,
      savedObjectType: packagePolicySavedObjectType,
    });
  }

  for (const packagePolicy of packagePolicies.saved_objects) {
    packagePolicy.attributes.policy_ids.forEach((policyId) => agentPolicyCount.add(policyId));
  }

  return {
    package_policy_count: packagePolicies.saved_objects.length,
    agent_policy_count: agentPolicyCount.size,
  };
};

export async function getPackageDependencies(
  pkgName: string,
  pkgVersion: string
): Promise<Array<{ name: string; version: string; title: string }>> {
  const pkg = await Registry.fetchInfo(pkgName, pkgVersion).catch(() => undefined);
  if (!pkg) {
    throw new PackageNotFoundError(`[${pkgName}-${pkgVersion}] package not found in registry`);
  }

  const deps = pkg.requires?.content ?? [];

  return Promise.all(
    deps.map(async (dep) => {
      const depPkg = await Registry.fetchFindLatestPackageOrUndefined(dep.package);
      return {
        name: dep.package,
        version: dep.version,
        title: depPkg && 'title' in depPkg ? depPkg.title : dep.package,
      };
    })
  );
}

export interface PackageResponse {
  paths: string[];
  packageInfo: ArchivePackage | RegistryPackage;
  assetsMap?: AssetsMap;
  archiveIterator?: ArchiveIterator;
}
type GetPackageResponse = PackageResponse | undefined;

// gets package from install_source
export async function getPackageFromSource(options: {
  pkgName: string;
  pkgVersion: string;
  installedPkg?: Installation;
  savedObjectsClient: SavedObjectsClientContract;
  ignoreUnverified?: boolean;
}): Promise<PackageResponse> {
  const logger = appContextService.getLogger();
  const {
    pkgName,
    pkgVersion,
    installedPkg,
    savedObjectsClient,
    ignoreUnverified = false,
  } = options;
  let res: GetPackageResponse;

  // If the package is installed
  if (
    installedPkg &&
    installedPkg.install_status === 'installed' &&
    installedPkg.version === pkgVersion
  ) {
    const { install_source: pkgInstallSource } = installedPkg;
    if (!res && installedPkg.package_assets) {
      res = await getEsPackage(
        pkgName,
        pkgVersion,
        installedPkg.package_assets,
        savedObjectsClient
      );

      if (res) {
        logger.debug(`retrieved installed package ${pkgName}-${pkgVersion} from ES`);
      }
    }
    // install source is now archive in all cases
    // See https://github.com/elastic/kibana/issues/115032
    if (!res && pkgInstallSource === 'registry') {
      try {
        res = await Registry.getPackage(pkgName, pkgVersion);
        logger.debug(`retrieved installed package ${pkgName}-${pkgVersion}`);
      } catch (error) {
        if (error instanceof PackageFailedVerificationError) {
          logger.error(`package ${pkgName}-${pkgVersion} failed verification`);
          throw error;
        }
        // treating this is a 404 as no status code returned
        // in the unlikely event its missing from cache, storage, and never installed from registry
      }
    }
    if (!res && pkgInstallSource === 'bundled') {
      res = await Registry.getBundledArchive(pkgName, pkgVersion);
      logger.debug(`retrieved bundled package ${pkgName}-${pkgVersion} from bundled archive`);
    }
  } else {
    try {
      res = await Registry.getPackage(pkgName, pkgVersion, { ignoreUnverified });
      logger.debug(`retrieved package ${pkgName}-${pkgVersion} from registry`);
    } catch (err) {
      if (err instanceof RegistryResponseError && err.status === 404) {
        res = await Registry.getBundledArchive(pkgName, pkgVersion);
        logger.debug(`retrieved bundled package ${pkgName}-${pkgVersion}`);
      } else {
        throw err;
      }
    }
  }
  if (!res) {
    throw new PackageNotFoundError(`Package info for ${pkgName}-${pkgVersion} does not exist`);
  }
  return {
    paths: res.paths,
    packageInfo: res.packageInfo,
    assetsMap: res.assetsMap,
    archiveIterator: res.archiveIterator,
  };
}

export async function getInstallationObject(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  logger?: Logger;
}) {
  const { savedObjectsClient, pkgName, logger } = options;
  const installation = await savedObjectsClient
    .get<Installation>(PACKAGES_SAVED_OBJECT_TYPE, pkgName)
    .catch((e) => {
      logger?.error(e);
      return undefined;
    });

  if (!installation) {
    return;
  }

  auditLoggingService.writeCustomSoAuditLog({
    action: 'find',
    id: installation.id,
    name: installation.attributes.name,
    savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
  });

  return installation;
}

async function getInstallationObjects(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgNames: string[];
}) {
  const { savedObjectsClient, pkgNames } = options;
  const res = await savedObjectsClient.bulkGet<Installation>(
    pkgNames.map((pkgName) => ({ id: pkgName, type: PACKAGES_SAVED_OBJECT_TYPE }))
  );

  const installations = res.saved_objects.filter((so) => so?.attributes);

  for (const installation of installations) {
    auditLoggingService.writeCustomSoAuditLog({
      action: 'find',
      id: installation.id,
      name: installation.attributes.name,
      savedObjectType: PACKAGES_SAVED_OBJECT_TYPE,
    });
  }

  return installations;
}

export async function getInstallation(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  logger?: Logger;
}) {
  const savedObject = await getInstallationObject(options);
  return savedObject?.attributes;
}

/**
 * Return an installed package with his related assets
 */
export async function getInstalledPackageWithAssets(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgName: string;
  logger?: Logger;
  ignoreUnverified?: boolean;
  assetsFilter?: (path: string) => boolean;
}) {
  const installation = await getInstallation(options);
  if (!installation) {
    return;
  }

  const esPackage = await getEsPackage(
    installation.name,
    installation.version,
    installation.package_assets ?? [],
    options.savedObjectsClient,
    {
      shouldFetchBuffer: (reference: PackageAssetReference) => {
        if (typeof options.assetsFilter === 'undefined' || typeof reference.path === 'undefined') {
          return true;
        }
        return options.assetsFilter(reference.path);
      },
    }
  );

  if (!esPackage) {
    return;
  }

  return {
    installation,
    assetsMap: esPackage.assetsMap,
    packageInfo: esPackage.packageInfo,
    paths: esPackage.paths,
  };
}

export async function getInstallationsByName(options: {
  savedObjectsClient: SavedObjectsClientContract;
  pkgNames: string[];
}) {
  const savedObjects = await getInstallationObjects(options);
  return savedObjects.map((so) => so.attributes);
}

function sortByName(a: { name: string }, b: { name: string }) {
  if (a.name > b.name) {
    return 1;
  } else if (a.name < b.name) {
    return -1;
  } else {
    return 0;
  }
}

/**
 * Return assets for an installed package from ES or from the registry otherwise
 */
export async function getPackageAssetsMap({
  savedObjectsClient,
  packageInfo,
  logger,
  ignoreUnverified,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  packageInfo: PackageInfo;
  logger: Logger;
  ignoreUnverified?: boolean;
}): Promise<AssetsMap> {
  const cache = getPackageAssetsMapCache(packageInfo.name, packageInfo.version);
  if (cache) {
    return cache;
  }
  const installedPackageWithAssets = await getInstalledPackageWithAssets({
    savedObjectsClient,
    pkgName: packageInfo.name,
    logger,
  });

  try {
    let assetsMap: AssetsMap | undefined;
    if (installedPackageWithAssets?.installation.version !== packageInfo.version) {
      // Try to get from registry
      const pkg = await Registry.getPackage(packageInfo.name, packageInfo.version, {
        ignoreUnverified,
      });
      assetsMap = pkg.assetsMap;
    } else {
      assetsMap = installedPackageWithAssets.assetsMap;
    }
    setPackageAssetsMapCache(packageInfo.name, packageInfo.version, assetsMap);

    return assetsMap;
  } catch (error) {
    logger.warn(`getPackageAssetsMap error: ${error}`);
    throw error;
  }
}

/**
 * Return assets agent template assets map for package policies operation
 */
export async function getAgentTemplateAssetsMap({
  savedObjectsClient,
  packageInfo,
  logger,
  ignoreUnverified,
}: {
  savedObjectsClient: SavedObjectsClientContract;
  packageInfo: PackageInfo;
  logger: Logger;
  ignoreUnverified?: boolean;
}): Promise<PackagePolicyAssetsMap> {
  const cache = getAgentTemplateAssetsMapCache(packageInfo.name, packageInfo.version);
  if (cache) {
    return cache;
  }
  const assetsFilter = (path: string) =>
    filterAssetPathForParseAndVerifyArchive(path) || !!path.match(/\/agent\/.*\.hbs/);
  const installedPackageWithAssets = await getInstalledPackageWithAssets({
    savedObjectsClient,
    pkgName: packageInfo.name,
    logger,
    assetsFilter,
  });

  try {
    let assetsMap: PackagePolicyAssetsMap | undefined;
    if (installedPackageWithAssets?.installation.version !== packageInfo.version) {
      // Try to get from registry
      const pkg = await Registry.getPackage(packageInfo.name, packageInfo.version, {
        ignoreUnverified,
        useStreaming: true,
      });
      assetsMap = new Map() as PackagePolicyAssetsMap;
      await pkg.archiveIterator.traverseEntries(async (entry) => {
        if (entry.buffer) {
          assetsMap!.set(entry.path, entry.buffer);
        }
      }, assetsFilter);
    } else {
      assetsMap = installedPackageWithAssets.assetsMap as PackagePolicyAssetsMap;
    }
    setAgentTemplateAssetsMapCache(packageInfo.name, packageInfo.version, assetsMap);

    return assetsMap as PackagePolicyAssetsMap;
  } catch (error) {
    logger.warn(`getAgentTemplateAssetsMap error: ${error}`);
    throw error;
  }
}

/**
 * Get knowledge base content for a package
 * @param options Object with esClient and package name
 * @returns The knowledge base content or undefined if not found
 */
export async function getPackageKnowledgeBase(options: {
  esClient: ElasticsearchClient;
  pkgName: string;
  abortController?: AbortController;
}): Promise<PackageKnowledgeBase | undefined> {
  const { esClient, pkgName, abortController } = options;

  try {
    const knowledgeBaseItems = await getPackageKnowledgeBaseFromIndex(
      esClient,
      pkgName,
      abortController
    );

    if (knowledgeBaseItems.length === 0) {
      return undefined;
    }

    return {
      package: {
        name: pkgName,
      },
      items: knowledgeBaseItems,
    };
  } catch (error) {
    appContextService
      .getLogger()
      .warn(`Error fetching knowledge base for package ${pkgName}: ${error.message}`);
    return undefined;
  }
}
