/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { kibanaResponseFactory } from '@kbn/core/server';
import { coreMock, httpServerMock, httpServiceMock } from '@kbn/core/server/mocks';
import { loggingSystemMock } from '@kbn/core-logging-server-mocks';
import type { MockedVersionedRouter } from '@kbn/core-http-router-server-mocks';
import { encryptedSavedObjectsMock } from '@kbn/encrypted-saved-objects-plugin/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';

jest.mock('../../remote_kibana/forward_to_remote_kibana', () => {
  const actual = jest.requireActual('../../remote_kibana/forward_to_remote_kibana');
  return {
    ...actual,
    forwardToRemoteKibana: jest.fn(),
  };
});

import { forwardToRemoteKibana } from '../../remote_kibana/forward_to_remote_kibana';
const mockedForwardToRemoteKibana = forwardToRemoteKibana as jest.MockedFunction<
  typeof forwardToRemoteKibana
>;
import {
  API_VERSIONS,
  EVALS_DATASETS_URL,
  EVALS_DATASET_URL,
  EVALS_DATASET_EXAMPLES_URL,
  EVALS_DATASET_EXAMPLE_URL,
  EVALS_DATASET_UPSERT_URL,
} from '@kbn/evals-common';
import { DatasetAlreadyExistsError } from '../../storage/dataset_already_exists_error';
import { ExampleAlreadyExistsError } from '../../storage/example_already_exists_error';
import { ExampleNotFoundError } from '../../storage/example_not_found_error';
import {
  RemoteDecryptionError,
  DESTINATION_QUERY_PARAM,
} from '../../remote_kibana/forward_to_remote_kibana';
import { registerListDatasetsRoute } from './list_datasets';
import { registerCreateDatasetRoute } from './create_dataset';
import { registerGetDatasetRoute } from './get_dataset';
import { registerUpdateDatasetRoute } from './update_dataset';
import { registerDeleteDatasetRoute } from './delete_dataset';
import { registerAddExamplesRoute } from './add_examples';
import { registerUpdateExampleRoute } from './update_example';
import { registerDeleteExampleRoute } from './delete_example';
import { registerUpsertDatasetRoute } from './upsert_dataset';

const buildRouteSetup = ({
  registerRoute,
  method,
  path,
}: {
  registerRoute: (deps: any) => void;
  method: 'get' | 'post' | 'put' | 'delete';
  path: string;
}) => {
  const router = httpServiceMock.createRouter();
  const logger = loggingSystemMock.createLogger();
  registerRoute({
    router,
    logger,
    canEncrypt: true,
    getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
    getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
  });

  const versionedRouter = router.versioned as MockedVersionedRouter;
  const { handler } = versionedRouter.getRoute(method, path).versions[API_VERSIONS.internal.v1];

  const datasetClient = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    datasetExists: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    addExamples: jest.fn(),
    updateExample: jest.fn(),
    deleteExample: jest.fn(),
    upsert: jest.fn(),
  };

  const datasetService = {
    getClient: jest.fn(),
  };

  const mockCoreContext = coreMock.createRequestHandlerContext();
  datasetService.getClient.mockReturnValue(datasetClient);
  const context = coreMock.createCustomRequestHandlerContext({
    core: mockCoreContext,
    evals: { datasetService } as any,
  });

  return { handler, context, logger, datasetClient, datasetService };
};

describe('dataset routes', () => {
  beforeEach(() => {
    mockedForwardToRemoteKibana.mockReset();
  });

  const datasetId = 'dataset-1';
  const exampleId = 'example-1';
  const dataset = {
    id: datasetId,
    name: 'qa-dataset',
    description: 'Dataset description',
    created_at: '2026-02-26T10:00:00.000Z',
    updated_at: '2026-02-26T11:00:00.000Z',
  };
  const datasetExample = {
    id: exampleId,
    dataset_id: datasetId,
    input: { question: 'What is Kibana?' },
    output: { answer: 'A UI for Elasticsearch' },
    metadata: { category: 'factual' },
    created_at: '2026-02-26T10:00:00.000Z',
    updated_at: '2026-02-26T11:00:00.000Z',
  };

  describe('GET /internal/evals/datasets', () => {
    it('returns dataset listings with pagination', async () => {
      const { handler, context, datasetClient, datasetService } = buildRouteSetup({
        registerRoute: registerListDatasetsRoute,
        method: 'get',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.list.mockResolvedValueOnce({
        datasets: [{ ...dataset, examples_count: 3 }],
        total: 1,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 2, per_page: 5 },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetService.getClient).toHaveBeenCalledWith();
      expect(datasetClient.list).toHaveBeenCalledWith({
        page: 2,
        perPage: 5,
        search: undefined,
        sortField: undefined,
        sortOrder: undefined,
      });
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        datasets: [{ ...dataset, examples_count: 3 }],
        total: 1,
      });
    });

    it('passes search and sort params to the client', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerListDatasetsRoute,
        method: 'get',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.list.mockResolvedValueOnce({ datasets: [], total: 0 });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: {
          page: 1,
          per_page: 25,
          search: 'kibana',
          sort_field: 'name',
          sort_order: 'asc',
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.list).toHaveBeenCalledWith({
        page: 1,
        perPage: 25,
        search: 'kibana',
        sortField: 'name',
        sortOrder: 'asc',
      });
      expect(response.status).toBe(200);
    });

    it('returns 500 when listing fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerListDatasetsRoute,
        method: 'get',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.list.mockRejectedValueOnce(new Error('failed'));

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 1, per_page: 10 },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to list evaluation datasets' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('POST /internal/evals/datasets', () => {
    it('creates a dataset and returns summary payload', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerCreateDatasetRoute,
        method: 'post',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.create.mockResolvedValueOnce({ ...dataset, examples: [] });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASETS_URL,
        body: {
          name: dataset.name,
          description: dataset.description,
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.create).toHaveBeenCalledWith(dataset.name, dataset.description);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        dataset_id: datasetId,
        name: dataset.name,
      });
    });

    it('returns 409 when dataset name already exists', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerCreateDatasetRoute,
        method: 'post',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.create.mockRejectedValueOnce(new DatasetAlreadyExistsError(dataset.name));

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASETS_URL,
        body: { name: dataset.name, description: dataset.description },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(409);
      expect(response.payload).toEqual({
        message: `Dataset with name "${dataset.name}" already exists`,
      });
    });

    it('returns 500 when create fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerCreateDatasetRoute,
        method: 'post',
        path: EVALS_DATASETS_URL,
      });
      datasetClient.create.mockRejectedValueOnce(new Error('boom'));

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASETS_URL,
        body: { name: dataset.name, description: dataset.description },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to create evaluation dataset' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('GET /internal/evals/datasets/{datasetId}', () => {
    it('returns dataset with examples', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerGetDatasetRoute,
        method: 'get',
        path: EVALS_DATASET_URL,
      });
      datasetClient.get.mockResolvedValueOnce({ ...dataset, examples: [datasetExample] });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ ...dataset, examples: [datasetExample] });
    });

    it('returns 404 for unknown dataset id', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerGetDatasetRoute,
        method: 'get',
        path: EVALS_DATASET_URL,
      });
      datasetClient.get.mockResolvedValueOnce(undefined);

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
    });

    it('returns 500 when get fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerGetDatasetRoute,
        method: 'get',
        path: EVALS_DATASET_URL,
      });
      datasetClient.get.mockRejectedValueOnce(new Error('failed'));

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to get evaluation dataset' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('PUT /internal/evals/datasets/{datasetId}', () => {
    it('updates dataset description', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateDatasetRoute,
        method: 'put',
        path: EVALS_DATASET_URL,
      });
      datasetClient.update.mockResolvedValueOnce(dataset);

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: { description: dataset.description },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.update).toHaveBeenCalledWith(datasetId, {
        description: dataset.description,
      });
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        created_at: dataset.created_at,
        updated_at: dataset.updated_at,
      });
    });

    it('returns 404 when dataset update target does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateDatasetRoute,
        method: 'put',
        path: EVALS_DATASET_URL,
      });
      datasetClient.update.mockResolvedValueOnce(undefined);

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: { description: 'updated' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
    });

    it('returns 500 when update fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerUpdateDatasetRoute,
        method: 'put',
        path: EVALS_DATASET_URL,
      });
      datasetClient.update.mockRejectedValueOnce(new Error('failed'));

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: { description: 'updated' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to update evaluation dataset' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('DELETE /internal/evals/datasets/{datasetId}', () => {
    it('deletes an existing dataset', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerDeleteDatasetRoute,
        method: 'delete',
        path: EVALS_DATASET_URL,
      });
      datasetClient.delete.mockResolvedValueOnce(true);

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ success: true });
    });

    it('returns 404 when dataset does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerDeleteDatasetRoute,
        method: 'delete',
        path: EVALS_DATASET_URL,
      });
      datasetClient.delete.mockResolvedValueOnce(false);

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
    });

    it('returns 500 when delete fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerDeleteDatasetRoute,
        method: 'delete',
        path: EVALS_DATASET_URL,
      });
      datasetClient.delete.mockRejectedValueOnce(new Error('failed'));

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to delete evaluation dataset' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('POST /internal/evals/datasets/{datasetId}/examples', () => {
    it('adds examples for an existing dataset', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerAddExamplesRoute,
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.addExamples.mockResolvedValueOnce({ added: 2 });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: {
          examples: [
            { input: { question: 'q1' }, output: { answer: 'a1' }, metadata: {} },
            { input: { question: 'q2' }, output: { answer: 'a2' }, metadata: { type: 'new' } },
          ],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.addExamples).toHaveBeenCalledWith(datasetId, [
        { input: { question: 'q1' }, output: { answer: 'a1' }, metadata: {} },
        { input: { question: 'q2' }, output: { answer: 'a2' }, metadata: { type: 'new' } },
      ]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ added: 2 });
    });

    it('adds examples with only input (no output or metadata)', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerAddExamplesRoute,
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.addExamples.mockResolvedValueOnce({ added: 1 });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: {
          examples: [{ input: { question: 'input-only' } }],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.addExamples).toHaveBeenCalledWith(datasetId, [
        { input: { question: 'input-only' } },
      ]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ added: 1 });
    });

    it('adds a completely empty example (no input, output, or metadata)', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerAddExamplesRoute,
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.addExamples.mockResolvedValueOnce({ added: 1 });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: {
          examples: [{}],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.addExamples).toHaveBeenCalledWith(datasetId, [{}]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ added: 1 });
    });

    it('returns 404 when dataset does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerAddExamplesRoute,
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(false);

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: { examples: [] },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
      expect(datasetClient.addExamples).not.toHaveBeenCalled();
    });

    it('returns 409 when adding a duplicate example', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerAddExamplesRoute,
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.addExamples.mockRejectedValueOnce(new ExampleAlreadyExistsError('1 duplicate'));

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_EXAMPLES_URL.replace('{datasetId}', datasetId),
        params: { datasetId },
        body: {
          examples: [{ input: datasetExample.input, output: datasetExample.output, metadata: {} }],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(409);
      expect(response.payload.message).toContain('already exists');
    });
  });

  describe('PUT /internal/evals/datasets/{datasetId}/examples/{exampleId}', () => {
    it('updates one example in the dataset', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateExampleRoute,
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.updateExample.mockResolvedValueOnce({
        ...datasetExample,
        output: { answer: 'updated' },
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
        body: { output: { answer: 'updated' } },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.updateExample).toHaveBeenCalledWith(
        exampleId,
        {
          input: undefined,
          output: { answer: 'updated' },
          metadata: undefined,
        },
        datasetId
      );
      expect(response.status).toBe(200);
      expect(response.payload.output).toEqual({ answer: 'updated' });
    });

    it('returns 404 when dataset does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateExampleRoute,
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(false);

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
        body: { input: {} },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
      expect(datasetClient.updateExample).not.toHaveBeenCalled();
    });

    it('returns 404 when the example does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateExampleRoute,
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.updateExample.mockRejectedValueOnce(new ExampleNotFoundError(exampleId));

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
        body: { input: {} },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({
        message: `Example not found: ${exampleId}`,
      });
      expect(datasetClient.updateExample).toHaveBeenCalledWith(
        exampleId,
        {
          input: {},
          output: undefined,
          metadata: undefined,
        },
        datasetId
      );
    });

    it('returns 409 when updated content matches another existing example', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpdateExampleRoute,
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.updateExample.mockRejectedValueOnce(
        new ExampleAlreadyExistsError('collision-id')
      );

      const request = httpServerMock.createKibanaRequest({
        method: 'put',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
        body: { input: { question: 'duplicate content' } },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(409);
      expect(response.payload.message).toContain('already exists');
    });
  });

  describe('DELETE /internal/evals/datasets/{datasetId}/examples/{exampleId}', () => {
    it('deletes one example from the dataset', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerDeleteExampleRoute,
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.deleteExample.mockResolvedValueOnce(undefined);

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(200);
      expect(response.payload).toEqual({ success: true });
      expect(datasetClient.deleteExample).toHaveBeenCalledWith(exampleId, datasetId);
    });

    it('returns 404 when dataset does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerDeleteExampleRoute,
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(false);

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: `Evaluation dataset not found: ${datasetId}` });
      expect(datasetClient.deleteExample).not.toHaveBeenCalled();
    });

    it('returns 404 when the example does not exist', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerDeleteExampleRoute,
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL,
      });
      datasetClient.datasetExists.mockResolvedValueOnce(true);
      datasetClient.deleteExample.mockRejectedValueOnce(new ExampleNotFoundError(exampleId));

      const request = httpServerMock.createKibanaRequest({
        method: 'delete',
        path: EVALS_DATASET_EXAMPLE_URL.replace('{datasetId}', datasetId).replace(
          '{exampleId}',
          exampleId
        ),
        params: { datasetId, exampleId },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({
        message: `Example not found: ${exampleId}`,
      });
      expect(datasetClient.deleteExample).toHaveBeenCalledWith(exampleId, datasetId);
    });
  });

  describe('POST /internal/evals/datasets/_upsert', () => {
    it('returns the upsert diff response', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpsertDatasetRoute,
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
      });
      datasetClient.upsert.mockResolvedValueOnce({
        dataset_id: datasetId,
        added: 1,
        removed: 0,
        unchanged: 2,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
        body: {
          name: dataset.name,
          description: dataset.description,
          examples: [{ input: datasetExample.input, output: datasetExample.output, metadata: {} }],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.upsert).toHaveBeenCalledWith(dataset.name, dataset.description, [
        { input: datasetExample.input, output: datasetExample.output, metadata: {} },
      ]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        dataset_id: datasetId,
        added: 1,
        removed: 0,
        unchanged: 2,
      });
    });

    it('upserts examples with only input (no output or metadata)', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpsertDatasetRoute,
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
      });
      datasetClient.upsert.mockResolvedValueOnce({
        dataset_id: datasetId,
        added: 2,
        removed: 0,
        unchanged: 0,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
        body: {
          name: dataset.name,
          description: dataset.description,
          examples: [
            { input: { searchTerm: 'query 1' } },
            { input: { searchTerm: 'query 2' }, metadata: { minDocs: 1 } },
          ],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.upsert).toHaveBeenCalledWith(dataset.name, dataset.description, [
        { input: { searchTerm: 'query 1' } },
        { input: { searchTerm: 'query 2' }, metadata: { minDocs: 1 } },
      ]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        dataset_id: datasetId,
        added: 2,
        removed: 0,
        unchanged: 0,
      });
    });

    it('upserts a completely empty example', async () => {
      const { handler, context, datasetClient } = buildRouteSetup({
        registerRoute: registerUpsertDatasetRoute,
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
      });
      datasetClient.upsert.mockResolvedValueOnce({
        dataset_id: datasetId,
        added: 1,
        removed: 0,
        unchanged: 0,
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
        body: {
          name: dataset.name,
          description: dataset.description,
          examples: [{}],
        },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(datasetClient.upsert).toHaveBeenCalledWith(dataset.name, dataset.description, [{}]);
      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        dataset_id: datasetId,
        added: 1,
        removed: 0,
        unchanged: 0,
      });
    });

    it('returns 500 when upsert fails', async () => {
      const { handler, context, datasetClient, logger } = buildRouteSetup({
        registerRoute: registerUpsertDatasetRoute,
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
      });
      datasetClient.upsert.mockRejectedValueOnce(new Error('failed'));

      const request = httpServerMock.createKibanaRequest({
        method: 'post',
        path: EVALS_DATASET_UPSERT_URL,
        body: { name: dataset.name, description: dataset.description, examples: [] },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(500);
      expect(response.payload).toEqual({ message: 'Failed to upsert evaluation dataset' });
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('remote forwarding (GET /internal/evals/datasets)', () => {
    const buildRemoteRouteSetup = ({ canEncrypt = true }: { canEncrypt?: boolean } = {}) => {
      const router = httpServiceMock.createRouter();
      const logger = loggingSystemMock.createLogger();
      registerListDatasetsRoute({
        router,
        logger,
        canEncrypt,
        getEncryptedSavedObjectsStart: async () => encryptedSavedObjectsMock.createStart(),
        getInternalRemoteConfigsSoClient: async () => savedObjectsClientMock.create(),
      });

      const versionedRouter = router.versioned as MockedVersionedRouter;
      const { handler } = versionedRouter.getRoute('get', EVALS_DATASETS_URL).versions[
        API_VERSIONS.internal.v1
      ];

      const mockCoreContext = coreMock.createRequestHandlerContext();
      const datasetClient = { list: jest.fn() };
      const datasetService = { getClient: jest.fn().mockReturnValue(datasetClient) };
      const context = coreMock.createCustomRequestHandlerContext({
        core: mockCoreContext,
        evals: { datasetService } as any,
      });

      return { handler, context, logger, datasetClient };
    };

    it('returns 501 when destination is remote but encryption is not configured', async () => {
      const { handler, context } = buildRemoteRouteSetup({ canEncrypt: false });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 1, per_page: 10, [DESTINATION_QUERY_PARAM]: 'remote-1' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(501);
      expect(response.payload.message).toContain('Encrypted Saved Objects is not configured');
      expect(mockedForwardToRemoteKibana).not.toHaveBeenCalled();
    });

    it('forwards to remote and returns 200 on success', async () => {
      const { handler, context, datasetClient } = buildRemoteRouteSetup();

      mockedForwardToRemoteKibana.mockResolvedValueOnce({
        statusCode: 200,
        body: { datasets: [{ id: 'remote-ds', name: 'Remote Dataset' }], total: 1 },
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 1, per_page: 10, [DESTINATION_QUERY_PARAM]: 'remote-1' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(200);
      expect(response.payload).toEqual({
        datasets: [{ id: 'remote-ds', name: 'Remote Dataset' }],
        total: 1,
      });
      expect(datasetClient.list).not.toHaveBeenCalled();
    });

    it('returns 400 when remote decryption fails', async () => {
      const { handler, context, logger } = buildRemoteRouteSetup();

      mockedForwardToRemoteKibana.mockRejectedValueOnce(new RemoteDecryptionError('remote-1'));

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 1, per_page: 10, [DESTINATION_QUERY_PARAM]: 'remote-1' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(400);
      expect(response.payload.message).toContain('Unable to decrypt');
      expect(logger.error).toHaveBeenCalled();
    });

    it('maps remote 404 to local notFound response', async () => {
      const { handler, context } = buildRemoteRouteSetup();

      mockedForwardToRemoteKibana.mockResolvedValueOnce({
        statusCode: 404,
        body: { message: 'Not found on remote' },
      });

      const request = httpServerMock.createKibanaRequest({
        method: 'get',
        path: EVALS_DATASETS_URL,
        query: { page: 1, per_page: 10, [DESTINATION_QUERY_PARAM]: 'remote-1' },
      });

      const response = await handler(context as any, request, kibanaResponseFactory);

      expect(response.status).toBe(404);
      expect(response.payload).toEqual({ message: 'Not found on remote' });
    });
  });
});
