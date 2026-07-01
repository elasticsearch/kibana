/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Condition } from '@kbn/streamlang';
import type {
  EntityDefinitionWithoutId,
  EntityType,
  EuidAttribute,
  FieldEvaluation,
  FieldEvaluationWhenClauseFieldMappingThen,
} from '../definitions/entity_schema';
import { isSingleFieldIdentity } from '../definitions/entity_schema';
import { getEntityDefinitionWithoutId } from '../definitions/registry';
import { isEuidField } from './commons';

/**
 * Keyword runtime field scripts must call emit(); they cannot return a value from the script root.
 *
 * We cannot use labeled blocks (`label: { }`) — Painless rejects the `:` token here.
 * We cannot use `while (true) { ... break }` when every path breaks — the compiler reports
 * `extraneous while loop`.
 *
 * Wrapping the evaluation in a `String`-returning function preserves ordinary `return`
 * statements from getEuidPainlessEvaluation without break/loop tricks.
 */
function wrapEvaluationScriptForKeywordRuntimeField(evaluationScript: string): string {
  const fn = '___euid_rt_eval';
  return `String ${fn}(def doc) { ${evaluationScript} } String ___euid = ${fn}(doc); if (___euid != null) { emit(___euid); }`;
}

/**
 * Mirrors string-literal when-rules for fields that have evaluated vars (e.g. `entity.namespace`).
 * Used for pre-agg and `whenConditionTrueSetFieldsAfterStats` (see getEuidFromObject).
 */
function buildPreAggEvaluatedVarOverridesPreamble(
  whenRules:
    | EntityDefinitionWithoutId['whenConditionTrueSetFieldsPreAgg']
    | EntityDefinitionWithoutId['whenConditionTrueSetFieldsAfterStats'],
  evaluatedVars: Map<string, string>
): string {
  if (!whenRules?.length) {
    return '';
  }
  const parts: string[] = [];
  for (const rule of whenRules) {
    const cond = streamlangConditionToPainlessDoc(rule.condition, { evaluatedVars });
    for (const [field, value] of Object.entries(rule.fields)) {
      if (typeof value !== 'string') {
        continue;
      }
      const varName = evaluatedVars.get(field);
      if (varName === undefined) {
        continue;
      }
      parts.push(`if (${cond}) { ${varName} = "${escapePainlessString(value)}"; }`);
    }
  }
  return parts.length > 0 ? `${parts.join(' ')} ` : '';
}

/**
 * Returns an Elasticsearch runtime keyword field mapping whose Painless script
 * computes the typed EUID for the given entity type.
 *
 * Example usage:
 * ```ts
 * runtime_mappings: { 'user_id': getEuidPainlessRuntimeMapping('user') }
 * ```
 *
 * @param entityType - The entity type string (e.g. 'host', 'user', 'generic')
 * @returns A runtime keyword field mapping (type + script) for use in runtime_mappings.
 */
export function getEuidPainlessRuntimeMapping(entityType: EntityType): {
  type: 'keyword';
  script: { source: string };
} {
  const returnScript = getEuidPainlessEvaluation(entityType);
  const emitScript = wrapEvaluationScriptForKeywordRuntimeField(returnScript);
  return {
    type: 'keyword',
    script: { source: emitScript },
  };
}

/**
 * Constructs a Painless evaluation for the provided entity type to generate the entity id.
 *
 * Example usage:
 * ```ts
 * import { getEuidPainlessEvaluation } from './painless';
 *
 * const evaluation = getEuidPainlessEvaluation('host');
 * // evaluation may look like:
 * // 'if (doc.containsKey('host.name') && doc['host.name'].size() > 0 && doc['host.name'].value != null && doc['host.name'].value != "") { return "host:" + doc['host.name'].value; } return null;'
 * ```
 *
 * @param entityType - The entity type string (e.g. 'host', 'user', 'generic')
 * @returns A Painless evaluation string that computes the entity id.
 */
export function getEuidPainlessEvaluation(entityType: EntityType): string {
  const entityDefinition = getEntityDefinitionWithoutId(entityType);
  const { identityField } = entityDefinition;
  const prefixExpr = identityField.skipTypePrepend ? '' : `"${entityType}:" + `;

  if (isSingleFieldIdentity(identityField)) {
    const field = identityField.singleField;
    const escaped = escapePainlessField(field);
    const condition = `doc.containsKey('${escaped}') && doc['${escaped}'].size() > 0 && doc['${escaped}'].value != null && doc['${escaped}'].value != ""`;
    return `if (${condition}) { return ${prefixExpr}doc['${escaped}'].value; } return null;`;
  }

  const { euidRanking } = identityField;
  if (euidRanking.branches.length === 0) {
    throw new Error('No euid ranking branches found, invalid euid logic definition');
  }

  const evaluatedVars = new Map<string, string>();
  let preamble = '';
  const fieldEvaluations = identityField.fieldEvaluations ?? [];
  if (fieldEvaluations.length > 0) {
    const result = buildFieldEvaluationsPreamble(fieldEvaluations);
    preamble = result.preamble + ' ';
    result.evaluatedVars.forEach((v, k) => evaluatedVars.set(k, v));
  }
  preamble += buildPreAggEvaluatedVarOverridesPreamble(
    entityDefinition.whenConditionTrueSetFieldsPreAgg,
    evaluatedVars
  );
  preamble += buildPreAggEvaluatedVarOverridesPreamble(
    entityDefinition.whenConditionTrueSetFieldsAfterStats,
    evaluatedVars
  );

  /** Same order as getEuidFromObject: field evals (and pre/post stats overrides) run before the pipeline gate. */
  const filterOpts: StreamlangToPainlessDocOptions = { evaluatedVars };
  const filterChecks: string[] = [];
  for (const filterCond of [identityField.documentsFilter, entityDefinition.postAggFilter].filter(
    (c): c is Condition => Boolean(c)
  )) {
    filterChecks.push(
      `if (!(${streamlangConditionToPainlessDoc(filterCond, filterOpts)})) { return null; }`
    );
  }
  const filterPreamble = filterChecks.length > 0 ? filterChecks.join(' ') + ' ' : '';

  const fieldCondition = (field: string): string => {
    const varName = evaluatedVars.get(field);
    if (varName) return `${varName} != null`;
    return painlessFieldNonEmpty(field);
  };

  const fieldValueExpr = (field: string): string => {
    const varName = evaluatedVars.get(field);
    if (varName) return varName;
    return `doc['${escapePainlessField(field)}'].value`;
  };

  const buildBranchClauses = (ranking: EuidAttribute[][]) =>
    ranking
      .map((composedField) => {
        const compositionCond = composedField
          .filter(isEuidField)
          .map((a) => fieldCondition(a.field))
          .join(' && ');
        const valueExpr = buildPainlessValueExprWithEvaluated(composedField, fieldValueExpr);
        return `if (${compositionCond}) { return ${prefixExpr}${valueExpr}; }`;
      })
      .join(' ');

  const hasConditionalBranch = euidRanking.branches.some((b) => b.when != null);
  if (!hasConditionalBranch && euidRanking.branches.length === 1) {
    return (
      preamble +
      filterPreamble +
      buildBranchClauses(euidRanking.branches[0].ranking) +
      ' return null;'
    );
  }

  const branchParts: string[] = [];
  for (let i = 0; i < euidRanking.branches.length; i++) {
    const branch = euidRanking.branches[i];
    const clauses = buildBranchClauses(branch.ranking);
    if (branch.when) {
      const cond = streamlangConditionToPainlessDoc(branch.when, { evaluatedVars });
      const prefix = i === 0 ? 'if' : 'else if';
      branchParts.push(`${prefix} (${cond}) { ${clauses} return null; }`);
    } else {
      branchParts.push(`else { ${clauses} return null; }`);
    }
  }
  const branchLogic = branchParts.join(' ');
  // When the last branch is `else { ... return null; }`, every path through the if / else if /
  // else chain already returns; a trailing `return null` is unreachable and Painless rejects it.
  const lastBranchPart = branchParts[branchParts.length - 1] ?? '';
  const endsWithExhaustiveElse = lastBranchPart.startsWith('else {');
  const trailingReturn = endsWithExhaustiveElse ? '' : ' return null;';
  return preamble + filterPreamble + branchLogic + trailingReturn;
}

function painlessFieldNonEmpty(field: string): string {
  const escaped = escapePainlessField(field);
  return `doc.containsKey('${escaped}') && doc['${escaped}'].size() > 0 && doc['${escaped}'].value != null && doc['${escaped}'].value != ""`;
}

export interface StreamlangToPainlessDocOptions {
  /** Maps logical field names (e.g. entity.namespace) to Painless locals from field-eval preamble. */
  evaluatedVars?: ReadonlyMap<string, string>;
}

/**
 * Translates a streamlang condition to Painless using doc['field'].value and/or evaluated locals.
 * Handles and, or, not, and field predicates (eq, neq, exists, includes).
 *
 * @internal Exported for testing.
 */
export function streamlangConditionToPainlessDoc(
  condition: unknown,
  options?: StreamlangToPainlessDocOptions
): string {
  const opts: StreamlangToPainlessDocOptions = options ?? {};
  if (!condition || typeof condition !== 'object') return 'false';
  const c = condition as Record<string, unknown>;
  if ('and' in c && Array.isArray(c.and)) {
    const parts = (c.and as unknown[]).map((sub) => streamlangConditionToPainlessDoc(sub, opts));
    return parts.length > 0 ? `(${parts.join(' && ')})` : 'true';
  }
  if ('or' in c && Array.isArray(c.or)) {
    const parts = (c.or as unknown[]).map((sub) => streamlangConditionToPainlessDoc(sub, opts));
    return parts.length > 0 ? `(${parts.join(' || ')})` : 'false';
  }
  if ('not' in c) {
    return `!(${streamlangConditionToPainlessDoc(c.not, opts)})`;
  }
  if ('always' in c) return 'true';
  if ('never' in c) return 'false';
  if ('field' in c && typeof c.field === 'string') {
    const field = c.field;
    const varName = opts.evaluatedVars?.get(field);
    if (varName !== undefined) {
      if ('eq' in c && c.eq !== undefined) {
        const val = escapePainlessString(String(c.eq));
        return `${varName} != null && ${varName} == "${val}"`;
      }
      if ('neq' in c && c.neq !== undefined) {
        const val = escapePainlessString(String(c.neq));
        return `(${varName} == null || ${varName} == "" || ${varName} != "${val}")`;
      }
      if ('exists' in c) {
        return c.exists
          ? `${varName} != null && ${varName} != ""`
          : `(${varName} == null || ${varName} == "")`;
      }
      if ('includes' in c) {
        const val = escapePainlessString(String(c.includes));
        return `${varName} != null && ${varName} != "" && ${varName}.contains("${val}")`;
      }
    }
    const escaped = escapePainlessField(field);
    const nonEmpty = painlessFieldNonEmpty(field);
    if ('eq' in c && c.eq !== undefined) {
      const val = escapePainlessString(String(c.eq));
      return `(${nonEmpty} && doc['${escaped}'].value == "${val}")`;
    }
    if ('neq' in c && c.neq !== undefined) {
      const val = escapePainlessString(String(c.neq));
      return `(!(${nonEmpty}) || doc['${escaped}'].value != "${val}")`;
    }
    if ('exists' in c) {
      return c.exists ? nonEmpty : `!(${nonEmpty})`;
    }
    if ('includes' in c) {
      const val = escapePainlessString(String(c.includes));
      return `(${nonEmpty} && doc['${escaped}'].value.contains("${val}"))`;
    }
  }
  return 'false';
}

function buildPainlessValueExprWithEvaluated(
  composedField: EuidAttribute[],
  fieldValueExpr: (field: string) => string
): string {
  if (composedField.length === 1 && isEuidField(composedField[0])) {
    return fieldValueExpr(composedField[0].field);
  }
  const parts = composedField.map((attr) => {
    if (isEuidField(attr)) {
      return fieldValueExpr(attr.field);
    }
    return `"${escapePainlessString(attr.sep)}"`;
  });
  return parts.join(' + ');
}

function escapePainlessField(field: string): string {
  return field.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function escapePainlessString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toPainlessNullableStringLiteral(value: string | null): string {
  return value === null ? 'null' : `"${escapePainlessString(value)}"`;
}

function destinationToVarName(destination: string): string {
  return destination.replace(/\./g, '_');
}

function buildFieldMappingPainless(
  varName: string,
  cond: string,
  then: FieldEvaluationWhenClauseFieldMappingThen
): string {
  const fieldEsc = escapePainlessField(then.field);
  const fieldRead = `(doc.containsKey('${fieldEsc}') && doc['${fieldEsc}'].size() > 0 ? doc['${fieldEsc}'].value : null)`;
  const branches = Object.entries(then.mapping)
    .map(
      ([from, to], i) =>
        `${i === 0 ? 'if' : 'else if'} (_mappedField == "${escapePainlessString(
          from
        )}") { ${varName} = "${escapePainlessString(to)}"; }`
    )
    .join(' ');
  return `if (${varName} == null && (${cond})) { String _mappedField = ${fieldRead}; if (_mappedField != null) { ${branches} } }`;
}

function buildFieldEvaluationsPreamble(evaluations: FieldEvaluation[]): {
  preamble: string;
  evaluatedVars: Map<string, string>;
} {
  const evaluatedVars = new Map<string, string>();
  const parts: string[] = [];
  for (const ev of evaluations) {
    const varName = destinationToVarName(ev.destination);
    evaluatedVars.set(ev.destination, varName);
    const stmts: string[] = [`String ${varName} = null;`, `String _src = null;`];
    for (const source of ev.sources) {
      if ('field' in source) {
        const srcEsc = escapePainlessField(source.field);
        stmts.push(
          `if (_src == null && doc.containsKey('${srcEsc}') && doc['${srcEsc}'].size() > 0 && doc['${srcEsc}'].value != null && doc['${srcEsc}'].value != "") { _src = doc['${srcEsc}'].value; }`
        );
      } else {
        const fieldEsc = escapePainlessField(source.firstChunkOfField);
        const delimInString = escapePainlessString(source.splitBy);
        stmts.push(
          `if (_src == null && doc.containsKey('${fieldEsc}') && doc['${fieldEsc}'].size() > 0 && doc['${fieldEsc}'].value != null && doc['${fieldEsc}'].value != "") { String _raw = doc['${fieldEsc}'].value; int _idx = _raw.indexOf("${delimInString}"); String _first = _idx >= 0 ? _raw.substring(0, _idx) : _raw; if (_first != null && _first != "") { _src = _first; } }`
        );
      }
    }

    for (const clause of ev.whenClauses) {
      if ('sourceMatchesAny' in clause) {
        const conds = clause.sourceMatchesAny
          .map((v) => `_src == "${escapePainlessString(v)}"`)
          .join(' || ');
        stmts.push(
          `if (${varName} == null && _src != null && (${conds})) { ${varName} = "${escapePainlessString(
            clause.then
          )}"; }`
        );
      } else {
        const cond = streamlangConditionToPainlessDoc(clause.condition);
        if (typeof clause.then === 'string') {
          stmts.push(
            `if (${varName} == null && (${cond})) { ${varName} = "${escapePainlessString(
              clause.then
            )}"; }`
          );
        } else {
          stmts.push(buildFieldMappingPainless(varName, cond, clause.then));
        }
      }
    }

    stmts.push(
      `if (${varName} == null && _src != null) { ${varName} = _src; } else if (${varName} == null) { ${varName} = ${toPainlessNullableStringLiteral(
        ev.fallbackValue
      )}; }`
    );

    parts.push(stmts.join(' '));
  }
  const preamble = parts.join(' ');
  return { preamble, evaluatedVars };
}
