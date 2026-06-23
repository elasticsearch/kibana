/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { defineSkillType } from '@kbn/agent-builder-server/skills/type_definition';
import type { SkillBoundedTool } from '@kbn/agent-builder-server/skills/tools';
import { createMemoryTools } from '../../tools/memory';
import type { MemoryToolsOptions } from '../../tools/memory';
import { createSearchKnowledgeIndicatorsTool } from '../../tools/search_knowledge_indicators/tool';
import { STREAMS_INSPECT_STREAMS_TOOL_ID } from '../../tools/register_tools';
import description from './gap_detection.description.text';
import content from './gap_detection.skill.md.text';

export const createGapDetectionSkill = (options: MemoryToolsOptions) =>
  defineSkillType({
    id: 'streams-gap-detection',
    name: 'streams-gap-detection',
    basePath: 'skills/platform/streams',
    description,
    content,
    getInlineTools: () => {
      const allowedMemoryToolIds = [
        'platform_streams_memory_list',
        'platform_streams_memory_read',
        'platform_streams_memory_search',
        'platform_streams_memory_write',
      ];
      const memoryTools = createMemoryTools(options)
        .map(({ tags, id, ...rest }) => ({
          ...rest,
          id: id.replaceAll('.', '_'),
        }))
        .filter((tool) => allowedMemoryToolIds.includes(tool.id));

      const extraTools: SkillBoundedTool[] = [];
      if (options.getScopedClients && options.server && options.logger) {
        const { availability: _availability, ...kiTool } = createSearchKnowledgeIndicatorsTool({
          getScopedClients: options.getScopedClients,
          server: options.server,
          logger: options.logger,
        });
        extraTools.push({
          ...kiTool,
          id: kiTool.id.replaceAll('.', '_'),
          experimental: false,
        } as SkillBoundedTool);
      }

      return [...memoryTools, ...extraTools];
    },
    getRegistryTools: () => [STREAMS_INSPECT_STREAMS_TOOL_ID, 'platform.workflows.get_connectors'],
  });
