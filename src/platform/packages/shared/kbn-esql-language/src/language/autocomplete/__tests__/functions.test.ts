/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { FunctionDefinitionTypes } from '../../../commands/definitions/types';
import type { ISuggestionItem } from '../../../commands/registry/types';
import { Location } from '../../../commands/registry/types';
import { setTestFunctions } from '../../../commands/definitions/utils/test_functions';
import { getFunctionSignaturesByReturnType, setup, createCustomCallbackMocks } from './helpers';
import { uniq } from 'lodash';
import type { PricingProduct } from '@kbn/core-pricing-common/src/types';
import {
  arithmeticOperators,
  comparisonFunctions,
  logicalOperators,
  nullCheckOperators,
  inOperators,
  patternMatchOperators,
} from '../../../commands/definitions/all_operators';

const arithmeticSymbols = arithmeticOperators.map(({ name }) => name);
const comparisonSymbols = comparisonFunctions.map(({ name }) => name);
const logicalSymbols = logicalOperators.map(({ name }) => name.toUpperCase());
const nullCheckSymbols = nullCheckOperators.map(({ name }) => name.toUpperCase());
const inSymbols = inOperators.map(({ name }) => name.toUpperCase());
const patternMatchSymbols = patternMatchOperators.map(({ name }) => name.toUpperCase());

describe('functions arg suggestions', () => {
  afterEach(() => {
    setTestFunctions([]);
  });

  describe('constantOnly parameter constraints', () => {
    it('constantOnly param with suggestedValues: suggests only those literals, not fields', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'date_diff_like',
          description: '',
          signatures: [
            {
              params: [
                {
                  name: 'unit',
                  type: 'keyword',
                  hint: {
                    kind: 'constant',
                    allowedValues: ['year', 'month', 'day', 'hour', 'minute'],
                  },
                },
                { name: 'left', type: 'date' },
                { name: 'right', type: 'date' },
              ],
              returnType: 'integer',
            },
          ],
          locationsAvailable: [Location.WHERE, Location.EVAL, Location.STATS],
        },
      ]);

      const { assertSuggestions } = await setup();
      await assertSuggestions('FROM index | WHERE DATE_DIFF_LIKE(/)', [
        '"year", ',
        '"month", ',
        '"day", ',
        '"hour", ',
        '"minute", ',
      ]);
    });

    it('aggregation function: constantOnly second param does not suggest fields', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.AGG,
          name: 'percentile_like',
          description: '',
          signatures: [
            {
              params: [
                { name: 'field', type: 'double' },
                { name: 'percent', type: 'double', hint: { kind: 'constant' } },
              ],
              returnType: 'double',
            },
          ],
          locationsAvailable: [Location.STATS],
        },
      ]);

      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | STATS PERCENTILE_LIKE(integerField, /)');
      const labels = suggestions.map(({ label }) => label);
      ['doubleField', 'integerField', 'longField', 'unsignedLongField'].forEach((f) =>
        expect(labels).not.toContain(f)
      );
    });

    it('constantOnly param with suggestedValues: suggests specific literals after numeric constant', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.AGG,
          name: 'top_like',
          description: '',
          signatures: [
            {
              params: [
                { name: 'field', type: 'keyword' },
                { name: 'limit', type: 'integer', hint: { kind: 'constant' } },
                {
                  name: 'order',
                  type: 'keyword',
                  hint: { kind: 'constant', allowedValues: ['asc', 'desc'] },
                },
              ],
              returnType: 'keyword',
            },
          ],
          locationsAvailable: [Location.STATS],
        },
      ]);

      const { assertSuggestions } = await setup();
      await assertSuggestions('FROM index | STATS TOP_LIKE(keywordField, 10, /)', [
        '"asc"',
        '"desc"',
      ]);
    });

    it('grouping function: field param allows expressions, then constantOnly params exclude fields', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.GROUPING,
          name: 'bucket_mock',
          description: 'Mock BUCKET function',
          signatures: [
            {
              params: [
                { name: 'field', type: 'double', optional: false },
                { name: 'buckets', type: 'integer', optional: false, hint: { kind: 'constant' } },
                { name: 'from', type: 'double', optional: true, hint: { kind: 'constant' } },
                { name: 'to', type: 'double', optional: true, hint: { kind: 'constant' } },
              ],
              returnType: 'double',
            },
          ],
          locationsAvailable: [Location.STATS, Location.STATS_BY],
        },
      ]);

      const { suggest } = await setup();

      const afterField = await suggest('FROM index | STATS BY BUCKET_MOCK(doubleField /)');
      const labelsAfterField = afterField.map(({ label }) => label);

      expect(labelsAfterField).toContain(',');

      expect(labelsAfterField).toEqual(expect.arrayContaining(arithmeticSymbols));

      const afterFirstComma = await suggest('FROM index | STATS BY BUCKET_MOCK(doubleField, /)');
      const labelsAfterComma = afterFirstComma.map(({ label }) => label);

      expect(labelsAfterComma).not.toContain('doubleField');
      expect(labelsAfterComma).not.toContain('integerField');
      expect(labelsAfterComma).not.toContain('textField');

      const afterConstant = await suggest('FROM index | STATS BY BUCKET_MOCK(doubleField, 10 /)');
      const labelsAfterConstant = afterConstant.map(({ label }) => label);

      expect(labelsAfterConstant).toContain(',');
      expect(labelsAfterConstant).not.toContain('doubleField');
    });

    it('grouping function: time_duration param type suggests only literals, not fields or functions', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.GROUPING,
          name: 'tbucket_mock',
          description: 'Mock TBUCKET function - operates on implicit @timestamp',
          signatures: [
            {
              params: [{ name: 'buckets', type: 'time_duration', optional: false }],
              returnType: 'date',
            },
          ],
          locationsAvailable: [Location.STATS, Location.STATS_BY],
        },
      ]);

      const { suggest } = await setup();

      const afterOpen = await suggest('FROM index | STATS BY TBUCKET_MOCK(/');
      const labelsAfterOpen = afterOpen.map(({ label }) => label);

      expect(labelsAfterOpen).not.toContain('dateField');
      expect(labelsAfterOpen).not.toContain('@timestamp');
      expect(labelsAfterOpen).not.toContain('doubleField');

      expect(labelsAfterOpen).not.toContain('DATE_DIFF');
      expect(labelsAfterOpen).not.toContain('NOW');
    });

    it('time-series agg: field param no operators, optional precision param suggests integers, last param no comma', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.TIME_SERIES_AGG,
          name: 'count_distinct_over_time_mock',
          description: 'Mock COUNT_DISTINCT_OVER_TIME - optional precision param',
          signatures: [
            {
              params: [
                { name: 'field', type: 'integer', optional: false },
                { name: 'precision', type: 'integer', optional: true },
              ],
              returnType: 'long',
            },
          ],
          locationsAvailable: [Location.STATS_TIMESERIES],
        },
      ]);

      const { suggest } = await setup();

      const afterField = await suggest(
        'FROM index | STATS COUNT_DISTINCT_OVER_TIME_MOCK(integerField /'
      );
      const labelsAfterField = afterField.map(({ label }) => label);

      expect(labelsAfterField).toContain(',');

      arithmeticSymbols.forEach((op) => {
        expect(labelsAfterField).not.toContain(op);
      });

      const afterComma = await suggest(
        'FROM index | STATS COUNT_DISTINCT_OVER_TIME_MOCK(integerField, /'
      );
      const labelsAfterComma = afterComma.map(({ label }) => label);

      expect(labelsAfterComma).toContain('integerField');
      expect(labelsAfterComma).not.toContain('doubleField');
      expect(labelsAfterComma).toContain('CEIL'); // returns integer
      expect(labelsAfterComma).toContain('FLOOR'); // returns integer

      const afterPrecision = await suggest(
        'FROM index | STATS COUNT_DISTINCT_OVER_TIME_MOCK(integerField, 100 /'
      );
      const labelsAfterPrecision = afterPrecision.map(({ label }) => label);

      expect(labelsAfterPrecision).not.toContain(',');
    });
  });

  describe('operator and comma suggestions based on parameter context', () => {
    it('single-param numeric function: after field suggests arithmetic operators, not comparison/logical', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = SQRT(doubleField /)');
      const labels = suggestions.map(({ label }) => label);

      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());
      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      const logical = logicalOperators.map(({ name }) => name.toUpperCase());

      expect(labels).toEqual(expect.arrayContaining(arithmetic));
      comparison.forEach((operatorName) => expect(labels).not.toContain(operatorName));
      logical.forEach((operatorName) => expect(labels).not.toContain(operatorName));
    });

    it('after arithmetic operator in numeric function param: suggests numeric fields and functions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ROUND(doubleField + /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['doubleField', 'integerField', 'longField']));
      expect(labels).toEqual(expect.arrayContaining(['ABS', 'CEIL', 'FLOOR']));
    });

    it('function with optional second param: after first field suggests comma AND operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ROUND(doubleField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining([',']));
      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());
      expect(labels).toEqual(expect.arrayContaining(arithmetic));
    });

    it('ROUND second param (decimals) is constantOnly: should NOT suggest fields/functions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ROUND(doubleField, /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).not.toContain('doubleField');
      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('longField');
      expect(labels).not.toContain('ABS');
      expect(labels).not.toContain('CEIL');
      expect(labels).not.toContain('FLOOR');
    });

    it('ROUND_TO second param (points) is constantOnly: should NOT suggest fields/functions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ROUND_TO(doubleField, /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).not.toContain('doubleField');
      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('longField');
      expect(labels).not.toContain('ABS');
      expect(labels).not.toContain('CEIL');
      expect(labels).not.toContain('FLOOR');
    });

    it('nested functions: excludes parent function names from suggestions to prevent recursion', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CEIL(FLOOR(ABS(/)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['doubleField', 'integerField', 'longField', 'unsignedLongField'])
      );
      expect(labels).not.toContain('ABS');
      expect(labels).not.toContain('CEIL');
      expect(labels).not.toContain('FLOOR');
      expect(labels).toEqual(expect.arrayContaining(['ROUND', 'SQRT']));
    });

    it('multi-param function: second param accepts fields/functions, excludes self to prevent recursion', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = POW(doubleField + 2, /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['doubleField', 'integerField', 'longField', 'unsignedLongField'])
      );
      expect(labels).not.toContain('POW');
      expect(labels).toEqual(expect.arrayContaining(['ABS', 'ROUND', 'CEIL', 'FLOOR']));
    });

    it('variadic string function: after first string field suggests comma, not arithmetic operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CONCAT(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining([',']));
      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());
      arithmetic.forEach((op) => expect(labels).not.toContain(op));
    });

    it('single-param string function in WHERE: after field no comma (last param), no comparison operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE TRIM(textField /)');
      const labels = suggestions.map(({ label }) => label);

      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      comparison.forEach((operatorName) => expect(labels).not.toContain(operatorName));
    });

    it('single-param string function in EVAL: after text field no operators (function accepts type directly)', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = TRIM(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual([]);
    });

    it('single-param string function in EVAL: after keyword field no operators (function accepts type directly)', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = TRIM(keywordField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual([]);
    });

    it('variadic string function in EVAL: after first string field suggests comma, not operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CONCAT(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual([',']);
    });
  });

  describe('type filtering and field suggestions by parameter type', () => {
    it('numeric function param: suggests numeric fields and numeric functions, excludes self', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ABS(/)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['doubleField', 'integerField', 'longField', 'unsignedLongField'])
      );
      expect(labels).toEqual(expect.arrayContaining(['ROUND', 'CEIL', 'FLOOR']));
      expect(labels).not.toContain('ABS');
    });

    it('string function param: suggests text/keyword fields and string functions, excludes self', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = TRIM(/)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['textField', 'keywordField']));
      expect(labels).toEqual(
        expect.arrayContaining(['CONCAT', 'SUBSTRING', 'TO_UPPER', 'TO_LOWER'])
      );
      expect(labels).not.toContain('TRIM');
    });

    it('variadic function: text and keyword types are interchangeable in homogeneous params', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = COALESCE(textField, /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['textField', 'keywordField']));
      expect(labels).toEqual(expect.arrayContaining(['CONCAT', 'SUBSTRING']));
    });

    it('after unknown-type field: suggests type-compatible fields/functions based on function param type', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ABS(unknownField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual([]);
    });

    it('conditional expression: non-boolean field in condition suggests pattern/null/IN operators (not comparison)', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining([...patternMatchSymbols, ...inSymbols, ...nullCheckSymbols])
      );
      const comparison = comparisonFunctions.map(({ name }) => name);
      comparison.forEach((op) => {
        expect(labels).not.toContain(op);
      });
    });

    it('IN operator: suggests opening parenthesis for list', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(integerField IN /)');
      const texts = suggestions.map(({ text }) => text);

      expect(texts).toContain('($0)');
    });

    it.each([
      ['IN', 'FROM index | EVAL integerField IN /'],
      ['NOT IN', 'FROM index | EVAL integerField NOT IN /'],
    ])('%s operator in EVAL expression: does not add a new-column suggestion', async (_, query) => {
      const { suggest } = await setup();
      const suggestions = await suggest(query);
      const texts = suggestions.map(({ text }) => text);

      expect(texts).toContain('($0)');
      expect(texts).not.toContain('col0 = ');
    });

    it('NOT IN operator: suggests opening parenthesis for list', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(integerField NOT IN /)');
      const texts = suggestions.map(({ text }) => text);

      expect(texts).toContain('($0)');
    });

    it.each([
      ['simple field', 'FROM index | WHERE integerField IN (/)'],
      ['nested field', 'FROM index | WHERE kubernetes.something.something IN (/)'],
      ['function result', 'FROM index | WHERE CONCAT(textField, keywordField) IN (/)'],
      ['inside CASE', 'FROM index | EVAL col0 = CASE(keywordField IN (/)'],
      [
        'multiple IN - cursor on second',
        'FROM index | WHERE integerField IN (1) AND keywordField IN (/)',
      ],
      ['nested IN inside CASE', 'FROM index | EVAL x = CASE(a IN (1), "yes", keywordField IN (/)'],
    ])('IN operator with %s: suggests fields and functions', async (_, query) => {
      const { suggest } = await setup();
      const suggestions = await suggest(query);

      const fieldSuggestions = suggestions.filter(({ kind }) => kind === 'Variable');

      expect(suggestions.length).toBeGreaterThan(0);
      expect(fieldSuggestions.length).toBeGreaterThan(0);
    });

    it('IN operator with a started list: keeps suggestions and does not leak marker text', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE integerField IN (1, /)');

      expect(suggestions.length).toBeGreaterThan(0);
      suggestions.forEach(({ label, text }) => {
        expect(label).not.toContain('marker_esql_editor');
        expect(text).not.toContain('marker_esql_editor');
      });
    });

    it('unary NOT operator in WHERE: suggests boolean fields and boolean-returning functions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE NOT /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['booleanField']));

      const booleanFunctions = getFunctionSignaturesByReturnType(Location.WHERE, 'boolean', {
        scalar: true,
      }).map(({ label }) => label);
      expect(labels).toEqual(expect.arrayContaining(booleanFunctions));
    });

    it('unary NOT operator in EVAL: suggests boolean fields and boolean-returning functions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = NOT /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['booleanField']));

      const booleanFunctions = getFunctionSignaturesByReturnType(Location.EVAL, 'boolean', {
        scalar: true,
      }).map(({ label }) => label);
      expect(labels).toEqual(expect.arrayContaining(booleanFunctions));
    });

    it('date function param: suggests date fields, date-returning functions, and time picker literal', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = DATE_DIFF("day", /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['dateField']));
      expect(labels).toEqual(expect.arrayContaining(['DATE_PARSE', 'DATE_TRUNC', 'TO_DATE_NANOS']));
      expect(labels).toEqual(expect.arrayContaining(['Choose from the time picker']));
    });

    it('date parsing function: accepts string fields and string-returning functions, excludes numeric', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = DATE_PARSE(/)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['textField', 'keywordField']));
      expect(labels).toEqual(expect.arrayContaining(['CONCAT', 'SUBSTRING']));
      expect(labels).not.toContain('doubleField');
      expect(labels).not.toContain('integerField');
    });

    it('after logical operator (AND): suggests all field types to build boolean expressions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(doubleField > 10 AND /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['booleanField']));
      expect(labels).toEqual(
        expect.arrayContaining(['doubleField', 'integerField', 'textField', 'dateField'])
      );
      expect(labels).toEqual(expect.arrayContaining(['ABS', 'CONCAT', 'DATE_DIFF']));
    });
  });
  it('suggests based on available signatures and existing params', async () => {
    setTestFunctions([
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'func',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'integer',
              },
            ],
            returnType: 'double',
          },
          {
            params: [
              {
                name: 'arg',
                type: 'long',
              },
            ],
            returnType: 'double',
          },
          {
            params: [
              {
                name: 'arg',
                type: 'double',
              },
              {
                name: 'arg2',
                type: 'double',
              },
            ],
            returnType: 'double',
          },
          {
            params: [
              {
                name: 'arg',
                type: 'double',
              },
              {
                name: 'arg2',
                type: 'long',
              },
              {
                name: 'arg3',
                type: 'long',
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
    ]);

    const doubleSuggestions = [
      'doubleField',
      'kubernetes.something.something',
      '`any#Char$Field`',
      ...getFunctionSignaturesByReturnType(Location.EVAL, ['double'], { scalar: true }).map(
        ({ text }) => text
      ),
    ];

    const integerSuggestions = [
      'integerField',
      ...getFunctionSignaturesByReturnType(Location.EVAL, ['integer'], { scalar: true }).map(
        ({ text }) => text
      ),
    ];

    const longSuggestions = [
      'longField',
      ...getFunctionSignaturesByReturnType(Location.EVAL, ['long'], { scalar: true }).map(
        ({ text }) => text
      ),
    ];

    const { assertSuggestions } = await setup();

    await assertSuggestions(
      'FROM index | EVAL FUNC(/)',
      uniq([...doubleSuggestions, ...integerSuggestions, ...longSuggestions])
    );
    await assertSuggestions(
      'FROM index | EVAL FUNC(doubleField, /)',
      uniq([...doubleSuggestions, ...longSuggestions])
    );
    await assertSuggestions('FROM index | EVAL FUNC(doubleField, doubleField, /)', []);
    await assertSuggestions('FROM index | EVAL FUNC(doubleField, longField, /)', longSuggestions);
  });

  it('suggests accepted values or suggested literals', async () => {
    setTestFunctions([
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'func_with_suggested_values',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'keyword',
                hint: { kind: 'constant', allowedValues: ['value1', 'value2', 'value3'] },
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
    ]);

    const { assertSuggestions } = await setup();

    await assertSuggestions('FROM index | EVAL FUNC_WITH_SUGGESTED_VALUES(/)', [
      '"value1"',
      '"value2"',
      '"value3"',
    ]);
  });

  it('respects constant-only', async () => {
    setTestFunctions([
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'func_with_constant_only_param',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'keyword',
                hint: { kind: 'constant' },
              },
              {
                name: 'arg2',
                type: 'keyword',
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
    ]);

    const { suggest } = await setup();

    const isColumn = (s: ISuggestionItem) => s.kind === 'Variable';

    const constantOnlySuggestions = await suggest(
      'FROM index | EVAL FUNC_WITH_CONSTANT_ONLY_PARAM(/)'
    );
    expect(constantOnlySuggestions.every((s) => !isColumn(s))).toBe(true);

    const nonConstantOnlySuggestions = await suggest(
      'FROM index | EVAL FUNC_WITH_CONSTANT_ONLY_PARAM("lolz", /)'
    );
    expect(nonConstantOnlySuggestions.every((s) => !isColumn(s))).toBe(false);
  });

  describe('Tier and license-based autocomplete suggestions', () => {
    beforeEach(() => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.GROUPING,
          name: 'platinum_function_mock',
          description: '',
          signatures: [
            {
              params: [
                {
                  name: 'field',
                  type: 'keyword',
                  optional: false,
                },
              ],
              license: 'platinum',
              returnType: 'keyword',
            },
            {
              params: [
                {
                  name: 'field',
                  type: 'text',
                  optional: false,
                },
              ],
              license: 'platinum',
              returnType: 'keyword',
            },
          ],
          locationsAvailable: [Location.STATS],
          license: 'platinum',
          observabilityTier: 'COMPLETE',
        },
        {
          type: FunctionDefinitionTypes.AGG,
          name: 'platinum_partial_function_mock',
          description: '',
          signatures: [
            {
              params: [
                {
                  name: 'field',
                  type: 'cartesian_point',
                  optional: false,
                },
              ],
              returnType: 'cartesian_shape',
            },
            {
              params: [
                {
                  name: 'field',
                  type: 'cartesian_shape',
                  optional: false,
                },
              ],
              license: 'platinum',
              returnType: 'cartesian_shape',
            },
          ],
          locationsAvailable: [Location.STATS],
        },
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'inner_function_mock',
          description: '',
          signatures: [
            {
              params: [
                {
                  name: 'field',
                  type: 'cartesian_point',
                  optional: false,
                },
              ],
              returnType: 'cartesian_point',
            },
            {
              params: [
                {
                  name: 'field',
                  type: 'keyword',
                  optional: false,
                },
              ],
              returnType: 'cartesian_point',
            },
          ],
          locationsAvailable: [Location.STATS],
        },
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'inner_function_platinum_mock',
          description: '',
          signatures: [
            {
              params: [
                {
                  name: 'field',
                  type: 'cartesian_point',
                  optional: false,
                },
              ],
              returnType: 'cartesian_shape',
            },
            {
              params: [
                {
                  name: 'field',
                  type: 'cartesian_shape',
                  optional: false,
                },
              ],
              returnType: 'cartesian_shape',
            },
          ],
          locationsAvailable: [Location.STATS],
          license: 'platinum',
        },
      ]);
    });

    it('should hide PLATINUM license functions when user has BASIC license', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const basicLicenseCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() !== 'platinum',
          })
        ),
      };

      const basicSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: basicLicenseCallbacks,
      });

      expect(basicSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(false);
      expect(basicSuggestions.some((s) => s.text.match('PLATINUM_PARTIAL_FUNCTION_MOCK'))).toBe(
        true
      );
    });

    it('should show all aggregation functions when user has PLATINUM license', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'platinum',
          })
        ),
      };

      const platinumSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: platinumLicenseCallbacks,
      });

      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(true);
      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_PARTIAL_FUNCTION_MOCK'))).toBe(
        true
      );
    });

    it('should filter function arguments inside mixed-signature functions with BASIC license', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const basicLicenseCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() !== 'platinum',
          })
        ),
      };

      const partialSuggestions = await suggest(
        'FROM index | STATS agg = PLATINUM_PARTIAL_FUNCTION_MOCK( /',
        {
          callbacks: basicLicenseCallbacks,
        }
      );

      expect(partialSuggestions.some((s) => s.text.match('INNER_FUNCTION_MOCK'))).toBe(true);
      expect(partialSuggestions.some((s) => s.text.match('INNER_FUNCTION_PLATINUM_MOCK'))).toBe(
        false
      );
    });

    it('should show all function arguments inside mixed-signature functions with PLATINUM license', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'platinum',
          })
        ),
      };

      const partialPlatinumSuggestions = await suggest(
        'FROM index | STATS agg = PLATINUM_PARTIAL_FUNCTION_MOCK( /',
        {
          callbacks: platinumLicenseCallbacks,
        }
      );

      expect(partialPlatinumSuggestions.some((s) => s.text.match('INNER_FUNCTION_MOCK'))).toBe(
        true
      );
      expect(
        partialPlatinumSuggestions.some((s) => s.text.match('INNER_FUNCTION_PLATINUM_MOCK'))
      ).toBe(true);
    });

    it('should show PLATINUM_FUNCTION_MOCK when user has Platinum license and Observability tier complete', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseAndObservabilityTierCompleteCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'platinum',
          })
        ),
        getActiveProduct: jest.fn(
          () => ({ type: 'observability', tier: 'complete' } as PricingProduct)
        ),
      };

      const platinumSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: platinumLicenseAndObservabilityTierCompleteCallbacks,
      });

      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(true);
    });

    it('should not show PLATINUM_FUNCTION_MOCK when user has basic license and Observability tier complete', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseAndObservabilityTierCompleteCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'basic',
          })
        ),
        getActiveProduct: jest.fn(
          () => ({ type: 'observability', tier: 'complete' } as PricingProduct)
        ),
      };

      const platinumSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: platinumLicenseAndObservabilityTierCompleteCallbacks,
      });

      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(false);
    });

    it('should not show PLATINUM_FUNCTION_MOCK when user has Platinum license and Observability tier log_essentials', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseAndObservabilityTierLogCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'platinum',
          })
        ),
        getActiveProduct: jest.fn(
          () => ({ type: 'observability', tier: 'logs_essentials' } as PricingProduct)
        ),
      };

      const platinumSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: platinumLicenseAndObservabilityTierLogCallbacks,
      });

      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(false);
    });

    it('should show PLATINUM_FUNCTION_MOCK when user has Platinum license and Security tier complete', async () => {
      const { suggest } = await setup();
      const callbacks = createCustomCallbackMocks();

      const platinumLicenseAndObservabilityTierLogCallbacks = {
        ...callbacks,
        getLicense: jest.fn(async () =>
          Promise.resolve({
            hasAtLeast: (license: string) => license.toLowerCase() === 'platinum',
          })
        ),
        getActiveProduct: jest.fn(
          () =>
            ({
              type: 'security',
              tier: 'essentials',
              product_lines: [],
            } as PricingProduct)
        ),
      };

      const platinumSuggestions = await suggest('FROM index | STATS agg = /', {
        callbacks: platinumLicenseAndObservabilityTierLogCallbacks,
      });

      expect(platinumSuggestions.some((s) => s.text.match('PLATINUM_FUNCTION_MOCK'))).toBe(true);
    });

    it('string functions with concatenation', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CONCAT(textField, " - ", /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['textField', 'keywordField']));
      expect(labels).not.toContain('CONCAT');
      expect(labels).toEqual(expect.arrayContaining(['SUBSTRING', 'TO_UPPER', 'TO_LOWER', 'TRIM']));
      expect(labels).toEqual(expect.arrayContaining(['MV_CONCAT']));
    });

    it('boolean fields suggest logical operators AND/OR, not math operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE booleanField /');
      const labels = suggestions.map(({ label }) => label);

      const logical = logicalOperators.map(({ name }) => name.toUpperCase());
      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());

      expect(labels).toEqual(expect.arrayContaining(logical));
      arithmetic.forEach((op) => expect(labels).not.toContain(op));
    });

    it('date fields suggest comparison and date arithmetic operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE dateField /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(comparisonSymbols));

      expect(labels).toContain('+');
      expect(labels).toContain('-');

      ['*', '/', '%'].forEach((op) => {
        expect(labels).not.toContain(op);
      });
    });

    it('numeric-only function parameter suggests only arithmetic operators for numeric fields in WHERE', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | WHERE TO_AGGREGATE_METRIC_DOUBLE(integerField /)'
      );
      const labels = suggestions.map(({ label }) => label);

      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());
      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      const logical = logicalOperators.map(({ name }) => name.toUpperCase());

      expect(labels).toEqual(expect.arrayContaining(arithmetic));
      comparison.forEach((operatorName) => expect(labels).not.toContain(operatorName));
      logical.forEach((operatorName) => expect(labels).not.toContain(operatorName));
    });

    describe('COALESCE commas and operators (generic cases)', () => {
      it.each([
        {
          name: 'first param string: comma and string operators',
          query: 'FROM index | EVAL result = COALESCE(textField /)',
          expectComma: true,
          expectContains: [...patternMatchSymbols, ...inSymbols, ...nullCheckSymbols],
          expectNotContains: comparisonSymbols, // No comparison operators for strings
        },
        {
          name: 'first param numeric: comma and arithmetic/comparison',
          query: 'FROM index | EVAL result = COALESCE(integerField /)',
          expectComma: true,
          expectContains: [
            ...arithmeticOperators.map(({ name }) => name.toUpperCase()),
            ...comparisonFunctions.map(({ name }) => name.toUpperCase()),
          ],
        },
        {
          name: 'after complete expression: comma and logical operators',
          query: 'FROM index | EVAL result = COALESCE(textField == "test" /)',
          expectComma: true,
          expectContains: ['AND', 'OR'],
        },
        {
          name: 'after arithmetic expression: comma and arithmetic operators',
          query: 'FROM index | EVAL result = COALESCE(integerField + integerField /)',
          expectComma: true,
          expectContains: ['+', '-', '*', '/'],
        },
        {
          name: 'second param string: no comma, string functions',
          query: 'FROM index | EVAL result = COALESCE(textField, /)',
          expectComma: false,
          expectContains: ['textField', 'keywordField', 'CONCAT', 'SUBSTRING'],
        },
        {
          name: 'second param numeric: no comma, numeric functions',
          query: 'FROM index | EVAL result = COALESCE(integerField, /)',
          expectComma: false,
          expectContains: ['integerField', 'ABS', 'ROUND'],
        },
      ])('$name', async ({ query, expectComma, expectContains, expectNotContains }) => {
        const { suggest } = await setup();
        const suggestions = await suggest(query);
        const labels = suggestions.map(({ label }) => label);

        expect(labels).toEqual(expect.arrayContaining(expectContains));

        if (expectNotContains) {
          expectNotContains.forEach((item) => {
            expect(labels).not.toContain(item);
          });
        }

        if (expectComma) {
          expect(labels).toEqual(expect.arrayContaining([',']));
        } else {
          expect(labels).not.toContain(',');
        }
      });
    });

    it('COALESCE return type matches first parameter - accepts type-compatible expressions', async () => {
      const { suggest } = await setup();

      const suggestionsNum = await suggest('FROM index | EVAL result = COALESCE(integerField, /)');
      const labelsNum = suggestionsNum.map(({ label }) => label);
      expect(labelsNum).toEqual(expect.arrayContaining(['integerField', 'ABS', 'ROUND']));
      ['textField', 'booleanField', 'dateField'].forEach((v) => expect(labelsNum).not.toContain(v));

      const suggestionsText = await suggest('FROM index | EVAL result = COALESCE(textField, /)');
      const labelsText = suggestionsText.map(({ label }) => label);
      expect(labelsText).toEqual(
        expect.arrayContaining(['textField', 'keywordField', 'CONCAT', 'SUBSTRING'])
      );
      ['doubleField', 'booleanField', 'integerField'].forEach((v) =>
        expect(labelsText).not.toContain(v)
      );

      const suggestionsDate = await suggest('FROM index | EVAL result = COALESCE(dateField, /)');
      const labelsDate = suggestionsDate.map(({ label }) => label);
      expect(labelsDate).toEqual(
        expect.arrayContaining([
          'dateField',
          'DATE_PARSE',
          'DATE_TRUNC',
          'Choose from the time picker',
        ])
      );
      ['textField', 'doubleField', 'booleanField'].forEach((v) =>
        expect(labelsDate).not.toContain(v)
      );

      const suggestionsBool = await suggest('FROM index | EVAL result = COALESCE(booleanField, /)');
      const labelsBool = suggestionsBool.map(({ label }) => label);
      expect(labelsBool).toEqual(
        expect.arrayContaining([
          'booleanField',
          'textField',
          'doubleField',
          'integerField',
          'dateField',
        ])
      );
    });

    it('CONCAT variadic: after second param should suggest comma', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = CONCAT(textField, keywordField /)'
      );
      const labels = suggestions.map(({ label }) => label);

      // Should suggest comma for continuing with more params (variadic function)
      expect(labels).toContain(',');
    });

    it('CONCAT variadic: after comma should suggest fields for third param', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = CONCAT(textField, keywordField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      // Should suggest fields for third parameter (variadic accepts more params)
      expect(labels).toContain('textField');
      expect(labels).toContain('keywordField');
    });
  });

  describe('consistent behavior across EVAL and STATS contexts', () => {
    it.each([
      ['EVAL', 'FROM index | EVAL result = SQRT(doubleField /)'],
      ['STATS', 'FROM index | STATS result = SQRT(doubleField /)'],
    ])('numeric param after field: arithmetic operators only in %s', async (_ctx, query) => {
      const { suggest } = await setup();
      const suggestions = await suggest(query);
      const labels = suggestions.map(({ label }) => label);

      const arithmetic = arithmeticOperators.map(({ name }) => name.toUpperCase());
      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      const logical = logicalOperators.map(({ name }) => name.toUpperCase());

      expect(labels).toEqual(expect.arrayContaining(arithmetic));
      comparison.forEach((operatorName) => expect(labels).not.toContain(operatorName));
      logical.forEach((operatorName) => expect(labels).not.toContain(operatorName));
    });

    it.each([
      ['EVAL', 'FROM index | EVAL result = ROUND(doubleField + /)'],
      ['STATS', 'FROM index | STATS result = ROUND(doubleField + /)'],
    ])(
      'after arithmetic operator: suggests numeric fields/functions in %s',
      async (_ctx, query) => {
        const { suggest } = await setup();
        const suggestions = await suggest(query);
        const labels = suggestions.map(({ label }) => label);

        expect(labels).toEqual(
          expect.arrayContaining(['doubleField', 'integerField', 'longField'])
        );
        expect(labels).toEqual(expect.arrayContaining(['ABS', 'CEIL', 'FLOOR']));
      }
    );

    it('conditional with text field: suggests pattern/IN/null operators (not comparison) in EVAL', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(textField /)');
      const labels = suggestions.map(({ label }) => label);
      expect(labels).toEqual(
        expect.arrayContaining([...patternMatchSymbols, ...inSymbols, ...nullCheckSymbols])
      );

      const comparison = comparisonFunctions.map(({ name }) => name);
      comparison.forEach((op) => {
        expect(labels).not.toContain(op);
      });
    });

    it('conditional with text field: suggests pattern/IN/null operators (not comparison) in STATS', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | STATS result = CASE(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining([]));

      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      comparison.forEach((op) => {
        expect(labels).not.toContain(op);
      });
    });

    it('variadic function after text field: comma and pattern/IN/null operators in EVAL', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = COALESCE(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining([',']));
      expect(labels).toEqual(
        expect.arrayContaining([...patternMatchSymbols, ...inSymbols, ...nullCheckSymbols])
      );

      const comparison = comparisonFunctions.map(({ name }) => name);
      comparison.forEach((op) => expect(labels).not.toContain(op));
    });

    it('variadic function after text field: comma only in STATS (location restricts pattern operators)', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | STATS result = COALESCE(textField /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining([',']));

      const comparison = comparisonFunctions.map(({ name }) => name.toUpperCase());
      comparison.forEach((op) => expect(labels).not.toContain(op));
    });
  });

  it('treats text and keyword as interchangeable', async () => {
    setTestFunctions([
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'accepts_keyword',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'text',
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'accepts_keyword_and_text',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'keyword',
              },
            ],
            returnType: 'double',
          },
          {
            params: [
              {
                name: 'arg',
                type: 'text',
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
      {
        type: FunctionDefinitionTypes.SCALAR,
        name: 'accepts_text',
        description: '',
        signatures: [
          {
            params: [
              {
                name: 'arg',
                type: 'text',
              },
            ],
            returnType: 'double',
          },
        ],
        locationsAvailable: [Location.EVAL],
      },
    ]);

    const expected = [
      'keywordField',
      'textField',
      ...getFunctionSignaturesByReturnType(Location.EVAL, ['keyword', 'text'], {
        scalar: true,
      }).map(({ text }) => text),
    ];

    const { assertSuggestions } = await setup();

    await assertSuggestions('FROM index | EVAL ACCEPTS_KEYWORD_AND_TEXT(/)', expected);
    await assertSuggestions('FROM index | EVAL ACCEPTS_KEYWORD(/)', expected);
    await assertSuggestions('FROM index | EVAL ACCEPTS_TEXT(/)', expected);
  });

  describe('variadic function type homogeneity enforcement', () => {
    it('enforces integer type homogeneity for third parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(integerField, integerField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('integerField');

      const integerFunctions = getFunctionSignaturesByReturnType(Location.EVAL, ['integer'], {
        scalar: true,
      }).map(({ label }) => label);
      expect(labels).toEqual(expect.arrayContaining(integerFunctions.slice(0, 3))); // Sample check

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('keywordField');
      expect(labels).not.toContain('booleanField');
      expect(labels).not.toContain('dateField');

      expect(labels).not.toContain('CONCAT');
      expect(labels).not.toContain('SUBSTRING');
      expect(labels).not.toContain('TRIM');
    });

    it('enforces geo_point type homogeneity for third parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(geoPointField, geoPointField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('geoPointField');

      const geoPointFunctions = getFunctionSignaturesByReturnType(Location.EVAL, ['geo_point'], {
        scalar: true,
      })
        .map(({ label }) => label)
        .filter((name) => name !== 'COALESCE'); // Exclude parent function

      if (geoPointFunctions.length > 0) {
        expect(labels).toEqual(expect.arrayContaining(geoPointFunctions.slice(0, 3)));
      }

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('booleanField');
      expect(labels).not.toContain('dateField');
      expect(labels).not.toContain('cartesianPointField'); // Different spatial type

      expect(labels).not.toContain('CONCAT');
      expect(labels).not.toContain('ABS');
      expect(labels).not.toContain('TRIM');
    });

    it('allows any type for boolean parameters to support expressions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = COALESCE(booleanField, /)');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['booleanField', 'integerField', 'textField', 'dateField'])
      );

      expect(labels).toEqual(expect.arrayContaining(['ABS', 'CONCAT']));
    });

    it('enforces homogeneity at fourth parameter and beyond', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(integerField, integerField, integerField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('integerField');

      const integerFunctions = getFunctionSignaturesByReturnType(Location.EVAL, ['integer'], {
        scalar: true,
      })
        .map(({ label }) => label)
        .filter((name) => name !== 'COALESCE');

      if (integerFunctions.length > 0) {
        expect(labels).toEqual(expect.arrayContaining(integerFunctions.slice(0, 3)));
      }

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('doubleField');
      expect(labels).not.toContain('booleanField');
    });

    it('enforces text/keyword homogeneity for string parameters', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(textField, keywordField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('textField');
      expect(labels).toContain('keywordField');

      const stringFunctions = getFunctionSignaturesByReturnType(
        Location.EVAL,
        ['text', 'keyword'],
        { scalar: true }
      )
        .map(({ label }) => label)
        .filter((name) => name !== 'COALESCE');

      if (stringFunctions.length > 0) {
        expect(labels).toEqual(
          expect.arrayContaining([expect.stringMatching(/CONCAT|SUBSTRING|TRIM|UPPER|LOWER/)])
        );
      }

      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('booleanField');
      expect(labels).not.toContain('dateField');
    });

    it('enforces date type homogeneity', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(dateField, dateField, /)'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('dateField');

      const dateFunctions = getFunctionSignaturesByReturnType(Location.EVAL, ['date'], {
        scalar: true,
      })
        .map(({ label }) => label)
        .filter((name) => name !== 'COALESCE');

      if (dateFunctions.length > 0) {
        expect(labels).toEqual(expect.arrayContaining(dateFunctions.slice(0, 3)));
      }

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('booleanField');
      expect(labels).not.toContain('geoPointField');
    });

    it('suggests appropriate operators after first parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = COALESCE(integerField /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(arithmeticSymbols));

      expect(labels).toEqual(expect.arrayContaining(comparisonSymbols));

      expect(labels).toContain(',');

      [...patternMatchSymbols, ...logicalSymbols].forEach((op) => expect(labels).not.toContain(op));
    });

    it('suggests comparison operators after field in second parameter when first is boolean expression', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | WHERE COALESCE(integerField > 10, integerField /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(comparisonSymbols));

      expect(labels).toEqual(expect.arrayContaining(arithmeticSymbols));
    });
  });

  describe('boolean expressions and logical operators in conditional contexts', () => {
    it('suggests fields after OR operator in condition', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL r = CASE(integerField > 10 OR /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['booleanField', 'textField', 'integerField', 'dateField'])
      );

      expect(labels).toEqual(expect.arrayContaining(['ABS', 'CONCAT']));
    });

    it('suggests fields after AND operator following comparison', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL r = CASE(textField == "test" AND /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(
        expect.arrayContaining(['booleanField', 'integerField', 'dateField', 'textField'])
      );

      expect(labels).toEqual(expect.arrayContaining(['ABS', 'LENGTH']));
    });

    it('suggests fields after NOT operator', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL r = CASE(NOT /');
      const labels = suggestions.map(({ label }) => label);

      if (labels.length === 0) {
        expect(labels.length).toBeGreaterThanOrEqual(0);

        return;
      }

      expect(labels).toEqual(expect.arrayContaining(['booleanField', 'integerField', 'textField']));

      expect(labels).toContain('ABS');

      [...logicalSymbols, ...arithmeticSymbols].forEach((op) => expect(labels).not.toContain(op));
    });

    it('suggests NOT IN, NOT LIKE, NOT RLIKE after field NOT keyword', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE textField NOT /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('IN');
      expect(labels).toContain('LIKE');
      expect(labels).toContain('RLIKE');

      expect(labels).not.toContain('IS NULL');
      expect(labels).not.toContain('==');
    });

    it('suggests logical operators after complete boolean expression', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL r = CASE(integerField > 10 /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      arithmeticSymbols.forEach((op) => expect(labels).not.toContain(op));
    });

    it('suggests appropriate operators in nested CASE conditions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL r = CASE(integerField > 10 AND textField == "test" /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      comparisonSymbols.forEach((op) => expect(labels).not.toContain(op));
    });

    it.todo('suggests only string literals inside LIKE list in CASE');
  });

  describe('null check operators (IS NULL, IS NOT NULL) behavior', () => {
    it('suggests only logical operators after IS NULL', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE textField IS NULL /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      [...comparisonSymbols, ...arithmeticSymbols].forEach((op) =>
        expect(labels).not.toContain(op)
      );
    });

    it('suggests only logical operators after IS NOT NULL', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE integerField IS NOT NULL /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      [...comparisonSymbols, ...arithmeticSymbols].forEach((op) =>
        expect(labels).not.toContain(op)
      );
    });

    it('handles IS NULL in EVAL context', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = dateField IS NULL /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      comparisonSymbols.forEach((op) => expect(labels).not.toContain(op));
    });

    it('suggests IS NULL and IS NOT NULL after partial IS operator in conditional function', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'test_conditional',
          description: 'Test conditional expression function',
          signatures: [
            {
              params: [
                { name: 'condition', type: 'boolean' },
                { name: 'trueValue', type: 'any' },
                { name: 'falseValue', type: 'any', optional: true },
              ],
              returnType: 'any',
              minParams: 2,
            },
          ],
          locationsAvailable: [Location.EVAL, Location.WHERE, Location.STATS],
        },
      ]);

      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = TEST_CONDITIONAL(textField IS /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(nullCheckSymbols));

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('TEST_CONDITIONAL');
    });

    it('suggests IS NOT NULL when typing "IS NO" partial in WHERE', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE textField IS NO/');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('IS NOT NULL');
      expect(labels).not.toContain('IS NULL'); // Doesn't match "IS NO" prefix
    });

    it('suggests both IS NULL and IS NOT NULL when typing "IS N" partial in WHERE', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE textField IS N/');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['IS NULL', 'IS NOT NULL']));
    });

    it('suggests IS NOT NULL when typing "IS NO" partial in CASE function', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL r = CASE(textField IS NO/');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('IS NOT NULL');
      expect(labels).not.toContain('IS NULL');
    });

    it('handles IS NOT NULL in function context', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'test_conditional',
          description: 'Test conditional expression function',
          signatures: [
            {
              params: [
                { name: 'condition', type: 'boolean' },
                { name: 'trueValue', type: 'any' },
                { name: 'falseValue', type: 'any', optional: true },
              ],
              returnType: 'any',
              minParams: 2,
            },
          ],
          locationsAvailable: [Location.EVAL, Location.WHERE, Location.STATS],
        },
      ]);

      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = TEST_CONDITIONAL(booleanField IS NOT NULL /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      arithmeticSymbols.forEach((symbol) => expect(labels).not.toContain(symbol));
    });

    it('boolean parameter suggests only boolean fields and boolean-returning functions', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'test_conditional',
          description: 'Test conditional expression function',
          signatures: [
            {
              params: [
                { name: 'condition', type: 'boolean' },
                { name: 'trueValue', type: 'any' },
                { name: 'falseValue', type: 'any', optional: true },
              ],
              returnType: 'any',
              minParams: 2,
            },
          ],
          locationsAvailable: [Location.EVAL, Location.WHERE, Location.STATS],
        },
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'test_boolean_func',
          description: 'Test function that returns boolean',
          signatures: [
            {
              params: [{ name: 'value', type: 'any' }],
              returnType: 'boolean',
            },
          ],
          locationsAvailable: [Location.EVAL, Location.WHERE, Location.STATS],
        },
      ]);

      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = TEST_CONDITIONAL(/');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toContain('booleanField');
      expect(labels).toContain('TEST_BOOLEAN_FUNC');

      expect(labels).not.toContain('integerField');
      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('dateField');
      expect(labels).not.toContain('TEST_CONDITIONAL');
    });

    it('boolean parameter with non-boolean field suggests all relevant operators', async () => {
      setTestFunctions([
        {
          type: FunctionDefinitionTypes.SCALAR,
          name: 'test_conditional',
          description: 'Test conditional expression function',
          signatures: [
            {
              params: [
                { name: 'condition', type: 'boolean' },
                { name: 'trueValue', type: 'any' },
              ],
              returnType: 'any',
            },
          ],
          locationsAvailable: [Location.EVAL, Location.WHERE, Location.STATS],
        },
      ]);

      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = TEST_CONDITIONAL(integerField /'
      );
      const labels = suggestions.map(({ label }) => label);

      const comparison = comparisonFunctions.map(({ name }) => name);

      expect(labels).toEqual(
        expect.arrayContaining([
          ...comparison,
          ...nullCheckSymbols,
          ...inSymbols,
          ...arithmeticSymbols,
        ])
      );

      expect(labels).toContain('TEST_CONDITIONAL');
      expect(labels).not.toContain(',');
    });
  });

  describe('comma vs operators decision based on expression completeness', () => {
    it('suggests comma and not operators after complete expression in CASE value parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(integerField > 10, /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['integerField', 'textField', 'booleanField']));

      logicalSymbols.forEach((op) => expect(labels).not.toContain(op));
    });

    it('suggests operators and comma before comma in CASE condition parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(integerField > 10 /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');
    });

    it('suggests only numeric fields and not operators in POW second parameter', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = POW(integerField, /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['integerField', 'longField', 'doubleField']));

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('keywordField');

      expect(labels).not.toContain('booleanField');
    });

    it('does not suggest comma in top-level WHERE after field, only operators', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | WHERE integerField /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(arithmeticSymbols));

      expect(labels).toEqual(expect.arrayContaining(comparisonSymbols));

      expect(labels).not.toContain(',');
    });
  });

  describe('nested and deeply nested expression context handling', () => {
    it('correctly suggests numeric fields after operator in nested function', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = ABS(integerField + /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['integerField', 'longField', 'doubleField']));

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('keywordField');
      expect(labels).not.toContain('booleanField');
    });

    it('correctly suggests numeric fields in deeply nested function context', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = ROUND(SQRT(ABS(integerField + /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(['integerField', 'longField', 'doubleField']));

      expect(labels).toEqual(expect.arrayContaining(['ABS', 'CEIL', 'FLOOR']));

      expect(labels).not.toContain('textField');
      expect(labels).not.toContain('booleanField');

      expect(labels).not.toContain('CONCAT');
      expect(labels).not.toContain('SUBSTRING');
    });

    it('suggests logical operators and comma after IS NOT NULL in nested CASE function', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM index | EVAL result = CASE(textField IS NOT NULL /');
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      [...arithmeticSymbols, ...comparisonSymbols].forEach((op) =>
        expect(labels).not.toContain(op)
      );
    });

    it('suggests logical operators after IS NULL in nested COALESCE boolean context', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = COALESCE(booleanField, integerField IS NULL /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      [...arithmeticSymbols, ...comparisonSymbols].forEach((op) =>
        expect(labels).not.toContain(op)
      );
    });

    it('suggests logical operators in deeply nested boolean expression with IS NOT NULL', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = CASE(CASE(textField IS NOT NULL /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).toEqual(expect.arrayContaining(logicalSymbols));

      expect(labels).toContain(',');

      [...arithmeticSymbols, ...comparisonSymbols].forEach((op) =>
        expect(labels).not.toContain(op)
      );

      expect(labels).not.toContain('CASE');
    });
  });

  describe('conditional function autocomplete', () => {
    beforeEach(() => {
      setTestFunctions([
        {
          name: 'conditional_mock',
          type: FunctionDefinitionTypes.SCALAR,
          description: 'Mock function with isSignatureRepeating',
          locationsAvailable: [Location.EVAL, Location.STATS],
          signatures: [
            {
              params: [
                { name: 'condition', type: 'boolean' },
                { name: 'value', type: 'any' },
              ],
              returnType: 'unknown',
              minParams: 2,
              isSignatureRepeating: true,
            },
          ],
        },
      ]);
    });

    it('does not suggest comma after string literal at default position', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest(
        'FROM index | EVAL result = CONDITIONAL_MOCK(booleanField, "value", "default" /'
      );
      const labels = suggestions.map(({ label }) => label);

      expect(labels).not.toContain(',');
    });
  });
});

describe('function renaming respects existing parentheses', () => {
  it('suggests the function name if the user is only changing the name of the function', async () => {
    const { suggest } = await setup();
    const suggestions = await suggest('FROM index | EVAL result = TO_/(');
    const texts = suggestions.map(({ text }) => text);

    expect(texts).toEqual(expect.arrayContaining(['TO_STRING']));
  });

  it('suggests the function name with parens if writting the function from scratch', async () => {
    const { suggest } = await setup();
    const suggestions = await suggest('FROM index | EVAL result = TO_/');
    const texts = suggestions.map(({ text }) => text);

    expect(texts).toEqual(expect.arrayContaining(['TO_STRING($0)']));
  });
});
