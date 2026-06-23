/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { internalTools, ToolOrigin, ToolResultType, ToolType } from '@kbn/agent-builder-common';
import { isExcludedFromFilestore, isInternalTool } from '@kbn/agent-builder-common/tools';
import { ToolManagerToolType } from '@kbn/agent-builder-server/runner';
import type { InternalSkillDefinition, SkillBoundedTool } from '@kbn/agent-builder-server/skills';
import {
  createToolHandlerContextMock,
  type ToolHandlerContextMock,
} from '../../../../test_utils/runner';
import { getSkillReferencedContentAbsolutePath } from '../../runner/store/volumes/skills/utils';
import { createLoadSkillTool } from './load_skill';

const callHandler = (
  tool: ReturnType<typeof createLoadSkillTool>,
  params: { skill: string },
  ctx: ToolHandlerContextMock
) => tool.handler(params, ctx) as Promise<{ results: any[] }>;

const createMockSkill = (
  overrides: Partial<InternalSkillDefinition> = {}
): InternalSkillDefinition => ({
  id: 'test-skill',
  name: 'my-skill',
  description: 'A test skill',
  content: 'skill content body',
  readonly: true,
  basePath: 'skills/platform',
  getRegistryTools: jest.fn().mockReturnValue([]),
  getInlineTools: jest.fn().mockReturnValue([]),
  referencedContentCount: 0,
  experimental: false,
  ...overrides,
});

describe('load_skill tool', () => {
  let ctx: ToolHandlerContextMock;

  beforeEach(() => {
    ctx = createToolHandlerContextMock();
  });

  it('has the expected tool id and is recognized as internal', () => {
    const tool = createLoadSkillTool();
    expect(tool.id).toBe(internalTools.loadSkill);
    expect(tool.id).toBe('load_skill');
    expect(isInternalTool(tool.id)).toBe(true);
    expect(isExcludedFromFilestore(tool.id)).toBe(true);
  });

  it('returns content + metadata for a unique-by-name skill', async () => {
    const skill = createMockSkill();
    ctx.skills.list.mockResolvedValue([skill]);

    const tool = createLoadSkillTool();
    const result = await callHandler(tool, { skill: 'my-skill' }, ctx);

    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe(ToolResultType.other);
    expect(result.results[0]).toMatchObject({
      data: {
        skill: {
          id: 'test-skill',
          name: 'my-skill',
          path: '/skills/platform/my-skill/SKILL.md',
        },
        content: 'skill content body',
        referenced_files: [],
        loaded_tools: [],
      },
    });
  });

  it('surfaces resolveSkill errors as error tool results', async () => {
    ctx.skills.list.mockResolvedValue([]);
    const tool = createLoadSkillTool();
    const result = await callHandler(tool, { skill: 'nope' }, ctx);

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect((result.results[0] as any).data.message).toBe("Skill 'nope' not found.");
  });

  it('registers inline + registry tools into the tool manager and returns their ids', async () => {
    const inlineTool = { id: 'inline-1', type: ToolType.builtin } as SkillBoundedTool;
    const convertedInline = { id: 'inline-1' } as any;
    const registryTool = { id: 'registry-1' } as any;

    const skill = createMockSkill({
      getInlineTools: jest.fn().mockReturnValue([inlineTool]),
      getRegistryTools: jest.fn().mockReturnValue(['registry-1']),
    });

    ctx.skills.list.mockResolvedValue([skill]);
    ctx.skills.convertSkillTool.mockReturnValue(convertedInline);
    ctx.toolProvider.list.mockResolvedValue([registryTool]);

    const tool = createLoadSkillTool();
    const result = await callHandler(tool, { skill: 'my-skill' }, ctx);

    expect(ctx.toolManager.addTools).toHaveBeenCalledWith(
      {
        type: ToolManagerToolType.executable,
        tools: [
          { ...convertedInline, origin: ToolOrigin.inline },
          { ...registryTool, origin: ToolOrigin.registry },
        ],
        logger: ctx.logger,
      },
      { dynamic: true }
    );
    expect((result.results[0] as any).data.loaded_tools).toEqual(['inline-1', 'registry-1']);
  });

  it('includes referenced files in the response', async () => {
    const referencedContent = {
      name: 'patterns',
      relativePath: 'docs',
      content: 'patterns content',
    };
    const skill = createMockSkill({
      referencedContent: [referencedContent as any],
    });
    ctx.skills.list.mockResolvedValue([skill]);

    const tool = createLoadSkillTool();
    const result = await callHandler(tool, { skill: 'my-skill' }, ctx);

    expect((result.results[0] as any).data.referenced_files).toEqual([
      {
        name: 'patterns',
        path: getSkillReferencedContentAbsolutePath({ skill, referencedContent }),
      },
    ]);
  });

  it('returns an error result when the helper exceeds the 25-tool registry limit', async () => {
    const tooMany = Array.from({ length: 26 }, (_, i) => `t-${i}`);
    const skill = createMockSkill({
      getRegistryTools: jest.fn().mockReturnValue(tooMany),
    });
    ctx.skills.list.mockResolvedValue([skill]);

    const tool = createLoadSkillTool();
    const result = await callHandler(tool, { skill: 'my-skill' }, ctx);

    expect(result.results[0].type).toBe(ToolResultType.error);
    expect((result.results[0] as any).data.message).toMatch(
      /Failed to load skill 'my-skill'.+exceeding the 25-tool limit/
    );
  });

  it('passes telemetry services through to the helper, which calls them', async () => {
    const skill = createMockSkill({ id: 'sec-skill', basePath: 'skills/security' });
    ctx.skills.list.mockResolvedValue([skill]);
    ctx.runContext = {
      runId: 'run-1',
      stack: [{ type: 'agent', agentId: 'a1', conversationId: 'c1', executionId: 'e1' }],
    } as any;

    const analyticsService = { reportSkillInvoked: jest.fn() };
    const trackingService = { trackSkillInvocation: jest.fn() };

    const tool = createLoadSkillTool({ analyticsService, trackingService });
    await callHandler(tool, { skill: 'my-skill' }, ctx);

    expect(analyticsService.reportSkillInvoked).toHaveBeenCalledWith(
      expect.objectContaining({ skillId: 'sec-skill', agentId: 'a1' })
    );
    expect(trackingService.trackSkillInvocation).toHaveBeenCalled();
  });

  it('does not throw when telemetry services are omitted', async () => {
    const skill = createMockSkill();
    ctx.skills.list.mockResolvedValue([skill]);

    const tool = createLoadSkillTool();
    await expect(callHandler(tool, { skill: 'my-skill' }, ctx)).resolves.toBeDefined();
  });

  it('exposes an identity summarizeToolReturn that returns the original results unchanged', () => {
    const tool = createLoadSkillTool();
    expect(tool.summarizeToolReturn).toBeDefined();

    const toolCall = {
      tool_id: 'load_skill',
      tool_call_id: 'call-1',
      params: { name: 'my-skill' },
      results: [
        {
          tool_result_id: 'r-1',
          type: 'other' as const,
          data: { foo: 'bar' },
        },
      ],
    };

    expect(tool.summarizeToolReturn!(toolCall as any)).toBe(toolCall.results);
  });
});
