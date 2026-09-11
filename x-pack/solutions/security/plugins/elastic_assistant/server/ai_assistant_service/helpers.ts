/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { MlPluginSetup } from '@kbn/ml-plugin/server';
import type { DeleteByQueryRequest } from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import type { ProductDocBaseStartContract } from '@kbn/product-doc-base-plugin/server';
import type { Logger } from '@kbn/logging';
import { resolveDefaultInferenceIdFromInferenceGet } from '@kbn/product-doc-common';
import { getResourceName } from '.';
import { knowledgeBaseIngestPipeline } from '../ai_assistant_data_clients/knowledge_base/ingest_pipeline';
import type { GetElser } from '../types';

/**
 * Creates a function that returns the ELSER model ID
 *
 * @param ml
 */
export const createGetElserId =
  (trainedModelsProvider: MlPluginSetup['trainedModelsProvider']): GetElser =>
  async () =>
    // Force check to happen as internal user
    (
      await trainedModelsProvider(
        {} as KibanaRequest,
        { getCurrentNamespace: () => undefined } as SavedObjectsClientContract
      ).getELSER()
    ).model_id;

interface PipelineExistsParams {
  esClient: ElasticsearchClient;
  id: string;
}

/**
 * Checks if the provided ingest pipeline exists in Elasticsearch
 *
 * @param params params
 * @param params.esClient Elasticsearch client with privileges to check for ingest pipelines
 * @param params.id ID of the ingest pipeline to check
 *
 * @returns Promise<boolean> indicating whether the pipeline exists
 */
export const pipelineExists = async ({ esClient, id }: PipelineExistsParams): Promise<boolean> => {
  try {
    const response = await esClient.ingest.getPipeline({
      id,
    });
    return Object.keys(response).length > 0;
  } catch (e) {
    // The GET /_ingest/pipeline/{pipelineId} API returns an empty object w/ 404 Not Found.
    return false;
  }
};

interface CreatePipelineParams {
  esClient: ElasticsearchClient;
  id: string;
}

/**
 * Create ingest pipeline for ELSER in Elasticsearch
 *
 * @param params params
 * @param params.esClient Elasticsearch client with privileges to check for ingest pipelines
 * @param params.id ID of the ingest pipeline
 *
 * @returns Promise<boolean> indicating whether the pipeline was created
 */
export const createPipeline = async ({ esClient, id }: CreatePipelineParams): Promise<boolean> => {
  try {
    const response = await esClient.ingest.putPipeline(
      knowledgeBaseIngestPipeline({
        id,
      })
    );

    return response.acknowledged;
  } catch (e) {
    // TODO: log error or just use semantic_text already
    return false;
  }
};

interface DeletePipelineParams {
  esClient: ElasticsearchClient;
  id: string;
}

/**
 * Delete ingest pipeline for ELSER in Elasticsearch
 *
 * @returns Promise<boolean> indicating whether the pipeline was created
 */
export const deletePipeline = async ({ esClient, id }: DeletePipelineParams): Promise<boolean> => {
  const response = await esClient.ingest.deletePipeline({
    id,
  });

  return response.acknowledged;
};

export const removeLegacyQuickPrompt = async (esClient: ElasticsearchClient) => {
  try {
    const deleteQuery: DeleteByQueryRequest = {
      index: `${getResourceName('prompts')}-*`,
      query: {
        bool: {
          must: [
            {
              term: {
                name: ESQL_QUERY_GENERATION_TITLE,
              },
            },
            {
              term: {
                prompt_type: 'quick',
              },
            },
            {
              term: {
                is_default: true,
              },
            },
          ],
        },
      },
    };
    return esClient.deleteByQuery(deleteQuery);
  } catch (e) {
    // swallow any errors
    return {
      total: 0,
    };
  }
};

const ESQL_QUERY_GENERATION_TITLE = i18n.translate(
  'xpack.elasticAssistantPlugin.assistant.quickPrompts.esqlQueryGenerationTitle',
  {
    defaultMessage: 'ES|QL Query Generation',
  }
);

export const ensureProductDocumentationInstalled = async ({
  esClient,
  productDocManager,
  setIsProductDocumentationInProgress,
  logger,
}: {
  esClient: ElasticsearchClient;
  productDocManager: ProductDocBaseStartContract['management'];
  setIsProductDocumentationInProgress: (value: boolean) => void;
  logger: Logger;
}) => {
  try {
    const inferenceId = await resolveDefaultInferenceIdFromInferenceGet(() =>
      esClient.inference.get({})
    );
    const { status } = await productDocManager.getStatus({
      inferenceId,
    });
    if (status !== 'installed') {
      logger.debug(`Installing product documentation for AIAssistantService`);
      setIsProductDocumentationInProgress(true);
      try {
        await productDocManager.install({
          wait: true,
          inferenceId,
        });
        logger.debug(`Successfully installed product documentation for AIAssistantService`);
      } catch (e) {
        logger.warn(`Failed to install product documentation for AIAssistantService: ${e.message}`);
      } finally {
        setIsProductDocumentationInProgress(false);
      }
    }
  } catch (e) {
    logger.warn(
      `Failed to get status of product documentation installation for AIAssistantService: ${e.message}`
    );
  }
};
