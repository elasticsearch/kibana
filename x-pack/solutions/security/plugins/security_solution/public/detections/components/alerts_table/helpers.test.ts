/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DataProviderTypeEnum, TimelineTypeEnum } from '../../../../common/api/timeline';
import type { Filter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import type { DataProvider } from '../../../timelines/components/timeline/data_providers/data_provider';
import { mockDataProviders } from '../../../timelines/components/timeline/data_providers/mock/mock_data_providers';
import {
  getStringArray,
  replaceTemplateFieldFromQuery,
  replaceTemplateFieldFromMatchFilters,
  reformatDataProviderWithNewValue,
  buildTimeRangeFilter,
} from './helpers';
import { mockTimelineDetails } from '../../../common/mock';

describe('helpers', () => {
  describe('getStringOrStringArray', () => {
    test('it should correctly return a string array', () => {
      const value = getStringArray('x', [
        {
          field: 'x',
          values: ['The nickname of the developer we all :heart:'],
          isObjectArray: false,
          originalValue: 'The nickname of the developer we all :heart:',
        },
      ]);
      expect(value).toEqual(['The nickname of the developer we all :heart:']);
    });

    test('it should correctly return a string array with a single element', () => {
      const value = getStringArray('x', [
        {
          field: 'x',
          values: ['The nickname of the developer we all :heart:'],
          isObjectArray: false,
          originalValue: 'The nickname of the developer we all :heart:',
        },
      ]);
      expect(value).toEqual(['The nickname of the developer we all :heart:']);
    });

    test('it should correctly return a string array with two elements of strings', () => {
      const value = getStringArray('x', [
        {
          field: 'x',
          values: ['The nickname of the developer we all :heart:', 'We are all made of stars'],
          isObjectArray: false,
          originalValue: 'The nickname of the developer we all :heart:',
        },
      ]);
      expect(value).toEqual([
        'The nickname of the developer we all :heart:',
        'We are all made of stars',
      ]);
    });

    test('it should correctly return a string array with deep elements', () => {
      const value = getStringArray('x.y.z', [
        {
          field: 'x.y.z',
          values: ['zed'],
          isObjectArray: false,
          originalValue: 'zed',
        },
      ]);
      expect(value).toEqual(['zed']);
    });

    test('it should correctly return a string array with a non-existent value', () => {
      const value = getStringArray('non.existent', [
        {
          field: 'x.y.z',
          values: ['zed'],
          isObjectArray: false,
          originalValue: 'zed',
        },
      ]);
      expect(value).toEqual([]);
    });

    test('it should trace an error if the value is not a string', () => {
      const mockConsole: Console = { trace: jest.fn() } as unknown as Console;
      const value = getStringArray(
        'a',
        [
          {
            field: 'a',
            values: 5 as unknown as string[],
            isObjectArray: false,
            originalValue: 'zed',
          },
        ],
        mockConsole
      );
      expect(value).toEqual([]);
      expect(mockConsole.trace).toHaveBeenCalledWith(
        'Data type that is not a string or string array detected:',
        5,
        'when trying to access field:',
        'a',
        'from data object of:',
        [{ field: 'a', isObjectArray: false, originalValue: 'zed', values: 5 }]
      );
    });

    test('it should trace an error if the value is an array of mixed values', () => {
      const mockConsole: Console = { trace: jest.fn() } as unknown as Console;
      const value = getStringArray(
        'a',
        [
          {
            field: 'a',
            values: ['hi', 5] as unknown as string[],
            isObjectArray: false,
            originalValue: 'zed',
          },
        ],
        mockConsole
      );
      expect(value).toEqual([]);
      expect(mockConsole.trace).toHaveBeenCalledWith(
        'Data type that is not a string or string array detected:',
        ['hi', 5],
        'when trying to access field:',
        'a',
        'from data object of:',
        [{ field: 'a', isObjectArray: false, originalValue: 'zed', values: ['hi', 5] }]
      );
    });
  });

  describe('replaceTemplateFieldFromQuery', () => {
    describe('timelineType default', () => {
      test('given an empty query string this returns an empty query string', () => {
        const replacement = replaceTemplateFieldFromQuery(
          '',
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('');
      });

      test('given a query string with spaces this returns an empty query string', () => {
        const replacement = replaceTemplateFieldFromQuery(
          '    ',
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('');
      });

      test('it should replace a query with a template value such as apache from a mock template', () => {
        const replacement = replaceTemplateFieldFromQuery(
          'host.name: placeholdertext',
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('host.name: "apache"');
      });

      test('it should quote substituted template values that contain reserved KQL characters', () => {
        const url =
          'https://play.google.com/intl/en_us/badges/static/images/badges/en_badge_web_generic.png';
        const replacement = replaceTemplateFieldFromQuery(
          'host.name: placeholdertext',
          [
            {
              field: 'host.name',
              values: [url],
              originalValue: url,
              isObjectArray: false,
            },
          ],
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual(`host.name: "${url}"`);
      });

      test('it should replace a template field with an ECS value that is not an array', () => {
        const dupTimelineDetails = [...mockTimelineDetails];
        dupTimelineDetails[0] = {
          ...dupTimelineDetails[0],
          values: 'apache' as unknown as string[],
        }; // very unsafe cast for this test case
        const replacement = replaceTemplateFieldFromQuery(
          'host.name: *',
          dupTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('host.name: *');
      });

      test('it should NOT replace a query with a template value that is not part of the template fields array', () => {
        const replacement = replaceTemplateFieldFromQuery(
          'user.id: placeholdertext',
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('user.id: placeholdertext');
      });
    });

    describe('timelineType template', () => {
      test('given an empty query string this returns an empty query string', () => {
        const replacement = replaceTemplateFieldFromQuery(
          '',
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual('');
      });

      test('given a query string with spaces this returns an empty query string', () => {
        const replacement = replaceTemplateFieldFromQuery(
          '    ',
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual('');
      });

      test('it should NOT replace a query with a template value such as apache from a mock template', () => {
        const replacement = replaceTemplateFieldFromQuery(
          'host.name: placeholdertext',
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual('host.name: placeholdertext');
      });

      test('it should NOT replace a template field with an ECS value that is not an array', () => {
        const dupTimelineDetails = [...mockTimelineDetails];
        dupTimelineDetails[0] = {
          ...dupTimelineDetails[0],
          values: 'apache' as unknown as string[],
        }; // very unsafe cast for this test case
        const replacement = replaceTemplateFieldFromQuery(
          'host.name: *',
          dupTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('host.name: *');
      });

      test('it should NOT replace a query with a template value that is not part of the template fields array', () => {
        const replacement = replaceTemplateFieldFromQuery(
          'user.id: placeholdertext',
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual('user.id: placeholdertext');
      });
    });
  });

  describe('replaceTemplateFieldFromMatchFilters', () => {
    test('given an empty query filter this will return an empty filter', () => {
      const replacement = replaceTemplateFieldFromMatchFilters([], mockTimelineDetails);
      expect(replacement).toEqual([]);
    });

    test('given a query filter this will return that filter with the placeholder replaced', () => {
      const filters: Filter[] = [
        {
          meta: {
            type: 'phrase',
            key: 'host.name',
            alias: 'alias',
            disabled: false,
            negate: false,
            params: { query: 'Braden' },
          },
          query: { match_phrase: { 'host.name': 'Braden' } },
        },
      ];
      const replacement = replaceTemplateFieldFromMatchFilters(filters, mockTimelineDetails);
      const expected: Filter[] = [
        {
          meta: {
            type: 'phrase',
            key: 'host.name',
            alias: 'alias',
            disabled: false,
            negate: false,
            params: { query: 'apache' },
          },
          query: { match_phrase: { 'host.name': 'apache' } },
        },
      ];
      expect(replacement).toEqual(expected);
    });

    test('given a query filter with a value not in the templateFields, this will NOT replace the placeholder value', () => {
      const filters: Filter[] = [
        {
          meta: {
            type: 'phrase',
            key: 'user.id',
            alias: 'alias',
            disabled: false,
            negate: false,
            params: { query: 'Evan' },
          },
          query: { match_phrase: { 'user.id': 'Evan' } },
        },
      ];
      const replacement = replaceTemplateFieldFromMatchFilters(filters, mockTimelineDetails);
      const expected: Filter[] = [
        {
          meta: {
            type: 'phrase',
            key: 'user.id',
            alias: 'alias',
            disabled: false,
            negate: false,
            params: { query: 'Evan' },
          },
          query: { match_phrase: { 'user.id': 'Evan' } },
        },
      ];
      expect(replacement).toEqual(expected);
    });
  });

  describe('reformatDataProviderWithNewValue', () => {
    describe('timelineType default', () => {
      test('it should replace a query with a template value such as apache from a mock data provider', () => {
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'host.name';
        mockDataProvider.id = 'Braden';
        mockDataProvider.name = 'Braden';
        mockDataProvider.queryMatch.value = 'Braden';
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual({
          id: 'apache',
          name: 'apache',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'host.name',
            value: 'apache',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: TimelineTypeEnum.default,
        });
      });

      test('it should replace a query with a template value such as apache from a mock data provider using a string in the data provider', () => {
        const dupTimelineDetails = [...mockTimelineDetails];
        dupTimelineDetails[0] = {
          ...dupTimelineDetails[0],
          values: 'apache' as unknown as string[],
        }; // very unsafe cast for this test case
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'host.name';
        mockDataProvider.id = 'Braden';
        mockDataProvider.name = 'Braden';
        mockDataProvider.queryMatch.value = 'Braden';
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          dupTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual({
          id: 'apache',
          name: 'apache',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'host.name',
            value: 'apache',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: TimelineTypeEnum.default,
        });
      });

      test('it should NOT replace a query with a template value that is not part of a template such as user.id', () => {
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'user.id';
        mockDataProvider.id = 'my-id';
        mockDataProvider.name = 'Rebecca';
        mockDataProvider.queryMatch.value = 'Rebecca';
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          mockTimelineDetails,
          TimelineTypeEnum.default
        );
        expect(replacement).toEqual({
          id: 'my-id',
          name: 'Rebecca',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'user.id',
            value: 'Rebecca',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: TimelineTypeEnum.default,
        });
      });
    });

    describe('timelineType template', () => {
      test('it should replace a query with a template value such as apache from a mock data provider', () => {
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'host.name';
        mockDataProvider.id = 'Braden';
        mockDataProvider.name = 'Braden';
        mockDataProvider.queryMatch.value = '{host.name}';
        mockDataProvider.type = DataProviderTypeEnum.template;
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual({
          id: 'apache',
          name: 'apache',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'host.name',
            value: 'apache',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: DataProviderTypeEnum.default,
        });
      });

      test('it should NOT replace a query for default data provider', () => {
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'host.name';
        mockDataProvider.id = 'Braden';
        mockDataProvider.name = 'Braden';
        mockDataProvider.queryMatch.value = '{host.name}';
        mockDataProvider.type = DataProviderTypeEnum.default;
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual({
          id: 'Braden',
          name: 'Braden',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'host.name',
            value: '{host.name}',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: DataProviderTypeEnum.default,
        });
      });

      test('it should replace a query with a template value such as apache from a mock data provider using a string in the data provider', () => {
        const dupTimelineDetails = [...mockTimelineDetails];
        dupTimelineDetails[0] = {
          ...dupTimelineDetails[0],
          values: 'apache' as unknown as string[],
        }; // very unsafe cast for this test case
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'host.name';
        mockDataProvider.id = 'Braden';
        mockDataProvider.name = 'Braden';
        mockDataProvider.queryMatch.value = '{host.name}';
        mockDataProvider.type = DataProviderTypeEnum.template;
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          dupTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual({
          id: 'apache',
          name: 'apache',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'host.name',
            value: 'apache',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: DataProviderTypeEnum.default,
        });
      });

      test('it should replace a query with a template value that is not part of a template such as user.id', () => {
        const mockDataProvider: DataProvider = mockDataProviders[0];
        mockDataProvider.queryMatch.field = 'user.id';
        mockDataProvider.id = 'my-id';
        mockDataProvider.name = 'Rebecca';
        mockDataProvider.queryMatch.value = 'Rebecca';
        mockDataProvider.type = DataProviderTypeEnum.default;
        const replacement = reformatDataProviderWithNewValue(
          mockDataProvider,
          mockTimelineDetails,
          TimelineTypeEnum.template
        );
        expect(replacement).toEqual({
          id: 'my-id',
          name: 'Rebecca',
          enabled: true,
          excluded: false,
          kqlQuery: '',
          queryMatch: {
            field: 'user.id',
            value: 'Rebecca',
            operator: ':',
            displayField: undefined,
            displayValue: undefined,
          },
          and: [],
          type: DataProviderTypeEnum.default,
        });
      });
    });
  });

  describe('buildTimeRangeFilter', () => {
    test('time range filter is created with from and to', () => {
      const from = '2020-10-29T21:06:10.192Z';
      const to = '2020-10-29T21:07:38.774Z';
      const timeRangeFilter = buildTimeRangeFilter(from, to);
      expect(timeRangeFilter).toEqual([
        {
          range: {
            '@timestamp': {
              gte: '2020-10-29T21:06:10.192Z',
              lte: '2020-10-29T21:07:38.774Z',
              format: 'strict_date_optional_time',
            },
          },
          meta: {
            type: 'range',
            disabled: false,
            negate: false,
            alias: null,
            key: '@timestamp',
            params: {
              gte: from,
              lte: to,
              format: 'strict_date_optional_time',
            },
          },
          $state: {
            store: FilterStateStore.APP_STATE,
          },
        },
      ]);
    });
  });
});
