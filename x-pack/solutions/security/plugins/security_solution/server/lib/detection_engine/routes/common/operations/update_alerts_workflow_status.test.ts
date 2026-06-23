/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AuthenticatedUser } from '@kbn/core/server';

import { getSuccessfulSignalUpdateResponse } from '../../__mocks__/request_responses';
import type { SecuritySolutionRequestHandlerContextMock } from '../../__mocks__/request_context';
import { requestContextMock } from '../../__mocks__';
import { updateAlertsWorkflowStatus } from './update_alerts_workflow_status';

describe('updateAlertsWorkflowStatus', () => {
  let context: SecuritySolutionRequestHandlerContextMock;

  const defaultArgs = {
    index: '.alerts-security.alerts-default',
    ids: ['somefakeid1', 'somefakeid2'],
    status: 'closed' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ({ context } = requestContextMock.createTools());
    context.core.elasticsearch.client.asCurrentUser.updateByQuery.mockResponse(
      getSuccessfulSignalUpdateResponse()
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('returns the updateByQuery response', async () => {
    const result = await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(result).toEqual(getSuccessfulSignalUpdateResponse());
  });

  it('queries by the provided IDs', async () => {
    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        index: '.alerts-security.alerts-default',
        query: {
          bool: {
            filter: { terms: { _id: ['somefakeid1', 'somefakeid2'] } },
          },
        },
      })
    );
  });

  it('updates on multiple indices pattern', async () => {
    const index = [
      '.alerts-security.alerts-default',
      '.alerts-security.attack.discovery.alerts-default',
    ];

    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      index,
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ index })
    );
  });

  it('passes the provided reason into the update script', async () => {
    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      reason: 'false_positive',
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: expect.objectContaining({ reason: 'false_positive' }),
        }),
      })
    );
  });

  it('passes null reason into the update script when no reason is provided', async () => {
    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: expect.objectContaining({ reason: null }),
        }),
      })
    );
  });

  it('includes user information in script when user is present', async () => {
    context.core.security.authc.getCurrentUser.mockReturnValue({
      username: 'test-user',
      profile_uid: 'test-uid-123',
    } as AuthenticatedUser);

    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: expect.objectContaining({ workflowUser: 'test-uid-123' }),
        }),
      })
    );
  });

  it('handles null user in script', async () => {
    context.core.security.authc.getCurrentUser.mockReturnValue(null);

    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        script: expect.objectContaining({
          params: expect.objectContaining({ workflowUser: null }),
        }),
      })
    );
  });

  it('includes refresh and ignore_unavailable in updateByQuery call', async () => {
    await updateAlertsWorkflowStatus({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        refresh: true,
        ignore_unavailable: true,
      })
    );
  });

  it('rejects when updateByQuery throws', async () => {
    context.core.elasticsearch.client.asCurrentUser.updateByQuery.mockRejectedValue(
      new Error('Test error')
    );

    await expect(
      updateAlertsWorkflowStatus({
        ...defaultArgs,
        context: requestContextMock.convertContext(context),
      })
    ).rejects.toThrow('Test error');
  });
});
