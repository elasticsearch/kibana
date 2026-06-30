/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AgentConfiguration } from '@kbn/agent-builder-common';
import { elasticCapabilitiesExcludedBuiltinSkillIds } from '@kbn/agent-builder-common';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { createSkillsServiceMock, createSkillsStoreMock } from '../../../../test_utils/runner';
import { selectSkills } from './select_skills';

const createSkill = (id: string, readonly = false): InternalSkillDefinition => ({
  id,
  name: `skill-${id}`,
  description: `Description for ${id}`,
  content: `Content for ${id}`,
  readonly,
  basePath: 'skills/platform',
  getRegistryTools: () => [],
  referencedContentCount: 0,
  experimental: false,
});

const createConfig = (overrides: Partial<AgentConfiguration> = {}): AgentConfiguration => ({
  tools: [],
  ...overrides,
});

describe('selectSkills', () => {
  it('returns empty when skill_ids is undefined and enable_elastic_capabilities is false', async () => {
    const skills = createSkillsServiceMock();
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig(),
    });

    expect(result).toEqual([]);
    expect(skills.bulkGet).not.toHaveBeenCalled();
    expect(skills.list).not.toHaveBeenCalled();
  });

  it('returns empty when skill_ids is empty and enable_elastic_capabilities is false', async () => {
    const skills = createSkillsServiceMock();
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({ skill_ids: [], enable_elastic_capabilities: false }),
    });

    expect(result).toEqual([]);
  });

  it('fetches skills by ID via bulkGet when skill_ids is provided', async () => {
    const customSkill = createSkill('custom-1');
    const skills = createSkillsServiceMock();
    skills.bulkGet.mockResolvedValue(new Map([['custom-1', customSkill]]));
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({ skill_ids: ['custom-1'] }),
    });

    expect(skills.bulkGet).toHaveBeenCalledWith(['custom-1']);
    expect(skills.list).not.toHaveBeenCalled();
    expect(result).toEqual([customSkill]);
    expect(skillsStore.add).toHaveBeenCalledWith(customSkill);
  });

  it('fetches built-in skills when enable_elastic_capabilities is true', async () => {
    const builtinSkill = createSkill('builtin-1', true);
    const skills = createSkillsServiceMock();
    skills.list.mockResolvedValue([builtinSkill]);
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({ enable_elastic_capabilities: true }),
    });

    expect(skills.list).toHaveBeenCalledWith({ type: 'built-in' });
    expect(skills.bulkGet).not.toHaveBeenCalled();
    expect(result).toEqual([builtinSkill]);
    expect(skillsStore.add).toHaveBeenCalledWith(builtinSkill);
  });

  it('merges skill_ids and built-in skills, deduplicating by ID', async () => {
    const builtinSkill = createSkill('builtin-1', true);
    const customSkill = createSkill('custom-1');
    const skills = createSkillsServiceMock();
    skills.bulkGet.mockResolvedValue(
      new Map([
        ['builtin-1', builtinSkill],
        ['custom-1', customSkill],
      ])
    );
    skills.list.mockResolvedValue([builtinSkill]);
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({
        skill_ids: ['builtin-1', 'custom-1'],
        enable_elastic_capabilities: true,
      }),
    });

    expect(skills.bulkGet).toHaveBeenCalledWith(['builtin-1', 'custom-1']);
    expect(skills.list).toHaveBeenCalledWith({ type: 'built-in' });
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.id).sort()).toEqual(['builtin-1', 'custom-1']);
    expect(skillsStore.add).toHaveBeenCalledTimes(2);
  });

  it('adds built-in skills not already in skill_ids', async () => {
    const builtinSkill1 = createSkill('builtin-1', true);
    const builtinSkill2 = createSkill('builtin-2', true);
    const customSkill = createSkill('custom-1');
    const skills = createSkillsServiceMock();
    skills.bulkGet.mockResolvedValue(new Map([['custom-1', customSkill]]));
    skills.list.mockResolvedValue([builtinSkill1, builtinSkill2]);
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({
        skill_ids: ['custom-1'],
        enable_elastic_capabilities: true,
      }),
    });

    expect(result).toHaveLength(3);
    expect(result.map((s) => s.id).sort()).toEqual(['builtin-1', 'builtin-2', 'custom-1']);
  });

  it('does not auto-include elastic-capabilities-excluded built-in skills', async () => {
    const excludedSkill = createSkill(elasticCapabilitiesExcludedBuiltinSkillIds[0], true);
    const includedBuiltin = createSkill('builtin-1', true);
    const skills = createSkillsServiceMock();
    skills.list.mockResolvedValue([excludedSkill, includedBuiltin]);
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({ enable_elastic_capabilities: true }),
    });

    expect(result.map((s) => s.id)).toEqual(['builtin-1']);
  });

  it('includes excluded built-in skills when explicitly selected', async () => {
    const excludedSkill = createSkill(elasticCapabilitiesExcludedBuiltinSkillIds[0], true);
    const skills = createSkillsServiceMock();
    skills.bulkGet.mockResolvedValue(
      new Map([[elasticCapabilitiesExcludedBuiltinSkillIds[0], excludedSkill]])
    );
    const skillsStore = createSkillsStoreMock();

    const result = await selectSkills({
      skills,
      skillsStore,
      agentConfiguration: createConfig({
        skill_ids: [elasticCapabilitiesExcludedBuiltinSkillIds[0]],
        enable_elastic_capabilities: true,
      }),
    });

    expect(result).toEqual([excludedSkill]);
  });

  describe('additionalSkillIds (plugin skills)', () => {
    it('returns empty when only additionalSkillIds are provided but list is empty', async () => {
      const skills = createSkillsServiceMock();
      skills.bulkGet.mockResolvedValue(new Map());
      const skillsStore = createSkillsStoreMock();

      const result = await selectSkills({
        skills,
        skillsStore,
        agentConfiguration: createConfig(),
        additionalSkillIds: [],
      });

      expect(result).toEqual([]);
    });

    it('returns skills from additionalSkillIds', async () => {
      const pluginSkill = createSkill('plugin-skill-1');
      const skills = createSkillsServiceMock();
      skills.bulkGet.mockImplementation(async (ids: string[]) => {
        const map = new Map<string, ReturnType<typeof createSkill>>();
        if (ids.includes('plugin-skill-1')) map.set('plugin-skill-1', pluginSkill);
        return map;
      });
      const skillsStore = createSkillsStoreMock();

      const result = await selectSkills({
        skills,
        skillsStore,
        agentConfiguration: createConfig(),
        additionalSkillIds: ['plugin-skill-1'],
      });

      expect(result).toEqual([pluginSkill]);
      expect(skillsStore.add).toHaveBeenCalledWith(pluginSkill);
    });

    it('merges additionalSkillIds with explicit skill_ids, no duplicates', async () => {
      const sharedSkill = createSkill('shared-skill');
      const pluginOnlySkill = createSkill('plugin-only');
      const explicitOnlySkill = createSkill('explicit-only');

      const skills = createSkillsServiceMock();
      skills.bulkGet.mockImplementation(async (ids: string[]) => {
        const map = new Map<string, ReturnType<typeof createSkill>>();
        if (ids.includes('shared-skill')) map.set('shared-skill', sharedSkill);
        if (ids.includes('explicit-only')) map.set('explicit-only', explicitOnlySkill);
        if (ids.includes('plugin-only')) map.set('plugin-only', pluginOnlySkill);
        return map;
      });
      const skillsStore = createSkillsStoreMock();

      const result = await selectSkills({
        skills,
        skillsStore,
        agentConfiguration: createConfig({ skill_ids: ['shared-skill', 'explicit-only'] }),
        additionalSkillIds: ['shared-skill', 'plugin-only'],
      });

      expect(result).toHaveLength(3);
      expect(result.map((s) => s.id).sort()).toEqual([
        'explicit-only',
        'plugin-only',
        'shared-skill',
      ]);
    });

    it('does not call bulkGet for additionalSkillIds if list is empty', async () => {
      const customSkill = createSkill('custom-1');
      const skills = createSkillsServiceMock();
      skills.bulkGet.mockResolvedValue(new Map([['custom-1', customSkill]]));
      const skillsStore = createSkillsStoreMock();

      await selectSkills({
        skills,
        skillsStore,
        agentConfiguration: createConfig({ skill_ids: ['custom-1'] }),
        additionalSkillIds: [],
      });

      // bulkGet called once for skill_ids, but NOT a second time for empty additionalSkillIds
      expect(skills.bulkGet).toHaveBeenCalledTimes(1);
      expect(skills.bulkGet).toHaveBeenCalledWith(['custom-1']);
    });
  });
});
