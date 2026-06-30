/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggerMock } from '@kbn/logging-mocks';
import { uninstallElasticsearchAssets } from './install_assets';
import { getLatestEntitiesIndexName } from '../../../common/domain/entity_index';
import { getUpdatesEntitiesDataStreamName } from './updates_data_stream';
import { getMetadataEntitiesDataStreamName } from './metadata_data_stream';

jest.mock('../../infra/elasticsearch');

const { deleteIndex, deleteDataStream } = jest.requireMock('../../infra/elasticsearch') as {
  deleteIndex: jest.Mock;
  deleteDataStream: jest.Mock;
};

describe('uninstallElasticsearchAssets', () => {
  const namespace = 'default';

  beforeEach(() => {
    jest.clearAllMocks();
    deleteIndex.mockResolvedValue(undefined);
    deleteDataStream.mockResolvedValue(undefined);
  });

  it('deletes the latest entities index', async () => {
    await uninstallElasticsearchAssets({
      esClient: {} as never,
      logger: loggerMock.create(),
      namespace,
    });

    expect(deleteIndex).toHaveBeenCalledWith(
      expect.anything(),
      getLatestEntitiesIndexName(namespace)
    );
  });

  it('deletes the updates data stream', async () => {
    await uninstallElasticsearchAssets({
      esClient: {} as never,
      logger: loggerMock.create(),
      namespace,
    });

    expect(deleteDataStream).toHaveBeenCalledWith(
      expect.anything(),
      getUpdatesEntitiesDataStreamName(namespace)
    );
  });

  it('deletes the metadata data stream so Clear Entity Data removes relationship history', async () => {
    await uninstallElasticsearchAssets({
      esClient: {} as never,
      logger: loggerMock.create(),
      namespace,
    });

    expect(deleteDataStream).toHaveBeenCalledWith(
      expect.anything(),
      getMetadataEntitiesDataStreamName(namespace)
    );
    // Verify the resolved name matches the entity metadata datastream that
    // relationship maintainers write to.
    expect(getMetadataEntitiesDataStreamName(namespace)).toBe(
      '.entities.v2.metadata.security_default'
    );
  });

  it('deletes all three resources in a single uninstall call', async () => {
    await uninstallElasticsearchAssets({
      esClient: {} as never,
      logger: loggerMock.create(),
      namespace,
    });

    expect(deleteIndex).toHaveBeenCalledTimes(1);
    expect(deleteDataStream).toHaveBeenCalledTimes(2);
  });
});
