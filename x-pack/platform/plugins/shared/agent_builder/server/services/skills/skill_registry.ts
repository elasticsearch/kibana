/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import {
  type PersistedSkillCreateRequest,
  type PersistedSkillUpdateRequest,
  createBadRequestError,
  createAgentBuilderError,
  AgentBuilderErrorCode,
  maxToolsPerSkill,
} from '@kbn/agent-builder-common';
import type { SkillRegistryListOptions } from '@kbn/agent-builder-server/runner';
import type { ReadonlySkillProvider, WritableSkillProvider } from './skill_provider';

const isUiSettingRequirementMet = (
  uiSettingRequired: string | { key: string; value: unknown },
  uiSettingValues: ReadonlyMap<string, unknown>
): boolean => {
  if (typeof uiSettingRequired === 'string') {
    return uiSettingValues.get(uiSettingRequired) === true;
  }

  if (typeof uiSettingRequired === 'object') {
    return uiSettingValues.get(uiSettingRequired.key) === uiSettingRequired.value;
  }

  return false;
};

/**
 * Validates that all provided tool IDs exist in the tool registry
 * and that the count does not exceed the per-skill limit.
 */
export const validateToolIds = async (
  toolIds: string[] | undefined,
  toolRegistry: ToolRegistry
): Promise<void> => {
  if (!toolIds || toolIds.length === 0) {
    return;
  }
  if (toolIds.length > maxToolsPerSkill) {
    throw createBadRequestError(
      `A skill can reference at most ${maxToolsPerSkill} tools, but ${toolIds.length} were provided.`
    );
  }
  const invalidIds: string[] = [];
  for (const toolId of toolIds) {
    const exists = await toolRegistry.has(toolId);
    if (!exists) {
      invalidIds.push(toolId);
    }
  }
  if (invalidIds.length > 0) {
    throw createBadRequestError(`Invalid tool IDs: ${invalidIds.join(', ')}`);
  }
};

export interface SkillRegistry {
  has(skillId: string): Promise<boolean>;
  get(skillId: string): Promise<InternalSkillDefinition | undefined>;
  bulkGet(ids: string[]): Promise<Map<string, InternalSkillDefinition>>;
  list(options?: SkillRegistryListOptions): Promise<InternalSkillDefinition[]>;
  create(params: PersistedSkillCreateRequest): Promise<InternalSkillDefinition>;
  update(skillId: string, update: PersistedSkillUpdateRequest): Promise<InternalSkillDefinition>;
  delete(skillId: string): Promise<boolean>;
}

export const createSkillRegistry = ({
  builtinProvider,
  persistedProvider,
  toolRegistry,
  experimentalFeaturesEnabled,
  uiSettingValues = new Map(),
}: {
  builtinProvider: ReadonlySkillProvider;
  persistedProvider: WritableSkillProvider;
  toolRegistry: ToolRegistry;
  experimentalFeaturesEnabled: boolean;
  uiSettingValues?: ReadonlyMap<string, unknown>;
}): SkillRegistry => {
  const isVisible = (skill: InternalSkillDefinition): boolean => {
    if (skill.experimental && !experimentalFeaturesEnabled) {
      return false;
    }
    if (
      skill.uiSettingRequired &&
      !isUiSettingRequirementMet(skill.uiSettingRequired, uiSettingValues)
    ) {
      return false;
    }
    return true;
  };

  return {
    async has(skillId) {
      const builtinSkill = await builtinProvider.get(skillId);
      if (builtinSkill) {
        return isVisible(builtinSkill);
      }
      const persistedSkill = await persistedProvider.get(skillId);
      if (persistedSkill) {
        return isVisible(persistedSkill);
      }
      return false;
    },

    async get(skillId) {
      const builtin = await builtinProvider.get(skillId);
      if (builtin) {
        return isVisible(builtin) ? builtin : undefined;
      }
      const persisted = await persistedProvider.get(skillId);
      if (persisted) {
        return isVisible(persisted) ? persisted : undefined;
      }
      return undefined;
    },

    async bulkGet(ids) {
      const builtinResult = await builtinProvider.bulkGet(ids);
      // Filter out experimental skills from builtin results
      for (const [id, skill] of builtinResult) {
        if (!isVisible(skill)) {
          builtinResult.delete(id);
        }
      }
      const remainingIds = ids.filter((id) => !builtinResult.has(id));
      if (remainingIds.length === 0) {
        return builtinResult;
      }
      const persistedResult = await persistedProvider.bulkGet(remainingIds);
      for (const [id, skill] of persistedResult) {
        if (isVisible(skill)) {
          builtinResult.set(id, skill);
        }
      }
      return builtinResult;
    },

    async list(options) {
      const { type, includePlugins, ...listOptions } = options ?? {};
      let results: InternalSkillDefinition[];
      if (type === 'built-in') {
        results = await builtinProvider.list(listOptions);
      } else if (type === 'persisted') {
        results = await persistedProvider.list(listOptions);
      } else {
        const [builtinSkills, persistedSkills] = await Promise.all([
          builtinProvider.list(listOptions),
          persistedProvider.list(listOptions),
        ]);
        results = [...builtinSkills, ...persistedSkills];
      }
      if (!includePlugins) {
        results = results.filter((skill) => !skill.plugin_id);
      }
      return results.filter(isVisible);
    },

    async create(params) {
      const existsInBuiltin = await builtinProvider.has(params.id);
      if (existsInBuiltin) {
        throw createAgentBuilderError(
          AgentBuilderErrorCode.badRequest,
          `Skill with id '${params.id}' already exists as a built-in skill.`,
          { statusCode: 409 }
        );
      }
      const existsInPersisted = await persistedProvider.has(params.id);
      if (existsInPersisted) {
        throw createAgentBuilderError(
          AgentBuilderErrorCode.badRequest,
          `Skill with id '${params.id}' already exists.`,
          { statusCode: 409 }
        );
      }
      await validateToolIds(params.tool_ids, toolRegistry);
      return persistedProvider.create(params);
    },

    async update(skillId, updateRequest) {
      const existsInBuiltin = await builtinProvider.has(skillId);
      if (existsInBuiltin) {
        throw createBadRequestError(`Skill '${skillId}' is read-only`);
      }
      await validateToolIds(updateRequest.tool_ids, toolRegistry);
      return persistedProvider.update(skillId, updateRequest);
    },

    async delete(skillId) {
      const existsInBuiltin = await builtinProvider.has(skillId);
      if (existsInBuiltin) {
        throw createBadRequestError(`Skill '${skillId}' is read-only`);
      }
      await persistedProvider.delete(skillId);
      return true;
    },
  };
};
