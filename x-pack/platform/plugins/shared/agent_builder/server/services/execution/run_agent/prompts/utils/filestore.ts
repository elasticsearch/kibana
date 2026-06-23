/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { internalTools } from '@kbn/agent-builder-common/tools';
import { cleanPrompt } from '@kbn/agent-builder-genai-utils/prompts';
import { sanitizeToolId } from '@kbn/agent-builder-genai-utils/langchain';

const tools = {
  readFile: sanitizeToolId(internalTools.readFile),
  listFiles: sanitizeToolId(internalTools.listFiles),
  bash: sanitizeToolId(internalTools.bash),
};

export const getFileSystemInstructions = ({
  bashEnabled = false,
}: {
  bashEnabled?: boolean;
} = {}): string => {
  const bashToolSection = bashEnabled
    ? `- ${tools.bash}: run a bash command in a sandboxed shell. Use for composition, piping, and writing files. Refer to the tool description for the full capabilities.`
    : '';

  return cleanPrompt(`
  ## FILESYSTEM (VFS)

  You have access to a virtual filesystem with the following root folders:
  - /workspace: persistent across rounds and conversation resumptions — anything you write here is saved.
  - /tool_calls: read-only view of prior tool results in this conversation. Path convention: /tool_calls/{tool_id}/{tool_call_id}/{tool_result_id}.json
  - /skills: read-only skill files (main file: SKILL.md, plus subfiles).
  - /tmp and /home/user: ephemeral folders — not persisted between rounds.

  The following tools can interact with the VFS:
  - ${tools.readFile}: read a single file's content.
  - ${tools.listFiles}: list the entries (files and subdirectories) under a directory.
  ${bashToolSection}
`);
};
