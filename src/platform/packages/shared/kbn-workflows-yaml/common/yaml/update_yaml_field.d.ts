/**
 * Updates a field in YAML by `fieldPath` (e.g. `enabled`, `metadata.author`).
 *
 * For an existing scalar field with a primitive value, the new value is
 * spliced into the source at the scalar's byte range, leaving every other
 * byte (indentation, quoting, comments, blank lines, block scalars, trailing
 * newlines) untouched. For a missing field or a non-scalar value, we fall
 * back to `doc.setIn` + `doc.toString()`, which can normalize formatting.
 */
export declare function updateYamlField(yamlString: string, fieldPath: string, value: unknown): string;
