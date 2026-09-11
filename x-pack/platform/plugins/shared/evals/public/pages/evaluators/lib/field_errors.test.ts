/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { UserDefinedEvaluatorDraft } from '@kbn/evals-common';
import { FIELD_ERROR_MESSAGES, toFieldErrorKey, toFieldErrors } from './field_errors';

describe('toFieldErrorKey', () => {
  it.each([
    [['name'], 'name'],
    [['description'], 'description'],
    [['judge', 'system_prompt'], 'systemPrompt'],
    [['judge', 'prompt'], 'prompt'],
    [['judge', 'evidence'], 'evidence'],
    [['judge', 'evidence', 0], 'evidence'],
    [['judge', 'reference_data_keys', 2], 'referenceDataKeys'],
    [['judge', 'output', 'scores'], 'scores'],
    [['judge', 'output', 'scores', 0, 'name'], 'scores'],
  ])('maps %j to the %s field', (path, expected) => {
    expect(toFieldErrorKey(path)).toBe(expected);
  });

  it.each([[[]], [['judge']], [['judge', 'kind']], [['created_by']]])(
    'returns undefined for %j, which no form field owns',
    (path) => {
      expect(toFieldErrorKey(path)).toBeUndefined();
    }
  );
});

describe('toFieldErrors', () => {
  it('keeps only the first message per field so a row shows one error', () => {
    expect(
      toFieldErrors([
        { path: ['judge', 'output', 'scores', 0, 'name'] },
        { path: ['judge', 'output', 'scores', 1, 'name'] },
      ])
    ).toEqual({ scores: FIELD_ERROR_MESSAGES.scores });
  });

  it('ignores issues that map to no field', () => {
    expect(toFieldErrors([{ path: ['judge', 'kind'] }])).toEqual({});
  });

  it('routes a real draft-schema failure to the field that caused it', () => {
    const parsed = UserDefinedEvaluatorDraft.safeParse({
      name: 'Not A Valid Name',
      description: '',
      judge: {
        system_prompt: 'You judge.',
        prompt: 'Rate {{{agent_response}}}.',
        evidence: ['response'],
        reference_data_keys: [],
        output: { scores: [{ name: 'quality', type: 'number' }] },
      },
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    expect(toFieldErrors(parsed.error.issues)).toEqual({
      name: FIELD_ERROR_MESSAGES.name,
      description: FIELD_ERROR_MESSAGES.description,
    });
  });
});
