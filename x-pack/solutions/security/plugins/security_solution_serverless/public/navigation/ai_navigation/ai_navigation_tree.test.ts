/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';
import { AIChatExperience } from '@kbn/ai-assistant-common';
import { createAiNavigationTree } from './ai_navigation_tree';

describe('createAiNavigationTree', () => {
  let core: CoreStart;

  beforeEach(() => {
    core = coreMock.createStart();
    core.settings.globalClient.get = <T>(_key: string) => false as T;
  });

  it('returns the Workflows link between Agents and Value report when `workflows` is enabled', () => {
    const navigationTree = createAiNavigationTree(core, AIChatExperience.Agent, true, false);

    const primaryNavSection = navigationTree.body[4];
    const children = 'children' in primaryNavSection ? primaryNavSection.children : [];

    const workflowsIndex = children?.findIndex(
      (item) => 'link' in item && item.link === 'workflows'
    );
    const agentsIndex = children?.findIndex(
      (item) => 'link' in item && item.link === 'agent_builder'
    );

    expect(workflowsIndex).toBe((agentsIndex ?? 0) + 1);
  });

  it('does not include the Workflows link when `workflows` is disabled', () => {
    const navigationTree = createAiNavigationTree(core, AIChatExperience.Agent, false, false);

    const primaryNavSection = navigationTree.body[4];
    const children = 'children' in primaryNavSection ? primaryNavSection.children : [];

    const workflowsIndex = children?.findIndex(
      (item) => 'link' in item && item.link === 'workflows'
    );

    expect(workflowsIndex).toBe(-1);
  });

  it('places the Agent Builder link after `home` when `agentBuilderNavAtTop` is enabled', () => {
    const navigationTree = createAiNavigationTree(core, AIChatExperience.Agent, true, true);

    const secondNavItem = navigationTree.body[1];

    expect('link' in secondNavItem && secondNavItem.link).toBe('agent_builder');
  });

  it('places the Agent Builder later in the nav  when `agentBuilderNavAtTop` is disabled', () => {
    const navigationTree = createAiNavigationTree(core, AIChatExperience.Agent, true, false);

    const primaryNavSection = navigationTree.body[4];
    const children = 'children' in primaryNavSection ? primaryNavSection.children : [];

    const agentBuilderIndex = children?.findIndex(
      (item) => 'link' in item && item.link === 'agent_builder'
    );

    expect(agentBuilderIndex).toBeGreaterThan(0);
  });
});
