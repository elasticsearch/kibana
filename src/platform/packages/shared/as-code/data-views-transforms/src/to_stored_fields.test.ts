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
  toStoredRuntimeFields,
  toStoredFieldFormats,
  toStoredFieldAttributes,
} from './to_stored_fields';

describe('toStoredRuntimeFields', () => {
  describe('default / empty input', () => {
    it('returns an empty object when called with no arguments', () => {
      expect(toStoredRuntimeFields()).toEqual({});
    });

    it('returns an empty object when field_settings is empty', () => {
      expect(toStoredRuntimeFields({})).toEqual({});
    });
  });

  describe('primitive fields', () => {
    it('uses the map key as the runtime field name', () => {
      const result = toStoredRuntimeFields({
        my_field: { type: 'keyword' },
      });
      expect(result).toHaveProperty('my_field');
    });

    it('maps type to the stored field type', () => {
      const result = toStoredRuntimeFields({
        my_field: { type: 'long' },
      });
      expect(result!.my_field.type).toBe('long');
    });

    it('sets script.source when script is present', () => {
      const result = toStoredRuntimeFields({
        my_field: { type: 'keyword', script: 'emit("hello")' },
      });
      expect(result!.my_field.script).toEqual({ source: 'emit("hello")' });
    });

    it('omits script entirely when script is absent', () => {
      const result = toStoredRuntimeFields({
        my_field: { type: 'keyword' },
      });
      expect(result!.my_field).not.toHaveProperty('script');
    });

    it('does not include a fields key on primitive fields', () => {
      const result = toStoredRuntimeFields({
        my_field: { type: 'keyword' },
      });
      expect(result!.my_field).not.toHaveProperty('fields');
    });

    it('ignores indexed-only field_settings entries', () => {
      const result = toStoredRuntimeFields({
        indexed: { custom_label: 'Label', format: { type: 'bytes' } },
      });
      expect(result).toEqual({});
    });
  });

  describe('composite fields', () => {
    it('maps type to RUNTIME_FIELD_COMPOSITE_TYPE in the stored field', () => {
      const result = toStoredRuntimeFields({
        my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      });
      expect(result!.my_composite.type).toBe(RUNTIME_FIELD_COMPOSITE_TYPE);
    });

    it('builds fields as a record keyed by subfield name, each with { type }', () => {
      const result = toStoredRuntimeFields({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub_a: { type: 'keyword' },
            sub_b: { type: 'long' },
          },
        },
      });
      expect(result!.my_composite.fields).toEqual({
        sub_a: { type: 'keyword' },
        sub_b: { type: 'long' },
      });
    });

    it('sets script.source when script is present on composite', () => {
      const result = toStoredRuntimeFields({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {},
          script: 'emit("a", "b")',
        },
      });
      expect(result!.my_composite.script).toEqual({ source: 'emit("a", "b")' });
    });

    it('omits script entirely when absent on composite', () => {
      const result = toStoredRuntimeFields({
        my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      });
      expect(result!.my_composite).not.toHaveProperty('script');
    });

    it('produces fields: {} when fields record is empty', () => {
      const result = toStoredRuntimeFields({
        my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      });
      expect(result!.my_composite.fields).toEqual({});
    });
  });

  describe('multiple fields', () => {
    it('returns one key per runtime field entry', () => {
      const result = toStoredRuntimeFields({
        field_a: { type: 'keyword' },
        field_b: { type: 'long' },
        field_c: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      });
      expect(Object.keys(result!)).toEqual(['field_a', 'field_b', 'field_c']);
    });

    it('maps each field independently', () => {
      const result = toStoredRuntimeFields({
        field_a: { type: 'keyword', script: 'emit("a")' },
        field_b: { type: 'long' },
      });
      expect(result!.field_a.script).toEqual({ source: 'emit("a")' });
      expect(result!.field_b).not.toHaveProperty('script');
    });
  });
});

describe('toStoredFieldFormats', () => {
  describe('default / empty input', () => {
    it('returns an empty object when called with no arguments', () => {
      expect(toStoredFieldFormats()).toEqual({});
    });

    it('returns an empty object when field_settings is empty', () => {
      expect(toStoredFieldFormats({})).toEqual({});
    });
  });

  describe('primitive fields', () => {
    it('adds an entry keyed by name when format is present', () => {
      const result = toStoredFieldFormats({
        my_field: { type: 'date', format: { type: 'date' } },
      });
      expect(result).toHaveProperty('my_field');
    });

    it('maps format.type to id and format.params to params', () => {
      const result = toStoredFieldFormats({
        my_field: { type: 'date', format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } } },
      });
      expect(result!.my_field).toEqual({ id: 'date', params: { pattern: 'MM/DD/YYYY' } });
    });

    it('skips fields with no format', () => {
      const result = toStoredFieldFormats({
        my_field: { type: 'keyword' },
      });
      expect(result).not.toHaveProperty('my_field');
    });

    it('only includes fields that have a format when multiple fields are present', () => {
      const result = toStoredFieldFormats({
        no_format: { type: 'keyword' },
        with_format: { type: 'date', format: { type: 'date' } },
      });
      expect(result).not.toHaveProperty('no_format');
      expect(result).toHaveProperty('with_format');
    });
  });

  describe('composite fields', () => {
    it('does not write an entry for the composite parent name', () => {
      const result = toStoredFieldFormats({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword', format: { type: 'string' } } },
        },
      });
      expect(result).not.toHaveProperty('my_composite');
    });

    it('writes an entry keyed as "parentName.subFieldName" for subfields with a format', () => {
      const result = toStoredFieldFormats({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            sub: { type: 'date', format: { type: 'date', params: { pattern: 'MM/DD/YYYY' } } },
          },
        },
      });
      expect(result!['my_composite.sub']).toEqual({
        id: 'date',
        params: { pattern: 'MM/DD/YYYY' },
      });
    });

    it('skips subfields with no format', () => {
      const result = toStoredFieldFormats({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword' } },
        },
      });
      expect(result).not.toHaveProperty('my_composite.sub');
    });

    it('only writes entries for subfields that have a format when multiple subfields are present', () => {
      const result = toStoredFieldFormats({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            no_format: { type: 'keyword' },
            with_format: { type: 'date', format: { type: 'date' } },
          },
        },
      });
      expect(result).not.toHaveProperty('my_composite.no_format');
      expect(result!['my_composite.with_format']).toBeDefined();
    });
  });

  describe('all fields skipped', () => {
    it('returns {} (not undefined) when fields are present but none have a format', () => {
      const result = toStoredFieldFormats({
        field_a: { type: 'keyword' },
        field_b: { type: 'long' },
      });
      expect(result).toEqual({});
    });
  });
});

describe('toStoredFieldAttributes', () => {
  describe('default / empty input', () => {
    it('returns an empty when called with no arguments', () => {
      expect(toStoredFieldAttributes()).toEqual({});
    });

    it('returns an empty when field_settings is empty', () => {
      expect(toStoredFieldAttributes({})).toEqual({});
    });
  });

  describe('primitive fields', () => {
    it('omits the entry when all optional attrs are absent', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword' },
      });
      expect(result).toEqual({});
    });

    it('sets customLabel when custom_label is present', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', custom_label: 'My Label' },
      });
      expect(result!.my_field.customLabel).toBe('My Label');
    });

    it('omits customLabel entirely when custom_label is absent', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', custom_description: 'A description' },
      });
      expect(result!.my_field).not.toHaveProperty('customLabel');
    });

    it('sets customDescription when custom_description is present', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', custom_description: 'A description' },
      });
      expect(result!.my_field.customDescription).toBe('A description');
    });

    it('omits customDescription entirely when custom_description is absent', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', custom_label: 'My Label' },
      });
      expect(result!.my_field).not.toHaveProperty('customDescription');
    });

    it('maps popularity to count when popularity is present', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', popularity: 42 },
      });
      expect(result!.my_field).toEqual({ count: 42 });
    });

    it('omits count when popularity is absent', () => {
      const result = toStoredFieldAttributes({
        my_field: { type: 'keyword', custom_label: 'My Label' },
      });
      expect(result!.my_field).not.toHaveProperty('count');
    });
  });

  describe('composite fields', () => {
    it('omits the entry for a subfield with no attrs', () => {
      const result = toStoredFieldAttributes({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword' } },
        },
      });
      expect(result).toEqual({});
    });

    it('writes entry for subfields with at least one attr set, keyed as "parentName.subFieldName"', () => {
      const result = toStoredFieldAttributes({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword', custom_label: 'Sub Label' } },
        },
      });
      expect(result!['my_composite.sub']).toEqual({ customLabel: 'Sub Label' });
    });

    it('omits customLabel and customDescription when absent on subfield', () => {
      const result = toStoredFieldAttributes({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword', custom_description: 'desc' } },
        },
      });
      expect(result!['my_composite.sub']).not.toHaveProperty('customLabel');
    });

    it('does not write an entry for the composite parent name itself', () => {
      const result = toStoredFieldAttributes({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword', custom_label: 'Sub Label' } },
        },
      });
      expect(result).not.toHaveProperty('my_composite');
    });

    it('maps subfield popularity to count', () => {
      const result = toStoredFieldAttributes({
        my_composite: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'keyword', popularity: 7 } },
        },
      });
      expect(result!['my_composite.sub']).toEqual({ count: 7 });
    });
  });

  describe('indexed fields', () => {
    it('maps popularity-only indexed settings to count', () => {
      const result = toStoredFieldAttributes({
        indexed: { popularity: 3 },
      });
      expect(result).toEqual({ indexed: { count: 3 } });
    });
  });

  describe('multiple fields', () => {
    it('processes primitive and composite fields in the same pass', () => {
      const result = toStoredFieldAttributes({
        prim: { type: 'keyword', custom_label: 'Prim' },
        comp: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: { sub: { type: 'long', custom_label: 'Sub' } },
        },
      });
      expect(result).toHaveProperty('prim');
      expect(result!['comp.sub']).toEqual({ customLabel: 'Sub' });
    });
  });
});
