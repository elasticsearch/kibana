/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Characterization tests for builder_resolution.ts.
 *
 * These tests pin the behavior of `resolveCreateRuleBuilder` and
 * `resolveUpdateRuleBuilder` as they stand before later phases change them.
 * They are the safety net for every subsequent edit.  They deliberately do
 * NOT fix bugs — they pin buggy behavior when it exists, with a comment
 * naming the bug.
 *
 * `resolveCreateRuleBuilder` is used by:
 *   - createRule  (create path)
 *   - upsertRule's "replace" branch (PUT path)
 *
 * `resolveUpdateRuleBuilder` is used by:
 *   - updateRule  (PATCH path)
 *
 * Mocking strategy: BuilderTypeRegistry is given a minimal jest mock because
 * the resolution functions need only `generate()`.  Registry-level validation
 * (bounded schema, duplicate registration) is covered separately in the
 * builder_type_registry tests.
 */

import type { CreateRuleData, UpdateRuleData } from '@kbn/alerting-v2-schemas';
import type { RuleSavedObjectAttributes } from '../../saved_objects';
import type { BuilderTypeRegistry, GeneratedQuery } from '../builder_types';
import { ALERTING_ERROR_CODES } from '../errors/error_codes';
import { createRuleSoAttributes } from '../test_utils';
import { resolveCreateRuleBuilder, resolveUpdateRuleBuilder } from './builder_resolution';

// ---------------------------------------------------------------------------
// Registry mock
// ---------------------------------------------------------------------------

/**
 * Creates a minimal BuilderTypeRegistry mock.  Only `generate` is consulted
 * by the two resolution functions under test.
 */
function createMockRegistry(
  generateFn: jest.Mock = jest.fn()
): BuilderTypeRegistry {
  return { generate: generateFn } as unknown as BuilderTypeRegistry;
}

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BUILDER_TYPE = 'test.builder';
const OTHER_BUILDER_TYPE = 'test.other-builder';
const RULE_ID = 'rule-abc-123';

/**
 * Raw fields as they arrive in the request body.  These are intentionally
 * NOT a parsed/transformed copy — the raw-persistence tests rely on object
 * identity.
 */
const RAW_FIELDS: Record<string, unknown> = { query: 'host.name: *', threshold: 5 };

// Minimal CreateRuleData for the plain (non-builder) path.
const baseCreateData = {
  kind: 'alert',
  metadata: { name: 'test-rule' },
  time_field: '@timestamp',
  schedule: { every: '5m' },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
} as CreateRuleData;

// CreateRuleData that carries builder fields instead of a query.
const builderCreateData = {
  kind: 'alert',
  metadata: { name: 'test-rule', builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
  time_field: '@timestamp',
  schedule: { every: '5m' },
} as unknown as CreateRuleData;

// Signal-kind variant of builderCreateData.
const signalBuilderCreateData = {
  ...builderCreateData,
  kind: 'signal',
} as unknown as CreateRuleData;

// Existing SO attributes for a plain (non-builder) rule.
const plainExisting: RuleSavedObjectAttributes = createRuleSoAttributes({
  metadata: { name: 'test-rule' },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
});

// Existing SO attributes for a rule that carries a builder type.
const builderExisting: RuleSavedObjectAttributes = createRuleSoAttributes({
  metadata: { name: 'test-rule', builder_type: BUILDER_TYPE },
  query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
});

// A simple standalone GeneratedQuery — no overrides for time_field or grouping.
const standaloneGenerated: GeneratedQuery = {
  query: { format: 'standalone', breach: { query: 'FROM metrics-* | LIMIT 10' } },
};

// A composed GeneratedQuery without a recovery segment.
const composedGenerated: GeneratedQuery = {
  query: {
    format: 'composed',
    base: 'FROM metrics-*',
    breach: { segment: '| WHERE cpu > 0.9' },
  },
};

// A composed GeneratedQuery that includes a recovery segment.
const composedWithRecoveryGenerated: GeneratedQuery = {
  query: {
    format: 'composed',
    base: 'FROM metrics-*',
    breach: { segment: '| WHERE cpu > 0.9' },
    recovery: { segment: '| WHERE cpu <= 0.9' },
  },
};

// ---------------------------------------------------------------------------
// resolveCreateRuleBuilder
// ---------------------------------------------------------------------------

describe('resolveCreateRuleBuilder', () => {
  // -------------------------------------------------------------------------
  // Plain query path — no builder_type / builder_fields in the request
  // -------------------------------------------------------------------------

  describe('plain query path', () => {
    it('returns the data unchanged (with its own query) when no builder fields are present', () => {
      const registry = createMockRegistry();

      const result = resolveCreateRuleBuilder(registry, baseCreateData);

      expect(result.query).toEqual(baseCreateData.query);
      expect(result).toMatchObject({ kind: 'alert', metadata: { name: 'test-rule' } });
    });

    it('does not call registry.generate on the plain query path', () => {
      const generate = jest.fn();
      const registry = createMockRegistry(generate);

      resolveCreateRuleBuilder(registry, baseCreateData);

      expect(generate).not.toHaveBeenCalled();
    });

    it('throws INVALID_RULE_DATA when neither builder fields nor a query is supplied', () => {
      const registry = createMockRegistry();
      const noQueryData = { ...baseCreateData, query: undefined } as CreateRuleData;

      expect(() => resolveCreateRuleBuilder(registry, noQueryData)).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({ code: ALERTING_ERROR_CODES.INVALID_RULE_DATA }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Builder path — builder_type and builder_fields both present
  // -------------------------------------------------------------------------

  describe('builder path', () => {
    it('calls registry.generate with the exact builder_type, builder_fields, and write-time rule context', () => {
      // Step 2.1: generate() now takes a third argument — the write-time rule context
      // (kind, schedule, time_field) derived from the create data. No id at create time.
      const generate = jest.fn().mockReturnValue(standaloneGenerated);
      const registry = createMockRegistry(generate);

      resolveCreateRuleBuilder(registry, builderCreateData);

      expect(generate).toHaveBeenCalledWith(BUILDER_TYPE, RAW_FIELDS, {
        kind: 'alert',
        schedule: { every: '5m' },
        time_field: '@timestamp',
      });
    });

    it('replaces the query in the result with the generated query', () => {
      const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));

      const result = resolveCreateRuleBuilder(registry, builderCreateData);

      expect(result.query).toEqual(standaloneGenerated.query);
    });

    // -----------------------------------------------------------------------
    // withGenerated override semantics
    // -----------------------------------------------------------------------

    describe('withGenerated override semantics', () => {
      it('overrides time_field from the generated output when generated.time_field is defined', () => {
        const generated: GeneratedQuery = { ...standaloneGenerated, time_field: 'event.created' };
        const registry = createMockRegistry(jest.fn().mockReturnValue(generated));
        const data = { ...builderCreateData, time_field: '@timestamp' } as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.time_field).toBe('event.created');
      });

      it('keeps the caller time_field when generated.time_field is undefined', () => {
        // Confirm no time_field override is present on standaloneGenerated.
        expect(standaloneGenerated.time_field).toBeUndefined();
        const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));
        const data = { ...builderCreateData, time_field: '@timestamp' } as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.time_field).toBe('@timestamp');
      });

      it('overrides grouping from the generated output when generated.grouping is defined', () => {
        const generated: GeneratedQuery = {
          ...standaloneGenerated,
          grouping: { fields: ['host.name'] },
        };
        const registry = createMockRegistry(jest.fn().mockReturnValue(generated));

        const result = resolveCreateRuleBuilder(registry, builderCreateData);

        expect(result.grouping).toEqual({ fields: ['host.name'] });
      });

      it('keeps the caller grouping when generated.grouping is undefined', () => {
        const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));
        const data = {
          ...builderCreateData,
          grouping: { fields: ['service.name'] },
        } as unknown as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.grouping).toEqual({ fields: ['service.name'] });
      });
    });

    // -----------------------------------------------------------------------
    // Raw request body persistence
    // -----------------------------------------------------------------------

    describe('raw request body persistence', () => {
      it('stores the raw builder_fields object from the request body, not a parsed copy', () => {
        // The review found: "The stored value is also the raw request body, not
        // the schema's parse result."  This test pins that invariant.
        const rawFields: Record<string, unknown> = { query: 'host.name: *', extra: 'raw-value' };
        const data = {
          ...builderCreateData,
          metadata: { ...builderCreateData.metadata, builder_fields: rawFields },
        } as unknown as CreateRuleData;
        const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));

        const result = resolveCreateRuleBuilder(registry, data);

        // Strict identity: the same object reference, not a transformed copy.
        expect(result.metadata.builder_fields).toBe(rawFields);
      });
    });

    // -----------------------------------------------------------------------
    // Signal kind adaptation (adaptToKind)
    // -----------------------------------------------------------------------

    describe('signal kind adaptation', () => {
      it('converts a composed query to standalone format for a signal rule', () => {
        const registry = createMockRegistry(jest.fn().mockReturnValue(composedGenerated));

        const result = resolveCreateRuleBuilder(registry, signalBuilderCreateData);

        expect(result.query.format).toBe('standalone');
      });

      it('produces the full composed query (base + breach) as the standalone breach query for a signal rule', () => {
        // getBreachEsqlQuery assembles "base | breach_segment", not just the segment.
        const registry = createMockRegistry(jest.fn().mockReturnValue(composedGenerated));

        const result = resolveCreateRuleBuilder(registry, signalBuilderCreateData);

        const q = result.query as { breach: { query: string } };
        expect(q.breach.query).toBe('FROM metrics-* | WHERE cpu > 0.9');
      });

      it('throws BUILDER_QUERY_GENERATION_FAILED when a composed query carries a recovery segment for a signal rule', () => {
        const registry = createMockRegistry(
          jest.fn().mockReturnValue(composedWithRecoveryGenerated)
        );

        expect(() => resolveCreateRuleBuilder(registry, signalBuilderCreateData)).toThrow(
          expect.objectContaining({
            output: expect.objectContaining({ statusCode: 400 }),
            data: expect.objectContaining({
              code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
            }),
          })
        );
      });

      it('passes a standalone query through unchanged for a signal rule', () => {
        const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));

        const result = resolveCreateRuleBuilder(registry, signalBuilderCreateData);

        expect(result.query).toEqual(standaloneGenerated.query);
      });
    });

    // -----------------------------------------------------------------------
    // Recovery strategy auto-resolution
    // -----------------------------------------------------------------------

    describe('recovery strategy auto-resolution', () => {
      it('auto-sets recovery_strategy to "query" when the builder generates a recovery segment and recovery_strategy is undefined', () => {
        const registry = createMockRegistry(
          jest.fn().mockReturnValue(composedWithRecoveryGenerated)
        );
        const data = {
          ...builderCreateData,
          recovery_strategy: undefined,
        } as unknown as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.recovery_strategy).toBe('query');
        const q = result.query as { recovery?: unknown };
        expect(q.recovery).toBeDefined();
      });

      it('keeps recovery_strategy "query" and preserves the recovery segment when the strategy already matches', () => {
        const registry = createMockRegistry(
          jest.fn().mockReturnValue(composedWithRecoveryGenerated)
        );
        const data = {
          ...builderCreateData,
          recovery_strategy: 'query',
        } as unknown as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.recovery_strategy).toBe('query');
        const q = result.query as { recovery?: unknown };
        expect(q.recovery).toBeDefined();
      });

      it('strips the recovery segment from the generated query when recovery_strategy is "no_breach"', () => {
        const registry = createMockRegistry(
          jest.fn().mockReturnValue(composedWithRecoveryGenerated)
        );
        const data = {
          ...builderCreateData,
          recovery_strategy: 'no_breach',
        } as unknown as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.recovery_strategy).toBe('no_breach');
        const q = result.query as { recovery?: unknown };
        expect(q.recovery).toBeUndefined();
      });

      it('does not alter recovery_strategy when the builder generates no recovery segment', () => {
        const registry = createMockRegistry(jest.fn().mockReturnValue(composedGenerated));
        const data = {
          ...builderCreateData,
          recovery_strategy: 'no_breach',
        } as unknown as CreateRuleData;

        const result = resolveCreateRuleBuilder(registry, data);

        expect(result.recovery_strategy).toBe('no_breach');
      });
    });

    // -----------------------------------------------------------------------
    // GENERATED_QUERY_INVARIANTS checks
    // -----------------------------------------------------------------------

    describe('GENERATED_QUERY_INVARIANTS', () => {
      it('throws BUILDER_QUERY_GENERATION_FAILED when recovery_strategy is "query" but the builder generates no recovery', () => {
        // isRecoveryQueryProvidedForStrategy fails: strategy is 'query' but the
        // generated composed query has no recovery segment.
        const registry = createMockRegistry(jest.fn().mockReturnValue(composedGenerated));
        const data = {
          ...builderCreateData,
          recovery_strategy: 'query',
        } as unknown as CreateRuleData;

        expect(() => resolveCreateRuleBuilder(registry, data)).toThrow(
          expect.objectContaining({
            output: expect.objectContaining({ statusCode: 400 }),
            data: expect.objectContaining({
              code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
            }),
          })
        );
      });

      it('throws BUILDER_QUERY_GENERATION_FAILED when no_data_strategy requires a no_data block but none is generated', () => {
        // isNoDataQueryProvidedForStrategy fails: standalone format + non-none
        // no_data_strategy, but the generated query has no no_data block.
        const standaloneWithoutNoData: GeneratedQuery = {
          query: { format: 'standalone', breach: { query: 'FROM metrics-* | LIMIT 10' } },
        };
        const registry = createMockRegistry(
          jest.fn().mockReturnValue(standaloneWithoutNoData)
        );
        const data = {
          ...builderCreateData,
          no_data_strategy: 'last_known_status',
        } as unknown as CreateRuleData;

        expect(() => resolveCreateRuleBuilder(registry, data)).toThrow(
          expect.objectContaining({
            output: expect.objectContaining({ statusCode: 400 }),
            data: expect.objectContaining({
              code: ALERTING_ERROR_CODES.BUILDER_QUERY_GENERATION_FAILED,
            }),
          })
        );
      });
    });
  });
});

// ---------------------------------------------------------------------------
// resolveUpdateRuleBuilder
// ---------------------------------------------------------------------------

describe('resolveUpdateRuleBuilder', () => {
  // -------------------------------------------------------------------------
  // Clearing the builder with builder_type: null
  // -------------------------------------------------------------------------

  describe('clearing the builder (builder_type: null)', () => {
    it('sets both builder_type and builder_fields to null when builder_type: null', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_type: null } };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);

      expect(result.metadata?.builder_type).toBeNull();
      expect(result.metadata?.builder_fields).toBeNull();
    });

    it('does not call registry.generate when builder_type: null', () => {
      const generate = jest.fn();
      const registry = createMockRegistry(generate);
      const data: UpdateRuleData = { metadata: { builder_type: null } };

      resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);

      expect(generate).not.toHaveBeenCalled();
    });

    it('throws INVALID_BUILDER_FIELDS when builder_type: null but builder_fields is also set', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = {
        metadata: { builder_type: null, builder_fields: RAW_FIELDS },
      };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({ code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // Clearing builder_fields alone
  // -------------------------------------------------------------------------

  describe('clearing builder_fields alone', () => {
    it('throws INVALID_BUILDER_FIELDS when builder_fields: null and the effective type is the stored type', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_fields: null } };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({ code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS }),
        })
      );
    });

    it('throws INVALID_BUILDER_FIELDS when builder_fields: null and requestedType locks in an effective type', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = {
        metadata: { builder_type: BUILDER_TYPE, builder_fields: null },
      };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({ code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS }),
        })
      );
    });

    it('returns data unchanged when builder_fields: null and there is no effective type', () => {
      // effectiveType = requestedType ?? existingType = undefined ?? undefined = undefined
      // The null-fields guard only fires when effectiveType is truthy.
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_fields: null } };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

      expect(result).toBe(data);
    });
  });

  // -------------------------------------------------------------------------
  // Providing new builder_fields
  // -------------------------------------------------------------------------

  describe('providing new builder_fields', () => {
    it('calls registry.generate with the requestedType, new fields, and existing rule context', () => {
      // Step 2.1: generate() now takes a third argument — the write-time rule context
      // derived from the existing rule (id, kind, schedule, time_field).
      const generate = jest.fn().mockReturnValue(standaloneGenerated);
      const registry = createMockRegistry(generate);
      const data: UpdateRuleData = {
        metadata: { builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
      };

      resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

      expect(generate).toHaveBeenCalledWith(BUILDER_TYPE, RAW_FIELDS, {
        id: RULE_ID,
        kind: 'alert',
        schedule: { every: '1m', lookback: '5m' },
        time_field: '@timestamp',
      });
    });

    it('falls back to the existing builder_type when no requestedType is supplied', () => {
      const generate = jest.fn().mockReturnValue(standaloneGenerated);
      const registry = createMockRegistry(generate);
      const data: UpdateRuleData = { metadata: { builder_fields: RAW_FIELDS } };

      resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);

      expect(generate).toHaveBeenCalledWith(BUILDER_TYPE, RAW_FIELDS, {
        id: RULE_ID,
        kind: 'alert',
        schedule: { every: '1m', lookback: '5m' },
        time_field: '@timestamp',
      });
    });

    it('throws INVALID_BUILDER_FIELDS when builder_fields are provided but there is no effective type', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_fields: RAW_FIELDS } };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({ code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS }),
        })
      );
    });

    it('replaces query in the result with the generated query', () => {
      const generate = jest.fn().mockReturnValue(standaloneGenerated);
      const registry = createMockRegistry(generate);
      const data: UpdateRuleData = {
        metadata: { builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
      };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

      expect(result.query).toEqual(standaloneGenerated.query);
    });

    it('stamps the effective builder_type onto the result metadata', () => {
      const generate = jest.fn().mockReturnValue(standaloneGenerated);
      const registry = createMockRegistry(generate);
      // No requestedType — falls back to existingType.
      const data: UpdateRuleData = { metadata: { builder_fields: RAW_FIELDS } };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);

      expect(result.metadata?.builder_type).toBe(BUILDER_TYPE);
    });

    // -----------------------------------------------------------------------
    // withGenerated override semantics on the update path
    // -----------------------------------------------------------------------

    describe('withGenerated override semantics', () => {
      it('overrides time_field from the generated output when generated.time_field is defined', () => {
        const generated: GeneratedQuery = { ...standaloneGenerated, time_field: 'event.created' };
        const registry = createMockRegistry(jest.fn().mockReturnValue(generated));
        const data: UpdateRuleData = {
          metadata: { builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
          time_field: '@timestamp',
        };

        const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

        expect(result.time_field).toBe('event.created');
      });

      it('keeps the caller time_field when generated.time_field is undefined', () => {
        const registry = createMockRegistry(jest.fn().mockReturnValue(standaloneGenerated));
        const data: UpdateRuleData = {
          metadata: { builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
          time_field: '@timestamp',
        };

        const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

        expect(result.time_field).toBe('@timestamp');
      });

      it('overrides grouping from the generated output when generated.grouping is defined', () => {
        const generated: GeneratedQuery = {
          ...standaloneGenerated,
          grouping: { fields: ['host.name'] },
        };
        const registry = createMockRegistry(jest.fn().mockReturnValue(generated));
        const data: UpdateRuleData = {
          metadata: { builder_type: BUILDER_TYPE, builder_fields: RAW_FIELDS },
        };

        const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

        expect(result.grouping).toEqual({ fields: ['host.name'] });
      });
    });

    // -----------------------------------------------------------------------
    // Raw request body persistence on the update path
    // -----------------------------------------------------------------------

    describe('raw request body persistence', () => {
      it('stores the raw builder_fields object from the request, not a parsed copy', () => {
        const rawFields: Record<string, unknown> = { query: 'host: *', extra: 'raw-value' };
        const generate = jest.fn().mockReturnValue(standaloneGenerated);
        const registry = createMockRegistry(generate);
        const data: UpdateRuleData = {
          metadata: { builder_type: BUILDER_TYPE, builder_fields: rawFields },
        };

        const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

        // Strict identity: same raw object, not transformed.
        expect(result.metadata?.builder_fields).toBe(rawFields);
      });
    });

    // -----------------------------------------------------------------------
    // Recovery strategy on the update path
    // -----------------------------------------------------------------------

    describe('recovery strategy resolution', () => {
      it('auto-sets recovery_strategy to "query" when the builder generates a recovery segment and no strategy is in effect', () => {
        const generate = jest.fn().mockReturnValue(composedWithRecoveryGenerated);
        const registry = createMockRegistry(generate);
        const existingNoStrategy = createRuleSoAttributes({
          metadata: { name: 'test-rule', builder_type: BUILDER_TYPE },
          recovery_strategy: undefined,
        });
        const data: UpdateRuleData = { metadata: { builder_fields: RAW_FIELDS } };

        const result = resolveUpdateRuleBuilder(
          registry,
          RULE_ID,
          data,
          existingNoStrategy as unknown as RuleSavedObjectAttributes
        );

        expect(result.recovery_strategy).toBe('query');
      });

      it('strips the recovery segment when the effective strategy is not "query"', () => {
        const generate = jest.fn().mockReturnValue(composedWithRecoveryGenerated);
        const registry = createMockRegistry(generate);
        const existingNoBreach = createRuleSoAttributes({
          metadata: { name: 'test-rule', builder_type: BUILDER_TYPE },
          recovery_strategy: 'no_breach',
        });
        const data: UpdateRuleData = { metadata: { builder_fields: RAW_FIELDS } };

        const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, existingNoBreach);

        const q = result.query as { recovery?: unknown } | undefined;
        expect(q?.recovery).toBeUndefined();
      });
    });

    // -----------------------------------------------------------------------
    // GENERATED_QUERY_INVARIANTS are NOT checked on the update path
    // -----------------------------------------------------------------------

    describe('GENERATED_QUERY_INVARIANTS are not asserted on the update path', () => {
      /**
       * BUG (pinned): assertGeneratedQueryIsValid is called in
       * resolveCreateRuleBuilder but NOT in resolveUpdateRuleBuilder.  A
       * builder that returns a query violating the invariants (e.g.,
       * recovery_strategy: 'query' but no recovery generated) passes silently
       * on the update path.  Step 6.4 fixes this; these tests document the
       * current state so the fix can update them deliberately.
       */
      it('does not throw when recovery_strategy is "query" but the builder generates no recovery (bug: invariants not checked on update)', () => {
        // This same scenario throws BUILDER_QUERY_GENERATION_FAILED on the create path.
        const generate = jest.fn().mockReturnValue(standaloneGenerated);
        const registry = createMockRegistry(generate);
        const data: UpdateRuleData = {
          metadata: { builder_fields: RAW_FIELDS },
          recovery_strategy: 'query',
        };

        expect(() =>
          resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
        ).not.toThrow();
      });
    });
  });

  // -------------------------------------------------------------------------
  // BUILDER_TYPE_NOT_CLEARED guard
  // -------------------------------------------------------------------------

  describe('BUILDER_TYPE_NOT_CLEARED guard', () => {
    it('throws BUILDER_TYPE_NOT_CLEARED when the query is changed on a builder rule', () => {
      const registry = createMockRegistry();
      // Different from the stored query in builderExisting.
      const data: UpdateRuleData = {
        query: { format: 'standalone', breach: { query: 'FROM new-index-* | LIMIT 5' } },
      };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({
            code: ALERTING_ERROR_CODES.BUILDER_TYPE_NOT_CLEARED,
            details: expect.objectContaining({ rule_id: RULE_ID }),
          }),
        })
      );
    });

    it('includes the builder_type in the BUILDER_TYPE_NOT_CLEARED error details', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = {
        query: { format: 'standalone', breach: { query: 'FROM new-index-* | LIMIT 5' } },
      };

      let caught: unknown;
      try {
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);
      } catch (error) {
        caught = error;
      }

      expect(caught).toMatchObject({
        data: expect.objectContaining({
          details: expect.objectContaining({ builder_type: BUILDER_TYPE }),
        }),
      });
    });

    it('does not throw when the query sent equals the stored query', () => {
      const registry = createMockRegistry();
      // Exact same query as in builderExisting.
      const data: UpdateRuleData = {
        query: { format: 'standalone', breach: { query: 'FROM logs-* | LIMIT 10' } },
      };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).not.toThrow();
    });

    it('does not throw when query is absent from the update', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { tags: ['updated-tag'] } };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).not.toThrow();
    });

    it('allows a query change on a plain (non-builder) rule', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = {
        query: { format: 'standalone', breach: { query: 'FROM new-index-* | LIMIT 5' } },
      };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting)
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Builder type change without new fields
  // -------------------------------------------------------------------------

  describe('builder type change without new fields', () => {
    it('throws INVALID_BUILDER_FIELDS when switching from one builder type to another without supplying new fields', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_type: OTHER_BUILDER_TYPE } };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({
            code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
            details: expect.objectContaining({
              builder_type: OTHER_BUILDER_TYPE,
              previous_builder_type: BUILDER_TYPE,
            }),
          }),
        })
      );
    });

    it('throws INVALID_BUILDER_FIELDS when adopting a builder type on a plain rule without supplying fields', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { builder_type: BUILDER_TYPE } };

      expect(() =>
        resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting)
      ).toThrow(
        expect.objectContaining({
          output: expect.objectContaining({ statusCode: 400 }),
          data: expect.objectContaining({
            code: ALERTING_ERROR_CODES.INVALID_BUILDER_FIELDS,
            details: expect.objectContaining({ builder_type: BUILDER_TYPE }),
          }),
        })
      );
    });
  });

  // -------------------------------------------------------------------------
  // No builder-related changes — pass-through
  // -------------------------------------------------------------------------

  describe('no builder-related changes', () => {
    it('returns the data object unchanged when no builder type or field changes are made', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { tags: ['tag-1'] } };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, plainExisting);

      expect(result).toBe(data);
    });

    it('returns the data object unchanged when updating a builder rule with no query or field changes', () => {
      const registry = createMockRegistry();
      const data: UpdateRuleData = { metadata: { tags: ['tag-1'] } };

      const result = resolveUpdateRuleBuilder(registry, RULE_ID, data, builderExisting);

      expect(result).toBe(data);
    });
  });
});
