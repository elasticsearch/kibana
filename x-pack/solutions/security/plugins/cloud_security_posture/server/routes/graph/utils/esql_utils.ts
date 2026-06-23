/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Utility functions for building ESQL queries
 */

/**
 * Extracts namespace from a field name.
 * Examples:
 * - "user.entity.id" -> "user"
 * - "entity.id" -> "entity"
 * - "entity.target.id" -> "entity"
 * - "service.target.entity.id" -> "service"
 *
 * @param field - The field name to extract namespace from
 * @returns The namespace (first part before the first dot)
 */
export const getFieldNamespace = (field: string): string => {
  // Special case: "entity.id" or "entity.target.id" -> "entity"
  if (field.startsWith('entity.')) {
    return 'entity';
  }
  // Otherwise, extract the first part before the first dot
  return field.split('.')[0];
};

/**
 * Generates ESQL CASE statements for field hints based on entity ID matches.
 * This is used to determine which field (namespace) an entity ID came from.
 *
 * @param fields - Array of field names to check
 * @param entityIdVar - The ESQL variable name containing the entity ID to match
 * @returns ESQL CASE statement string with proper indentation
 *
 * @example
 * ```typescript
 * generateFieldHintCases(['user.entity.id', 'service.entity.id'], 'actorEntityId')
 * // Returns:
 * //     MV_CONTAINS(user.entity.id, actorEntityId), "user",
 * //     MV_CONTAINS(service.entity.id, actorEntityId), "service"
 * ```
 */
export const generateFieldHintCases = (fields: readonly string[], entityIdVar: string): string => {
  return fields
    .map((field) => `    MV_CONTAINS(${field}, ${entityIdVar}), "${getFieldNamespace(field)}"`)
    .join(',\n');
};

/**
 * Generates an ESQL expression that formats a JSON property.
 * If the value is NOT NULL, it returns the full property with quoted value.
 * If the value is NULL, it returns an empty string (property is omitted entirely).
 *
 * @param propertyName - The JSON property name (e.g., "name", "type", "sub_type")
 * @param valueVar - The ESQL variable name containing the value
 * @returns ESQL expression that outputs a JSON property or empty string
 *
 * @example
 * ```typescript
 * formatJsonProperty('type', 'actorEntityType')
 * // If actorEntityType = "user" → ,"type":"user"
 * // If actorEntityType = null   → "" (empty, property omitted)
 *
 * // Usage: put required fields first, then optional fields
 * CONCAT("{", "\"required\":true", formatJsonProperty('optional', 'val'), "}")
 * ```
 */
/**
 * Wraps a string-valued ES|QL expression so its result can be safely embedded as a JSON
 * string value. Escapes the two JSON-significant characters at query time:
 *   - backslash  \  ->  \\
 *   - double quote "  ->  \"
 * Backslash is escaped first so the backslashes added when escaping quotes are not doubled again.
 *
 * Without this, identity values containing a backslash (e.g. Windows/AD `DOMAIN\user` EUIDs such
 * as `user:AzureAD\FelixRoessel@...`) or a double quote produce invalid JSON that fails
 * `JSON.parse` downstream in parse_records, 500-ing the whole graph request.
 *
 * REPLACE uses Java regex for the pattern and Java replacement semantics for the third argument,
 * which is why the escape/replacement strings carry doubled backslashes. Returns null when the
 * input expression is null, preserving the COALESCE null-handling of the callers.
 */
export const escapeJsonStringValueEsql = (esqlExpr: string): string =>
  String.raw`REPLACE(REPLACE(${esqlExpr}, "\\\\", "\\\\\\\\"), "\"", "\\\\\"")`;

export const concatJsonObjectPropertyEsqlExprSafe = (
  propertyName: string,
  esqlVariable: string
): string => {
  // CONCAT returns null if any argument is null, so if valueVar is null,
  // the entire CONCAT returns null, and COALESCE returns empty string
  return `COALESCE(CONCAT("\\"${propertyName}\\":\\"", ${escapeJsonStringValueEsql(
    esqlVariable
  )}, "\\""), "")`;
};

export const concatJsonObjectPropertyString = (
  propertyName: string,
  stringValue: string
): string => {
  return `CONCAT("\\"${propertyName}\\":\\"", "${stringValue}", "\\"")`;
};

export const concatJsonObjectPropertyBool = (propertyName: string, boolValue: boolean): string => {
  return `CONCAT("\\"${propertyName}\\":", "${boolValue}")`;
};

export const concatJsonObjectPropertyEsqlExprAsString = (
  propertyName: string,
  esqlExpr: string
): string => {
  return `CONCAT("\\"${propertyName}\\":\\"", ${escapeJsonStringValueEsql(esqlExpr)}, "\\"")`;
};

export const JSON_OBJECT_SEPARATOR = '","';
export const JSON_OBJECT_START = '"{"';
export const JSON_OBJECT_END = '"}"';

/**
 * Generates ESQL EVAL statement for actor entity ID using COALESCE.
 * Returns the first non-null value from the actor entity fields.
 *
 * @param actorFields - Array of actor entity field names
 * @returns ESQL EVAL statement for actorEntityId
 *
 * @example
 * ```typescript
 * buildActorEntityIdEval(['user.entity.id', 'service.entity.id'])
 * // Returns:
 * // | EVAL actorEntityId = COALESCE(
 * //     user.entity.id,
 * //     service.entity.id
 * //   )
 * ```
 */
export const buildActorEntityIdEval = (actorFields: readonly string[]): string => {
  const fieldsCoalesce = actorFields.join(',\n    ');
  return `| EVAL actorEntityId = COALESCE(
    ${fieldsCoalesce}
  )`;
};

/**
 * Generates ESQL EVAL statements for target entity ID collection using MV_APPEND.
 * Collects all non-null target entity IDs into a multi-value field, deduplicating them.
 *
 * @param targetFields - Array of target entity field names
 * @returns Multi-line ESQL EVAL statements for targetEntityId
 *
 * @example
 * ```typescript
 * buildTargetEntityIdEvals(['file.target.entity.id', 'process.target.entity.id'])
 * // Returns:
 * // | EVAL targetEntityId = TO_STRING(null)
 * // | EVAL targetEntityId = CASE(
 * //     file.target.entity.id IS NULL,
 * //     targetEntityId,
 * //     CASE(
 * //       targetEntityId IS NULL,
 * //       file.target.entity.id,
 * //       MV_DEDUPE(MV_APPEND(targetEntityId, file.target.entity.id))
 * //     )
 * //   )
 * // | EVAL targetEntityId = CASE(...)  // repeated for each target field
 * ```
 */
export const buildTargetEntityIdEvals = (targetFields: readonly string[]): string => {
  return [
    '| EVAL targetEntityId = TO_STRING(null)',
    ...targetFields.map((field) => {
      return `| EVAL targetEntityId = CASE(
    ${field} IS NULL,
    targetEntityId,
    CASE(
      targetEntityId IS NULL,
      ${field},
      MV_DEDUPE(MV_APPEND(targetEntityId, ${field}))
    )
  )`;
    }),
  ].join('\n');
};

/**
 * Generates ESQL EVAL statements for entity field hints (ecsParentField).
 * Creates CASE statements to determine which ECS field an entity ID came from.
 *
 * @param actorFields - Array of actor entity field names (empty to skip actor hints)
 * @param targetFields - Array of target entity field names (empty to skip target hints)
 * @returns ESQL EVAL statements for actorEcsParentField and/or targetEcsParentField
 *
 * @example
 * ```typescript
 * buildEntityFieldHints(['user.entity.id'], ['file.target.entity.id'])
 * // Returns:
 * // | EVAL actorEcsParentField = CASE(
 * //     MV_CONTAINS(user.entity.id, actorEntityId), "user",
 * //     ""
 * //   )
 * // | EVAL targetEcsParentField = CASE(
 * //     MV_CONTAINS(file.target.entity.id, targetEntityId), "file",
 * //     ""
 * // )
 * ```
 */
export const buildEntityFieldHints = (
  actorFields: readonly string[],
  targetFields: readonly string[]
): string => {
  const statements: string[] = [];

  if (actorFields.length > 0) {
    const actorCases = generateFieldHintCases(actorFields, 'actorEntityId');
    statements.push(`| EVAL actorEcsParentField = CASE(
${actorCases},
    ""
  )`);
  }

  if (targetFields.length > 0) {
    const targetCases = generateFieldHintCases(targetFields, 'targetEntityId');
    statements.push(`| EVAL targetEcsParentField = CASE(
${targetCases},
    ""
)`);
  }

  return statements.join('\n');
};

/**
 * Generates ESQL EVAL statements for source metadata (IP addresses and geo country codes).
 *
 * @returns ESQL EVAL statements for sourceIps and sourceCountryCodes
 *
 * @example
 * ```typescript
 * buildSourceMetadataEvals()
 * // Returns:
 * // | EVAL sourceIps = source.ip
 * // | EVAL sourceCountryCodes = source.geo.country_iso_code
 * ```
 */
export const buildSourceMetadataEvals = (): string => {
  return `| EVAL sourceIps = source.ip
| EVAL sourceCountryCodes = source.geo.country_iso_code`;
};
