/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import { platformCoreTools, platformSignificantEventsTools } from '@kbn/agent-builder-common/tools';
import type { AgentBaseConfiguration, AgentTypeDefinition } from '@kbn/agent-builder-server/agents';
import {
  getDeductiveInvestigationAgentType,
  registerDeductiveInvestigationAgentType,
  NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID,
} from '.';
import { SANDBOX_BASH_TOOL_ID } from '../../tools/sandbox_bash/tool';
import { SANDBOX_VIEW_FILE_TOOL_ID } from '../../tools/sandbox_bash/view_file_tool';
import { SANDBOX_STR_REPLACE_TOOL_ID } from '../../tools/sandbox_bash/str_replace_tool';
import { SANDBOX_WRITE_FILE_TOOL_ID } from '../../tools/sandbox_bash/write_file_tool';

const SANDBOX_TOOL_IDS = [
  SANDBOX_BASH_TOOL_ID,
  SANDBOX_VIEW_FILE_TOOL_ID,
  SANDBOX_STR_REPLACE_TOOL_ID,
  SANDBOX_WRITE_FILE_TOOL_ID,
];

const staticBase = (type: AgentTypeDefinition): AgentBaseConfiguration => {
  if (typeof type.baseConfiguration === 'function') {
    throw new Error('expected a static base configuration');
  }
  return type.baseConfiguration;
};

describe('deductive investigation agent type', () => {
  it('registers under its own type id, separate from the significant-events investigator', () => {
    const agentBuilder = agentBuilderMocks.createSetup();

    registerDeductiveInvestigationAgentType(agentBuilder);

    expect(agentBuilder.agents.registerType).toHaveBeenCalledWith(
      expect.objectContaining({ id: NIGHTSHIFT_DEDUCTIVE_INVESTIGATION_AGENT_TYPE_ID })
    );
  });

  it('carries a standalone sandbox prompt and no Elastic tools', () => {
    const base = staticBase(
      getDeductiveInvestigationAgentType({ sandboxEnabled: true, cortexEnabled: true })
    );

    expect(base).toMatchObject({
      enable_elastic_capabilities: false,
      skill_ids: [],
      workflow_ids: ['system-nightshift-cortex-hydrate'],
      post_execution_workflow_ids: ['system-nightshift-cortex-optimize'],
    });
    expect(base.tools?.[0]?.tool_ids).toEqual([
      platformSignificantEventsTools.reportInvestigationProgress,
      ...SANDBOX_TOOL_IDS,
    ]);
    expect(base.tools?.[0]?.tool_ids).not.toContain(platformCoreTools.executeEsql);
    // Its own prompt, not the significant-events one: it documents the sandbox query path.
    expect(base.instructions).toContain('/workspace/elastic.md');
    expect(base.instructions).not.toContain('platform_core_execute_esql');
  });

  it('drops both cortex workflows when cortex is disabled', () => {
    const base = staticBase(
      getDeductiveInvestigationAgentType({ sandboxEnabled: true, cortexEnabled: false })
    );

    expect(base.workflow_ids).toBeUndefined();
    expect(base.post_execution_workflow_ids).toBeUndefined();
  });

  it('drops the hydrate workflow when cortex is on but the sandbox is not configured', () => {
    const base = staticBase(
      getDeductiveInvestigationAgentType({ sandboxEnabled: false, cortexEnabled: true })
    );

    expect(base.workflow_ids).toBeUndefined();
    expect(base.post_execution_workflow_ids).toEqual(['system-nightshift-cortex-optimize']);
    expect(base.tools?.[0]?.tool_ids).toEqual([
      platformSignificantEventsTools.reportInvestigationProgress,
    ]);
  });

  it('allow-lists the telemetry connector when one is configured', () => {
    const base = staticBase(
      getDeductiveInvestigationAgentType({
        sandboxEnabled: true,
        cortexEnabled: true,
        telemetryConnectorId: 'elasticsearch-telemetry',
      })
    );

    expect(base.connector_ids).toEqual(['elasticsearch-telemetry']);
  });
});
