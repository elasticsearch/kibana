/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { formatEntityIdsForPrompt } from './entity_ids_preview';

describe('formatEntityIdsForPrompt', () => {
  it('shows all ids when the list is at or under the preview cap', () => {
    expect(formatEntityIdsForPrompt(['user:a', 'user:b', 'user:c'])).toBe(
      '**Entities:** user:a, user:b, user:c'
    );
    expect(formatEntityIdsForPrompt(['user:a'])).toBe('**Entities:** user:a');
  });

  it('truncates and adds an "and N more" suffix when over the preview cap', () => {
    const ids = Array.from({ length: 15 }, (_, i) => `user:u${i}`);
    const result = formatEntityIdsForPrompt(ids);
    expect(result).toMatch(/^\*\*Entities \(first 10\):\*\* /);
    expect(result).toContain('user:u0');
    expect(result).toContain('user:u9');
    expect(result).not.toContain('user:u10');
    expect(result).toMatch(/… and 5 more$/);
  });
});
