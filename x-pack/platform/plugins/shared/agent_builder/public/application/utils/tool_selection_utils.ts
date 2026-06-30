/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ToolDefinition,
  ToolSelection,
  ToolSelectionRelevantFields,
} from '@kbn/agent-builder-common';
import {
  allToolsSelectionWildcard,
  isElasticCapabilitiesExcludedBuiltinSkill,
  toolMatchSelection,
} from '@kbn/agent-builder-common';
import type { AgentEditState } from '../hooks/agents/use_agent_edit';

/**
 * Check if a specific tool is selected based on the current tool selections.
 * This uses existing agent-builder-common utilities for consistent logic.
 */
export const isToolSelected = (
  tool: ToolSelectionRelevantFields,
  selectedTools: ToolSelection[]
): boolean => {
  return selectedTools.some((selection) => toolMatchSelection(tool, selection));
};

/**
 * Toggle selection for a specific tool.
 */
export const toggleToolSelection = (
  toolId: string,
  allAvailableTools: ToolSelectionRelevantFields[],
  selectedTools: ToolSelection[]
): ToolSelection[] => {
  const currentTool: ToolSelectionRelevantFields = {
    id: toolId,
  };

  const isCurrentlySelected = isToolSelected(currentTool, selectedTools);

  if (isCurrentlySelected) {
    // Check if this tool is selected via wildcard
    const wildcardSelection = selectedTools.find((selection) =>
      selection.tool_ids.includes(allToolsSelectionWildcard)
    );

    if (wildcardSelection) {
      // Replace wildcard with individual tool selections (excluding the one being toggled off)
      const otherToolIds = allAvailableTools
        .filter((tool) => tool.id !== toolId)
        .map((tool) => tool.id);

      const otherSelections = selectedTools.filter(
        (selection) => !selection.tool_ids.includes(allToolsSelectionWildcard)
      );

      if (otherToolIds.length > 0) {
        return [...otherSelections, { tool_ids: otherToolIds }];
      }
      return otherSelections;
    } else {
      // Remove from individual selections
      return selectedTools
        .map((selection) => {
          if (selection.tool_ids.includes(toolId)) {
            const newToolIds = selection.tool_ids.filter((id) => id !== toolId);
            return newToolIds.length > 0 ? { ...selection, tool_ids: newToolIds } : null;
          }
          return selection;
        })
        .filter(Boolean) as ToolSelection[];
    }
  } else {
    // Add the tool to selection
    const existingSelection = selectedTools.find(
      (selection) => !selection.tool_ids.includes(allToolsSelectionWildcard)
    );

    if (existingSelection && !existingSelection.tool_ids.includes(toolId)) {
      // Add to existing non-wildcard selection
      return selectedTools.map((selection) =>
        selection === existingSelection
          ? { ...selection, tool_ids: [...selection.tool_ids, toolId] }
          : selection
      );
    } else {
      // Create new selection
      const otherSelections = selectedTools.filter(
        (selection) => !selection.tool_ids.includes(toolId)
      );
      return [...otherSelections, { tool_ids: [toolId] }];
    }
  }
};

/**
 * Returns the list of active tools for an agent, combining explicitly selected tools
 * with default tools when elastic capabilities are enabled. Default tools that are
 * already explicitly selected are not duplicated.
 */
export const getActiveTools = <T extends ToolSelectionRelevantFields>(
  allTools: T[],
  agentToolSelections: ToolSelection[],
  enableElasticCapabilities: boolean,
  defaultToolIds: Set<string>
): T[] => {
  const explicitTools = allTools.filter((t) => isToolSelected(t, agentToolSelections));
  if (enableElasticCapabilities) {
    const explicitIdSet = new Set(explicitTools.map((t) => t.id));
    const defaultToolsNotExplicit = allTools.filter(
      (t) => defaultToolIds.has(t.id) && !explicitIdSet.has(t.id)
    );
    return [...explicitTools, ...defaultToolsNotExplicit];
  }
  return explicitTools;
};

/**
 * Returns the list of active skills for an agent, combining explicitly selected skills
 * with built-in (readonly) skills when elastic capabilities are enabled. Built-in skills
 * that are already explicitly selected are not duplicated.
 */
export const getActiveSkills = <T extends { id: string; readonly: boolean }>(
  allSkills: T[],
  agentSkillIds: string[] | undefined,
  enableElasticCapabilities: boolean
): T[] => {
  const explicitIds = new Set(agentSkillIds ?? []);
  const explicitSkills = allSkills.filter((s) => explicitIds.has(s.id));
  if (!enableElasticCapabilities) return explicitSkills;
  const builtinNotExplicit = allSkills.filter(
    (s) => s.readonly && !explicitIds.has(s.id) && !isElasticCapabilitiesExcludedBuiltinSkill(s.id)
  );
  return [...explicitSkills, ...builtinNotExplicit];
};

/**
 * Returns the list of active plugins for an agent, combining explicitly selected plugins
 * with built-in (readonly) plugins when elastic capabilities are enabled. Built-in plugins
 * that are already explicitly selected are not duplicated.
 */
export const getActivePlugins = <T extends { id: string; readonly: boolean }>(
  allPlugins: T[],
  agentPluginIds: string[] | undefined,
  enableElasticCapabilities: boolean
): T[] => {
  const explicitIds = new Set(agentPluginIds ?? []);
  const explicitPlugins = allPlugins.filter((p) => explicitIds.has(p.id));
  if (!enableElasticCapabilities) return explicitPlugins;
  const builtinNotExplicit = allPlugins.filter((p) => p.readonly && !explicitIds.has(p.id));
  return [...explicitPlugins, ...builtinNotExplicit];
};

/**
 * Removes invalid tool references from the agent configuration.
 * Filters out tool IDs that don't exist in the available tools list,
 * while preserving wildcard selections and removing empty selections.
 */
export function cleanInvalidToolReferences(
  data: AgentEditState,
  availableTools: ToolDefinition[]
): AgentEditState {
  const validToolIds = new Set(availableTools.map((tool) => tool.id));
  const cleanedTools = data.configuration.tools
    .map((selection) => ({
      ...selection,
      tool_ids: selection.tool_ids.filter((id) => id === '*' || validToolIds.has(id)),
    }))
    .filter((selection) => selection.tool_ids.length > 0);

  return {
    ...data,
    configuration: {
      ...data.configuration,
      tools: cleanedTools,
    },
  };
}
