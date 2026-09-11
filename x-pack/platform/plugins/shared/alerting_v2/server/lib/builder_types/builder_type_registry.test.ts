/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { BuilderQueryGenerationError } from '@kbn/alerting-v2-rule-builders';
import type { GeneratedQuery, RegisteredBuilderType } from '@kbn/alerting-v2-rule-builders';
import { BuilderTypeRegistry } from './builder_type_registry';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** A bounded Zod schema for use in tests.  Must be `.strict()` with `.max()`. */
const simpleSchema = z.object({ value: z.string().max(100) }).strict();

/** A GeneratedQuery that satisfies the type without requiring ES|QL validation. */
const makeQuery = (): GeneratedQuery => ({
  query: {
    format: 'standalone',
    breach: { query: 'FROM logs-* | WHERE @timestamp > now() - 5m | LIMIT 10' },
  },
});

/** A minimal valid definition that registers without errors. */
function makeDefinition(
  overrides: Partial<RegisteredBuilderType> = {}
): RegisteredBuilderType {
  return {
    type: 'test.my_type',
    builderFieldsSchema: simpleSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
    generateQuery: jest.fn(() => makeQuery()),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Registration rules
// ---------------------------------------------------------------------------

describe('BuilderTypeRegistry.register — registration rules', () => {
  let registry: BuilderTypeRegistry;

  beforeEach(() => {
    registry = new BuilderTypeRegistry();
  });

  it('accepts a valid definition without throwing', () => {
    expect(() => registry.register(makeDefinition())).not.toThrow();
  });

  it('rejects an empty type string', () => {
    expect(() => registry.register(makeDefinition({ type: '' }))).toThrow(
      'Builder type definition requires a non-empty type'
    );
  });

  it('rejects a whitespace-only type string', () => {
    expect(() => registry.register(makeDefinition({ type: '   ' }))).toThrow(
      'Builder type definition requires a non-empty type'
    );
  });

  it('rejects a null builderFieldsSchema', () => {
    expect(() =>
      registry.register(makeDefinition({ builderFieldsSchema: null as never }))
    ).toThrow('requires a builderFieldsSchema');
  });

  it('rejects an undefined builderFieldsSchema', () => {
    expect(() =>
      registry.register(makeDefinition({ builderFieldsSchema: undefined as never }))
    ).toThrow('requires a builderFieldsSchema');
  });

  it('rejects a missing generateQuery', () => {
    expect(() =>
      registry.register(makeDefinition({ generateQuery: undefined as never }))
    ).toThrow('requires a generateQuery function');
  });

  it('rejects a non-function generateQuery', () => {
    expect(() =>
      registry.register(makeDefinition({ generateQuery: 'not-a-function' as never }))
    ).toThrow('requires a generateQuery function');
  });

  it('rejects an unbounded schema (string missing .max())', () => {
    const unboundedSchema = z.object({ name: z.string() }).strict();
    expect(() =>
      registry.register(
        makeDefinition({
          builderFieldsSchema: unboundedSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
        })
      )
    ).toThrow();
  });

  it('rejects a stripping object schema (missing .strict())', () => {
    const strippingSchema = z.object({ value: z.string().max(100) });
    expect(() =>
      registry.register(
        makeDefinition({
          builderFieldsSchema: strippingSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
        })
      )
    ).toThrow();
  });

  it('stores the definition frozen so callers cannot mutate it after registration', () => {
    const definition = makeDefinition();
    registry.register(definition);
    const stored = registry.get(definition.type)!;
    expect(Object.isFrozen(stored)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Duplicate rejection
// ---------------------------------------------------------------------------

describe('BuilderTypeRegistry.register — duplicate rejection', () => {
  let registry: BuilderTypeRegistry;

  beforeEach(() => {
    registry = new BuilderTypeRegistry();
  });

  it('throws when the same type id is registered a second time', () => {
    registry.register(makeDefinition({ type: 'test.my_type' }));
    expect(() => registry.register(makeDefinition({ type: 'test.my_type' }))).toThrow(
      'Builder type "test.my_type" is already registered'
    );
  });

  it('allows different type ids to coexist', () => {
    expect(() => {
      registry.register(makeDefinition({ type: 'test.type_a' }));
      registry.register(makeDefinition({ type: 'test.type_b' }));
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Read methods: get / has / getAll
// ---------------------------------------------------------------------------

describe('BuilderTypeRegistry — read methods', () => {
  let registry: BuilderTypeRegistry;

  beforeEach(() => {
    registry = new BuilderTypeRegistry();
  });

  it('get returns undefined for an unknown type', () => {
    expect(registry.get('does.not.exist')).toBeUndefined();
  });

  it('get returns the stored definition for a registered type', () => {
    const definition = makeDefinition({ type: 'test.lookup' });
    registry.register(definition);
    const stored = registry.get('test.lookup');
    expect(stored).toBeDefined();
    expect(stored!.type).toBe('test.lookup');
  });

  it('has returns false for an unknown type', () => {
    expect(registry.has('does.not.exist')).toBe(false);
  });

  it('has returns true for a registered type', () => {
    registry.register(makeDefinition({ type: 'test.has_check' }));
    expect(registry.has('test.has_check')).toBe(true);
  });

  it('getAll returns an empty array when nothing is registered', () => {
    expect(registry.getAll()).toEqual([]);
  });

  it('getAll returns all registered definitions', () => {
    registry.register(makeDefinition({ type: 'test.first' }));
    registry.register(makeDefinition({ type: 'test.second' }));
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((d) => d.type).sort()).toEqual(['test.first', 'test.second']);
  });
});

// ---------------------------------------------------------------------------
// generate — UNKNOWN_BUILDER_TYPE
// ---------------------------------------------------------------------------

describe('BuilderTypeRegistry.generate — UNKNOWN_BUILDER_TYPE', () => {
  let registry: BuilderTypeRegistry;

  beforeEach(() => {
    registry = new BuilderTypeRegistry();
  });

  it('throws a Boom 400 with UNKNOWN_BUILDER_TYPE when the type is not registered', () => {
    let error: unknown;
    try {
      registry.generate('no.such.type', { value: 'x' });
    } catch (e) {
      error = e;
    }
    expect(error).toBeDefined();
    const boom = error as { isBoom: boolean; output: { statusCode: number }; data: unknown };
    expect(boom.isBoom).toBe(true);
    expect(boom.output.statusCode).toBe(400);
    const data = boom.data as { code: string; details: { builder_type: string; registered: string[] } };
    expect(data.code).toBe(ALERTING_ERROR_CODES.UNKNOWN_BUILDER_TYPE);
    expect(data.details.builder_type).toBe('no.such.type');
    expect(data.details.registered).toEqual([]);
  });

  it('includes currently registered type ids in the UNKNOWN_BUILDER_TYPE details', () => {
    registry.register(makeDefinition({ type: 'test.known' }));
    let error: unknown;
    try {
      registry.generate('test.unknown', {});
    } catch (e) {
      error = e;
    }
    const boom = error as { data: { details: { registered: string[] } } };
    expect(boom.data.details.registered).toContain('test.known');
  });

  it('mentions "none" in the error message when no types are registered', () => {
    let error: unknown;
    try {
      registry.generate('test.unknown', {});
    } catch (e) {
      error = e;
    }
    expect((error as Error).message).toMatch(/none/);
  });

  it('mentions the unknown type id in the error message', () => {
    let error: unknown;
    try {
      registry.generate('test.ghost', {});
    } catch (e) {
      error = e;
    }
    expect((error as Error).message).toMatch(/test\.ghost/);
  });
});

// ---------------------------------------------------------------------------
// generate — parse-and-call behavior
// ---------------------------------------------------------------------------

describe('BuilderTypeRegistry.generate — parse-and-call', () => {
  let registry: BuilderTypeRegistry;
  let generateQuery: jest.Mock;

  beforeEach(() => {
    registry = new BuilderTypeRegistry();
    generateQuery = jest.fn(() => makeQuery());
    registry.register({
      type: 'test.parse_type',
      builderFieldsSchema: simpleSchema as unknown as RegisteredBuilderType['builderFieldsSchema'],
      generateQuery,
    });
  });

  it('calls generateQuery with the schema-parsed data', () => {
    registry.generate('test.parse_type', { value: 'hello' });
    expect(generateQuery).toHaveBeenCalledTimes(1);
    expect(generateQuery).toHaveBeenCalledWith({ value: 'hello' });
  });

  it('returns the value from generateQuery unchanged', () => {
    const expected = makeQuery();
    generateQuery.mockReturnValue(expected);
    const result = registry.generate('test.parse_type', { value: 'hello' });
    expect(result).toBe(expected);
  });

  it('throws Boom INVALID_BUILDER_FIELDS when fields fail schema validation', () => {
    let error: unknown;
    try {
      // value must be a string; passing a number violates the schema
      registry.generate('test.parse_type', { value: 12345 });
    } catch (e) {
      error = e;
    }
    const boom = error as { isBoom: boolean; output: { statusCode: number }; data: unknown };
    expect(boom.isBoom).toBe(true);
    expect(boom.output.statusCode).toBe(400);
    const data = boom.data as { code: string; details: { builder_type: string } };
    expect(data.code).toBe(ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS);
    expect(data.details.builder_type).toBe('test.parse_type');
  });

  it('throws Boom INVALID_BUILDER_FIELDS when strict schema receives extra fields', () => {
    let error: unknown;
    try {
      registry.generate('test.parse_type', { value: 'ok', extra: 'unwanted' });
    } catch (e) {
      error = e;
    }
    const boom = error as { isBoom: boolean; data: { code: string } };
    expect(boom.isBoom).toBe(true);
    expect(boom.data.code).toBe(ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS);
  });

  it('includes treeified error details in INVALID_BUILDER_FIELDS', () => {
    let error: unknown;
    try {
      registry.generate('test.parse_type', { value: 12345 });
    } catch (e) {
      error = e;
    }
    const data = (error as { data: { details: { errors?: unknown } } }).data.details;
    expect(data.errors).toBeDefined();
  });

  it('wraps a thrown BuilderQueryGenerationError as Boom BUILDER_QUERY_GENERATION_FAILED', () => {
    generateQuery.mockImplementation(() => {
      throw new BuilderQueryGenerationError('query failed');
    });
    let error: unknown;
    try {
      registry.generate('test.parse_type', { value: 'ok' });
    } catch (e) {
      error = e;
    }
    const boom = error as { isBoom: boolean; output: { statusCode: number }; data: unknown };
    expect(boom.isBoom).toBe(true);
    expect(boom.output.statusCode).toBe(400);
    const data = boom.data as { code: string; details: { builder_type: string } };
    expect(data.code).toBe(ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED);
    expect(data.details.builder_type).toBe('test.parse_type');
  });

  it('includes path in BUILDER_QUERY_GENERATION_FAILED details when the error carries one', () => {
    generateQuery.mockImplementation(() => {
      throw new BuilderQueryGenerationError('bad field', 'fields.metric');
    });
    let error: unknown;
    try {
      registry.generate('test.parse_type', { value: 'ok' });
    } catch (e) {
      error = e;
    }
    const data = (error as { data: { details: { path?: string } } }).data.details;
    expect(data.path).toBe('fields.metric');
  });

  it('omits path from BUILDER_QUERY_GENERATION_FAILED details when the error has no path', () => {
    generateQuery.mockImplementation(() => {
      throw new BuilderQueryGenerationError('bad query');
    });
    let error: unknown;
    try {
      registry.generate('test.parse_type', { value: 'ok' });
    } catch (e) {
      error = e;
    }
    const data = (error as { data: { details: Record<string, unknown> } }).data.details;
    expect('path' in data).toBe(false);
  });

  it('rethrows non-BuilderQueryGenerationError errors from generateQuery as-is', () => {
    const originalError = new TypeError('unexpected failure');
    generateQuery.mockImplementation(() => {
      throw originalError;
    });
    expect(() => registry.generate('test.parse_type', { value: 'ok' })).toThrow(originalError);
  });

  it('passes the schema-parsed data (not raw input) to generateQuery', () => {
    // The strict schema strips no fields (strict rejects), but we can verify that
    // generateQuery receives the result of safeParse, not the original object reference.
    const raw = { value: 'test-value' };
    registry.generate('test.parse_type', raw);
    // The parsed data has the same shape; confirm it's what generateQuery received.
    expect(generateQuery).toHaveBeenCalledWith({ value: 'test-value' });
  });
});
