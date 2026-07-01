/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { entityStoreConditionToESQL as conditionToESQL } from '../../esql/condition_to_esql';
import { castField } from '../../esql/cast';
import type {
  EntityDefinitionWithoutId,
  EuidRankingBranch,
  FieldEvaluation,
  EntityType,
  EuidAttribute,
  FieldEvaluationWhenClauseFieldMappingThen,
} from '../definitions/entity_schema';
import { isSingleFieldIdentity } from '../definitions/entity_schema';
import { getEntityDefinitionWithoutId } from '../definitions/registry';
import {
  esqlIsNotNullOrEmpty,
  esqlIsNullOrEmpty,
  esqlPresentColumnName,
  esqlPresentOrNullColumnName,
} from '../../esql/strings';
import {
  applyWhenConditionTrueSetFields,
  documentPassesCalculatedIdentityPipelineGate,
  getDocument,
  getEffectiveEuidRanking,
  getFieldValue,
  getFieldsToBeFilteredOn,
  getFieldsToBeFilteredOut,
  getSourceFieldNames,
  isEuidField,
  isEuidSeparator,
} from './commons';
import {
  applyFieldEvaluations,
  getSourceMatchSpec,
  type SourceMatchSpec,
} from './field_evaluations';

/** Collects unique identity fields across all ranking branches that need `_present` columns. */
export function collectRankingFields(branches: EuidRankingBranch[]): Set<string> {
  const fields = new Set<string>();
  for (const { ranking } of branches) {
    if (ranking.length === 1 && ranking[0].length === 1 && isEuidField(ranking[0][0])) {
      continue;
    }
    for (const composedField of ranking) {
      for (const attr of composedField) {
        if (isEuidField(attr)) {
          fields.add(attr.field);
        }
      }
    }
  }
  return fields;
}

export function getEuidEsqlFilterBasedOnDocument(
  entityType: EntityType,
  doc: any
): string | undefined {
  if (!doc) {
    return undefined;
  }

  doc = getDocument(doc);
  const entityDefinition = getEntityDefinitionWithoutId(entityType);
  const { identityField } = entityDefinition;

  if (isSingleFieldIdentity(identityField)) {
    const value = getFieldValue(doc, identityField.singleField);
    if (value === undefined) {
      return undefined;
    }
    return `(${identityField.singleField} == "${escapeEsqlString(value)}")`;
  }

  const fieldEvaluations = identityField.fieldEvaluations ?? [];
  if (fieldEvaluations.length > 0) {
    const evaluated = applyFieldEvaluations(doc, fieldEvaluations);
    doc = { ...doc, ...evaluated };
  }
  if (entityDefinition.whenConditionTrueSetFieldsPreAgg?.length) {
    applyWhenConditionTrueSetFields(doc, entityDefinition.whenConditionTrueSetFieldsPreAgg);
  }
  if (entityDefinition.whenConditionTrueSetFieldsAfterStats?.length) {
    applyWhenConditionTrueSetFields(doc, entityDefinition.whenConditionTrueSetFieldsAfterStats);
  }
  if (!documentPassesCalculatedIdentityPipelineGate(doc, entityDefinition)) {
    return undefined;
  }
  const effectiveEuidRanking = getEffectiveEuidRanking(doc, identityField);
  const fieldsToBeFilteredOn = getFieldsToBeFilteredOn(doc, effectiveEuidRanking);
  if (fieldsToBeFilteredOn.rankingPosition === -1) {
    return undefined;
  }

  const evaluatedDestinations = new Set(fieldEvaluations.map((e) => e.destination));

  const onExpressions = Object.entries(fieldsToBeFilteredOn.values)
    .filter(([field]) => !evaluatedDestinations.has(field))
    .map(([field, value]) => `(${field} == "${escapeEsqlString(value)}")`);

  const toBeFilteredOut = getFieldsToBeFilteredOut(
    effectiveEuidRanking,
    fieldsToBeFilteredOn
  ).filter((field) => !evaluatedDestinations.has(field));
  const outExpressions = toBeFilteredOut.map((field) => `${esqlIsNullOrEmpty(field)}`);

  const allParts: string[] = [...onExpressions, ...outExpressions];

  if (fieldEvaluations.length > 0) {
    for (const evaluation of fieldEvaluations) {
      const { exactMatchFields, prefixMatchFields } = getSourceFieldNames(evaluation.sources);
      const sourceFields = [...exactMatchFields, ...prefixMatchFields];
      const hasEvaluatedSource = sourceFields.some((f) => evaluatedDestinations.has(f));
      if (hasEvaluatedSource) {
        continue;
      }
      const spec = getSourceMatchSpec(doc, evaluation);
      allParts.push(buildSourceClauseEsql(evaluation, spec));
    }
  }

  return `(${allParts.join(' AND ')})`;
}

function sourceToEsqlExpression(source: FieldEvaluation['sources'][number]): string {
  if ('field' in source) {
    return `MV_FIRST(${castField(source.field)})`;
  }
  return `MV_FIRST(SPLIT(MV_FIRST(${castField(source.firstChunkOfField)}), "${escapeEsqlString(
    source.splitBy
  )}"))`;
}

/**
 * Returns the entity-id expression for a ranking definition, referencing
 * pre-computed `<field>_present_or_null` columns.
 *
 * Output shape: a bare column ref (single field), `CONCAT(...)` (composed field),
 * or `COALESCE(arm1, arm2, …)` (multiple ranked arms).
 */
export function buildRankingCaseEsql(
  ranking: EuidAttribute[][],
  presentOrNullAliases: ReadonlyMap<string, string>
): string {
  if (ranking.length === 0) {
    throw new Error('No euid fields found, invalid euid logic definition');
  }

  if (ranking.length === 1) {
    const comp = ranking[0];
    const firstAttr = comp[0];
    if (isEuidSeparator(firstAttr)) {
      throw new Error('Separator found in single field, invalid euid logic definition');
    }
    if (comp.length === 1 && isEuidField(firstAttr)) {
      // Single ranking, single field: bare _present_or_null ref (no COALESCE needed)
      return presentOrNullAliases.get(firstAttr.field) ?? `TO_STRING(${firstAttr.field})`;
    }
  }

  const arms = ranking.map((composedField) => {
    if (composedField.length === 1 && isEuidSeparator(composedField[0])) {
      throw new Error('Separator found in single field, invalid euid logic definition');
    }
    if (isEuidSeparator(composedField[0])) {
      throw new Error('The first field of a composed field cannot be a separator');
    }

    if (composedField.length === 1) {
      const f = composedField[0] as { field: string };
      return presentOrNullAliases.get(f.field) ?? `TO_STRING(${f.field})`;
    }

    // Composed arm: CONCAT over _present_or_null refs — NULL when any component is absent.
    const parts = composedField
      .map((attr) =>
        isEuidField(attr)
          ? presentOrNullAliases.get(attr.field) ?? `TO_STRING(${attr.field})`
          : `"${escapeEsqlString(attr.sep)}"`
      )
      .join(', ');
    return `CONCAT(${parts})`;
  });

  return arms.length === 1 ? arms[0] : `COALESCE(${arms.join(', ')})`;
}

/** Returns a COALESCE expression that picks the first non-null/non-empty source variable. */
export function buildSourcePickerEsql(sourceVariablesBaseName: string, count: number): string {
  if (count < 1) {
    throw new Error('buildSourcePickerEsql requires at least one source variable');
  }
  const arms = Array.from({ length: count }, (_, i) => {
    const v = `${sourceVariablesBaseName}${i}`;
    return `CASE(${v} IS NOT NULL AND ${v} != "", ${v})`;
  });
  return `COALESCE(${arms.join(', ')})`;
}

/**
 * Builds a CASE expression that maps a field's value through an explicit lookup table.
 * Returns NULL when the field is absent or its value is not in the mapping — allowing
 * the outer COALESCE to fall through to the next whenClause arm.
 */
function buildFieldMappingEsql(then: FieldEvaluationWhenClauseFieldMappingThen): string {
  const arms = Object.entries(then.mapping)
    .map(
      ([from, to]) =>
        `MV_FIRST(TO_STRING(${then.field})) == "${escapeEsqlString(from)}", "${escapeEsqlString(
          to
        )}"`
    )
    .join(', ');
  return `CASE(${arms})`;
}

/**
 * Returns the destination field assignment expression and any boolean precompute columns it needs.
 *
 * Without `whenClauses`: a simple fallback/pass-through CASE.
 * With `whenClauses`: a COALESCE of mapped arms (sourceMatchesAny or condition-based),
 * a fallback arm, and a bare pass-through.
 */
export function buildDestinationFieldEsql(
  effectiveSourceName: string,
  destBase: string,
  fallbackExpression: string,
  whenClauses: FieldEvaluation['whenClauses']
): { expression: string; conditionPrecomputes: Array<{ colName: string; esql: string }> } {
  const conditionPrecomputes: Array<{ colName: string; esql: string }> = [];

  if (whenClauses.length === 0) {
    return {
      expression: `CASE(${effectiveSourceName} IS NULL OR ${effectiveSourceName} == "", ${fallbackExpression}, ${effectiveSourceName})`,
      conditionPrecomputes,
    };
  }

  const coalesceArms: string[] = [];
  for (const [i, clause] of whenClauses.entries()) {
    let condition: string;
    if ('sourceMatchesAny' in clause) {
      const inList = clause.sourceMatchesAny.map((v) => `"${escapeEsqlString(v)}"`).join(', ');
      condition = `COALESCE(${effectiveSourceName} IN (${inList}), FALSE)`;
    } else {
      const colName = `${destBase}_arm${i}`;
      conditionPrecomputes.push({ colName, esql: conditionToESQL(clause.condition) });
      condition = `COALESCE(${colName}, FALSE)`;
    }
    const thenExpr =
      typeof clause.then === 'string'
        ? `"${escapeEsqlString(clause.then)}"`
        : buildFieldMappingEsql(clause.then);
    coalesceArms.push(`CASE(${condition}, ${thenExpr})`);
  }
  coalesceArms.push(
    `CASE(${effectiveSourceName} IS NULL OR ${effectiveSourceName} == "", ${fallbackExpression})`
  );
  coalesceArms.push(effectiveSourceName);

  return { expression: `COALESCE(${coalesceArms.join(', ')})`, conditionPrecomputes };
}

/**
 * Returns comma-separated EVAL assignments for a single field evaluation
 * (e.g. `entity.namespace` derived from `event.module`).
 * May include intermediate source-picker and condition columns.
 */
export function buildOneFieldEvaluationEsql(evaluation: FieldEvaluation): string {
  const { destination, sources, fallbackValue, whenClauses } = evaluation;
  const sourceExpressions = sources.map((s) => sourceToEsqlExpression(s));
  const sourceVariablesBaseName = `_src_${destination.replace(/\./g, '_')}`;
  const effectiveSourceName = sourceVariablesBaseName;
  const fallbackExpression =
    fallbackValue === null ? 'NULL' : `"${escapeEsqlString(fallbackValue)}"`;
  const destBase = `_eval_${destination.replace(/\./g, '_')}`;

  if (sourceExpressions.length === 0) {
    throw new Error(
      `buildOneFieldEvaluationEsql: field evaluation "${destination}" has no sources`
    );
  }

  const assignments: string[] = [];

  if (sourceExpressions.length === 1) {
    assignments.push(`${effectiveSourceName} = ${sourceExpressions[0]}`);
  } else {
    for (let i = 0; i < sourceExpressions.length; i++) {
      assignments.push(`${sourceVariablesBaseName}${i} = ${sourceExpressions[i]}`);
    }
    assignments.push(
      `${effectiveSourceName} = ${buildSourcePickerEsql(
        sourceVariablesBaseName,
        sourceExpressions.length
      )}`
    );
  }

  const { expression: destinationExpr, conditionPrecomputes } = buildDestinationFieldEsql(
    effectiveSourceName,
    destBase,
    fallbackExpression,
    whenClauses
  );
  for (const { colName, esql } of conditionPrecomputes) {
    assignments.push(`${colName} = (${esql})`);
  }
  assignments.push(`${destination} = ${destinationExpr}`);

  return assignments.join(',\n ');
}

function escapeEsqlString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function buildSourceClauseEsql(evaluation: FieldEvaluation, spec: SourceMatchSpec): string {
  if (spec.type === 'condition') {
    return `(${conditionToESQL(spec.condition)})`;
  }

  const { exactMatchFields, prefixMatchFields } = getSourceFieldNames(evaluation.sources);
  const allSourceFields = [...exactMatchFields, ...prefixMatchFields];

  if (spec.type === 'unknown') {
    return `(${allSourceFields.map((f) => esqlIsNullOrEmpty(f)).join(' AND ')})`;
  }

  const disjuncts = spec.values.map((v) => {
    const escaped = escapeEsqlString(v);
    const exactConds = exactMatchFields.map((f) => `(${f} == "${escaped}")`);
    const prefixConds = prefixMatchFields.map((f) => `STARTS_WITH(${f}, "${escaped}")`);
    const parts = [...exactConds, ...prefixConds];
    return parts.length === 1 ? parts[0] : `(${parts.join(' OR ')})`;
  });
  return disjuncts.length === 1 ? disjuncts[0] : `(${disjuncts.join(' OR ')})`;
}

export function getFieldEvaluationsEsql(entityType: EntityType): string | undefined {
  return getFieldEvaluationsEsqlFromDefinition(getEntityDefinitionWithoutId(entityType));
}

/**
 * Returns an ESQL EVAL fragment for all field evaluations of the given entity type.
 * Use in a pipeline as | EVAL <result>. Returns undefined when there are no field evaluations.
 */
export function getFieldEvaluationsEsqlFromDefinition(
  definition: EntityDefinitionWithoutId
): string | undefined {
  // Use only top-level shared evaluations (e.g. entity.source).
  // Identity-specific evaluations (e.g. entity.namespace) are emitted by
  // getEuidEsqlEvaluation directly, co-located with the EUID expression.
  const evaluations = definition.fieldEvaluations ?? [];
  if (evaluations.length === 0) {
    return undefined;
  }
  return evaluations.map((e) => buildOneFieldEvaluationEsql(e)).join(',\n ');
}

/**
 * Constructs an ESQL filter for the provided entity type that checks if the documents contains an entity id.
 *
 * You will need to prepend the result with a `| WHERE` clause, or just add to your existing WHERE clause.
 *
 * Example usage:
 * ```ts
 * import { getEuidEsqlDocumentsContainsIdFilter } from './esql';
 *
 * const filter = getEuidEsqlDocumentsContainsIdFilter('host');
 * // filter may look like:
 * // '((host.entity.id IS NOT NULL) OR (host.id IS NOT NULL) OR (host.name IS NOT NULL) OR (host.hostname IS NOT NULL))'
 * ```
 *
 * @param entityType - The entity type string (e.g. 'host', 'user', 'generic')
 * @returns An ESQL filter string that checks if the document contains an entity id.
 */
export function getEuidEsqlDocumentsContainsIdFilter(entityType: EntityType) {
  const entityDefinition = getEntityDefinitionWithoutId(entityType);
  const { identityField } = entityDefinition;

  if (isSingleFieldIdentity(identityField)) {
    return `(${esqlIsNotNullOrEmpty(identityField.singleField)})`;
  }

  return conditionToESQL(identityField.documentsFilter);
}

/**
 * Returns a comma-separated ES|QL EVAL assignments fragment that computes the entity id
 * for the given entity type and assigns it to `outputColumn`.
 *
 * For multi-field identities the fragment also emits intermediate columns (`_present`,
 * `_present_or_null`, field-evaluation columns) as sequential assignments in the same
 * `| EVAL` stage so later assignments can reference them by name.
 *
 * Wrap the returned string with `| EVAL`:
 * ```ts
 * parts.push(`| EVAL ${getEuidEsqlEvaluation(type, 'entity.id')}`);
 * ```
 */
export function getEuidEsqlEvaluation(
  entityType: EntityType,
  outputColumn: string,
  { withTypeId = true }: { withTypeId?: boolean } = {}
): string {
  const entityDefinition = getEntityDefinitionWithoutId(entityType);
  const { identityField } = entityDefinition;
  const mustPrependTypeId = withTypeId && !identityField.skipTypePrepend;

  if (isSingleFieldIdentity(identityField)) {
    const expression = appendTypeIdIfNeeded(
      entityType,
      castField(identityField.singleField),
      mustPrependTypeId
    );
    return `${outputColumn} = ${expression}`;
  }

  const { euidRanking } = identityField;
  const branches = euidRanking.branches;
  const presentFields = collectRankingFields(branches);
  const presentOrNullAliases = new Map(
    [...presentFields].map((f) => [f, esqlPresentOrNullColumnName(f)])
  );
  const assignments: string[] = [];

  // Identity-specific field evaluations (e.g. entity.namespace for user) must precede
  // the _present columns that may reference their output.
  for (const evaluation of identityField.fieldEvaluations ?? []) {
    assignments.push(buildOneFieldEvaluationEsql(evaluation));
  }
  for (const f of presentFields) {
    assignments.push(`${esqlPresentColumnName(f)} = ${esqlIsNotNullOrEmpty(f)}`);
  }
  // Nullable aliases: field value when present, NULL otherwise.
  for (const f of presentFields) {
    assignments.push(
      `${esqlPresentOrNullColumnName(f)} = CASE(${esqlPresentColumnName(f)}, TO_STRING(${f}))`
    );
  }

  const hasConditionalBranch = branches.some((b) => b.when != null);
  let idLogic: string;
  if (!hasConditionalBranch && branches.length === 1) {
    idLogic = buildRankingCaseEsql(branches[0].ranking, presentOrNullAliases);
  } else {
    // Pre-compute each branch's condition and formula as named columns, then combine
    // with a single multi-arm CASE (not COALESCE) so a matched branch that evaluates
    // to NULL does not fall through to the next branch.
    const caseParts: string[] = [];
    for (const [i, branch] of branches.entries()) {
      const formulaVar = `_euid_branch_${i}_formula`;
      assignments.push(
        `${formulaVar} = ${buildRankingCaseEsql(branch.ranking, presentOrNullAliases)}`
      );
      if (branch.when) {
        const condVar = `_euid_branch_${i}_cond`;
        assignments.push(`${condVar} = (${conditionToESQL(branch.when)})`);
        caseParts.push(`${condVar}, ${formulaVar}`);
      } else {
        caseParts.push(`TRUE, ${formulaVar}`);
      }
    }
    idLogic = `CASE(${caseParts.join(',\n')}, NULL)`;
  }

  assignments.push(
    `${outputColumn} = ${appendTypeIdIfNeeded(entityType, idLogic, mustPrependTypeId)}`
  );
  return assignments.join(',\n ');
}

function appendTypeIdIfNeeded(
  entityType: EntityType,
  euidLogic: string,
  mustPrependTypeId: boolean
) {
  if (mustPrependTypeId) {
    return `CONCAT("${entityType}:", ${euidLogic})`;
  }
  return euidLogic;
}
