/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type Rx from 'rxjs';
import { firstValueFrom, lastValueFrom, of, throwError } from 'rxjs';
import type { DataView, DataViewsContract } from '@kbn/data-views-plugin/common';
import type { ExpressionAstExpression } from '@kbn/expressions-plugin/common';
import { buildExpression } from '@kbn/expressions-plugin/common';
import type { MockedKeys } from '@kbn/utility-types-jest';
import type { ISearchGeneric } from '@kbn/search-types';
import type { SearchFieldValue, SearchSourceDependencies } from '.';
import { SearchSource, SortDirection } from '.';
import type { AggTypesRegistryStart } from '../..';
import { AggConfigs } from '../..';
import { mockAggTypesRegistry } from '../aggs/test_helpers';
import type { RequestAdapter, RequestResponder } from '@kbn/inspector-plugin/common';
import { switchMap } from 'rxjs';
import type { Filter } from '@kbn/es-query';
import { stubIndexPattern } from '../../stubs';
import type { SearchSourceSearchOptions } from './types';

const getComputedFields = () => ({
  storedFields: [],
  scriptFields: {},
  docvalueFields: [],
  runtimeFields: {},
});

const mockSource = { excludes: ['foo-*'] };
const mockSource2 = { excludes: ['bar-*'] };

const indexPattern = {
  id: '1234',
  title: 'foo',
  fields: [{ name: 'foo-bar' }, { name: 'field1' }, { name: 'field2' }, { name: '_id' }],
  getComputedFields,
  getSourceFiltering: () => mockSource,
  getAllowHidden: jest.fn(),
} as unknown as DataView;

const indexPattern2 = {
  title: 'foo',
  getComputedFields,
  getSourceFiltering: () => mockSource2,
  getAllowHidden: jest.fn(),
} as unknown as DataView;

const fields3 = [{ name: 'foo-bar' }, { name: 'field1' }, { name: 'field2' }];
const indexPattern3 = {
  title: 'foo',
  fields: {
    getByName: (name: string) => {
      return fields3.find((field) => field.name === name);
    },
    filter: () => {
      return fields3;
    },
  },
  getComputedFields,
  getSourceFiltering: () => mockSource,
} as unknown as DataView;

const runtimeFieldDef = {
  type: 'keyword',
  script: {
    source: "emit('hello world')",
  },
};

describe('SearchSource', () => {
  let mockSearchMethod: jest.Mocked<ISearchGeneric>;
  let searchSourceDependencies: MockedKeys<SearchSourceDependencies>;
  let searchSource: SearchSource;

  beforeEach(() => {
    const aggsMock = {
      createAggConfigs: jest.fn(),
    } as unknown as jest.Mocked<SearchSourceDependencies['aggs']>;
    const getConfigMock = jest
      .fn()
      .mockImplementation((param) => param === 'metaFields' && ['_type', '_source', '_id'])
      .mockName('getConfig');

    mockSearchMethod = jest
      .fn()
      .mockReturnValue(
        of(
          { rawResponse: { test: 1 }, isPartial: true, isRunning: true },
          { rawResponse: { test: 2 }, isPartial: false, isRunning: false }
        )
      );

    searchSourceDependencies = {
      aggs: aggsMock,
      getConfig: getConfigMock,
      search: mockSearchMethod,
      onResponse: jest.fn().mockImplementation((_, res) => res),
      scriptedFieldsEnabled: true,
      dataViews: {
        getMetaFields: jest.fn(),
        getShortDotsEnable: jest.fn(),
      } as unknown as jest.Mocked<DataViewsContract>,
    };

    searchSource = new SearchSource({}, searchSourceDependencies);
  });

  describe('#getField()', () => {
    test('gets the value for the property', () => {
      searchSource.setField('aggs', { i: 5 });
      expect(searchSource.getField('aggs')).toStrictEqual({ i: 5 });
    });
  });

  describe('#getFields()', () => {
    test('gets the value for the property', () => {
      searchSource.setField('aggs', { i: 5 });
      expect(searchSource.getFields()).toMatchObject({ aggs: { i: 5 } });
    });
  });

  describe('#getActiveIndexFilter()', () => {
    test('pass _index from query', () => {
      searchSource.setField('query', {
        language: 'kuery',
        query: `_INDEX : fakebeat and _index : "mybeat-*"`,
      });
      expect(searchSource.getActiveIndexFilter()).toMatchObject(['mybeat-*']);
    });

    test('pass _index from filter', () => {
      const filter = [
        {
          query: { match_phrase: { _index: 'auditbeat-*' } },
          meta: {
            key: '_index',
            alias: null,
            disabled: false,
            negate: false,
            params: {
              query: 'auditbeat-*',
            },
            type: 'phrase',
          },
        },
        {
          query: {
            bool: {
              should: [
                {
                  match_phrase: {
                    _index: 'auditbeat-*',
                  },
                },
              ],
            },
          },
          meta: {
            key: '_index',
            alias: null,
            disabled: false,
            negate: false,
            params: ['auditbeat-*'],
            type: 'phrase',
          },
        },
      ];
      searchSource.setField('filter', filter);
      expect(searchSource.getActiveIndexFilter()).toMatchObject(['auditbeat-*']);
    });

    test('pass _index from filter - phrases filter', () => {
      const filter: Filter[] = [
        {
          meta: {
            type: 'phrases',
            key: '_index',
            params: ['auditbeat-*', 'packetbeat-*'],
            alias: null,
            negate: false,
            disabled: false,
          },
          query: {
            bool: {
              should: [
                { match_phrase: { _index: 'auditbeat-*' } },
                { match_phrase: { _index: 'packetbeat-*' } },
              ],
              minimum_should_match: 1,
            },
          },
        },
      ];
      searchSource.setField('filter', filter);
      expect(searchSource.getActiveIndexFilter()).toMatchObject(['auditbeat-*', 'packetbeat-*']);
    });

    test('pass _index from query and filter with negate equals to true', () => {
      const filter = [
        {
          query: {
            match_phrase: {
              _index: 'auditbeat-*',
            },
          },
          meta: {
            key: '_index',
            alias: null,
            disabled: false,
            negate: true,
            params: { query: 'auditbeat-*' },
            type: 'phrase',
          },
        },
      ];
      searchSource.setField('filter', filter);
      searchSource.setField('query', {
        language: 'kuery',
        query: '_index : auditbeat-*',
      });
      expect(searchSource.getActiveIndexFilter()).toMatchObject([]);
    });

    test('pass _index from query and filter with negate equals to true and disabled equals to true', () => {
      const filter = [
        {
          query: {
            match_phrase: {
              _index: 'auditbeat-*',
            },
          },
          meta: {
            key: '_index',
            alias: null,
            disabled: true,
            negate: true,
            params: { query: 'auditbeat-*' },
            type: 'phrase',
          },
        },
      ];
      searchSource.setField('filter', filter);
      searchSource.setField('query', {
        language: 'kuery',
        query: '_index : auditbeat-*',
      });
      expect(searchSource.getActiveIndexFilter()).toMatchObject(['auditbeat-*']);
    });
  });

  describe('#removeField()', () => {
    test('remove property', () => {
      searchSource = new SearchSource({}, searchSourceDependencies);
      searchSource.setField('aggs', { i: 5 });
      searchSource.removeField('aggs');
      expect(searchSource.getField('aggs')).toBeFalsy();
    });
  });

  describe('#setField() / #flatten', () => {
    test('sets the value for the property', () => {
      searchSource.setField('aggs', { i: 5 });
      expect(searchSource.getField('aggs')).toStrictEqual({ i: 5 });
    });

    test('resolves function-valued fields with search source context', () => {
      const resolveFilter = jest.fn(function (
        this: SearchSource,
        currentSearchSource?: SearchSource
      ): Filter[] {
        expect(this).toBe(searchSource);
        expect(currentSearchSource).toBe(searchSource);
        return [];
      });

      searchSource.setField('filter', resolveFilter);
      searchSource.getSearchRequestBody();

      expect(resolveFilter).toHaveBeenCalledTimes(1);
    });

    test('sets the value for the property with AggConfigs', () => {
      const typesRegistry = mockAggTypesRegistry();

      const ac = new AggConfigs(
        indexPattern3,
        [{ type: 'avg', params: { field: 'field1' } }],
        {
          typesRegistry,
        },
        jest.fn()
      );

      searchSource.setField('aggs', ac);
      const request = searchSource.getSearchRequestBody();
      expect(request.aggs).toStrictEqual({ '1': { avg: { field: 'field1' } } });
    });

    describe('computed fields handling', () => {
      test('still provides computed fields when no fields are specified', async () => {
        const runtimeFields = { runtime_field: runtimeFieldDef };
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            scriptFields: { world: {} },
            docvalueFields: ['@timestamp'],
            runtimeFields,
          }),
        } as unknown as DataView);

        const request = searchSource.getSearchRequestBody();
        expect(request.stored_fields).toEqual(['*']);
        expect(request.script_fields).toEqual({ world: {} });
        expect(request.fields).toEqual(['@timestamp']);
        expect(request.runtime_mappings).toEqual(runtimeFields);
      });

      test('never includes docvalue_fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: ['@timestamp'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['@timestamp']);
        searchSource.setField('fieldsFromSource', ['foo']);

        const request = searchSource.getSearchRequestBody();
        expect(request).not.toHaveProperty('docvalue_fields');
      });

      test('overrides computed docvalue fields with ones that are provided', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: ['hello'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        // @ts-expect-error TS won't like using this field name, but technically it's possible.
        searchSource.setField('docvalue_fields', ['world']);

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('docvalue_fields');
        expect(request.docvalue_fields).toEqual(['world']);
      });

      test('allows explicitly provided docvalue fields to override fields API when fetching fieldsFromSource', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: 'a', format: 'date_time' }],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        // @ts-expect-error TS won't like using this field name, but technically it's possible.
        searchSource.setField('docvalue_fields', [{ field: 'b', format: 'date_time' }]);
        searchSource.setField('fields', ['c']);
        searchSource.setField('fieldsFromSource', ['a', 'b', 'd']);

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('docvalue_fields');
        expect((request._source as { includes: string[] }).includes).toEqual(['c', 'a', 'b', 'd']);
        expect(request.docvalue_fields).toEqual([{ field: 'b', format: 'date_time' }]);
        expect(request.fields).toEqual(['c', { field: 'a', format: 'date_time' }]);
      });

      test('allows you to override computed fields if you provide a format', async () => {
        const indexPatternFields = indexPattern.fields;
        indexPatternFields.getByType = (_type) => {
          return [];
        };
        searchSource.setField('index', {
          ...indexPattern,
          fields: indexPatternFields,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: 'hello', format: 'date_time' }],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [{ field: 'hello', format: 'strict_date_time' }]);

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('fields');
        expect(request.fields).toEqual([{ field: 'hello', format: 'strict_date_time' }]);
      });

      test('injects a date format for computed docvalue fields if none is provided', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: 'hello', format: 'date_time' }],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['hello']);

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('fields');
        expect(request.fields).toEqual([{ field: 'hello', format: 'date_time' }]);
      });

      test('injects a date format for computed docvalue fields while merging other properties', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          fields: {
            getByType: () => {
              return [];
            },
          },
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: 'hello', format: 'date_time', a: 'test', b: 'test' }],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [{ field: 'hello', a: 'a', c: 'c' }]);

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('fields');
        expect(request.fields).toEqual([
          { field: 'hello', format: 'date_time', a: 'a', b: 'test', c: 'c' },
        ]);
      });

      test('merges provided script fields with computed fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        // @ts-expect-error TS won't like using this field name, but technically it's possible.
        searchSource.setField('script_fields', { world: {} });

        const request = searchSource.getSearchRequestBody();
        expect(request).toHaveProperty('script_fields');
        expect(request.script_fields).toEqual({
          hello: {},
          world: {},
        });
      });

      test(`requests any fields that aren't script_fields from stored_fields`, async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['hello', 'a', { field: 'c' }]);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['a', 'c']);
      });

      test('ignores objects without a `field` property when setting stored_fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [
          'hello',
          'a',
          { foo: 'c' } as unknown as SearchFieldValue,
        ]);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['a']);
      });

      test(`requests any fields that aren't script_fields from stored_fields with fieldsFromSource`, async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fieldsFromSource', ['hello', 'a']);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['a']);
      });

      test('defaults to * for stored fields when no fields are provided', async () => {
        const requestA = searchSource.getSearchRequestBody();
        expect(requestA.stored_fields).toEqual(['*']);

        searchSource.setField('fields', ['*']);
        const requestB = searchSource.getSearchRequestBody();
        expect(requestB.stored_fields).toEqual(['*']);
      });

      test('defaults to * for stored fields when no fields are provided with fieldsFromSource', async () => {
        searchSource.setField('fieldsFromSource', ['*']);
        const request = searchSource.getSearchRequestBody();
        expect(request.stored_fields).toEqual(['*']);
      });

      test('_source is not set when using the fields API', async () => {
        searchSource.setField('fields', ['*']);
        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual(['*']);
        expect(request._source).toEqual(false);
      });

      test('includes queries in the "filter" clause by default', async () => {
        searchSource.setField('query', {
          query: 'agent.keyword : "Mozilla" ',
          language: 'kuery',
        });
        const request = searchSource.getSearchRequestBody();
        expect(request.query).toMatchSnapshot();
      });

      test('includes queries in the "must" clause if sorting by _score', async () => {
        searchSource.setField('query', {
          query: 'agent.keyword : "Mozilla" ',
          language: 'kuery',
        });
        searchSource.setField('sort', [{ _score: SortDirection.asc }]);
        const request = searchSource.getSearchRequestBody();
        expect(request.query).toMatchSnapshot();
      });
    });

    describe('source filters handling', () => {
      test('excludes docvalue fields based on source filtering', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: ['@timestamp', 'exclude-me'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        // @ts-expect-error Typings for excludes filters need to be fixed.
        searchSource.setField('source', { excludes: ['exclude-*'] });

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual(['@timestamp']);
      });

      test('defaults to source filters from index pattern', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: ['@timestamp', 'foo-bar', 'foo-baz'],
            runtimeFields: {},
          }),
        } as unknown as DataView);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual(['@timestamp']);
      });

      test('filters script fields to only include specified fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['hello']);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({ hello: {} });
      });

      test('request all fields except the ones specified with source filters', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: [],
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [
          'hello',
          'foo-bar',
          'foo--bar',
          'fooo',
          'somethingfoo',
          'xxfxxoxxo',
        ]);
        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual(['hello', 'fooo', 'somethingfoo', 'xxfxxoxxo']);
      });

      test('request all fields from index pattern except the ones specified with source filters', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: [],
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['*']);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual([{ field: 'field1' }, { field: 'field2' }]);
      });

      test('request all fields from index pattern except the ones specified with source filters with unmapped_fields option', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: [],
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [{ field: '*', include_unmapped: true }]);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual([{ field: 'field1' }, { field: 'field2' }]);
      });

      test('excludes metafields from the request', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: [],
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', [{ field: '*', include_unmapped: true }]);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual([{ field: 'field1' }, { field: 'field2' }]);

        searchSource.setField('fields', ['foo-bar', 'foo--bar', 'field1', 'field2']);
        expect(request.fields).toEqual([{ field: 'field1' }, { field: 'field2' }]);

        searchSource.removeField('fields');
        searchSource.setField('fieldsFromSource', ['foo-bar', 'foo--bar', 'field1', 'field2']);
        expect(request.fields).toEqual([{ field: 'field1' }, { field: 'field2' }]);
      });

      test('returns all scripted fields when one fields entry is *', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['timestamp', '*']);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({ hello: {}, world: {} });
      });

      test('ignores scripted fields when scripted fields are disabled', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: [],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSourceDependencies.scriptedFieldsEnabled = false;
        searchSource.setField('fields', ['timestamp', '*']);

        const request = searchSource.getSearchRequestBody();
        expect(request.script_fields).toEqual({});
      });
    });

    describe('handling for when specific fields are provided', () => {
      test('fieldsFromSource will request any fields outside of script_fields from _source & stored fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: ['@timestamp'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fieldsFromSource', [
          'hello',
          'world',
          '@timestamp',
          'foo-a',
          'bar-b',
        ]);

        const request = searchSource.getSearchRequestBody();
        expect(request._source).toEqual({
          includes: ['@timestamp', 'bar-b'],
        });
        expect(request.stored_fields).toEqual(['@timestamp', 'bar-b']);
      });

      test('filters request when a specific list of fields is provided', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: ['*'],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: ['@timestamp', 'date'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['hello', '@timestamp', 'foo-a', 'bar']);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual(['hello', '@timestamp', 'bar', 'date']);
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['@timestamp', 'bar']);
      });

      test('filters request when a specific list of fields is provided with fieldsFromSource', async () => {
        const runtimeFields = { runtime_field: runtimeFieldDef, runtime_field_b: runtimeFieldDef };
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: ['*'],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: ['@timestamp', 'date'],
            runtimeFields,
          }),
        } as unknown as DataView);
        searchSource.setField('fieldsFromSource', [
          'hello',
          '@timestamp',
          'foo-a',
          'bar',
          'runtime_field',
        ]);

        const request = searchSource.getSearchRequestBody();
        expect(request._source).toEqual({
          includes: ['@timestamp', 'bar'],
        });
        expect(request.fields).toEqual(['@timestamp']);
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['@timestamp', 'bar']);
        expect(request.runtime_mappings).toEqual(runtimeFields);
      });

      test('filters request when a specific list of fields is provided with fieldsFromSource or fields', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: ['*'],
            scriptFields: { hello: {}, world: {} },
            docvalueFields: ['@timestamp', 'date', 'time'],
            runtimeFields: {},
          }),
        } as unknown as DataView);
        searchSource.setField('fields', ['hello', '@timestamp', 'foo-a', 'bar']);
        searchSource.setField('fieldsFromSource', ['foo-b', 'date', 'baz']);

        const request = searchSource.getSearchRequestBody();
        expect(request._source).toEqual({
          includes: ['@timestamp', 'bar', 'date', 'baz'],
        });
        expect(request.fields).toEqual(['hello', '@timestamp', 'bar', 'date']);
        expect(request.script_fields).toEqual({ hello: {} });
        expect(request.stored_fields).toEqual(['@timestamp', 'bar', 'date', 'baz']);
      });
    });

    describe('handling date fields', () => {
      test('adds date format to any date field', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: '@timestamp' }],
            runtimeFields: {},
          }),
          fields: {
            getByType: () => [{ name: '@timestamp', esTypes: ['date_nanos'] }],
          },
          getSourceFiltering: () => ({ excludes: [] }),
        } as unknown as DataView);
        searchSource.setField('fields', ['*']);

        const request = searchSource.getSearchRequestBody();
        expect(request.fields).toEqual([
          '*',
          { field: '@timestamp', format: 'strict_date_optional_time_nanos' },
        ]);
      });

      test('adds date format to any date field except the one excluded by source filters', async () => {
        const indexPatternFields = indexPattern.fields;
        // @ts-ignore
        indexPatternFields.getByType = (_type) => {
          return [
            { name: '@timestamp', esTypes: ['date_nanos'] },
            { name: 'custom_date', esTypes: ['date'] },
          ];
        };
        searchSource.setField('index', {
          ...indexPattern,
          getComputedFields: () => ({
            storedFields: [],
            scriptFields: {},
            docvalueFields: [{ field: '@timestamp' }, { field: 'custom_date' }],
            runtimeFields: {},
          }),
          fields: indexPatternFields,
          getSourceFiltering: () => ({ excludes: ['custom_date'] }),
        } as unknown as DataView);
        searchSource.setField('fields', ['*']);

        const request = searchSource.getSearchRequestBody();
        expect(Object.hasOwn(request, 'docvalue_fields')).toBe(false);
        expect(request.fields).toEqual([
          { field: 'foo-bar' },
          { field: 'field1' },
          { field: 'field2' },
          { field: '@timestamp', format: 'strict_date_optional_time_nanos' },
        ]);
      });

      test('adds date with override timezone', async () => {
        searchSource.setField('index', {
          ...indexPattern,
          fields: [
            {
              count: 0,
              name: 'event.start',
              type: 'date',
              esTypes: ['date'],
              scripted: false,
              searchable: true,
              aggregatable: true,
              readFromDocValues: true,
            },
          ],
        } as unknown as DataView);
        searchSource.setField('query', {
          language: 'kuery',
          query: 'event.start < "2025-12-16T10:50:00.000"',
        });
        searchSource.setField('timezone', 'America/Los_Angeles');

        const request = searchSource.getSearchRequestBody();
        expect(request.query).toEqual({
          bool: {
            filter: [
              {
                bool: {
                  minimum_should_match: 1,
                  should: [
                    {
                      range: {
                        'event.start': {
                          lt: '2025-12-16T10:50:00.000',
                          time_zone: 'America/Los_Angeles',
                        },
                      },
                    },
                  ],
                },
              },
            ],
            must: [],
            must_not: [],
            should: [],
          },
        });
      });
    });

    describe(`#setField('index')`, () => {
      describe('auto-sourceFiltering', () => {
        describe('new index pattern assigned', () => {
          test('generates a searchSource filter', async () => {
            expect(searchSource.getField('index')).toBe(undefined);
            expect(searchSource.getField('source')).toBe(undefined);
            searchSource.setField('index', indexPattern);
            expect(searchSource.getField('index')).toBe(indexPattern);
            const request = searchSource.getSearchRequestBody();
            expect(request._source).toBe(mockSource);
          });

          test('removes created searchSource filter on removal', async () => {
            searchSource.setField('index', indexPattern);
            searchSource.setField('index', undefined);
            const request = searchSource.getSearchRequestBody();
            expect(request._source).toBe(undefined);
          });
        });

        describe('new index pattern assigned over another', () => {
          test('replaces searchSource filter with new', async () => {
            searchSource.setField('index', indexPattern);
            searchSource.setField('index', indexPattern2);
            expect(searchSource.getField('index')).toBe(indexPattern2);
            const request = searchSource.getSearchRequestBody();
            expect(request._source).toBe(mockSource2);
          });

          test('removes created searchSource filter on removal', async () => {
            searchSource.setField('index', indexPattern);
            searchSource.setField('index', indexPattern2);
            searchSource.setField('index', undefined);
            const request = searchSource.getSearchRequestBody();
            expect(request._source).toBe(undefined);
          });
        });
      });
    });
  });

  describe('#onRequestStart()', () => {
    test('should be called when starting a request', async () => {
      searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies);
      const fn = jest.fn();
      searchSource.onRequestStart(fn);
      const options = {};
      await firstValueFrom(searchSource.fetch$(options));
      expect(fn).toBeCalledWith(searchSource, options);
    });

    test('should not be called on parent searchSource', async () => {
      const parent = new SearchSource({}, searchSourceDependencies);
      searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies);

      const fn = jest.fn();
      searchSource.onRequestStart(fn);
      const parentFn = jest.fn();
      parent.onRequestStart(parentFn);
      const options = {};
      await firstValueFrom(searchSource.fetch$(options));

      expect(fn).toBeCalledWith(searchSource, options);
      expect(parentFn).not.toBeCalled();
    });

    test('should be called on parent searchSource if callParentStartHandlers is true', async () => {
      const parent = new SearchSource({}, searchSourceDependencies);
      searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies).setParent(
        parent,
        {
          callParentStartHandlers: true,
        }
      );

      const fn = jest.fn();
      searchSource.onRequestStart(fn);
      const parentFn = jest.fn();
      parent.onRequestStart(parentFn);
      const options = {};
      await firstValueFrom(searchSource.fetch$(options));

      expect(fn).toBeCalledWith(searchSource, options);
      expect(parentFn).toBeCalledWith(searchSource, options);
    });
  });

  describe('#serialize', () => {
    const indexPattern123 = { id: '123', isPersisted: () => true } as DataView;
    test('should reference index patterns', () => {
      searchSource.setField('index', indexPattern123);
      const { searchSourceJSON, references } = searchSource.serialize();
      expect(references[0].id).toEqual('123');
      expect(references[0].type).toEqual('index-pattern');
      expect(JSON.parse(searchSourceJSON).indexRefName).toEqual(references[0].name);
    });

    test('should contain persisted data view by value', () => {
      const localDataView = {
        id: 'local-123',
        isPersisted: () => false,
        toMinimalSpec: () => ({ id: 'local-123' }),
      } as DataView;
      searchSource.setField('index', localDataView);
      const { searchSourceJSON, references } = searchSource.serialize();
      expect(references.length).toEqual(0);
      expect(JSON.parse(searchSourceJSON).index).toMatchObject({
        id: 'local-123',
      });
    });

    test('should add other fields', () => {
      searchSource.setField('highlightAll', true);
      searchSource.setField('from', 123456);
      const { searchSourceJSON } = searchSource.serialize();
      expect(JSON.parse(searchSourceJSON).highlightAll).toEqual(true);
      expect(JSON.parse(searchSourceJSON).from).toEqual(123456);
    });

    test('should omit size but not sort', () => {
      searchSource.setField('highlightAll', true);
      searchSource.setField('from', 123456);
      searchSource.setField('sort', { field: SortDirection.asc });
      searchSource.setField('size', 200);
      const { searchSourceJSON } = searchSource.serialize();
      expect(Object.keys(JSON.parse(searchSourceJSON))).toEqual(['highlightAll', 'from', 'sort']);
    });

    test('should add pit', () => {
      const pit = { id: 'flimflam', keep_alive: '1m' };
      searchSource.setField('pit', pit);
      const { searchSourceJSON } = searchSource.serialize();
      expect(searchSourceJSON).toBe(JSON.stringify({ pit }));
    });

    test('should serialize filters', () => {
      const filter = [
        {
          query: { query_string: { query: 'query' } },
          meta: {
            alias: 'alias',
            disabled: false,
            negate: false,
          },
        },
      ];
      searchSource.setField('filter', filter);
      const { searchSourceJSON } = searchSource.serialize();
      expect(JSON.parse(searchSourceJSON).filter).toEqual(filter);
    });

    test('should reference index patterns in filters separately from index field', () => {
      searchSource.setField('index', indexPattern123);
      const filter = [
        {
          query: { query_string: { query: 'query' } },
          meta: {
            alias: 'alias',
            disabled: false,
            negate: false,
            index: '456',
          },
        },
      ];
      searchSource.setField('filter', filter);
      const { searchSourceJSON, references } = searchSource.serialize();
      expect(references[0].id).toEqual('123');
      expect(references[0].type).toEqual('index-pattern');
      expect(JSON.parse(searchSourceJSON).indexRefName).toEqual(references[0].name);
      expect(references[1].id).toEqual('456');
      expect(references[1].type).toEqual('index-pattern');
      expect(JSON.parse(searchSourceJSON).filter[0].meta.indexRefName).toEqual(references[1].name);
    });

    test('mvt geoshape layer test', async () => {
      // @ts-expect-error TS won't like using this field name, but technically it's possible.
      searchSource.setField('docvalue_fields', ['prop1']);
      searchSource.setField('source', ['geometry']);
      searchSource.setField('fieldsFromSource', ['geometry', 'prop1']);
      searchSource.setField('index', {
        ...indexPattern,
        getSourceFiltering: () => ({ excludes: [] }),
        getComputedFields: () => ({
          storedFields: ['*'],
          scriptFields: {},
          docvalueFields: [],
          runtimeFields: {},
        }),
      } as unknown as DataView);
      const request = searchSource.getSearchRequestBody();
      expect(request.stored_fields).toEqual(['geometry', 'prop1']);
      expect(request.docvalue_fields).toEqual(['prop1']);
      expect(request._source).toEqual(['geometry']);
    });
  });

  describe('getSerializedFields', () => {
    const filter: Filter[] = [
      {
        query: { query_string: { query: 'query' } },
        meta: {
          alias: 'alias',
          disabled: false,
          negate: false,
          index: '456',
        },
      },
    ];

    const indexPattern123 = {
      id: '123',
      isPersisted: jest.fn(() => true),
      toMinimalSpec: jest.fn(),
    } as unknown as DataView;

    test('should return serialized fields', () => {
      searchSource.setField('index', indexPattern123);
      searchSource.setField('filter', () => {
        return filter;
      });
      const serializedFields = searchSource.getSerializedFields();
      expect(indexPattern123.toMinimalSpec).toHaveBeenCalledTimes(0);
      expect(serializedFields).toMatchSnapshot();
    });

    test('should support nested search sources', () => {
      searchSource.setField('index', indexPattern123);
      searchSource.setField('from', 123);
      const childSearchSource = searchSource.createChild();
      childSearchSource.setField('timeout', '100');
      const serializedFields = childSearchSource.getSerializedFields(true);
      expect(indexPattern123.toMinimalSpec).toHaveBeenCalledTimes(0);
      expect(serializedFields).toMatchObject({
        timeout: '100',
        parent: { index: '123', from: 123 },
      });
    });

    test('should use minimal spec for ad hoc data view', () => {
      indexPattern123.isPersisted = jest.fn(() => false);
      searchSource.setField('index', indexPattern123);
      searchSource.getSerializedFields(true);
      expect(indexPattern123.toMinimalSpec).toHaveBeenCalledTimes(1);
    });
  });

  describe('projectRouting field', () => {
    test('should accept projectRouting as a field', () => {
      searchSource.setField('projectRouting', '_alias:_origin');
      expect(searchSource.getField('projectRouting')).toBe('_alias:_origin');
    });

    test('should serialize projectRouting in getSerializedFields', () => {
      searchSource.setField('projectRouting', '_alias:_origin');
      const serialized = searchSource.getSerializedFields();
      expect(serialized.projectRouting).toBe('_alias:_origin');
    });

    test('should serialize undefined projectRouting', () => {
      searchSource.setField('projectRouting', undefined);
      const serialized = searchSource.getSerializedFields();
      expect(serialized.projectRouting).toBeUndefined();
    });

    test('should include projectRouting in serialize()', () => {
      searchSource.setField('projectRouting', '_alias:_origin');
      const { searchSourceJSON } = searchSource.serialize();
      expect(JSON.parse(searchSourceJSON).projectRouting).toBe('_alias:_origin');
    });

    test('should not include project_routing in ES request body (it is passed as an option)', () => {
      searchSource.setField('index', indexPattern);
      searchSource.setField('projectRouting', '_alias:_origin');
      const request = searchSource.getSearchRequestBody();
      // projectRouting is now passed as an option, not in the request body
      expect('project_routing' in request).toBe(false);
    });
  });

  describe('fetch$', () => {
    describe('responses', () => {
      test('should return partial results', async () => {
        searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies);
        const options = {};

        const next = jest.fn();
        const complete = jest.fn();
        const res$ = searchSource.fetch$(options);
        res$.subscribe({ next, complete });
        await firstValueFrom(res$);

        expect(next).toBeCalledTimes(2);
        expect(complete).toBeCalledTimes(1);
        expect(searchSourceDependencies.onResponse).toBeCalledTimes(1);
        expect(next.mock.calls[0]).toMatchObject([
          { isPartial: true, isRunning: true, rawResponse: { test: 1 } },
        ]);
        expect(next.mock.calls[1]).toMatchObject([
          { isPartial: false, isRunning: false, rawResponse: { test: 2 } },
        ]);
      });

      test('shareReplays result', async () => {
        searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies);
        const options = {};

        const next = jest.fn();
        const complete = jest.fn();
        const next2 = jest.fn();
        const complete2 = jest.fn();
        const res$ = searchSource.fetch$(options);
        res$.subscribe({ next, complete });
        res$.subscribe({ next: next2, complete: complete2 });
        await firstValueFrom(res$);

        expect(next).toBeCalledTimes(2);
        expect(next2).toBeCalledTimes(2);
        expect(complete).toBeCalledTimes(1);
        expect(complete2).toBeCalledTimes(1);
        expect(searchSourceDependencies.search).toHaveBeenCalledTimes(1);
      });

      test('uses index field as indexPattern fallback when flattened index is a string', async () => {
        searchSource = new SearchSource({ index: indexPattern }, searchSourceDependencies);
        const flattenSpy = jest
          .spyOn(searchSource as unknown as { flatten: () => unknown }, 'flatten')
          .mockReturnValue({ body: {}, index: 'legacy-index-id' });
        const options: SearchSourceSearchOptions = {};

        await firstValueFrom(searchSource.fetch$(options));

        expect(options.indexPattern).toBe(indexPattern);
        flattenSpy.mockRestore();
      });
    });

    describe('inspector', () => {
      let requestResponder: RequestResponder;
      beforeEach(() => {
        requestResponder = {
          stats: jest.fn(),
          ok: jest.fn(),
          error: jest.fn(),
          json: jest.fn(),
        } as unknown as RequestResponder;
      });

      test('calls inspector if provided', async () => {
        const options: SearchSourceSearchOptions = {
          inspector: {
            title: 'a',
            adapter: {
              start: jest.fn().mockReturnValue(requestResponder),
            } as unknown as jest.Mocked<RequestAdapter>,
          },
        };

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        await firstValueFrom(searchSource.fetch$(options));

        expect(options.inspector?.adapter?.start).toBeCalledTimes(1);
        expect(requestResponder.error).not.toBeCalled();
        expect(requestResponder.json).toBeCalledTimes(1);
        expect(requestResponder.ok).toBeCalledTimes(1);
        // First and last
        expect(requestResponder.stats).toBeCalledTimes(2);
      });

      test('calls inspector only once, with multiple subs (shareReplay)', async () => {
        const options: SearchSourceSearchOptions = {
          inspector: {
            title: 'a',
            adapter: {
              start: jest.fn().mockReturnValue(requestResponder),
            } as unknown as jest.Mocked<RequestAdapter>,
          },
        };

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        const res$ = searchSource.fetch$(options);

        const complete1 = jest.fn();
        const complete2 = jest.fn();

        res$.subscribe({
          complete: complete1,
        });
        res$.subscribe({
          complete: complete2,
        });

        await firstValueFrom(res$);

        expect(complete1).toBeCalledTimes(1);
        expect(complete2).toBeCalledTimes(1);
        expect(options.inspector?.adapter?.start).toBeCalledTimes(1);
      });

      test('calls error on inspector', async () => {
        const options: SearchSourceSearchOptions = {
          inspector: {
            title: 'a',
            adapter: {
              start: jest.fn().mockReturnValue(requestResponder),
            } as unknown as jest.Mocked<RequestAdapter>,
          },
        };

        searchSourceDependencies.search = jest
          .fn()
          .mockReturnValue(throwError(() => new Error('aaaaa')));

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        await firstValueFrom(searchSource.fetch$(options)).catch(() => {});

        expect(options.inspector?.adapter?.start).toBeCalledTimes(1);
        expect(requestResponder.json).toBeCalledTimes(1);
        expect(requestResponder.error).toBeCalledTimes(1);
        expect(requestResponder.ok).toBeCalledTimes(0);
        expect(requestResponder.stats).toBeCalledTimes(0);
      });
    });

    describe('postFlightRequest', () => {
      let fetchSub: Rx.Observer<unknown>;

      function getAggConfigs(typesRegistry: AggTypesRegistryStart, enabled: boolean) {
        return new AggConfigs(
          indexPattern3,
          [
            {
              type: 'avg',
              enabled,
              params: { field: 'field1' },
            },
          ],
          {
            typesRegistry,
          },
          jest.fn()
        );
      }

      beforeEach(() => {
        fetchSub = {
          next: jest.fn(),
          complete: jest.fn(),
          error: jest.fn(),
        };
      });

      test('doesnt call any post flight requests if disabled', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn();
        const ac = getAggConfigs(typesRegistry, false);

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', ac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);
        await firstValueFrom(fetch$);

        expect(fetchSub.next).toHaveBeenCalledTimes(2);
        expect(fetchSub.complete).toHaveBeenCalledTimes(1);
        expect(fetchSub.error).toHaveBeenCalledTimes(0);
        expect(searchSourceDependencies.onResponse).toBeCalledTimes(1);

        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(0);
      });

      test('doesnt call any post flight if searchsource has error', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn();
        const ac = getAggConfigs(typesRegistry, true);

        searchSourceDependencies.search = jest.fn().mockImplementation(() =>
          of(1).pipe(
            switchMap((r) => {
              throw r;
            })
          )
        );

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', ac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);
        await firstValueFrom(fetch$).catch((_) => {});

        expect(fetchSub.next).toHaveBeenCalledTimes(0);
        expect(fetchSub.complete).toHaveBeenCalledTimes(0);
        expect(fetchSub.error).toHaveBeenNthCalledWith(1, 1);

        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(0);
      });

      test('doesnt fire postFlightRequest if other bucket is not enabled', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn().mockResolvedValue({
          other: 5,
        });

        const allac = new AggConfigs(
          indexPattern3,
          [
            {
              type: 'avg',
              enabled: true,
              params: { field: 'field1' },
            },
            {
              type: 'avg',
              enabled: true,
              params: { field: 'field2' },
            },
            {
              type: 'avg',
              enabled: true,
              params: { field: 'foo-bar' },
            },
          ],
          {
            typesRegistry,
          },
          jest.fn()
        );

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', allac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);

        const resp = await lastValueFrom(fetch$);

        expect(searchSourceDependencies.onResponse).toBeCalledTimes(1);
        expect(fetchSub.next).toHaveBeenCalledTimes(2);
        expect(fetchSub.complete).toHaveBeenCalledTimes(1);
        expect(fetchSub.error).toHaveBeenCalledTimes(0);
        expect(resp.rawResponse).toStrictEqual({ test: 2 });
        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(0);
      });

      test('calls post flight requests, fires 1 extra response, returns last response', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn().mockResolvedValue({
          other: 5,
        });

        const allac = new AggConfigs(
          indexPattern3,
          [
            {
              type: 'avg',
              enabled: true,
              params: { field: 'field1' },
            },
            {
              type: 'avg',
              enabled: true,
              params: { field: 'field2' },
            },
            {
              type: 'avg',
              enabled: true,
              params: { field: 'foo-bar' },
            },
          ],
          {
            typesRegistry,
          },
          jest.fn()
        );

        allac.aggs.forEach((agg) => {
          agg.params.otherBucket = 'other';
        });

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', allac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);

        const resp = await lastValueFrom(fetch$);

        expect(searchSourceDependencies.onResponse).toBeCalledTimes(1);
        expect(fetchSub.next).toHaveBeenCalledTimes(3);
        expect(fetchSub.complete).toHaveBeenCalledTimes(1);
        expect(fetchSub.error).toHaveBeenCalledTimes(0);
        expect(resp.rawResponse).toStrictEqual({ other: 5 });
        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(3);
      });

      test('calls post flight requests only once, with multiple subs (shareReplay)', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn().mockResolvedValue({
          other: 5,
        });

        const allac = new AggConfigs(
          indexPattern3,
          [
            {
              type: 'avg',
              enabled: true,
              params: { field: 'field1' },
            },
          ],
          {
            typesRegistry,
          },
          jest.fn()
        );

        allac.aggs.forEach((agg) => {
          agg.params.otherBucket = 'other';
        });

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', allac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);

        const fetchSub2 = {
          next: jest.fn(),
          complete: jest.fn(),
          error: jest.fn(),
        };
        fetch$.subscribe(fetchSub2);

        await lastValueFrom(fetch$);

        expect(fetchSub.next).toHaveBeenCalledTimes(3);
        expect(fetchSub.complete).toHaveBeenCalledTimes(1);
        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(1);
      });

      test('calls post flight requests, handles error', async () => {
        const typesRegistry = mockAggTypesRegistry();
        typesRegistry.get('avg')!.postFlightRequest = jest.fn().mockRejectedValue(undefined);
        const ac = getAggConfigs(typesRegistry, true);
        ac.aggs[0].params.otherBucket = 'other';

        searchSource = new SearchSource({}, searchSourceDependencies);
        searchSource.setField('index', indexPattern);
        searchSource.setField('aggs', ac);
        const fetch$ = searchSource.fetch$({});
        fetch$.subscribe(fetchSub);

        await lastValueFrom(fetch$).catch(() => {});

        expect(fetchSub.next).toHaveBeenCalledTimes(2);
        expect(fetchSub.complete).toHaveBeenCalledTimes(0);
        expect(fetchSub.error).toHaveBeenCalledTimes(1);
        expect(typesRegistry.get('avg')!.postFlightRequest).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('#toExpressionAst()', () => {
    function toString(ast: ExpressionAstExpression) {
      return buildExpression(ast).toString();
    }

    beforeEach(() => {
      searchSource = new SearchSource({}, searchSourceDependencies);
      searchSource.setField('index', indexPattern);
    });

    test('should generate an expression AST', () => {
      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should generate query argument', () => {
      searchSource.setField('query', { language: 'kuery', query: 'something' });

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context q={kql q=\\"something\\"}
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should generate filters argument', () => {
      const filter1 = {
        query: { query_string: { query: 'query1' } },
        meta: {},
      };
      const filter2 = {
        query: { query_string: { query: 'query2' } },
        meta: {},
      };
      searchSource.setField('filter', [filter1, filter2]);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context filters={kibanaFilter query=\\"{\\\\\\"query_string\\\\\\":{\\\\\\"query\\\\\\":\\\\\\"query1\\\\\\"}}\\"}
          filters={kibanaFilter query=\\"{\\\\\\"query_string\\\\\\":{\\\\\\"query\\\\\\":\\\\\\"query2\\\\\\"}}\\"}
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should resolve filters if set as a function', () => {
      const filter = {
        query: { query_string: { query: 'query' } },
        meta: {},
      };
      searchSource.setField('filter', () => filter);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context filters={kibanaFilter query=\\"{\\\\\\"query_string\\\\\\":{\\\\\\"query\\\\\\":\\\\\\"query\\\\\\"}}\\"}
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should merge properties from parent search sources', () => {
      const filter1 = {
        query: { query_string: { query: 'query1' } },
        meta: {},
      };
      const filter2 = {
        query: { query_string: { query: 'query2' } },
        meta: {},
      };
      searchSource.setField('query', { language: 'kuery', query: 'something1' });
      searchSource.setField('filter', filter1);

      const childSearchSource = searchSource.createChild();
      childSearchSource.setField('query', { language: 'kuery', query: 'something2' });
      childSearchSource.setField('filter', filter2);

      expect(toString(childSearchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context q={kql q=\\"something2\\"} q={kql q=\\"something1\\"} filters={kibanaFilter query=\\"{\\\\\\"query_string\\\\\\":{\\\\\\"query\\\\\\":\\\\\\"query2\\\\\\"}}\\"}
          filters={kibanaFilter query=\\"{\\\\\\"query_string\\\\\\":{\\\\\\"query\\\\\\":\\\\\\"query1\\\\\\"}}\\"}
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should include a data view identifier', () => {
      searchSource.setField('index', indexPattern);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context
        | esdsl dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should include size if present', () => {
      searchSource.setField('size', 1000);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context
        | esdsl size=1000 dsl=\\"{}\\" index=\\"1234\\""
      `);
    });

    test('should generate the `esaggs` function if there are aggregations', () => {
      const typesRegistry = mockAggTypesRegistry();
      const aggConfigs = new AggConfigs(
        stubIndexPattern,
        [{ enabled: true, type: 'avg', schema: 'metric', params: { field: 'bytes' } }],
        { typesRegistry },
        jest.fn()
      );
      searchSource.setField('aggs', aggConfigs);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context
        | esaggs index={indexPatternLoad id=\\"logstash-*\\"} metricsAtAllLevels=false partialRows=false aggs={aggAvg field=\\"bytes\\" id=\\"1\\" enabled=true schema=\\"metric\\"}"
      `);
    });

    test('should generate the `esaggs` function if there are aggregations configs', () => {
      const typesRegistry = mockAggTypesRegistry();
      searchSourceDependencies.aggs.createAggConfigs.mockImplementationOnce(
        (dataView, configs) => new AggConfigs(dataView, configs, { typesRegistry }, jest.fn())
      );
      searchSource.setField('index', stubIndexPattern);
      searchSource.setField('aggs', [
        { enabled: true, type: 'avg', schema: 'metric', params: { field: 'bytes' } },
      ]);

      expect(toString(searchSource.toExpressionAst())).toMatchInlineSnapshot(`
        "kibana_context
        | esaggs index={indexPatternLoad id=\\"logstash-*\\"} metricsAtAllLevels=false partialRows=false aggs={aggAvg field=\\"bytes\\" id=\\"1\\" enabled=true schema=\\"metric\\"}"
      `);
    });

    test('should not include the `esdsl` function to the chain if the `asDatatable` option is false', () => {
      expect(toString(searchSource.toExpressionAst({ asDatatable: false }))).toBe('kibana_context');
    });

    test('should not include the `esaggs` function to the chain if the `asDatatable` option is false', () => {
      searchSource.setField('aggs', [
        { enabled: true, type: 'avg', schema: 'metric', params: { field: 'bytes' } },
      ]);

      expect(toString(searchSource.toExpressionAst({ asDatatable: false }))).toMatch(
        'kibana_context'
      );
    });
  });

  describe('parseActiveIndexPatternFromQueryString', () => {
    it.each([
      {
        indexPattern: '_index: logs-2024-06-27',
        expectedResult: ['logs-2024-06-27'],
        description: 'a single index name without wildcards',
      },
      {
        indexPattern: '_index: logs-*',
        expectedResult: ['logs-*'],
        description: 'a single index name with wildcards',
      },
      {
        indexPattern: '_index: logs-2024-06-27 or _index: foo-2024-06-27',
        expectedResult: ['logs-2024-06-27', 'foo-2024-06-27'],
        description: 'multiple index names',
      },
      {
        indexPattern: "_index: 'logs-2024-06-27'",
        expectedResult: ['logs-2024-06-27'],
        description: 'index names with single quotes',
      },
      {
        indexPattern: '_index: "logs-2024-06-27"',
        expectedResult: ['logs-2024-06-27'],
        description: 'index names with double quotes',
      },
      {
        indexPattern: '_index: "logs-2024-06-27\'',
        expectedResult: [],
        description: 'index pattern with mixed quotes',
      },
      {
        indexPattern: 'foo: bar',
        expectedResult: [],
        description: 'no index pattern when _index is not present',
      },
    ])('should extract $description', ({ indexPattern: actualIndexPattern, expectedResult }) => {
      const result = searchSource.parseActiveIndexPatternFromQueryString(actualIndexPattern);
      expect(result).toEqual(expectedResult);
    });
  });
});
