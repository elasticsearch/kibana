/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  putComponentTemplate,
  putIndexTemplate,
  createIndex,
  deleteIndex,
  createDataStream,
  deleteDataStream,
} from '../../infra/elasticsearch';
import { ALL_ENTITY_TYPES } from '../../../common/domain/definitions/entity_schema';
import { getEntityDefinition } from '../../../common/domain/definitions/registry';
import { getLatestEntityIndexTemplateConfig } from './latest_index_template';
import {
  getLatestEntitiesIndexName,
  getEntitiesAlias,
  ENTITY_LATEST,
} from '../../../common/domain/entity_index';
import {
  getEntityDefinitionComponentTemplate,
  getUpdatesEntityDefinitionComponentTemplate,
} from './component_templates';
import { getHistorySnapshotIndexTemplateConfig } from './history_snapshot_index_template';
import { getUpdatesEntityIndexTemplateConfig } from './updates_index_template';
import { getUpdatesEntitiesDataStreamName } from './updates_data_stream';
import { installLatestIndexIngestPipeline } from './latest_index_ingest_pipeline';
import { getMetadataComponentTemplate } from './metadata_component_templates';
import { getMetadataEntityIndexTemplateConfig } from './metadata_index_template';
import { getMetadataEntitiesDataStreamName } from './metadata_data_stream';
import { installMetadataIndexIngestPipeline } from './metadata_index_ingest_pipeline';

interface SharedElasticsearchAssetOptions {
  esClient: ElasticsearchClient;
  logger: Logger;
  namespace: string;
}

/**
 * Installs all shared Elasticsearch assets and storage that must exist before per-entity
 * initialization begins: ingest pipeline, component templates (for ALL entity types),
 * index templates, the latest index, and the updates data stream.
 */
export async function installSharedElasticsearchAssets({
  esClient,
  logger,
  namespace,
}: SharedElasticsearchAssetOptions): Promise<void> {
  try {
    await installLatestIndexIngestPipeline(esClient, namespace, logger);
    await installMetadataIndexIngestPipeline(esClient, namespace, logger);
    await installAllComponentTemplates(esClient, namespace, logger);
    await installIndexTemplates(esClient, namespace, logger);
    await installIndicesAndDataStreams(esClient, namespace, logger);
  } catch (error) {
    logger.error(`error installing shared assets in ${namespace}: ${error}`);
    throw error;
  }
}

/**
 * Creates the latest index and updates data stream after the required templates are installed.
 */
export async function installIndicesAndDataStreams(
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
) {
  await Promise.all([
    (async () => {
      await createIndex(esClient, getLatestEntitiesIndexName(namespace), {
        throwIfExists: false,
        aliases: { [getEntitiesAlias(ENTITY_LATEST, namespace)]: {} },
      });
      logger.debug(`created latest entity index in ${namespace}`);
    })(),

    (async () => {
      await createDataStream(esClient, getUpdatesEntitiesDataStreamName(namespace), {
        throwIfExists: false,
      });
      logger.debug(`created updates entity data stream in ${namespace}`);
    })(),

    (async () => {
      await createDataStream(esClient, getMetadataEntitiesDataStreamName(namespace), {
        throwIfExists: false,
      });
      logger.debug(`created metadata entity data stream in ${namespace}`);
    })(),
  ]);
}

async function installIndexTemplates(
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
) {
  await Promise.all([
    (async () => {
      await putIndexTemplate(esClient, getLatestEntityIndexTemplateConfig(namespace));
      logger.debug(`installed latest index template in ${namespace}`);
    })(),

    (async () => {
      await putIndexTemplate(esClient, getUpdatesEntityIndexTemplateConfig(namespace));
      logger.debug(`installed updates index template in ${namespace}`);
    })(),

    (async () => {
      await putIndexTemplate(esClient, getHistorySnapshotIndexTemplateConfig(namespace));
      logger.debug(`installed history snapshot index template in ${namespace}`);
    })(),

    (async () => {
      await putIndexTemplate(esClient, getMetadataEntityIndexTemplateConfig(namespace));
      logger.debug(`installed metadata index template in ${namespace}`);
    })(),
  ]);
}

async function installAllComponentTemplates(
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
) {
  const definitions = ALL_ENTITY_TYPES.map((type) => getEntityDefinition(type, namespace));
  await Promise.all([
    ...definitions.flatMap((definition) => [
      (async () => {
        await putComponentTemplate(
          esClient,
          getEntityDefinitionComponentTemplate(definition, namespace)
        );
        logger.debug(`installed latest component template for: ${definition.type} in ${namespace}`);
      })(),
      (async () => {
        await putComponentTemplate(
          esClient,
          getUpdatesEntityDefinitionComponentTemplate(definition, namespace)
        );
        logger.debug(
          `installed updates component template for: ${definition.type} in ${namespace}`
        );
      })(),
    ]),
    (async () => {
      await putComponentTemplate(esClient, getMetadataComponentTemplate(namespace));
      logger.debug(`installed metadata component template in ${namespace}`);
    })(),
  ]);
}

// TODO: add retry
export async function uninstallElasticsearchAssets({
  esClient,
  logger,
  namespace,
}: SharedElasticsearchAssetOptions): Promise<void> {
  try {
    // Only delete indices and data streams.
    // Component templates, index templates, and ingest pipeline are kept intentionally
    // so they are always available for future installs, avoiding mapping race conditions.
    await uninstallIndicesAndDataStreams(esClient, namespace, logger);
  } catch (error) {
    logger.error(`error uninstalling assets: ${error}`);
    // TODO: degrade status?
    throw error;
  }
}

async function uninstallIndicesAndDataStreams(
  esClient: ElasticsearchClient,
  namespace: string,
  logger: Logger
) {
  await Promise.all([
    (async () => {
      await deleteIndex(esClient, getLatestEntitiesIndexName(namespace));
      logger.debug(`deleted entity index`);
    })(),
    (async () => {
      await deleteDataStream(esClient, getUpdatesEntitiesDataStreamName(namespace));
      logger.debug(`deleted entity updates data stream`);
    })(),
    (async () => {
      await deleteDataStream(esClient, getMetadataEntitiesDataStreamName(namespace));
      logger.debug(`deleted entity metadata data stream`);
    })(),
  ]);
}
