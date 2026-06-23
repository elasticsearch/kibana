/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { parse as parseYaml, parseDocument, isMap, isSeq } from 'yaml';

interface FieldEntry {
  name?: string;
}

interface ParsedDefinition {
  fields?: FieldEntry[];
}

/**
 * Appends a field definition (YAML of a single FieldSchema) into the `fields` array of a
 * template definition YAML. Returns the updated YAML string, preserving existing formatting
 * and comments.
 *
 * Throws an error if a field with the same `name` already exists in the template.
 */
export const insertFieldFromLibrary = (
  templateYaml: string,
  fieldDefinitionYaml: string
): string => {
  if (!templateYaml || templateYaml.trim() === '') {
    return templateYaml;
  }

  // Parse the field definition to get the field name
  const parsedField = parseYaml(fieldDefinitionYaml) as FieldEntry | null;
  if (!parsedField || typeof parsedField !== 'object' || !parsedField.name) {
    throw new Error('Invalid field definition: missing field name');
  }

  const fieldName = parsedField.name;

  // Check for duplicate names in the current template
  const parsedTemplate = parseYaml(templateYaml) as ParsedDefinition | null;
  if (
    parsedTemplate &&
    typeof parsedTemplate === 'object' &&
    Array.isArray(parsedTemplate.fields)
  ) {
    const alreadyExists = parsedTemplate.fields.some((f) => f.name === fieldName);
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

  // Parse the field definition YAML into a document so we get a proper YAML node
  const fieldDoc = parseDocument(fieldDefinitionYaml);
  const fieldNode = fieldDoc.contents;

  if (isSeq(fieldsNode)) {
    // Append to existing fields array
    fieldsNode.add(fieldNode);
  } else {
    // Create a new fields sequence with this field
    doc.setIn(['fields'], doc.createNode([fieldNode]));
  }

  return doc.toString();
};
