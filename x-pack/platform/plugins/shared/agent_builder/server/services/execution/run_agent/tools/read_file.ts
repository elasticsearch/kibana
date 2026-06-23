/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { ToolType } from '@kbn/agent-builder-common';
import { internalTools } from '@kbn/agent-builder-common/tools';
import { createErrorResult, createOtherResult } from '@kbn/agent-builder-server';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server/tools';
import {
  estimateTokens,
  truncateTokens,
} from '@kbn/agent-builder-genai-utils/tools/utils/token_count';
import type { IFilesystemService } from '@kbn/agent-builder-server/runner';

const schema = z.object({
  path: z.string().describe('Absolute path of the file to read'),
});

const SAFEGUARD_TOKEN_COUNT = 10_000;

export const createReadFileTool = ({
  filesystemService,
}: {
  filesystemService: IFilesystemService;
}): BuiltinToolDefinition<typeof schema> => {
  return {
    id: internalTools.readFile,
    description: 'Read the content of a file from the virtual file system (VFS).',
    type: ToolType.builtin,
    schema,
    tags: ['filesystem'],
    handler: async ({ path }) => {
      const fs = filesystemService.getFilesystem();
      let content: string;
      try {
        content = await fs.readFile(path);
      } catch (err) {
        return {
          results: [createErrorResult(`read_file '${path}': ${(err as Error).message}`)],
        };
      }
      let truncated = false;
      if (estimateTokens(content) > SAFEGUARD_TOKEN_COUNT) {
        content = truncateTokens(content, SAFEGUARD_TOKEN_COUNT);
        truncated = true;
      }
      return {
        results: [createOtherResult({ path, content, ...(truncated ? { truncated: true } : {}) })],
      };
    },
  };
};
