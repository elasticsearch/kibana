/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { executePiiRestore, piiRestoreStepDefinition } from './pii_restore_step';

describe('piiRestoreStepDefinition', () => {
  it('restores protected values through the step definition handler', async () => {
    const result = await piiRestoreStepDefinition.handler({
      input: {
        rawContent: 'Contact EMAIL_TOKEN',
        tokenMap: {
          EMAIL_TOKEN: { original: 'person@example.com', entityClass: 'EMAIL' },
        },
      },
    } as unknown as Parameters<typeof piiRestoreStepDefinition.handler>[0]);
    expect(result).toEqual({ output: { content: 'Contact person@example.com' } });
  });

  it('restores protected values in final response content', () => {
    expect(
      executePiiRestore({
        rawContent: 'Contact EMAIL_TOKEN',
        tokenMap: {
          EMAIL_TOKEN: { original: 'person@example.com', entityClass: 'EMAIL' },
        },
      })
    ).toEqual({ content: 'Contact person@example.com' });
  });
});
