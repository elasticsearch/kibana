/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import { platformCoreTools } from '@kbn/agent-builder-common/tools';
import { STREAMS_EVENT_INVESTIGATION_ATTACH_TOOL_ID } from '../../tools/register_tools';
import content from './skill.md.text';

export const streamsInvestigationManagementSkill = defineSkillType({
  id: 'streams-investigation-management',
  name: 'streams-investigation-management',
  basePath: 'skills/platform/streams',
  description:
    'Streams investigation management: trigger a root-cause analysis workflow for an observability issue, significant event, or alert; check the status of a running investigation; and summarise the structured findings once complete. Load when the user asks to investigate an incident, error, or anomaly — including a significant event attached to the conversation or a fired alert — optionally scoped to specific data streams.',
  content,
  experimental: true,
  getRegistryTools: () => [
    platformCoreTools.executeWorkflow,
    // Used when execute_workflow returns before completion: the tool waits up to ~120s and
    // longer investigations (which are common) return still-running and need a status follow-up.
    platformCoreTools.getWorkflowExecutionStatus,
    // ES|QL tools for the alerts-as-data fallback when no solution alert tool is available.
    // Already part of the default agent, but listed here so the skill is self-contained
    // on custom agents.
    platformCoreTools.generateEsql,
    platformCoreTools.executeEsql,
    // Records the completed investigation back onto the significant event so the UI can
    // surface investigation history and link to the full RCA result.
    STREAMS_EVENT_INVESTIGATION_ATTACH_TOOL_ID,
  ],
});
