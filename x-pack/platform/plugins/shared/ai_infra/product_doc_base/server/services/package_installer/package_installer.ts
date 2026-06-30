/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/logging';
import type { ElasticsearchClient } from '@kbn/core/server';
import type { ResourceType } from '@kbn/product-doc-common';
import Semver from 'semver';
import Fs from 'fs/promises';
import {
  getArtifactName,
  getProductDocIndexName,
  getSecurityLabsArtifactName,
  getSecurityLabsIndexName,
  DocumentationProduct,
  type ProductName,
  ResourceTypes,
} from '@kbn/product-doc-common';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import { cloneDeep } from 'lodash';
import type { InferenceInferenceEndpointInfo } from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import {
  isDefaultLinuxElserInferenceId,
  isImpliedDefaultElserInferenceId,
} from '@kbn/product-doc-common/src/is_default_inference_endpoint';
import type { ProductDocInstallClient } from '../doc_install_status';
import type { SecurityLabsStatusResponse } from '../doc_manager/types';
import {
  downloadToDisk,
  openZipArchive,
  loadMappingFile,
  loadManifestFile,
  ensureDefaultElserDeployed,
  type ZipArchive,
  ensureInferenceDeployed,
  isLegacySemanticTextVersion,
} from './utils';
import { majorMinor, latestVersion } from './utils/semver';
import {
  validateArtifactArchive,
  fetchArtifactVersions,
  fetchSecurityLabsVersions,
  createIndex,
  populateIndex,
} from './steps';

import { overrideInferenceSettings } from './steps/create_index';
import { LATEST_PRODUCT_VERSION } from '../../../common/consts';
interface PackageInstallerOpts {
  artifactsFolder: string;
  logger: Logger;
  esClient: ElasticsearchClient;
  productDocClient: ProductDocInstallClient;
  artifactRepositoryUrl: string;
  artifactRepositoryProxyUrl?: string;
  kibanaVersion: string;
  elserInferenceId?: string;
  isServerless?: boolean;
}
// Process each product (elasticsearch and kibana)
const OPEN_API_SPEC_PRODUCTS: Array<{
  productName: 'elasticsearch' | 'kibana';
  indexName: string;
}> = [
  {
    productName: DocumentationProduct.elasticsearch as 'elasticsearch',
    indexName: '.kibana_ai_openapi_spec_elasticsearch',
  },
  {
    productName: DocumentationProduct.kibana as 'kibana',
    indexName: '.kibana_ai_openapi_spec_kibana',
  },
];

export class PackageInstaller {
  private readonly log: Logger;
  private readonly artifactsFolder: string;
  private readonly esClient: ElasticsearchClient;
  private readonly productDocClient: ProductDocInstallClient;
  private readonly artifactRepositoryUrl: string;
  private readonly artifactRepositoryProxyUrl?: string;
  private readonly currentVersion: string;
  private readonly elserInferenceId: string;
  private readonly isServerless: boolean;

  constructor({
    artifactsFolder,
    logger,
    esClient,
    productDocClient,
    artifactRepositoryUrl,
    artifactRepositoryProxyUrl,
    elserInferenceId,
    kibanaVersion,
    isServerless,
  }: PackageInstallerOpts) {
    this.esClient = esClient;
    this.productDocClient = productDocClient;
    this.artifactsFolder = artifactsFolder;
    this.artifactRepositoryUrl = artifactRepositoryUrl;
    this.artifactRepositoryProxyUrl = artifactRepositoryProxyUrl;
    this.currentVersion = majorMinor(kibanaVersion);
    this.log = logger;
    this.elserInferenceId = elserInferenceId || defaultInferenceEndpoints.ELSER;
    this.isServerless = isServerless ?? false;
  }

  private getArtifactRepositoryOptions(): {
    artifactRepositoryUrl: string;
    artifactRepositoryProxyUrl?: string;
  } {
    return {
      artifactRepositoryUrl: this.artifactRepositoryUrl,
      artifactRepositoryProxyUrl: this.artifactRepositoryProxyUrl,
    };
  }

  private async getInferenceInfo(inferenceId?: string) {
    if (!inferenceId) {
      return;
    }
    const inferenceEndpoints = await this.esClient.inference.get({
      inference_id: inferenceId,
    });
    return Array.isArray(inferenceEndpoints.endpoints) && inferenceEndpoints.endpoints.length > 0
      ? inferenceEndpoints.endpoints[0]
      : undefined;
  }
  /**
   * Make sure that the currently installed doc packages are up to date.
   * Will not upgrade products that are not already installed
   */
  async ensureUpToDate(params: { inferenceId: string; forceUpdate?: boolean }) {
    const { inferenceId, forceUpdate } = params;
    const inferenceInfo = await this.getInferenceInfo(inferenceId);
    const [repositoryVersions, installStatuses, openapiSpecInstallStatus] = await Promise.all([
      fetchArtifactVersions(this.getArtifactRepositoryOptions()),
      this.productDocClient.getInstallationStatus({ inferenceId }),
      this.productDocClient.getOpenapiSpecInstallationStatus({ inferenceId }),
    ]);
    const toUpdate: Array<{
      productName: ProductName;
      productVersion: string;
    }> = [];
    Object.entries(installStatuses).forEach(([productName, productState]) => {
      if (productState.status === 'uninstalled') {
        return;
      }
      const availableVersions = repositoryVersions[productName as ProductName];
      if (!availableVersions || !availableVersions.length) {
        return;
      }
      // Serverless/"latest" zip file has a special versioning strategy
      // where we track by last date modified in the bucket
      const shouldInstallLatest = this.isServerless;
      const selectedVersion = selectVersion(
        this.currentVersion,
        availableVersions,
        shouldInstallLatest
      );
      if (productState.version !== selectedVersion || Boolean(forceUpdate)) {
        this.log.info(
          `Updating product [${productName}] from version [${productState.version}] to version [${selectedVersion}]`
        );
        toUpdate.push({
          productName: productName as ProductName,
          productVersion: selectedVersion,
        });
      }
    });

    for (const { productName, productVersion } of toUpdate) {
      await this.installPackageWithVersionFallback({
        productName,
        selectedVersion: productVersion,
        availableVersions: repositoryVersions[productName] ?? [],
        customInference: inferenceInfo,
      });
    }

    const openAPISpecVersionToUpgradeTo = selectVersion(
      this.currentVersion,
      repositoryVersions.openapi,
      this.isServerless
    );

    // Upgrade to newest version of OpenAPI Spec if possile
    if (
      forceUpdate ||
      openapiSpecInstallStatus.version !== openAPISpecVersionToUpgradeTo ||
      openAPISpecVersionToUpgradeTo === LATEST_PRODUCT_VERSION
    ) {
      await this.installOpenAPISpec({
        version: openAPISpecVersionToUpgradeTo,
        inferenceId,
      });
    }
  }

  async installAll(params: { inferenceId?: string } = {}) {
    const { inferenceId } = params;
    const repositoryVersions = await fetchArtifactVersions(this.getArtifactRepositoryOptions());
    const allProducts = Object.values(DocumentationProduct) as ProductName[];
    const inferenceInfo = await this.getInferenceInfo(inferenceId);

    for (const productName of allProducts) {
      const availableVersions = repositoryVersions[productName];

      if (!availableVersions || !availableVersions.length) {
        this.log.warn(`No version found for product [${productName}]`);
        continue;
      }

      const shouldInstallLatest = this.isServerless;
      const selectedVersion = selectVersion(
        this.currentVersion,
        availableVersions,
        shouldInstallLatest
      );

      await this.installPackageWithVersionFallback({
        productName,
        selectedVersion,
        availableVersions,
        customInference: inferenceInfo,
      });
    }
  }

  private async installPackageWithVersionFallback({
    productName,
    selectedVersion,
    availableVersions,
    customInference,
  }: {
    productName: ProductName;
    selectedVersion: string;
    availableVersions: string[];
    customInference?: InferenceInferenceEndpointInfo;
  }) {
    const fallbackVersions = getPreviousVersions(selectedVersion, availableVersions);
    const candidateVersions = [selectedVersion, ...fallbackVersions];
    const inferenceId = customInference?.inference_id ?? this.elserInferenceId;
    const installableVersion = await this.findInstallableProductVersion({
      productName,
      candidateVersions,
      inferenceId,
    });

    await this.installPackage({
      productName,
      productVersion: installableVersion,
      customInference,
    });
  }

  async installPackage({
    productName,
    productVersion,
    customInference,
  }: {
    productName: ProductName;
    productVersion: string;
    customInference?: InferenceInferenceEndpointInfo;
  }) {
    const inferenceId = customInference?.inference_id ?? this.elserInferenceId;

    this.log.info(
      `Starting installing documentation for product [${productName}] and version [${productVersion}] with inference ID [${inferenceId}]`
    );

    // Artifact name will always be {doc}-latest.zip,
    // but we store the last modified date in productVersion for tracking (e.g. "latest-2026-01-27T23:25:54.727Z")
    // so that's the artifact product version we will use
    const artifactProductVersion = this.isServerless ? productVersion : majorMinor(productVersion);
    const artifactFileNameVersion = this.isServerless
      ? LATEST_PRODUCT_VERSION
      : majorMinor(productVersion);

    await this.uninstallPackage({ productName, inferenceId });

    let zipArchive: ZipArchive | undefined;
    try {
      await this.productDocClient.setInstallationStarted({
        productName,
        productVersion: artifactProductVersion,
        inferenceId,
      });

      if (customInference && !isDefaultLinuxElserInferenceId(customInference?.inference_id)) {
        if (customInference?.task_type !== 'text_embedding') {
          throw new Error(
            `Inference [${inferenceId}]'s task type ${customInference?.task_type} is not supported. Please use a model with task type 'text_embedding'.`
          );
        }
        await ensureInferenceDeployed({
          client: this.esClient,
          inferenceId,
        });
      }

      if (!customInference || isDefaultLinuxElserInferenceId(customInference?.inference_id)) {
        await ensureDefaultElserDeployed({
          client: this.esClient,
        });
      }

      const artifactFileName = getArtifactName({
        productName,
        productVersion: artifactFileNameVersion,
        inferenceId: customInference?.inference_id ?? this.elserInferenceId,
      });
      const artifactUrl = `${this.artifactRepositoryUrl}/${artifactFileName}`;
      const artifactPathAtVolume = `${this.artifactsFolder}/${artifactFileName}`;
      this.log.debug(`Downloading from [${artifactUrl}] to [${artifactPathAtVolume}]`);
      const artifactFullPath = await downloadToDisk(
        artifactUrl,
        artifactPathAtVolume,
        this.artifactRepositoryProxyUrl
      );

      zipArchive = await openZipArchive(artifactFullPath);
      validateArtifactArchive(zipArchive);

      const [manifest, mappings] = await Promise.all([
        loadManifestFile(zipArchive),
        loadMappingFile(zipArchive),
      ]);

      const manifestVersion = manifest.formatVersion;
      const indexName = getProductDocIndexName(productName, customInference?.inference_id);

      const modifiedMappings = cloneDeep(mappings);
      overrideInferenceSettings(modifiedMappings, inferenceId!);

      await createIndex({
        indexName,
        mappings: modifiedMappings, // Mappings will be overridden by the inference ID and inference type
        manifestVersion,
        esClient: this.esClient,
        log: this.log,
      });

      await populateIndex({
        indexName,
        manifestVersion,
        archive: zipArchive,
        esClient: this.esClient,
        log: this.log,
        inferenceId,
      });
      await this.productDocClient.setInstallationSuccessful(productName, indexName, inferenceId);

      this.log.info(
        `Documentation installation successful for product [${productName}] and version [${productVersion}]`
      );
    } catch (e) {
      let message = e.message;
      if (message.includes('End of central directory record signature not found.')) {
        message = i18n.translate('aiInfra.productDocBase.packageInstaller.noArtifactAvailable', {
          values: {
            productName,
            productVersion,
            inferenceId,
          },
          defaultMessage:
            'No documentation artifact available for product [{productName}]/[{productVersion}] for Inference ID [{inferenceId}]. Please select a different model or contact your administrator.',
        });
      }
      this.log.error(
        `Error during documentation installation of product [${productName}]/[${productVersion}] : ${message}`
      );

      await this.productDocClient.setInstallationFailed(productName, message, inferenceId);
      throw e;
    } finally {
      zipArchive?.close();
    }
  }

  async uninstallPackage({
    productName,
    inferenceId,
  }: {
    productName: ProductName;
    inferenceId?: string;
  }) {
    const indexName = getProductDocIndexName(productName, inferenceId);
    await this.esClient.indices.delete(
      {
        index: indexName,
      },
      { ignore: [404] }
    );

    await this.productDocClient.setUninstalled(productName, inferenceId);
  }

  async uninstallAll(params: { inferenceId?: string; resourceType?: ResourceType } = {}) {
    const { inferenceId, resourceType } = params;
    const allProducts = Object.values(DocumentationProduct);
    for (const productName of allProducts) {
      await this.productDocClient.setUninstallationStarted(productName, inferenceId);
      await this.uninstallPackage({ productName, inferenceId });
    }
    if (resourceType === ResourceTypes.openapiSpec || !resourceType) {
      await this.uninstallOpenAPISpec({ inferenceId });
    }
  }

  // Security Labs methods

  /**
   * Install Security Labs content from the CDN.
   */
  async installSecurityLabs({
    version,
    inferenceId,
  }: {
    version?: string;
    inferenceId?: string;
  }): Promise<void> {
    const effectiveInferenceId = inferenceId || this.elserInferenceId;

    this.log.info(
      `Starting Security Labs installation${
        version ? ` for version [${version}]` : ''
      } with inference ID [${effectiveInferenceId}]`
    );

    // Uninstall existing Security Labs content first
    await this.uninstallSecurityLabs({ inferenceId: effectiveInferenceId });

    let zipArchive: ZipArchive | undefined;
    let selectedVersion: string | undefined;
    try {
      // ELSER can come in default linux variant
      if (isDefaultLinuxElserInferenceId(inferenceId)) {
        // Ensure ELSER is deployed
        await ensureDefaultElserDeployed({
          client: this.esClient,
        });
      } else {
        // or ARM which can be a different Inference id
        await ensureInferenceDeployed({ client: this.esClient, inferenceId: effectiveInferenceId });
      }

      // Determine version to install
      selectedVersion = version;
      if (!selectedVersion) {
        const availableVersions = await fetchSecurityLabsVersions(
          this.getArtifactRepositoryOptions()
        );
        if (availableVersions.length === 0) {
          throw new Error('No Security Labs versions available');
        }
        // Select the latest version
        selectedVersion = availableVersions.sort().reverse()[0];
      }

      await this.productDocClient.setSecurityLabsInstallationStarted({
        version: selectedVersion,
        inferenceId: effectiveInferenceId,
      });

      const artifactFileName = getSecurityLabsArtifactName({
        version: selectedVersion,
        inferenceId: effectiveInferenceId,
      });
      const artifactUrl = `${this.artifactRepositoryUrl}/${artifactFileName}`;
      const artifactPath = `${this.artifactsFolder}/${artifactFileName}`;

      this.log.debug(`Downloading Security Labs from [${artifactUrl}] to [${artifactPath}]`);
      const downloadedFullPath = await downloadToDisk(
        artifactUrl,
        artifactPath,
        this.artifactRepositoryProxyUrl
      );

      zipArchive = await openZipArchive(downloadedFullPath);
      validateArtifactArchive(zipArchive);

      const [manifest, mappings] = await Promise.all([
        loadManifestFile(zipArchive),
        loadMappingFile(zipArchive),
      ]);

      const manifestVersion = manifest.formatVersion;
      const indexName = getSecurityLabsIndexName(effectiveInferenceId);

      const modifiedMappings = cloneDeep(mappings);
      overrideInferenceSettings(modifiedMappings, effectiveInferenceId);

      await createIndex({
        indexName,
        mappings: modifiedMappings,
        manifestVersion,
        esClient: this.esClient,
        log: this.log,
      });

      await populateIndex({
        indexName,
        manifestVersion,
        archive: zipArchive,
        esClient: this.esClient,
        log: this.log,
        inferenceId: effectiveInferenceId,
      });

      await this.productDocClient.setSecurityLabsInstallationSuccessful({
        version: selectedVersion,
        indexName,
        inferenceId: effectiveInferenceId,
      });

      this.log.info(`Security Labs installation successful for version [${selectedVersion}]`);
    } catch (e) {
      let message = e.message;
      if (message.includes('End of central directory record signature not found.')) {
        message = i18n.translate(
          'aiInfra.productDocBase.packageInstaller.noSecurityLabsArtifactAvailable',
          {
            values: { inferenceId: effectiveInferenceId },
            defaultMessage:
              'No Security Labs artifact available for Inference ID [{inferenceId}]. Please contact your administrator.',
          }
        );
      }
      this.log.error(`Error during Security Labs installation: ${message}`);
      await this.productDocClient.setSecurityLabsInstallationFailed({
        version: selectedVersion,
        failureReason: message,
        inferenceId: effectiveInferenceId,
      });
      throw e;
    } finally {
      zipArchive?.close();
    }
  }

  /**
   * Uninstall Security Labs content.
   */
  async uninstallSecurityLabs({ inferenceId }: { inferenceId?: string }): Promise<void> {
    const indexName = getSecurityLabsIndexName(inferenceId);
    await this.esClient.indices.delete(
      {
        index: indexName,
      },
      { ignore: [404] }
    );
    if (inferenceId) {
      await this.productDocClient.setSecurityLabsUninstalled(inferenceId);
    }
    this.log.info(`Security Labs content uninstalled from index [${indexName}]`);
  }

  /**
   * Get the installation status of Security Labs content.
   */
  async getSecurityLabsStatus({
    inferenceId,
  }: {
    inferenceId?: string;
  }): Promise<SecurityLabsStatusResponse> {
    try {
      const effectiveInferenceId = inferenceId ?? this.elserInferenceId;
      const status = await this.productDocClient.getSecurityLabsInstallationStatus({
        inferenceId: effectiveInferenceId,
      });

      // Compute latest version (best-effort) for UX and auto-update checks.
      let repoLatestVersion: string | undefined;
      try {
        const versions = await fetchSecurityLabsVersions(this.getArtifactRepositoryOptions());
        if (versions.length > 0) {
          repoLatestVersion = versions.slice().sort().reverse()[0];
        }
      } catch (e) {
        // ignore
      }

      const installedVersion = status.version;
      const isUpdateAvailable =
        status.status === 'installed' &&
        Boolean(installedVersion) &&
        Boolean(repoLatestVersion) &&
        installedVersion !== repoLatestVersion;

      // If we have a saved-object based status, return it (augmented with update info).
      // (Backwards compatibility: if not found, fall back to index existence checks below.)
      if (status.status !== 'uninstalled' || status.version || status.failureReason) {
        return { ...status, latestVersion: repoLatestVersion, isUpdateAvailable };
      }

      const indexName = getSecurityLabsIndexName(effectiveInferenceId);
      const exists = await this.esClient.indices.exists({ index: indexName });
      if (!exists) return { status: 'uninstalled' };

      const countResponse = await this.esClient.count({ index: indexName });
      if (countResponse.count === 0) return { status: 'uninstalled' };

      // Unknown version (legacy install), but installed.
      return { status: 'installed', latestVersion: repoLatestVersion };
    } catch (error) {
      this.log.error(`Error checking Security Labs status: ${error.message}`);
      return {
        status: 'error',
        failureReason: error.message,
      };
    }
  }

  /**
   * Ensure Security Labs content is up to date, if currently installed.
   */
  async ensureSecurityLabsUpToDate(params: { inferenceId: string; forceUpdate?: boolean }) {
    const { inferenceId, forceUpdate } = params;
    const status = await this.productDocClient.getSecurityLabsInstallationStatus({ inferenceId });
    if (status.status !== 'installed') {
      return;
    }

    const availableVersions = await fetchSecurityLabsVersions(this.getArtifactRepositoryOptions());
    if (availableVersions.length === 0) {
      return;
    }
    const latest = availableVersions.sort().reverse()[0];
    const installedVersion = status.version;

    if (!forceUpdate && installedVersion && installedVersion === latest) {
      return;
    }

    await this.installSecurityLabs({ version: latest, inferenceId });
  }

  // OpenAPI Spec methods

  /**
   * Install OpenAPI Spec content from the artifact repository.
   */
  async installOpenAPISpec({
    version,
    inferenceId,
  }: {
    version?: string;
    inferenceId?: string;
  }): Promise<void> {
    const effectiveInferenceId = inferenceId || this.elserInferenceId;
    const selectedVersion = version || this.currentVersion;
    const stackVersion = await this.findInstallableOpenApiVersion({
      selectedVersion,
      inferenceId: effectiveInferenceId,
      explicitVersionProvided: Boolean(version),
    });

    this.log.info(
      `Starting OpenAPI Spec installation for version [${stackVersion}] with inference ID [${effectiveInferenceId}]`
    );

    let zipArchive: ZipArchive | undefined;
    try {
      await this.uninstallOpenAPISpec({ inferenceId: effectiveInferenceId });

      if (isDefaultLinuxElserInferenceId(effectiveInferenceId)) {
        // Ensure ELSER is deployed
        await ensureDefaultElserDeployed({
          client: this.esClient,
        });
      } else {
        // or ARM which can be a different Inference id
        await ensureInferenceDeployed({ client: this.esClient, inferenceId: effectiveInferenceId });
      }
      const artifactFileName = this.getOpenApiArtifactFileName({
        stackVersion,
        inferenceId: effectiveInferenceId,
      });
      const artifactUrl = `${this.artifactRepositoryUrl}/${artifactFileName}`;
      const artifactPath = `${this.artifactsFolder}/${artifactFileName}`;

      this.log.debug(`Downloading OpenAPI artifact from [${artifactUrl}] to [${artifactPath}]`);
      const downloadedFullPath = await downloadToDisk(
        artifactUrl,
        artifactPath,
        this.artifactRepositoryProxyUrl
      );

      zipArchive = await openZipArchive(downloadedFullPath);
      validateArtifactArchive(zipArchive);

      for (const { productName, indexName: unmodifiedIndexName } of OPEN_API_SPEC_PRODUCTS) {
        this.log.info(`Installing OpenAPI spec for ${productName}`);

        await this.productDocClient.setOpenapiSpecInstallationStarted({
          productName,
          productVersion: stackVersion,
          inferenceId: effectiveInferenceId,
        });

        // Load manifest and mappings from product folder
        const manifestPath = `${productName}/manifest.json`;
        const mappingsPath = `${productName}/mappings.json`;

        if (!zipArchive.hasEntry(manifestPath) || !zipArchive.hasEntry(mappingsPath)) {
          throw new Error(
            `Missing required files for ${productName}: ${manifestPath} or ${mappingsPath} not found in archive`
          );
        }

        const [manifestBuffer, mappingsBuffer] = await Promise.all([
          zipArchive.getEntryContent(manifestPath),
          zipArchive.getEntryContent(mappingsPath),
        ]);

        const manifest = JSON.parse(manifestBuffer.toString('utf-8'));
        const mappings = JSON.parse(mappingsBuffer.toString('utf-8'));

        const manifestVersion = manifest.formatVersion;
        const modifiedMappings = cloneDeep(mappings);
        overrideInferenceSettings(modifiedMappings, effectiveInferenceId);

        const indexName = `${unmodifiedIndexName}${
          !isImpliedDefaultElserInferenceId(effectiveInferenceId) ? `-${effectiveInferenceId}` : ''
        }`;
        // Create index
        await createIndex({
          indexName,
          mappings: modifiedMappings,
          manifestVersion,
          esClient: this.esClient,
          log: this.log,
        });

        // Populate index from product's content folder
        const contentPrefix = `${productName}/content/`;
        const contentEntries = zipArchive
          .getEntryPaths()
          .filter(
            (path) =>
              path.startsWith(contentPrefix) && path.match(/^.*\/content\/content-[0-9]+\.ndjson$/)
          );

        if (contentEntries.length === 0) {
          throw new Error(`No content files found for ${productName} in archive`);
        }

        for (const entryPath of contentEntries) {
          this.log.debug(`Indexing content for entry ${entryPath}`);
          const contentBuffer = await zipArchive.getEntryContent(entryPath);
          await this.indexContentFile({
            indexName,
            esClient: this.esClient,
            contentBuffer,
            manifestVersion,
            inferenceId: effectiveInferenceId,
          });
        }

        await this.productDocClient.setOpenapiSpecInstallationSuccessful({
          productName,
          productVersion: stackVersion,
          indexName,
          inferenceId: effectiveInferenceId,
        });

        this.log.info(`OpenAPI Spec installation successful for ${productName}`);
      }

      this.log.info(`OpenAPI Spec installation successful for version [${stackVersion}]`);
    } catch (e) {
      let message = e.message;
      if (isArtifactMissingError(e)) {
        message = i18n.translate(
          'aiInfra.productDocBase.packageInstaller.noOpenApiSpecArtifactAvailable',
          {
            values: { inferenceId: effectiveInferenceId, version: stackVersion },
            defaultMessage:
              'No OpenAPI Spec artifact available for version [{version}] and Inference ID [{inferenceId}]. Please contact your administrator.',
          }
        );
      }
      this.log.error(`Error during OpenAPI Spec installation: ${message}`);
      // Mark both products as failed
      for (const productName of [DocumentationProduct.elasticsearch, DocumentationProduct.kibana]) {
        await this.productDocClient.setOpenapiSpecInstallationFailed({
          productName: productName as 'elasticsearch' | 'kibana',
          productVersion: stackVersion,
          failureReason: message,
          inferenceId: effectiveInferenceId,
        });
      }
      throw e;
    } finally {
      zipArchive?.close();
    }
  }

  private async findInstallableProductVersion({
    productName,
    candidateVersions,
    inferenceId,
  }: {
    productName: ProductName;
    candidateVersions: string[];
    inferenceId: string;
  }): Promise<string> {
    let lastMissingError: Error | undefined;

    for (const candidateVersion of candidateVersions) {
      try {
        const artifactFileNameVersion = this.isServerless
          ? LATEST_PRODUCT_VERSION
          : majorMinor(candidateVersion);
        const artifactFileName = getArtifactName({
          productName,
          productVersion: artifactFileNameVersion,
          inferenceId,
        });
        await this.ensureArtifactArchiveAvailable(artifactFileName);
        return candidateVersion;
      } catch (error) {
        if (!isArtifactMissingError(error)) {
          throw error;
        }
        lastMissingError = error as Error;
        if (candidateVersion !== candidateVersions[0]) {
          this.log.warn(
            `Artifact for version [${candidateVersions[0]}] is unavailable for product [${productName}]. Retrying with fallback version [${candidateVersion}]`
          );
        }
      }
    }

    if (lastMissingError) {
      throw lastMissingError;
    }

    throw new Error(`No candidate versions available for product [${productName}]`);
  }

  private async findInstallableOpenApiVersion({
    selectedVersion,
    inferenceId,
    explicitVersionProvided,
  }: {
    selectedVersion: string;
    inferenceId: string;
    explicitVersionProvided: boolean;
  }): Promise<string> {
    const candidateVersions = [selectedVersion];
    let fallbackVersionsLoaded = false;

    if (!explicitVersionProvided) {
      const availableVersions = await this.fetchArtifactVersionsWithRetry();
      candidateVersions.push(...getPreviousVersions(selectedVersion, availableVersions.openapi));
      fallbackVersionsLoaded = true;
    }

    for (let candidateIndex = 0; candidateIndex < candidateVersions.length; candidateIndex++) {
      const stackVersion = candidateVersions[candidateIndex];
      const artifactFileName = this.getOpenApiArtifactFileName({
        stackVersion,
        inferenceId,
      });
      try {
        await this.ensureArtifactArchiveAvailable(artifactFileName);
        return stackVersion;
      } catch (error) {
        if (isArtifactMissingError(error) && explicitVersionProvided && !fallbackVersionsLoaded) {
          try {
            const availableVersions = await this.fetchArtifactVersionsWithRetry();
            candidateVersions.push(
              ...getPreviousVersions(selectedVersion, availableVersions.openapi)
            );
          } catch (fetchError) {
            this.log.warn(
              `Failed to fetch OpenAPI fallback versions after missing explicit version [${selectedVersion}]: ${
                (fetchError as Error).message
              }`
            );
          } finally {
            fallbackVersionsLoaded = true;
          }
        }

        if (isArtifactMissingError(error) && candidateIndex !== candidateVersions.length - 1) {
          this.log.warn(
            `OpenAPI artifact for version [${stackVersion}] is unavailable. Retrying with older version.`
          );
          continue;
        }
        throw error;
      }
    }

    throw new Error(
      `No installable OpenAPI artifact found for selected version [${selectedVersion}]`
    );
  }

  private getOpenApiArtifactFileName({
    stackVersion,
    inferenceId,
  }: {
    stackVersion: string;
    inferenceId: string;
  }): string {
    const inferenceIdSuffix = isImpliedDefaultElserInferenceId(inferenceId)
      ? ''
      : `--${inferenceId}`;
    return `kb-product-doc-openapi-${stackVersion}${inferenceIdSuffix}.zip`;
  }

  private async ensureArtifactArchiveAvailable(artifactFileName: string): Promise<void> {
    const artifactUrl = `${this.artifactRepositoryUrl}/${artifactFileName}`;
    const precheckArtifactPath = `${
      this.artifactsFolder
    }/.precheck-${Date.now()}-${artifactFileName}`;
    let zipArchive: ZipArchive | undefined;
    try {
      const downloadedFullPath = await downloadToDisk(
        artifactUrl,
        precheckArtifactPath,
        this.artifactRepositoryProxyUrl
      );
      zipArchive = await openZipArchive(downloadedFullPath);
      const validationResult = validateArtifactArchive(zipArchive);
      if (!validationResult.valid) {
        throw new Error(`Artifact archive validation failed: ${validationResult.error}`);
      }
    } finally {
      zipArchive?.close();
      await Fs.unlink(precheckArtifactPath).catch(() => {});
    }
  }

  private async fetchArtifactVersionsWithRetry(retries = 3) {
    let lastError: Error | undefined;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await fetchArtifactVersions(this.getArtifactRepositoryOptions());
      } catch (error) {
        lastError = error as Error;
        if (attempt < retries) {
          await sleep(1000 * attempt);
        }
      }
    }
    throw lastError ?? new Error('Failed to fetch artifact versions');
  }

  async uninstallOpenAPISpec({ inferenceId }: { inferenceId?: string }): Promise<void> {
    for (const { indexName } of OPEN_API_SPEC_PRODUCTS) {
      this.log.info(`Uninstalling OpenAPI Spec from index [${indexName}]`);
      await this.esClient.indices.delete({ index: indexName }, { ignore: [404] });
      await this.productDocClient.setOpenapiSpecUninstalled(inferenceId);
    }
  }

  private async indexContentFile({
    indexName,
    esClient,
    contentBuffer,
    manifestVersion,
    inferenceId,
  }: {
    indexName: string;
    esClient: ElasticsearchClient;
    contentBuffer: Buffer;
    manifestVersion: string;
    inferenceId: string;
  }): Promise<void> {
    const legacySemanticText = isLegacySemanticTextVersion(manifestVersion);

    const fileContent = contentBuffer.toString('utf-8');
    const lines = fileContent.split('\n');

    const documents = lines
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line))
      .map((doc) => this.rewriteInferenceId(doc, inferenceId, legacySemanticText));

    const operations: Array<{ index: { _index: string } } | Record<string, any>> = [];
    for (const document of documents) {
      operations.push({ index: { _index: indexName } }, document);
    }

    const response = await esClient.bulk({
      refresh: false,
      operations,
    });

    if (response.errors) {
      const error =
        response.items.find((item) => item.index?.error)?.index?.error ?? 'unknown error';
      throw new Error(`Error indexing documents: ${JSON.stringify(error)}`);
    }
  }

  private rewriteInferenceId(
    document: Record<string, any>,
    inferenceId: string,
    legacySemanticText: boolean
  ): Record<string, any> {
    // Clone the document to avoid mutating the original
    const clonedDoc = { ...document };

    if (legacySemanticText) {
      // For legacy semantic text, modify fields directly on the document
      Object.values(clonedDoc).forEach((field: any) => {
        if (field?.inference) {
          field.inference.inference_id = inferenceId;
        }
      });
    } else {
      // For non-legacy semantic text, modify fields within _inference_fields
      if (clonedDoc._inference_fields) {
        // Clone _inference_fields to avoid mutation issues
        clonedDoc._inference_fields = { ...clonedDoc._inference_fields };
        Object.values(clonedDoc._inference_fields).forEach((field: any) => {
          if (field?.inference) {
            field.inference = { ...field.inference, inference_id: inferenceId };
          }
        });
      }
    }

    return clonedDoc;
  }

  /**
   * Get the installation status of OpenAPI Spec content.
   */
  async getOpenApiSpecStatus({
    inferenceId,
  }: {
    inferenceId?: string;
  }): Promise<SecurityLabsStatusResponse> {
    try {
      const effectiveInferenceId = inferenceId ?? this.elserInferenceId;
      const status = await this.productDocClient.getOpenapiSpecInstallationStatus({
        inferenceId: effectiveInferenceId,
      });

      return status;
    } catch (error) {
      this.log.error(`Error checking OpenAPI Spec status: ${error.message}`);
      return {
        status: 'error',
        failureReason: error.message,
      };
    }
  }
}

const selectVersion = (
  currentVersion: string,
  availableVersions: string[],
  isServerless: boolean
): string => {
  const latestAvailableVersion = availableVersions.includes(currentVersion)
    ? currentVersion
    : latestVersion(availableVersions, currentVersion);

  if (isServerless) {
    const latestServerlessVersions = availableVersions.filter((version) =>
      version.includes(LATEST_PRODUCT_VERSION)
    );
    return latestServerlessVersions.length > 0
      ? latestServerlessVersions[0]
      : latestAvailableVersion;
  }
  return latestAvailableVersion;
};

const isArtifactMissingError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return (
    error.message.includes('End of central directory record signature not found.') ||
    error.message.includes('No such file or directory') ||
    error.message.includes('ENOENT')
  );
};

const getPreviousVersions = (selectedVersion: string, availableVersions: string[]): string[] => {
  const selectedSemver = Semver.coerce(selectedVersion);
  const selectedLatestTimestamp = extractLatestVersionTimestamp(selectedVersion);

  if (selectedLatestTimestamp !== undefined) {
    return availableVersions
      .map((version) => ({
        version,
        timestamp: extractLatestVersionTimestamp(version),
      }))
      .filter(
        (candidate): candidate is { version: string; timestamp: number } =>
          candidate.timestamp !== undefined && candidate.timestamp < selectedLatestTimestamp
      )
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((candidate) => candidate.version);
  }

  if (!selectedSemver) {
    return [];
  }

  return availableVersions
    .filter((version) => {
      const versionSemver = Semver.coerce(version);
      return Boolean(versionSemver && Semver.lt(versionSemver, selectedSemver));
    })
    .sort((a, b) => Semver.rcompare(Semver.coerce(a)!, Semver.coerce(b)!));
};

const extractLatestVersionTimestamp = (version: string): number | undefined => {
  const latestWithTimestampMatch = version.match(/^latest-(.+)$/);
  if (!latestWithTimestampMatch) {
    return undefined;
  }
  const timestamp = Date.parse(latestWithTimestampMatch[1]);
  return Number.isNaN(timestamp) ? undefined : timestamp;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
