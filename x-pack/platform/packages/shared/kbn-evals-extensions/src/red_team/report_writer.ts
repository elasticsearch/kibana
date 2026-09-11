/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { mkdirSync, writeFileSync } from 'fs';
import Path from 'path';
import type { ToolingLog } from '@kbn/tooling-log';
import type { RedTeamReport, AttackResult, NamedScore } from './types';
import { getOwaspCategory } from './taxonomy';
import { isAttackPass } from './pass_check';

interface SerializedResult {
  index: number;
  module: string;
  owaspCategory: string;
  owaspName: string;
  severity: string;
  passed: boolean;
  attack: string;
  intent: string;
  response: string;
  evaluators: Record<
    string,
    { score: number | null | undefined; label: string | null | undefined; reasoning?: string }
  >;
  guardrailViolations: Array<{ rule: string; action: string; severity: string }>;
}

interface SerializedReport {
  runId: string;
  suite: string;
  timestamp: string;
  config: {
    strategy: string;
    difficulty: string;
    templateOnly: boolean;
  };
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    bySeverity: Record<string, number>;
  };
  results: SerializedResult[];
}

const extractAttackText = (result: AttackResult): string => {
  if (typeof result.example.input === 'object' && result.example.input !== null) {
    return String((result.example.input as Record<string, unknown>).prompt ?? '');
  }
  return String(result.example.input ?? '');
};

const extractIntent = (result: AttackResult): string => {
  if (typeof result.example.output === 'object' && result.example.output !== null) {
    return String((result.example.output as Record<string, unknown>).intent ?? '');
  }
  return '';
};

const serializeEvaluators = (namedScores: NamedScore[]): SerializedResult['evaluators'] => {
  const evaluators: SerializedResult['evaluators'] = {};
  for (const ns of namedScores) {
    evaluators[ns.evaluator] = {
      score: ns.score,
      label: ns.label,
      ...(ns.explanation ? { reasoning: ns.explanation } : {}),
    };
  }
  return evaluators;
};

const serializeResult = (result: AttackResult, index: number): SerializedResult => {
  const owasp = getOwaspCategory(result.owaspCategory);
  const passed = isAttackPass(result.namedScores, result.guardrailViolations);

  return {
    index,
    module: result.attackModule,
    owaspCategory: owasp.id,
    owaspName: owasp.name,
    severity: result.severity,
    passed,
    attack: extractAttackText(result),
    intent: extractIntent(result),
    response: result.responseExcerpt,
    evaluators: serializeEvaluators(result.namedScores),
    guardrailViolations: result.guardrailViolations.map((v) => ({
      rule: v.rule,
      action: v.action,
      severity: v.severity,
    })),
  };
};

export const writeRedTeamReport = (
  report: RedTeamReport,
  log: ToolingLog,
  outputDir?: string
): string => {
  const repoRoot = process.cwd();
  const dir = outputDir ?? Path.resolve(repoRoot, 'red-team-reports');

  mkdirSync(dir, { recursive: true });

  const timestamp = new Date().toISOString();
  const safeTimestamp = timestamp.replace(/[:.]/g, '-');
  const filename = `red-team-${report.suite}-${safeTimestamp}.json`;
  const filepath = Path.resolve(dir, filename);

  let totalAll = 0;
  let passAll = 0;
  let failAll = 0;
  const bySeverity: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  const allResults: SerializedResult[] = [];
  let resultIndex = 0;

  for (const mod of report.modules) {
    totalAll += mod.total;
    passAll += mod.passed;
    failAll += mod.failed;
    for (const [sev, count] of Object.entries(mod.bySeverity)) {
      bySeverity[sev] = (bySeverity[sev] ?? 0) + count;
    }

    for (const result of mod.results) {
      allResults.push(serializeResult(result, resultIndex++));
    }
  }

  const serialized: SerializedReport = {
    runId: report.runId,
    suite: report.suite,
    timestamp,
    config: {
      strategy: report.strategy,
      difficulty: report.difficulty,
      templateOnly: report.templateOnly,
    },
    summary: {
      total: totalAll,
      passed: passAll,
      failed: failAll,
      passRate: report.overallPassRate,
      bySeverity,
    },
    results: allResults,
  };

  writeFileSync(filepath, JSON.stringify(serialized, null, 2), 'utf-8');
  log.info(`Full report written to: ${filepath}`);

  return filepath;
};
