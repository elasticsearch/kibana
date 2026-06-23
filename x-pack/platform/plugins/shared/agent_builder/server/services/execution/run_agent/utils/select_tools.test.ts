/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolOrigin, ToolType } from '@kbn/agent-builder-common';
import type { ExecutableTool } from '@kbn/agent-builder-server';
import { selectTools } from './select_tools';

jest.mock('../../../tools/builtin/attachments', () => {
  // Keep mock dependencies local to the factory to satisfy Jest hoisting rules.
  const { z: mockZ } = jest.requireActual('@kbn/zod/v4');
  return {
    createAttachmentTools: jest.fn(() => [
      {
        id: 'attachments.read',
        description: 'attachment read',
        tags: [],
        schema: mockZ.object({}),
        handler: jest.fn(),
      },
    ]),
  };
});

const createExecutableTool = (id: string): ExecutableTool =>
  ({
    id,
    type: ToolType.builtin,
    description: `tool-${id}`,
    tags: [],
    readonly: false,
    configuration: {},
    getSchema: () => z.object({}),
    execute: jest.fn(),
  } as unknown as ExecutableTool);

describe('selectTools', () => {
  it('returns origin metadata for internal, registry, and inline tools', async () => {
    const staticRegistryTool = createExecutableTool('registry.static');
    const dynamicRegistryTool = createExecutableTool('registry.dynamic');
    const dynamicInlineTool = createExecutableTool('inline.dynamic');

    const skills = {
      convertSkillTool: jest.fn().mockReturnValue(dynamicInlineTool),
    } as any;

    const filteredSkills = [
      {
        getInlineTools: jest
          .fn()
          .mockResolvedValue([{ id: 'inline.dynamic', type: ToolType.builtin }]),
      },
    ] as any;

    const toolProvider = {
      list: jest.fn().mockResolvedValue([staticRegistryTool, dynamicRegistryTool]),
    } as any;

    const attachmentsService = {
      getTypeDefinition: jest.fn(),
    } as any;

    const result = await selectTools({
      conversation: {
        attachmentTypes: [],
        attachmentStateManager: {
          getActive: jest.fn().mockReturnValue([]),
        },
      } as any,
      previousDynamicToolIds: ['registry.dynamic', 'inline.dynamic'],
      filteredSkills,
      skills,
      request: {} as any,
      toolProvider,
      agentConfiguration: {
        tools: [{ tool_ids: ['registry.static'] }],
        enable_elastic_capabilities: false,
      } as any,
      attachmentsService,
      spaceId: 'default',
      runner: {
        runInternalTool: jest.fn(),
      } as any,
    });

    // Origins are now included in each selected tool payload passed to ToolManager.addTools.
    expect(result.staticTools.find((tool) => tool.id === 'attachments.read')?.origin).toBe(
      ToolOrigin.internal
    );
    expect(result.staticTools.find((tool) => tool.id === 'registry.static')?.origin).toBe(
      ToolOrigin.registry
    );
    expect(result.dynamicTools.find((tool) => tool.id === 'registry.dynamic')?.origin).toBe(
      ToolOrigin.registry
    );
    expect(result.dynamicTools.find((tool) => tool.id === 'inline.dynamic')?.origin).toBe(
      ToolOrigin.inline
    );
    expect(skills.convertSkillTool).toHaveBeenCalled();
  });

  it('marks attachment-bounded tools as inline origin', async () => {
    const boundedTool = {
      id: 'attachment.inline',
      type: ToolType.builtin,
    };
    const convertedBoundedTool = createExecutableTool('attachment.inline');
    const attachmentDefinition = {
      format: jest.fn().mockResolvedValue({
        getBoundedTools: jest.fn().mockResolvedValue([boundedTool]),
      }),
    };

    const attachmentsService = {
      getTypeDefinition: jest.fn().mockReturnValue(attachmentDefinition),
      convertAttachmentTool: jest.fn().mockReturnValue(convertedBoundedTool),
    } as any;

    const result = await selectTools({
      conversation: {
        attachmentTypes: [],
        attachmentStateManager: {
          getActive: jest.fn().mockReturnValue([
            {
              id: 'a-1',
              type: 'text',
              active: true,
              current_version: 1,
              versions: [{ version: 1, data: 'hello', created_at: 'now', content_hash: 'h' }],
            },
          ]),
        },
      } as any,
      previousDynamicToolIds: [],
      filteredSkills: [],
      skills: { convertSkillTool: jest.fn() } as any,
      request: {} as any,
      toolProvider: { list: jest.fn().mockResolvedValue([]) } as any,
      agentConfiguration: { tools: [], enable_elastic_capabilities: false } as any,
      attachmentsService,
      spaceId: 'default',
      runner: {
        runInternalTool: jest.fn(),
      } as any,
    });

    // Attachment-scoped bounded tools are treated as inline because they are not registry entries.
    expect(result.staticTools.find((tool) => tool.id === 'attachment.inline')?.origin).toBe(
      ToolOrigin.inline
    );
  });
});
