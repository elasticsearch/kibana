/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { dashboardManagementSkill } from './dashboard_management_skill';
import { aiPanelAuthoringSkill } from './ai_panel_authoring_skill';

export const registerSkills = (agentBuilder: AgentBuilderPluginSetup): void => {
  agentBuilder.skills.register(dashboardManagementSkill);
  agentBuilder.skills.register(aiPanelAuthoringSkill);
};
