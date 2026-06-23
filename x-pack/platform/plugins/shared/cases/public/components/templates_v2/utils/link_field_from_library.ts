/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml, parseDocument, isMap, isSeq } from 'yaml';

interface FieldEntry {
  name?: string;
  $ref?: string;
  control?: string;
}

interface ParsedDefinition {
  fields?: FieldEntry[];
}

/**
 * Returns the effective field name for a parsed field entry.
 * For ref entries it is `name ?? $ref`; for inline entries it is `name`.
 */
const getEffectiveName = (field: FieldEntry): string | undefined =>
  field.$ref !== undefined ? field.name ?? field.$ref : field.name;

/**
 * Appends a library reference entry (`{ $ref: fieldName }`) to the `fields` array of a
 * template definition YAML. Returns the updated YAML string, preserving existing formatting
 * and comments.
 *
 * Throws if a field with the same effective name already exists in the template.
 */
export const linkFieldFromLibrary = (templateYaml: string, fieldName: string): string => {
  if (!templateYaml || templateYaml.trim() === '') {
    return templateYaml;
  }

  // Check for duplicate names in the current template
  const parsedTemplate = parseYaml(templateYaml) as ParsedDefinition | null;
  if (
    parsedTemplate &&
    typeof parsedTemplate === 'object' &&
    Array.isArray(parsedTemplate.fields)
  ) {
    const alreadyExists = parsedTemplate.fields.some((f) => getEffectiveName(f) === fieldName);
    if (alreadyExists) {
      throw new Error(`Field "${fieldName}" already exists in this template`);
    }
  }

  // Use yaml document model to preserve formatting / comments
  const doc = parseDocument(templateYaml);
  const root = doc.contents;

  if (!isMap(root)) {
    return templateYaml;
  }

  const fieldsNode = root.get('fields', true);
  const refNode = doc.createNode({ $ref: fieldName });

  if (isSeq(fieldsNode)) {
    fieldsNode.add(refNode);
  } else {
    doc.setIn(['fields'], doc.createNode([{ $ref: fieldName }]));
  }

  return doc.toString();
};

/**
 * Removes the reference entry for `fieldName` from the `fields` array of a template
 * definition YAML. Matches on `$ref === fieldName` or (`name === fieldName` when `$ref` is set).
 * Returns the updated YAML string.
 */
export const unlinkFieldFromTemplate = (templateYaml: string, fieldName: string): string => {
  if (!templateYaml || templateYaml.trim() === '') {
    return templateYaml;
  }

  const doc = parseDocument(templateYaml);
  const root = doc.contents;

  if (!isMap(root)) {
    return templateYaml;
  }

  const fieldsNode = root.get('fields', true);

  if (!isSeq(fieldsNode)) {
    return templateYaml;
  }

  const indexToRemove = fieldsNode.items.findIndex((item) => {
    if (!isMap(item)) return false;
    const $ref = item.get('$ref');
    const name = item.get('name');
    if ($ref === undefined) return false;
    return (name ?? $ref) === fieldName;
  });

  if (indexToRemove !== -1) {
    fieldsNode.delete(indexToRemove);
  }

  return doc.toString();
};
