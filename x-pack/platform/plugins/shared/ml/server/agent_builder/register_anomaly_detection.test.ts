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
  QUERY_ANOMALIES_TOOL_ID,
  CREATE_ML_CHARTS_TOOL_ID,
} from './tools/tool_ids';
import type { MlClientFactoryDeps } from './ml_client_factory';

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

const mlClientFactoryDeps: MlClientFactoryDeps = {
  getInternalSavedObjectsClient: jest.fn().mockReturnValue(null),
  getAuditService: jest.fn().mockReturnValue(null),
  spacesEnabled: false,
  authorization: undefined,
  mlLicense: { isSecurityEnabled: () => false } as any,
  serverless: { isServerless: false, cpsEnabled: false },
  isMlReady: () => Promise.resolve(),
};

describe('registerAnomalyDetectionAgentBuilder', () => {
  it('registers the anomaly detection skill with ML tools inline', async () => {
    const agentBuilder = createAgentBuilderMock();

    registerAnomalyDetectionAgentBuilder({
      agentBuilder: agentBuilder as any,
      resolveMlCapabilities,
      mlClientFactoryDeps,
    });

    expect(agentBuilder.tools.register).not.toHaveBeenCalled();
    expect(agentBuilder.skills.register).toHaveBeenCalledTimes(1);

    const skillArg = agentBuilder.skills.register.mock.calls[0][0];
    expect(skillArg.id).toBe('ml.anomaly-detection');
    expect(skillArg.experimental).toBe(true);

    const inlineTools = await skillArg.getInlineTools!();
    const registeredIds = inlineTools.map((tool: { id: string }) => tool.id);
    expect(registeredIds).toContain(AD_GET_JOB_INFO_TOOL_ID);
    expect(registeredIds).toContain(AD_CREATE_JOB_TOOL_ID);
    expect(registeredIds).toContain(AD_MANAGE_JOB_STATE_TOOL_ID);
    expect(registeredIds).toContain(AD_UPDATE_JOB_CONFIG_TOOL_ID);
    expect(registeredIds).toContain(QUERY_ANOMALIES_TOOL_ID);
    expect(registeredIds).toContain(CREATE_ML_CHARTS_TOOL_ID);
    expect(inlineTools).toHaveLength(6);
  });

  it('each inline tool has a description, schema, and is experimental', async () => {
    const agentBuilder = createAgentBuilderMock();

    registerAnomalyDetectionAgentBuilder({
      agentBuilder: agentBuilder as any,
      resolveMlCapabilities,
      mlClientFactoryDeps,
    });

    const skillArg = agentBuilder.skills.register.mock.calls[0][0];
    const inlineTools = await skillArg.getInlineTools!();

    for (const tool of inlineTools) {
      expect(tool.description).toBeTruthy();
      expect(tool.schema).toBeDefined();
      expect(tool.experimental).toBe(true);
    }
  });
});
