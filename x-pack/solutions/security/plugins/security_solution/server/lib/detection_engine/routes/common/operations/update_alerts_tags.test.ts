/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getSuccessfulSignalUpdateResponse } from '../../__mocks__/request_responses';
import type { SecuritySolutionRequestHandlerContextMock } from '../../__mocks__/request_context';
import { requestContextMock } from '../../__mocks__';
import { getUpdateAlertTagsScript, updateAlertsTags } from './update_alerts_tags';

describe('updateAlertsTags', () => {
  let context: SecuritySolutionRequestHandlerContextMock;

  const defaultArgs = {
    index: '.alerts-security.alerts-default',
    ids: ['somefakeid1', 'somefakeid2'],
    tags: {
      tags_to_add: ['tag1', 'tag2'],
      tags_to_remove: [],
    },
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
    const result = await updateAlertsTags({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
    });

    expect(result).toEqual(getSuccessfulSignalUpdateResponse());
  });

  it('queries by the provided IDs', async () => {
    await updateAlertsTags({
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

    await updateAlertsTags({
      ...defaultArgs,
      context: requestContextMock.convertContext(context),
      index,
    });

    expect(context.core.elasticsearch.client.asCurrentUser.updateByQuery).toHaveBeenCalledWith(
      expect.objectContaining({ index })
    );
  });

  it('rejects when updateByQuery throws', async () => {
    context.core.elasticsearch.client.asCurrentUser.updateByQuery.mockRejectedValue(
      new Error('Test error')
    );

    await expect(
      updateAlertsTags({
        ...defaultArgs,
        context: requestContextMock.convertContext(context),
      })
    ).rejects.toThrow('Test error');
  });

  describe('getUpdateAlertTagsScript', () => {
    it('deduplicates and maps the tags to add/remove', () => {
      const script = getUpdateAlertTagsScript({
        tags_to_add: ['new-tag', 'new-tag'],
        tags_to_remove: ['old-tag'],
      });

      expect(script.params).toEqual({ tagsToAdd: ['new-tag'], tagsToRemove: ['old-tag'] });
    });
  });
});
