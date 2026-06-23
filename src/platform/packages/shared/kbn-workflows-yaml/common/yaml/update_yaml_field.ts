/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { parseDocument, isScalar, stringify } from 'yaml';

/**
 * Updates a field in YAML by `fieldPath` (e.g. `enabled`, `metadata.author`).
 *
 * For an existing scalar field with a primitive value, the new value is
 * spliced into the source at the scalar's byte range, leaving every other
 * byte (indentation, quoting, comments, blank lines, block scalars, trailing
 * newlines) untouched. For a missing field or a non-scalar value, we fall
 * back to `doc.setIn` + `doc.toString()`, which can normalize formatting.
 */
export function updateYamlField(yamlString: string, fieldPath: string, value: unknown): string {
  try {
    const doc = parseDocument(yamlString, { keepSourceTokens: true });
    const pathArray = fieldPath.split('.');

    const existingNode = doc.getIn(pathArray, true);

    if (isScalar(existingNode) && Array.isArray(existingNode.range) && isPrimitive(value)) {
      const [start, end] = existingNode.range;
      const serialized = stringify(value, { lineWidth: 0 }).replace(/\n+$/, '');
      return yamlString.slice(0, start) + serialized + yamlString.slice(end);
    }

    doc.setIn(pathArray, value);
    return doc.toString();
  } catch {
    return yamlString;
  }
}

const isPrimitive = (value: unknown): boolean =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean';
