/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';

export const AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID = 'autonomous-forensic-investigator';

/**
 * Autonomous Forensic Investigator (#17746)
 *
 * Second layer on top of the chat-first endpoint forensic analysis skill (#17509).
 * Instead of answering individual questions, this skill takes a high-level request
 * ("investigate this alert", "find patient zero") and autonomously plans and executes
 * a full investigation: plan presentation, phased execution with pivot logic,
 * interim summaries, cross-endpoint expansion, and a structured final report.
 */
export const autonomousForensicInvestigatorSkill = defineSkillType({
  id: AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID,
  name: AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID,
  basePath: 'skills/security/endpoint',
  description:
    'Autonomous forensic investigator that takes a high-level request (e.g. "investigate this alert", ' +
    '"find patient zero") and runs a multi-phase investigation end-to-end: plan, execute, pivot, report. ' +
    'Use when the analyst wants the AI to drive the investigation rather than answering individual questions. ' +
    'For single-question forensic Q&A, use endpoint-forensic-analysis instead.',
  content: `# Autonomous Forensic Investigator

## When to Use

Load when the analyst gives a **broad investigative request** and wants the AI to take ownership of the full investigation:
- "Investigate this alert" / "Run a root cause analysis"
- "Find patient zero for this outbreak"
- "Check if this host has been compromised"
- "Investigate lateral movement from host X"

Do **not** load for:
- Single forensic questions (patient zero, timeline, persistence on a known host) → endpoint-forensic-analysis
- Fleet-wide proactive hunts → threat-hunting
- Alert triage from alert id only → alert-analysis
- Host isolation / kill process / file retrieve → direct analyst to Endpoint response actions

## Scope (read-only)

This skill MUST NOT invoke response actions. It is a read-only investigative skill.

## Investigation Process

When given a broad request, execute the following phases in order. After each phase, surface interim findings before proceeding to the next.

### Phase 1: Scope and Plan

1. Call \`${platformCoreTools.listIndices}\` with pattern \`logs-endpoint.events.*\` to confirm available Defend telemetry.
2. Map the request to investigation phases. Present the plan to the analyst:
   - What you will check
   - Which hosts and time windows are in scope
   - What the expected output of each phase is
3. The analyst may adjust the plan before execution proceeds.

### Phase 2: Initial Reconnaissance

1. Call \`${platformCoreTools.getIndexMapping}\` on the available endpoint indices if field names are uncertain.
2. Use \`platform.core.generate_esql\` then \`platform.core.execute_esql\` to query for:
   - Process events on the named host(s) in the time window, sorted by @timestamp ASC
   - Network events (outbound connections) from the host(s)
   - File events (modifications, creations) on the host(s)
3. Identify the earliest suspicious activity — this becomes the anchor for Phase 3.

### Phase 3: Patient Zero and Attack Vector

1. Query process and network indices ordered by @timestamp ASC to find the earliest indicator.
2. Identify the delivery vector hypothesis (email link, drive-by, lateral inbound, supply chain).
3. **Pivot**: If an unsigned/suspicious process is found, automatically trigger persistence and defense evasion checks for that binary in Phase 4 — do not wait for the analyst to ask.

### Phase 4: Persistence and Defense Evasion

1. Enumerate registry run keys, scheduled tasks, services, and startup items from telemetry indices.
2. Check for defense evasion: process injection, credential dumping, log clearing, AV disabling.
3. **Pivot**: If persistence mechanisms are found on the initial host, proactively check peer endpoints (Phase 5) for the same indicators.

### Phase 5: Lateral Movement and Cross-Endpoint Expansion

1. Trace outbound internal connections from the source host.
2. Correlate with process creation on destination hosts.
3. **Proactively** check peer endpoints that have NOT triggered alerts — query for the same indicators (same binary hash, same registry keys, same network destinations) on other enrolled hosts.
4. Identify the blast radius: how many hosts are affected.

### Phase 6: Structured Final Report

Produce a structured forensic report with the following sections:
1. **Executive Summary** — one paragraph: what happened, when, scope, severity
2. **Attack Vector** — how the attacker gained initial access
3. **Patient Zero** — earliest host, timestamp, indicator, delivery vector
4. **Attack Timeline** — chronological sequence of events (timestamped, scoped to affected hosts)
5. **Persistence Mechanisms** — what was installed to maintain access
6. **Lateral Movement** — how and where the attacker spread
7. **Blast Radius** — list of affected hosts and their compromise status
8. **Recommended Next Steps** — containment, eradication, and recovery actions

## Tool Selection Guardrails

- Call \`${platformCoreTools.listIndices}\` at the start of each investigation to confirm telemetry availability.
- **Always** use \`platform.core.generate_esql\` and \`platform.core.execute_esql\` for forensic queries.
- Do **not** use \`platform.core.search\` or \`relevance_search\` for reconstruction.
- Use \`platform.core.get_index_mapping\` only when field names are uncertain before generating ES|QL.
- All findings must be supported by query results. If telemetry is sparse, state the data gap explicitly.

## Interim Summaries

After each phase, present:
- What was checked
- What was found (with query citations)
- What the next phase will investigate
- Any pivots triggered by findings

The analyst is not blocked — they can steer, skip phases, or request targeted follow-ups at any point.
`,
  getRegistryTools: () => [
    platformCoreTools.listIndices,
    platformCoreTools.getIndexMapping,
    platformCoreTools.generateEsql,
    platformCoreTools.executeEsql,
  ],
});
