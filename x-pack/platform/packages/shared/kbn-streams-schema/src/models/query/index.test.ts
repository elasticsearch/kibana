/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { QueryStream } from '.';
import { emptyAssets } from '../../helpers/empty_assets';

describe('QueryStream', () => {
  describe('Definition', () => {
    it.each([
      {
        type: 'query' as const,
        name: 'query-stream',
        description: '',
        updated_at: new Date().toISOString(),
        query: {
          view: 'stream.query-stream',
          esql: 'FROM logs | WHERE service.name == "query-child"',
        },
      },
      {
        type: 'query' as const,
        name: 'query-stream-with-descriptions',
        description: '',
        updated_at: new Date().toISOString(),
        query: {
          view: 'stream.query-stream-with-descriptions',
          esql: 'FROM logs | WHERE service.name == "query-child"',
        },
        field_descriptions: {
          '@timestamp': 'The timestamp of the event',
          'service.name': 'The name of the service',
        },
      },
      {
        type: 'query' as const,
        name: 'query-stream-empty-descriptions',
        description: '',
        updated_at: new Date().toISOString(),
        query: {
          view: 'stream.query-stream-empty-descriptions',
          esql: 'FROM logs',
        },
        field_descriptions: {},
      },
    ])('is valid', (val) => {
      expect(QueryStream.Definition.is(val)).toBe(true);
      expect(QueryStream.Definition.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        name: 'query-stream',
        description: null,
        query: {
          view: 'stream.query-stream',
        },
      },
      {
        name: 'query-stream',
        description: '',
        query: {},
      },
      {
        name: 'query-stream',
        description: '',
        query: {
          view: null,
        },
      },
      {
        name: 'query-stream',
        description: '',
        updated_at: new Date().toISOString(),
        query: {
          view: 'stream.query-stream',
          esql: 'FROM logs',
        },
        field_descriptions: 'invalid-string',
      },
      {
        name: 'query-stream',
        description: '',
        updated_at: new Date().toISOString(),
        query: {
          view: 'stream.query-stream',
          esql: 'FROM logs',
        },
        field_descriptions: { field1: 123 },
      },
    ])('is not valid', (val) => {
      expect(() =>
        QueryStream.Definition.asserts(
          val as unknown as Parameters<typeof QueryStream.Definition.asserts>[0]
        )
      ).toThrow();
    });
  });

  describe('GetResponse', () => {
    it.each([
      {
        stream: {
          type: 'query' as const,
          name: 'query-stream',
          description: '',
          updated_at: new Date().toISOString(),
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs | WHERE service.name == "query-child"',
          },
          query_streams: [],
        },
        inherited_fields: {},
        ...emptyAssets,
      },
      {
        stream: {
          type: 'query' as const,
          name: 'query-stream-with-descriptions',
          description: '',
          updated_at: new Date().toISOString(),
          query: {
            view: 'stream.query-stream-with-descriptions',
            esql: 'FROM logs | WHERE service.name == "query-child"',
          },
          query_streams: [],
          field_descriptions: {
            '@timestamp': 'Event timestamp',
            'host.name': 'Hostname',
          },
        },
        inherited_fields: {},
        ...emptyAssets,
      },
    ])('is valid', (val) => {
      expect(QueryStream.GetResponse.is(val)).toBe(true);
      expect(QueryStream.GetResponse.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        stream: {
          description: '',
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs',
          },
        },
        dashboards: [],
      },
      {
        stream: {
          description: '',
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs',
          },
        },
        dashboards: [],
      },
      {
        stream: {
          description: '',
          query: {},
        },
        rules: [],
      },
    ])('is not valid', (val) => {
      expect(
        QueryStream.GetResponse.is(
          val as unknown as Parameters<typeof QueryStream.GetResponse.is>[0]
        )
      ).toBe(false);
    });
  });

  describe('UpsertRequest', () => {
    it.each([
      {
        stream: {
          type: 'query' as const,
          description: '',
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs | WHERE service.name == "query-child"',
          },
        },
        ...emptyAssets,
      },
      {
        stream: {
          type: 'query' as const,
          description: '',
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs | WHERE service.name == "query-child"',
          },
          field_descriptions: {
            '@timestamp': 'Event timestamp',
            message: 'Log message',
          },
        },
        ...emptyAssets,
      },
      {
        stream: {
          type: 'query' as const,
          description: '',
          query: {
            view: 'stream.query-stream',
            esql: 'FROM logs',
          },
          field_descriptions: {},
        },
        ...emptyAssets,
      },
    ])('is valid', (val) => {
      expect(QueryStream.UpsertRequest.is(val)).toBe(true);
      expect(QueryStream.UpsertRequest.right.parse(val)).toEqual(val);
    });

    it.each([
      {
        dashboards: [],
        rules: [],
        stream: {
          query: {
            view: [],
          },
        },
      },
      {
        dashboards: [],
        rules: [],
        stream: {
          description: '',
        },
      },
      {
        dashboards: [],
        rules: [],
        stream: {
          name: 'my-name',
          description: '',
          query: {
            view: 'stream.query-stream',
          },
        },
      },
    ])('is not valid', (val) => {
      expect(
        QueryStream.UpsertRequest.is(
          val as unknown as Parameters<typeof QueryStream.UpsertRequest.is>[0]
        )
      ).toBe(false);
    });
  });
});
