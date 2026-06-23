/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BashExecResult, IBashService } from '@kbn/agent-builder-server/runner';
import { createBashTool } from './bash';

describe('bash tool', () => {
  it('delegates to BashService.exec with the command', async () => {
    const exec = jest.fn<Promise<BashExecResult>, [string]>().mockResolvedValue({
      stdout: 'ok\n',
      stderr: '',
      exit_code: 0,
    });
    const bashService = { exec } as unknown as IBashService;
    const tool = createBashTool({ bashService });
    const handler = tool.handler;
    const result = (await handler({ command: 'echo ok' }, {} as never)) as {
      results: Array<{ type: string; data: BashExecResult }>;
    };
    expect(exec).toHaveBeenCalledWith('echo ok');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe('other');
    expect(result.results[0].data).toEqual({
      stdout: 'ok\n',
      stderr: '',
      exit_code: 0,
    });
  });
});
