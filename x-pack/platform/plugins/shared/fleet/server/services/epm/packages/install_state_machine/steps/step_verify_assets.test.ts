/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { elasticsearchServiceMock, loggingSystemMock } from '@kbn/core/server/mocks';

import { ElasticsearchAssetType } from '../../../../../types';
import { PackageAssetsVerificationError } from '../../../../../errors';
import { verifyEsAssetsExist } from '../../verify_es_assets';

import { stepVerifyAssets } from './step_verify_assets';

jest.mock('../../verify_es_assets');
jest.mock('../../utils', () => ({
  withPackageSpan: (_label: string, fn: () => unknown) => fn(),
}));

const mockVerifyEsAssetsExist = verifyEsAssetsExist as jest.MockedFunction<
  typeof verifyEsAssetsExist
>;

describe('stepVerifyAssets', () => {
  const esClient = elasticsearchServiceMock.createElasticsearchClient();
  const logger = loggingSystemMock.createLogger();

  const esReferences = [
    { type: ElasticsearchAssetType.ingestPipeline, id: 'my-pipeline' },
    { type: ElasticsearchAssetType.indexTemplate, id: 'my-template' },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('completes without throwing when all assets are present', async () => {
    mockVerifyEsAssetsExist.mockResolvedValue([]);

    await expect(
      stepVerifyAssets({ esClient, logger, esReferences } as any)
    ).resolves.not.toThrow();
  });

  it('throws PackageAssetsVerificationError when assets are missing', async () => {
    const missing = [{ type: ElasticsearchAssetType.ingestPipeline, id: 'my-pipeline' }];
    mockVerifyEsAssetsExist.mockResolvedValue(missing as any);

    await expect(
      stepVerifyAssets({ esClient, logger, esReferences } as any)
    ).rejects.toThrow(PackageAssetsVerificationError);
  });

  it('passes missing assets in the error meta', async () => {
    const missing = [{ type: ElasticsearchAssetType.indexTemplate, id: 'my-template' }];
    mockVerifyEsAssetsExist.mockResolvedValue(missing as any);

    let thrown: PackageAssetsVerificationError | undefined;
    try {
      await stepVerifyAssets({ esClient, logger, esReferences } as any);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(PackageAssetsVerificationError);
    expect(thrown?.meta).toEqual([{ type: ElasticsearchAssetType.indexTemplate, id: 'my-template' }]);
  });

  it('reads esReferences from context.installedPkg when context.esReferences is absent', async () => {
    mockVerifyEsAssetsExist.mockResolvedValue([]);

    const installedPkg = {
      attributes: { installed_es: esReferences },
    };

    await stepVerifyAssets({ esClient, logger, installedPkg } as any);

    expect(mockVerifyEsAssetsExist).toHaveBeenCalledWith(esClient, esReferences, logger);
  });

  it('skips verification and does not call verifyEsAssetsExist when there are no refs', async () => {
    await stepVerifyAssets({ esClient, logger, esReferences: [] } as any);

    expect(mockVerifyEsAssetsExist).not.toHaveBeenCalled();
  });
});
