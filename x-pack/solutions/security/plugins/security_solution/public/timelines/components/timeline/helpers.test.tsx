/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep } from 'lodash/fp';

import { EXISTS_OPERATOR, IS_OPERATOR } from './data_providers/data_provider';
import { DataProviderTypeEnum } from '../../../../common/api/timeline';
import { mockDataProviders } from './data_providers/mock/mock_data_providers';

import {
  buildExistsQueryMatch,
  buildGlobalQuery,
  buildIsOneOfQueryMatch,
  buildIsQueryMatch,
  handleIsOperator,
  isFullScreen,
  isPrimitiveArray,
} from './helpers';

import { mockBrowserFields } from '../../../common/containers/source/mock';

const cleanUpKqlQuery = (str: string) => str.replace(/\n/g, '').replace(/\s\s+/g, ' ');

describe('Build KQL Query', () => {
  test('Build KQL query with one data provider', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1"');
  });

  test('Build KQL query with one template data provider', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].type = DataProviderTypeEnum.template;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name :*');
  });

  test('Build KQL query with one disabled data provider', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].enabled = false;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('');
  });

  test('Build KQL query with one data provider as timestamp (string input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = '@timestamp';
    dataProviders[0].queryMatch.value = '2018-03-23T23:36:23.232Z';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('@timestamp: 1521848183232');
  });

  test('Buld KQL query with one data provider as timestamp (numeric input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = '@timestamp';
    dataProviders[0].queryMatch.value = 1521848183232;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('@timestamp: 1521848183232');
  });

  test('Buld KQL query with one data provider as timestamp (numeric input as string)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = '@timestamp';
    dataProviders[0].queryMatch.value = '1521848183232';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('@timestamp: 1521848183232');
  });

  test('Build KQL query with one data provider as date type (string input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = 'event.end';
    dataProviders[0].queryMatch.value = '2018-03-23T23:36:23.232Z';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('event.end: 1521848183232');
  });

  test('Buld KQL query with one data provider as date type (numeric input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = 'event.end';
    dataProviders[0].queryMatch.value = 1521848183232;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('event.end: 1521848183232');
  });

  test('Buld KQL query with one data provider as date type (numeric input as string)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].queryMatch.field = 'event.end';
    dataProviders[0].queryMatch.value = '1521848183232';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('event.end: 1521848183232');
  });

  test('Build KQL query with two data provider', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('(name : "Provider 1") or (name : "Provider 2")');
  });

  test('Build KQL query with two data provider and first is disabled', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[0].enabled = false;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 2"');
  });

  test('Build KQL query with "includes" operator', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].enabled = true;
    dataProviders[0].queryMatch.operator = 'includes';
    dataProviders[0].queryMatch.value = ['a', 'b', 'c'];
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(`name : (\"a\" OR \"b\" OR \"c\")`);
  });

  test('Handles bad inputs to buildKQLQuery', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].enabled = true;
    dataProviders[0].queryMatch.operator = 'includes';
    dataProviders[0].queryMatch.value = [undefined] as unknown as string[];
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : [null]');
  });

  test('Build KQL query with two data provider and second is disabled', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[1].enabled = false;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1"');
  });

  test('Build KQL query with two data provider (first is template)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[0].type = DataProviderTypeEnum.template;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('(name :*) or (name : "Provider 2")');
  });

  test('Build KQL query with two data provider (second is template)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[1].type = DataProviderTypeEnum.template;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('(name : "Provider 1") or (name :*)');
  });

  test('Build KQL query with one data provider and one and', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1" and name : "Provider 2"');
  });

  test('Build KQL query with one disabled data provider and one and', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].enabled = false;
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 2"');
  });

  test('Build KQL query with one data provider and one and as timestamp (string input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    dataProviders[0].and[0].queryMatch.field = '@timestamp';
    dataProviders[0].and[0].queryMatch.value = '2018-03-23T23:36:23.232Z';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1" and @timestamp: 1521848183232');
  });

  test('Build KQL query with one data provider and one and as timestamp (numeric input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    dataProviders[0].and[0].queryMatch.field = '@timestamp';
    dataProviders[0].and[0].queryMatch.value = 1521848183232;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1" and @timestamp: 1521848183232');
  });

  test('Build KQL query with one data provider and one and as date type (string input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    dataProviders[0].and[0].queryMatch.field = 'event.end';
    dataProviders[0].and[0].queryMatch.value = '2018-03-23T23:36:23.232Z';
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1" and event.end: 1521848183232');
  });

  test('Build KQL query with one data provider and one and as date type (numeric input)', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 1));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(1, 2));
    dataProviders[0].and[0].queryMatch.field = 'event.end';
    dataProviders[0].and[0].queryMatch.value = 1521848183232;
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual('name : "Provider 1" and event.end: 1521848183232');
  });

  test('Build KQL query with two data provider and multiple and', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(2, 4));
    dataProviders[1].and = cloneDeep(mockDataProviders.slice(4, 5));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(
      '(name : "Provider 1" and name : "Provider 3" and name : "Provider 4") or (name : "Provider 2" and name : "Provider 5")'
    );
  });

  test('Build KQL query with two data provider and multiple and and first data provider is disabled', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[0].enabled = false;
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(2, 4));
    dataProviders[1].and = cloneDeep(mockDataProviders.slice(4, 5));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(
      '(name : "Provider 3" and name : "Provider 4") or (name : "Provider 2" and name : "Provider 5")'
    );
  });

  test('Build KQL query with two data provider and multiple and and first and provider is disabled', () => {
    const dataProviders = cloneDeep(mockDataProviders.slice(0, 2));
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(2, 4));
    dataProviders[0].and[0].enabled = false;
    dataProviders[1].and = cloneDeep(mockDataProviders.slice(4, 5));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(
      '(name : "Provider 1" and name : "Provider 4") or (name : "Provider 2" and name : "Provider 5")'
    );
  });

  test('Build KQL query with all data provider', () => {
    const kqlQuery = buildGlobalQuery(mockDataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(
      '(name : "Provider 1") or (name : "Provider 2") or (name : "Provider 3") or (name : "Provider 4") or (name : "Provider 5") or (name : "Provider 6") or (name : "Provider 7") or (name : "Provider 8") or (name : "Provider 9") or (name : "Provider 10")'
    );
  });

  test('Build complex KQL query with and and or', () => {
    const dataProviders = cloneDeep(mockDataProviders);
    dataProviders[0].and = cloneDeep(mockDataProviders.slice(2, 4));
    dataProviders[1].and = cloneDeep(mockDataProviders.slice(4, 5));
    const kqlQuery = buildGlobalQuery(dataProviders, mockBrowserFields);
    expect(cleanUpKqlQuery(kqlQuery)).toEqual(
      '(name : "Provider 1" and name : "Provider 3" and name : "Provider 4") or (name : "Provider 2" and name : "Provider 5") or (name : "Provider 3") or (name : "Provider 4") or (name : "Provider 5") or (name : "Provider 6") or (name : "Provider 7") or (name : "Provider 8") or (name : "Provider 9") or (name : "Provider 10")'
    );
  });
});

describe('isStringOrNumberArray', () => {
  test('it returns false when value is not an array', () => {
    expect(isPrimitiveArray('just a string')).toBe(false);
  });

  test('it returns false when value is an array of mixed types', () => {
    expect(isPrimitiveArray(['mixed', 123, 'types'])).toBe(false);
  });
  test('it returns false when value is an array of bad types', () => {
    const badValues = [undefined, null, {}] as unknown as string[];
    expect(isPrimitiveArray(badValues)).toBe(false);
  });

  test('it returns true when value is an empty array', () => {
    expect(isPrimitiveArray([])).toBe(true);
  });

  test('it returns true when value is an array of all strings', () => {
    expect(isPrimitiveArray(['all', 'string', 'values'])).toBe(true);
  });

  test('it returns true when value is an array of all numbers', () => {
    expect(isPrimitiveArray([123, 456, 789])).toBe(true);
  });

  describe('queryHandlerFunctions', () => {
    describe('handleIsOperator', () => {
      it('returns the entire query unchanged, if value is an array', () => {
        expect(
          handleIsOperator({
            browserFields: {},
            field: 'host.name',
            isExcluded: '',
            isFieldTypeNested: false,
            type: undefined,
            value: ['some', 'values'],
          })
        ).toBe('host.name : ["some","values"]');
      });
    });
  });

  describe('buildExistsQueryMatch', () => {
    it('correcty computes EXISTS query with no nested field', () => {
      expect(
        buildExistsQueryMatch({ isFieldTypeNested: false, field: 'host', browserFields: {} })
      ).toBe(`host ${EXISTS_OPERATOR}`);
    });
    it('correcty computes EXISTS query with nested field', () => {
      expect(
        buildExistsQueryMatch({
          isFieldTypeNested: true,
          field: 'nestedField.firstAttributes',
          browserFields: mockBrowserFields,
        })
      ).toBe(`nestedField: { firstAttributes: * }`);
    });
  });

  describe('buildIsQueryMatch', () => {
    it('correcty computes IS query with no nested field', () => {
      expect(
        buildIsQueryMatch({
          isFieldTypeNested: false,
          field: 'nestedField.thirdAttributes',
          value: 100000,
          browserFields: {},
        })
      ).toBe(`nestedField.thirdAttributes ${IS_OPERATOR} 100000`);
    });
    it('correcty computes IS query with nested date field', () => {
      expect(
        buildIsQueryMatch({
          isFieldTypeNested: true,
          browserFields: mockBrowserFields,
          field: 'nestedField.thirdAttributes',
          value: 100000,
        })
      ).toBe(`nestedField: { thirdAttributes${IS_OPERATOR} \"100000\" }`);
    });
    it('correcty computes IS query with nested string field', () => {
      expect(
        buildIsQueryMatch({
          isFieldTypeNested: true,
          browserFields: mockBrowserFields,
          field: 'nestedField.secondAttributes',
          value: 'text',
        })
      ).toBe(`nestedField: { secondAttributes${IS_OPERATOR} \"text\" }`);
    });
  });

  describe('buildIsOneOfQueryMatch', () => {
    it('correcty computes IS ONE OF query with numbers', () => {
      expect(
        buildIsOneOfQueryMatch({
          field: 'kibana.alert.worflow_status',
          value: [1, 2, 3],
        })
      ).toBe('kibana.alert.worflow_status : (1 OR 2 OR 3)');
    });
    it('correcty computes IS ONE OF query with strings', () => {
      expect(
        buildIsOneOfQueryMatch({
          field: 'kibana.alert.worflow_status',
          value: ['a', 'b', 'c'],
        })
      ).toBe(`kibana.alert.worflow_status : (\"a\" OR \"b\" OR \"c\")`);
    });
    it('correcty computes IS ONE OF query if value is an empty array', () => {
      expect(
        buildIsOneOfQueryMatch({
          field: 'kibana.alert.worflow_status',
          value: [],
        })
      ).toBe("kibana.alert.worflow_status : ''");
    });
  });
});

describe('isFullScreen', () => {
  describe('globalFullScreen is false', () => {
    it('should return false if isActiveTimelines is false', () => {
      const result = isFullScreen({
        globalFullScreen: false,
        isActiveTimelines: false,
        timelineFullScreen: true,
      });
      expect(result).toBe(false);
    });
    it('should return false if timelineFullScreen is false', () => {
      const result = isFullScreen({
        globalFullScreen: false,
        isActiveTimelines: true,
        timelineFullScreen: false,
      });
      expect(result).toBe(false);
    });
  });
  describe('globalFullScreen is true', () => {
    it('should return true if isActiveTimelines is true and timelineFullScreen is true', () => {
      const result = isFullScreen({
        globalFullScreen: true,
        isActiveTimelines: true,
        timelineFullScreen: true,
      });
      expect(result).toBe(true);
    });
    it('should return true if isActiveTimelines is false', () => {
      const result = isFullScreen({
        globalFullScreen: true,
        isActiveTimelines: false,
        timelineFullScreen: false,
      });
      expect(result).toBe(true);
    });
  });
});
