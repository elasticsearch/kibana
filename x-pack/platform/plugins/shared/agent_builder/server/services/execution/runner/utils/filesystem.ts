/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExperimentalFeatures } from '@kbn/agent-builder-server';
import { ToolOrigin } from '@kbn/agent-builder-common';
import { FilesystemService, WorkspaceVolume } from '../../filesystem';
import { BashService } from '../../run_agent/bash';
import { WorkspaceClient, createWorkspaceStorage } from '../../../workspaces';
import type { RunnerManager } from '../runner';

/**
 * Build the agent's filesystem services for a single agent run:
 *  - `FilesystemService` — always created; owns the unified `IFileSystem`.
 *  - `BashService` — created only when `experimentalFeatures.bash` is on.
 */
export const createFilesystemServices = async ({
  manager,
  experimentalFeatures,
  workspaceId,
  spaceId,
}: {
  manager: RunnerManager;
  experimentalFeatures: ExperimentalFeatures;
  workspaceId?: string;
  spaceId: string;
}): Promise<{
  filesystemService: FilesystemService;
  bashService?: BashService;
}> => {
  const { elasticsearch, request, logger, resultStore, skillsStore, toolManager } = manager.deps;

  const workspaceStorage = createWorkspaceStorage({
    logger,
    esClient: elasticsearch.client.asScoped(request).asInternalUser,
  });
  const workspaceClient = new WorkspaceClient({ storage: workspaceStorage, space: spaceId });
  const workspaceVolume = new WorkspaceVolume({
    workspaceClient,
    initialWorkspaceId: workspaceId,
  });

  const filesystemService = new FilesystemService({
    workspaceVolume,
    toolResultsSource: resultStore,
    skillsSource: skillsStore,
  });
  await filesystemService.init();

  if (!experimentalFeatures.bash) {
    return { filesystemService };
  }

  const bashService = new BashService({
    filesystemService,
    workspaceVolume,
    execToolFn: async (toolId, args) => {
      const tool = toolManager.getExecutable(toolId);
      if (!tool) {
        throw new Error(`tool '${toolId}' is not available`);
      }
      const { origin } = toolManager.getToolMeta(toolId);
      if (origin === ToolOrigin.internal) {
        throw new Error(`tool '${toolId}' can't be called via bash`);
      }
      return tool.execute({
        toolParams: (args ?? {}) as Record<string, unknown>,
        source: 'agent',
      });
    },
    resolveToolId: (id) => toolManager.getToolIdMapping().get(id) ?? id,
    abortSignal: manager.deps.abortSignal,
  });

  return { filesystemService, bashService };
};
