/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { registerAnomalyDetectionAgentBuilder } from './register_anomaly_detection';
import {
  AD_GET_JOB_INFO_TOOL_ID,
  AD_CREATE_JOB_TOOL_ID,
  AD_MANAGE_JOB_STATE_TOOL_ID,
  AD_UPDATE_JOB_CONFIG_TOOL_ID,
} from './tools/tool_ids';

const createAgentBuilderMock = () => ({
  tools: { register: jest.fn() },
  skills: { register: jest.fn() },
  agents: { register: jest.fn() },
  attachments: { registerType: jest.fn() },
  hooks: { onBeforeToolCall: jest.fn(), onAfterToolCall: jest.fn() },
  plugins: { register: jest.fn() },
  topSnippets: { numSnippets: 5, numWords: 100 },
});

const resolveMlCapabilities = jest.fn().mockResolvedValue(null);

describe('registerAnomalyDetectionAgentBuilder', () => {
  it('registers all 4 ML API tools', () => {
    const agentBuilder = createAgentBuilderMock();

    registerAnomalyDetectionAgentBuilder({
      agentBuilder: agentBuilder as any,
      resolveMlCapabilities,
    });

    const registeredIds = agentBuilder.tools.register.mock.calls.map((call) => call[0].id);
    expect(registeredIds).toContain(AD_GET_JOB_INFO_TOOL_ID);
    expect(registeredIds).toContain(AD_CREATE_JOB_TOOL_ID);
    expect(registeredIds).toContain(AD_MANAGE_JOB_STATE_TOOL_ID);
    expect(registeredIds).toContain(AD_UPDATE_JOB_CONFIG_TOOL_ID);
    expect(agentBuilder.tools.register).toHaveBeenCalledTimes(4);
  });

  it('registers the anomaly detection skill', () => {
    const agentBuilder = createAgentBuilderMock();

    registerAnomalyDetectionAgentBuilder({
      agentBuilder: agentBuilder as any,
      resolveMlCapabilities,
    });

    expect(agentBuilder.skills.register).toHaveBeenCalledTimes(1);
    const skillArg = agentBuilder.skills.register.mock.calls[0][0];
    expect(skillArg.id).toBe('ml.anomaly-detection');
  });

  it('each registered tool has a description and a schema', () => {
    const agentBuilder = createAgentBuilderMock();

    registerAnomalyDetectionAgentBuilder({
      agentBuilder: agentBuilder as any,
      resolveMlCapabilities,
    });

    for (const [tool] of agentBuilder.tools.register.mock.calls) {
      expect(tool.description).toBeTruthy();
      expect(tool.schema).toBeDefined();
    }
  });
});
