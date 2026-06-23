/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  dataViewMock,
  createDataViewWithBytesField,
  createDataViewWithoutCustomField,
  columnsMetaOverridingBytesType,
  columnsMetaWithCustomField,
  createFormatFieldValueReactSpy,
  expectFieldCallToMatch,
} from '../__mocks__';
import { formatHitReact } from './format_hit';
import { fieldFormatsMock } from '@kbn/field-formats-plugin/common/mocks';
import type { DataTableRecord, EsHitRecord } from '../types';
import { buildDataTableRecord } from './build_data_record';

describe('formatHitReact', () => {
  let row: DataTableRecord;
  let hit: EsHitRecord;
  beforeEach(() => {
    hit = {
      _id: '1',
      _index: 'logs',
      fields: {
        message: ['foobar'],
        extension: ['png'],
        'object.value': [42, 13],
        bytes: [123],
      },
    };
    row = buildDataTableRecord(hit, dataViewMock);
    (dataViewMock.getFormatterForField as jest.Mock).mockReturnValue({
      convertToReact: (value: unknown) => `formatted:${value}`,
    });
  });

  it('formats a document as expected using convertToReact', () => {
    const formatted = formatHitReact(
      row,
      dataViewMock,
      (fieldName) => ['_index', 'message', 'extension', 'object.value'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );
    expect(formatted).toEqual([
      ['extension', 'formatted:png', 'extension'],
      ['message', 'formatted:foobar', 'message'],
      ['object.value', 'formatted:42,13', 'object.value'],
      ['_index', 'formatted:logs', '_index'],
      ['_score', undefined, '_score'],
    ]);
  });

  it('orders highlighted fields first', () => {
    const highlightHit = buildDataTableRecord(
      {
        ...hit,
        highlight: { message: ['%%'] },
      },
      dataViewMock
    );

    const formatted = formatHitReact(
      highlightHit,
      dataViewMock,
      (fieldName) => ['_index', 'message', 'extension', 'object.value'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );
    expect(formatted.map(([fieldName]) => fieldName)).toEqual([
      'message',
      'extension',
      'object.value',
      '_index',
      '_score',
    ]);
  });

  it('orders inline highlights first', () => {
    const highlightHit = buildDataTableRecord(
      {
        ...hit,
        inline_highlights: { message: { preTag: '<em>', postTag: '</em>' } },
      },
      dataViewMock
    );
    const formatted = formatHitReact(
      highlightHit,
      dataViewMock,
      (fieldName) => ['_index', 'message', 'extension', 'object.value'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );
    expect(formatted.map(([fieldName]) => fieldName)).toEqual([
      'message',
      'extension',
      'object.value',
      '_index',
      '_score',
    ]);
  });

  it('only limits count of pairs based on advanced setting', () => {
    const formatted = formatHitReact(
      row,
      dataViewMock,
      (fieldName) => ['_index', 'message', 'extension', 'object.value'].includes(fieldName),
      2,
      fieldFormatsMock,
      undefined
    );
    expect(formatted).toEqual([
      ['extension', 'formatted:png', 'extension'],
      ['message', 'formatted:foobar', 'message'],
      ['and 3 more fields', '', null],
    ]);
  });

  it('should not include fields not mentioned in fieldsToShow', () => {
    const formatted = formatHitReact(
      row,
      dataViewMock,
      (fieldName) => ['_index', 'message', 'object.value'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );
    expect(formatted).toEqual([
      ['message', 'formatted:foobar', 'message'],
      ['object.value', 'formatted:42,13', 'object.value'],
      ['_index', 'formatted:logs', '_index'],
      ['_score', undefined, '_score'],
    ]);
  });

  it('should highlight a subfield even shouldShowFieldHandler determines it should not be shown ', () => {
    const highlightHit = buildDataTableRecord(
      {
        _id: '2',
        _index: 'logs',
        fields: {
          object: ['object'],
          'object.value': [42, 13],
        },
        highlight: { 'object.value': ['%%'] },
      },
      dataViewMock
    );

    const formatted = formatHitReact(
      highlightHit,
      dataViewMock,
      (fieldName) => ['_index', 'object'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );

    expect(formatted).toEqual([
      ['object.value', 'formatted:42,13', 'object.value'],
      ['object', ['object'], 'object'],
      ['_index', 'formatted:logs', '_index'],
      ['_score', undefined, '_score'],
    ]);
  });

  it('should filter fields based on their real name not displayName', () => {
    const formatted = formatHitReact(
      row,
      dataViewMock,
      (fieldName) => ['_index', 'bytes'].includes(fieldName),
      220,
      fieldFormatsMock,
      undefined
    );
    expect(formatted).toEqual([
      ['bytesDisplayName', 'formatted:123', 'bytes'],
      ['_index', 'formatted:logs', '_index'],
      ['_score', undefined, '_score'],
    ]);
  });

  it('skips nullish values before limiting fields when configured', () => {
    const rowWithNullishFields = buildDataTableRecord(
      {
        _id: 'doc-001',
        _source: {
          field_1: null,
          field_2: undefined,
          source: 'void_realm',
          status: 'missing_in_action',
        },
      },
      dataViewMock
    );

    formatHitReact(rowWithNullishFields, dataViewMock, () => true, 2, fieldFormatsMock, undefined);

    const formatted = formatHitReact(
      rowWithNullishFields,
      dataViewMock,
      () => true,
      2,
      fieldFormatsMock,
      undefined,
      { skipNullishValues: true }
    );

    expect(
      formatted.map(([fieldDisplayName, , fieldName]) => [fieldDisplayName, fieldName])
    ).toEqual([
      ['source', 'source'],
      ['status', 'status'],
    ]);
  });

  it('keeps non-nullish falsy values when skipping nullish values', () => {
    const rowWithFalsyFields = buildDataTableRecord(
      {
        _id: 'doc-002',
        _source: {
          field_1: null,
          a_empty_string: '',
          b_zero: 0,
          c_false_value: false,
          d_source: 'void_realm',
        },
      },
      dataViewMock
    );

    const formatted = formatHitReact(
      rowWithFalsyFields,
      dataViewMock,
      () => true,
      3,
      fieldFormatsMock,
      undefined,
      { skipNullishValues: true }
    );

    expect(
      formatted.map(([fieldDisplayName, , fieldName]) => [fieldDisplayName, fieldName])
    ).toEqual([
      ['a_empty_string', 'a_empty_string'],
      ['b_zero', 'b_zero'],
      ['c_false_value', 'c_false_value'],
      ['and 1 more field', null],
    ]);
  });

  describe('with columnsMeta', () => {
    let formatFieldValueReactSpy: jest.SpyInstance;

    beforeEach(() => {
      formatFieldValueReactSpy = createFormatFieldValueReactSpy();
    });

    afterEach(() => {
      formatFieldValueReactSpy.mockRestore();
    });

    it('should pass data view field to formatFieldValueReact when columnsMeta is undefined', () => {
      const testDataView = createDataViewWithBytesField();
      const testHit = buildDataTableRecord(
        { _id: '1', _index: 'logs', fields: { bytes: [100] } },
        testDataView
      );

      formatHitReact(testHit, testDataView, () => true, 220, fieldFormatsMock, undefined);

      expectFieldCallToMatch(formatFieldValueReactSpy, 'bytes', 'number');
    });

    it('should pass field with columnsMeta type to formatFieldValueReact when types differ', () => {
      const testDataView = createDataViewWithBytesField();
      const testHit = buildDataTableRecord(
        { _id: '1', _index: 'logs', fields: { bytes: ['100'] } },
        testDataView
      );

      formatHitReact(
        testHit,
        testDataView,
        () => true,
        220,
        fieldFormatsMock,
        columnsMetaOverridingBytesType
      );

      expectFieldCallToMatch(formatFieldValueReactSpy, 'bytes', 'string', ['keyword']);
    });

    it('should pass field created from columnsMeta to formatFieldValueReact for fields not in data view', () => {
      const testDataView = createDataViewWithoutCustomField();
      const testHit = buildDataTableRecord(
        { _id: '1', _index: 'logs', fields: { custom_esql_field: [42] } },
        testDataView
      );

      formatHitReact(
        testHit,
        testDataView,
        () => true,
        220,
        fieldFormatsMock,
        columnsMetaWithCustomField
      );

      expectFieldCallToMatch(formatFieldValueReactSpy, 'custom_esql_field', 'number', ['long']);
    });
  });
});
