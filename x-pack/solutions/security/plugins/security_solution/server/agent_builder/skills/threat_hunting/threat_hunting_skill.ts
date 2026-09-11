/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

export const threatHuntingSkill = defineSkillType({
  id: 'threat-hunting',
  name: 'threat-hunting',
  basePath: 'skills/security',
  description:
    'Hypothesis-driven threat hunting using iterative ES|QL exploration. ' +
    'Covers IOC search, anomaly identification, baseline comparison, lateral movement tracking, ' +
    'and converting hunt findings into actionable intelligence. ' +
    'Use when investigating suspected threats, running proactive hunts, or analyzing suspicious activity patterns.',
  content: `# Threat Hunting Guide

## When to Use This Skill

Use this skill when:
- Running a proactive threat hunt based on a hypothesis or threat intelligence
- Investigating suspicious activity patterns across security data
- Searching for indicators of compromise (IOCs) — IPs, domains, file hashes, process names
- Identifying statistical anomalies or rare events in security telemetry
- Building baseline behavioral profiles for comparison

## Threat Hunting Process

### 1. Formulate Hypothesis
- Start with a specific, testable hypothesis tied to a MITRE ATT&CK technique or known threat actor TTPs
- Examples: "Attackers are using living-off-the-land binaries for lateral movement", "There is C2 beaconing to low-reputation domains"
- Define the expected data sources and time window (7-30 days for behavioral patterns)

### 2. Identify Data Sources
- Use 'platform.core.list_indices' to discover available security indices
- Common sources: logs-endpoint.events.process-*, logs-endpoint.events.network-*, filebeat-*, winlogbeat-*, packetbeat-*
- Use 'platform.core.get_index_mapping' to understand field availability before querying
- Prefer ECS field names for cross-source portability

### 3. Explore Data Iteratively
- Build every query with 'platform.core.generate_esql', then run it with 'platform.core.execute_esql'. This is required, not a shortcut to skip: 'generate_esql' validates syntax and resolves field names against the live mapping, so a hand-written query that looks correct can silently reference a field this deployment does not have. Do not hand-write ES|QL and pass it straight to 'platform.core.execute_esql'.
- This applies to the query templates below too. They are starting points for a hypothesis, not runnable answers — pass the pattern you want through 'platform.core.generate_esql' to bind it to the actual indices and fields in this environment before executing.
- Never report a finding from a query you did not execute. An unexecuted query is a hypothesis, not evidence.
- Always scope queries with @timestamp ranges: WHERE @timestamp >= NOW() - 7 DAYS
- Use STATS ... BY for aggregated views before drilling into raw events
- Chain WHERE clauses to iteratively narrow down — avoid overly complex single queries
- Use LIMIT even in aggregations to prevent excessive output

### 4. Identify Anomalies
- Use COUNT_DISTINCT to identify spread (e.g., how many hosts contacted a suspicious IP)
- Compare current activity against historical baselines
- Look for statistical outliers: rare process names, unusual network destinations, atypical authentication patterns
- Use percentile and standard deviation analysis for volumetric anomalies

### 5. Search for IOCs
- Query for known-bad indicators: IP addresses, domain names, file hashes, registry keys
- Use 'platform.core.search' for exact-match lookups across indices
- Cross-reference findings with threat intelligence sources
- Check for related activity on the same entities within a time window

### 6. Document Findings
- Record the hypothesis, data explored, queries used, and results
- Classify findings: confirmed threat, suspicious (needs more data), or benign
- For confirmed threats, create a case using 'platform.core.cases' to track the investigation
- Cross-reference the alert-analysis skill for triage of confirmed findings

## Query Templates

The following embedded query templates provide common hunting patterns (available as referenced content). They are hypothesis starting points, not runnable answers — rebuild the pattern through 'platform.core.generate_esql' so it binds to this deployment's indices and fields, then execute it:
- lateral-movement: Detect lateral movement via remote service creation and suspicious logon types
- c2-beaconing: Identify C2 beaconing through periodic network connection analysis
- brute-force: Detect brute force and credential spraying attempts
- rare-process-execution: Find statistically rare process executions on hosts

## Best Practices
- Always start with a time-bounded hypothesis — do not explore without direction
- Generate queries with 'platform.core.generate_esql' and execute them with 'platform.core.execute_esql'; report findings only from executed results
- Use STATS and aggregations before raw event queries to understand data volume
- Validate findings against known-good baselines before escalating
- Hunt on 7-30 day windows for behavioral patterns; use shorter windows for IOC sweeps
- Operationalize confirmed findings by converting hunt queries into detection rules
- Prefer ECS field names: process.name, process.executable, event.action, source.ip, destination.ip, user.name, host.name
- Document your hunting trail — future analysts need the context`,
  referencedContent: [
    {
      relativePath: './queries',
      name: 'lateral-movement',
      content: `# Lateral Movement Detection

## Remote Service Creation
\`\`\`esql
FROM logs-endpoint.events.process-*, winlogbeat-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE event.action IN ("start", "Process Create")
  AND process.name IN ("psexec.exe", "psexesvc.exe", "wmic.exe", "mstsc.exe", "schtasks.exe")
| STATS host_count = COUNT_DISTINCT(host.name), exec_count = COUNT(*) BY process.name, user.name
| WHERE host_count > 1
| SORT host_count DESC
| LIMIT 50
\`\`\`

## Suspicious Logon Types
\`\`\`esql
FROM winlogbeat-*, logs-system.security-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE event.code IN ("4624", "4625")
  AND winlog.event_data.LogonType IN ("3", "10")
| STATS attempt_count = COUNT(*), unique_sources = COUNT_DISTINCT(source.ip) BY user.name, host.name
| WHERE unique_sources > 3
| SORT unique_sources DESC
| LIMIT 50
\`\`\``,
    },
    {
      relativePath: './queries',
      name: 'c2-beaconing',
      content: `# C2 Beaconing Detection

## Periodic Connection Analysis
\`\`\`esql
FROM logs-endpoint.events.network-*, packetbeat-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE event.action == "connection_attempted"
  AND NOT CIDR_MATCH(destination.ip, "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
| STATS conn_count = COUNT(*), first_seen = MIN(@timestamp), last_seen = MAX(@timestamp) BY process.name, destination.ip, host.name
| WHERE conn_count > 50
| SORT conn_count DESC
| LIMIT 50
\`\`\`

## Low-Frequency DNS to Rare Domains
\`\`\`esql
FROM packetbeat-*, logs-endpoint.events.network-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE dns.question.name IS NOT NULL
| STATS query_count = COUNT(*), host_count = COUNT_DISTINCT(host.name) BY dns.question.name
| WHERE query_count < 5 AND host_count == 1
| SORT query_count ASC
| LIMIT 100
\`\`\``,
    },
    {
      relativePath: './queries',
      name: 'brute-force',
      content: `# Brute Force / Credential Spraying

## Failed Authentication Spike
\`\`\`esql
FROM winlogbeat-*, logs-system.security-*, filebeat-*
| WHERE @timestamp >= NOW() - 24 HOURS
| WHERE event.outcome == "failure" AND event.category == "authentication"
| STATS fail_count = COUNT(*), target_count = COUNT_DISTINCT(user.name) BY source.ip
| WHERE fail_count > 10
| SORT fail_count DESC
| LIMIT 50
\`\`\`

## Credential Spraying (Many Users, Few Attempts Each)
\`\`\`esql
FROM winlogbeat-*, logs-system.security-*
| WHERE @timestamp >= NOW() - 24 HOURS
| WHERE event.outcome == "failure" AND event.category == "authentication"
| STATS fail_count = COUNT(*), user_count = COUNT_DISTINCT(user.name) BY source.ip
| WHERE user_count > 5 AND fail_count / user_count < 3
| SORT user_count DESC
| LIMIT 50
\`\`\``,
    },
    {
      relativePath: './queries',
      name: 'rare-process-execution',
      content: `# Rare Process Execution

## Statistically Rare Processes
\`\`\`esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE event.action == "start"
| STATS host_count = COUNT_DISTINCT(host.name), exec_count = COUNT(*) BY process.executable
| WHERE host_count == 1 AND exec_count < 3
| SORT exec_count ASC
| LIMIT 100
\`\`\`

## Processes Running from Unusual Directories
\`\`\`esql
FROM logs-endpoint.events.process-*
| WHERE @timestamp >= NOW() - 7 DAYS
| WHERE event.action == "start"
  AND NOT STARTS_WITH(process.executable, "C:\\\\Windows\\\\")
  AND NOT STARTS_WITH(process.executable, "C:\\\\Program Files")
  AND NOT STARTS_WITH(process.executable, "/usr/")
  AND NOT STARTS_WITH(process.executable, "/bin/")
| STATS exec_count = COUNT(*), host_count = COUNT_DISTINCT(host.name) BY process.executable, process.name
| WHERE host_count == 1
| SORT exec_count ASC
| LIMIT 100
\`\`\``,
    },
  ],
  getRegistryTools: () => [
    platformCoreTools.generateEsql,
    platformCoreTools.executeEsql,
    platformCoreTools.search,
    platformCoreTools.listIndices,
    platformCoreTools.getIndexMapping,
    platformCoreTools.cases,
  ],
});
