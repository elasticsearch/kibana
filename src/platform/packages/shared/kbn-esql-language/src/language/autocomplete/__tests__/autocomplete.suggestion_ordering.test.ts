/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { setup } from './helpers';

describe('Suggestion Ordering', () => {
  describe('COMPLETION command', () => {
    it('should order prompt suggestion first', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a | COMPLETION /');

      expect(suggestions[0].label).toBe('Your prompt to the LLM.');
    });
  });

  describe('FROM command', () => {
    it('should order METADATA among first suggestions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a /');

      const metadataIndex = suggestions.findIndex((s) => s.text === 'METADATA ');

      expect(metadataIndex).toBe(3);
    });
  });

  describe('STATS command', () => {
    it('should order BY keyword first', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a | STATS count(*) /');

      expect(suggestions[0].text).toBe('BY ');
    });
  });

  describe('User defined columns', () => {
    it('should order col0 among first suggestions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a | STATS count(*) BY /');

      const col0Index = suggestions.findIndex((s) => s.text === 'col0 = ');

      expect(col0Index).toBe(1);
    });
  });

  describe('EVAL expressions', () => {
    it('should have functions available', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a | EVAL x = /');

      const hasFunctions = suggestions.some((s) => s.kind === 'Function');

      expect(hasFunctions).toBe(true);
    });
  });

  describe('FUSE command', () => {
    it('should start with next actions before the rest of the fuse suggestions', async () => {
      const { suggest } = await setup();
      const suggestions = await suggest('FROM a | FUSE /');
      const orderedTexts = suggestions.map((s) => s.text);

      expect(orderedTexts[0]).toBe('WITH { $0 }');
      expect(orderedTexts[1]).toBe('\n');
      expect(orderedTexts[2]).toBe('| ');
      expect(orderedTexts[3]).toBe('linear ');
      expect(orderedTexts[4]).toBe('rrf ');
      expect(orderedTexts.indexOf('SCORE BY ')).toBeGreaterThan(4);
    });
  });
});
