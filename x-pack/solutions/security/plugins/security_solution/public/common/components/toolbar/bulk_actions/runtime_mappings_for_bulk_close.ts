/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MappingRuntimeFields, Script } from '@elastic/elasticsearch/lib/api/types';
import {
  RuntimeFieldTypeEnum,
  type RuntimeFieldMapping,
} from '../../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';

/**
 * The type for the `runtime_mappings` body parameter on the bulk-close route.
 * Mirrors {@link BulkCloseRuntimeMappings} from the server without creating a
 * cross-boundary import.
 */
export type BulkCloseRuntimeMappings = Record<string, RuntimeFieldMapping>;

/**
 * Types accepted by the `runtime_mappings` body parameter on the bulk-close
 * route. Derived from the server-side Zod enum so client and server stay in
 * sync when new types are added.
 *
 * `composite` and `lookup` are absent because:
 * - `composite` fields are queried through their sub-fields, not directly.
 * - `lookup` fields are resolved via the `fields` retrieval API, not in the
 *   filter context used by `_update_by_query`.
 * Forwarding either type would cause a Zod 400 from the route, which is worse
 * than a silent no-op (the old behaviour).
 */
const SUPPORTED_RUNTIME_FIELD_TYPES = new Set<string>(Object.values(RuntimeFieldTypeEnum));

const isSupportedType = (type: string): type is RuntimeFieldMapping['type'] =>
  SUPPORTED_RUNTIME_FIELD_TYPES.has(type);

/**
 * Convert the full `MappingRuntimeFields` from `dataView.getRuntimeMappings()`
 * into the narrower shape accepted by the bulk-close route's `runtime_mappings`
 * body parameter.
 *
 * - Drops entries whose `type` is not in the server's accepted enum (e.g.
 *   `composite`, `lookup`) so the route never rejects the request with a 400.
 * - Keeps `type`, `format`, and `script` (normalised to `{ source }`). A data
 *   view `RuntimeField.script` may be stored as a bare string; we normalise it
 *   so the route schema always receives an object.
 * - Strips unknown keys (`fetch_fields`, `input_field`, `target_field`, etc.)
 *   so the payload matches the route schema exactly.
 * - Returns `undefined` when the result would be empty, matching the server's
 *   convention for absent inputs.
 *
 * Use this instead of projecting to `{ [name]: field.type }` when you want
 * the caller's Painless script to be preserved end-to-end — the server will
 * forward the mapping verbatim to the `_update_by_query` rather than
 * synthesising a `_source[fieldName]` reader.
 */
export const toBulkCloseRuntimeMappings = (
  runtimeMappings?: MappingRuntimeFields
): BulkCloseRuntimeMappings | undefined => {
  if (!runtimeMappings) return undefined;

  const result = Object.entries(runtimeMappings).reduce<BulkCloseRuntimeMappings>(
    (acc, [name, field]) => {
      if (!isSupportedType(field.type)) return acc;

      const mapping: BulkCloseRuntimeMappings[string] = { type: field.type };

      if (field.script != null) {
        // A data view runtime field script may be stored as a bare string
        // (shorthand for `{ source: '...' }`). Normalise to the object form
        // that the route schema requires.
        if (typeof field.script === 'string') {
          mapping.script = { source: field.script };
        } else {
          const scriptObj = field.script as Script;
          const source = typeof scriptObj.source === 'string' ? scriptObj.source : undefined;

          if (!source || Object.keys(scriptObj).some((k) => k !== 'source')) {
            // Drop the entry when:
            // - No source: non-inline (e.g. stored script by id) — forwarding
            //   only {type} would silently become a _source reader.
            // - Extra keys (params, lang, …): the server schema accepts only
            //   { source } and rejects unknown properties with a 400. A script
            //   that references params.x would fail silently at runtime under
            //   on_script_error:continue, skipping alerts instead of matching
            //   them. Drop to avoid the semantic change.
            return acc;
          }
          mapping.script = { source };
        }
      }

      if (field.format) {
        mapping.format = field.format;
      }

      acc[name] = mapping;
      return acc;
    },
    {}
  );

  return Object.keys(result).length > 0 ? result : undefined;
};
