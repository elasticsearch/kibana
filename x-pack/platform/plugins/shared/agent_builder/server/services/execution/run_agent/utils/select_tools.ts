/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest } from '@kbn/core-http-server';
import { defaultAgentToolIds } from '@kbn/agent-builder-common';
import { ToolOrigin, ToolType, filterToolsBySelection } from '@kbn/agent-builder-common';
import type {
  ToolProvider,
  ExecutableTool,
  ScopedRunner,
  BuiltinToolDefinition,
} from '@kbn/agent-builder-server';
import type { AgentConfiguration, ToolSelection } from '@kbn/agent-builder-common';
import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import type { AttachmentsService, SkillsService } from '@kbn/agent-builder-server/runner';
import type { ExecutableToolWithOrigin } from '@kbn/agent-builder-server/runner/tool_manager';
import type { AttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import { getLatestVersion } from '@kbn/agent-builder-common/attachments';
import type { AttachmentFormatContext } from '@kbn/agent-builder-server/attachments';
import { createAttachmentTools } from '../../../tools/builtin/attachments';
import type { ProcessedConversation } from './prepare_conversation';

export interface SelectToolsResult {
  staticTools: ExecutableToolWithOrigin[];
  dynamicTools: ExecutableToolWithOrigin[];
}

export const selectTools = async ({
  conversation,
  previousDynamicToolIds,
  filteredSkills,
  skills,
  request,
  toolProvider,
  agentConfiguration,
  attachmentsService,
  spaceId,
  runner,
}: {
  conversation: ProcessedConversation;
  previousDynamicToolIds: string[];
  filteredSkills: InternalSkillDefinition[];
  skills: SkillsService;
  request: KibanaRequest;
  toolProvider: ToolProvider;
  attachmentsService: AttachmentsService;
  agentConfiguration: AgentConfiguration;
  spaceId: string;
  runner: ScopedRunner;
}): Promise<SelectToolsResult> => {
  const formatContext: AttachmentFormatContext = { request, spaceId };

  // create tool selection for attachments types
  const attachmentTypes = conversation.attachmentTypes.map((type) => type.type);
  const attachmentToolIds = getToolsForAttachmentTypes(attachmentTypes, attachmentsService);
  const attachmentToolSelection: ToolSelection = {
    tool_ids: attachmentToolIds,
  };

  const versionedAttachmentBoundTools = await getVersionedAttachmentBoundTools({
    attachmentStateManager: conversation.attachmentStateManager,
    attachmentsService,
    formatContext,
  });

  const versionedAttachmentTools = createVersionedAttachmentTools({
    attachmentStateManager: conversation.attachmentStateManager,
    attachmentsService,
    formatContext,
    runner,
  });

  // pick tools from provider (from agent config and attachment-type tools)
  const staticRegistryTools = await pickTools({
    selection: [
      attachmentToolSelection,
      ...agentConfiguration.tools,
      ...(agentConfiguration.enable_elastic_capabilities
        ? [{ tool_ids: defaultAgentToolIds }]
        : []),
    ],
    toolProvider,
    request,
  });

  const staticTools = [
    ...withOrigin(versionedAttachmentBoundTools, ToolOrigin.inline),
    ...withOrigin(versionedAttachmentTools, ToolOrigin.internal),
    ...withOrigin(staticRegistryTools, ToolOrigin.registry),
  ];

  const dedupedStaticTools = new Map<string, ExecutableToolWithOrigin>();
  for (const tool of staticTools) {
    dedupedStaticTools.set(tool.id, tool);
  }

  // Dynamic tools

  const dynamicRegistryTools = await pickTools({
    toolProvider,
    selection: [{ tool_ids: previousDynamicToolIds }],
    request,
  });

  const dynamicInlineTools = (
    await Promise.all(
      filteredSkills
        .filter((skill) => skill.getInlineTools !== undefined)
        .map((skill) => skill.getInlineTools!())
    )
  )
    .flat()
    .filter((tool) => previousDynamicToolIds.includes(tool.id))
    .map((tool) => skills.convertSkillTool(tool));

  return {
    staticTools: [...dedupedStaticTools.values()],
    dynamicTools: [
      ...withOrigin(dynamicRegistryTools, ToolOrigin.registry),
      ...withOrigin(dynamicInlineTools, ToolOrigin.inline),
    ],
  };
};

const withOrigin = (tools: ExecutableTool[], origin: ToolOrigin): ExecutableToolWithOrigin[] =>
  tools.map((tool) => ({ ...tool, origin }));

/**
 * Creates executable tools for managing versioned conversation attachments.
 * These tools allow the LLM to add, read, update, delete, restore, list, and diff attachments.
 */
const createVersionedAttachmentTools = ({
  attachmentStateManager,
  attachmentsService,
  formatContext,
  runner,
}: {
  attachmentStateManager: AttachmentStateManager;
  attachmentsService: AttachmentsService;
  formatContext: AttachmentFormatContext;
  runner: ScopedRunner;
}): ExecutableTool[] => {
  const builtinTools = createAttachmentTools({
    attachmentManager: attachmentStateManager,
    attachmentsService,
    formatContext,
  });
  return builtinTools.map((tool) => builtinToolToExecutable({ tool, runner }));
};

/**
 * Converts a builtin attachment tool to an executable tool that runs through the runner.
 */
export const builtinToolToExecutable = ({
  tool,
  runner,
}: {
  tool: BuiltinToolDefinition;
  runner: ScopedRunner;
}): ExecutableTool => {
  return {
    id: tool.id,
    type: ToolType.builtin,
    description: tool.description,
    tags: tool.tags,
    configuration: {},
    readonly: true,
    experimental: tool.experimental ?? false,
    getSchema: () => tool.schema,
    summarizeToolReturn: tool.summarizeToolReturn,
    execute: async (params) => {
      return runner.runInternalTool({
        ...params,
        tool: {
          id: tool.id,
          type: ToolType.builtin,
          description: tool.description,
          tags: tool.tags,
          configuration: {},
          readonly: true,
          experimental: tool.experimental ?? false,
          confirmation: { askUser: 'never' },
          isAvailable: async () => ({ status: 'available' as const }),
          getSchema: () => tool.schema,
          getHandler: () => tool.handler,
        },
      });
    },
  };
};

const getVersionedAttachmentBoundTools = async ({
  attachmentStateManager,
  attachmentsService,
  formatContext,
}: {
  attachmentStateManager: AttachmentStateManager;
  attachmentsService: AttachmentsService;
  formatContext: AttachmentFormatContext;
}): Promise<ExecutableTool[]> => {
  const tools: ExecutableTool[] = [];

  for (const attachment of attachmentStateManager.getActive()) {
    const latest = getLatestVersion(attachment);
    if (!latest) {
      continue;
    }

    const definition = attachmentsService.getTypeDefinition(attachment.type);
    if (!definition) {
      continue;
    }

    const input: Attachment = {
      id: attachment.id,
      type: attachment.type,
      data: latest.data as Attachment['data'],
      ...(attachment.hidden !== undefined ? { hidden: attachment.hidden } : {}),
    };

    try {
      const formatted = await definition.format(input, formatContext);
      const boundedTools = formatted.getBoundedTools ? await formatted.getBoundedTools() : [];
      for (const tool of boundedTools) {
        tools.push(attachmentsService.convertAttachmentTool(tool));
      }
    } catch {
      // Ignore formatting errors; bounded tools are optional.
    }
  }

  return tools;
};

const getToolsForAttachmentTypes = (
  attachmentTypes: string[],
  attachmentsService: AttachmentsService
): string[] => {
  const tools = new Set<string>();

  for (const type of attachmentTypes) {
    const definition = attachmentsService.getTypeDefinition(type);
    if (definition && definition.getTools) {
      const definitionTools = definition.getTools();
      definitionTools.forEach((toolId) => tools.add(toolId));
    }
  }

  return [...tools];
};

export const pickTools = async ({
  toolProvider,
  selection,
  request,
}: {
  toolProvider: ToolProvider;
  selection: ToolSelection[];
  request: KibanaRequest;
}): Promise<ExecutableTool[]> => {
  const tools = await toolProvider.list({ request });
  return filterToolsBySelection(tools, selection);
};
