/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AvailableConnectorWithId } from '@kbn/gen-ai-functional-testing';
import { getAvailableConnectors } from '@kbn/gen-ai-functional-testing';
import type { InferenceEndpointDefinition } from './inference_endpoint_definition';
import {
  getConnectorActionTypeId,
  isInferenceEndpointDefinition,
  loadStackConnectors,
  toStackConnectorDefinition,
  type StackConnectorDefinition,
} from './eval_connector';

jest.mock('@kbn/gen-ai-functional-testing', () => ({
  getAvailableConnectors: jest.fn(),
}));

const getAvailableConnectorsMock = getAvailableConnectors as jest.MockedFunction<
  typeof getAvailableConnectors
>;

const endpoint: InferenceEndpointDefinition = {
  type: 'inference_endpoint',
  id: 'eis-gpt-4o',
  name: 'EIS GPT-4o',
  inferenceId: '.openai-gpt-4o-chat_completion',
  provider: 'elastic',
  taskType: 'chat_completion',
};

describe('toStackConnectorDefinition', () => {
  it('tags a connector read from the environment without altering its other fields', () => {
    const connector: AvailableConnectorWithId = {
      id: 'my-connector',
      name: 'My Connector',
      actionTypeId: '.gen-ai',
      config: { defaultModel: 'gpt-4o' },
      secrets: { apiKey: 'secret' },
    };

    expect(toStackConnectorDefinition(connector)).toEqual({
      ...connector,
      type: 'stack_connector',
    });
  });
});

describe('loadStackConnectors', () => {
  const originalCi = process.env.CI;
  const originalConnectors = process.env.KIBANA_TESTING_AI_CONNECTORS;

  afterEach(() => {
    if (originalCi === undefined) {
      delete process.env.CI;
    } else {
      process.env.CI = originalCi;
    }
    if (originalConnectors === undefined) {
      delete process.env.KIBANA_TESTING_AI_CONNECTORS;
    } else {
      process.env.KIBANA_TESTING_AI_CONNECTORS = originalConnectors;
    }
    getAvailableConnectorsMock.mockReset();
  });

  it('returns an empty list on CI when KIBANA_TESTING_AI_CONNECTORS is unset', () => {
    process.env.CI = 'true';
    delete process.env.KIBANA_TESTING_AI_CONNECTORS;

    expect(loadStackConnectors()).toEqual([]);
    expect(getAvailableConnectorsMock).not.toHaveBeenCalled();
  });

  it('loads stack connectors on CI when KIBANA_TESTING_AI_CONNECTORS is set', () => {
    process.env.CI = 'true';
    process.env.KIBANA_TESTING_AI_CONNECTORS = 'e30=';
    getAvailableConnectorsMock.mockReturnValue([
      { id: 'c1', name: 'C1', actionTypeId: '.gen-ai', config: {} },
    ]);

    expect(loadStackConnectors()).toEqual([
      {
        id: 'c1',
        name: 'C1',
        actionTypeId: '.gen-ai',
        config: {},
        type: 'stack_connector',
      },
    ]);
  });

  it('loads stack connectors locally even when KIBANA_TESTING_AI_CONNECTORS is unset', () => {
    delete process.env.CI;
    delete process.env.KIBANA_TESTING_AI_CONNECTORS;
    getAvailableConnectorsMock.mockReturnValue([]);

    expect(loadStackConnectors()).toEqual([]);
    expect(getAvailableConnectorsMock).toHaveBeenCalled();
  });
});

describe('isInferenceEndpointDefinition', () => {
  it('returns true for an inference endpoint definition', () => {
    expect(isInferenceEndpointDefinition(endpoint)).toBe(true);
  });

  it('returns false for a stack connector', () => {
    const connector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'my-connector',
      name: 'My Connector',
      actionTypeId: '.gen-ai',
      config: {},
      secrets: {},
    };
    expect(isInferenceEndpointDefinition(connector)).toBe(false);
  });

  it('returns false for a .inference stack connector, which the Actions API still owns', () => {
    const connector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'local-inference',
      name: 'Local Inference',
      actionTypeId: '.inference',
      config: { provider: 'openai', taskType: 'chat_completion' },
      secrets: {},
    };
    expect(isInferenceEndpointDefinition(connector)).toBe(false);
  });
});

describe('getConnectorActionTypeId', () => {
  it('returns .inference for an inference endpoint definition', () => {
    expect(getConnectorActionTypeId(endpoint)).toBe('.inference');
  });

  it('returns the actionTypeId of a stack connector unchanged', () => {
    const connector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'my-connector',
      name: 'My Connector',
      actionTypeId: '.gen-ai',
      config: {},
      secrets: {},
    };
    expect(getConnectorActionTypeId(connector)).toBe('.gen-ai');
  });

  it('returns .inference for a .inference stack connector', () => {
    const connector: StackConnectorDefinition = {
      type: 'stack_connector',
      id: 'local-inference',
      name: 'Local Inference',
      actionTypeId: '.inference',
      config: { provider: 'openai', taskType: 'chat_completion' },
      secrets: {},
    };
    expect(getConnectorActionTypeId(connector)).toBe('.inference');
  });
});
