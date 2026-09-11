/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import type { AgentBuilderPluginSetup } from '@kbn/agent-builder-server';
import { platformCoreTools } from '@kbn/agent-builder-common';
import {
  DISCOVER_DATA_ANALYSIS_SKILL_ID,
  DISCOVER_SESSION_SKILL_ID,
} from '../../common/agent_builder';
import { discoverDataAnalysisSkill, registerSkill } from './register_skill';

describe('registerSkill', () => {
  it('registers discover-data-analysis and discover-session', () => {
    const registered: SkillDefinition[] = [];
    const agentBuilder = {
      skills: {
        register: jest.fn((skill: SkillDefinition) => {
          registered.push(skill);
        }),
      },
    } as unknown as AgentBuilderPluginSetup;

    registerSkill(agentBuilder);

    expect(registered.map((skill) => skill.id)).toEqual([
      DISCOVER_DATA_ANALYSIS_SKILL_ID,
      DISCOVER_SESSION_SKILL_ID,
    ]);
  });

  it('adds createDiscoverSession to discover-data-analysis tools', () => {
    expect(discoverDataAnalysisSkill.getRegistryTools?.()).toEqual(
      expect.arrayContaining([
        platformCoreTools.createVisualization,
        platformCoreTools.createDiscoverSession,
      ])
    );
  });
});
