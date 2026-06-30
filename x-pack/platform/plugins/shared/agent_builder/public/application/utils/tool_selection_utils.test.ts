/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ToolSelection,
  ToolSelectionRelevantFields,
  ToolDefinition,
} from '@kbn/agent-builder-common';
import {
  ToolType,
  allToolsSelectionWildcard,
  elasticCapabilitiesExcludedBuiltinSkillIds,
} from '@kbn/agent-builder-common';
import {
  toggleToolSelection,
  isToolSelected,
  getActiveTools,
  getActiveSkills,
  getActivePlugins,
  cleanInvalidToolReferences,
} from './tool_selection_utils';
import type { AgentEditState } from '../hooks/agents/use_agent_edit';

describe('tool_selection_utils', () => {
  const mockTools: ToolSelectionRelevantFields[] = [
    {
      id: 'tool1',
    },
    {
      id: 'tool2',
    },
    {
      id: 'tool3',
    },
  ];

  describe('isToolSelected', () => {
    it('should return true when tool is individually selected', () => {
      const selectedTools: ToolSelection[] = [{ tool_ids: ['tool1'] }];

      expect(isToolSelected(mockTools[0], selectedTools)).toBe(true);
      expect(isToolSelected(mockTools[1], selectedTools)).toBe(false);
    });

    it('should return true when tool is selected via wildcard', () => {
      const selectedTools: ToolSelection[] = [{ tool_ids: [allToolsSelectionWildcard] }];

      expect(isToolSelected(mockTools[0], selectedTools)).toBe(true);
      expect(isToolSelected(mockTools[1], selectedTools)).toBe(true);
      expect(isToolSelected(mockTools[2], selectedTools)).toBe(true);
    });
  });

  describe('toggleToolSelection', () => {
    it('should add tool to empty selection', () => {
      const selectedTools: ToolSelection[] = [{ tool_ids: [] }];
      const result = toggleToolSelection('tool1', mockTools, selectedTools);

      expect(result).toHaveLength(1);
      expect(result[0].tool_ids).toContain('tool1');
    });

    it('should remove tool from selection', () => {
      const selectedTools: ToolSelection[] = [{ tool_ids: ['tool1', 'tool2'] }];
      const result = toggleToolSelection('tool1', mockTools, selectedTools);

      expect(result).toHaveLength(1);
      expect(result[0].tool_ids).not.toContain('tool1');
      expect(result[0].tool_ids).toContain('tool2');
    });

    it('should handle wildcard selection correctly', () => {
      const selectedTools: ToolSelection[] = [{ tool_ids: [allToolsSelectionWildcard] }];
      const result = toggleToolSelection('tool1', mockTools, selectedTools);

      // Should remove tool1 and include other available tools
      expect(result).toHaveLength(1);
      expect(result[0].tool_ids).not.toContain('tool1');
      expect(result[0].tool_ids).toContain('tool2');
      expect(result[0].tool_ids).toContain('tool3');
      expect(result[0].tool_ids).not.toContain(allToolsSelectionWildcard);
    });
  });

  describe('getActiveTools', () => {
    const defaultToolIds = new Set(['tool1', 'tool3']);

    it('should return only explicitly selected tools when elastic capabilities are disabled', () => {
      const selections: ToolSelection[] = [{ tool_ids: ['tool2'] }];
      const result = getActiveTools(mockTools, selections, false, defaultToolIds);

      expect(result.map((t) => t.id)).toEqual(['tool2']);
    });

    it('should include default tools when elastic capabilities are enabled', () => {
      const selections: ToolSelection[] = [{ tool_ids: ['tool2'] }];
      const result = getActiveTools(mockTools, selections, true, defaultToolIds);

      expect(result.map((t) => t.id)).toEqual(['tool2', 'tool1', 'tool3']);
    });

    it('should not duplicate tools that are both explicit and default', () => {
      const selections: ToolSelection[] = [{ tool_ids: ['tool1', 'tool2'] }];
      const result = getActiveTools(mockTools, selections, true, defaultToolIds);

      expect(result.map((t) => t.id)).toEqual(['tool1', 'tool2', 'tool3']);
    });

    it('should return empty array when no tools match selections', () => {
      const selections: ToolSelection[] = [{ tool_ids: [] }];
      const result = getActiveTools(mockTools, selections, false, defaultToolIds);

      expect(result).toEqual([]);
    });

    it('should return only default tools when no explicit selections and elastic capabilities are enabled', () => {
      const selections: ToolSelection[] = [{ tool_ids: [] }];
      const result = getActiveTools(mockTools, selections, true, defaultToolIds);

      expect(result.map((t) => t.id)).toEqual(['tool1', 'tool3']);
    });

    it('should handle wildcard selections with elastic capabilities', () => {
      const selections: ToolSelection[] = [{ tool_ids: [allToolsSelectionWildcard] }];
      const result = getActiveTools(mockTools, selections, true, defaultToolIds);

      // All tools already selected via wildcard, no defaults to append
      expect(result.map((t) => t.id)).toEqual(['tool1', 'tool2', 'tool3']);
    });
  });

  describe('getActiveSkills', () => {
    const mockSkills = [
      { id: 'skill1', readonly: true },
      { id: 'skill2', readonly: false },
      { id: 'skill3', readonly: true },
      { id: 'skill4', readonly: false },
    ];

    it('should return only explicitly selected skills when elastic capabilities are disabled', () => {
      const result = getActiveSkills(mockSkills, ['skill2'], false);

      expect(result.map((s) => s.id)).toEqual(['skill2']);
    });

    it('should include built-in (readonly) skills when elastic capabilities are enabled', () => {
      const result = getActiveSkills(mockSkills, ['skill2'], true);

      expect(result.map((s) => s.id)).toEqual(['skill2', 'skill1', 'skill3']);
    });

    it('should not duplicate skills that are both explicit and readonly', () => {
      const result = getActiveSkills(mockSkills, ['skill1', 'skill2'], true);

      expect(result.map((s) => s.id)).toEqual(['skill1', 'skill2', 'skill3']);
    });

    it('should return empty array when explicit ids is undefined and capabilities are disabled', () => {
      const result = getActiveSkills(mockSkills, undefined, false);

      expect(result).toEqual([]);
    });

    it('should return only built-in skills when explicit ids is undefined and capabilities are enabled', () => {
      const result = getActiveSkills(mockSkills, undefined, true);

      expect(result.map((s) => s.id)).toEqual(['skill1', 'skill3']);
    });

    it('should not auto-include elastic-capabilities-excluded built-in skills', () => {
      const skillsWithExcluded = [
        ...mockSkills,
        { id: elasticCapabilitiesExcludedBuiltinSkillIds[0], readonly: true },
      ];

      const result = getActiveSkills(skillsWithExcluded, undefined, true);

      expect(result.map((s) => s.id)).toEqual(['skill1', 'skill3']);
    });

    it('should include excluded built-in skills when explicitly selected', () => {
      const excludedId = elasticCapabilitiesExcludedBuiltinSkillIds[0];
      const skillsWithExcluded = [...mockSkills, { id: excludedId, readonly: true }];

      const result = getActiveSkills(skillsWithExcluded, [excludedId], true);

      expect(result.map((s) => s.id)).toEqual([excludedId, 'skill1', 'skill3']);
    });

    it('should return empty array when explicit ids is empty and capabilities are disabled', () => {
      const result = getActiveSkills(mockSkills, [], false);

      expect(result).toEqual([]);
    });
  });

  describe('getActivePlugins', () => {
    const mockPlugins = [
      { id: 'plugin1', readonly: true },
      { id: 'plugin2', readonly: false },
      { id: 'plugin3', readonly: true },
      { id: 'plugin4', readonly: false },
    ];

    it('should return only explicitly selected plugins when elastic capabilities are disabled', () => {
      const result = getActivePlugins(mockPlugins, ['plugin2'], false);

      expect(result.map((p) => p.id)).toEqual(['plugin2']);
    });

    it('should include built-in (readonly) plugins when elastic capabilities are enabled', () => {
      const result = getActivePlugins(mockPlugins, ['plugin2'], true);

      expect(result.map((p) => p.id)).toEqual(['plugin2', 'plugin1', 'plugin3']);
    });

    it('should not duplicate plugins that are both explicit and readonly', () => {
      const result = getActivePlugins(mockPlugins, ['plugin1', 'plugin2'], true);

      expect(result.map((p) => p.id)).toEqual(['plugin1', 'plugin2', 'plugin3']);
    });

    it('should return empty array when explicit ids is undefined and capabilities are disabled', () => {
      const result = getActivePlugins(mockPlugins, undefined, false);

      expect(result).toEqual([]);
    });

    it('should return only built-in plugins when explicit ids is undefined and capabilities are enabled', () => {
      const result = getActivePlugins(mockPlugins, undefined, true);

      expect(result.map((p) => p.id)).toEqual(['plugin1', 'plugin3']);
    });

    it('should return empty array when explicit ids is empty and capabilities are disabled', () => {
      const result = getActivePlugins(mockPlugins, [], false);

      expect(result).toEqual([]);
    });
  });

  describe('cleanInvalidToolReferences', () => {
    const mockToolDefinitions: ToolDefinition[] = [
      {
        id: 'tool1',
        type: ToolType.esql,
        description: 'Tool 1',
        readonly: false,
        experimental: false,
        tags: [],
        configuration: {},
      },
      {
        id: 'tool2',
        type: ToolType.esql,
        description: 'Tool 2',
        readonly: false,
        experimental: false,
        tags: [],
        configuration: {},
      },
      {
        id: 'tool3',
        type: ToolType.esql,
        description: 'Tool 3',
        readonly: false,
        experimental: false,
        tags: [],
        configuration: {},
      },
    ];

    const createAgentData = (toolIds: string[][]): AgentEditState => ({
      id: 'test-agent',
      name: 'Test Agent',
      description: 'Test',
      labels: [],
      avatar_color: '',
      avatar_symbol: '',
      configuration: {
        instructions: '',
        tools: toolIds.map((ids) => ({ tool_ids: ids })),
      },
    });

    it('should remove non-existent tool IDs and preserve valid ones', () => {
      const data = createAgentData([['tool1', 'invalid_tool', 'tool2']]);
      const result = cleanInvalidToolReferences(data, mockToolDefinitions);

      expect(result.configuration.tools).toEqual([{ tool_ids: ['tool1', 'tool2'] }]);
    });

    it('should preserve wildcard selection while removing invalid tools', () => {
      const data = createAgentData([['*', 'invalid_tool']]);
      const result = cleanInvalidToolReferences(data, mockToolDefinitions);

      expect(result.configuration.tools).toEqual([{ tool_ids: ['*'] }]);
    });

    it('should remove empty selections after filtering out invalid tools', () => {
      const data = createAgentData([['tool1'], ['invalid_tool'], ['tool2']]);
      const result = cleanInvalidToolReferences(data, mockToolDefinitions);

      expect(result.configuration.tools).toEqual([
        { tool_ids: ['tool1'] },
        { tool_ids: ['tool2'] },
      ]);
    });

    it('should return empty array when all tool references are invalid', () => {
      const data = createAgentData([['invalid1', 'invalid2']]);
      const result = cleanInvalidToolReferences(data, mockToolDefinitions);

      expect(result.configuration.tools).toEqual([]);
    });
  });
});
