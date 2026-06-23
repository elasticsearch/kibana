/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Document, YAMLMap } from 'yaml';
import { parse as parseYaml, parseDocument, isMap, isSeq, isScalar } from 'yaml';

import type { z } from '@kbn/zod/v4';
import type { UserPickerDefaultSchema } from '../../../../common/types/domain/template/fields';

export type FieldDefaultValue =
  | string
  | number
  | string[]
  | z.infer<typeof UserPickerDefaultSchema>;

interface FieldDefinition {
  name?: string;
  $ref?: string;
  metadata?: {
    default?: FieldDefaultValue;
  };
}

interface ParsedDefinition {
  fields?: FieldDefinition[];
}

/**
 * Effective name for matching a field entry. For ref entries it is `name ?? $ref`
 * (the alias wins when present); for inline entries it is `name`.
 */
const effectiveFieldName = (field: FieldDefinition): string | undefined =>
  field.$ref !== undefined ? field.name ?? field.$ref : field.name;

/**
 * Same matching rule as `effectiveFieldName`, but operating on a yaml-library AST node
 * so callers can locate the entry while preserving comments and formatting.
 */
const yamlEntryEffectiveName = (item: YAMLMap<unknown, unknown>): string | undefined => {
  const nameNode = item.get('name', true);
  const refNode = item.get('$ref', true);
  const name = isScalar(nameNode) ? String(nameNode.value) : undefined;
  const ref = isScalar(refNode) ? String(refNode.value) : undefined;
  return ref !== undefined ? name ?? ref : name;
};

/**
 * Tries to parse a JSON-encoded array string. Returns the parsed array if successful,
 * or null if the value is not a JSON array string.
 */
const tryParseJsonArray = (value: string): unknown[] | null => {
  if (!value.startsWith('[')) return null;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Converts a JS value to a yaml-library AST node suitable for use as metadata.default.
 * Arrays of objects are turned into proper YAML sequences; scalars stay as-is.
 */
const toYamlDefaultNode = (doc: Document, value: FieldDefaultValue): unknown => {
  if (Array.isArray(value)) {
    return doc.createNode(value);
  }
  if (typeof value === 'string') {
    const parsed = tryParseJsonArray(value);
    if (parsed !== null) {
      return doc.createNode(parsed);
    }
  }
  return value;
};

/**
 * Updates or adds `metadata.default` for a specific field in the YAML definition.
 * Uses the `yaml` library's parseDocument to preserve comments and formatting.
 */
export const updateYamlFieldDefault = (
  yaml: string,
  fieldName: string,
  newValue: FieldDefaultValue
): string => {
  if (!yaml || yaml.trim() === '') {
    return yaml;
  }

  try {
    // First validate that the field exists
    const parsed = parseYaml(yaml) as ParsedDefinition;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.fields)) {
      return yaml;
    }
    const fieldExists = parsed.fields.some((field) => effectiveFieldName(field) === fieldName);
    if (!fieldExists) {
      return yaml;
    }

    // Use yaml's parseDocument to preserve comments
    const doc = parseDocument(yaml);
    const root = doc.contents;

    if (!isMap(root)) {
      return yaml;
    }

    const fieldsNode = root.get('fields', true);
    if (!isSeq(fieldsNode)) {
      return yaml;
    }

    // Find the field in the sequence
    for (const item of fieldsNode.items) {
      if (isMap(item) && yamlEntryEffectiveName(item) === fieldName) {
        const metadataNode = item.get('metadata', true);
        const defaultNode = toYamlDefaultNode(doc, newValue);

        if (!isMap(metadataNode)) {
          // Create metadata if it doesn't exist
          item.set('metadata', doc.createNode({ default: defaultNode }));
        } else {
          // Update or add default in existing metadata
          metadataNode.set('default', defaultNode);
        }
        break;
      }
    }

    return doc.toString();
  } catch {
    return yaml;
  }
};

/**
 * Removes `metadata.default` for a specific field in the YAML definition.
 * Uses the `yaml` library's parseDocument to preserve comments and formatting.
 * If metadata becomes empty after removal, the entire metadata key is also removed.
 */
export const removeYamlFieldDefault = (yaml: string, fieldName: string): string => {
  if (!yaml || yaml.trim() === '') {
    return yaml;
  }

  try {
    const parsed = parseYaml(yaml) as ParsedDefinition;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.fields)) {
      return yaml;
    }
    const fieldExists = parsed.fields.some((field) => effectiveFieldName(field) === fieldName);
    if (!fieldExists) {
      return yaml;
    }

    const doc = parseDocument(yaml);
    const root = doc.contents;

    if (!isMap(root)) {
      return yaml;
    }

    const fieldsNode = root.get('fields', true);
    if (!isSeq(fieldsNode)) {
      return yaml;
    }

    const fieldItem = fieldsNode.items.find(
      (item) => isMap(item) && yamlEntryEffectiveName(item) === fieldName
    );

    if (isMap(fieldItem)) {
      const metadataNode = fieldItem.get('metadata', true);
      if (isMap(metadataNode)) {
        metadataNode.delete('default');
        if (metadataNode.items.length === 0) {
          fieldItem.delete('metadata');
        }
      }
    }

    return doc.toString();
  } catch {
    return yaml;
  }
};

/**
 * Updates or adds `metadata.default` directly in a single field definition YAML.
 * Unlike updateYamlFieldDefault, operates on the root level (no `fields` array wrapper).
 */
export const updateFieldDefinitionDefault = (yaml: string, newValue: FieldDefaultValue): string => {
  if (!yaml || yaml.trim() === '') return yaml;
  try {
    const doc = parseDocument(yaml);
    const root = doc.contents;
    if (!isMap(root)) return yaml;

    const defaultNode = toYamlDefaultNode(doc, newValue);
    const rootMap = root as YAMLMap<unknown, unknown>;
    const metadataNode = rootMap.get('metadata', true);

    if (!isMap(metadataNode)) {
      rootMap.set('metadata', doc.createNode({ default: defaultNode }));
    } else {
      metadataNode.set('default', defaultNode);
    }

    return doc.toString();
  } catch {
    return yaml;
  }
};

/**
 * Removes `metadata.default` from a single field definition YAML.
 * Unlike removeYamlFieldDefault, operates on the root level (no `fields` array wrapper).
 */
export const removeFieldDefinitionDefault = (yaml: string): string => {
  if (!yaml || yaml.trim() === '') return yaml;
  try {
    const doc = parseDocument(yaml);
    const root = doc.contents;
    if (!isMap(root)) return yaml;

    const rootMap = root as YAMLMap<unknown, unknown>;
    const metadataNode = rootMap.get('metadata', true);
    if (isMap(metadataNode)) {
      metadataNode.delete('default');
      if (metadataNode.items.length === 0) {
        rootMap.delete('metadata');
      }
    }

    return doc.toString();
  } catch {
    return yaml;
  }
};

/**
 * Checks if a field has metadata.default defined in the YAML.
 */
export const hasFieldDefault = (yaml: string, fieldName: string): boolean => {
  if (!yaml || yaml.trim() === '') {
    return false;
  }

  try {
    const parsed = parseYaml(yaml) as ParsedDefinition;

    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.fields)) {
      return false;
    }

    const field = parsed.fields.find((f) => effectiveFieldName(f) === fieldName);

    if (!field) {
      return false;
    }

    return field.metadata?.default !== undefined;
  } catch {
    return false;
  }
};
