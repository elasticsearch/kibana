/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import * as i18n from './translations';

export const FieldType = {
  INPUT_TEXT: 'INPUT_TEXT',
  INPUT_NUMBER: 'INPUT_NUMBER',
  SELECT_BASIC: 'SELECT_BASIC',
  TEXTAREA: 'TEXTAREA',
  DATE_PICKER: 'DATE_PICKER',
  CHECKBOX_GROUP: 'CHECKBOX_GROUP',
  RADIO_GROUP: 'RADIO_GROUP',
  USER_PICKER: 'USER_PICKER',
} as const;

export type FieldType = (typeof FieldType)[keyof typeof FieldType];

export const ConditionRuleSchema = z.object({
  field: z.string(),
  operator: z.enum(['eq', 'neq', 'contains', 'empty', 'not_empty']),
  value: z.union([z.string(), z.number()]).optional(),
});

export const CompoundConditionSchema = z.object({
  combine: z.enum(['all', 'any']).default('all'),
  rules: z.array(ConditionRuleSchema).min(1),
});

export const ConditionSchema = z.union([ConditionRuleSchema, CompoundConditionSchema]);

export const DisplaySchema = z.object({
  show_when: ConditionSchema.optional(),
});

export const ValidationSchema = z.object({
  required: z.boolean().optional(),
  required_when: ConditionSchema.optional(),
  /** When true, the field must be filled in before a case can be moved to closed status. */
  required_on_close: z.boolean().optional(),
  pattern: z
    .object({
      regex: z.string(),
      message: z.string().optional(),
    })
    .optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  min_length: z.number().optional(),
  max_length: z.number().optional(),
});

export type ConditionRule = z.infer<typeof ConditionRuleSchema>;
export type CompoundCondition = z.infer<typeof CompoundConditionSchema>;
export type Condition = z.infer<typeof ConditionSchema>;
export type Display = z.infer<typeof DisplaySchema>;
export type Validation = z.infer<typeof ValidationSchema>;

/**
 * Extra props passed to control components by the field renderer based on evaluated conditions.
 */
export interface ConditionRenderProps {
  isRequired?: boolean;
  patternValidation?: { regex: string; message?: string };
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  /** When provided, the control renders inline confirm/cancel buttons and only calls this on confirm. */
  onConfirm?: () => void;
}

const BaseFieldSchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  type: z.literal('keyword'),
  display: DisplaySchema.optional(),
  validation: ValidationSchema.optional(),
  metadata: z
    .object({
      default: z.union([z.string(), z.number(), z.array(z.string())]).optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const InputTextFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.INPUT_TEXT),
});

export const InputNumberFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.INPUT_NUMBER),
  type: z.union([
    z.literal('long'),
    z.literal('integer'),
    z.literal('short'),
    z.literal('byte'),
    z.literal('double'),
    z.literal('float'),
    z.literal('half_float'),
    z.literal('scaled_float'),
    z.literal('unsigned_long'),
  ]),
  metadata: z
    .object({
      default: z.number().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const SelectBasicFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.SELECT_BASIC),
  metadata: z
    .object({
      options: z.array(z.string()),
    })
    .catchall(z.unknown()),
});

export const TextareaFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.TEXTAREA),
  metadata: z
    .object({
      default: z.string().optional(),
      markdown: z.boolean().optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const DatePickerFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.DATE_PICKER),
  type: z.literal('date'),
  metadata: z
    .object({
      show_time: z.boolean().optional(),
      timezone: z.enum(['utc', 'local']).optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

export const UserPickerDefaultSchema = z.array(z.object({ uid: z.string(), name: z.string() }));

export const UserPickerFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.USER_PICKER),
  metadata: z
    .object({
      multiple: z.boolean().optional(),
      default: UserPickerDefaultSchema.optional(),
    })
    .catchall(z.unknown())
    .optional(),
});

const uniqueStrings = (arr: string[]) => new Set(arr).size === arr.length;

export const CheckboxGroupFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.CHECKBOX_GROUP),
  metadata: z
    .object({
      options: z
        .array(z.string())
        .max(30, { message: i18n.FIELD_OPTIONS_MAX_ITEMS(30) })
        .refine(uniqueStrings, { message: i18n.FIELD_OPTIONS_MUST_BE_UNIQUE }),
      default: z
        .array(z.string())
        .refine(uniqueStrings, { message: i18n.FIELD_DEFAULT_VALUES_MUST_BE_UNIQUE })
        .optional(),
    })
    .catchall(z.unknown())
    .superRefine((meta, ctx) => {
      if (meta.default === undefined) return;
      const invalidValues = (meta.default as string[]).filter(
        (v) => v !== '' && !(meta.options as string[]).includes(v)
      );
      if (invalidValues.length > 0) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.FIELD_DEFAULT_VALUES_NOT_IN_OPTIONS(invalidValues),
        });
      }
    }),
});

export const RadioGroupFieldSchema = BaseFieldSchema.extend({
  control: z.literal(FieldType.RADIO_GROUP),
  metadata: z
    .object({
      options: z
        .array(z.string())
        .min(2, { message: i18n.FIELD_OPTIONS_MIN_ITEMS(2) })
        .max(20, { message: i18n.FIELD_OPTIONS_MAX_ITEMS(20) })
        .refine(uniqueStrings, { message: i18n.FIELD_OPTIONS_MUST_BE_UNIQUE }),
      default: z.string().optional(),
    })
    .catchall(z.unknown())
    .superRefine((meta, ctx) => {
      if (
        meta.default !== undefined &&
        meta.default !== '' &&
        !(meta.options as string[]).includes(meta.default as string)
      ) {
        ctx.addIssue({
          code: 'custom',
          message: i18n.FIELD_DEFAULT_NOT_IN_OPTIONS(meta.default as string),
        });
      }
    }),
});

/**
 * A reference to a named field definition in the owner's field library.
 * When a template is parsed, the referenced field is resolved by looking up the library
 * field by its `$ref` name. `name` is an optional local alias; if omitted the `$ref` value
 * is used as the effective field name within the template.
 *
 * `metadata.default` is an optional per-template override for the resolved field's default
 * value. It must satisfy the resolved field's control type — this is enforced when the
 * override is merged onto the inline field at resolve time.
 */
export const RefFieldSchema = z.object({
  name: z.string().optional(),
  $ref: z.string().min(1),
  metadata: z
    .object({
      default: z
        .union([z.string(), z.number(), z.array(z.string()), UserPickerDefaultSchema])
        .optional(),
    })
    .optional(),
});

export type RefField = z.infer<typeof RefFieldSchema>;

/**
 * This can be used to parse `fields` section in the YAML `definition` of the template.
 * Includes both inline field definitions (with `control`) and library references (with `ref`).
 */
export const FieldSchema = z.union([
  InputTextFieldSchema,
  InputNumberFieldSchema,
  SelectBasicFieldSchema,
  TextareaFieldSchema,
  DatePickerFieldSchema,
  UserPickerFieldSchema,
  CheckboxGroupFieldSchema,
  RadioGroupFieldSchema,
  RefFieldSchema,
]);

export type Field = z.infer<typeof FieldSchema>;

/** Union of all inline (control-based) field types — excludes RefField. */
export type InlineField = Exclude<Field, RefField>;

export const isRefField = (field: Field): field is RefField =>
  '$ref' in field && !('control' in field);

export const isInlineField = (field: Field): field is InlineField => !isRefField(field);
