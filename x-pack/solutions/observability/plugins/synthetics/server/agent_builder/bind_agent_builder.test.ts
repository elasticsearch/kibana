/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import {
  agentBuilderMocks,
  type AgentBuilderPluginSetupMock,
} from '@kbn/agent-builder-plugin/server/mocks';
import type { SyntheticsPluginsSetupDependencies } from '../types';
import { MONITOR_ATTACHMENT_TYPE } from '../../common/agent_builder/attachments/monitor_attachment_schema';
import { MONITOR_MANAGEMENT_SKILL_ID } from './common/constants';
import { bindAgentBuilder } from './bind_agent_builder';

const makePlugins = (
  agentBuilder: AgentBuilderPluginSetupMock | undefined
): SyntheticsPluginsSetupDependencies =>
  ({ agentBuilder } as unknown as SyntheticsPluginsSetupDependencies);

describe('bindAgentBuilder', () => {
  it('is a no-op when the optional agentBuilder plugin is absent', () => {
    const logger = loggingSystemMock.createLogger();

    expect(() => bindAgentBuilder({ logger, plugins: makePlugins(undefined) })).not.toThrow();
    expect(logger.debug).not.toHaveBeenCalled();
  });

  it('registers the monitor attachment type with the agent builder', () => {
    const logger = loggingSystemMock.createLogger();
    const agentBuilder = agentBuilderMocks.createSetup();

    bindAgentBuilder({ logger, plugins: makePlugins(agentBuilder) });

    expect(agentBuilder.attachments.registerType).toHaveBeenCalledTimes(1);
    const registeredAttachment = agentBuilder.attachments.registerType.mock.calls[0][0];
    expect(registeredAttachment.id).toBe(MONITOR_ATTACHMENT_TYPE);
  });

  it('registers the monitor-management skill with the agent builder', () => {
    const logger = loggingSystemMock.createLogger();
    const agentBuilder = agentBuilderMocks.createSetup();

    bindAgentBuilder({ logger, plugins: makePlugins(agentBuilder) });

    expect(agentBuilder.skills.register).toHaveBeenCalledTimes(1);
    const registeredSkill = agentBuilder.skills.register.mock.calls[0][0];
    expect(registeredSkill.id).toBe(MONITOR_MANAGEMENT_SKILL_ID);
  });

  it('logs a debug line after a successful registration', () => {
    const logger = loggingSystemMock.createLogger();
    const agentBuilder = agentBuilderMocks.createSetup();

    bindAgentBuilder({ logger, plugins: makePlugins(agentBuilder) });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining('monitor-management skill and monitor attachment type')
    );
  });
});
