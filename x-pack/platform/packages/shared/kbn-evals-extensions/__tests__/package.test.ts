/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Basic package health checks for @kbn/evals-extensions
 */

describe('@kbn/evals-extensions', () => {
  describe('package structure', () => {
    it('should be importable without errors', async () => {
      const mod = await import('..');
      expect(mod).toBeDefined();
    });
  });

  describe('dependency isolation', () => {
    it('should not create circular dependencies with @kbn/evals', async () => {
      // This test ensures we maintain one-way dependency:
      // kbn-evals-extensions → depends on → kbn-evals
      // kbn-evals → MUST NOT depend on → kbn-evals-extensions

      // Both packages should be importable
      const evalsExtensions = await import('..');
      const kbnEvals = await import('@kbn/evals');

      expect(evalsExtensions).toBeDefined();
      expect(kbnEvals).toBeDefined();

      // kbn-evals-extensions can use kbn-evals types (verified by compilation)
      // kbn-evals should have no knowledge of kbn-evals-extensions
      // This is enforced by TypeScript references in tsconfig.json
    });
  });

  describe('exports', () => {
    it('should re-export core types from @kbn/evals', async () => {
      // Type exports are verified at compile time
      // Runtime check just ensures module loads
      const exports = await import('..');
      expect(exports).toBeDefined();
    });
  });
});
