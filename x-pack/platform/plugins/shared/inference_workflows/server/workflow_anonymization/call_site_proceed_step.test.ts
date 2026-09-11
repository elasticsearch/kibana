/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MessageRole } from '@kbn/inference-common';
import {
  createInferenceProceedCapabilityValue,
  INFERENCE_PROCEED_CAPABILITY_ID,
  type InferenceProceedInput,
} from '@kbn/inference-plugin/server';
import { callSiteProceedStepDefinition } from './call_site_proceed_step';
import { getInferenceProceedCapability } from './capabilities';

describe('callSiteProceedStepDefinition handler', () => {
  it('forwards combined input and abortSignal to the proceed capability and returns rawContent', async () => {
    const invoke = jest.fn().mockResolvedValue({ rawContent: 'RESULT' });
    const abortSignal = new AbortController().signal;
    const input: Omit<InferenceProceedInput, 'abortSignal'> = {
      system: 'protected system',
      messages: [{ role: MessageRole.User, content: 'text TOKEN' }],
      tokenMap: { TOKEN: { original: 'secret', entityClass: 'ENTITY_NAME' } },
    };
    const capabilities = [
      {
        id: INFERENCE_PROCEED_CAPABILITY_ID,
        value: createInferenceProceedCapabilityValue({ invoke }),
      },
    ];

    const result = await callSiteProceedStepDefinition.handler({
      input,
      capabilities,
      abortSignal,
    });

    expect(invoke).toHaveBeenCalledWith({ ...input, abortSignal });
    expect(result).toEqual({ output: { rawContent: 'RESULT' } });
  });
});

describe('inference proceed capability', () => {
  it('receives workflow-transformed input and its call-local token map', async () => {
    const invoke = jest.fn().mockResolvedValue({ rawContent: 'TOKEN' });
    const proceed = getInferenceProceedCapability([
      {
        id: INFERENCE_PROCEED_CAPABILITY_ID,
        value: createInferenceProceedCapabilityValue({ invoke }),
      },
    ]);
    const abortSignal = new AbortController().signal;
    const input: InferenceProceedInput = {
      system: 'protected system',
      messages: [{ role: MessageRole.User, content: 'protected TOKEN' }],
      tokenMap: { TOKEN: { original: 'secret', entityClass: 'ENTITY_NAME' } },
      abortSignal,
    };

    await expect(proceed.invoke(input)).resolves.toEqual({ rawContent: 'TOKEN' });
    expect(invoke).toHaveBeenCalledWith(input);
  });

  it('rejects an unregistered look-alike capability', () => {
    expect(() =>
      getInferenceProceedCapability([
        { id: INFERENCE_PROCEED_CAPABILITY_ID, value: { invoke: jest.fn() } },
      ])
    ).toThrow(`Workflow capability "${INFERENCE_PROCEED_CAPABILITY_ID}" is invalid`);
  });
});
