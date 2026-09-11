/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';
import { taskManagerMock } from '@kbn/task-manager-plugin/server/mocks';
import { AgentBuilderSmlPlugin } from './plugin';

const makeSetupDeps = (overrides = {}) => ({
  features: featuresPluginMock.createSetup(),
  taskManager: taskManagerMock.createSetup(),
  ...overrides,
});

describe('AgentBuilderSmlPlugin.setup()', () => {
  it('calls contextEngine.registerAiIndex with the SML registration when contextEngine is present', () => {
    const plugin = new AgentBuilderSmlPlugin(coreMock.createPluginInitializerContext());
    const registerAiIndex = jest.fn();
    const coreSetup = coreMock.createSetup();

    plugin.setup(coreSetup, makeSetupDeps({ contextEngine: { registerAiIndex } }));

    expect(registerAiIndex).toHaveBeenCalledTimes(1);
    expect(registerAiIndex).toHaveBeenCalledWith('elastic', {
      description: expect.stringContaining('Agent Builder'),
      dest: { type: 'index', value: '.ai-index-idx-elastic-index' },
      automations: [],
      sources: [],
    });
  });

  it('does not throw when contextEngine is absent', () => {
    const plugin = new AgentBuilderSmlPlugin(coreMock.createPluginInitializerContext());
    const coreSetup = coreMock.createSetup();

    expect(() => plugin.setup(coreSetup, makeSetupDeps())).not.toThrow();
  });
});
