/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import type { AgentTypeDefinition } from '@kbn/agent-builder-server/agents';
import { platformSignificantEventsTools } from '@kbn/agent-builder-common/tools';
import {
  NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID,
  NIGHTSHIFT_CORTEX_OPTIMIZE_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import instructions from './instructions/deductive_investigator.md.text';
import { SANDBOX_BASH_TOOL_ID } from '../../tools/sandbox_bash/tool';
import { SANDBOX_VIEW_FILE_TOOL_ID } from '../../tools/sandbox_bash/view_file_tool';
import { SANDBOX_STR_REPLACE_TOOL_ID } from '../../tools/sandbox_bash/str_replace_tool';
import { SANDBOX_WRITE_FILE_TOOL_ID } from '../../tools/sandbox_bash/write_file_tool';

export const NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_ID =
  'significant-events.deductive-investigation';
export const NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID =
  'platform.sig_events.deductive-investigation-type';

const SANDBOX_TOOL_IDS = [
  SANDBOX_BASH_TOOL_ID,
  SANDBOX_VIEW_FILE_TOOL_ID,
  SANDBOX_STR_REPLACE_TOOL_ID,
  SANDBOX_WRITE_FILE_TOOL_ID,
] as const;

export const DEDUCTIVE_INVESTIGATION_AGENT_NAME = 'Nightshift Deductive Investigator';
export const DEDUCTIVE_INVESTIGATION_AGENT_DESCRIPTION =
  'Answers an arbitrary investigation question by reasoning from cluster telemetry it queries ' +
  'inside a sandbox, and records what it learns in the Nightshift Cortex wiki.';

/**
 * Builds the deductive investigation agent type. It is deliberately separate from
 * `significant-events.investigation`, which keeps its own prompt and Agent Builder tools: this
 * agent works only from the sandbox, so it carries a standalone prompt and no ES|QL or
 * observability tools. Telemetry is reached through `telemetryConnectorId` as described in
 * `/workspace/elastic.md`.
 */
export const getDeductiveInvestigationAgentType = ({
  sandboxEnabled,
  cortexEnabled,
  telemetryConnectorId,
}: {
  sandboxEnabled: boolean;
  cortexEnabled: boolean;
  telemetryConnectorId?: string;
}): AgentTypeDefinition => ({
  id: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID,
  name: DEDUCTIVE_INVESTIGATION_AGENT_NAME,
  description: DEDUCTIVE_INVESTIGATION_AGENT_DESCRIPTION,
  avatar_icon: 'logoElastic',
  baseConfiguration: {
    instructions,
    skill_ids: [],
    tools: [
      {
        tool_ids: [
          platformSignificantEventsTools.reportInvestigationProgress,
          ...(sandboxEnabled ? [...SANDBOX_TOOL_IDS] : []),
        ],
      },
    ],
    enable_elastic_capabilities: false,
    connector_ids: telemetryConnectorId ? [telemetryConnectorId] : [],
    // Cortex hydrate runs as the beforeAgent hook and writes into /workspace, so it needs both
    // the sandbox and Cortex; without the sandbox the step would throw on every round.
    ...(sandboxEnabled && cortexEnabled
      ? { workflow_ids: [NIGHTSHIFT_CORTEX_HYDRATE_WORKFLOW_ID] }
      : {}),
    ...(cortexEnabled
      ? { post_execution_workflow_ids: [NIGHTSHIFT_CORTEX_OPTIMIZE_WORKFLOW_ID] }
      : {}),
  },
});

export const registerDeductiveInvestigationAgentType = (
  agentBuilder: AgentBuilderPluginSetup,
  {
    sandboxEnabled,
    cortexEnabled,
    telemetryConnectorId,
  }: {
    sandboxEnabled: boolean;
    cortexEnabled: boolean;
    telemetryConnectorId?: string;
  } = { sandboxEnabled: false, cortexEnabled: false }
): void => {
  agentBuilder.agents.registerType(
    getDeductiveInvestigationAgentType({ sandboxEnabled, cortexEnabled, telemetryConnectorId })
  );
};
