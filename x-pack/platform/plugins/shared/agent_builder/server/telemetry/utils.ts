/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { agentBuilderDefaultAgentId } from '@kbn/agent-builder-common';
import { isInternalTool, ToolType } from '@kbn/agent-builder-common/tools';
import type {
  SkillInvocationOrigin,
  SkillSolutionArea,
} from '@kbn/agent-builder-common/telemetry/agent_builder_events';
import {
  AGENT_BUILDER_BUILTIN_AGENTS,
  AGENT_BUILDER_BUILTIN_TOOLS,
} from '@kbn/agent-builder-server/allow_lists';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { createHash } from 'crypto';

const BUILTIN_AGENT_IDS = new Set([agentBuilderDefaultAgentId, ...AGENT_BUILDER_BUILTIN_AGENTS]);
const BUILTIN_TOOL_IDS = new Set(AGENT_BUILDER_BUILTIN_TOOLS);

const CUSTOM = 'custom';
const CUSTOM_HASH_PREFIX = `${CUSTOM}-`;
const PLUGIN_HASH_PREFIX = 'plugin-';
const CUSTOM_HASH_HEX_LENGTH = 16;

function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function toHashedId(value: string): string {
  return sha256Hex(value).slice(0, CUSTOM_HASH_HEX_LENGTH);
}

export function toCustomHashedId(value: string): string {
  return `${CUSTOM_HASH_PREFIX}${toHashedId(value)}`;
}

function toPluginHashedId(value: string): string {
  return `${PLUGIN_HASH_PREFIX}${toHashedId(value)}`;
}

/**
 * Normalizes agent IDs for telemetry to protect user privacy.
 * Built-in agents are reported with their actual ID, custom agents are reported as a stable hashed
 * label (CUSTOM-<sha256_prefix>).
 */
export function normalizeAgentIdForTelemetry(agentId?: string): string | undefined {
  if (!agentId) {
    return undefined;
  }
  return BUILTIN_AGENT_IDS.has(agentId) ? agentId : toCustomHashedId(agentId);
}

/**
 * Normalizes tool IDs for telemetry to protect user privacy.
 * custom/user-created tools are reported as a stable hashed label (CUSTOM-<sha256_prefix>).
 * Pass `toolType` when available; falls back to allow-list for legacy callers that only have a tool ID string.
 */
export function normalizeToolIdForTelemetry(toolId: string, toolType?: ToolType | string): string {
  const isBuiltin =
    toolType === ToolType.builtin ||
    (BUILTIN_TOOL_IDS as Set<string>).has(toolId) ||
    isInternalTool(toolId);
  return isBuiltin ? toolId : toCustomHashedId(toolId);
}

/**
 * Normalizes plugin IDs for telemetry to protect user privacy.
 * All plugin IDs (typically randomUUIDs) are reported as a stable hashed label
 * ("custom-<sha256_prefix>"). Mirrors the agent/tool normalization scheme.
 */
export function normalizePluginIdForTelemetry(pluginId?: string): string | undefined {
  if (!pluginId) {
    return undefined;
  }
  return toPluginHashedId(pluginId);
}

/**
 * Normalizes a skill ID for telemetry. Built-in (read-only) skills keep their ID
 * since they map to a known set of identifiers. Custom skills are hashed.
 * Plugin-backed skills get a `plugin-<plugin_id_hash>-<sha256_prefix>` label so
 * downstream analysis can attribute invocations to a specific plugin without
 * exposing user-chosen IDs.
 */
export function normalizeSkillIdForTelemetry(skill: {
  id: string;
  readonly: boolean;
  plugin_id?: string;
}): string {
  if (skill.readonly) {
    return skill.id;
  }
  if (skill.plugin_id) {
    const pluginHash = toPluginHashedId(skill.plugin_id);
    const skillHash = sha256Hex(skill.id).slice(0, CUSTOM_HASH_HEX_LENGTH);
    return `${pluginHash}-${skillHash}`;
  }
  return toCustomHashedId(skill.id);
}

/**
 * Classifies a skill into an `origin` and `solution_area` for telemetry.
 *
 * - `origin`: `plugin` if the skill was installed from a plugin, `builtin` if
 *   it's a read-only built-in skill, otherwise `custom`.
 * - `solution_area`: derived from `basePath` for built-ins
 *   (`skills/security/...` → `security`, `skills/observability/...` →
 *   `observability`, `skills/search/...` → `search`, `skills/platform/...` →
 *   `platform`); literal `custom` for user-created; `plugin` for plugin-backed.
 */
export function classifySkill(
  skill: Pick<InternalSkillDefinition, 'readonly' | 'plugin_id' | 'basePath'>
): {
  origin: SkillInvocationOrigin;
  solution_area: SkillSolutionArea;
} {
  if (skill.plugin_id) {
    return { origin: 'plugin', solution_area: 'plugin' };
  }
  if (!skill.readonly) {
    return { origin: 'custom', solution_area: 'custom' };
  }
  return { origin: 'builtin', solution_area: solutionAreaFromBasePath(skill.basePath) };
}

function solutionAreaFromBasePath(basePath: string): SkillSolutionArea {
  const normalized = basePath.replace(/^\/+/, '');
  if (normalized.startsWith('skills/security')) {
    return 'security';
  }
  if (normalized.startsWith('skills/observability')) {
    return 'observability';
  }
  if (normalized.startsWith('skills/search')) {
    return 'search';
  }
  if (normalized.startsWith('skills/platform')) {
    return 'platform';
  }
  return 'unknown';
}
