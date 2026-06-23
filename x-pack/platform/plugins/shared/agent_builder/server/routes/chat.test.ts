/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { promptResponseEntrySchema } from './chat';

describe('promptResponseEntrySchema', () => {
  it('accepts the confirmation variant', () => {
    expect(() => promptResponseEntrySchema.validate({ allow: true })).not.toThrow();
    expect(() => promptResponseEntrySchema.validate({ allow: false })).not.toThrow();
  });

  it('accepts the authorization variant', () => {
    expect(() => promptResponseEntrySchema.validate({ authorized: true })).not.toThrow();
  });

  it('accepts ask_user_question answers — choice only', () => {
    expect(() => promptResponseEntrySchema.validate({ answers: [{ choice: [0] }] })).not.toThrow();
  });

  it('accepts ask_user_question answers — custom only', () => {
    expect(() =>
      promptResponseEntrySchema.validate({ answers: [{ custom: 'hello' }] })
    ).not.toThrow();
  });

  it('accepts ask_user_question answers — choice + custom combined', () => {
    expect(() =>
      promptResponseEntrySchema.validate({
        answers: [{ choice: [0, 2], custom: 'extra' }],
      })
    ).not.toThrow();
  });

  it('accepts ask_user_question answers — skipped', () => {
    expect(() =>
      promptResponseEntrySchema.validate({ answers: [{ skipped: true }] })
    ).not.toThrow();
  });

  it('accepts a mixed answers array spanning all variants', () => {
    expect(() =>
      promptResponseEntrySchema.validate({
        answers: [
          { choice: [0] },
          { skipped: true },
          { custom: 'free text' },
          { choice: [1, 3], custom: 'mixed' },
        ],
      })
    ).not.toThrow();
  });

  it('rejects unknown payload shapes', () => {
    expect(() => promptResponseEntrySchema.validate({ foo: 'bar' })).toThrow();
  });
});
