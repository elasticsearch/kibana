/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CustomCommand } from 'just-bash';
import { defineCommand } from 'just-bash';

export type ExecToolFn = (toolId: string, args: unknown) => Promise<unknown>;
export type ResolveToolIdFn = (toolId: string) => string;

interface ParsedArgs {
  toolId?: string;
  argsRaw?: string;
  error?: string;
}

/**
 * Hand-rolled argv parser for `exec_tool` — one positional + an optional `--args=<json>` flag.
 */
const parseArgs = (argv: string[]): ParsedArgs => {
  if (argv.length === 0) {
    return { error: 'exec_tool: missing tool id argument' };
  }
  const [toolId, ...rest] = argv;
  let argsRaw: string | undefined;
  for (const a of rest) {
    if (a.startsWith('--args=')) {
      argsRaw = a.slice('--args='.length);
    } else if (a === '--args') {
      return { error: "exec_tool: --args requires a value (use --args='<json>')" };
    } else {
      return { error: `exec_tool: unexpected argument '${a}'` };
    }
  }
  return { toolId, argsRaw };
};

export const createExecToolCommand = ({
  execToolFn,
  resolveToolId,
}: {
  execToolFn: ExecToolFn;
  resolveToolId: ResolveToolIdFn;
}): CustomCommand => {
  return defineCommand('exec_tool', async (argv) => {
    const parsed = parseArgs(argv);
    if (parsed.error) {
      return { stdout: '', stderr: `${parsed.error}\n`, exitCode: 1 };
    }
    const { toolId, argsRaw } = parsed;
    const resolvedToolId = resolveToolId(toolId!);

    let args: unknown;
    if (argsRaw !== undefined) {
      try {
        args = JSON.parse(argsRaw);
      } catch (err) {
        return {
          stdout: '',
          stderr: `exec_tool: invalid JSON for --args: ${(err as Error).message}\n`,
          exitCode: 1,
        };
      }
    }

    try {
      const result = await execToolFn(resolvedToolId, args);
      return { stdout: `${JSON.stringify(result)}\n`, stderr: '', exitCode: 0 };
    } catch (err) {
      return {
        stdout: '',
        stderr: `exec_tool: ${(err as Error).message ?? String(err)}\n`,
        exitCode: 1,
      };
    }
  });
};
