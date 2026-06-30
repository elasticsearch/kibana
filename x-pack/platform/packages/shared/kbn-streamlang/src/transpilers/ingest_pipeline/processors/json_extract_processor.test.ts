/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { processJsonExtractProcessor } from './json_extract_processor';

interface ScriptProcessorResult {
  script: { source: string; lang: string; description: string; [key: string]: unknown };
}

describe('processJsonExtractProcessor', () => {
  describe('Painless key escaping', () => {
    it('should escape double quotes in bracket-notation key names', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: '["key\\"with\\"quotes"]', target_field: 'out' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('.get("key\\"with\\"quotes")');
      expect(source).not.toContain('.get("key"with"quotes")');
    });

    it('should escape backslashes in bracket-notation key names', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: "['back\\\\slash']", target_field: 'out' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('.get("back\\\\slash")');
    });

    it('should leave simple key names unchanged', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'user.name', target_field: 'out' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('.get("user")');
      expect(source).toContain('.get("name")');
    });
  });

  describe('basic script generation', () => {
    it('should generate a script processor with correct structure', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'user_id', target_field: 'user.id' }],
      }) as ScriptProcessorResult;
      expect(result.script).toMatchObject({
        lang: 'painless',
        description: 'JsonExtract processor: extract from message',
      });
    });

    it('should include ignore_missing null guard when enabled', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'id', target_field: 'out' }],
        ignore_missing: true,
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('if (jsonStr == null) { return; }');
    });

    it('should not include null guard when ignore_missing is false', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'id', target_field: 'out' }],
        ignore_missing: false,
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).not.toContain('if (jsonStr == null) { return; }');
    });

    it('should pass through tag, if, and ignore_failure to the script processor', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'id', target_field: 'out' }],
        tag: 'my-tag',
        if: 'ctx.message != null',
        ignore_failure: true,
      }) as ScriptProcessorResult;
      const { script } = result;
      expect(script.tag).toBe('my-tag');
      expect(script.if).toBe('ctx.message != null');
      expect(script.ignore_failure).toBe(true);
    });

    it('should not include tag/if/ignore_failure when not set', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'id', target_field: 'out' }],
      }) as ScriptProcessorResult;
      const { script } = result;
      expect(script).not.toHaveProperty('tag');
      expect(script).not.toHaveProperty('if');
      expect(script).not.toHaveProperty('ignore_failure');
    });
  });

  describe('type casting', () => {
    it('should use toString for keyword type with complex-type pass-through', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'name', target_field: 'out', type: 'keyword' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      // Complex types (Map/List) are passed through at the assignment level
      expect(source).toContain('instanceof Map || extracted_0 instanceof List');
      expect(source).toContain('extracted_0.toString()');
      expect(source).not.toContain('Processors.json(extracted_0)');
    });

    it('should pass through complex types even when a non-keyword type is requested', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'data', target_field: 'out', type: 'integer' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      // Complex types are passed through before type casting is applied
      expect(source).toContain('if (extracted_0 instanceof Map || extracted_0 instanceof List)');
      expect(source).toContain("field('out').set(extracted_0);");
    });

    it('should use intValue for integer type', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'count', target_field: 'out', type: 'integer' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('intValue()');
    });

    it('should use longValue for long type', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'ts', target_field: 'out', type: 'long' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('longValue()');
    });

    it('should use doubleValue for double type', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'price', target_field: 'out', type: 'double' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('doubleValue()');
    });

    it('should use Boolean cast for boolean type', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'active', target_field: 'out', type: 'boolean' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('instanceof Boolean');
    });
  });

  describe('array index traversal', () => {
    it('should generate List bounds check for numeric indices', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [{ selector: 'items[0].name', target_field: 'out' }],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('instanceof List');
      expect(source).toContain('.size() > 0');
      expect(source).toContain('.get(0)');
      expect(source).toContain('.get("name")');
    });
  });

  describe('multiple extractions', () => {
    it('should generate separate variables for each extraction', () => {
      const result = processJsonExtractProcessor({
        field: 'message',
        extractions: [
          { selector: 'a', target_field: 'out_a' },
          { selector: 'b', target_field: 'out_b', type: 'integer' },
        ],
      }) as ScriptProcessorResult;
      const { source } = result.script;
      expect(source).toContain('def extracted_0');
      expect(source).toContain('def extracted_1');
      expect(source).toContain("field('out_a').set(");
      expect(source).toContain("field('out_b').set(");
    });
  });
});
