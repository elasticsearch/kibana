/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { POLICY_ERROR_MESSAGES, PolicyAmbiguousNameError } from './policy_errors';

describe('policy errors', () => {
  it('bounds ambiguous-name candidates at 10 and reports truncation', () => {
    const candidates = Array.from({ length: 12 }, (_, index) => ({
      id: `id-${index}`,
      name: `name-${index}`,
    }));
    const error = new PolicyAmbiguousNameError(candidates, 12);

    expect(error.name).toBe('PolicyAmbiguousNameError');
    expect(error.message).toBe(POLICY_ERROR_MESSAGES.ambiguous_name);
    expect(error.candidates).toHaveLength(10);
    expect(error.candidatesTotal).toBe(12);
    expect(error.candidatesTruncated).toBe(true);
    expect(error.candidates[0]).toEqual({ id: 'id-0', name: 'name-0' });
    expect(error.candidates[9]).toEqual({ id: 'id-9', name: 'name-9' });
  });

  it('stores exact id and name on a fresh candidate object', () => {
    const fatCandidate = {
      id: 'policy-1',
      name: 'Shared Name',
      description: 'should not leak',
      inputs: [{ type: 'endpoint' }],
      revision: 7,
    };
    const error = new PolicyAmbiguousNameError([fatCandidate], 1);
    const [stored] = error.candidates;

    expect(error.candidates).toHaveLength(1);
    expect(stored).toEqual({ id: 'policy-1', name: 'Shared Name' });
    expect(Object.keys(stored)).toEqual(['id', 'name']);
    expect(stored).not.toBe(fatCandidate);
    expect(error.candidatesTotal).toBe(1);
    expect(error.candidatesTruncated).toBe(false);
  });
});
