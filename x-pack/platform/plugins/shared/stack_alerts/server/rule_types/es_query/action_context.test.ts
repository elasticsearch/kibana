/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EsQueryRuleActionContext } from './action_context';
import { addMessages, getContextConditionsDescription } from './action_context';
import type { EsQueryRuleParams } from '@kbn/response-ops-rule-params/es_query';
import { EsQueryRuleParamsSchema } from '@kbn/response-ops-rule-params/es_query';
import { Comparator } from '../../../common/comparator_types';

describe('addMessages', () => {
  it('generates expected properties', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      index: ['[index]'],
      timeField: '[timeField]',
      esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: '>',
      threshold: [4],
      searchType: 'esQuery',
      aggType: 'count',
      groupBy: 'all',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: 'count greater than 4',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      index: ['[index]'],
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' matched query"`);
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m in [index] index. Alert when greater than 4.'
    );
  });

  it('generates expected properties when isRecovered is true', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      index: ['[index]'],
      timeField: '[timeField]',
      esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: '<',
      threshold: [4],
      searchType: 'esQuery',
      aggType: 'count',
      groupBy: 'all',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: 'count not greater than 4',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      isRecovered: true,
      index: ['[index]'],
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' recovered"`);
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m in [index] index. Alert when less than 4.'
    );
  });

  it('generates expected properties if comparator is between', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      index: ['[index]'],
      timeField: '[timeField]',
      esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: 'between',
      threshold: [4, 5],
      searchType: 'esQuery',
      aggType: 'count',
      groupBy: 'all',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 4,
      conditions: 'count between 4 and 5',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      index: ['[index]'],
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' matched query"`);
    expect(context.message).toEqual(
      'Document count is 4 in the last 5m in [index] index. Alert when between 4 and 5.'
    );
  });

  it('generates expected properties when group is specified', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      index: ['[index]'],
      timeField: '[timeField]',
      esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: '>',
      threshold: [4],
      searchType: 'esQuery',
      aggType: 'count',
      groupBy: 'top',
      termField: 'host.name',
      termSize: 5,
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: `count for group "host-1" not greater than 4`,
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      group: 'host-1',
      index: ['[index]'],
    });
    expect(context.title).toMatchInlineSnapshot(
      `"rule '[rule-name]' matched query for group host-1"`
    );
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m for host-1 in [index] index. Alert when greater than 4.'
    );
  });

  it('generates expected properties when multiple indices', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      index: ['[index]', '[index1]'],
      timeField: '[timeField]',
      esQuery: `{\n  \"query\":{\n    \"match_all\" : {}\n  }\n}`,
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: '>',
      threshold: [4],
      searchType: 'esQuery',
      aggType: 'count',
      groupBy: 'all',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: 'count greater than 4',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      index: ['[index]', '[index1]'],
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' matched query"`);
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m in [index], [index1] indices. Alert when greater than 4.'
    );
  });

  it('generates expected properties when searchType = searchSource', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: '>',
      threshold: [4],
      searchConfiguration: {},
      searchType: 'searchSource',
      excludeHitsFromPreviousRun: true,
      aggType: 'count',
      groupBy: 'all',
      timeField: 'time',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: 'count greater than 4',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      index: ['TEST'],
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' matched query"`);
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m in TEST data view. Alert when greater than 4.'
    );
  });

  it('generates expected properties when searchType = esqlQuery', async () => {
    const params = EsQueryRuleParamsSchema.validate({
      size: 100,
      timeWindowSize: 5,
      timeWindowUnit: 'm',
      thresholdComparator: Comparator.GT,
      threshold: [0],
      esqlQuery: { esql: 'from test' },
      excludeHitsFromPreviousRun: false,
      searchType: 'esqlQuery',
      aggType: 'count',
      groupBy: 'all',
      timeField: 'time',
    }) as EsQueryRuleParams;
    const base: EsQueryRuleActionContext = {
      date: '2020-01-01T00:00:00.000Z',
      value: 42,
      conditions: 'count greater than 4',
      hits: [],
      link: 'link-mock',
      sourceFields: {},
    };
    const context = addMessages({
      ruleName: '[rule-name]',
      baseContext: base,
      params,
      index: null,
    });
    expect(context.title).toMatchInlineSnapshot(`"rule '[rule-name]' matched query"`);
    expect(context.message).toEqual(
      'Document count is 42 in the last 5m. Alert when greater than 0.'
    );
  });
});

describe('getContextConditionsDescription', () => {
  it('should return conditions correctly', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'count',
      searchType: 'esQuery',
    });
    expect(result).toBe(`Number of matching documents is greater than 10`);
  });

  it('should return conditions correctly when isRecovered is true', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'count',
      isRecovered: true,
      searchType: 'esQuery',
    });
    expect(result).toBe(`Number of matching documents is NOT greater than 10`);
  });

  it('should return conditions correctly when multiple thresholds provided', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.BETWEEN,
      threshold: [10, 20],
      aggType: 'count',
      isRecovered: true,
      searchType: 'esQuery',
    });
    expect(result).toBe(`Number of matching documents is NOT between 10 and 20`);
  });

  it('should return conditions correctly when group is specified', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'count',
      group: 'host-1',
      searchType: 'esQuery',
    });
    expect(result).toBe(`Number of matching documents for group "host-1" is greater than 10`);
  });

  it('should return conditions correctly when group is specified and isRecovered is true', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'count',
      isRecovered: true,
      group: 'host-1',
      searchType: 'esQuery',
    });
    expect(result).toBe(`Number of matching documents for group "host-1" is NOT greater than 10`);
  });

  it('should return conditions correctly when aggType is not count', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'min',
      aggField: 'numericField',
      searchType: 'esQuery',
    });
    expect(result).toBe(
      `Number of matching documents where min of numericField is greater than 10`
    );
  });

  it('should return conditions correctly when aggType is not count and isRecovered is true', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      aggType: 'min',
      aggField: 'numericField',
      isRecovered: true,
      searchType: 'esQuery',
    });
    expect(result).toBe(
      `Number of matching documents where min of numericField is NOT greater than 10`
    );
  });

  it('should return conditions correctly when group is specified and aggType is not count', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      group: 'host-1',
      aggType: 'max',
      aggField: 'numericField',
      searchType: 'esQuery',
    });
    expect(result).toBe(
      `Number of matching documents for group "host-1" where max of numericField is greater than 10`
    );
  });

  it('should return conditions correctly when group is specified, aggType is not count and isRecovered is true', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [10],
      isRecovered: true,
      group: 'host-1',
      aggType: 'max',
      aggField: 'numericField',
      searchType: 'esQuery',
    });
    expect(result).toBe(
      `Number of matching documents for group "host-1" where max of numericField is NOT greater than 10`
    );
  });

  it('should return conditions correctly for ESQL search type', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [0],
      aggType: 'count',
      searchType: 'esqlQuery',
    });
    expect(result).toBe(`Query matched documents`);
  });

  it('should return conditions correctly ESQL search type when isRecovered is true', () => {
    const result = getContextConditionsDescription({
      comparator: Comparator.GT,
      threshold: [0],
      aggType: 'count',
      isRecovered: true,
      searchType: 'esqlQuery',
    });
    expect(result).toBe(`Query did NOT match documents`);
  });
});
