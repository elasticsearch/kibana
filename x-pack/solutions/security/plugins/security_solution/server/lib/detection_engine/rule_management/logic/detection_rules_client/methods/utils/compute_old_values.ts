/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isEqual, isPlainObject } from 'lodash';
import type { RuleResponse } from '../../../../../../../../common/api/detection_engine/model/rule_schema';

/**
 * Compute `old_values` for a rule history item: the RFC 7396 merge patch
 * describing the differences between `current` and `previous`. Returns `null`
 * when there is no predecessor (creation event) and an empty object when
 * `current` and `previous` are deep-equal.
 */
export function computeOldValues(
  current: RuleResponse,
  previous: RuleResponse | undefined
): Record<string, unknown> | null {
  if (previous === undefined) {
    return null;
  }
  const patch = mergePatchFromTo(current, previous);

  if (patch === NO_CHANGE) {
    return {};
  }

  return patch as Record<string, unknown>;
}

const NO_CHANGE = Symbol('NO_CHANGE');

/**
 * Compute an RFC 7396 JSON Merge Patch describing how to transform `current`
 * back to `previous`. The result contains only the fields whose values differ
 * between the two objects. Returns `NO_CHANGE` sentinel when the two are deep-equal.
 *
 * Semantics (per RFC 7396):
 *  - Keys present in both with equal values are omitted.
 *  - Keys present in `current` but missing in `previous` map to `null`.
 *  - Keys present in `previous` but missing in `current` map to the value from
 *    `previous`.
 *  - Keys present in both with object values recurse; if the recursion produces
 *    an empty patch, the key is omitted.
 *  - Arrays and primitives are compared as whole values; if they differ, the
 *    `previous` value is emitted under the key.
 *
 * `undefined` is treated as "absent": a key with value `undefined` is
 * equivalent to the key being missing. This handles optional rule fields like
 * `note` that are always emitted in the parsed object but may carry `undefined`
 * when not set — without this treatment, a transition from `undefined` → value
 * would be invisible to the diff.
 */
const mergePatchFromTo = (current: unknown, previous: unknown): unknown | typeof NO_CHANGE => {
  if (Object.is(current, previous)) {
    return NO_CHANGE;
  }

  if (isPlainObject(current) && isPlainObject(previous)) {
    const currentObject = current as Record<string, unknown>;
    const previousObject = previous as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    const keys = new Set<string>([...Object.keys(currentObject), ...Object.keys(previousObject)]);

    for (const key of keys) {
      // Treat `undefined` values as absent so optional fields that are always
      // emitted by the serialiser (e.g. `note: undefined`) compare correctly
      // against snapshots where the field was genuinely missing.
      const inCurrent = key in currentObject && currentObject[key] !== undefined;
      const inPrevious = key in previousObject && previousObject[key] !== undefined;

      if (inCurrent && !inPrevious) {
        patch[key] = null;
      } else if (!inCurrent && inPrevious) {
        patch[key] = previousObject[key];
      } else if (inCurrent && inPrevious) {
        const sub = mergePatchFromTo(currentObject[key], previousObject[key]);

        if (sub !== NO_CHANGE) {
          patch[key] = sub;
        }
      }
    }

    if (Object.keys(patch).length === 0) {
      return NO_CHANGE;
    }

    return patch;
  }

  if (Array.isArray(current) && Array.isArray(previous)) {
    if (isEqual(current, previous)) {
      return NO_CHANGE;
    }

    return previous;
  }

  return previous;
};
