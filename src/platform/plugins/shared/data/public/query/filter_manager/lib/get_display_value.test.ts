/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DataView } from '@kbn/data-views-plugin/public';
import type { PhraseFilter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import {
  stubIndexPattern,
  phraseFilter,
  phrasesFilter,
  rangeFilter,
} from '../../../../common/stubs';
import { getDisplayValueFromFilter, getFieldDisplayValueFromFilter } from './get_display_value';
import { FieldFormat } from '@kbn/field-formats-plugin/common';
import { NULL_LABEL } from '@kbn/field-formats-common';

describe('getDisplayValueFromFilter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns the value if string', () => {
    const filter = { ...phraseFilter, meta: { ...phraseFilter.meta, value: 'abc' } };
    const displayValue = getDisplayValueFromFilter(filter, [stubIndexPattern]);
    expect(displayValue).toBe('abc');
  });

  it('returns NULL_LABEL if value is undefined', () => {
    const filter = {
      ...phraseFilter,
      meta: { ...phraseFilter.meta, value: undefined, params: { query: undefined } },
    };
    const displayValue = getDisplayValueFromFilter(filter, [stubIndexPattern]);
    expect(displayValue).toBe(NULL_LABEL);
  });

  it('returns 0 if value undefined and numeric field', () => {
    const filter = {
      meta: {
        negate: false,
        index: 'logstash-*',
        type: 'phrase',
        key: 'bytes',
        value: undefined,
        disabled: false,
        alias: null,
        params: {
          query: undefined,
        },
      },
      $state: {
        store: FilterStateStore.APP_STATE,
      },
      query: {
        match_phrase: {
          bytes: '0',
        },
      },
    };
    const displayValue = getDisplayValueFromFilter(filter, [stubIndexPattern]);
    expect(displayValue).toBe('0');
  });

  it('phrase filters without formatter', () => {
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => undefined!);
    const displayValue = getDisplayValueFromFilter(phraseFilter, [stubIndexPattern]);
    expect(displayValue).toBe('ios');
  });

  it('phrase filters with formatter', () => {
    const mockFormatter = new (FieldFormat.from((value: string) => 'banana' + value))();
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => mockFormatter);
    const displayValue = getDisplayValueFromFilter(phraseFilter, [stubIndexPattern]);
    expect(displayValue).toBe('bananaios');
  });

  it('phrases filters without formatter', () => {
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => undefined!);
    const displayValue = getDisplayValueFromFilter(phrasesFilter, [stubIndexPattern]);
    expect(displayValue).toBe('win xp, osx');
  });

  it('phrases filters with formatter', () => {
    const mockFormatter = new (FieldFormat.from((value: string) => 'banana' + value))();
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => mockFormatter);
    const displayValue = getDisplayValueFromFilter(phrasesFilter, [stubIndexPattern]);
    expect(displayValue).toBe('bananawin xp, bananaosx');
  });

  it('range filters without formatter', () => {
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => undefined!);
    const displayValue = getDisplayValueFromFilter(rangeFilter, [stubIndexPattern]);
    expect(displayValue).toBe('0 to 10');
  });

  it('range filters with formatter', () => {
    const mockFormatter = new (FieldFormat.from((value: string) => 'banana' + value))();
    jest.spyOn(stubIndexPattern, 'getFormatterForField').mockImplementation(() => mockFormatter);
    const displayValue = getDisplayValueFromFilter(rangeFilter, [stubIndexPattern]);
    expect(displayValue).toBe('banana0 to banana10');
  });
});

describe('getFieldDisplayValueFromFilter', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns empty string if the data view is not found', () => {
    const wrongDataView = {
      title: 'wrong data view',
      id: 'wrong data view',
    } as DataView;
    const fieldLabel = getFieldDisplayValueFromFilter(phraseFilter, [wrongDataView]);
    expect(fieldLabel).toBe('');
  });

  it('returns empty string if custom label is not set', () => {
    const filter: PhraseFilter = {
      meta: {
        negate: false,
        index: 'logstash-*',
        type: 'phrase',
        key: 'bytes',
        value: '1024',
        disabled: false,
        alias: null,
      },
      $state: {
        store: FilterStateStore.APP_STATE,
      },
      query: {},
    };
    const fieldLabel = getFieldDisplayValueFromFilter(filter, [stubIndexPattern]);
    expect(fieldLabel).toBe('');
  });

  it('returns the field custom label if it set', () => {
    const fieldLabel = getFieldDisplayValueFromFilter(phraseFilter, [stubIndexPattern]);
    expect(fieldLabel).toBe('OS');
  });
});
