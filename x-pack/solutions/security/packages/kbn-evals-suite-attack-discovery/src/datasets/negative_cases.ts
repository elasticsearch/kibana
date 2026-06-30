/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttackDiscoveryDatasetExample, AnonymizedAlert } from '../types';

/**
 * Negative test cases for Attack Discovery: bundles of benign, low-signal, or
 * mutually-unrelated alerts that do NOT describe a coherent attack chain. The
 * model is expected to produce **no** attack discoveries from this context.
 *
 * These exercise two deterministic (no-LLM-judge) evaluators:
 *
 *  - `No Fabrication` — a correct response is `insights.length === 0`. Inventing
 *    an attack narrative from benign alerts is a fabrication and fails.
 *  - `Alert-ID Grounding` — if the model does emit insights anyway, every cited
 *    `alertIds[]` entry must be one of the `_id` values present in the input
 *    alerts. Hallucinated alert references fail.
 *
 * ### pageContent format
 *
 * Each alert's `pageContent` mirrors the line-based `key,value` shape produced by
 * `formatAsPageContent` in `src/clients/attack_discovery_client.ts`. The first
 * meaningful line is always `_id,<stable-id>` so the grounding evaluator can
 * recover the valid alert-ID set with a `/^_id,(.+)$/m` match.
 */

interface BenignAlertFields {
  id: string;
  timestamp: string;
  ruleName: string;
  severity: 'low' | 'medium';
  riskScore: number;
  eventCategory: string;
  hostName: string;
  userName?: string;
  sourceIp?: string;
  processName?: string;
  message: string;
}

/**
 * Builds a `pageContent` string in the same line format the suite feeds the model
 * for real alerts, guaranteeing a leading `_id,<id>` line for grounding.
 */
const buildAlert = (fields: BenignAlertFields): AnonymizedAlert => {
  const lines: string[] = [
    `@timestamp,${fields.timestamp}`,
    `_id,${fields.id}`,
    `kibana.alert.rule.name,${fields.ruleName}`,
    `kibana.alert.severity,${fields.severity}`,
    `kibana.alert.risk_score,${fields.riskScore}`,
    `event.category,${fields.eventCategory}`,
    `host.name,${fields.hostName}`,
  ];

  if (fields.userName) {
    lines.push(`user.name,${fields.userName}`);
  }
  if (fields.sourceIp) {
    lines.push(`source.ip,${fields.sourceIp}`);
  }
  if (fields.processName) {
    lines.push(`process.name,${fields.processName}`);
  }
  lines.push(`message,${fields.message}`);

  return { pageContent: lines.join('\n'), metadata: {} };
};

const negativeExample = (
  title: string,
  reason: string,
  alerts: AnonymizedAlert[],
  difficulty: 'medium' | 'hard' = 'medium'
): AttackDiscoveryDatasetExample => ({
  input: { mode: 'bundledAlerts', anonymizedAlerts: alerts },
  output: { attackDiscoveries: [] },
  metadata: { Title: title, testType: 'negative', difficulty, reason },
});

/**
 * Negative cases. Each describes benign context that must not yield an attack
 * discovery; `reason` documents why a discovery would be a false positive.
 */
export const negativeCases: AttackDiscoveryDatasetExample[] = [
  negativeExample(
    'Single expected admin login',
    'One low-severity, business-hours admin login on a single host is routine activity, not an attack chain.',
    [
      buildAlert({
        id: 'benign-admin-login-1',
        timestamp: '2025-01-01T14:02:00.000Z',
        ruleName: 'Administrator logon',
        severity: 'low',
        riskScore: 21,
        eventCategory: 'authentication',
        hostName: 'workstation-01',
        userName: 'svc_admin',
        sourceIp: '10.10.4.21',
        message: 'Successful interactive logon for svc_admin during business hours.',
      }),
    ]
  ),

  negativeExample(
    'Two unrelated low-severity alerts',
    'A noisy-neighbor network alert and an unrelated benign file-write on a different host share no entities or timeline.',
    [
      buildAlert({
        id: 'benign-network-noise-2a',
        timestamp: '2025-01-02T08:11:00.000Z',
        ruleName: 'Unusual network connection count',
        severity: 'low',
        riskScore: 18,
        eventCategory: 'network',
        hostName: 'app-server-07',
        sourceIp: '10.20.1.7',
        message: 'Connection count slightly above baseline for app-server-07.',
      }),
      buildAlert({
        id: 'benign-file-write-2b',
        timestamp: '2025-01-02T19:40:00.000Z',
        ruleName: 'File created in user directory',
        severity: 'low',
        riskScore: 15,
        eventCategory: 'file',
        hostName: 'laptop-finance-12',
        userName: 'a.morgan',
        processName: 'excel.exe',
        message: 'User a.morgan saved a spreadsheet to their Documents folder.',
      }),
    ]
  ),

  negativeExample(
    'Scheduled maintenance window',
    'A planned software-update job flagged by a generic rule is expected change-management activity.',
    [
      buildAlert({
        id: 'benign-maintenance-3',
        timestamp: '2025-01-03T02:30:00.000Z',
        ruleName: 'Software installation detected',
        severity: 'low',
        riskScore: 22,
        eventCategory: 'package',
        hostName: 'db-node-03',
        userName: 'root',
        processName: 'apt-get',
        message: 'Package upgrade performed by scheduled maintenance window 02:00-04:00 UTC.',
      }),
    ]
  ),

  negativeExample(
    'Authorized vulnerability scan',
    'A known internal scanner touching many hosts looks aggressive but is sanctioned, recurring activity with no follow-on compromise.',
    [
      buildAlert({
        id: 'benign-vuln-scan-4',
        timestamp: '2025-01-04T06:00:00.000Z',
        ruleName: 'Port scan detected',
        severity: 'medium',
        riskScore: 36,
        eventCategory: 'network',
        hostName: 'scanner-appliance-01',
        sourceIp: '10.30.0.5',
        message: 'Scheduled authenticated vulnerability scan from approved scanner 10.30.0.5.',
      }),
    ]
  ),

  negativeExample(
    'Single benign DNS lookup',
    'One DNS query to a well-known software-update domain is not malicious and cannot form an attack narrative on its own.',
    [
      buildAlert({
        id: 'benign-dns-5',
        timestamp: '2025-01-05T11:15:00.000Z',
        ruleName: 'DNS query to monitored domain',
        severity: 'low',
        riskScore: 12,
        eventCategory: 'network',
        hostName: 'workstation-44',
        userName: 'j.patel',
        message: 'DNS resolution for updates.example-vendor.com (known software update endpoint).',
      }),
    ]
  ),

  // ---------------------------------------------------------------------------
  // Near-miss cases: correlated, attack-shaped activity that is nonetheless
  // benign. These stress the model where it actually over-fires, so the
  // No-Fabrication metric can discriminate rather than sitting pinned at 1.0.
  // ---------------------------------------------------------------------------

  negativeExample(
    'Authorized penetration test',
    'Recon-and-access activity from a sanctioned pentest account during the agreed window looks like an intrusion but is authorized; the alerts share an entity yet describe approved testing.',
    [
      buildAlert({
        id: 'nearmiss-pentest-recon-6a',
        timestamp: '2025-02-10T22:05:00.000Z',
        ruleName: 'Network service scanning',
        severity: 'medium',
        riskScore: 47,
        eventCategory: 'network',
        hostName: 'dmz-web-02',
        userName: 'pentest_redteam',
        sourceIp: '10.50.9.9',
        message:
          'Port sweep from pentest_redteam (approved engagement ENG-2231, window 22:00-02:00 UTC).',
      }),
      buildAlert({
        id: 'nearmiss-pentest-cred-6b',
        timestamp: '2025-02-10T22:41:00.000Z',
        ruleName: 'Multiple authentication failures',
        severity: 'medium',
        riskScore: 52,
        eventCategory: 'authentication',
        hostName: 'dmz-web-02',
        userName: 'pentest_redteam',
        sourceIp: '10.50.9.9',
        message: 'Credential spraying attempts tagged to approved engagement ENG-2231.',
      }),
    ],
    'hard'
  ),

  negativeExample(
    'Forgotten password, then success',
    'A burst of failed logons followed by a success for the same user on their own workstation is routine password fat-fingering, not a brute-force compromise.',
    [
      buildAlert({
        id: 'nearmiss-failedlogins-7a',
        timestamp: '2025-02-11T09:01:00.000Z',
        ruleName: 'Multiple authentication failures',
        severity: 'medium',
        riskScore: 43,
        eventCategory: 'authentication',
        hostName: 'laptop-eng-30',
        userName: 'r.kim',
        sourceIp: '10.10.30.30',
        message: 'Five failed interactive logons for r.kim on their assigned laptop.',
      }),
      buildAlert({
        id: 'nearmiss-failedlogins-7b',
        timestamp: '2025-02-11T09:03:00.000Z',
        ruleName: 'Successful logon after failures',
        severity: 'low',
        riskScore: 20,
        eventCategory: 'authentication',
        hostName: 'laptop-eng-30',
        userName: 'r.kim',
        sourceIp: '10.10.30.30',
        message: 'Successful logon for r.kim from the same device after a password reset.',
      }),
    ],
    'hard'
  ),

  negativeExample(
    'Admin remote management during maintenance',
    'An IT admin running remote-management tooling across several servers during the maintenance window mimics lateral movement but is sanctioned change activity.',
    [
      buildAlert({
        id: 'nearmiss-admin-psexec-8a',
        timestamp: '2025-02-12T03:12:00.000Z',
        ruleName: 'Remote execution tool detected',
        severity: 'medium',
        riskScore: 49,
        eventCategory: 'process',
        hostName: 'app-server-11',
        userName: 'it_admin',
        processName: 'psexec.exe',
        message: 'Remote management session from it_admin during maintenance window MW-0212.',
      }),
      buildAlert({
        id: 'nearmiss-admin-psexec-8b',
        timestamp: '2025-02-12T03:18:00.000Z',
        ruleName: 'Remote execution tool detected',
        severity: 'medium',
        riskScore: 49,
        eventCategory: 'process',
        hostName: 'app-server-12',
        userName: 'it_admin',
        processName: 'psexec.exe',
        message: 'Remote management session from it_admin during maintenance window MW-0212.',
      }),
    ],
    'hard'
  ),
];
