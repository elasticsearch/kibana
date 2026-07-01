/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Client } from '@elastic/elasticsearch';
import type { KbnClient } from '@kbn/test';
import type { ToolingLog } from '@kbn/tooling-log';

const DETECTION_RULES_URL = '/api/detection_engine/rules';
const DETECTION_RULES_BULK_ACTION_URL = '/api/detection_engine/rules/_bulk_action';
const ALERTS_INDEX = '.internal.alerts-security.alerts-default-000001';

/**
 * Deliberately-shaped noisy rules, one per diagnostic branch the skill must
 * distinguish. Each alert population has ONE correct read so the LLM judge (against a
 * faithful gold) can grade it:
 *
 *  A. benign-concentration  -> 32/40 alerts from ONE host, all closed `benign_positive`
 *                              => analyst-confirmed benign activity from a known host
 *                              => recommend an EXCEPTION for that host. The dominant alerts
 *                              also share a consistent user + process + parent, so the
 *                              exception proposal can cluster on multiple consistent fields.
 *  B. false-positive        -> 36/40 alerts closed `false_positive`, spread across MANY
 *                              hosts (no single entity) => analyst-confirmed FPs
 *                              => LEAD with exceptions for the confirmed patterns; because
 *                              they are spread, a query change is a reasonable OPTION too
 *                              (not the mandated primary action).
 *  C. open-diffuse          -> 40 open, undispositioned alerts across ~10 hosts, no
 *                              `workflow_reason` => loud but unproven; no dominant entity
 *                              => do NOT assert a verdict; defer to alert-analysis / review.
 *  E. concentrated-open     -> 30/34 OPEN, undispositioned alerts from ONE user (svc-ci)
 *                              spread across hosts, no `workflow_reason` => concentrated but
 *                              UNCONFIRMED => recommend alert SUPPRESSION on the user (not a
 *                              permanent exception), and/or defer to alert-analysis. This is
 *                              the case an exception must NOT be auto-recommended for.
 */

const RULE_A_NAME = 'Suspicious PowerShell Execution on Endpoints';
const RULE_B_NAME = 'Unusual Parent Process for cmd.exe';
const RULE_C_NAME = 'Outbound RDP to External Host';
const RULE_E_NAME = 'Scripted Process Launch by Account';
const ALL_RULE_NAMES = [RULE_A_NAME, RULE_B_NAME, RULE_C_NAME, RULE_E_NAME];

// Scenario A — dominant alerts share a consistent user + process + parent so the
// exception proposal can cluster on more than just host.name.
const A_DOMINANT_HOST = 'build-agent-03';
const A_DOMINANT_COUNT = 32;
const A_DOMINANT_USER = 'svc-build';
const A_DOMINANT_PROCESS = 'powershell.exe';
const A_DOMINANT_PARENT = 'gitlab-runner';
const A_OTHER_HOSTS = ['web-01', 'db-02', 'app-03', 'mail-04']; // 2 each = 8 open -> 40 total

// Scenario B
const B_FP_HOSTS = Array.from({ length: 12 }, (_, i) => `ws-${String(i + 1).padStart(2, '0')}`); // 3 each = 36 closed FP
const B_FP_PER_HOST = 3;
const B_OPEN_HOSTS = ['ws-13', 'ws-14']; // 2 each = 4 open -> 40 total

// Scenario C
const C_HOSTS = Array.from({ length: 10 }, (_, i) => `host-${String(i + 1).padStart(2, '0')}`); // 4 each = 40 open

// Scenario E — one dominant USER, all open, no disposition (concentrated but unconfirmed).
const E_DOMINANT_USER = 'svc-ci';
const E_DOMINANT_COUNT = 30; // 30 open alerts for svc-ci, spread across 6 hosts (5 each)
const E_DOMINANT_HOSTS = Array.from(
  { length: 6 },
  (_, i) => `node-${String(i + 1).padStart(2, '0')}`
);
const E_OTHER_USERS = ['alice', 'bob']; // 2 each = 4 open -> 34 total

interface CreatedRule {
  id: string;
  ruleId: string;
  name: string;
}

export interface SeededScenario {
  rule: CreatedRule;
  totalAlerts: number;
}

export interface InvestigateRuleFixtures {
  benignConcentration: SeededScenario & {
    dominantHost: string;
    dominantCount: number;
    dominantUser: string;
    dominantProcess: string;
    dominantParent: string;
  };
  falsePositive: SeededScenario & { fpCount: number };
  openDiffuse: SeededScenario & { hostCount: number };
  concentratedOpen: SeededScenario & { dominantUser: string; dominantCount: number };
  cleanup: () => Promise<void>;
}

interface ThreatSpec {
  tacticId: string;
  tacticName: string;
  techniqueId: string;
  techniqueName: string;
}

function buildRuleBody({
  name,
  description,
  query,
  threat,
  investigationFields,
}: {
  name: string;
  description: string;
  query: string;
  threat: ThreatSpec;
  investigationFields?: string[];
}): Record<string, unknown> {
  return {
    name,
    description,
    tags: ['MITRE', 'Domain: Endpoint'],
    risk_score: 47,
    severity: 'medium',
    interval: '5m',
    from: 'now-6m',
    enabled: true,
    author: [],
    false_positives: [],
    references: [],
    actions: [],
    throttle: 'no_actions',
    ...(investigationFields ? { investigation_fields: { field_names: investigationFields } } : {}),
    threat: [
      {
        framework: 'MITRE ATT&CK',
        tactic: {
          id: threat.tacticId,
          name: threat.tacticName,
          reference: `https://attack.mitre.org/tactics/${threat.tacticId}/`,
        },
        technique: [
          {
            id: threat.techniqueId,
            name: threat.techniqueName,
            reference: `https://attack.mitre.org/techniques/${threat.techniqueId}/`,
          },
        ],
      },
    ],
    type: 'query',
    language: 'kuery',
    query,
    index: ['logs-endpoint.events.*'],
  };
}

let globalSeq = 0;

function buildAlertDoc({
  rule,
  host,
  status,
  reason,
  user,
  processName,
  parentProcessName,
}: {
  rule: CreatedRule;
  host: string;
  status: 'open' | 'closed';
  reason?: string;
  user?: string;
  processName?: string;
  parentProcessName?: string;
}): Record<string, unknown> {
  // Spread alerts over the last few hours so they fall inside any reasonable
  // (24h+) lookback window the skill chooses.
  const timestamp = new Date(Date.now() - globalSeq++ * 5 * 60_000).toISOString();
  return {
    '@timestamp': timestamp,
    'kibana.alert.rule.uuid': rule.id,
    'kibana.alert.rule.rule_id': rule.ruleId,
    'kibana.alert.rule.name': rule.name,
    'kibana.alert.rule.consumer': 'siem',
    'kibana.alert.rule.producer': 'siem',
    'kibana.alert.severity': 'medium',
    'kibana.alert.risk_score': 47,
    'kibana.alert.status': 'active',
    'kibana.alert.workflow_status': status,
    ...(reason ? { 'kibana.alert.workflow_reason': reason } : {}),
    'host.name': host,
    ...(user ? { 'user.name': user } : {}),
    ...(processName ? { 'process.name': processName } : {}),
    ...(parentProcessName ? { 'process.parent.name': parentProcessName } : {}),
    'kibana.space_ids': ['default'],
    'event.kind': 'signal',
    'event.action': 'rule-execution',
  };
}

async function createRule(
  kbnClient: KbnClient,
  body: Record<string, unknown>
): Promise<CreatedRule> {
  const response = await kbnClient.request<{ id: string; name: string; rule_id: string }>({
    path: DETECTION_RULES_URL,
    method: 'POST',
    body,
  });
  return { id: response.data.id, ruleId: response.data.rule_id, name: response.data.name };
}

export async function seedInvestigateRuleFixtures({
  kbnClient,
  esClient,
  log,
}: {
  kbnClient: KbnClient;
  esClient: Client;
  log: ToolingLog;
}): Promise<InvestigateRuleFixtures> {
  globalSeq = 0;

  // Delete leftover fixtures from crashed runs without touching unrelated rules.
  try {
    const existing = await kbnClient.request<{ data: Array<{ id: string; name: string }> }>({
      path: `${DETECTION_RULES_URL}/_find?per_page=1000`,
      method: 'GET',
    });
    const existingIds = existing.data.data
      .filter((rule) => ALL_RULE_NAMES.includes(rule.name))
      .map((rule) => rule.id);
    if (existingIds.length > 0) {
      log.info(
        `[investigate-rule eval] Removing ${existingIds.length} leftover fixture rule(s)...`
      );
      await kbnClient.request({
        path: DETECTION_RULES_BULK_ACTION_URL,
        method: 'POST',
        body: { action: 'delete', ids: existingIds },
      });
    }
  } catch (err) {
    log.warning(`[investigate-rule eval] Pre-seed cleanup failed: ${err.message}`);
  }

  try {
    await esClient.deleteByQuery({
      index: ALERTS_INDEX,
      query: { terms: { 'kibana.alert.rule.name': ALL_RULE_NAMES } },
      refresh: true,
      conflicts: 'proceed',
    });
  } catch (err) {
    log.warning(`[investigate-rule eval] Pre-seed alert cleanup failed: ${err.message}`);
  }

  log.info('[investigate-rule eval] Seeding 4 scenario rules...');

  const ruleA = await createRule(
    kbnClient,
    buildRuleBody({
      name: RULE_A_NAME,
      description: 'Detects powershell.exe execution on endpoint hosts.',
      query: 'process.name:"powershell.exe"',
      threat: {
        tacticId: 'TA0002',
        tacticName: 'Execution',
        techniqueId: 'T1059',
        techniqueName: 'Command and Scripting Interpreter',
      },
      // The rule author designates parent process + user as investigation fields, so the
      // skill should surface them as the strongest exception candidates.
      investigationFields: ['process.parent.name', 'user.name'],
    })
  );
  const ruleB = await createRule(
    kbnClient,
    buildRuleBody({
      name: RULE_B_NAME,
      description: 'Detects cmd.exe spawned by an unusual parent process.',
      query: 'process.name:"cmd.exe"',
      threat: {
        tacticId: 'TA0002',
        tacticName: 'Execution',
        techniqueId: 'T1059',
        techniqueName: 'Command and Scripting Interpreter',
      },
    })
  );
  const ruleC = await createRule(
    kbnClient,
    buildRuleBody({
      name: RULE_C_NAME,
      description: 'Detects outbound RDP connections to external destinations.',
      query: 'event.category:"network" and destination.port:3389 and network.direction:"outbound"',
      threat: {
        tacticId: 'TA0008',
        tacticName: 'Lateral Movement',
        techniqueId: 'T1021',
        techniqueName: 'Remote Services',
      },
    })
  );
  const ruleE = await createRule(
    kbnClient,
    buildRuleBody({
      name: RULE_E_NAME,
      description: 'Detects scripted process launches by user accounts.',
      query: 'process.name:"powershell.exe" or process.name:"python.exe"',
      threat: {
        tacticId: 'TA0002',
        tacticName: 'Execution',
        techniqueId: 'T1059',
        techniqueName: 'Command and Scripting Interpreter',
      },
    })
  );

  const alerts: Array<Record<string, unknown>> = [];

  // A: 32 on dominant host (closed benign_positive) + 8 spread/open. The dominant alerts
  // share a consistent user + process + parent so the exception proposal can cluster on
  // multiple consistent fields, not just host.name.
  for (let i = 0; i < A_DOMINANT_COUNT; i++) {
    alerts.push(
      buildAlertDoc({
        rule: ruleA,
        host: A_DOMINANT_HOST,
        status: 'closed',
        reason: 'benign_positive',
        user: A_DOMINANT_USER,
        processName: A_DOMINANT_PROCESS,
        parentProcessName: A_DOMINANT_PARENT,
      })
    );
  }
  for (const host of A_OTHER_HOSTS) {
    for (let i = 0; i < 2; i++) alerts.push(buildAlertDoc({ rule: ruleA, host, status: 'open' }));
  }

  // B: 36 closed false_positive spread across 12 hosts + 4 open (no single dominant host)
  for (const host of B_FP_HOSTS) {
    for (let i = 0; i < B_FP_PER_HOST; i++) {
      alerts.push(buildAlertDoc({ rule: ruleB, host, status: 'closed', reason: 'false_positive' }));
    }
  }
  for (const host of B_OPEN_HOSTS) {
    for (let i = 0; i < 2; i++) alerts.push(buildAlertDoc({ rule: ruleB, host, status: 'open' }));
  }

  // C: 40 open, undispositioned, spread across 10 hosts (no reason, no concentration).
  // A well-formed rule (no obvious definition defect) so the only honest read is
  // "undispositioned + diffuse => can't conclude FP, defer to alert-analysis / review".
  for (const host of C_HOSTS) {
    for (let i = 0; i < 4; i++) alerts.push(buildAlertDoc({ rule: ruleC, host, status: 'open' }));
  }

  // E: 30 OPEN, undispositioned alerts concentrated on ONE user (svc-ci) across 6 hosts,
  // + 4 open from other users. No `workflow_reason` anywhere => concentrated but UNCONFIRMED.
  // Correct read: suppression on the user (NOT a permanent exception), and/or alert-analysis.
  for (const host of E_DOMINANT_HOSTS) {
    for (let i = 0; i < E_DOMINANT_COUNT / E_DOMINANT_HOSTS.length; i++) {
      alerts.push(buildAlertDoc({ rule: ruleE, host, status: 'open', user: E_DOMINANT_USER }));
    }
  }
  for (const user of E_OTHER_USERS) {
    for (let i = 0; i < 2; i++) {
      alerts.push(buildAlertDoc({ rule: ruleE, host: 'node-07', status: 'open', user }));
    }
  }

  await esClient.bulk({
    index: ALERTS_INDEX,
    refresh: 'wait_for',
    operations: alerts.flatMap((doc) => [{ create: {} }, doc]),
  });

  log.info(
    `[investigate-rule eval] Seeded: A(${ruleA.id}) benign-concentration, ` +
      `B(${ruleB.id}) false-positive, C(${ruleC.id}) open-diffuse, ` +
      `E(${ruleE.id}) concentrated-open — ${alerts.length} alerts total`
  );

  const ruleIds = [ruleA.id, ruleB.id, ruleC.id, ruleE.id];
  const cleanup = async () => {
    log.info('[investigate-rule eval] Cleaning up seeded rules and alerts (scoped)...');
    try {
      await kbnClient.request({
        path: DETECTION_RULES_BULK_ACTION_URL,
        method: 'POST',
        body: { action: 'delete', ids: ruleIds },
      });
    } catch (err) {
      log.warning(`[investigate-rule eval] Rule scoped delete failed: ${err.message}`);
    }
    try {
      await esClient.deleteByQuery({
        index: ALERTS_INDEX,
        query: { terms: { 'kibana.alert.rule.uuid': ruleIds } },
        refresh: true,
        conflicts: 'proceed',
      });
    } catch (err) {
      log.warning(`[investigate-rule eval] Alert scoped delete failed: ${err.message}`);
    }
    log.info('[investigate-rule eval] Cleanup complete');
  };

  return {
    benignConcentration: {
      rule: ruleA,
      dominantHost: A_DOMINANT_HOST,
      dominantCount: A_DOMINANT_COUNT,
      dominantUser: A_DOMINANT_USER,
      dominantProcess: A_DOMINANT_PROCESS,
      dominantParent: A_DOMINANT_PARENT,
      totalAlerts: A_DOMINANT_COUNT + A_OTHER_HOSTS.length * 2,
    },
    falsePositive: {
      rule: ruleB,
      fpCount: B_FP_HOSTS.length * B_FP_PER_HOST,
      totalAlerts: B_FP_HOSTS.length * B_FP_PER_HOST + B_OPEN_HOSTS.length * 2,
    },
    openDiffuse: {
      rule: ruleC,
      hostCount: C_HOSTS.length,
      totalAlerts: C_HOSTS.length * 4,
    },
    concentratedOpen: {
      rule: ruleE,
      dominantUser: E_DOMINANT_USER,
      dominantCount: E_DOMINANT_COUNT,
      totalAlerts: E_DOMINANT_COUNT + E_OTHER_USERS.length * 2,
    },
    cleanup,
  };
}
