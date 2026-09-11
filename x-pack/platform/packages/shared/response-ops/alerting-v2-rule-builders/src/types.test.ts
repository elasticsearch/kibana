/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  BuilderTypeDefinition,
  BuilderTypeManifest,
  DerivedRuleFields,
  GeneratedQuery,
  MappingProperty,
  QueryGenerationInput,
  RuleEventEnrichment,
  RuleEventEnrichmentInput,
} from './types';

// ---------------------------------------------------------------------------
// Write-time fixture
//
// A minimal write_time builder type to verify the widened contract compiles
// and carries the declared properties at runtime.
// ---------------------------------------------------------------------------

interface WriteTimeFields {
  query_text: string;
}

const writeTimeManifest: BuilderTypeManifest = {
  type: 'test.write_time',
  currentVersion: 1,
  versions: {
    1: {
      // Version 1 declares no sub-field mappings.
    },
  },
};

/** Compile-time assertion: the object must satisfy BuilderTypeDefinition. */
const writeTimeDef: BuilderTypeDefinition<WriteTimeFields> = {
  type: 'test.write_time',
  name: 'Write-time test type',
  description: 'A fixture type that compiles at write time.',
  compilation: 'write_time',
  builderFieldsSchema: z.object({ query_text: z.string().max(1000) }).strict(),
  validateFields: (fields): string[] => {
    if (fields.query_text.trim().length === 0) {
      return ['query_text must not be blank'];
    }
    return [];
  },
  manifest: writeTimeManifest,
  generateQuery: (_input: QueryGenerationInput<WriteTimeFields>): GeneratedQuery => ({
    query: {
      format: 'standalone',
      breach: { query: 'FROM logs-* | LIMIT 10' },
    },
  }),
};

// ---------------------------------------------------------------------------
// Execution-time fixture
//
// An execution_time builder type exercising every optional property: manifest
// with sub-field mappings, validateFields, deriveRuleFields, and enrichRuleEvent.
// The run context is passed to generateQuery to verify the widened input shape.
// ---------------------------------------------------------------------------

interface ExecTimeFields {
  risk_score: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

const execTimeManifest: BuilderTypeManifest = {
  type: 'test.execution_time',
  currentVersion: 1,
  versions: {
    1: {
      addedSubFieldMappings: {
        risk_score: { type: 'integer' } satisfies MappingProperty,
        severity: { type: 'keyword' } satisfies MappingProperty,
      },
      backfillFn: (fields) => fields,
    },
  },
};

/** Compile-time assertion: the object must satisfy BuilderTypeDefinition. */
const execTimeDef: BuilderTypeDefinition<ExecTimeFields> = {
  type: 'test.execution_time',
  name: 'Execution-time test type',
  compilation: 'execution_time',
  kind: 'signal',
  ownership: { solution: 'test', domain: 'fixtures' },
  builderFieldsSchema: z
    .object({
      risk_score: z.number().int().min(0).max(100),
      severity: z.enum(['low', 'medium', 'high', 'critical']),
    })
    .strict(),
  manifest: execTimeManifest,
  validateFields: (fields): string[] => {
    return fields.risk_score > 100 ? ['risk_score must be <= 100'] : [];
  },
  deriveRuleFields: (_fields: ExecTimeFields): DerivedRuleFields => ({}),
  generateQuery: (input: QueryGenerationInput<ExecTimeFields>): GeneratedQuery => ({
    query: {
      format: 'standalone',
      // The run context is accessible; the fixture ignores it but the type must accept it.
      breach: {
        query: input.run
          ? `FROM logs-* | WHERE @timestamp >= "${input.run.window.start}" | LIMIT 10`
          : 'FROM logs-* | LIMIT 10',
      },
    },
  }),
  enrichRuleEvent: (input: RuleEventEnrichmentInput<ExecTimeFields>): RuleEventEnrichment => ({
    severity: input.fields.severity,
    data: {
      'kibana.alert.risk_score': input.fields.risk_score,
      'kibana.alert.rule.rule_id': input.rule.signature_id,
    },
  }),
};

// Suppress "unused variable" linting without altering the type-check assignments.
void writeTimeDef;
void execTimeDef;

// ---------------------------------------------------------------------------
// Runtime assertions — write_time fixture
// ---------------------------------------------------------------------------

describe('BuilderTypeDefinition — write_time fixture', () => {
  it('carries the expected type, name, and compilation', () => {
    expect(writeTimeDef.type).toBe('test.write_time');
    expect(writeTimeDef.name).toBe('Write-time test type');
    expect(writeTimeDef.compilation).toBe('write_time');
  });

  it('has a manifest with the correct type and currentVersion', () => {
    expect(writeTimeDef.manifest?.type).toBe('test.write_time');
    expect(writeTimeDef.manifest?.currentVersion).toBe(1);
  });

  it('generateQuery returns a GeneratedQuery when given a QueryGenerationInput', () => {
    const input: QueryGenerationInput<WriteTimeFields> = {
      fields: { query_text: 'event.type:start' },
      rule: {
        kind: 'alert',
        schedule: { every: '5m' },
        time_field: '@timestamp',
      },
    };
    const result = writeTimeDef.generateQuery(input);
    // Write-time types return synchronously; the result must not be a Promise.
    expect(result).not.toBeInstanceOf(Promise);
    expect((result as GeneratedQuery).query.format).toBe('standalone');
  });

  it('validateFields returns an error for a blank query', () => {
    const errors = writeTimeDef.validateFields!({ query_text: '   ' });
    expect(errors).toContain('query_text must not be blank');
  });

  it('validateFields returns no errors for a valid query', () => {
    const errors = writeTimeDef.validateFields!({ query_text: 'event.type:start' });
    expect(errors).toHaveLength(0);
  });

  it('has no deriveRuleFields or enrichRuleEvent (write-time does not use them)', () => {
    expect(writeTimeDef.deriveRuleFields).toBeUndefined();
    expect(writeTimeDef.enrichRuleEvent).toBeUndefined();
  });

  it('has no kind or ownership (unmanaged type)', () => {
    expect(writeTimeDef.kind).toBeUndefined();
    expect(writeTimeDef.ownership).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Runtime assertions — execution_time fixture
// ---------------------------------------------------------------------------

describe('BuilderTypeDefinition — execution_time fixture', () => {
  it('carries the expected type, compilation, kind, and ownership', () => {
    expect(execTimeDef.type).toBe('test.execution_time');
    expect(execTimeDef.compilation).toBe('execution_time');
    expect(execTimeDef.kind).toBe('signal');
    expect(execTimeDef.ownership).toEqual({ solution: 'test', domain: 'fixtures' });
  });

  it('has a manifest with version 1 declaring risk_score and severity sub-fields', () => {
    const v1 = execTimeDef.manifest?.versions[1];
    expect(v1?.addedSubFieldMappings).toEqual({
      risk_score: { type: 'integer' },
      severity: { type: 'keyword' },
    });
  });

  it('manifest version 1 carries a backfillFn', () => {
    const v1 = execTimeDef.manifest?.versions[1];
    expect(typeof v1?.backfillFn).toBe('function');
  });

  it('generateQuery accepts a QueryGenerationInput without a run context', () => {
    const input: QueryGenerationInput<ExecTimeFields> = {
      fields: { risk_score: 50, severity: 'high' },
      rule: {
        id: 'rule-abc',
        kind: 'signal',
        schedule: { every: '5m', lookback: '6m' },
        time_field: '@timestamp',
      },
    };
    const result = execTimeDef.generateQuery(input);
    expect(result).not.toBeInstanceOf(Promise);
    expect((result as GeneratedQuery).query.format).toBe('standalone');
  });

  it('generateQuery accepts a QueryGenerationInput with a run context', () => {
    const input: QueryGenerationInput<ExecTimeFields> = {
      fields: { risk_score: 30, severity: 'medium' },
      rule: {
        id: 'rule-xyz',
        kind: 'signal',
        schedule: { every: '5m', lookback: '6m' },
        time_field: '@timestamp',
      },
      run: {
        now: '2024-01-01T00:00:00.000Z',
        window: { start: '2023-12-31T23:54:00.000Z', end: '2024-01-01T00:00:00.000Z' },
      },
    };
    const result = execTimeDef.generateQuery(input);
    expect(result).not.toBeInstanceOf(Promise);
    // The fixture uses window.start in the breach query when run is present.
    const query = result as GeneratedQuery;
    expect((query.query as { breach: { query: string } }).breach.query).toContain(
      '2023-12-31T23:54:00.000Z'
    );
  });

  it('deriveRuleFields returns an empty DerivedRuleFields for the fixture', () => {
    const derived = execTimeDef.deriveRuleFields!({ risk_score: 50, severity: 'high' });
    expect(derived).toEqual({});
  });

  it('enrichRuleEvent stamps severity, risk_score, and signature_id', () => {
    const input: RuleEventEnrichmentInput<ExecTimeFields> = {
      fields: { risk_score: 75, severity: 'critical' },
      rule: { id: 'rule-abc', signature_id: 'SIG-001', kind: 'signal' },
      row: { '@timestamp': '2024-01-01T00:00:00.000Z', message: 'test' },
    };
    const enrichment = execTimeDef.enrichRuleEvent!(input);
    expect(enrichment.severity).toBe('critical');
    expect(enrichment.data?.['kibana.alert.risk_score']).toBe(75);
    expect(enrichment.data?.['kibana.alert.rule.rule_id']).toBe('SIG-001');
  });

  it('enrichRuleEvent does not mutate the row', () => {
    const row = { '@timestamp': '2024-01-01T00:00:00.000Z' };
    const input: RuleEventEnrichmentInput<ExecTimeFields> = {
      fields: { risk_score: 10, severity: 'low' },
      rule: { id: 'rule-x', signature_id: 'sig-x', kind: 'signal' },
      row,
    };
    execTimeDef.enrichRuleEvent!(input);
    // The original row object is untouched.
    expect(row).toEqual({ '@timestamp': '2024-01-01T00:00:00.000Z' });
  });
});

// ---------------------------------------------------------------------------
// MappingProperty allowlist coverage
//
// Verifies that every member of the union compiles and carries the right shape
// at runtime. The compile-time check is the primary assertion.
// ---------------------------------------------------------------------------

describe('MappingProperty — allowlist coverage', () => {
  const examples: MappingProperty[] = [
    { type: 'keyword' },
    { type: 'text' },
    { type: 'integer' },
    { type: 'long' },
    { type: 'short' },
    { type: 'byte' },
    { type: 'double' },
    { type: 'float' },
    { type: 'half_float' },
    { type: 'scaled_float', scaling_factor: 1000 },
    { type: 'unsigned_long' },
    { type: 'date' },
    { type: 'ip' },
    { type: 'boolean' },
  ];

  it('contains fourteen member types', () => {
    expect(examples).toHaveLength(14);
  });

  it('scaled_float carries the required scaling_factor', () => {
    const sf = examples.find((e) => e.type === 'scaled_float') as Extract<
      MappingProperty,
      { type: 'scaled_float' }
    >;
    expect(sf.scaling_factor).toBe(1000);
  });

  it('covers all expected type strings', () => {
    const types = examples.map((e) => e.type);
    expect(types).toContain('keyword');
    expect(types).toContain('text');
    expect(types).toContain('integer');
    expect(types).toContain('date');
    expect(types).toContain('ip');
    expect(types).toContain('boolean');
  });
});
