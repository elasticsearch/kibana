/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { agentBuilderTracesSkill } from './agent_builder_traces/agent_builder_traces_skill';
import { graphCreationSkill } from './graph_creation_skill';
import { skillAuthoringSkill } from './skill_authoring';
import { connectorAuthoringSkill } from './connector_authoring';

export const registerSkills = (agentBuilder: AgentBuilderPluginSetup) => {
  agentBuilder.skills.register(graphCreationSkill);
  agentBuilder.skills.register(skillAuthoringSkill);
  agentBuilder.skills.register(agentBuilderTracesSkill);
  agentBuilder.skills.register(connectorAuthoringSkill);
};
