/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { internalTools, ToolType } from '@kbn/agent-builder-common';
import { createErrorResult, createOtherResult } from '@kbn/agent-builder-server';
import type {
  AgentBuilderAnalytics,
  AgentBuilderTracking,
  BuiltinToolDefinition,
  ToolReturnSummarizerFn,
} from '@kbn/agent-builder-server';
import { loadSkillTools } from '../../../skills/load_skill_tools';
import { resolveSkill } from '../../../skills/utils';
import {
  getSkillAbsolutePath,
  getSkillReferencedContentAbsolutePath,
} from '../../runner/store/volumes/skills/utils';

const schema = z.object({
  skill: z.string().describe('The skill name or path'),
});

/**
 * Identity transform. Returning the original results unchanged causes the
 * conversation result transformer to mark them as cleaned, which opts the
 * tool's results out of filestore substitution at high context usage.
 */
const preserveResults: ToolReturnSummarizerFn = (toolReturn) => toolReturn.results;

export const createLoadSkillTool = ({
  analyticsService,
  trackingService,
}: {
  analyticsService?: AgentBuilderAnalytics;
  trackingService?: AgentBuilderTracking;
} = {}): BuiltinToolDefinition<typeof schema> => ({
  id: internalTools.loadSkill,
  description: `Load a skill.

Returns the skill content, its referenced files, and the list of tools the skill makes available.
Loading a skill also dynamically registers its specialized tools so you can use them in subsequent calls.

The 'skill' parameter accepts the skill name, the full path of the skill's folder, or the full path of the skill's SKILL.md file.`,
  type: ToolType.builtin,
  schema,
  tags: ['skills'],
  summarizeToolReturn: preserveResults,
  handler: async ({ skill: skillInput }, ctx) => {
    const { skills, toolProvider, toolManager, request, logger, runContext } = ctx;

    const allSkills = await skills.list({ includePlugins: true });
    const resolution = resolveSkill(skillInput, allSkills);

    if ('error' in resolution) {
      return { results: [createErrorResult(resolution.error)] };
    }

    const skill = resolution.match;

    let loadedToolIds: string[];
    try {
      loadedToolIds = await loadSkillTools({
        skill,
        skillsService: skills,
        toolProvider,
        request,
        toolManager,
        logger,
        runContext,
        analyticsService,
        trackingService,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        results: [createErrorResult(`Failed to load skill '${skill.name}': ${message}`)],
      };
    }

    return {
      results: [
        createOtherResult({
          skill: {
            id: skill.id,
            name: skill.name,
            path: getSkillAbsolutePath({ skill }),
          },
          content: skill.content,
          referenced_files: (skill.referencedContent ?? []).map((rc) => ({
            name: rc.name,
            path: getSkillReferencedContentAbsolutePath({ skill, referencedContent: rc }),
          })),
          loaded_tools: loadedToolIds,
        }),
      ],
    };
  },
});
