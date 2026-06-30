/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  downloadToDiskMock,
  createIndexMock,
  populateIndexMock,
  loadMappingFileMock,
  loadManifestFileMock,
  openZipArchiveMock,
  validateArtifactArchiveMock,
  fetchArtifactVersionsMock,
  fetchSecurityLabsVersionsMock,
  ensureDefaultElserDeployedMock,
} from './package_installer.test.mocks';
import { cloneDeep } from 'lodash';
import type { ProductName } from '@kbn/product-doc-common';
import {
  getArtifactName,
  getProductDocIndexName,
  getSecurityLabsArtifactName,
  getSecurityLabsIndexName,
  DocumentationProduct,
} from '@kbn/product-doc-common';
import { elasticsearchServiceMock } from '@kbn/core/server/mocks';
import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { installClientMock } from '../doc_install_status/service.mock';
import type { ProductInstallState } from '../../../common/install_status';
import { PackageInstaller } from './package_installer';
import { defaultInferenceEndpoints } from '@kbn/inference-common';
import type { InferenceTaskType } from '@elastic/elasticsearch/lib/api/types';

const artifactsFolder = '/lost';
const artifactRepositoryUrl = 'https://repository.com';
const artifactRepositoryProxyUrl = 'http://proxy.example.com:3128';
const kibanaVersion = '8.16.3';

const callOrder = (fn: { mock: { invocationCallOrder: number[] } }): number => {
  return fn.mock.invocationCallOrder[0];
};

const TEST_FORMAT_VERSION = '2.0.0';

describe('PackageInstaller', () => {
  let logger: MockedLogger;
  let esClient: ReturnType<typeof elasticsearchServiceMock.createElasticsearchClient>;
  let productDocClient: ReturnType<typeof installClientMock.create>;

  let packageInstaller: PackageInstaller;

  beforeEach(() => {
    logger = loggerMock.create();
    esClient = elasticsearchServiceMock.createElasticsearchClient();
    productDocClient = installClientMock.create();
    packageInstaller = new PackageInstaller({
      artifactsFolder,
      logger,
      esClient,
      productDocClient,
      artifactRepositoryUrl,
      kibanaVersion,
    });

    loadManifestFileMock.mockResolvedValue({
      formatVersion: TEST_FORMAT_VERSION,
      productName: 'kibana',
      productVersion: '8.17',
    });

    validateArtifactArchiveMock.mockReturnValue({ valid: true });
  });

  afterEach(() => {
    downloadToDiskMock.mockReset();
    createIndexMock.mockReset();
    populateIndexMock.mockReset();
    loadMappingFileMock.mockReset();
    loadManifestFileMock.mockReset();
    openZipArchiveMock.mockReset();
    validateArtifactArchiveMock.mockReset();
    fetchArtifactVersionsMock.mockReset();
    fetchSecurityLabsVersionsMock.mockReset();
    ensureDefaultElserDeployedMock.mockReset();
  });

  describe('installPackage', () => {
    it('calls the steps with the right parameters', async () => {
      const zipArchive = {
        close: jest.fn(),
      };
      openZipArchiveMock.mockResolvedValue(zipArchive);

      const artifactName = getArtifactName({
        productName: 'kibana',
        productVersion: '8.16',
      });

      downloadToDiskMock.mockResolvedValue(`${artifactsFolder}/${artifactName}`);

      const mappings = {
        properties: {
          semantic: {
            inference_id: '.elser',
            type: 'semantic_text',
            model_settings: {},
          },
        },
      };
      loadMappingFileMock.mockResolvedValue(mappings);

      await packageInstaller.installPackage({ productName: 'kibana', productVersion: '8.16' });

      const indexName = getProductDocIndexName('kibana');

      expect(ensureDefaultElserDeployedMock).toHaveBeenCalledTimes(1);

      expect(downloadToDiskMock).toHaveBeenCalledTimes(1);
      expect(downloadToDiskMock).toHaveBeenCalledWith(
        `${artifactRepositoryUrl}/${artifactName}`,
        `${artifactsFolder}/${artifactName}`,
        undefined
      );

      expect(openZipArchiveMock).toHaveBeenCalledTimes(1);
      expect(openZipArchiveMock).toHaveBeenCalledWith(`${artifactsFolder}/${artifactName}`);

      expect(loadMappingFileMock).toHaveBeenCalledTimes(1);
      expect(loadMappingFileMock).toHaveBeenCalledWith(zipArchive);

      expect(loadManifestFileMock).toHaveBeenCalledTimes(1);
      expect(loadManifestFileMock).toHaveBeenCalledWith(zipArchive);

      expect(createIndexMock).toHaveBeenCalledTimes(1);
      const modifiedMappings = cloneDeep(mappings);
      modifiedMappings.properties.semantic.inference_id = defaultInferenceEndpoints.ELSER;
      expect(createIndexMock).toHaveBeenCalledWith({
        indexName,
        mappings: modifiedMappings,
        manifestVersion: TEST_FORMAT_VERSION,
        esClient,
        log: logger,
      });

      expect(populateIndexMock).toHaveBeenCalledTimes(1);
      expect(populateIndexMock).toHaveBeenCalledWith({
        indexName,
        archive: zipArchive,
        manifestVersion: TEST_FORMAT_VERSION,
        inferenceId: defaultInferenceEndpoints.ELSER,
        esClient,
        log: logger,
      });

      expect(productDocClient.setInstallationSuccessful).toHaveBeenCalledTimes(1);
      expect(productDocClient.setInstallationSuccessful).toHaveBeenCalledWith(
        'kibana',
        indexName,
        defaultInferenceEndpoints.ELSER
      );

      expect(zipArchive.close).toHaveBeenCalledTimes(1);

      expect(productDocClient.setInstallationFailed).not.toHaveBeenCalled();
    });

    it('executes the steps in the right order', async () => {
      await packageInstaller.installPackage({ productName: 'kibana', productVersion: '8.16' });

      expect(callOrder(ensureDefaultElserDeployedMock)).toBeLessThan(callOrder(downloadToDiskMock));
      expect(callOrder(downloadToDiskMock)).toBeLessThan(callOrder(openZipArchiveMock));
      expect(callOrder(openZipArchiveMock)).toBeLessThan(callOrder(loadMappingFileMock));
      expect(callOrder(loadMappingFileMock)).toBeLessThan(callOrder(createIndexMock));
      expect(callOrder(loadManifestFileMock)).toBeLessThan(callOrder(createIndexMock));
      expect(callOrder(createIndexMock)).toBeLessThan(callOrder(populateIndexMock));
      expect(callOrder(populateIndexMock)).toBeLessThan(
        callOrder(productDocClient.setInstallationSuccessful)
      );
    });

    it('closes the archive and calls setInstallationFailed if the installation fails', async () => {
      const zipArchive = {
        close: jest.fn(),
      };
      openZipArchiveMock.mockResolvedValue(zipArchive);

      populateIndexMock.mockImplementation(async () => {
        throw new Error('something bad');
      });

      await expect(
        packageInstaller.installPackage({
          productName: 'kibana',
          productVersion: '8.16',
          customInference: {
            inference_id: defaultInferenceEndpoints.ELSER,
            task_type: 'text_embedding' as InferenceTaskType,
            service: 'elser',
            service_settings: {},
          },
        })
      ).rejects.toThrowError();

      expect(productDocClient.setInstallationSuccessful).not.toHaveBeenCalled();

      expect(zipArchive.close).toHaveBeenCalledTimes(1);

      expect(logger.error).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error during documentation installation')
      );

      expect(productDocClient.setInstallationFailed).toHaveBeenCalledTimes(1);
      expect(productDocClient.setInstallationFailed).toHaveBeenCalledWith(
        'kibana',
        'something bad',
        defaultInferenceEndpoints.ELSER
      );
    });
  });

  describe('installALl', () => {
    it('installs all the packages to their latest version', async () => {
      jest.spyOn(packageInstaller, 'installPackage');

      fetchArtifactVersionsMock.mockResolvedValue({
        kibana: ['8.15', '8.16'],
        elasticsearch: ['8.15'],
      });

      await packageInstaller.installAll({ inferenceId: defaultInferenceEndpoints.ELSER });

      expect(packageInstaller.installPackage).toHaveBeenCalledTimes(2);

      expect(packageInstaller.installPackage).toHaveBeenCalledWith({
        productName: 'kibana',
        productVersion: '8.16',
      });
      expect(packageInstaller.installPackage).toHaveBeenCalledWith({
        productName: 'elasticsearch',
        productVersion: '8.15',
      });
    });

    it('falls back to previous version when selected artifact is missing', async () => {
      jest.spyOn(packageInstaller, 'installPackage').mockResolvedValue(undefined as never);

      fetchArtifactVersionsMock.mockResolvedValue({
        kibana: ['8.15', '8.16'],
      });

      openZipArchiveMock.mockImplementationOnce(async () => {
        throw new Error('End of central directory record signature not found.');
      });
      openZipArchiveMock.mockResolvedValue({
        close: jest.fn(),
      });

      await packageInstaller.installAll();

      expect(packageInstaller.installPackage).toHaveBeenCalledTimes(1);
      expect(packageInstaller.installPackage).toHaveBeenCalledWith({
        productName: 'kibana',
        productVersion: '8.15',
        customInference: undefined,
      });
    });
  });

  describe('ensureUpToDate', () => {
    it('updates the installed packages to the latest version', async () => {
      fetchArtifactVersionsMock.mockResolvedValue({
        kibana: ['8.15', '8.16'],
        security: ['8.15', '8.16'],
        elasticsearch: ['8.15'],
        openapi: [],
      });

      productDocClient.getInstallationStatus.mockResolvedValue({
        kibana: { status: 'installed', version: '8.15' },
        security: { status: 'installed', version: '8.16' },
        elasticsearch: { status: 'uninstalled' },
      } as Record<ProductName, ProductInstallState>);

      productDocClient.getOpenapiSpecInstallationStatus.mockResolvedValue({
        status: 'uninstalled',
      });

      jest.spyOn(packageInstaller, 'installPackage');

      await packageInstaller.ensureUpToDate({ inferenceId: defaultInferenceEndpoints.ELSER });

      expect(packageInstaller.installPackage).toHaveBeenCalledTimes(1);
      expect(packageInstaller.installPackage).toHaveBeenCalledWith({
        productName: 'kibana',
        productVersion: '8.16',
      });
    });

    it('passes the artifact repository proxy URL when fetching versions', async () => {
      const proxyPackageInstaller = new PackageInstaller({
        artifactsFolder,
        logger,
        esClient,
        productDocClient,
        artifactRepositoryUrl,
        artifactRepositoryProxyUrl,
        kibanaVersion,
      });

      fetchArtifactVersionsMock.mockResolvedValue({
        kibana: ['8.16'],
        security: [],
        elasticsearch: [],
        observability: [],
        openapi: [],
      });

      productDocClient.getInstallationStatus.mockResolvedValue({
        kibana: { status: 'uninstalled' },
        security: { status: 'uninstalled' },
        elasticsearch: { status: 'uninstalled' },
        observability: { status: 'uninstalled' },
      } as Record<ProductName, ProductInstallState>);

      productDocClient.getOpenapiSpecInstallationStatus.mockResolvedValue({
        status: 'uninstalled',
      });

      await proxyPackageInstaller.ensureUpToDate({ inferenceId: defaultInferenceEndpoints.ELSER });

      expect(fetchArtifactVersionsMock).toHaveBeenCalledWith({
        artifactRepositoryUrl,
        artifactRepositoryProxyUrl,
      });
    });
  });

  describe('artifact repository proxy', () => {
    let proxyPackageInstaller: PackageInstaller;

    beforeEach(() => {
      proxyPackageInstaller = new PackageInstaller({
        artifactsFolder,
        logger,
        esClient,
        productDocClient,
        artifactRepositoryUrl,
        artifactRepositoryProxyUrl,
        kibanaVersion,
      });
    });

    it('passes the proxy URL to fetchArtifactVersions in installAll', async () => {
      jest.spyOn(proxyPackageInstaller, 'installPackage').mockResolvedValue(undefined as never);

      fetchArtifactVersionsMock.mockResolvedValue({
        kibana: ['8.16'],
      });

      await proxyPackageInstaller.installAll();

      expect(fetchArtifactVersionsMock).toHaveBeenCalledWith({
        artifactRepositoryUrl,
        artifactRepositoryProxyUrl,
      });
    });

    it('passes the proxy URL to downloadToDisk in installPackage', async () => {
      const zipArchive = {
        close: jest.fn(),
      };
      openZipArchiveMock.mockResolvedValue(zipArchive);
      downloadToDiskMock.mockResolvedValue(`${artifactsFolder}/artifact.zip`);

      await proxyPackageInstaller.installPackage({ productName: 'kibana', productVersion: '8.16' });

      expect(downloadToDiskMock).toHaveBeenCalledWith(
        expect.stringContaining(artifactRepositoryUrl),
        expect.any(String),
        artifactRepositoryProxyUrl
      );
    });
  });

  describe('uninstallPackage', () => {
    it('performs the uninstall steps', async () => {
      await packageInstaller.uninstallPackage({ productName: 'kibana' });

      expect(esClient.indices.delete).toHaveBeenCalledTimes(1);
      expect(esClient.indices.delete).toHaveBeenCalledWith(
        {
          index: getProductDocIndexName('kibana'),
        },
        expect.objectContaining({ ignore: [404] })
      );

      expect(productDocClient.setUninstalled).toHaveBeenCalledTimes(1);
      expect(productDocClient.setUninstalled).toHaveBeenCalledWith('kibana', undefined);
    });
  });

  describe('uninstallAll', () => {
    it('calls uninstall for all packages', async () => {
      jest.spyOn(packageInstaller, 'uninstallPackage');
      const totalProducts = Object.keys(DocumentationProduct).length;
      await packageInstaller.uninstallAll();

      expect(productDocClient.setUninstallationStarted).toHaveBeenCalledTimes(totalProducts);

      expect(packageInstaller.uninstallPackage).toHaveBeenCalledTimes(totalProducts);
      Object.values(DocumentationProduct).forEach((productName) => {
        expect(packageInstaller.uninstallPackage).toHaveBeenCalledWith({ productName });
      });
      expect(productDocClient.setUninstalled).toHaveBeenCalledTimes(totalProducts);
    });
  });

  describe('installSecurityLabs', () => {
    const VERSION_OLD = '2025.12.01';
    const VERSION_NEW = '2025.12.12';

    it('downloads and installs the latest version when no version is provided', async () => {
      const zipArchive = { close: jest.fn() };
      openZipArchiveMock.mockResolvedValue(zipArchive);
      fetchSecurityLabsVersionsMock.mockResolvedValue([VERSION_OLD, VERSION_NEW]);
      downloadToDiskMock.mockResolvedValue(
        `${artifactsFolder}/${getSecurityLabsArtifactName({ version: VERSION_NEW })}`
      );

      const mappings = {
        properties: {
          semantic: {
            inference_id: '.elser',
            type: 'semantic_text',
            model_settings: {},
          },
        },
      };
      loadMappingFileMock.mockResolvedValue(mappings);
      loadManifestFileMock.mockResolvedValue({ formatVersion: TEST_FORMAT_VERSION } as any);

      await packageInstaller.installSecurityLabs({ inferenceId: defaultInferenceEndpoints.ELSER });

      const artifactName = getSecurityLabsArtifactName({
        version: VERSION_NEW,
        inferenceId: defaultInferenceEndpoints.ELSER,
      });
      const indexName = getSecurityLabsIndexName(defaultInferenceEndpoints.ELSER);

      expect(ensureDefaultElserDeployedMock).toHaveBeenCalledTimes(1);

      expect(fetchSecurityLabsVersionsMock).toHaveBeenCalledTimes(1);
      expect(downloadToDiskMock).toHaveBeenCalledWith(
        `${artifactRepositoryUrl}/${artifactName}`,
        `${artifactsFolder}/${artifactName}`,
        undefined
      );

      // Critical: openZipArchive must use the full path returned by downloadToDisk.
      expect(openZipArchiveMock).toHaveBeenCalledWith(`${artifactsFolder}/${artifactName}`);

      expect(createIndexMock).toHaveBeenCalledTimes(1);
      const modifiedMappings = cloneDeep(mappings);
      modifiedMappings.properties.semantic.inference_id = defaultInferenceEndpoints.ELSER;
      expect(createIndexMock).toHaveBeenCalledWith({
        indexName,
        mappings: modifiedMappings,
        manifestVersion: TEST_FORMAT_VERSION,
        esClient,
        log: logger,
      });

      expect(populateIndexMock).toHaveBeenCalledTimes(1);
      expect(populateIndexMock).toHaveBeenCalledWith({
        indexName,
        archive: zipArchive,
        manifestVersion: TEST_FORMAT_VERSION,
        inferenceId: defaultInferenceEndpoints.ELSER,
        esClient,
        log: logger,
      });

      expect(productDocClient.setSecurityLabsInstallationStarted).toHaveBeenCalledWith({
        version: VERSION_NEW,
        inferenceId: defaultInferenceEndpoints.ELSER,
      });
      expect(productDocClient.setSecurityLabsInstallationSuccessful).toHaveBeenCalledWith({
        version: VERSION_NEW,
        indexName,
        inferenceId: defaultInferenceEndpoints.ELSER,
      });

      expect(zipArchive.close).toHaveBeenCalledTimes(1);
    });

    it('calls setSecurityLabsInstallationFailed if installation fails', async () => {
      const zipArchive = { close: jest.fn() };
      openZipArchiveMock.mockResolvedValue(zipArchive);
      fetchSecurityLabsVersionsMock.mockResolvedValue([VERSION_NEW]);
      const artifactName = getSecurityLabsArtifactName({
        version: VERSION_NEW,
        inferenceId: defaultInferenceEndpoints.ELSER,
      });
      downloadToDiskMock.mockResolvedValue(`${artifactsFolder}/${artifactName}`);

      populateIndexMock.mockImplementation(async () => {
        throw new Error('something bad');
      });

      await expect(
        packageInstaller.installSecurityLabs({ inferenceId: defaultInferenceEndpoints.ELSER })
      ).rejects.toThrowError();

      expect(productDocClient.setSecurityLabsInstallationFailed).toHaveBeenCalledWith({
        version: VERSION_NEW,
        failureReason: 'something bad',
        inferenceId: defaultInferenceEndpoints.ELSER,
      });

      expect(zipArchive.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('installOpenAPISpec', () => {
    const getOpenApiArchive = () => ({
      close: jest.fn(),
      hasEntry: jest.fn().mockReturnValue(true),
      getEntryPaths: jest
        .fn()
        .mockReturnValue([
          'kibana/content/content-0.ndjson',
          'elasticsearch/content/content-0.ndjson',
        ]),
      getEntryContent: jest.fn().mockImplementation(async (entryPath: string) => {
        if (entryPath.endsWith('manifest.json')) {
          return Buffer.from(JSON.stringify({ formatVersion: TEST_FORMAT_VERSION }), 'utf-8');
        }
        if (entryPath.endsWith('mappings.json')) {
          return Buffer.from(JSON.stringify({ properties: {} }), 'utf-8');
        }
        return Buffer.from(
          JSON.stringify({
            _inference_fields: {
              semantic: {
                inference: {
                  inference_id: defaultInferenceEndpoints.ELSER,
                },
              },
            },
          }),
          'utf-8'
        );
      }),
    });

    beforeEach(() => {
      esClient.bulk.mockResolvedValue({ errors: false } as never);
    });

    it('does not fetch artifact versions when explicit version is directly installable', async () => {
      openZipArchiveMock
        .mockResolvedValueOnce({ close: jest.fn() }) // precheck
        .mockResolvedValueOnce(getOpenApiArchive()); // install
      downloadToDiskMock.mockResolvedValue('/tmp/openapi-explicit.zip');

      await packageInstaller.installOpenAPISpec({
        version: '8.16',
        inferenceId: defaultInferenceEndpoints.ELSER,
      });

      expect(fetchArtifactVersionsMock).not.toHaveBeenCalled();
      expect(productDocClient.setOpenapiSpecInstallationStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          productVersion: '8.16',
          inferenceId: defaultInferenceEndpoints.ELSER,
        })
      );
    });

    it('retries listing and falls back to previous explicit version when selected is missing', async () => {
      openZipArchiveMock
        .mockImplementationOnce(async () => {
          throw new Error('End of central directory record signature not found.');
        }) // explicit precheck miss
        .mockResolvedValueOnce({ close: jest.fn() }) // fallback precheck success
        .mockResolvedValueOnce(getOpenApiArchive()); // install fallback
      downloadToDiskMock.mockResolvedValue('/tmp/openapi-fallback.zip');

      fetchArtifactVersionsMock
        .mockRejectedValueOnce(new Error('temporary listing failure'))
        .mockResolvedValueOnce({
          openapi: ['8.16', '8.15'],
        });

      await packageInstaller.installOpenAPISpec({
        version: '8.16',
        inferenceId: defaultInferenceEndpoints.ELSER,
      });

      expect(fetchArtifactVersionsMock).toHaveBeenCalledTimes(2);
      expect(productDocClient.setOpenapiSpecInstallationStarted).toHaveBeenCalledWith(
        expect.objectContaining({
          productVersion: '8.15',
          inferenceId: defaultInferenceEndpoints.ELSER,
        })
      );
    });
  });
});
