/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { JSONSchema7 } from 'json-schema';
import { buildFieldsZodValidator } from '@kbn/workflows/spec/lib/build_fields_zod_validator';
import type { JsonModelSchemaType } from '@kbn/workflows/spec/schema/common/json_model_schema';

type FlatFieldSchema = JSONSchema7 & {
  type?: string;
  enum?: unknown[];
  items?: JSONSchema7;
};

export function isExternalResumeFormTextareaField(field: FlatFieldSchema): boolean {
  if (field.type === 'object') {
    return true;
  }

  if (field.type === 'array') {
    const itemEnum = field.items?.enum;
    return !(Array.isArray(itemEnum) && itemEnum.length > 0);
  }

  if (field.enum && field.enum.length > 0) {
    return false;
  }

  const supportedScalarTypes = new Set(['string', 'number', 'integer', 'boolean']);
  return field.type == null || !supportedScalarTypes.has(field.type);
}

function buildFieldHtml(name: string, field: FlatFieldSchema, required: Set<string>): string {
  const label = escapeHtml(field.title ?? name);
  const description =
    typeof field.description === 'string' && field.description.length > 0
      ? `<p class="field-help">${escapeHtml(field.description)}</p>`
      : '';
  const requiredAttr = required.has(name) ? ' required' : '';
  const requiredMarker = required.has(name) ? ' *' : '';

  if (isExternalResumeFormTextareaField(field)) {
    return `
        <label class="field" for="${escapeHtml(name)}">
          <span class="field-label">${label}${requiredMarker}</span>
          ${description}
          <textarea id="${escapeHtml(name)}" name="${escapeHtml(
      name
    )}" rows="4"${requiredAttr} placeholder="{&quot;key&quot;: &quot;value&quot;}"></textarea>
        </label>`;
  }

  if (field.enum && field.enum.length > 0) {
    const options = field.enum
      .map(
        (choice) =>
          `<option value="${escapeHtml(String(choice))}">${escapeHtml(String(choice))}</option>`
      )
      .join('');
    return `
        <label class="field" for="${escapeHtml(name)}">
          <span class="field-label">${label}${requiredMarker}</span>
          ${description}
          <select id="${escapeHtml(name)}" name="${escapeHtml(name)}"${requiredAttr}>
            <option value="">Select…</option>
            ${options}
          </select>
        </label>`;
  }

  if (field.type === 'boolean') {
    return `
        <label class="field field-checkbox" for="${escapeHtml(name)}">
          <input type="checkbox" id="${escapeHtml(name)}" name="${escapeHtml(name)}" value="true" />
          <span class="field-label">${label}</span>
          ${description}
        </label>`;
  }

  if (field.type === 'number' || field.type === 'integer') {
    return `
        <label class="field" for="${escapeHtml(name)}">
          <span class="field-label">${label}${requiredMarker}</span>
          ${description}
          <input type="number" id="${escapeHtml(name)}" name="${escapeHtml(name)}"${requiredAttr} />
        </label>`;
  }

  return `
      <label class="field" for="${escapeHtml(name)}">
        <span class="field-label">${label}${requiredMarker}</span>
        ${description}
        <input type="text" id="${escapeHtml(name)}" name="${escapeHtml(name)}"${requiredAttr} />
      </label>`;
}

export function buildExternalResumeFormFieldsHtml(schema: JsonModelSchemaType | undefined): string {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object') {
    return '';
  }

  const required = new Set<string>(schema.required ?? []);
  const fields = Object.entries(properties)
    .filter(([, propertySchema]) => propertySchema != null && typeof propertySchema === 'object')
    .map(([name, propertySchema]) =>
      buildFieldHtml(name, propertySchema as FlatFieldSchema, required)
    );

  return fields.join('\n');
}

function parseFieldValue(name: string, field: FlatFieldSchema, raw: unknown): unknown | undefined {
  if (isExternalResumeFormTextareaField(field)) {
    if (raw == null || raw === '') {
      return undefined;
    }
    try {
      return JSON.parse(String(raw));
    } catch {
      throw new Error(`Invalid JSON for field "${name}"`);
    }
  }

  if (field.type === 'boolean') {
    return raw === true || raw === 'true' || raw === 'on';
  }

  if (raw == null || raw === '') {
    return undefined;
  }

  if (field.type === 'number' || field.type === 'integer') {
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      throw new Error(`Invalid number for field "${name}"`);
    }
    return parsed;
  }

  return String(raw);
}

export function parseExternalResumeFormBody(
  body: Record<string, unknown>,
  schema: JsonModelSchemaType | undefined
): Record<string, unknown> {
  const properties = schema?.properties;
  if (!properties || typeof properties !== 'object') {
    return {};
  }

  const input: Record<string, unknown> = {};

  for (const [name, propertySchema] of Object.entries(properties)) {
    if (propertySchema != null && typeof propertySchema === 'object') {
      const parsed = parseFieldValue(name, propertySchema as FlatFieldSchema, body[name]);
      if (parsed !== undefined || (propertySchema as FlatFieldSchema).type === 'boolean') {
        input[name] = parsed;
      }
    }
  }

  return input;
}

export function validateExternalResumeInput(
  input: Record<string, unknown>,
  schema: JsonModelSchemaType | undefined
): Record<string, unknown> {
  const validator = buildFieldsZodValidator(schema);
  const result = validator.safeParse(input);
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new Error(firstIssue?.message ?? 'Input validation failed');
  }

  return result.data;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
