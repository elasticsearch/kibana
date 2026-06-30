/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getExceptionListItemSchemaMock } from '@kbn/lists-plugin/common/schemas/response/exception_list_item_schema.mock';
import type { EntriesArray, ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { ListOperatorTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import { ES_FIELD_TYPES, KBN_FIELD_TYPES } from '@kbn/field-types';
import {
  collectRuntimeFieldTypes,
  entryHasNonEcsType,
  entryHasListType,
  mapDataViewFieldToRuntimeType,
  shouldDisableBulkClose,
} from './utils';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
import { RuntimeFieldTypeEnum } from '../../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';

const mockEcsIndexPattern = {
  title: 'testIndex',
  fields: [
    {
      name: 'some.parentField',
    },
    {
      name: 'some.not.nested.field',
    },
    {
      name: 'nested.field',
    },
  ],
} as DataViewBase;

describe('alerts_actions#utils', () => {
  describe('#entryHasListType', () => {
    test('it should return false with an empty array', () => {
      const payload: ExceptionListItemSchema[] = [];
      const result = entryHasListType(payload);
      expect(result).toEqual(false);
    });

    test("it should return false with exception items that don't contain a list type", () => {
      const payload = [getExceptionListItemSchemaMock(), getExceptionListItemSchemaMock()];
      const result = entryHasListType(payload);
      expect(result).toEqual(false);
    });

    test('it should return true with exception items that do contain a list type', () => {
      const payload = [
        {
          ...getExceptionListItemSchemaMock(),
          entries: [{ type: ListOperatorTypeEnum.LIST }] as EntriesArray,
        },
        getExceptionListItemSchemaMock(),
      ];
      const result = entryHasListType(payload);
      expect(result).toEqual(true);
    });
  });

  describe('#entryHasNonEcsType', () => {
    test('it should return false with an empty array', () => {
      const payload: ExceptionListItemSchema[] = [];
      const result = entryHasNonEcsType(payload, mockEcsIndexPattern);
      expect(result).toEqual(false);
    });

    test("it should return false with exception items that don't contain a non ecs type", () => {
      const payload = [getExceptionListItemSchemaMock(), getExceptionListItemSchemaMock()];
      const result = entryHasNonEcsType(payload, mockEcsIndexPattern);
      expect(result).toEqual(false);
    });

    test('it should return true with exception items that do contain a non ecs type', () => {
      const payload = [
        {
          ...getExceptionListItemSchemaMock(),
          entries: [{ field: 'some.nonEcsField' }] as EntriesArray,
        },
        getExceptionListItemSchemaMock(),
      ];
      const result = entryHasNonEcsType(payload, mockEcsIndexPattern);
      expect(result).toEqual(true);
    });
  });

  describe('#shouldDisableBulkClose', () => {
    it('returns true if items include large value lists', () => {
      expect(
        shouldDisableBulkClose({
          items: [
            {
              ...getExceptionListItemSchemaMock(),
              entries: [
                {
                  field: 'host.name',
                  list: { type: 'text', id: 'blob' },
                  operator: 'included',
                  type: 'list',
                },
              ],
            },
          ],
        })
      ).toBeTruthy();
    });

    // After elastic/kibana#253666 the gate no longer disables for fields that
    // happen to be missing from the alerts index — bulk-close handles those
    // server-side via runtime-field synthesis. The component surfaces a
    // warning callout instead.
    it('returns false if the only entry references a field not on the alerts index', () => {
      expect(
        shouldDisableBulkClose({
          items: [
            {
              ...getExceptionListItemSchemaMock(),
              entries: [{ field: 'some.nonEcsField' }] as EntriesArray,
            },
          ],
        })
      ).toBeFalsy();
    });

    it('returns true if all items have no entries', () => {
      expect(
        shouldDisableBulkClose({
          items: [
            {
              ...getExceptionListItemSchemaMock(),
              entries: [] as EntriesArray,
            },
          ],
        })
      ).toBeTruthy();
    });

    it('returns true if no items exist', () => {
      expect(
        shouldDisableBulkClose({
          items: [],
        })
      ).toBeTruthy();
    });

    it('returns false if no large value list entries exist and there is at least one entry', () => {
      expect(
        shouldDisableBulkClose({
          items: [getExceptionListItemSchemaMock(), getExceptionListItemSchemaMock()],
        })
      ).toBeFalsy();
    });
  });

  describe('#mapDataViewFieldToRuntimeType', () => {
    const getField = (overrides: Partial<DataViewFieldBase>): DataViewFieldBase =>
      ({ name: 'f', type: 'string', ...overrides } as DataViewFieldBase);

    // Single-esType cases: each ES type maps to its closest runtime field type.
    it.each([
      [ES_FIELD_TYPES.IP, RuntimeFieldTypeEnum.ip],
      [ES_FIELD_TYPES.KEYWORD, RuntimeFieldTypeEnum.keyword],
      // Text-shaped ES types collapse to keyword (the queryable form).
      [ES_FIELD_TYPES.TEXT, RuntimeFieldTypeEnum.keyword],
      [ES_FIELD_TYPES.MATCH_ONLY_TEXT, RuntimeFieldTypeEnum.keyword],
      [ES_FIELD_TYPES.VERSION, RuntimeFieldTypeEnum.keyword],
      [ES_FIELD_TYPES.DATE, RuntimeFieldTypeEnum.date],
      [ES_FIELD_TYPES.DATE_NANOS, RuntimeFieldTypeEnum.date],
      [ES_FIELD_TYPES.BOOLEAN, RuntimeFieldTypeEnum.boolean],
      [ES_FIELD_TYPES.GEO_POINT, RuntimeFieldTypeEnum.geo_point],
      [ES_FIELD_TYPES.LONG, RuntimeFieldTypeEnum.long],
      [ES_FIELD_TYPES.INTEGER, RuntimeFieldTypeEnum.long],
      [ES_FIELD_TYPES.SHORT, RuntimeFieldTypeEnum.long],
      [ES_FIELD_TYPES.BYTE, RuntimeFieldTypeEnum.long],
      [ES_FIELD_TYPES.DOUBLE, RuntimeFieldTypeEnum.double],
      [ES_FIELD_TYPES.FLOAT, RuntimeFieldTypeEnum.double],
      [ES_FIELD_TYPES.HALF_FLOAT, RuntimeFieldTypeEnum.double],
      [ES_FIELD_TYPES.SCALED_FLOAT, RuntimeFieldTypeEnum.double],
      // unsigned_long spans [0, 2^64-1]; neither `long` (signed 64-bit) nor
      // `double` (loses integer precision above 2^53) preserves the full
      // range. keyword preserves the literal _source string for equality.
      [ES_FIELD_TYPES.UNSIGNED_LONG, RuntimeFieldTypeEnum.keyword],
    ])('maps esType "%s" to runtime type "%s"', (esType, expected) => {
      expect(mapDataViewFieldToRuntimeType(getField({ esTypes: [esType] }))).toBe(expected);
    });

    // When esTypes has multiple values (cross-index conflict) we ignore them
    // and fall through to the Kibana `type` mapping.
    it('falls through to Kibana type when esTypes has multiple entries (conflict)', () => {
      expect(
        mapDataViewFieldToRuntimeType(
          getField({
            esTypes: [ES_FIELD_TYPES.KEYWORD, ES_FIELD_TYPES.LONG],
            type: KBN_FIELD_TYPES.IP,
          })
        )
      ).toBe(RuntimeFieldTypeEnum.ip);
    });

    // Some fields surface with only the broad Kibana `type` populated.
    it.each([
      [KBN_FIELD_TYPES.IP, RuntimeFieldTypeEnum.ip],
      [KBN_FIELD_TYPES.DATE, RuntimeFieldTypeEnum.date],
      [KBN_FIELD_TYPES.BOOLEAN, RuntimeFieldTypeEnum.boolean],
      [KBN_FIELD_TYPES.GEO_POINT, RuntimeFieldTypeEnum.geo_point],
      [KBN_FIELD_TYPES.NUMBER, RuntimeFieldTypeEnum.double],
    ])('falls back to Kibana type "%s" → runtime type "%s"', (kibanaType, expected) => {
      expect(mapDataViewFieldToRuntimeType(getField({ type: kibanaType }))).toBe(expected);
    });

    it('defaults to `keyword` for unknown types', () => {
      expect(mapDataViewFieldToRuntimeType(getField({ type: KBN_FIELD_TYPES.STRING }))).toBe(
        RuntimeFieldTypeEnum.keyword
      );
      expect(mapDataViewFieldToRuntimeType(getField({ type: 'some-future-type' }))).toBe(
        RuntimeFieldTypeEnum.keyword
      );
    });
  });

  describe('#collectRuntimeFieldTypes', () => {
    const getAlertsDataView = (names: string[]): DataViewBase =>
      ({ title: 'alerts', fields: names.map((name) => ({ name })) } as DataViewBase);

    const getSourceDataView = (
      fields: Array<Partial<DataViewFieldBase> & { name: string }>
    ): DataViewBase =>
      ({
        title: 'source',
        fields: fields.map((f) => ({ type: 'string', ...f })) as DataViewFieldBase[],
      } as DataViewBase);

    const getExceptionItem = (entries: EntriesArray): ExceptionListItemSchema => ({
      ...getExceptionListItemSchemaMock(),
      entries,
    });

    it('returns an empty map for empty exception items', () => {
      expect(collectRuntimeFieldTypes([], getSourceDataView([]), getAlertsDataView([]))).toEqual({
        runtimeFields: {},
        hasUntypedFields: false,
      });
    });

    it('skips ECS fields (those present on the alerts index)', () => {
      const items = [
        getExceptionItem([
          { field: 'host.name', operator: 'included', type: 'match', value: 'h' },
        ] as EntriesArray),
      ];
      expect(
        collectRuntimeFieldTypes(
          items,
          getSourceDataView([{ name: 'host.name', esTypes: [ES_FIELD_TYPES.KEYWORD] }]),
          getAlertsDataView(['host.name'])
        )
      ).toEqual({ runtimeFields: {}, hasUntypedFields: false });
    });

    it('includes non-ECS fields with the type resolved from the source data view', () => {
      const items = [
        getExceptionItem([
          { field: 'source.ip_ecs', operator: 'included', type: 'match', value: '1.2.3.4' },
        ] as EntriesArray),
      ];
      const result = collectRuntimeFieldTypes(
        items,
        getSourceDataView([{ name: 'source.ip_ecs', esTypes: [ES_FIELD_TYPES.IP] }]),
        getAlertsDataView(['host.name'])
      );
      expect(result.runtimeFields).toEqual({ 'source.ip_ecs': RuntimeFieldTypeEnum.ip });
      expect(result.hasUntypedFields).toBe(false);
    });

    it('falls back to `keyword` and sets hasUntypedFields when the field is missing from the source data view', () => {
      const items = [
        getExceptionItem([
          { field: 'orphan.field', operator: 'included', type: 'match', value: 'x' },
        ] as EntriesArray),
      ];
      const result = collectRuntimeFieldTypes(items, getSourceDataView([]), getAlertsDataView([]));
      expect(result.runtimeFields).toEqual({ 'orphan.field': RuntimeFieldTypeEnum.keyword });
      expect(result.hasUntypedFields).toBe(true);
    });

    it('walks into nested-type entries', () => {
      const items = [
        getExceptionItem([
          {
            field: 'parent',
            type: 'nested',
            entries: [{ field: 'parent.runtime', operator: 'included', type: 'match', value: 'v' }],
          },
        ] as EntriesArray),
      ];
      const result = collectRuntimeFieldTypes(
        items,
        getSourceDataView([{ name: 'parent.runtime', esTypes: [ES_FIELD_TYPES.LONG] }]),
        getAlertsDataView([])
      );
      expect(result.runtimeFields).toEqual({ 'parent.runtime': RuntimeFieldTypeEnum.long });
    });

    it('handles repeated field names across exception entries', () => {
      const items = [
        getExceptionItem([
          { field: 'source.ip_ecs', operator: 'included', type: 'match', value: '1.2.3.4' },
          { field: 'source.ip_ecs', operator: 'included', type: 'match', value: '5.6.7.8' },
        ] as EntriesArray),
      ];
      const result = collectRuntimeFieldTypes(
        items,
        getSourceDataView([{ name: 'source.ip_ecs', esTypes: [ES_FIELD_TYPES.IP] }]),
        getAlertsDataView([])
      );
      expect(result.runtimeFields).toEqual({ 'source.ip_ecs': RuntimeFieldTypeEnum.ip });
    });

    it('handles a mix of ECS, typed runtime, and untyped runtime fields', () => {
      const items = [
        getExceptionItem([
          { field: 'host.name', operator: 'included', type: 'match', value: 'h' },
          { field: 'source.ip_ecs', operator: 'included', type: 'match', value: '1.2.3.4' },
          { field: 'orphan.field', operator: 'included', type: 'match', value: 'x' },
        ] as EntriesArray),
      ];
      const result = collectRuntimeFieldTypes(
        items,
        getSourceDataView([
          { name: 'host.name', esTypes: [ES_FIELD_TYPES.KEYWORD] },
          { name: 'source.ip_ecs', esTypes: [ES_FIELD_TYPES.IP] },
        ]),
        getAlertsDataView(['host.name'])
      );
      expect(result.runtimeFields).toEqual({
        'source.ip_ecs': RuntimeFieldTypeEnum.ip,
        'orphan.field': RuntimeFieldTypeEnum.keyword,
      });
      expect(result.hasUntypedFields).toBe(true);
    });
  });
});
