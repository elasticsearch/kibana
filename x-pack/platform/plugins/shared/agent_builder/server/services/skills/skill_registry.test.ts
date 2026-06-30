/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import { AGENT_BUILDER_TRACING_ENABLED_SETTING_ID } from '@kbn/management-settings-ids';
import { createSkillRegistry } from './skill_registry';
import type { ReadonlySkillProvider, WritableSkillProvider } from './skill_provider';

const createMockInternalSkillDefinition = (
  overrides: Partial<InternalSkillDefinition> = {}
): InternalSkillDefinition => ({
  id: 'test-skill-1',
  name: 'test-skill',
  description: 'A test skill',
  content: 'Skill body content',
  readonly: true,
  experimental: false,
  basePath: 'skills/platform',
  getRegistryTools: () => [],
  referencedContentCount: 0,
  ...overrides,
});

const createMockBuiltinProvider = (
  skills: InternalSkillDefinition[]
): jest.Mocked<ReadonlySkillProvider> => {
  const skillsMap = new Map(skills.map((s) => [s.id, s]));
  return {
    id: 'builtin',
    readonly: true,
    has: jest.fn(async (id: string) => skillsMap.has(id)),
    get: jest.fn(async (id: string) => skillsMap.get(id)),
    bulkGet: jest.fn(async (ids: string[]) => {
      const result = new Map<string, InternalSkillDefinition>();
      for (const id of ids) {
        const skill = skillsMap.get(id);
        if (skill) result.set(id, skill);
      }
      return result;
    }),
    list: jest.fn(async () => skills),
  };
};

const createMockPersistedProvider = (
  skills: InternalSkillDefinition[]
): jest.Mocked<WritableSkillProvider> => {
  const skillsMap = new Map(skills.map((s) => [s.id, s]));
  return {
    id: 'persisted',
    readonly: false,
    has: jest.fn(async (id: string) => skillsMap.has(id)),
    get: jest.fn(async (id: string) => skillsMap.get(id)),
    bulkGet: jest.fn(async (ids: string[]) => {
      const result = new Map<string, InternalSkillDefinition>();
      for (const id of ids) {
        const skill = skillsMap.get(id);
        if (skill) result.set(id, skill);
      }
      return result;
    }),
    list: jest.fn(async () => skills),
    create: jest.fn(async (params) => ({
      ...params,
      readonly: false,
      basePath: '/skills',
      getRegistryTools: () => params.tool_ids ?? [],
      referencedContentCount: params.referenced_content?.length ?? 0,
      experimental: false,
    })),
    update: jest.fn(async (id, update) => ({
      id,
      name: update.name ?? 'original-name',
      description: update.description ?? 'original-description',
      content: update.content ?? 'original-content',
      readonly: false,
      basePath: '/skills',
      getRegistryTools: () => update.tool_ids ?? [],
      referencedContentCount: 0,
      experimental: false,
    })),
    delete: jest.fn(async (_skillId: string) => undefined),
  };
};

const createMockToolRegistry = (toolIds: string[] = []): ToolRegistry =>
  ({
    has: jest.fn(async (id: string) => toolIds.includes(id)),
  } as unknown as ToolRegistry);

describe('createSkillRegistry', () => {
  const builtinSkill1 = createMockInternalSkillDefinition({
    id: 'builtin-skill-1',
    name: 'builtin-skill-1-name',
    readonly: true,
  });
  const persistedSkill1 = createMockInternalSkillDefinition({
    id: 'custom-skill-1',
    name: 'custom-skill-1-name',
    description: 'Description for custom-skill-1',
    content: 'Content for custom-skill-1',
    readonly: false,
  });

  describe('has', () => {
    it('returns true for a built-in skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.has('builtin-skill-1')).toBe(true);
    });

    it('returns true for a persisted skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.has('custom-skill-1')).toBe(true);
    });

    it('returns false for a non-existent skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.has('non-existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('returns built-in skill when it exists', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.get('builtin-skill-1')).toEqual(builtinSkill1);
    });

    it('returns persisted skill when no built-in exists', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.get('custom-skill-1')).toEqual(persistedSkill1);
    });

    it('prefers built-in over persisted', async () => {
      const overlapSkill = createMockInternalSkillDefinition({
        id: 'builtin-skill-1',
        readonly: false,
      });
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([overlapSkill]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.get('builtin-skill-1')).toEqual(builtinSkill1);
    });

    it('returns undefined for non-existent skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      expect(await registry.get('non-existent')).toBeUndefined();
    });
  });

  describe('list', () => {
    it('returns merged list with correct readonly flags', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list();
      expect(result).toHaveLength(2);

      const builtin = result.find((s) => s.id === 'builtin-skill-1');
      expect(builtin?.readonly).toBe(true);

      const persisted = result.find((s) => s.id === 'custom-skill-1');
      expect(persisted?.readonly).toBe(false);
    });
  });

  describe('list with includePlugins filter', () => {
    const pluginSkill = createMockInternalSkillDefinition({
      id: 'plugin-skill-1',
      name: 'plugin-skill-1-name',
      readonly: false,
      plugin_id: 'my-plugin',
    });

    it('excludes plugin skills by default (no options)', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1, pluginSkill]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list();
      expect(result.find((s) => s.id === 'plugin-skill-1')).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it('excludes plugin skills when includePlugins is false', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1, pluginSkill]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ includePlugins: false });
      expect(result.find((s) => s.id === 'plugin-skill-1')).toBeUndefined();
      expect(result).toHaveLength(2);
    });

    it('includes plugin skills when includePlugins is true', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1, pluginSkill]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ includePlugins: true });
      expect(result.find((s) => s.id === 'plugin-skill-1')).toBeDefined();
      expect(result).toHaveLength(3);
    });

    it('always returns non-plugin skills regardless of the flag', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const withFlag = await registry.list({ includePlugins: true });
      const withoutFlag = await registry.list({ includePlugins: false });

      expect(withFlag).toHaveLength(2);
      expect(withoutFlag).toHaveLength(2);
    });

    it('excludes plugin skills from built-in type filter', async () => {
      const builtinPluginSkill = createMockInternalSkillDefinition({
        id: 'builtin-plugin-skill',
        readonly: true,
        plugin_id: 'my-plugin',
      });
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1, builtinPluginSkill]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ type: 'built-in' });
      expect(result.find((s) => s.id === 'builtin-plugin-skill')).toBeUndefined();
      expect(result).toHaveLength(1);
    });

    it('excludes plugin skills from persisted type filter', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([persistedSkill1, pluginSkill]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ type: 'persisted' });
      expect(result.find((s) => s.id === 'plugin-skill-1')).toBeUndefined();
      expect(result).toHaveLength(1);
    });
  });

  describe('list with summaryOnly', () => {
    it('forwards options to both providers', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ summaryOnly: true });
      expect(result).toHaveLength(2);

      expect(builtinProvider.list).toHaveBeenCalledWith({ summaryOnly: true });
      expect(persistedProvider.list).toHaveBeenCalledWith({ summaryOnly: true });
    });
  });

  describe('list with type filter', () => {
    it('returns only built-in skills when type is built-in', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ type: 'built-in' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('builtin-skill-1');
      expect(builtinProvider.list).toHaveBeenCalledWith({});
      expect(persistedProvider.list).not.toHaveBeenCalled();
    });

    it('returns only persisted skills when type is persisted', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.list({ type: 'persisted' });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('custom-skill-1');
      expect(persistedProvider.list).toHaveBeenCalledWith({});
      expect(builtinProvider.list).not.toHaveBeenCalled();
    });

    it('does not forward the type field to providers', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await registry.list({ type: 'built-in', summaryOnly: true });
      expect(builtinProvider.list).toHaveBeenCalledWith({ summaryOnly: true });
    });
  });

  describe('bulkGet', () => {
    it('returns all built-in skills when all IDs are built-in', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const persistedProvider = createMockPersistedProvider([]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.bulkGet(['builtin-skill-1']);
      expect(result.size).toBe(1);
      expect(result.get('builtin-skill-1')).toEqual(builtinSkill1);
      expect(persistedProvider.bulkGet).not.toHaveBeenCalled();
    });

    it('falls through to persisted provider for non-builtin IDs', async () => {
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.bulkGet(['custom-skill-1']);
      expect(result.size).toBe(1);
      expect(result.get('custom-skill-1')).toEqual(persistedSkill1);
      expect(persistedProvider.bulkGet).toHaveBeenCalledWith(['custom-skill-1']);
    });

    it('merges results from both providers', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.bulkGet(['builtin-skill-1', 'custom-skill-1']);
      expect(result.size).toBe(2);
      expect(result.get('builtin-skill-1')).toEqual(builtinSkill1);
      expect(result.get('custom-skill-1')).toEqual(persistedSkill1);
    });

    it('omits IDs that are not found in either provider', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.bulkGet(['builtin-skill-1', 'non-existent']);
      expect(result.size).toBe(1);
      expect(result.has('non-existent')).toBe(false);
    });

    it('returns empty map for empty input', async () => {
      const builtinProvider = createMockBuiltinProvider([builtinSkill1]);
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider,
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      const result = await registry.bulkGet([]);
      expect(result.size).toBe(0);
    });
  });

  describe('create', () => {
    it('creates a new persisted skill', async () => {
      const persistedProvider = createMockPersistedProvider([]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(['tool-a']),
        experimentalFeaturesEnabled: false,
      });

      await registry.create({
        id: 'new-skill',
        name: 'New Skill',
        description: 'A new skill',
        content: 'Instructions...',
        tool_ids: ['tool-a'],
      });

      expect(persistedProvider.create).toHaveBeenCalledWith({
        id: 'new-skill',
        name: 'New Skill',
        description: 'A new skill',
        content: 'Instructions...',
        tool_ids: ['tool-a'],
      });
    });

    it('throws when skill ID already exists in built-in', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await expect(
        registry.create({
          id: 'builtin-skill-1',
          name: 'Duplicate',
          description: 'Duplicate',
          content: 'Duplicate',
          tool_ids: [],
        })
      ).rejects.toThrow("Skill with id 'builtin-skill-1' already exists");
    });

    it('throws when tool IDs are invalid', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(['tool-a']),
        experimentalFeaturesEnabled: false,
      });

      await expect(
        registry.create({
          id: 'new-skill',
          name: 'New Skill',
          description: 'Description',
          content: 'Content',
          tool_ids: ['tool-a', 'invalid-tool'],
        })
      ).rejects.toThrow('Invalid tool IDs: invalid-tool');
    });

    it('throws when more than 5 tool IDs are provided', async () => {
      const toolIds = ['tool-1', 'tool-2', 'tool-3', 'tool-4', 'tool-5', 'tool-6'];
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(toolIds),
        experimentalFeaturesEnabled: false,
      });

      await expect(
        registry.create({
          id: 'new-skill',
          name: 'New Skill',
          description: 'Description',
          content: 'Content',
          tool_ids: toolIds,
        })
      ).rejects.toThrow('A skill can reference at most 5 tools, but 6 were provided');
    });

    it('allows exactly 5 tool IDs', async () => {
      const toolIds = ['tool-1', 'tool-2', 'tool-3', 'tool-4', 'tool-5'];
      const persistedProvider = createMockPersistedProvider([]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(toolIds),
        experimentalFeaturesEnabled: false,
      });

      await registry.create({
        id: 'new-skill',
        name: 'New Skill',
        description: 'Description',
        content: 'Content',
        tool_ids: toolIds,
      });

      expect(persistedProvider.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('updates a persisted skill', async () => {
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await registry.update('custom-skill-1', { name: 'Updated Name' });

      expect(persistedProvider.update).toHaveBeenCalledWith('custom-skill-1', {
        name: 'Updated Name',
      });
    });

    it('throws when trying to update a built-in skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await expect(registry.update('builtin-skill-1', { name: 'Updated' })).rejects.toThrow(
        "Skill 'builtin-skill-1' is read-only"
      );
    });

    it('throws when updating with more than 5 tool IDs', async () => {
      const toolIds = ['tool-1', 'tool-2', 'tool-3', 'tool-4', 'tool-5', 'tool-6'];
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider: createMockPersistedProvider([persistedSkill1]),
        toolRegistry: createMockToolRegistry(toolIds),
        experimentalFeaturesEnabled: false,
      });

      await expect(registry.update('custom-skill-1', { tool_ids: toolIds })).rejects.toThrow(
        'A skill can reference at most 5 tools, but 6 were provided'
      );
    });
  });

  describe('delete', () => {
    it('deletes a persisted skill', async () => {
      const persistedProvider = createMockPersistedProvider([persistedSkill1]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await registry.delete('custom-skill-1');
      expect(persistedProvider.delete).toHaveBeenCalledWith('custom-skill-1');
    });

    it('throws when trying to delete a built-in skill', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([builtinSkill1]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await expect(registry.delete('builtin-skill-1')).rejects.toThrow(
        "Skill 'builtin-skill-1' is read-only"
      );
    });

    it('delegates to persisted provider for non-existent skill', async () => {
      const persistedProvider = createMockPersistedProvider([]);
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([]),
        persistedProvider,
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });

      await registry.delete('non-existent');
      expect(persistedProvider.delete).toHaveBeenCalledWith('non-existent');
    });
  });

  describe('experimental filtering', () => {
    const normalSkill = createMockInternalSkillDefinition({
      id: 'normal-skill',
      name: 'normal-skill',
      experimental: false,
      readonly: true,
    });
    const experimentalSkill = createMockInternalSkillDefinition({
      id: 'experimental-skill',
      name: 'experimental-skill',
      experimental: true,
      readonly: true,
    });

    describe('when experimentalFeaturesEnabled is false', () => {
      it('has() returns false for experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        expect(await registry.has('experimental-skill')).toBe(false);
      });

      it('has() returns true for non-experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        expect(await registry.has('normal-skill')).toBe(true);
      });

      it('get() returns undefined for experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        expect(await registry.get('experimental-skill')).toBeUndefined();
      });

      it('get() returns skill for non-experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        expect(await registry.get('normal-skill')).toEqual(normalSkill);
      });

      it('bulkGet() omits experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill, experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        const result = await registry.bulkGet(['normal-skill', 'experimental-skill']);
        expect(result.size).toBe(1);
        expect(result.has('normal-skill')).toBe(true);
        expect(result.has('experimental-skill')).toBe(false);
      });

      it('list() excludes experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill, experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: false,
        });

        const result = await registry.list();
        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('normal-skill');
      });
    });

    describe('when experimentalFeaturesEnabled is true', () => {
      it('has() returns true for experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: true,
        });

        expect(await registry.has('experimental-skill')).toBe(true);
      });

      it('get() returns experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: true,
        });

        expect(await registry.get('experimental-skill')).toEqual(experimentalSkill);
      });

      it('bulkGet() includes experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill, experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: true,
        });

        const result = await registry.bulkGet(['normal-skill', 'experimental-skill']);
        expect(result.size).toBe(2);
        expect(result.has('normal-skill')).toBe(true);
        expect(result.has('experimental-skill')).toBe(true);
      });

      it('list() includes experimental skills', async () => {
        const registry = createSkillRegistry({
          builtinProvider: createMockBuiltinProvider([normalSkill, experimentalSkill]),
          persistedProvider: createMockPersistedProvider([]),
          toolRegistry: createMockToolRegistry(),
          experimentalFeaturesEnabled: true,
        });

        const result = await registry.list();
        expect(result).toHaveLength(2);
      });
    });

    it('non-experimental skills are always returned regardless of the flag', async () => {
      const registryOff = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([normalSkill]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: false,
      });
      const registryOn = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([normalSkill]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: true,
      });

      expect(await registryOff.has('normal-skill')).toBe(true);
      expect(await registryOn.has('normal-skill')).toBe(true);
      expect(await registryOff.get('normal-skill')).toEqual(normalSkill);
      expect(await registryOn.get('normal-skill')).toEqual(normalSkill);
    });
  });

  describe('ui setting requirement filtering', () => {
    const tracesSkill = createMockInternalSkillDefinition({
      id: 'agent-builder-traces',
      name: 'agent-builder-traces',
      experimental: true,
      readonly: true,
      uiSettingRequired: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
    });

    it('hides skills when the required ui setting is false', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([tracesSkill]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: true,
        uiSettingValues: new Map([[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, false]]),
      });

      expect(await registry.has('agent-builder-traces')).toBe(false);
      expect(await registry.get('agent-builder-traces')).toBeUndefined();
      expect(await registry.list()).toEqual([]);
    });

    it('shows skills when the required ui setting is true', async () => {
      const registry = createSkillRegistry({
        builtinProvider: createMockBuiltinProvider([tracesSkill]),
        persistedProvider: createMockPersistedProvider([]),
        toolRegistry: createMockToolRegistry(),
        experimentalFeaturesEnabled: true,
        uiSettingValues: new Map([[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, true]]),
      });

      expect(await registry.has('agent-builder-traces')).toBe(true);
      expect(await registry.get('agent-builder-traces')).toEqual(tracesSkill);
    });
  });
});
