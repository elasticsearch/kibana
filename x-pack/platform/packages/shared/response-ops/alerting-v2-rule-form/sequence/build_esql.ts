/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SequenceFormValues, SequenceStep } from './form_types';
import {
  formatLookbackString,
  getCommonGroupingFields,
  hopWindowToSeconds,
  totalLookbackSeconds,
} from './form_types';

const hasSignalRules = (state: SequenceFormValues): boolean =>
  state.steps.some((s) => s.rules.some((r) => r.kind === 'signal'));

export const RULE_EVENTS_INDEX = '.rule-events';
const GROUP_HASH_COL = 'group_hash';
const SEQUENCE_GROUP_COL = 'sequence_group';
const SEQUENCE_GROUP_VALUE = 'default';

const escapeRuleId = (id: string): string => id.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const isAndStep = (step: SequenceStep): step is SequenceStep & { operator: 'and' } =>
  step.operator === 'and' && step.rules.length > 1;

const effectiveColName = (stepIdx: number, step: SequenceStep): string =>
  isAndStep(step) ? `t_${stepIdx}_eff` : `t_${stepIdx}`;

const stepColNames = (stepIdx: number, step: SequenceStep): string[] => {
  if (isAndStep(step)) {
    return step.rules.map((_, j) => `t_${stepIdx}_${j}`);
  }
  return [`t_${stepIdx}`];
};

interface RecoveryTrackingPair {
  stepIdx: number;
  ruleIdx?: number;
  ruleId: string;
  ruleIds: string[];
  kind: 'alert' | 'signal';
  stalenessSeconds: number;
}

const ruleIdPredicate = (pair: RecoveryTrackingPair): string => {
  if (pair.ruleIds.length === 1) return `rule.id == "${pair.ruleIds[0]}"`;
  return `rule.id IN (${pair.ruleIds.map((id) => `"${id}"`).join(', ')})`;
};

const recoveryTrackingColSuffix = (pair: RecoveryTrackingPair): string =>
  pair.ruleIdx !== undefined ? `${pair.stepIdx}_${pair.ruleIdx}` : `${pair.stepIdx}`;

const resolveRecoveryTrackingPairs = (state: SequenceFormValues): RecoveryTrackingPair[] | null => {
  const recoveryIndices =
    state.recoveryStepIndices.length > 0
      ? [...state.recoveryStepIndices].sort((a, b) => a - b)
      : [state.steps.length - 1];

  const recoveryPairs: RecoveryTrackingPair[] = [];
  for (const si of recoveryIndices) {
    const step = state.steps[si];
    if (!step || step.rules.length === 0) return null;
    const hopIdx = si > 0 ? si - 1 : 0;
    const stalenessSeconds = hopWindowToSeconds(state.hopWindows[hopIdx]);

    if (isAndStep(step)) {
      for (let j = 0; j < step.rules.length; j++) {
        const escapedId = escapeRuleId(step.rules[j].ruleId);
        recoveryPairs.push({
          stepIdx: si,
          ruleIdx: j,
          ruleId: escapedId,
          ruleIds: [escapedId],
          kind: step.rules[j].kind,
          stalenessSeconds,
        });
      }
    } else {
      const allEscaped = step.rules.map((r) => escapeRuleId(r.ruleId));
      recoveryPairs.push({
        stepIdx: si,
        ruleId: allEscaped[0],
        ruleIds: allEscaped,
        kind: step.rules[0].kind,
        stalenessSeconds,
      });
    }
  }
  return recoveryPairs;
};

const pairRecoveredExpr = (pair: RecoveryTrackingPair): string => {
  const suffix = recoveryTrackingColSuffix(pair);
  if (pair.kind === 'signal') {
    return `(a_${suffix} IS NULL OR DATE_DIFF("seconds", a_${suffix}, NOW()) > ${pair.stalenessSeconds})`;
  }
  return `(r_${suffix} IS NOT NULL AND r_${suffix} == a_${suffix})`;
};

const recoveryTrackingPredicate = (pairs: RecoveryTrackingPair[]): string => {
  const byStep = new Map<number, RecoveryTrackingPair[]>();
  for (const p of pairs) {
    const group = byStep.get(p.stepIdx) ?? [];
    group.push(p);
    byStep.set(p.stepIdx, group);
  }

  const perStepConditions = [...byStep.values()].map((stepPairs) => {
    if (stepPairs.length === 1) return pairRecoveredExpr(stepPairs[0]);
    return `(${stepPairs.map(pairRecoveredExpr).join(' OR ')})`;
  });

  return perStepConditions.join(' AND ');
};

export const buildSequenceEsql = (state: SequenceFormValues): string => {
  if (state.steps.length < 2) return '';
  if (state.steps.some((s) => s.rules.length === 0)) return '';
  if (state.hopWindows.length !== state.steps.length - 1) return '';

  const lookback = totalLookbackSeconds(state);
  if (lookback <= 0) return '';

  const recoveryPairs = resolveRecoveryTrackingPairs(state);
  if (!recoveryPairs) return '';

  const allRuleIds = state.steps.flatMap((s) => s.rules.map((r) => `"${escapeRuleId(r.ruleId)}"`));
  const ruleIdList = [...new Set(allRuleIds)].join(', ');

  const isCorrelated = getCommonGroupingFields(state).length > 0;

  const lines: string[] = [];

  lines.push(`FROM ${RULE_EVENTS_INDEX}`);
  const typeFilter = hasSignalRules(state) ? 'type IN ("alert", "signal")' : 'type == "alert"';
  lines.push(`| WHERE ${typeFilter} AND rule.id IN (${ruleIdList})`);

  if (!isCorrelated) {
    lines.push(`| EVAL ${SEQUENCE_GROUP_COL} = "${SEQUENCE_GROUP_VALUE}"`);
  }

  const statsCols: string[] = [];
  for (let i = 0; i < state.steps.length; i++) {
    const step = state.steps[i];
    if (isAndStep(step)) {
      for (let j = 0; j < step.rules.length; j++) {
        const ruleId = escapeRuleId(step.rules[j].ruleId);
        const typeVal = step.rules[j].kind === 'signal' ? 'signal' : 'alert';
        statsCols.push(
          `t_${i}_${j} = VALUES(CASE(rule.id == "${ruleId}" AND type == "${typeVal}" AND status == "breached", @timestamp, NULL))`
        );
      }
    } else {
      let wrappedCond: string;
      if (step.rules.length === 1) {
        const r = step.rules[0];
        const typeVal = r.kind === 'signal' ? 'signal' : 'alert';
        wrappedCond = `rule.id == "${escapeRuleId(r.ruleId)}" AND type == "${typeVal}"`;
      } else {
        const ruleConds = step.rules.map((r) => {
          const typeVal = r.kind === 'signal' ? 'signal' : 'alert';
          return `(rule.id == "${escapeRuleId(r.ruleId)}" AND type == "${typeVal}")`;
        });
        wrappedCond = `(${ruleConds.join(' OR ')})`;
      }
      statsCols.push(
        `t_${i} = VALUES(CASE(${wrappedCond} AND status == "breached", @timestamp, NULL))`
      );
    }
  }

  for (const pair of recoveryPairs) {
    const suffix = recoveryTrackingColSuffix(pair);
    const idPred = ruleIdPredicate(pair);
    if (pair.kind !== 'signal') {
      statsCols.push(
        `r_${suffix} = MAX(CASE(${idPred} AND status == "recovered", @timestamp, NULL))`
      );
    }
    statsCols.push(`a_${suffix} = MAX(CASE(${idPred}, @timestamp, NULL))`);
  }

  const byCol = isCorrelated ? GROUP_HASH_COL : SEQUENCE_GROUP_COL;
  lines.push(`| STATS\n    ${statsCols.join(',\n    ')}\n    BY ${byCol}`);

  for (let i = 0; i < state.steps.length; i++) {
    for (const col of stepColNames(i, state.steps[i])) {
      lines.push(`| MV_EXPAND ${col}`);
    }
  }

  const notNullConds: string[] = [];
  for (let i = 0; i < state.steps.length; i++) {
    for (const col of stepColNames(i, state.steps[i])) {
      notNullConds.push(`${col} IS NOT NULL`);
    }
  }
  lines.push(`| WHERE ${notNullConds.join(' AND ')}`);

  for (let i = 0; i < state.steps.length; i++) {
    const step = state.steps[i];
    if (isAndStep(step)) {
      const cols = stepColNames(i, step);
      lines.push(`| EVAL ${effectiveColName(i, step)} = GREATEST(${cols.join(', ')})`);
    }
  }

  const hopChecks: string[] = [];
  for (let i = 1; i < state.steps.length; i++) {
    const prevEff = effectiveColName(i - 1, state.steps[i - 1]);
    const currEff = effectiveColName(i, state.steps[i]);
    const hopSecs = hopWindowToSeconds(state.hopWindows[i - 1]);
    hopChecks.push(
      `${currEff} > ${prevEff} AND DATE_DIFF("seconds", ${prevEff}, ${currEff}) <= ${hopSecs}`
    );
  }
  lines.push(`| WHERE ${hopChecks.join(' AND ')}`);

  lines.push(`| WHERE NOT (${recoveryTrackingPredicate(recoveryPairs)})`);

  const lastEff = effectiveColName(state.steps.length - 1, state.steps[state.steps.length - 1]);
  lines.push(`| STATS sequence_match_count = COUNT(*), first_breach = MIN(${lastEff}) BY ${byCol}`);

  return lines.join('\n');
};

const recoveryTypeFilter = (pairs: RecoveryTrackingPair[]): string => {
  const hasAlert = pairs.some((p) => p.kind !== 'signal');
  const hasSignal = pairs.some((p) => p.kind === 'signal');
  if (hasAlert && hasSignal) return 'type IN ("alert", "signal")';
  if (hasSignal) return 'type == "signal"';
  return 'type == "alert"';
};

export const buildSequenceRecoveryEsql = (state: SequenceFormValues): string => {
  if (state.steps.length < 2) return '';
  if (state.hopWindows.length !== state.steps.length - 1) return '';

  const recoveryPairs = resolveRecoveryTrackingPairs(state);
  if (!recoveryPairs) return '';

  const isCorrelated = getCommonGroupingFields(state).length > 0;

  if (recoveryPairs.length === 1) {
    const pair = recoveryPairs[0];
    const { kind, stalenessSeconds } = pair;
    const idFilter = ruleIdPredicate(pair);
    const singleTypeFilter = kind === 'signal' ? 'type == "signal"' : 'type == "alert"';

    if (kind === 'signal') {
      if (isCorrelated) {
        return [
          `FROM ${RULE_EVENTS_INDEX}`,
          `| WHERE ${singleTypeFilter} AND ${idFilter}`,
          '| STATS latest_breach = MAX(CASE(status == "breached", @timestamp, NULL))',
          `        BY ${GROUP_HASH_COL}`,
          `| WHERE DATE_DIFF("seconds", latest_breach, NOW()) > ${stalenessSeconds}`,
        ].join('\n');
      }

      return [
        `FROM ${RULE_EVENTS_INDEX}`,
        `| WHERE ${singleTypeFilter} AND ${idFilter}`,
        '| STATS latest_breach = MAX(CASE(status == "breached", @timestamp, NULL))',
        `| EVAL ${SEQUENCE_GROUP_COL} = "${SEQUENCE_GROUP_VALUE}"`,
        `| WHERE latest_breach IS NULL OR DATE_DIFF("seconds", latest_breach, NOW()) > ${stalenessSeconds}`,
      ].join('\n');
    }

    if (isCorrelated) {
      return [
        `FROM ${RULE_EVENTS_INDEX}`,
        `| WHERE ${singleTypeFilter} AND ${idFilter}`,
        '| STATS latest_recovered = MAX(CASE(status == "recovered", @timestamp, NULL)),',
        '        latest_any        = MAX(@timestamp)',
        `        BY ${GROUP_HASH_COL}`,
        '| WHERE latest_recovered == latest_any',
      ].join('\n');
    }

    return [
      `FROM ${RULE_EVENTS_INDEX}`,
      `| WHERE ${singleTypeFilter} AND ${idFilter}`,
      '| SORT @timestamp DESC',
      '| LIMIT 1',
      `| EVAL ${SEQUENCE_GROUP_COL} = "${SEQUENCE_GROUP_VALUE}"`,
      '| WHERE status == "recovered"',
    ].join('\n');
  }

  const allRuleIds = [
    ...new Set(recoveryPairs.flatMap((p) => p.ruleIds.map((id) => `"${id}"`))),
  ].join(', ');
  const typeFilter = recoveryTypeFilter(recoveryPairs);

  const statsLines = recoveryPairs.flatMap((pair, i) => {
    const suffix = recoveryTrackingColSuffix(pair);
    const idPred = ruleIdPredicate(pair);
    const comma = i < recoveryPairs.length - 1 ? ',' : '';
    if (pair.kind === 'signal') {
      return [`    a_${suffix} = MAX(CASE(${idPred}, @timestamp, NULL))${comma}`];
    }
    return [
      `    r_${suffix} = MAX(CASE(${idPred} AND status == "recovered", @timestamp, NULL)),`,
      `    a_${suffix} = MAX(CASE(${idPred}, @timestamp, NULL))${comma}`,
    ];
  });

  const whereConditions = recoveryTrackingPredicate(recoveryPairs);

  return [
    `FROM ${RULE_EVENTS_INDEX}`,
    `| WHERE ${typeFilter} AND rule.id IN (${allRuleIds})`,
    `| STATS`,
    ...statsLines,
    ...(isCorrelated
      ? [`    BY ${GROUP_HASH_COL}`]
      : [`| EVAL ${SEQUENCE_GROUP_COL} = "${SEQUENCE_GROUP_VALUE}"`]),
    `| WHERE ${whereConditions}`,
  ].join('\n');
};

export const buildSequenceRuleQueryData = (
  state: SequenceFormValues
): {
  breachQuery: string;
  recoveryQuery: string;
  groupingFields: string[];
  lookbackString: string;
} | null => {
  const breachQuery = buildSequenceEsql(state);
  if (!breachQuery) return null;

  const recoveryQuery = buildSequenceRecoveryEsql(state);
  const lookback = totalLookbackSeconds(state);
  const isCorrelated = getCommonGroupingFields(state).length > 0;
  const groupingFields = isCorrelated ? [GROUP_HASH_COL] : [SEQUENCE_GROUP_COL];

  return {
    breachQuery,
    recoveryQuery,
    groupingFields,
    lookbackString: formatLookbackString(lookback),
  };
};
