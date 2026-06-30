/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolingLog } from '@kbn/tooling-log';
import type { RedTeamReport, Severity, AttackResult } from './types';
import { getOwaspCategory } from './taxonomy';
import { isAttackPass } from './pass_check';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

const severityMeetsThreshold = (severity: Severity, threshold: Severity): boolean => {
  return SEVERITY_ORDER.indexOf(severity) <= SEVERITY_ORDER.indexOf(threshold);
};

const pad = (str: string, len: number): string => str.padEnd(len);

const SEVERITY_ICONS: Record<Severity, string> = {
  critical: 'CRIT',
  high: 'HIGH',
  medium: 'MED ',
  low: 'LOW ',
};

const formatEvaluatorVerdict = (result: AttackResult): string => {
  if (result.namedScores.length === 0) return 'No evaluators ran';

  return result.namedScores
    .map((ns) => {
      const icon = ns.score === 1 ? 'pass' : ns.score === 0 ? 'FAIL' : `${ns.score}`;
      return `${ns.evaluator}: ${icon}`;
    })
    .join(' | ');
};

const truncate = (str: string, maxLen: number): string => {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 3) + '...';
};

export const formatRedTeamReport = (
  report: RedTeamReport,
  log: ToolingLog,
  severityThreshold: Severity = 'low'
): void => {
  log.info('');
  log.info('═'.repeat(76));
  log.info(`  RED TEAM REPORT — ${report.suite}`);
  log.info(`  Run: ${report.runId}`);
  log.info(
    `  Strategy: ${report.strategy} | Difficulty: ${report.difficulty} | Templates: ${
      report.templateOnly ? 'only' : 'mixed'
    }`
  );
  log.info('═'.repeat(76));
  log.info('');

  // Summary table
  const header = [
    pad('Module', 25),
    pad('Total', 7),
    pad('Pass', 7),
    pad('Fail', 7),
    pad('Crit', 7),
    pad('High', 7),
    pad('Med', 7),
    pad('Low', 5),
  ].join('');

  log.info(header);
  log.info('─'.repeat(header.length));

  let totalAll = 0;
  let passAll = 0;
  let failAll = 0;
  const totalBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const mod of report.modules) {
    const row = [
      pad(mod.module, 25),
      pad(String(mod.total), 7),
      pad(String(mod.passed), 7),
      pad(String(mod.failed), 7),
      pad(String(mod.bySeverity.critical || 0), 7),
      pad(String(mod.bySeverity.high || 0), 7),
      pad(String(mod.bySeverity.medium || 0), 7),
      pad(String(mod.bySeverity.low || 0), 5),
    ].join('');
    log.info(row);

    totalAll += mod.total;
    passAll += mod.passed;
    failAll += mod.failed;
    for (const sev of SEVERITY_ORDER) {
      totalBySeverity[sev] += mod.bySeverity[sev] || 0;
    }
  }

  log.info('─'.repeat(header.length));
  const totalsRow = [
    pad('TOTAL', 25),
    pad(String(totalAll), 7),
    pad(String(passAll), 7),
    pad(String(failAll), 7),
    pad(String(totalBySeverity.critical), 7),
    pad(String(totalBySeverity.high), 7),
    pad(String(totalBySeverity.medium), 7),
    pad(String(totalBySeverity.low), 5),
  ].join('');
  log.info(totalsRow);
  log.info('');
  log.info(`Overall pass rate: ${report.overallPassRate.toFixed(1)}%`);

  // Detailed findings — only failures, filtered by severity, deduplicated by input
  const seen = new Set<string>();
  const findings = report.modules.flatMap((mod) =>
    mod.results.filter((r) => {
      if (isAttackPass(r.namedScores, r.guardrailViolations)) return false;
      if (!severityMeetsThreshold(r.severity, severityThreshold)) return false;

      // Deduplicate by input prompt
      const inputKey =
        typeof r.example.input === 'string'
          ? r.example.input
          : typeof r.example.input === 'object' && r.example.input !== null
          ? String((r.example.input as Record<string, unknown>).prompt ?? '')
          : '';
      if (seen.has(inputKey)) return false;
      if (inputKey !== '') seen.add(inputKey);
      return true;
    })
  );

  if (findings.length === 0) {
    log.info('');
    log.info('No findings above severity threshold.');
    return;
  }

  log.info('');
  log.info('─'.repeat(76));
  log.info(`  FINDINGS (${findings.length} unique)  `);
  log.info('─'.repeat(76));

  for (let i = 0; i < findings.length; i++) {
    const result = findings[i];
    const owasp = getOwaspCategory(result.owaspCategory);
    const inputText =
      typeof result.example.input === 'object' && result.example.input !== null
        ? String(
            (result.example.input as Record<string, unknown>).prompt ??
              JSON.stringify(result.example.input)
          )
        : String(result.example.input);

    log.info('');
    log.info(
      `  [${SEVERITY_ICONS[result.severity]}] #${i + 1} — ${result.attackModule} (${owasp.id})`
    );
    log.info(`  Attack:   ${truncate(inputText, 100)}`);

    if (result.responseExcerpt) {
      log.info(`  Response: ${truncate(result.responseExcerpt, 100)}`);
    }

    // Evaluator verdicts — clear name: pass/FAIL format
    log.info(`  Verdict:  ${formatEvaluatorVerdict(result)}`);

    // Show judge reasoning if available
    const judgeScore = result.namedScores.find((ns) => ns.evaluator === 'attack-success-judge');
    if (judgeScore?.explanation) {
      log.info(`  Judge:    ${truncate(judgeScore.explanation, 120)}`);
    }

    // Guardrail violations
    if (result.guardrailViolations.length > 0) {
      const violations = result.guardrailViolations
        .map((v) => `${v.rule} [${v.action}]`)
        .join(', ');
      log.info(`  Rules:    ${violations}`);
    }
  }

  log.info('');
  log.info('═'.repeat(76));
};
