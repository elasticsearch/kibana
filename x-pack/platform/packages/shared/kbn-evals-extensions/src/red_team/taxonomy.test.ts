/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { OWASP_LLM_TOP_10, getOwaspCategory } from './taxonomy';

describe('OWASP LLM Top 10 taxonomy', () => {
  it('contains all 10 entries', () => {
    expect(Object.keys(OWASP_LLM_TOP_10)).toHaveLength(10);
    for (let i = 1; i <= 10; i++) {
      const id = `LLM${String(i).padStart(2, '0')}`;
      expect(OWASP_LLM_TOP_10[id]).toBeDefined();
      expect(OWASP_LLM_TOP_10[id].id).toBe(id);
      expect(OWASP_LLM_TOP_10[id].name).toBeTruthy();
      expect(OWASP_LLM_TOP_10[id].description).toBeTruthy();
    }
  });

  describe('getOwaspCategory', () => {
    it('returns the correct category for a valid ID', () => {
      const result = getOwaspCategory('LLM01');
      expect(result.id).toBe('LLM01');
      expect(result.name).toBe('Prompt Injection');
    });

    it('returns a fallback for an unknown ID', () => {
      const result = getOwaspCategory('LLM99');
      expect(result.id).toBe('LLM99');
      expect(result.name).toBe('Unknown');
    });
  });
});
