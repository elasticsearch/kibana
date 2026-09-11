/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';

/**
 * Seeds two real, registered Agent Builder tools (`virustotal_lookup` and
 * `on_call_lookup`) via the public tools API (POST /api/agent_builder/tools)
 * so the workflow-execution persona-matrix examples can score genuine
 * tool-selection: did the agent choose and invoke the right tool, given its
 * name and description matching a VirusTotal hash check / on-call query.
 *
 * These are deliberately NOT wired to a real VirusTotal/PagerDuty backend
 * (no connector, no MCP server, no external API). What's being scored here
 * is tool selection, not live threat-intel/on-call data -- an ES|QL tool
 * querying the already-seeded Chrysalis alert data is sufficient and keeps
 * this suite dependency-free. See PERSONA_MATRIX_VIRUSTOTAL/PAGERDUTY
 * connector history in git blame if a future suite needs to test the real
 * connector-step-workflow path instead (that requires a live/mocked
 * VirusTotal API key and, for PagerDuty, a real MCP round-trip -- much
 * heavier machinery than tool-selection scoring needs).
 */
const ELASTIC_API_VERSION = '2023-10-31';
const AGENT_BUILDER_TOOLS_HEADERS = {
  'Content-Type': 'application/json',
  'elastic-api-version': ELASTIC_API_VERSION,
} as const;

export const PERSONA_MATRIX_TOOL_IDS = ['virustotal_lookup', 'on_call_lookup'] as const;

interface SeedToolsOptions {
  kbnClient: KbnClient;
  log: ToolingLog;
}

async function createToolIfMissing({
  kbnClient,
  log,
  body,
}: SeedToolsOptions & { body: Record<string, unknown> }): Promise<void> {
  const toolPath = `/api/agent_builder/tools/${encodeURIComponent(String(body.id))}`;
  try {
    await kbnClient.request({
      method: 'POST',
      path: '/api/agent_builder/tools',
      headers: AGENT_BUILDER_TOOLS_HEADERS,
      body,
    });
    log.info(`[persona-matrix] created tool '${body.id}'`);
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (!/already exists/i.test(message)) {
      throw error;
    }
    // Multi-model gate runs re-execute beforeAll per model worker against the
    // same stack, so the tool can pre-date this call. Recover by reinstalling
    // the CURRENT definition (delete-then-post); if the delete also fails,
    // keep the stale-but-equivalent definition rather than failing the suite.
    try {
      await kbnClient.request({
        method: 'DELETE',
        path: toolPath,
        headers: AGENT_BUILDER_TOOLS_HEADERS,
      });
      await kbnClient.request({
        method: 'POST',
        path: '/api/agent_builder/tools',
        headers: AGENT_BUILDER_TOOLS_HEADERS,
        body,
      });
      log.info(`[persona-matrix] removed stale tool '${body.id}', reinstalled`);
    } catch (recoveryError) {
      log.warning(
        `[persona-matrix] tool '${body.id}' already exists and reinstall failed ` +
          `(${String(
            (recoveryError as Error)?.message ?? recoveryError
          )}); keeping existing definition`
      );
    }
  }
}

export async function seedPersonaMatrixTools({ kbnClient, log }: SeedToolsOptions): Promise<void> {
  await createToolIfMissing({
    kbnClient,
    log,
    body: {
      id: 'virustotal_lookup',
      type: 'esql',
      description:
        'Look up a file hash, URL, or domain against VirusTotal threat intelligence to check ' +
        'for known-malicious indicators. Returns the verdict (benign/malicious), detection ' +
        'ratio, and classification. Use this to verify whether a given hash, URL, or ' +
        'domain has been flagged by security vendors.',
      tags: ['persona-matrix', 'threat-intel'],
      configuration: {
        // Queries the eval-seeded mock verdict index (see env_seeds.ts) so the
        // tool returns a coherent VirusTotal-style answer without any network
        // access or real VirusTotal subscription. `params` is REQUIRED by the
        // esql tool schema (verified live: omitting it fails with "[params]:
        // expected value of type [object] but got [undefined]"; a params entry
        // not referenced by a {{placeholder}} fails with "Defined parameters
        // not used in query"). The {{hash}} placeholder drives the input
        // schema; params stays empty.
        query:
          'FROM ti-mock-default | WHERE threat_intel.indicator.value == "{{hash}}" ' +
          '| KEEP threat_intel.verdict, threat_intel.detection_ratio, threat_intel.classification | LIMIT 5',
        params: {},
      },
    },
  });

  await createToolIfMissing({
    kbnClient,
    log,
    body: {
      id: 'on_call_lookup',
      type: 'esql',
      description:
        'Look up who is currently on call for incident response. Use this to find the primary ' +
        'on-call responder to own or escalate a security incident.',
      tags: ['persona-matrix', 'incident-response'],
      configuration: {
        // Queries the eval-seeded on-call schedule index (see env_seeds.ts A5).
        // Previously this pointed at the alerts index, which has no responder
        // fields — making workflow-execution-b structurally unanswerable.
        query:
          `FROM on-call-schedule | WHERE is_primary == true ` +
          `| KEEP name, email, slack_handle, shift_start, shift_end | LIMIT 5`,
        // esql tool schema requires `params` present (even empty) — omitting
        // it fails validation with "expected value of type [object] but got
        // [undefined]" (verified live).
        params: {},
      },
    },
  });
}

/**
 * Attaches the seeded tools to the default agent's configuration.
 *
 * Creating a tool only puts it in the registry. `selectTools` (agent_builder
 * server) exposes ONLY `agentConfiguration.tools` plus the hardcoded
 * `defaultAgentToolIds` (all `platform.core.*`) — so a registry tool that is
 * never attached is invisible to the model, and any example scoring
 * "did it call virustotal_lookup" is structurally unanswerable. Verified live
 * 2026-08-22: default agent ships `tools: []`, and every workflow-execution
 * run scored ExpectedToolCalled=0 until this attach was added.
 */
export async function attachPersonaMatrixToolsToAgent({
  kbnClient,
  log,
}: SeedToolsOptions): Promise<void> {
  await kbnClient.request({
    method: 'PUT',
    path: `/api/agent_builder/agents/${agentBuilderDefaultAgentId}`,
    headers: AGENT_BUILDER_TOOLS_HEADERS,
    body: {
      configuration: {
        tools: [{ tool_ids: [...PERSONA_MATRIX_TOOL_IDS] }],
      },
    },
  });
  log.info(
    `[persona-matrix] attached ${PERSONA_MATRIX_TOOL_IDS.join(
      ', '
    )} to '${agentBuilderDefaultAgentId}'`
  );
}

export async function cleanupPersonaMatrixTools({
  kbnClient,
  log,
}: SeedToolsOptions): Promise<void> {
  for (const id of PERSONA_MATRIX_TOOL_IDS) {
    await kbnClient
      .request({
        method: 'DELETE',
        path: `/api/agent_builder/tools/${encodeURIComponent(id)}`,
        headers: AGENT_BUILDER_TOOLS_HEADERS,
      })
      .catch((error) => {
        const status = (error as { status?: number })?.status;
        if (status !== 404) {
          log.warning(`[persona-matrix] failed to delete tool '${id}': ${error}`);
        }
      });
  }
}
