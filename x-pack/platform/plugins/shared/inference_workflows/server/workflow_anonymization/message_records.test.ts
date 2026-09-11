/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { MessageRole } from '@kbn/inference-common';
import { createCompletionTextRecords } from './message_records';

describe('createCompletionTextRecords', () => {
  it('throws when tool-call arguments exceed the maximum nesting depth', () => {
    // Build a structure that is 101 levels deep — one beyond MAX_STRUCTURED_DEPTH (100).
    // Tool-call arguments are user-influenced and could be arbitrarily nested; the guard
    // ensures we fail closed rather than recurse until OOM.
    const deeplyNestedArgs: Record<string, unknown> = {};
    let level: Record<string, unknown> = deeplyNestedArgs;
    for (let i = 0; i < 101; i++) {
      const next: Record<string, unknown> = {};
      level.nested = next;
      level = next;
    }
    level.value = 'secret';

    expect(() =>
      createCompletionTextRecords({
        messages: [
          {
            role: MessageRole.Assistant,
            content: null,
            toolCalls: [
              {
                toolCallId: 'call-1',
                function: { name: 'test', arguments: deeplyNestedArgs },
              },
            ],
          },
        ],
      })
    ).toThrow('maximum nesting depth');
  });
});
