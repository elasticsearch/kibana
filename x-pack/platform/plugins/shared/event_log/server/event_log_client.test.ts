/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core/server';
import { EventLogClient } from './event_log_client';
import type { EsContext } from './es';
import { contextMock } from './es/context.mock';
import { merge } from 'lodash';
import moment from 'moment';
import type { IClusterClientAdapter } from './es/cluster_client_adapter';
import { fromKueryExpression } from '@kbn/es-query';

const expectedSavedObject = {
  id: 'saved-object-id',
  type: 'saved-object-type',
  attributes: {},
  references: [],
};

const expectedEvents = [
  fakeEvent({
    kibana: {
      saved_objects: [
        {
          id: 'saved-object-id',
          type: 'saved-object-type',
        },
        {
          type: 'action',
          id: '1',
        },
      ],
    },
  }),
  fakeEvent({
    kibana: {
      saved_objects: [
        {
          id: 'saved-object-id',
          type: 'saved-object-type',
        },
        {
          type: 'action',
          id: '2',
        },
      ],
    },
  }),
];

describe('EventLogStart', () => {
  const savedObjectGetter = jest.fn();
  let esContext: jest.Mocked<EsContext> & {
    esAdapter: jest.Mocked<IClusterClientAdapter>;
  };
  let eventLogClient: EventLogClient;
  beforeEach(() => {
    esContext = contextMock.create();
    eventLogClient = new EventLogClient({
      esContext,
      savedObjectGetter,
      request: FakeRequest(),
    });
  });
  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('findEventsBySavedObjectIds', () => {
    test('verifies that the user can access the specified saved object', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await eventLogClient.findEventsBySavedObjectIds('saved-object-type', ['saved-object-id']);
      expect(savedObjectGetter).toHaveBeenCalledWith('saved-object-type', ['saved-object-id']);
    });
    test('throws when the user doesnt have permission to access the specified saved object', async () => {
      savedObjectGetter.mockRejectedValue(new Error('Fail'));
      await expect(
        eventLogClient.findEventsBySavedObjectIds('saved-object-type', ['saved-object-id'])
      ).rejects.toMatchInlineSnapshot(`[Error: Fail]`);
    });
    test('fetches all event that reference the saved object', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      const result = {
        page: 0,
        per_page: 10,
        total: expectedEvents.length,
        data: expectedEvents,
      };
      esContext.esAdapter.queryEventsBySavedObjects.mockResolvedValue(result);
      expect(
        await eventLogClient.findEventsBySavedObjectIds(
          'saved-object-type',
          ['saved-object-id'],
          undefined,
          ['legacy-id']
        )
      ).toEqual(result);
      expect(esContext.esAdapter.queryEventsBySavedObjects).toHaveBeenCalledWith({
        index: esContext.esNames.indexPattern,
        namespace: undefined,
        type: 'saved-object-type',
        ids: ['saved-object-id'],
        findOptions: {
          page: 1,
          per_page: 10,
          sort: [
            {
              sort_field: '@timestamp',
              sort_order: 'asc',
            },
          ],
        },
        legacyIds: ['legacy-id'],
      });
    });
    test('fetches all events in time frame that reference the saved object', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      const result = {
        page: 0,
        per_page: 10,
        total: expectedEvents.length,
        data: expectedEvents,
      };
      esContext.esAdapter.queryEventsBySavedObjects.mockResolvedValue(result);
      const start = moment().subtract(1, 'days').toISOString();
      const end = moment().add(1, 'days').toISOString();
      expect(
        await eventLogClient.findEventsBySavedObjectIds(
          'saved-object-type',
          ['saved-object-id'],
          {
            start,
            end,
          },
          ['legacy-id']
        )
      ).toEqual(result);
      expect(esContext.esAdapter.queryEventsBySavedObjects).toHaveBeenCalledWith({
        index: esContext.esNames.indexPattern,
        namespace: undefined,
        type: 'saved-object-type',
        ids: ['saved-object-id'],
        findOptions: {
          page: 1,
          per_page: 10,
          sort: [
            {
              sort_field: '@timestamp',
              sort_order: 'asc',
            },
          ],
          start,
          end,
        },
        legacyIds: ['legacy-id'],
      });
    });
    test('validates that the start date is valid', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      esContext.esAdapter.queryEventsBySavedObjects.mockResolvedValue({
        page: 0,
        per_page: 0,
        total: 0,
        data: [],
      });
      await expect(
        eventLogClient.findEventsBySavedObjectIds('saved-object-type', ['saved-object-id'], {
          start: 'not a date string',
        })
      ).rejects.toMatchInlineSnapshot(`[Error: [start]: Invalid Date]`);
    });
    test('validates that the end date is valid', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      esContext.esAdapter.queryEventsBySavedObjects.mockResolvedValue({
        page: 0,
        per_page: 0,
        total: 0,
        data: [],
      });
      await expect(
        eventLogClient.findEventsBySavedObjectIds('saved-object-type', ['saved-object-id'], {
          end: 'not a date string',
        })
      ).rejects.toMatchInlineSnapshot(`[Error: [end]: Invalid Date]`);
    });
  });

  describe('aggregateEventsBySavedObjectIds', () => {
    test('verifies that the user can access the specified saved object', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await eventLogClient.aggregateEventsBySavedObjectIds(
        'saved-object-type',
        ['saved-object-id'],
        { aggs: {} }
      );
      expect(savedObjectGetter).toHaveBeenCalledWith('saved-object-type', ['saved-object-id']);
    });
    test('throws when no aggregation is defined in options', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await expect(
        eventLogClient.aggregateEventsBySavedObjectIds('saved-object-type', ['saved-object-id'])
      ).rejects.toMatchInlineSnapshot(`[Error: No aggregation defined!]`);
    });
    test('throws when the user doesnt have permission to access the specified saved object', async () => {
      savedObjectGetter.mockRejectedValue(new Error('Fail'));
      await expect(
        eventLogClient.aggregateEventsBySavedObjectIds('saved-object-type', ['saved-object-id'], {
          aggs: {},
        })
      ).rejects.toMatchInlineSnapshot(`[Error: Fail]`);
    });
    test('calls aggregateEventsBySavedObjects with given aggregation', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await eventLogClient.aggregateEventsBySavedObjectIds(
        'saved-object-type',
        ['saved-object-id'],
        { aggs: { myAgg: {} } }
      );
      expect(savedObjectGetter).toHaveBeenCalledWith('saved-object-type', ['saved-object-id']);
      expect(esContext.esAdapter.aggregateEventsBySavedObjects).toHaveBeenCalledWith({
        index: esContext.esNames.indexPattern,
        namespace: undefined,
        type: 'saved-object-type',
        ids: ['saved-object-id'],
        aggregateOptions: {
          aggs: { myAgg: {} },
          page: 1,
          per_page: 10,
          sort: [
            {
              sort_field: '@timestamp',
              sort_order: 'asc',
            },
          ],
        },
        legacyIds: undefined,
      });
    });
  });
  describe('aggregateEventsWithAuthFilter', () => {
    const testAuthFilter = fromKueryExpression('test:test');
    test('throws when no aggregation is defined in options', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await expect(
        eventLogClient.aggregateEventsWithAuthFilter('saved-object-type', testAuthFilter)
      ).rejects.toMatchInlineSnapshot(`[Error: No aggregation defined!]`);
    });
    test('calls aggregateEventsWithAuthFilter with given aggregation', async () => {
      savedObjectGetter.mockResolvedValueOnce(expectedSavedObject);
      await eventLogClient.aggregateEventsWithAuthFilter(
        'saved-object-type',
        testAuthFilter,
        {
          aggs: { myAgg: {} },
        },
        undefined,
        true
      );
      expect(esContext.esAdapter.aggregateEventsWithAuthFilter).toHaveBeenCalledWith({
        index: esContext.esNames.indexPattern,
        namespaces: [undefined],
        type: 'saved-object-type',
        authFilter: testAuthFilter,
        aggregateOptions: {
          aggs: { myAgg: {} },
          page: 1,
          per_page: 10,
          sort: [
            {
              sort_field: '@timestamp',
              sort_order: 'asc',
            },
          ],
        },
        includeSpaceAgnostic: true,
      });
    });
  });

  describe('softDeleteByQuery', () => {
    const validParams = {
      query: { bool: { must: [{ term: { 'event.action': 'gap' } }] } },
      field: 'kibana.alert.rule.gap.deleted' as const,
    };

    test('delegates to the adapter when params are valid', async () => {
      await eventLogClient.softDeleteByQuery(validParams);
      expect(esContext.esAdapter.softDeleteByQuery).toHaveBeenCalledWith(validParams);
    });

    test.each([
      ['an arbitrary field path', 'some.other.field'],
      ['a flat field', 'deleted'],
      ['an injection attempt', 'deleted = true; ctx._source.other'],
      ['an empty string', ''],
      ['a field with leading dot', '.deleted'],
      ['a field with trailing dot', 'deleted.'],
      ['a partial match of the allowed field', 'kibana.alert.rule.gap'],
      ['a superset of the allowed field', 'kibana.alert.rule.gap.deleted.extra'],
    ])('rejects %s', async (_label, field) => {
      await expect(
        eventLogClient.softDeleteByQuery({
          ...validParams,
          field,
        })
      ).rejects.toThrow(/\[field\]:/);

      expect(esContext.esAdapter.softDeleteByQuery).not.toHaveBeenCalled();
    });
  });
});

function fakeEvent(overrides = {}) {
  return merge(
    {
      _id: '1',
      _index: '1',
      _seq_no: 1,
      _primary_term: 1,
      event: {
        provider: 'actions',
        action: 'execute',
        start: '2020-03-30T14:55:47.054Z',
        end: '2020-03-30T14:55:47.055Z',
        duration: '1000000',
      },
      kibana: {
        namespace: 'default',
        saved_objects: [
          {
            type: 'action',
            id: '968f1b82-0414-4a10-becc-56b6473e4a29',
          },
        ],
        server_uuid: '5b2de169-2785-441b-ae8c-186a1936b17d',
      },
      message: 'action executed: .server-log:968f1b82-0414-4a10-becc-56b6473e4a29: logger',
      '@timestamp': '2020-03-30T14:55:47.055Z',
      ecs: {
        version: '1.3.1',
      },
    },
    overrides
  );
}

function FakeRequest(): KibanaRequest {
  const savedObjectGetter = jest.fn();

  return {
    headers: {},
    getBasePath: () => '',
    path: '/',
    route: { settings: {} },
    url: {
      href: '/',
    },
    raw: {
      req: {
        url: '/',
      },
    },
    getSavedObjectsClient: () => savedObjectGetter,
  } as unknown as KibanaRequest;
}
