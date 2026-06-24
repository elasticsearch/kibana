/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { agentBuilderDefaultAgentId, AgentAccessControlMode } from '@kbn/agent-builder-common';
import type { AgentCreateRequest } from '../../../common/agents';

export const getDefaultAgentCreateRequest = (): AgentCreateRequest => ({
  id: agentBuilderDefaultAgentId,
  name: i18n.translate('xpack.agentBuilder.builtin.defaultAgent.name', {
    defaultMessage: 'Elastic AI Agent',
  }),
  description: i18n.translate('xpack.agentBuilder.builtin.defaultAgent.description', {
    defaultMessage:
      'The built-in agent for interacting with Elastic. Leverages built in skills, tools, and plugins, customizable as your use cases evolve. Use it for day-to-day work over your Elastic data, configuration, and capabilities (debugging, analysis, retrieval, operations, and more).',
  }),
  access_control: { access_mode: AgentAccessControlMode.Public },
  configuration: {
    // enable built-in skills and default set of tools for the default agent
    enable_elastic_capabilities: true,
    tools: [],
    skill_ids: [],
  },
});
