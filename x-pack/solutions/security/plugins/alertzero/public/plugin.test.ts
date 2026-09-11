/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/public/mocks';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/public/mocks';
import { getInvestigationTabIds } from '@kbn/agentic-investigations-common';
import type { AlertZeroClientConfig } from './types';
import { AlertZeroPublicPlugin } from './plugin';

const createConfig = (overrides: Partial<AlertZeroClientConfig> = {}): AlertZeroClientConfig => ({
  enabled: false,
  ui: { useMockData: true },
  ...overrides,
});

const createContext = (config: AlertZeroClientConfig) =>
  ({
    config: { get: () => config },
  } as unknown as ConstructorParameters<typeof AlertZeroPublicPlugin>[0]);

describe('AlertZeroPublicPlugin feature-flag gating', () => {
  it('does not register the browser app when disabled', () => {
    const plugin = new AlertZeroPublicPlugin(createContext(createConfig({ enabled: false })));
    const coreSetup = coreMock.createSetup();

    plugin.setup(coreSetup as never, {} as never);

    expect(coreSetup.application.register).not.toHaveBeenCalled();
  });

  it('registers the browser app when enabled', () => {
    const plugin = new AlertZeroPublicPlugin(createContext(createConfig({ enabled: true })));
    const coreSetup = coreMock.createSetup();

    plugin.setup(coreSetup as never, {} as never);

    expect(coreSetup.application.register).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'alertzero', appRoute: '/app/alertzero' })
    );
  });
});

describe('AlertZeroPublicPlugin conversation template UI registration', () => {
  const startPlugin = (enabled: boolean) => {
    const plugin = new AlertZeroPublicPlugin(createContext(createConfig({ enabled })));
    const agentBuilder = agentBuilderMocks.createStart();

    plugin.start(coreMock.createStart(), { agentBuilder } as never);

    return agentBuilder;
  };

  it('registers the investigation template UI and its tabs when enabled', () => {
    const { conversationTemplates } = startPlugin(true);

    expect(conversationTemplates.registerTemplateUIDefinition).toHaveBeenCalledWith(
      'investigation',
      expect.any(Function)
    );
    for (const tabId of getInvestigationTabIds('investigation')) {
      expect(conversationTemplates.registerTab).toHaveBeenCalledWith(tabId, expect.any(Function));
    }
  });

  it('registers nothing when disabled', () => {
    const { conversationTemplates } = startPlugin(false);

    expect(conversationTemplates.registerTemplateUIDefinition).not.toHaveBeenCalled();
    expect(conversationTemplates.registerTab).not.toHaveBeenCalled();
  });
});
