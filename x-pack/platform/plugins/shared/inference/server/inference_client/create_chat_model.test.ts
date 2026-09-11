/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createChatModel } from './create_chat_model';
import { InferenceEndpointIdCache } from '../util/inference_endpoint_id_cache';
import { loggerMock, type MockedLogger } from '@kbn/logging-mocks';
import { httpServerMock } from '@kbn/core/server/mocks';
import { actionsMock } from '@kbn/actions-plugin/server/mocks';

jest.mock('./create_client');
import { createClient } from './create_client';
const createClientMock = createClient as unknown as jest.MockedFn<typeof createClient>;

jest.mock('../util/get_connector_by_id');
import { getConnectorById } from '../util/get_connector_by_id';
const getConnectorByIdMock = getConnectorById as unknown as jest.MockedFn<typeof getConnectorById>;

jest.mock('@kbn/inference-langchain');
import { InferenceChatModel } from '@kbn/inference-langchain';
import { createRegexWorkerServiceMock } from '../test_utils';
const InferenceChatModelMock = InferenceChatModel as unknown as jest.Mock<
  typeof InferenceChatModel
>;

describe('createChatModel', () => {
  let logger: MockedLogger;
  let actions: ReturnType<typeof actionsMock.createStart>;
  let request: ReturnType<typeof httpServerMock.createKibanaRequest>;
  let regexWorker: ReturnType<typeof createRegexWorkerServiceMock>;
  const mockEsClient = {
    ml: {
      inferTrainedModel: jest.fn(),
    },
  } as any;

  beforeEach(() => {
    logger = loggerMock.create();
    actions = actionsMock.createStart();
    request = httpServerMock.createKibanaRequest();
    regexWorker = createRegexWorkerServiceMock();

    createClientMock.mockReturnValue({
      chatComplete: jest.fn(),
    } as any);
  });

  afterEach(() => {
    createClientMock.mockReset();
    getConnectorByIdMock.mockReset();
    InferenceChatModelMock.mockReset();
  });

  it('calls createClient with the right parameters', async () => {
    await createChatModel({
      request,
      namespace: 'space-a',
      connectorId: '.my-connector',
      actions,
      logger,
      chatModelOptions: {
        temperature: 0.3,
      },
      anonymizationRulesPromise: Promise.resolve([]),
      regexWorker,
      esClient: mockEsClient,
      endpointIdCache: new InferenceEndpointIdCache(),
    });

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(createClientMock).toHaveBeenCalledWith({
      actions,
      request,
      namespace: 'space-a',
      logger,
      esClient: mockEsClient,
      anonymizationRulesPromise: Promise.resolve([]),
      regexWorker,
      endpointIdCache: expect.any(InferenceEndpointIdCache),
    });
  });

  it('calls getConnectorById with the right parameters', async () => {
    await createChatModel({
      request,
      namespace: 'space-a',
      connectorId: '.my-connector',
      actions,
      logger,
      chatModelOptions: {
        temperature: 0.3,
      },
      anonymizationRulesPromise: Promise.resolve([]),
      regexWorker,
      esClient: mockEsClient,
      endpointIdCache: new InferenceEndpointIdCache(),
    });

    expect(getConnectorById).toHaveBeenCalledTimes(1);
    expect(getConnectorById).toHaveBeenCalledWith({
      connectorId: '.my-connector',
      actions,
      request,
      esClient: mockEsClient,
      logger,
    });
  });

  it('creates a InferenceChatModel with the right constructor params', async () => {
    const inferenceClient = {
      chatComplete: jest.fn(),
    } as any;
    createClientMock.mockReturnValue(inferenceClient);

    const connector = Symbol('connector') as any;
    getConnectorByIdMock.mockResolvedValue(connector);

    await createChatModel({
      request,
      namespace: 'space-a',
      connectorId: '.my-connector',
      actions,
      logger,
      chatModelOptions: {
        temperature: 0.3,
      },
      anonymizationRulesPromise: Promise.resolve([]),
      regexWorker,
      esClient: mockEsClient,
      endpointIdCache: new InferenceEndpointIdCache(),
    });

    expect(InferenceChatModelMock).toHaveBeenCalledTimes(1);
    expect(InferenceChatModelMock).toHaveBeenCalledWith({
      chatComplete: inferenceClient.chatComplete,
      connector,
      temperature: 0.3,
    });
  });
});
