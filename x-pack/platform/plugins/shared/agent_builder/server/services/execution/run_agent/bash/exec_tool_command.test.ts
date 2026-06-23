/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { Bash } from 'just-bash';
import { createExecToolCommand, type ExecToolFn, type ResolveToolIdFn } from './exec_tool_command';

const identityResolve: ResolveToolIdFn = (id) => id;

const runScript = async (
  script: string,
  execToolFn: ExecToolFn,
  resolve: ResolveToolIdFn = identityResolve
) => {
  const cmd = createExecToolCommand({ execToolFn, resolveToolId: resolve });
  const bash = new Bash({ customCommands: [cmd] });
  return bash.exec(script);
};

describe('exec_tool command', () => {
  it('runs the tool and prints JSON to stdout on success', async () => {
    const fn: ExecToolFn = jest
      .fn()
      .mockResolvedValue({ results: [{ type: 'other', data: { ok: true } }] });
    const result = await runScript('exec_tool foo --args=\'{"x":1}\'', fn);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(
      JSON.stringify({ results: [{ type: 'other', data: { ok: true } }] })
    );
    expect(fn).toHaveBeenCalledWith('foo', { x: 1 });
  });

  it('runs the tool with no args when --args is omitted', async () => {
    const fn: ExecToolFn = jest.fn().mockResolvedValue({ results: [] });
    await runScript('exec_tool bar', fn);
    expect(fn).toHaveBeenCalledWith('bar', undefined);
  });

  it('resolves sanitized → internal IDs via resolveToolId', async () => {
    const fn: ExecToolFn = jest.fn().mockResolvedValue({ results: [] });
    const resolve: ResolveToolIdFn = jest.fn((id) => (id === 'sanitized' ? 'internal.id' : id));
    await runScript('exec_tool sanitized', fn, resolve);
    expect(fn).toHaveBeenCalledWith('internal.id', undefined);
  });

  it('exits 1 with stderr on tool execution error', async () => {
    const fn: ExecToolFn = jest.fn().mockRejectedValue(new Error('boom'));
    const result = await runScript('exec_tool bad', fn);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/boom/);
  });

  it('exits 1 with stderr on malformed JSON args', async () => {
    const fn: ExecToolFn = jest.fn();
    const result = await runScript("exec_tool foo --args='{not json'", fn);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toMatch(/JSON/);
    expect(fn).not.toHaveBeenCalled();
  });

  it('exits 1 when no tool_id is given', async () => {
    const fn: ExecToolFn = jest.fn();
    const result = await runScript('exec_tool', fn);
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toLowerCase()).toMatch(/tool/);
  });
});
