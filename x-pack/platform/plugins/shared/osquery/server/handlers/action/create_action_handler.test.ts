/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createActionHandler } from './create_action_handler';
import { createDynamicQueries } from './create_queries';
import { parseAgentSelection } from '../../lib/parse_agent_groups';
import { getInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';

jest.mock('./create_queries');
jest.mock('../../lib/parse_agent_groups');
jest.mock('../../utils/get_internal_saved_object_client');

const mockedCreateDynamicQueries = createDynamicQueries as jest.MockedFunction<
  typeof createDynamicQueries
>;
const mockedParseAgentSelection = parseAgentSelection as jest.MockedFunction<
  typeof parseAgentSelection
>;
const mockedGetInternalSOClient = getInternalSavedObjectsClientForSpaceId as jest.MockedFunction<
  typeof getInternalSavedObjectsClientForSpaceId
>;

const TEST_AGENT = 'a1';
const QUERY_ACTION_ID = 'query-action-uuid';

const buildOsqueryContext = ({
  bulkCreate = jest.fn().mockResolvedValue(undefined),
  indicesExists = jest.fn().mockResolvedValue(true),
  bulk = jest.fn().mockResolvedValue(undefined),
  reportEvent = jest.fn(),
}: {
  bulkCreate?: jest.Mock;
  indicesExists?: jest.Mock;
  bulk?: jest.Mock;
  reportEvent?: jest.Mock;
} = {}) => {
  const esClient = {
    indices: { exists: indicesExists },
    bulk,
  };

  const context = {
    getStartServices: jest.fn().mockResolvedValue([
      {
        elasticsearch: { client: { asInternalUser: esClient } },
      },
    ]),
    service: {
      getFleetActionsClient: () => ({ bulkCreate }),
    },
    telemetryEventsSender: { reportEvent },
  } as unknown as OsqueryAppContext;

  return { context, bulkCreate, bulk, indicesExists, reportEvent };
};

describe('createActionHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetInternalSOClient.mockReturnValue({} as ReturnType<typeof mockedGetInternalSOClient>);
    mockedParseAgentSelection.mockResolvedValue([TEST_AGENT]);
    mockedCreateDynamicQueries.mockResolvedValue([
      {
        action_id: QUERY_ACTION_ID,
        id: 'q1',
        query: 'SELECT * FROM os_version;',
        agents: [TEST_AGENT],
      } as unknown as Awaited<ReturnType<typeof mockedCreateDynamicQueries>>[number],
    ]);
  });

  it('writes the originating space_id on each Fleet action document', async () => {
    const { context, bulkCreate } = buildOsqueryContext();

    await createActionHandler(
      context,
      { query: 'SELECT * FROM os_version;', agent_ids: [TEST_AGENT] },
      { space: { id: 'production' } }
    );

    expect(bulkCreate).toHaveBeenCalledTimes(1);
    const [actions] = bulkCreate.mock.calls[0];
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action_id: QUERY_ACTION_ID,
      input_type: 'osquery',
      space_id: 'production',
    });
  });

  it('falls back to the default space id when no space is provided', async () => {
    const { context, bulkCreate } = buildOsqueryContext();

    await createActionHandler(
      context,
      { query: 'SELECT * FROM os_version;', agent_ids: [TEST_AGENT] },
      {}
    );

    const [actions] = bulkCreate.mock.calls[0];
    expect(actions[0].space_id).toBe('default');
  });

  it('writes space_id on the osquery action document and the Fleet action with the same space', async () => {
    const { context, bulkCreate, bulk } = buildOsqueryContext();

    const result = await createActionHandler(
      context,
      { query: 'SELECT * FROM os_version;', agent_ids: [TEST_AGENT] },
      { space: { id: 'production' } }
    );

    expect(result.response.space_id).toBe('production');
    const [fleetActions] = bulkCreate.mock.calls[0];
    expect(fleetActions[0].space_id).toBe('production');
    // and the action SO write goes to the bulk indexer
    expect(bulk).toHaveBeenCalledTimes(1);
  });

  it('throws when no agents are selected', async () => {
    mockedParseAgentSelection.mockResolvedValueOnce([]);
    const { context, bulkCreate } = buildOsqueryContext();

    await expect(
      createActionHandler(
        context,
        { query: 'SELECT * FROM os_version;', agent_ids: [] },
        { space: { id: 'production' } }
      )
    ).rejects.toThrow('No agents found for selection');

    expect(bulkCreate).not.toHaveBeenCalled();
  });

  it('does not create Fleet actions when an error is propagated (e.g. license failure)', async () => {
    const { context, bulkCreate, reportEvent } = buildOsqueryContext();

    await createActionHandler(
      context,
      { query: 'SELECT * FROM os_version;', agent_ids: [TEST_AGENT] },
      { space: { id: 'production' }, error: 'license error' }
    );

    expect(bulkCreate).not.toHaveBeenCalled();
    // telemetry still fires for the action document
    expect(reportEvent).toHaveBeenCalledTimes(1);
  });

  it('skips the osquery action bulk write when the actions index template is missing', async () => {
    const { context, bulkCreate, bulk } = buildOsqueryContext({
      indicesExists: jest.fn().mockResolvedValue(false),
    });

    await createActionHandler(
      context,
      { query: 'SELECT * FROM os_version;', agent_ids: [TEST_AGENT] },
      { space: { id: 'production' } }
    );

    expect(bulkCreate).toHaveBeenCalledTimes(1);
    expect(bulk).not.toHaveBeenCalled();
  });
});
