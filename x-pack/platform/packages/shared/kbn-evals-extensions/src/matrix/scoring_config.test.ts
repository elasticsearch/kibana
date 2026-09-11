/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { matrixConfigSchema } from './load_matrix_config';

describe('matrixConfigSchema — scoring policy', () => {
  const base = {
    columns: [{ id: 'c', label: 'C', suites: ['s'] }],
    models: [{ id: 'm', label: 'M' }],
    overall: { label: 'Overall' },
  };

  it('leaves scoring unset when a matrix does not opt in, so published numbers are unchanged', () => {
    const config = matrixConfigSchema.validate(base);

    expect(config.scoring).toBeUndefined();
  });

  it('accepts a fully opted-in policy', () => {
    const config = matrixConfigSchema.validate({
      ...base,
      scoring: {
        useVerdictLadder: true,
        requireEisJudge: true,
        excludeSelfJudged: true,
      },
    });

    expect(config.scoring).toEqual({
      useVerdictLadder: true,
      requireEisJudge: true,
      excludeSelfJudged: true,
    });
  });

  it('allows opting into the ladder without the provenance gate', () => {
    const config = matrixConfigSchema.validate({
      ...base,
      scoring: { useVerdictLadder: true },
    });

    expect(config.scoring?.useVerdictLadder).toBe(true);
    expect(config.scoring?.requireEisJudge).toBe(false);
  });

  it('rejects a non-boolean flag rather than coercing it', () => {
    expect(() =>
      matrixConfigSchema.validate({
        ...base,
        scoring: { useVerdictLadder: 'yes' },
      })
    ).toThrow(/useVerdictLadder/);
  });
});
