/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { Liquid } from 'liquidjs';
import { createWorkflowLiquidEngine, LIQUID_ALLOWED_TAGS } from './create_workflow_liquid_engine';

describe('createWorkflowLiquidEngine', () => {
  describe('basic functionality', () => {
    it('returns a Liquid engine that renders templates', () => {
      const engine = createWorkflowLiquidEngine();
      expect(engine).toBeInstanceOf(Liquid);
      expect(engine.parseAndRenderSync('{{ name }}', { name: 'test' })).toBe('test');
    });
  });

  describe('security: tag restriction enforcement', () => {
    it('rejects render tag (removed)', () => {
      const engine = createWorkflowLiquidEngine();
      expect(() => engine.parseAndRenderSync("{% render 'file.html' %}")).toThrow();
    });

    it('rejects include tag (removed)', () => {
      const engine = createWorkflowLiquidEngine();
      expect(() => engine.parseAndRenderSync("{% include 'partial' %}")).toThrow();
    });

    it('rejects layout tag (removed)', () => {
      const engine = createWorkflowLiquidEngine();
      expect(() => engine.parseAndRenderSync("{% layout 'base' %}")).toThrow();
    });

    it('allowed tags parse without error', () => {
      const engine = createWorkflowLiquidEngine();
      // Smoke test a few allowed tags
      expect(() => engine.parseAndRenderSync('{% comment %}x{% endcomment %}')).not.toThrow();
      expect(() => engine.parseAndRenderSync('{% if true %}y{% endif %}')).not.toThrow();
      expect(() => engine.parseAndRenderSync('{% unless false %}z{% endunless %}')).not.toThrow();
    });
  });

  describe('security: filesystem isolation', () => {
    const getFs = () => {
      const engine = createWorkflowLiquidEngine();
      expect(engine.options.fs).toBeDefined();
      return engine.options.fs!;
    };

    it('noopFs readFile throws with filepath in message', async () => {
      const fs = getFs();
      await expect(fs.readFile!('secret.txt')).rejects.toThrow('secret.txt');
    });

    it('noopFs readFileSync throws with filepath in message', () => {
      const fs = getFs();
      expect(() => fs.readFileSync!('secret.txt')).toThrow('secret.txt');
    });

    it('noopFs exists returns false', async () => {
      const fs = getFs();
      await expect(fs.exists!('any-path')).resolves.toBe(false);
    });

    it('noopFs existsSync returns false', () => {
      const fs = getFs();
      expect(fs.existsSync!('any-path')).toBe(false);
    });

    it('readFile error message includes the attempted filepath', async () => {
      const fs = getFs();
      await expect(fs.readFile!('/etc/passwd')).rejects.toThrow('/etc/passwd');
    });
  });

  describe('security: ownPropertyOnly enforcement', () => {
    it('does not expose constructor through templates', () => {
      const engine = createWorkflowLiquidEngine();
      const result = engine.parseAndRenderSync('{{ constructor }}', { name: 'test' });
      expect(result).toBe('');
    });

    it('does not expose __proto__ through templates', () => {
      const engine = createWorkflowLiquidEngine();
      const result = engine.parseAndRenderSync('{{ __proto__ }}', { name: 'test' });
      expect(result).toBe('');
    });
  });

  describe('custom options passthrough', () => {
    it('accepts additional Liquid options', () => {
      // strictFilters causes an error for unknown filters
      const engine = createWorkflowLiquidEngine({ strictFilters: true });
      expect(engine).toBeInstanceOf(Liquid);
    });

    it('accepts custom Liquid limits', () => {
      const template = 'x'.repeat(160_000);
      const engine = createWorkflowLiquidEngine({ parseLimit: 200_000 });

      expect(engine.parseAndRenderSync(template)).toBe(template);
    });
  });

  describe('LIQUID_ALLOWED_TAGS', () => {
    it('includes expected core tags', () => {
      const allowedTags = ['assign', 'for', 'if', 'capture', 'case', 'comment'];
      for (const tag of allowedTags) {
        expect(LIQUID_ALLOWED_TAGS.has(tag)).toBe(true);
      }
    });

    it('does not include file-related tags', () => {
      const disallowedTags = ['render', 'include', 'layout'];
      for (const tag of disallowedTags) {
        expect(LIQUID_ALLOWED_TAGS.has(tag)).toBe(false);
      }
    });
  });
});
