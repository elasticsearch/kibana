/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { estypes } from '@elastic/elasticsearch';

import type {
  RuntimeFieldType,
  RuntimeFieldMapping,
} from '../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';

/**
 * The subset of `MappingRuntimeFields` accepted on the bulk-close route via
 * `runtime_mappings`. Keyed by field name; values carry only the properties the
 * route schema validates (`type`, `script.source`, `format`).
 */
export type BulkCloseRuntimeMappings = Record<string, RuntimeFieldMapping>;

/**
 * Upper bound on `runtime_fields` entries accepted per request. Each entry
 * synthesizes one Painless runtime field that ES evaluates per candidate
 * document of the `_update_by_query`, so the count is capped to keep a
 * single request from scheduling unbounded script work. Mirrored as
 * `maxProperties` on `runtime_fields` in
 * `set_signals_status_route.schema.yaml`; the OpenAPI-to-Zod generator does
 * not translate `maxProperties`, so the route enforces this constant.
 */
export const MAX_RUNTIME_FIELDS_PER_REQUEST = 100;

/**
 * A constant Painless source that reads the value of `fieldName` from
 * `_source`. Handles both nested-object storage (`{source: {ip_ecs: ...}}`)
 * and the flat-dotted-key fallback (`{"source.ip_ecs": ...}`), and emits
 * each element if the stored value is an array.
 *
 * `on_script_error: 'continue'` tells ES that if the emit throws (typically
 * because the value in `_source` doesn't match the declared runtime type —
 * e.g. a string where the caller declared `long`), it should treat that
 * document as having no value rather than failing the whole search. Without
 * this, one badly-typed alert would abort the entire bulk close.
 *
 * TODO: `on_script_error` isn't yet declared on `MappingRuntimeField` in
 * `@elastic/elasticsearch`'s generated TS types — we widen the return
 * type inline. Drop the widen once
 * elastic/elasticsearch-specification#6390 lands and the fix propagates
 * through the vendored `@elastic/elasticsearch` client.
 */
export const buildSourceReadingRuntimeField = (
  fieldName: string,
  type: estypes.MappingRuntimeFieldType
): estypes.MappingRuntimeField & { on_script_error?: 'fail' | 'continue' } => ({
  type,
  on_script_error: 'continue',
  script: {
    source: `
      def v = params._source[params.fieldName];
      if (v == null) {
        def cur = params._source;
        for (def part : params.fieldName.splitOnToken('.')) {
          if (!(cur instanceof Map)) { cur = null; break; }
          cur = cur.get(part);
        }
        v = cur;
      }
      if (v != null) {
        if (v instanceof List) {
          for (def item : v) { if (item != null) emit(item); }
        } else {
          emit(v);
        }
      }
    `,
    params: { fieldName },
  },
});

/**
 * Build a `runtime_mappings` object from the caller-provided field-name →
 * type map for attachment to the bulk-close `_update_by_query`. Each entry
 * becomes a `_source`-reading runtime field of the given type, so the
 * close query can reference fields that aren't natively mapped on the
 * alerts index but are present on each alert's `_source`.
 *
 * Returns `undefined` for an empty/missing input so callers can pass the
 * result straight to ES without an empty `runtime_mappings: {}`.
 */
export const buildRuntimeMappingsFromFieldTypes = (
  runtimeFields: Record<string, RuntimeFieldType> | undefined
): estypes.MappingRuntimeFields | undefined => {
  if (!runtimeFields) return undefined;
  const entries = Object.entries(runtimeFields);
  if (entries.length === 0) return undefined;
  return Object.fromEntries(
    entries.map(([name, type]) => [name, buildSourceReadingRuntimeField(name, type)])
  );
};

/**
 * Merge caller-synthesised (`runtime_fields`) and caller-verbatim
 * (`runtime_mappings`) runtime field inputs into a single
 * `runtime_mappings` object for attachment to the `_update_by_query`.
 *
 * Passthrough entries (from `runtime_mappings`) take precedence on key
 * collision — they carry the full mapping semantics (script, format, …)
 * and the synthesised `_source` reader is the fallback. Nothing sends both
 * today, but the precedence rule ensures correctness if they ever overlap.
 *
 * `on_script_error: 'continue'` is stamped on every passthrough entry for
 * the same reason it is set on synthesised fields: one alert whose value
 * throws inside the Painless script should be skipped rather than aborting
 * the whole `_update_by_query`. The value is never read from the request
 * body.
 *
 * `script.params` and `lang` are intentionally not forwarded — the
 * `RuntimeFieldMapping` schema accepts only `{ source }` on the script
 * object and rejects any extra properties with a Zod 400 before this
 * function is called. Callers (e.g. `toBulkCloseRuntimeMappings` on the
 * client) should drop entries whose script contains unsupported properties
 * rather than relying on server-side rejection.
 *
 * Returns `undefined` when both inputs are empty/missing so callers can
 * pass the result straight to ES without an empty `runtime_mappings: {}`.
 */
export const mergeBulkCloseRuntimeMappings = (
  synthesized: estypes.MappingRuntimeFields | undefined,
  passthrough: BulkCloseRuntimeMappings | undefined
): estypes.MappingRuntimeFields | undefined => {
  const passthroughEntries = passthrough ? Object.entries(passthrough) : [];
  const passthroughMapped: estypes.MappingRuntimeFields = Object.fromEntries(
    passthroughEntries.map(([name, mapping]) => {
      const field: estypes.MappingRuntimeField & { on_script_error?: 'fail' | 'continue' } = {
        type: mapping.type as estypes.MappingRuntimeFieldType,
        // on_script_error is only meaningful (and safe to send) when a script is present.
        // ES ignores it for scriptless fields in practice, but omitting it keeps the payload
        // clean and avoids any future ES validation that might reject the property without a script.
        ...(mapping.script
          ? {
              on_script_error: 'continue',
              script: { source: mapping.script.source },
            }
          : {}),
        ...(mapping.format ? { format: mapping.format } : {}),
      };
      return [name, field];
    })
  );

  // Merge: passthrough wins on collision.
  const merged: estypes.MappingRuntimeFields = { ...synthesized, ...passthroughMapped };
  return Object.keys(merged).length > 0 ? merged : undefined;
};
