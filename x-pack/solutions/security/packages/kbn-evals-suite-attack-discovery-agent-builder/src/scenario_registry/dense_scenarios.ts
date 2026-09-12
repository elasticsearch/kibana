/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AD2_CLEAN_SCENARIOS } from './clean_scenarios';
import type { Ad2ScenarioDefinition, Ad2ScenarioOs, Ad2ScenarioStep } from './types';

/**
 * Dense profile: a realistic-volume alert population.
 *
 * The four `clean` chains stay verbatim, so a dense run is a superset of a
 * clean run and the two remain comparable. On top of them this profile adds
 * background chains across many hosts, which is what turns "correlate 4 alerts"
 * into "pick the real chains out of a crowded index".
 *
 * Every alert here is synthetic and committed. That is the point: the volume is
 * reproducible by anyone checking out this commit, unlike a live alert index
 * whose contents depend on the day it was read.
 */

const step = (
  ruleName: string,
  severity: Ad2ScenarioStep['severity'],
  riskScore: number,
  message: string,
  processName: string | null,
  commandLine: string | null,
  eventType: Ad2ScenarioStep['eventType'],
  context: string | null
): Ad2ScenarioStep => ({
  ruleName,
  severity,
  riskScore,
  message,
  processName,
  commandLine,
  eventType,
  context,
});

interface BackgroundTemplate {
  readonly key: string;
  readonly title: string;
  readonly host: string;
  readonly os: Ad2ScenarioOs;
  readonly user: string;
  readonly steps: readonly Ad2ScenarioStep[];
}

/** Background chains: plausible, lower severity, and NOT part of the four target chains. */
const BACKGROUND_TEMPLATES: readonly BackgroundTemplate[] = [
  {
    key: 'bg-rdp-bruteforce',
    title: 'Repeated RDP authentication failures',
    host: 'srv-rdp-11',
    os: 'windows',
    user: 'svc.rdp',
    steps: [
      step(
        'Multiple Failed Logon Attempts',
        'medium',
        47,
        'Twelve failed RDP logons from a single source in five minutes',
        'svchost.exe',
        null,
        'network',
        '10.14.9.77'
      ),
      step(
        'Successful Logon After Repeated Failures',
        'medium',
        52,
        'A successful RDP logon followed the failure burst',
        'winlogon.exe',
        null,
        'network',
        '10.14.9.77'
      ),
    ],
  },
  {
    key: 'bg-admin-share',
    title: 'Administrative share enumeration',
    host: 'srv-files-02',
    os: 'windows',
    user: 'helpdesk.tom',
    steps: [
      step(
        'Administrative Share Enumeration',
        'low',
        33,
        'net view enumerated administrative shares',
        'net.exe',
        'net view \\\\srv-files-02',
        'process',
        null
      ),
    ],
  },
  {
    key: 'bg-proc-tooling',
    title: 'Diagnostic tooling staged but not executed',
    host: 'wks-dev-15',
    os: 'windows',
    user: 'dev.priya',
    steps: [
      step(
        'Known Diagnostic Tool Filename Written',
        'medium',
        58,
        'A diagnostic dump utility was written to a developer workstation',
        'explorer.exe',
        null,
        'file',
        'diagnostic-dump.exe'
      ),
    ],
  },
  {
    key: 'bg-linux-cron',
    title: 'Unscheduled cron modification',
    host: 'web-stage-03',
    os: 'linux',
    user: 'deploy',
    steps: [
      step(
        'Cron Entry Modified Outside Change Window',
        'low',
        29,
        'A crontab entry was added by the deploy user',
        'crontab',
        'crontab -l | { cat; echo "*/5 * * * * /opt/app/sync.sh"; } | crontab -',
        'file',
        '/var/spool/cron/crontabs/deploy'
      ),
    ],
  },
  {
    key: 'bg-dns-tunnel-suspect',
    title: 'High-entropy DNS queries',
    host: 'wks-sales-22',
    os: 'windows',
    user: 'sales.mo',
    steps: [
      step(
        'High Entropy DNS Query Volume',
        'medium',
        55,
        'Sustained high-entropy subdomain queries to a single zone',
        'chrome.exe',
        null,
        'network',
        'a7f3k2.metrics.example-cdn.net'
      ),
    ],
  },
  {
    key: 'bg-macos-launchagent',
    title: 'Unsigned LaunchAgent persistence',
    host: 'mbp-design-08',
    os: 'macos',
    user: 'design.ana',
    steps: [
      step(
        'Unsigned LaunchAgent Created',
        'medium',
        49,
        'An unsigned plist was written to a user LaunchAgents directory',
        'bash',
        'cp /tmp/updater.plist ~/LaunchAgents/com.example.updater.plist',
        'file',
        'com.example.updater.plist'
      ),
    ],
  },
];

/**
 * Target alert count for the dense profile.
 *
 * 95 is not arbitrary: it is the alert volume the EIS Attack Discovery trial
 * ran against, so a dense board is magnitude-comparable to that report. The
 * inputs are NOT the same alerts -- those came from a live index on one day and
 * were never captured -- so this profile reproduces the SCALE, not the data.
 * Any comparison must say so.
 */
export const AD2_DENSE_TARGET_ALERTS = 95;

/**
 * Expand background templates until the profile hits exactly
 * AD2_DENSE_TARGET_ALERTS, counting the clean chains that are already included.
 *
 * Each expansion targets a distinct host so alerts do not collapse onto one
 * entity and correlate trivially. A partial round is truncated at a template
 * boundary, never mid-chain: half a chain would be an incoherent alert set.
 */
const buildBackgroundScenarios = (): Record<string, Ad2ScenarioDefinition> => {
  const out: Record<string, Ad2ScenarioDefinition> = {};
  const cleanAlertCount = Object.values(AD2_CLEAN_SCENARIOS).reduce(
    (sum, scenario) => sum + scenario.steps.length,
    0
  );

  let budget = AD2_DENSE_TARGET_ALERTS - cleanAlertCount;
  let round = 0;

  while (budget > 0) {
    let placedThisRound = false;

    for (let templateIndex = 0; templateIndex < BACKGROUND_TEMPLATES.length; templateIndex++) {
      const template = BACKGROUND_TEMPLATES[templateIndex];

      // Truncate at a chain boundary rather than emitting a partial chain.
      if (template.steps.length <= budget) {
        const key = `${template.key}-${round + 1}`;
        out[key] = {
          key,
          title: `${template.title} (${round + 1})`,
          host: round === 0 ? template.host : `${template.host}-r${round + 1}`,
          os: template.os,
          user: template.user,
          // Spread across the window so they do not all share one timestamp.
          startHoursAgo: 1 + ((templateIndex * 7 + round) % 20),
          raw: false,
          steps: template.steps,
        };

        budget -= template.steps.length;
        placedThisRound = true;
      }

      if (budget === 0) {
        break;
      }
    }

    if (!placedThisRound) {
      // No remaining template is small enough to fit the residual budget.
      break;
    }

    round++;
  }

  return out;
};

export const AD2_DENSE_SCENARIOS: Record<string, Ad2ScenarioDefinition> = {
  ...AD2_CLEAN_SCENARIOS,
  ...buildBackgroundScenarios(),
};

export const AD2_DENSE_SCENARIO_KEYS = Object.keys(AD2_DENSE_SCENARIOS);
