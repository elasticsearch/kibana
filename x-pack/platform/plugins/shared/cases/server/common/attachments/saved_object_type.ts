/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObject, SavedObjectsClientContract } from '@kbn/core/server';
import type { SavedObjectError } from '@kbn/core-saved-objects-common';
import { CASE_ATTACHMENT_SAVED_OBJECT, CASE_COMMENT_SAVED_OBJECT } from '../../../common/constants';
import type { ConfigType } from '../../config';
import { createCaseErrorFromSOError, isSOError } from '../error';
import type { SOWithErrors } from '../types';

export type ResolvedAttachmentSavedObjectType =
  | typeof CASE_ATTACHMENT_SAVED_OBJECT
  | typeof CASE_COMMENT_SAVED_OBJECT
  | null;

/**
 * Returns the saved object type new attachments should be written to, gated by
 * the `cases.attachments.enabled` config flag.
 */
export function getAttachmentSavedObjectType(
  config: ConfigType
): typeof CASE_ATTACHMENT_SAVED_OBJECT | typeof CASE_COMMENT_SAVED_OBJECT {
  if (config.attachments?.enabled) {
    return CASE_ATTACHMENT_SAVED_OBJECT;
  }
  return CASE_COMMENT_SAVED_OBJECT;
}

/**
 * Resolves which saved object type contains each attachment id, using a single
 * `bulkGet` round trip (2 entries per id). Results are returned in input order;
 * an id present in neither SO type resolves to `null`. Callers with a single
 * id can pass `[id]` and read `result[0]`.
 *
 * Errors are handled as follows:
 *  - `404` on a bucket is treated as "missing" and falls back to the other bucket.
 *  - Any non-`404` error is re-thrown so callers don't silently mis-route updates.
 *  - Throws if the SO bulkGet response is missing the unified or legacy entry for an id.
 */
export async function resolveAttachmentSavedObjectTypes(
  client: SavedObjectsClientContract,
  savedObjectIds: string[]
): Promise<ResolvedAttachmentSavedObjectType[]> {
  if (savedObjectIds.length === 0) {
    return [];
  }

  const response = await client.bulkGet<unknown>(
    savedObjectIds.flatMap((id) => [
      { id, type: CASE_ATTACHMENT_SAVED_OBJECT },
      { id, type: CASE_COMMENT_SAVED_OBJECT },
    ])
  );

  // Index responses by `${type}:${id}` so resolution doesn't rely on the SO
  // client preserving request order.
  const keyFor = (type: string, id: string) => `${type}:${id}`;
  const byKey = new Map<string, SavedObject<unknown> | SOWithErrors<unknown>>();
  for (const so of response.saved_objects) {
    byKey.set(keyFor(so.type, so.id), so);
  }

  // `bulkGet` always returns `SavedObjectError` (not `DecoratedError`) on its
  // error entries, so `.statusCode` is the right field to inspect.
  const statusCodeOf = (so: SOWithErrors<unknown>): number =>
    (so.error as SavedObjectError).statusCode;

  return savedObjectIds.map((id) => {
    const unified = byKey.get(keyFor(CASE_ATTACHMENT_SAVED_OBJECT, id));
    const legacy = byKey.get(keyFor(CASE_COMMENT_SAVED_OBJECT, id));
    if (!unified || !legacy) {
      throw new Error(
        `resolveAttachmentSavedObjectTypes: SO bulkGet response missing entry for id="${id}" ` +
          `(unified=${unified != null}, legacy=${legacy != null}).`
      );
    }

    // Re-throw non-404 errors so transient SO client failures don't get silently
    // treated as "missing" and route writes to the wrong bucket.
    if (isSOError(unified) && statusCodeOf(unified) !== 404) {
      throw createCaseErrorFromSOError(
        unified.error,
        `Failed to resolve attachment SO type for ${CASE_ATTACHMENT_SAVED_OBJECT}/${id}`
      );
    }
    if (isSOError(legacy) && statusCodeOf(legacy) !== 404) {
      throw createCaseErrorFromSOError(
        legacy.error,
        `Failed to resolve attachment SO type for ${CASE_COMMENT_SAVED_OBJECT}/${id}`
      );
    }

    if (!isSOError(unified)) {
      return CASE_ATTACHMENT_SAVED_OBJECT;
    }
    if (!isSOError(legacy)) {
      return CASE_COMMENT_SAVED_OBJECT;
    }
    return null;
  });
}
