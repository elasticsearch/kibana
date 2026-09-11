/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import { RUNTIME_FIELD_COMPOSITE_TYPE } from '@kbn/as-code-data-views-schema';
import type {
  AsCodeCompositeRuntimeField,
  AsCodeFieldSettings,
  AsCodeRuntimeField,
} from '@kbn/as-code-data-views-schema';
import { fromStoredFields } from './from_stored_fields';
import { isCompositeRuntimeField, isRuntimeField, toStoredFieldFormats } from './to_stored_fields';

function assertPrimitiveRuntimeEntry(
  entry: AsCodeFieldSettings | undefined
): asserts entry is Exclude<AsCodeRuntimeField, AsCodeCompositeRuntimeField> {
  if (!entry || !isRuntimeField(entry) || isCompositeRuntimeField(entry)) {
    throw new Error('expected primitive runtime entry');
  }
}

function assertCompositeRuntimeEntry(
  entry: AsCodeFieldSettings | undefined
): asserts entry is AsCodeCompositeRuntimeField {
  if (!entry || !isCompositeRuntimeField(entry)) {
    throw new Error('expected composite runtime entry');
  }
}

describe('fromStoredFields.field_settings (runtime inline)', () => {
  describe('default arguments', () => {
    it('does not include field_settings when called with no arguments', () => {
      const result = fromStoredFields();
      expect(result).toBeUndefined();
    });

    it('does not include field_settings when runtimeFields is empty', () => {
      const result = fromStoredFields({});
      expect(result).toBeUndefined();
    });
  });

  describe('primitive runtime fields', () => {
    describe('basic mapping', () => {
      it('uses the runtimeFieldMap key as the field_settings entry key', () => {
        const fs = fromStoredFields({
          my_field: { type: 'keyword' },
        });
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.type).toBe('keyword');
      });

      it('maps runtimeField.type to type', () => {
        const fs = fromStoredFields({ my_field: { type: 'long' } });
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.type).toBe('long');
      });

      it('maps runtimeField.script.source to script', () => {
        const fs = fromStoredFields({
          my_field: { type: 'keyword', script: { source: 'emit("hello")' } },
        });
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.script).toBe('emit("hello")');
      });

      it('returns undefined for script when runtimeField.script is absent', () => {
        const fs = fromStoredFields({
          my_field: { type: 'keyword' },
        });
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.script).toBeUndefined();
      });
    });

    describe('format handling', () => {
      it('sets format when fieldFormats entry has an id', () => {
        const fs = fromStoredFields(
          { my_field: { type: 'date' } },
          { my_field: { id: 'date', params: { pattern: 'MM/DD/YYYY' } } }
        );
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.format).toEqual({
          type: 'date',
          params: { pattern: 'MM/DD/YYYY' },
        });
      });

      it('sets format to undefined when fieldFormats entry has no id', () => {
        const fs = fromStoredFields({ my_field: { type: 'keyword' } }, { my_field: {} });
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.format).toBeUndefined();
      });

      it('sets format to undefined when fieldFormats has no entry for the field', () => {
        const fs = fromStoredFields(
          { my_field: { type: 'keyword' } },
          { other_field: { id: 'string' } }
        );
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.format).toBeUndefined();
      });
    });

    describe('field attributes', () => {
      it('maps fieldAttrs customLabel to custom_label', () => {
        const fs = fromStoredFields(
          { my_field: { type: 'keyword' } },
          {},
          {
            my_field: { customLabel: 'My Field' },
          }
        );
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.custom_label).toBe('My Field');
      });

      it('maps fieldAttrs customDescription to custom_description', () => {
        const fs = fromStoredFields(
          { my_field: { type: 'keyword' } },
          {},
          {
            my_field: { customDescription: 'A description' },
          }
        );
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.custom_description).toBe('A description');
      });

      it('returns undefined for all field attrs when no entry exists for the field', () => {
        const fs = fromStoredFields({ my_field: { type: 'keyword' } }, {}, {});
        const myField = fs?.my_field;
        assertPrimitiveRuntimeEntry(myField);
        expect(myField.custom_label).toBeUndefined();
        expect(myField.custom_description).toBeUndefined();
      });
    });
  });

  describe('composite runtime fields', () => {
    describe('basic mapping', () => {
      it('sets type to RUNTIME_FIELD_COMPOSITE_TYPE', () => {
        const fs = fromStoredFields({
          my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.type).toBe(RUNTIME_FIELD_COMPOSITE_TYPE);
      });

      it('maps runtimeField.script.source to script', () => {
        const fs = fromStoredFields({
          my_composite: {
            type: RUNTIME_FIELD_COMPOSITE_TYPE,
            fields: {},
            script: { source: 'emit("a", "b")' },
          },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.script).toBe('emit("a", "b")');
      });

      it('returns undefined for script when absent', () => {
        const fs = fromStoredFields({
          my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.script).toBeUndefined();
      });

      it('returns fields as a record keyed by subfield name', () => {
        const fs = fromStoredFields({
          my_composite: {
            type: RUNTIME_FIELD_COMPOSITE_TYPE,
            fields: { sub_a: { type: 'keyword' }, sub_b: { type: 'long' } },
          },
        });
        const composite = fs?.my_composite;
        assertCompositeRuntimeEntry(composite);
        expect(Object.keys(composite.fields).sort()).toEqual(['sub_a', 'sub_b']);
      });
    });

    describe('subfield key construction', () => {
      it('looks up subfield format using "parentName.subFieldName"', () => {
        const fs = fromStoredFields(
          {
            my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: { sub: { type: 'date' } } },
          },
          { 'my_composite.sub': { id: 'date', params: { pattern: 'MM/DD/YYYY' } } }
        );
        const composite = fs?.my_composite;
        assertCompositeRuntimeEntry(composite);
        expect(composite.fields.sub.format).toEqual({
          type: 'date',
          params: { pattern: 'MM/DD/YYYY' },
        });
      });

      it('looks up subfield attrs using "parentName.subFieldName"', () => {
        const fs = fromStoredFields(
          {
            my_composite: {
              type: RUNTIME_FIELD_COMPOSITE_TYPE,
              fields: { sub: { type: 'keyword' } },
            },
          },
          {},
          { 'my_composite.sub': { customLabel: 'Sub Label', customDescription: 'desc' } }
        );
        const composite = fs?.my_composite;
        assertCompositeRuntimeEntry(composite);
        expect(composite.fields.sub.custom_label).toBe('Sub Label');
        expect(composite.fields.sub.custom_description).toBe('desc');
      });

      it('keys subfields by the short name under fields', () => {
        const fs = fromStoredFields({
          my_composite: {
            type: RUNTIME_FIELD_COMPOSITE_TYPE,
            fields: { sub_field: { type: 'keyword' } },
          },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields.sub_field.type).toBe('keyword');
      });

      it('maps subfield type from runtimeField.fields entry', () => {
        const fs = fromStoredFields({
          my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: { sub: { type: 'ip' } } },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields.sub.type).toBe('ip');
      });
    });

    describe('subfield format handling', () => {
      it('sets subfield format to undefined when no matching entry', () => {
        const fs = fromStoredFields(
          {
            my_composite: {
              type: RUNTIME_FIELD_COMPOSITE_TYPE,
              fields: { sub: { type: 'keyword' } },
            },
          },
          {}
        );
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields.sub.format).toBeUndefined();
      });

      it('sets subfield format to undefined when entry exists but has no id', () => {
        const fs = fromStoredFields(
          {
            my_composite: {
              type: RUNTIME_FIELD_COMPOSITE_TYPE,
              fields: { sub: { type: 'keyword' } },
            },
          },
          { 'my_composite.sub': {} }
        );
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields.sub.format).toBeUndefined();
      });
    });

    describe('subfield field attributes', () => {
      it('returns undefined for all attrs when no matching fieldAttrs entry', () => {
        const fs = fromStoredFields({
          my_composite: {
            type: RUNTIME_FIELD_COMPOSITE_TYPE,
            fields: { sub: { type: 'keyword' } },
          },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields.sub.custom_label).toBeUndefined();
        expect(myComposite.fields.sub.custom_description).toBeUndefined();
      });
    });

    describe('empty subfields', () => {
      it('returns an empty fields object when runtimeField.fields is an empty object', () => {
        const fs = fromStoredFields({
          my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields).toEqual({});
      });

      it('returns an empty fields object when runtimeField.fields is absent', () => {
        const fs = fromStoredFields({
          my_composite: { type: RUNTIME_FIELD_COMPOSITE_TYPE },
        });
        const myComposite = fs?.my_composite;
        assertCompositeRuntimeEntry(myComposite);
        expect(myComposite.fields).toEqual({});
      });
    });
  });

  describe('multiple fields', () => {
    it('returns one field_settings entry per key in runtimeFieldMap', () => {
      const fs = fromStoredFields({
        field_a: { type: 'keyword' },
        field_b: { type: 'long' },
        field_c: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: {} },
      });
      expect(Object.keys(fs ?? {})).toHaveLength(3);
    });

    it('correctly maps each field independently', () => {
      const fs = fromStoredFields(
        {
          field_a: { type: 'keyword', script: { source: 'emit("a")' } },
          field_b: { type: 'long' },
        },
        { field_b: { id: 'number' } }
      );
      const fieldA = fs?.field_a;
      const fieldB = fs?.field_b;
      assertPrimitiveRuntimeEntry(fieldA);
      assertPrimitiveRuntimeEntry(fieldB);
      expect(fieldA.script).toBe('emit("a")');
      expect(fieldA.format).toBeUndefined();
      expect(fieldB.format).toEqual({ type: 'number', params: {} });
    });
  });
});

describe('fromStoredFields.field_settings (indexed)', () => {
  it('emits indexed field settings alongside inline runtime fields', () => {
    const result = fromStoredFields(
      { rt: { type: 'keyword' } },
      { mapped: { id: 'bytes' } },
      { mapped: { customLabel: 'Mapped' } }
    );

    expect(result).toEqual({
      rt: { type: 'keyword' },
      mapped: {
        format: { type: 'bytes', params: {} },
        custom_label: 'Mapped',
      },
    });
  });

  it('merges runtime, composite subfield formats, and indexed field_settings in one map', () => {
    const result = fromStoredFields(
      {
        rt: { type: 'keyword' },
        parent: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: { child: { type: 'keyword' } } },
      },
      { rt: { id: 'string' }, 'parent.child': { id: 'number' }, mapped: { id: 'bytes' } },
      { rt: { customLabel: 'runtime' }, 'parent.child': { customLabel: 'sub' } }
    );

    expect(result).toEqual({
      rt: {
        type: 'keyword',
        format: { type: 'string', params: {} },
        custom_label: 'runtime',
      },
      parent: {
        type: RUNTIME_FIELD_COMPOSITE_TYPE,
        fields: {
          child: {
            type: 'keyword',
            format: { type: 'number', params: {} },
            custom_label: 'sub',
          },
        },
      },
      mapped: {
        format: { type: 'bytes', params: {} },
      },
    });
  });

  it('round-trips url link params with open_link_in_current_tab', () => {
    const asCodeFieldSettings = {
      my_field: {
        format: {
          type: 'url',
          params: {
            type: 'a',
            url_template: 'https://example.com/{{value}}',
            label_template: 'View {{value}}',
            open_link_in_current_tab: true,
          },
        },
      },
    };

    const storedFieldFormats = toStoredFieldFormats(asCodeFieldSettings);
    expect(storedFieldFormats).toEqual({
      my_field: {
        id: 'url',
        params: {
          type: 'a',
          urlTemplate: 'https://example.com/{{value}}',
          labelTemplate: 'View {{value}}',
          openLinkInCurrentTab: true,
        },
      },
    });

    const roundTrippedFieldSettings = fromStoredFields({}, storedFieldFormats);
    expect(roundTrippedFieldSettings).toEqual({
      my_field: {
        format: {
          type: 'url',
          params: {
            type: 'a',
            url_template: 'https://example.com/{{value}}',
            label_template: 'View {{value}}',
            open_link_in_current_tab: true,
          },
        },
      },
    });
  });
});

describe('fromStoredFields.includePopularity', () => {
  describe('when includePopularity is false', () => {
    it('does not emit popularity by default when fieldAttrs has count', () => {
      const result = fromStoredFields({}, {}, { mapped: { count: 7, customLabel: 'Mapped' } });

      expect(result).toEqual({
        mapped: {
          custom_label: 'Mapped',
        },
      });
    });
  });

  describe('when includePopularity is true', () => {
    describe('when count is undefined', () => {
      it('does not emit popularity', () => {
        const result = fromStoredFields(
          {},
          {},
          { mapped: { customLabel: 'Mapped', count: undefined } },
          true
        );
        expect(result).toEqual({
          mapped: {
            custom_label: 'Mapped',
          },
        });
      });
    });

    it('emits popularity', () => {
      const result = fromStoredFields(
        {},
        {},
        { mapped: { count: 7, customLabel: 'Mapped' } },
        true
      );

      expect(result).toEqual({
        mapped: {
          popularity: 7,
          custom_label: 'Mapped',
        },
      });
    });

    it('emits popularity for runtime and composite subfields', () => {
      const result = fromStoredFields(
        {
          rt: { type: 'keyword' },
          parent: { type: RUNTIME_FIELD_COMPOSITE_TYPE, fields: { child: { type: 'keyword' } } },
        },
        {},
        { rt: { count: 2 }, 'parent.child': { count: 3 }, mapped: { count: 4 } },
        true
      );

      expect(result).toEqual({
        rt: {
          type: 'keyword',
          popularity: 2,
        },
        parent: {
          type: RUNTIME_FIELD_COMPOSITE_TYPE,
          fields: {
            child: {
              type: 'keyword',
              popularity: 3,
            },
          },
        },
        mapped: {
          popularity: 4,
        },
      });
    });
  });
});
