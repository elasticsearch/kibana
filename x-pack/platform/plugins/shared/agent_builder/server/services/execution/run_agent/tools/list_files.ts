/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type { IFileSystem } from 'just-bash';
import { ToolType } from '@kbn/agent-builder-common';
import { internalTools } from '@kbn/agent-builder-common/tools';
import { createErrorResult, createOtherResult } from '@kbn/agent-builder-server';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server/tools';
import type { IFilesystemService } from '@kbn/agent-builder-server/runner';

const MAX_DEPTH = 5;

const schema = z.object({
  path: z.string().describe('Absolute path of the directory to list'),
  depth: z
    .number()
    .min(1)
    .max(MAX_DEPTH)
    .optional()
    .default(1)
    .describe(
      `Level of depth to include (1 = immediate children only, 2 = include children of subdirectories, etc.). Capped at ${MAX_DEPTH}.`
    ),
});

export const createListFilesTool = ({
  filesystemService,
}: {
  filesystemService: IFilesystemService;
}): BuiltinToolDefinition<typeof schema> => {
  return {
    id: internalTools.listFiles,
    description: `List the entries of a directory in the virtual file system (VFS).`,
    type: ToolType.builtin,
    schema,
    tags: ['filesystem'],
    handler: async ({ path, depth = 1 }) => {
      const fs = filesystemService.getFilesystem();
      try {
        const entries = await walk(fs, path, depth);
        return {
          results: [createOtherResult({ path, depth, entries })],
        };
      } catch (err) {
        return {
          results: [createErrorResult(`list_files '${path}': ${(err as Error).message}`)],
        };
      }
    },
  };
};

interface ListEntry {
  name: string;
  type: 'file' | 'directory';
  children?: ListEntry[];
}

const joinPath = (dir: string, name: string): string =>
  dir.endsWith('/') ? `${dir}${name}` : `${dir}/${name}`;

const walk = async (fs: IFileSystem, dir: string, remaining: number): Promise<ListEntry[]> => {
  const names = await fs.readdir(dir);
  return Promise.all(
    names.map(async (name) => {
      const childPath = joinPath(dir, name);
      const stat = await fs.stat(childPath);
      if (stat.isDirectory) {
        const entry: ListEntry = { name, type: 'directory' };
        if (remaining > 1) {
          entry.children = await walk(fs, childPath, remaining - 1);
        }
        return entry;
      }
      return { name, type: 'file' };
    })
  );
};
