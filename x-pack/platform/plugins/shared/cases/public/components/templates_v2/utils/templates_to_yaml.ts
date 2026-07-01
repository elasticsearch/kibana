/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { stringify as yamlStringify } from 'yaml';
import type { z } from '@kbn/zod/v4';
import {
  FieldType,
  isRefField,
  type FieldSchema,
  type RefField,
} from '../../../../common/types/domain/template/fields';
import type { ParsedTemplate } from '../../../../common/types/domain/template/v1';

type Field = z.infer<typeof FieldSchema>;
type InlineField = Exclude<Field, RefField>;

const yamlString = (value: string | number | undefined | null) => {
  if (value == null) {
    return '""';
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(value);
};

const serializeTemplateHeader = (out: string[], template: ParsedTemplate) => {
  out.push(`templateId: ${yamlString(template.templateId)}`);
  out.push(`name: ${yamlString(template.name)}`);
  out.push(`owner: ${yamlString(template.owner)}`);

  if (template.author) {
    out.push(`author: ${yamlString(template.author)}`);
  }

  out.push(`description: ${yamlString(template.description ?? '')}`);
  out.push(`templateVersion: ${template.templateVersion}`);
  out.push(`latestVersion: ${template.latestVersion}`);
  out.push(`isLatest: ${template.isLatest}`);
  out.push(`deletedAt: ${template.deletedAt == null ? 'null' : yamlString(template.deletedAt)}`);
  out.push(`fieldCount: ${template.fieldCount ?? 0}`);
  out.push(`usageCount: ${template.usageCount ?? 0}`);
  out.push(`lastUsedAt: ${template.lastUsedAt ? yamlString(template.lastUsedAt) : '""'}`);
  out.push(`isDefault: ${template.isDefault ?? false}`);

  if (template.isEnabled !== undefined) {
    out.push(`isEnabled: ${template.isEnabled}`);
  }

  // severity and category live inside the parsed definition
  if (template.definition.severity) {
    out.push(`severity: ${template.definition.severity}`);
  }
  if (template.definition.category != null) {
    out.push(`category: ${yamlString(template.definition.category)}`);
  }

  // connector and settings also live inside the parsed definition. Emit them via the YAML library
  // (nested structured values) so per-type connector fields round-trip losslessly on re-import.
  if (template.definition.connector) {
    serializeNestedBlock(out, 'connector', template.definition.connector);
  }
  if (template.definition.settings) {
    serializeNestedBlock(out, 'settings', template.definition.settings);
  }

  out.push('tags:');
  for (const tag of template.tags ?? []) {
    out.push(`  - ${yamlString(tag)}`);
  }
};

/**
 * Serializes a structured value as a top-level YAML block (key + indented body). Used for
 * `connector` and `settings`, whose nested shapes are simplest to render via the YAML library.
 */
const serializeNestedBlock = (out: string[], key: string, value: object) => {
  const rendered = yamlStringify({ [key]: value }, { lineWidth: 0 }).trimEnd();
  for (const line of rendered.split('\n')) {
    out.push(line);
  }
};

const serializeSelectMetadata = (
  out: string[],
  field: Extract<Field, { control: 'SELECT_BASIC' }>
) => {
  out.push(`      metadata:`);
  out.push(`        options:`);
  for (const option of field.metadata.options) {
    out.push(`          - ${yamlString(option)}`);
  }
  const defaultValue = field.metadata?.default;
  if (
    defaultValue !== undefined &&
    (typeof defaultValue === 'string' || typeof defaultValue === 'number')
  ) {
    out.push(`        default: ${yamlString(defaultValue)}`);
  }
};

const serializeDatePickerMetadata = (
  out: string[],
  field: Extract<Field, { control: 'DATE_PICKER' }>
) => {
  const meta = field.metadata;
  if (!meta) return;
  // `default` is in the catchall bucket, typed as unknown
  const defaultValue = meta.default;
  const hasDefault =
    typeof defaultValue === 'string' ||
    typeof defaultValue === 'number' ||
    defaultValue instanceof Date;
  if (!hasDefault && meta.show_time === undefined && meta.timezone === undefined) return;
  out.push(`      metadata:`);
  if (hasDefault) {
    const serialized =
      defaultValue instanceof Date ? defaultValue.toISOString() : (defaultValue as string | number);
    out.push(`        default: ${yamlString(serialized)}`);
  }
  if (meta.show_time !== undefined) {
    out.push(`        show_time: ${meta.show_time}`);
  }
  if (meta.timezone !== undefined) {
    out.push(`        timezone: ${meta.timezone}`);
  }
};

const serializeTextareaMetadata = (
  out: string[],
  field: Extract<Field, { control: 'TEXTAREA' }>
) => {
  const meta = field.metadata;
  if (!meta) return;
  const defaultValue = meta.default;
  const hasDefault = typeof defaultValue === 'string';
  const hasMarkdown = meta.markdown === true;
  if (!hasDefault && !hasMarkdown) return;
  out.push(`      metadata:`);
  if (hasDefault) {
    out.push(`        default: ${yamlString(defaultValue)}`);
  }
  if (hasMarkdown) {
    out.push(`        markdown: true`);
  }
};

const serializeCheckboxGroupMetadata = (
  out: string[],
  field: Extract<Field, { control: 'CHECKBOX_GROUP' }>
) => {
  out.push(`      metadata:`);
  out.push(`        options:`);
  for (const option of field.metadata.options) {
    out.push(`          - ${yamlString(option)}`);
  }
  const defaults = field.metadata.default;
  if (defaults && defaults.length > 0) {
    out.push(`        default:`);
    for (const d of defaults) {
      out.push(`          - ${yamlString(d)}`);
    }
  }
};

const serializeUserPickerMetadata = (
  out: string[],
  field: Extract<Field, { control: 'USER_PICKER' }>
) => {
  const meta = field.metadata;
  if (!meta) return;
  const hasMultiple = meta.multiple !== undefined;
  const defaults = meta.default;
  const hasDefaults = Array.isArray(defaults) && defaults.length > 0;
  if (!hasMultiple && !hasDefaults) return;
  out.push(`      metadata:`);
  if (hasMultiple) {
    out.push(`        multiple: ${meta.multiple}`);
  }
  if (hasDefaults) {
    out.push(`        default:`);
    for (const user of defaults) {
      out.push(`          - uid: ${yamlString(user.uid)}`);
      out.push(`            name: ${yamlString(user.name)}`);
    }
  }
};

const serializeFieldMetadata = (out: string[], field: InlineField) => {
  if (field.control === FieldType.SELECT_BASIC) {
    serializeSelectMetadata(out, field);
    return;
  }
  if (field.control === FieldType.DATE_PICKER) {
    serializeDatePickerMetadata(out, field);
    return;
  }
  if (field.control === FieldType.CHECKBOX_GROUP) {
    serializeCheckboxGroupMetadata(out, field);
    return;
  }
  if (field.control === FieldType.RADIO_GROUP) {
    out.push(`      metadata:`);
    out.push(`        options:`);
    for (const option of field.metadata.options) {
      out.push(`          - ${yamlString(option)}`);
    }
    const defaultValue = field.metadata?.default;
    if (defaultValue !== undefined && typeof defaultValue === 'string') {
      out.push(`        default: ${yamlString(defaultValue)}`);
    }
    return;
  }
  if (field.control === FieldType.USER_PICKER) {
    serializeUserPickerMetadata(out, field);
    return;
  }
  if (field.control === FieldType.TEXTAREA) {
    serializeTextareaMetadata(out, field);
    return;
  }
  // INPUT_TEXT, INPUT_NUMBER
  const defaultValue = field.metadata?.default;
  if (
    defaultValue !== undefined &&
    (typeof defaultValue === 'string' || typeof defaultValue === 'number')
  ) {
    out.push(`      metadata:`);
    out.push(`        default: ${yamlString(defaultValue)}`);
  }
};

const serializeNestedYaml = (out: string[], key: string, value: object) => {
  const rendered = yamlStringify(value, null, { indent: 2 }).trimEnd();
  out.push(`      ${key}:`);
  for (const line of rendered.split('\n')) {
    out.push(`        ${line}`);
  }
};

const serializeDisplay = (out: string[], field: InlineField) => {
  if (!field.display) return;
  serializeNestedYaml(out, 'display', field.display);
};

const serializeValidation = (out: string[], field: InlineField) => {
  if (!field.validation) return;
  const defined = Object.fromEntries(
    Object.entries(field.validation).filter(([, v]) => v !== undefined)
  );
  if (Object.keys(defined).length === 0) return;
  serializeNestedYaml(out, 'validation', defined);
};

const serializeRefDefault = (
  out: string[],
  defaultValue: NonNullable<RefField['metadata']>['default']
) => {
  if (defaultValue === undefined) return;
  out.push(`      metadata:`);
  if (Array.isArray(defaultValue)) {
    out.push(`        default:`);
    for (const item of defaultValue) {
      if (typeof item === 'string') {
        out.push(`          - ${yamlString(item)}`);
      } else {
        out.push(`          - uid: ${yamlString(item.uid)}`);
        out.push(`            name: ${yamlString(item.name)}`);
      }
    }
    return;
  }
  out.push(`        default: ${yamlString(defaultValue)}`);
};

const serializeField = (out: string[], field: Field) => {
  if (isRefField(field)) {
    if (field.name !== undefined) {
      out.push(`    - name: ${yamlString(field.name)}`);
      out.push(`      $ref: ${yamlString(field.$ref)}`);
    } else {
      out.push(`    - $ref: ${yamlString(field.$ref)}`);
    }
    serializeRefDefault(out, field.metadata?.default);
    out.push('');
    return;
  }
  out.push(`    - name: ${yamlString(field.name)}`);
  if (field.label) {
    out.push(`      label: ${yamlString(field.label)}`);
  }
  out.push(`      control: ${yamlString(field.control)}`);
  out.push(`      type: ${yamlString(field.type)}`);
  serializeFieldMetadata(out, field);
  serializeDisplay(out, field);
  serializeValidation(out, field);
  out.push('');
};

const serializeTemplate = (out: string[], template: ParsedTemplate) => {
  serializeTemplateHeader(out, template);
  out.push('definition:');
  out.push('  fields:');
  for (const field of template.definition.fields) {
    serializeField(out, field);
  }
};

/**
 * Converts templates (already parsed on the server) into a YAML string suitable for download.
 *
 * NOTE: This is a best-effort YAML reconstruction. It does not guarantee a lossless round-trip
 * of the original author-provided YAML formatting.
 */
export const templatesToYaml = (templates: ParsedTemplate[]): string => {
  const out: string[] = [
    `# Bulk Export: ${templates.length} templates`,
    `# Exported: ${new Date().toISOString()}`,
    '',
  ];

  for (const template of templates) {
    out.push('---');
    serializeTemplate(out, template);
  }

  return out.join('\n');
};

export const templateToYaml = (template: ParsedTemplate): string => {
  const out: string[] = [
    `# Template: ${template.name}`,
    `# Exported: ${new Date().toISOString()}`,
    '',
  ];
  serializeTemplate(out, template);
  return out.join('\n');
};
