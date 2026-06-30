/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import type { RuntimeFieldSpec, RuntimeType } from '@kbn/data-views-plugin/common';

/**
 * Prefix on every fingerprint produced by `computeRuntimeFieldsFingerprint`.
 * Bump whenever `SUFFIX_TO_RUNTIME_TYPE` or `buildPainlessSource` would
 * produce a different spec for any snake-key — that invalidates every
 * cached fingerprint and forces all spaces to re-run the diff path on
 * their next ensure.
 */
export const RUNTIME_FIELDS_BUILD_VERSION = 1;

/**
 * Cases-template type suffixes (the second half of `<name>_as_<type>`
 * snake-keys) mapped to Elasticsearch runtime field types.
 *
 * Source of truth for the input set:
 * `common/types/domain/template/fields.ts` (`BaseFieldSchema.type`). All
 * numeric variants collapse to `long` or `double` because the runtime
 * field type set is smaller than the ES mapping type set.
 *
 * `keyword` is included so keyword-typed template fields surface as
 * discoverable fields in Kibana data views. Their indexed values live
 * inside `cases.extended_fields` (mapped as `flattened`, see
 * `mappings/case.ts`), and Kibana data views don't expose `flattened`
 * sub-keys directly — only the parent shows up in Discover / Lens. The
 * runtime field at `cases.<name>_as_keyword` re-publishes each value as
 * a typed leaf.
 *
 * `unsigned_long` collapses to `long`; values past `Long.MAX_VALUE` lose
 * precision at the data view layer but stay accurate in the index.
 */
const SUFFIX_TO_RUNTIME_TYPE: Record<string, RuntimeType> = {
  long: 'long',
  integer: 'long',
  short: 'long',
  byte: 'long',
  unsigned_long: 'long',
  double: 'double',
  float: 'double',
  half_float: 'double',
  scaled_float: 'double',
  date: 'date',
  boolean: 'boolean',
  keyword: 'keyword',
};

/**
 * Every suffix the cases template system can emit. Derived from
 * `SUFFIX_TO_RUNTIME_TYPE` so adding a new template type extends it
 * automatically.
 *
 * Exported for `mappings/schema_drift.test.ts`, which forbids any mapping
 * field whose leaf ends in `_as_<one of these>` from colliding with a
 * runtime field of the same name.
 */
export const ALL_TEMPLATE_TYPE_SUFFIXES: readonly string[] = Object.keys(SUFFIX_TO_RUNTIME_TYPE);

/** Runtime type for a snake-key suffix, or `undefined` if unknown. */
export const suffixToRuntimeType = (suffix: string): RuntimeType | undefined => {
  return SUFFIX_TO_RUNTIME_TYPE[suffix];
};

/**
 * Charset and length cap enforced by `splitSnakeKey`. The snake-key is
 * concatenated verbatim into a Painless string literal in
 * `buildPainlessSource`, so any quote, backslash, or newline would either
 * break the script or open a script-injection path. Template field names
 * are validated upstream in `common/types/domain/template/fields.ts`, but
 * that schema accepts any string today, so this guard runs independently.
 * The length cap keeps Painless compile budgets bounded.
 */
const SAFE_SNAKE_KEY = /^[A-Za-z0-9_]+$/;
const MAX_SNAKE_KEY_LENGTH = 256;

/**
 * Splits a snake-key into `{ name, suffix }`, or returns `null` if the key
 * has no `_as_<suffix>` segment, exceeds the length cap, or contains any
 * character outside `[A-Za-z0-9_]`.
 *
 * Splits on the last `_as_` so user-chosen names with underscores
 * (e.g. `risk_score_as_long`) recover the correct suffix.
 */
export const splitSnakeKey = (snakeKey: string): { name: string; suffix: string } | null => {
  if (snakeKey.length === 0 || snakeKey.length > MAX_SNAKE_KEY_LENGTH) return null;
  if (!SAFE_SNAKE_KEY.test(snakeKey)) return null;
  const marker = '_as_';
  const idx = snakeKey.lastIndexOf(marker);
  if (idx < 0) return null;
  const name = snakeKey.slice(0, idx);
  const suffix = snakeKey.slice(idx + marker.length);
  if (!name || !suffix) return null;
  return { name, suffix };
};

/**
 * Painless source that reads `cases.extended_fields.<snakeKey>` and emits
 * a parsed value of the target runtime type.
 *
 * Access pattern is `doc['cases.extended_fields.<snakeKey>']`: ES exposes
 * `flattened` sub-keys as doc-values-backed paths under the parent
 * (see "Retrieving flattened fields" in the ES docs). Walking
 * `params._source` returns nothing on `index.mode: lookup` indices like
 * `.cases` because `_source` is reconstructed from doc values and the
 * sub-object structure is lost.
 *
 * The script iterates the doc-values list so multi-valued template fields
 * publish every value, and swallows per-value parse failures so a single
 * bad value doesn't break the field for every doc in Lens / Discover.
 *
 * `${snakeKey}` is interpolated verbatim into the Painless string literal;
 * `splitSnakeKey` restricts it to `[A-Za-z0-9_]+` so the literal stays
 * safe.
 */
export const buildPainlessSource = (snakeKey: string, runtimeType: RuntimeType): string => {
  const fieldPath = `cases.extended_fields.${snakeKey}`;
  // `doc[path]` returns a `ScriptDocValues` instance. `.empty` short-circuits
  // when no value is present; iteration yields the typed leaf values (Strings
  // for keyword-backed fields, which is how ES indexes flattened sub-keys).
  const guard = `def vals = doc['${fieldPath}']; if (vals == null || vals.empty) { return; }`;

  switch (runtimeType) {
    case 'long':
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v == null || v.length() == 0) { continue; } ` +
        `try { emit(Long.parseLong(v)); } catch (Exception e) {} ` +
        `}`
      );
    case 'double':
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v == null || v.length() == 0) { continue; } ` +
        `try { emit(Double.parseDouble(v)); } catch (Exception e) {} ` +
        `}`
      );
    case 'date':
      // ISO-8601 with or without offset. `Instant.parse` requires a `Z` or
      // explicit offset; fall back to `LocalDateTime` in UTC for naive
      // timestamps.
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v == null || v.length() == 0) { continue; } ` +
        `try { emit(Instant.parse(v).toEpochMilli()); continue; } catch (Exception e1) {} ` +
        `try { emit(LocalDateTime.parse(v).toInstant(ZoneOffset.UTC).toEpochMilli()); } catch (Exception e2) {} ` +
        `}`
      );
    case 'boolean':
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v == null || v.length() == 0) { continue; } ` +
        `try { emit(Boolean.parseBoolean(v)); } catch (Exception e) {} ` +
        `}`
      );
    case 'keyword':
      // Flattened sub-keys are stored as keyword, so doc-values iteration
      // yields the raw strings directly — no parsing needed.
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v != null && v.length() > 0) { emit(v); } ` +
        `}`
      );
    default:
      // ip / geo_point / composite — not produced by the template system
      // today. If a future template type maps here, extend this switch
      // alongside the suffix → runtime type table. The fallthrough emits the
      // raw string so the field at least has a value, even if untyped.
      return (
        `${guard} ` +
        `for (String v : vals) { ` +
        `if (v != null && v.length() > 0) { emit(v); } ` +
        `}`
      );
  }
};

/** A runtime field ready to merge into a data view's `runtimeFieldMap`. */
export interface RuntimeFieldEntry {
  /** Published name in the data view — a direct child of `cases`, e.g. `cases.score_as_long`. */
  fieldName: string;
  spec: RuntimeFieldSpec;
}

/**
 * From a template snake-key, return the runtime field entry to merge into a
 * data view's `runtimeFieldMap`, or `null` when the snake-key isn't shaped
 * like `<name>_as_<type>` or its suffix is unknown.
 *
 * Publication path is `cases.<snakeKey>` (e.g. `cases.riskScore_as_long`),
 * sitting alongside `cases.title`, `cases.severity`, etc. The Painless
 * reads the value via `doc['cases.extended_fields.<snakeKey>']` — the
 * indexed value lives inside a `flattened` field (see `mappings/case.ts`),
 * and ES exposes flattened sub-keys as doc-values-backed paths under the
 * parent's value stream.
 *
 * The publication path is `cases.<snakeKey>` rather than the indexed path
 * `cases.extended_fields.<snakeKey>` because Kibana data views resolve a
 * field name by merging `{ ...runtime, ...mapped }`: mapped fields take
 * precedence, so a runtime field at the indexed path would be shadowed by
 * the keyword mapping and Lens would lose the typed filter operators.
 * `mappings/schema_drift.test.ts` enforces that no direct child of `cases`
 * ends in `_as_<type>` for any supported suffix, bounding the collision
 * risk for the publication path.
 */
export const buildRuntimeFieldEntry = (snakeKey: string): RuntimeFieldEntry | null => {
  const split = splitSnakeKey(snakeKey);
  if (!split) return null;

  const runtimeType = suffixToRuntimeType(split.suffix);
  if (runtimeType === undefined) return null;

  return {
    fieldName: `cases.${snakeKey}`,
    spec: {
      type: runtimeType,
      script: { source: buildPainlessSource(snakeKey, runtimeType) },
    },
  };
};

/**
 * Stable digest of the snake-keys that drive a runtime field map. Used by
 * `CasesAnalyticsV2DataViewService` to short-circuit the `dvService.get`
 * + `isEqual` diff path when the intended state is byte-identical to the
 * last successful ensure on this node.
 *
 * Inputs are unique-and-sorted before hashing so traversal order doesn't
 * affect the digest. The digest is prefixed with `RUNTIME_FIELDS_BUILD_VERSION`
 * so a change to the suffix → runtime-type table or the Painless transform
 * invalidates every cached fingerprint without a manual cache flush.
 *
 * Truncated to 16 hex chars (~64 bits). Fingerprints are process-local and
 * never leave the node, so SHA-256 is used purely to satisfy Kibana's
 * `createHash` typing (the platform's algorithm union doesn't accept
 * SHA-1). Collision probability across any pair is ~1 in 2^32 by the
 * birthday bound; the worst case from a hit is a real change going
 * undetected on one node until the bootstrap cache TTL elapses.
 */
export const computeRuntimeFieldsFingerprint = (snakeKeys: readonly string[]): string => {
  const unique = Array.from(new Set(snakeKeys)).sort();
  const hash = createHash('sha256').update(unique.join('\n')).digest('hex').slice(0, 16);
  return `v${RUNTIME_FIELDS_BUILD_VERSION}:${hash}`;
};
