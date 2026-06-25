/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IRouter } from '@kbn/core/server';
import type { Logger } from '@kbn/logging';
import { buildRouteValidationWithZod } from '@kbn/zod-helpers/v4';
import type { AutomaticImportPluginRequestHandlerContext } from '../types';
import { buildAutomaticImportResponse, isSecurityExceptionError } from './utils';
import { withAvailability } from './with_availability';
import { AUTOMATIC_IMPORT_API_PRIVILEGES } from '../feature';
import {
  UploadSamplesToDataStreamRequestParams,
  DeleteDataStreamRequestParams,
  ReanalyzeDataStreamRequestParams,
  ReanalyzeDataStreamRequestBody,
  UploadSamplesToDataStreamRequestBody,
  UpdateDataStreamPipelineRequestBody,
} from '../../common';

export const registerDataStreamRoutes = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) => {
  uploadSamplesRoute(router, logger);
  deleteDataStreamRoute(router, logger);
  updateDataStreamPipelineRoute(router, logger);
  getDataStreamResultsRoute(router, logger);
  reanalyzeDataStreamRoute(router, logger);
};

const uploadSamplesRoute = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) =>
  router.versioned
    .post({
      access: 'internal',
      path: '/api/automatic_import/integrations/{integration_id}/data_streams/{data_stream_id}/upload',
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.MANAGE}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(UploadSamplesToDataStreamRequestParams),
            body: buildRouteValidationWithZod(UploadSamplesToDataStreamRequestBody),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        try {
          const automaticImport = await context.automaticImport;
          const automaticImportService = automaticImport.automaticImportService;
          const currentUser = await automaticImport.getCurrentUser();
          const esClient = automaticImport.esClient;
          const { integration_id: integrationId, data_stream_id: dataStreamId } = request.params;
          const { samples, sourceIndex, originalSource } = request.body;

          let rawSamples: string[];
          if (sourceIndex) {
            if (sourceIndex.startsWith('.')) {
              return response.badRequest({
                body: 'Reading from system indices is not allowed.',
              });
            }

            const searchResult = await esClient.search({
              index: sourceIndex,
              size: 100,
              _source: ['event.original'],
              query: {
                function_score: {
                  query: { exists: { field: 'event.original' } },
                  functions: [{ random_score: {} }],
                },
              },
            });
            const hits = searchResult.hits.hits ?? [];
            rawSamples = hits.flatMap((hit) => {
              const original = (hit._source as { event?: { original?: string } } | undefined)?.event
                ?.original;
              return typeof original === 'string' && original.length > 0 ? [original] : [];
            });

            if (rawSamples.length === 0) {
              return response.badRequest({
                body: 'No documents with event.original found in the specified index.',
              });
            }
          } else if (samples && samples.length > 0) {
            rawSamples = samples;
          } else {
            return response.badRequest({
              body: 'Either samples or sourceIndex must be provided.',
            });
          }

          const result = await automaticImportService.addSamplesToDataStream({
            integrationId,
            dataStreamId,
            rawSamples,
            originalSource,
            createdBy: currentUser.username,
          });
          return response.ok({ body: result });
        } catch (err) {
          logger.error(`uploadSamplesRoute: Caught error: ${err}`);
          const automaticImportResponse = buildAutomaticImportResponse(response);
          if (isSecurityExceptionError(err)) {
            return automaticImportResponse.error({
              statusCode: 403,
              body: 'Missing required privileges to upload samples. This action requires Elasticsearch cluster privileges to manage index templates (for example: manage_index_templates).',
            });
          }
          return automaticImportResponse.error({
            statusCode: 500,
          });
        }
      })
    );

const deleteDataStreamRoute = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) =>
  router.versioned
    .delete({
      access: 'internal',
      path: '/api/automatic_import/integrations/{integration_id}/data_streams/{data_stream_id}',
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.MANAGE}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(DeleteDataStreamRequestParams),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        try {
          const automaticImport = await context.automaticImport;
          const automaticImportService = automaticImport.automaticImportService;
          const { integration_id: integrationId, data_stream_id: dataStreamId } = request.params;
          await automaticImportService.deleteDataStream(integrationId, dataStreamId);
          return response.ok();
        } catch (err) {
          logger.error(`deleteDataStreamRoute: Caught error:`, err);
          const automaticImportResponse = buildAutomaticImportResponse(response);
          return automaticImportResponse.error({
            statusCode: 500,
          });
        }
      })
    );

const updateDataStreamPipelineRoute = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) =>
  router.versioned
    .patch({
      access: 'internal',
      path: '/api/automatic_import/integrations/{integration_id}/data_streams/{data_stream_id}',
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.MANAGE}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(DeleteDataStreamRequestParams),
            body: buildRouteValidationWithZod(UpdateDataStreamPipelineRequestBody),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        try {
          const automaticImport = await context.automaticImport;
          const automaticImportService = automaticImport.automaticImportService;
          const { integration_id: integrationId, data_stream_id: dataStreamId } = request.params;
          const { ingest_pipeline: ingestPipeline } = request.body;

          const updatedResults = await automaticImportService.updateDataStreamPipeline({
            integrationId,
            dataStreamId,
            ingestPipeline,
            esClient: automaticImport.esClient,
            fieldsMetadataClient: automaticImport.fieldsMetadataClient,
          });

          return response.ok({ body: updatedResults });
        } catch (err) {
          logger.error(`updateDataStreamPipelineRoute: Caught error: ${err}`);
          const automaticImportResponse = buildAutomaticImportResponse(response);

          if (isSecurityExceptionError(err)) {
            return automaticImportResponse.error({
              statusCode: 403,
              body: 'Missing required Elasticsearch privileges. This action requires the manage_ingest_pipelines and manage_index_templates cluster privileges.',
            });
          }
          const rawMessage = err instanceof Error ? err.message : String(err);

          if (rawMessage.includes('Invalid ingest pipeline')) {
            return automaticImportResponse.error({
              statusCode: 400,
              body: 'Invalid ingest pipeline',
            });
          }
          if (rawMessage.includes('No samples found')) {
            return automaticImportResponse.error({
              statusCode: 400,
              body: 'No samples found for data stream',
            });
          }
          if (rawMessage.includes('Unexpected token')) {
            return automaticImportResponse.error({
              statusCode: 400,
              body: 'Invalid JSON in pipeline definition',
            });
          }
          return automaticImportResponse.error({ statusCode: 500 });
        }
      })
    );

const getDataStreamResultsRoute = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) =>
  router.versioned
    .get({
      access: 'internal',
      path: '/api/automatic_import/integrations/{integration_id}/data_streams/{data_stream_id}/results',
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.READ}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(DeleteDataStreamRequestParams),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        try {
          const automaticImport = await context.automaticImport;
          const automaticImportService = automaticImport.automaticImportService;
          const { integration_id: integrationId, data_stream_id: dataStreamId } = request.params;
          const result = await automaticImportService.getDataStreamResults(
            integrationId,
            dataStreamId
          );
          return response.ok({ body: result });
        } catch (err) {
          logger.error(`getDataStreamResultsRoute: Caught error:`, err);
          const automaticImportResponse = buildAutomaticImportResponse(response);
          const rawMessage = err instanceof Error ? err.message : String(err);

          if (rawMessage.includes('has not completed yet')) {
            return automaticImportResponse.error({
              statusCode: 400,
              body: 'Data stream analysis has not completed yet',
            });
          }
          if (rawMessage.includes('failed and has no results')) {
            return automaticImportResponse.error({
              statusCode: 400,
              body: 'Data stream analysis failed and has no results',
            });
          }
          return automaticImportResponse.error({ statusCode: 500 });
        }
      })
    );

const reanalyzeDataStreamRoute = (
  router: IRouter<AutomaticImportPluginRequestHandlerContext>,
  logger: Logger
) =>
  router.versioned
    .put({
      access: 'internal',
      path: '/api/automatic_import/integrations/{integration_id}/data_streams/{data_stream_id}/reanalyze',
      security: {
        authz: {
          requiredPrivileges: [`${AUTOMATIC_IMPORT_API_PRIVILEGES.MANAGE}`],
        },
      },
    })
    .addVersion(
      {
        version: '1',
        validate: {
          request: {
            params: buildRouteValidationWithZod(ReanalyzeDataStreamRequestParams),
            body: buildRouteValidationWithZod(ReanalyzeDataStreamRequestBody),
          },
        },
      },
      withAvailability(async (context, request, response) => {
        try {
          const automaticImport = await context.automaticImport;
          const automaticImportService = automaticImport.automaticImportService;
          const { integration_id: integrationId, data_stream_id: dataStreamId } = request.params;
          const { connectorId, langSmithOptions } = request.body;

          await automaticImportService.reanalyzeDataStream(
            {
              integrationId,
              dataStreamId,
              connectorId,
              langSmithOptions,
            },
            request
          );

          return response.ok({ body: { success: true } });
        } catch (err) {
          logger.error(`reanalyzeDataStreamRoute: Caught error:`, err);
          const automaticImportResponse = buildAutomaticImportResponse(response);
          return automaticImportResponse.error({
            statusCode: 500,
          });
        }
      })
    );
