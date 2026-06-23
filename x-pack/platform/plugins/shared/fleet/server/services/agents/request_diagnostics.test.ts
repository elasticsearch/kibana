/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { estypes } from '@elastic/elasticsearch';

import { appContextService } from '../app_context';
import { createAppContextStartContractMock } from '../../mocks';

import { SO_SEARCH_LIMIT } from '../../constants';

import { createClientMock } from './action.mock';
import { bulkRequestDiagnostics, requestDiagnostics } from './request_diagnostics';
import * as crud from './crud';
import * as requestDiagnosticsActionRunner from './request_diagnostics_action_runner';

jest.mock('../secrets', () => ({
  isActionSecretStorageEnabled: jest.fn(),
}));

describe('requestDiagnostics', () => {
  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        withoutSpaceExtensions: soClient,
      })
    );
  });

  afterEach(() => {
    appContextService.stop();
  });

  describe('requestDiagnostics (singular)', () => {
    it('can request diagnostics for single agent', async () => {
      const { soClient, esClient, agentInRegularDoc } = createClientMock();
      await requestDiagnostics(esClient, soClient, agentInRegularDoc._id);

      expect(esClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            agents: ['agent-in-regular-policy'],
            type: 'REQUEST_DIAGNOSTICS',
            expiration: expect.anything(),
          }),
          index: '.fleet-actions',
        })
      );
    });
  });

  describe('requestDiagnostics (plural)', () => {
    it('can request diagnostics for multiple agents', async () => {
      const { soClient, esClient, agentInRegularDocNewer, agentInRegularDocNewer2 } =
        createClientMock();
      const idsToAction = [agentInRegularDocNewer._id, agentInRegularDocNewer2._id];
      await bulkRequestDiagnostics(esClient, soClient, { agentIds: idsToAction });

      expect(esClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            agents: ['agent-in-regular-policy-newer', 'agent-in-regular-policy-newer2'],
            type: 'REQUEST_DIAGNOSTICS',
            expiration: expect.anything(),
          }),
          index: '.fleet-actions',
        })
      );
    });

    it('should report error when diagnostics for older agent', async () => {
      const { soClient, esClient, agentInRegularDoc, agentInRegularDocNewer } = createClientMock();
      const idsToAction = [agentInRegularDocNewer._id, agentInRegularDoc._id];
      await bulkRequestDiagnostics(esClient, soClient, { agentIds: idsToAction });

      expect(esClient.create).toHaveBeenCalledWith(
        expect.objectContaining({
          document: expect.objectContaining({
            agents: ['agent-in-regular-policy-newer', 'agent-in-regular-policy'],
            type: 'REQUEST_DIAGNOSTICS',
            expiration: expect.anything(),
          }),
          index: '.fleet-actions',
        })
      );
      const calledWithActionResults = esClient.bulk.mock.calls[0][0] as estypes.BulkRequest;
      // bulk write two line per create
      expect(calledWithActionResults.operations?.length).toBe(2);
      const expectedObject = expect.objectContaining({
        '@timestamp': expect.anything(),
        action_id: expect.anything(),
        agent_id: 'agent-in-regular-policy',
        error: 'Agent agent-in-regular-policy does not support request diagnostics action.',
      });
      expect(calledWithActionResults.operations?.[1]).toEqual(expectedObject);
    });
  });
});

describe('bulkRequestDiagnostics kuery path — cheap count and sync/async branching', () => {
  let mockGetAgentsByKuery: jest.SpyInstance;
  let mockOpenPointInTime: jest.SpyInstance;
  let mockRequestDiagnosticsBatch: jest.SpyInstance;
  let mockRequestDiagnosticsActionRunner: jest.SpyInstance;

  beforeEach(async () => {
    const { soClient } = createClientMock();
    appContextService.start(
      createAppContextStartContractMock({}, false, {
        withoutSpaceExtensions: soClient,
      })
    );
    mockGetAgentsByKuery = jest.spyOn(crud, 'getAgentsByKuery');
    mockOpenPointInTime = jest.spyOn(crud, 'openPointInTime').mockResolvedValue('pit-id');
    mockRequestDiagnosticsBatch = jest
      .spyOn(requestDiagnosticsActionRunner, 'requestDiagnosticsBatch')
      .mockResolvedValue({ actionId: 'test-action-id' });
    mockRequestDiagnosticsActionRunner = jest
      .spyOn(requestDiagnosticsActionRunner, 'RequestDiagnosticsActionRunner')
      .mockImplementation(
        () =>
          ({
            runActionAsyncTask: jest.fn().mockResolvedValue({ actionId: 'async-action-id' }),
          } as any)
      );
  });

  afterEach(() => {
    mockGetAgentsByKuery.mockRestore();
    mockOpenPointInTime.mockRestore();
    mockRequestDiagnosticsBatch.mockRestore();
    mockRequestDiagnosticsActionRunner.mockRestore();
    appContextService.stop();
  });

  it('uses perPage:0 for the initial count query', async () => {
    const { soClient, esClient } = createClientMock();
    mockGetAgentsByKuery.mockResolvedValue({ agents: [], total: 0, page: 1, perPage: 0 });

    await bulkRequestDiagnostics(esClient, soClient, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      1,
      esClient,
      soClient,
      expect.objectContaining({ perPage: 0 })
    );
  });

  it('runs inline and fetches agents when total <= batchSize', async () => {
    const { soClient, esClient } = createClientMock();
    const agents = [{ id: 'agent-1' } as any];
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 5, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents, total: 5, page: 1, perPage: SO_SEARCH_LIMIT }); // fetch

    await bulkRequestDiagnostics(esClient, soClient, { kuery: 'status:online' });

    expect(mockGetAgentsByKuery).toHaveBeenNthCalledWith(
      2,
      esClient,
      soClient,
      expect.objectContaining({ perPage: SO_SEARCH_LIMIT })
    );
    expect(mockRequestDiagnosticsBatch).toHaveBeenCalledWith(esClient, agents, expect.anything());
    expect(mockRequestDiagnosticsActionRunner).not.toHaveBeenCalled();
  });

  it('schedules async task and returns actionId immediately when total > batchSize', async () => {
    const { soClient, esClient } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery.mockResolvedValueOnce({ agents: [], total: 500, page: 1, perPage: 0 });

    const result = await bulkRequestDiagnostics(esClient, soClient, {
      kuery: 'status:online',
      batchSize,
    });

    expect(result).toEqual({ actionId: 'async-action-id' });
    expect(mockGetAgentsByKuery).toHaveBeenCalledTimes(1);
    expect(mockRequestDiagnosticsActionRunner).toHaveBeenCalledWith(
      esClient,
      soClient,
      expect.objectContaining({ batchSize, total: 500 }),
      expect.anything()
    );
    expect(mockRequestDiagnosticsBatch).not.toHaveBeenCalled();
  });

  it('runs inline when total equals batchSize (boundary)', async () => {
    const { soClient, esClient } = createClientMock();
    const batchSize = 100;
    mockGetAgentsByKuery
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: 0 }) // count
      .mockResolvedValueOnce({ agents: [], total: 100, page: 1, perPage: batchSize }); // fetch

    await bulkRequestDiagnostics(esClient, soClient, { kuery: 'status:online', batchSize });

    expect(mockRequestDiagnosticsBatch).toHaveBeenCalled();
    expect(mockRequestDiagnosticsActionRunner).not.toHaveBeenCalled();
  });
});
