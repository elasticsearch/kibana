/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { RUNTIME_FIELD_COMPOSITE_TYPE } from '@kbn/as-code-data-views-schema';
import {
  AS_CODE_DATA_VIEW_SPEC_TYPE,
  type AsCodeDataViewSpec,
  type AsCodeSavedDataView,
} from '@kbn/as-code-data-views-schema';
import { fromStoredFields } from './from_stored_fields';
import { toStoredDataView } from './to_stored_data_view';

const toStoredFromAsCodeFields = (
  fieldSettings: AsCodeDataViewSpec['field_settings'] = undefined
) => {
  const stored = toStoredDataView({
    type: AS_CODE_DATA_VIEW_SPEC_TYPE,
    index_pattern: 'logs-*',
    ...(fieldSettings !== undefined && { field_settings: fieldSettings }),
  });

  if (typeof stored === 'string') {
    throw new Error('Expected inline data view spec');
  }

  return {
    runtimeFieldMap: stored.runtimeFieldMap ?? {},
    fieldFormats: stored.fieldFormats ?? {},
    fieldAttrs: stored.fieldAttrs ?? {},
  };
};

const toStoredFromSavedAsCodeFields = (
  fieldSettings: AsCodeSavedDataView['field_settings'] = undefined
) => {
  const stored = toStoredDataView({
    id: 'saved-id',
    name: 'Saved data view',
    index_pattern: 'logs-*',
    allow_hidden_indices: true,
    ...(fieldSettings !== undefined && { field_settings: fieldSettings }),
  });

  if (typeof stored === 'string') {
    throw new Error('Expected inline saved data view spec');
  }

  return {
    runtimeFieldMap: stored.runtimeFieldMap ?? {},
    fieldFormats: stored.fieldFormats ?? {},
    fieldAttrs: stored.fieldAttrs ?? {},
  };
};

describe('roundtrip: AsCode → stored → AsCode', () => {
  describe('primitive fields', () => {
    it('preserves a minimal field (type only)', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_field: { type: 'keyword' },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves a field with a script', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_field: { type: 'keyword', script: 'emit("hello")' },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves a field with a format', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_field: { type: 'date', format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } } },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves a field with custom_label and custom_description', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_field: {
          type: 'keyword',
          custom_label: 'My Label',
          custom_description: 'A description',
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves a field with all optional attrs set', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_field: {
          type: 'date',
          script: 'emit(doc["ts"].value)',
          format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } },
          custom_label: 'Timestamp',
          custom_description: 'Event timestamp',
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });
  });

  describe('composite fields', () => {
    it('preserves a minimal composite field with no subfields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves subfield types keyed under fields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            first: { type: 'keyword' },
            last: { type: 'keyword' },
          },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves script on the composite parent', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: 'emit("a", "b")',
          fields: { part: { type: 'keyword' } },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves custom_label and custom_description on subfields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub: {
              type: 'keyword',
              custom_label: 'Sub Label',
              custom_description: 'Sub description',
            },
          },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves format on subfields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub: { type: 'date', format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } } },
          },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves all attrs on a fully-populated composite field', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        event: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: 'emit("x", "y")',
          fields: {
            timestamp: {
              type: 'date',
              format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } },
              custom_label: 'Event Time',
              custom_description: 'When the event occurred',
            },
            category: {
              type: 'keyword',
              custom_label: 'Category',
              custom_description: 'Event category',
            },
          },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });
  });

  describe('multiple mixed fields', () => {
    it('preserves all fields across primitives and composites', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        prim_a: { type: 'keyword', custom_label: 'Prim A' },
        prim_b: { type: 'long', script: 'emit(42)' },
        comp: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub_x: { type: 'keyword', custom_label: 'X' },
            sub_y: { type: 'date' },
          },
        },
      };
      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });
  });

  describe('field settings', () => {
    it('preserves indexed field settings without runtime fields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        mapped: {
          custom_label: 'Mapped label',
          custom_description: 'Mapped description',
          format: { type: 'bytes', params: { pattern: '0,0.[000]b' } },
        },
      };

      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });

    it('preserves indexed field settings alongside inline runtime fields', () => {
      const fieldSettings: NonNullable<AsCodeDataViewSpec['field_settings']> = {
        rt: { type: 'keyword', custom_label: 'Runtime' },
        mapped: {
          custom_label: 'Mapped label',
          format: { type: 'bytes', params: { pattern: '0,0.[000]b' } },
        },
      };

      const { runtimeFieldMap, fieldFormats, fieldAttrs } = toStoredFromAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs)).toEqual(fieldSettings);
    });
  });

  describe('saved field settings', () => {
    it('preserves popularity for indexed, runtime, and composite subfields', () => {
      const fieldSettings: NonNullable<AsCodeSavedDataView['field_settings']> = {
        mapped: {
          popularity: 10,
          custom_label: 'Mapped label',
          format: { type: 'bytes', params: { pattern: '0,0.[000]b' } },
        },
        rt: {
          type: 'keyword',
          popularity: 5,
          custom_description: 'Runtime field',
        },
        parent: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            child: {
              type: 'keyword',
              popularity: 3,
              custom_label: 'Composite child',
            },
          },
        },
      };

      const { runtimeFieldMap, fieldFormats, fieldAttrs } =
        toStoredFromSavedAsCodeFields(fieldSettings);
      expect(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs, true)).toEqual(
        fieldSettings
      );
    });
  });
});

describe('roundtrip: stored → AsCode → stored', () => {
  describe('primitive fields', () => {
    it('preserves runtimeFieldMap for a basic field', () => {
      const runtimeFieldMap = { my_field: { type: 'keyword' as const } };
      const { runtimeFieldMap: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, {})
      );
      expect(result).toEqual(runtimeFieldMap);
    });

    it('preserves runtimeFieldMap for a field with a script', () => {
      const runtimeFieldMap = {
        my_field: { type: 'keyword' as const, script: { source: 'emit("x")' } },
      };
      const { runtimeFieldMap: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, {})
      );
      expect(result).toEqual(runtimeFieldMap);
    });

    it('preserves fieldFormats for a field with a format', () => {
      const runtimeFieldMap = { my_field: { type: 'date' as const } };
      const fieldFormats = { my_field: { id: 'date', params: { pattern: 'MM/DD/YYYY' } } };
      const { fieldFormats: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, fieldFormats, {})
      );
      expect(result).toEqual(fieldFormats);
    });

    it('preserves fieldAttrs for a field with custom_label and custom_description', () => {
      const runtimeFieldMap = { my_field: { type: 'keyword' as const } };
      const fieldAttrs = {
        my_field: { customLabel: 'My Field', customDescription: 'A description' },
      };
      const { fieldAttrs: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, fieldAttrs)
      );
      expect(result).toEqual(fieldAttrs);
    });

    it('preserves all stored structures for a fully-populated field', () => {
      const runtimeFieldMap = {
        my_field: { type: 'date' as const, script: { source: 'emit(doc["ts"].value)' } },
      };
      const fieldFormats = { my_field: { id: 'date', params: { pattern: 'MM/DD/YYYY' } } };
      const fieldAttrs = {
        my_field: { customLabel: 'Timestamp', customDescription: 'When it happened' },
      };

      const {
        runtimeFieldMap: rm,
        fieldFormats: ff,
        fieldAttrs: fa,
      } = toStoredFromAsCodeFields(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs));

      expect(rm).toEqual(runtimeFieldMap);
      expect(ff).toEqual(fieldFormats);
      expect(fa).toEqual(fieldAttrs);
    });
  });

  describe('composite fields', () => {
    it('preserves runtimeFieldMap for a composite field with subfields', () => {
      const runtimeFieldMap = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub_a: { type: 'keyword' as const },
            sub_b: { type: 'long' as const },
          },
        },
      };
      const { runtimeFieldMap: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, {})
      );
      expect(result).toEqual(runtimeFieldMap);
    });

    it('preserves runtimeFieldMap for a composite field with a script', () => {
      const runtimeFieldMap = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: { source: 'emit("a", "b")' },
          fields: { sub: { type: 'keyword' as const } },
        },
      };
      const { runtimeFieldMap: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, {})
      );
      expect(result).toEqual(runtimeFieldMap);
    });

    it('preserves fieldFormats for composite subfields', () => {
      const runtimeFieldMap = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'date' as const } },
        },
      };
      const fieldFormats = {
        'my_composite.sub': { id: 'date', params: { pattern: 'MM/DD/YYYY' } },
      };
      const { fieldFormats: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, fieldFormats, {})
      );
      expect(result).toEqual(fieldFormats);
    });

    it('preserves fieldAttrs for composite subfields', () => {
      const runtimeFieldMap = {
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub_a: { type: 'keyword' as const },
            sub_b: { type: 'keyword' as const },
          },
        },
      };
      const fieldAttrs = {
        'my_composite.sub_a': { customLabel: 'Sub A' },
        'my_composite.sub_b': { customLabel: 'Sub B', customDescription: 'Second subfield' },
      };
      const { fieldAttrs: result } = toStoredFromAsCodeFields(
        fromStoredFields(runtimeFieldMap, {}, fieldAttrs)
      );
      expect(result).toEqual(fieldAttrs);
    });

    it('preserves all stored structures for a fully-populated composite field', () => {
      const runtimeFieldMap = {
        event: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          script: { source: 'emit("a", "b")' },
          fields: {
            timestamp: { type: 'date' as const },
            category: { type: 'keyword' as const },
          },
        },
      };
      const fieldFormats = {
        'event.timestamp': { id: 'date', params: { pattern: 'MM/DD/YYYY' } },
      };
      const fieldAttrs = {
        'event.timestamp': { customLabel: 'Event Time' },
        'event.category': { customLabel: 'Category', customDescription: 'Event category' },
      };

      const {
        runtimeFieldMap: rm,
        fieldFormats: ff,
        fieldAttrs: fa,
      } = toStoredFromAsCodeFields(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs));

      expect(rm).toEqual(runtimeFieldMap);
      expect(ff).toEqual(fieldFormats);
      expect(fa).toEqual(fieldAttrs);
    });
  });

  describe('multiple mixed fields', () => {
    it('preserves all stored structures across a set of primitives and composites', () => {
      const runtimeFieldMap = {
        prim: { type: 'long' as const, script: { source: 'emit(42)' } },
        comp: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub_x: { type: 'keyword' as const },
            sub_y: { type: 'date' as const },
          },
        },
      };
      const fieldFormats = {
        prim: { id: 'number', params: { pattern: '0,0.[000]b' } },
        'comp.sub_y': { id: 'date', params: { pattern: 'MM/DD/YYYY' } },
      };
      const fieldAttrs = {
        prim: { customLabel: 'Prim' },
        'comp.sub_x': { customLabel: 'X' },
        'comp.sub_y': { customDescription: 'Y description' },
      };

      const {
        runtimeFieldMap: rm,
        fieldFormats: ff,
        fieldAttrs: fa,
      } = toStoredFromAsCodeFields(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs));

      expect(rm).toEqual(runtimeFieldMap);
      expect(ff).toEqual(fieldFormats);
      expect(fa).toEqual(fieldAttrs);
    });
  });

  describe('indexed field settings', () => {
    it('preserves non-runtime fieldFormats and fieldAttrs through AsCode roundtrip', () => {
      const runtimeFieldMap = { rt: { type: 'keyword' as const } };
      const fieldFormats = { rt: { id: 'string' }, mapped: { id: 'bytes' } };
      const fieldAttrs = {
        rt: { customLabel: 'Runtime' },
        mapped: { customLabel: 'Mapped', customDescription: 'Mapped description' },
      };

      const {
        runtimeFieldMap: rm,
        fieldFormats: ff,
        fieldAttrs: fa,
      } = toStoredFromAsCodeFields(fromStoredFields(runtimeFieldMap, fieldFormats, fieldAttrs));

      expect(rm).toEqual(runtimeFieldMap);
      expect(ff).toEqual(fieldFormats);
      expect(fa).toEqual(fieldAttrs);
    });
  });

  describe('saved field settings', () => {
    it('preserves all stored structures with popularity through saved schema roundtrip', () => {
      const stored = {
        runtimeFieldMap: {
          rt: { type: 'keyword' as const },
          parent: {
            type: RUNTIME_FIELD_COMPOSITE_TYPE,
            fields: {
              child: { type: 'keyword' as const },
            },
          },
        },
        fieldFormats: {
          mapped: { id: 'bytes', params: { pattern: '0,0.[000]b' } },
        },
        fieldAttrs: {
          mapped: { customLabel: 'Mapped', count: 10 },
          rt: { customDescription: 'Runtime field', count: 5 },
          'parent.child': { customLabel: 'Composite child', count: 3 },
        },
      };

      const asCodeSaved: AsCodeSavedDataView = {
        id: 'saved-id',
        name: 'Saved data view',
        index_pattern: 'logs-*',
        allow_hidden_indices: true,
        field_settings: fromStoredFields(
          stored.runtimeFieldMap,
          stored.fieldFormats,
          stored.fieldAttrs,
          true
        ),
      };
      const result = toStoredDataView(asCodeSaved);

      if (typeof result === 'string') {
        throw new Error('Expected inline saved data view spec');
      }

      expect(result.runtimeFieldMap).toEqual(stored.runtimeFieldMap);
      expect(result.fieldFormats).toEqual(stored.fieldFormats);
      expect(result.fieldAttrs).toEqual(stored.fieldAttrs);
    });
  });
});
