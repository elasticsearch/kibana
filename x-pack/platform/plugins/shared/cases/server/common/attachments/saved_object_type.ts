/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SavedObjectsClientContract } from '@kbn/core/server';
import { CASE_ATTACHMENT_SAVED_OBJECT, CASE_COMMENT_SAVED_OBJECT } from '../../../common/constants';
import type { ConfigType } from '../../config';
import { isSOError } from '../error';

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
 * Throws if the saved objects client returns a response whose length does not
 * match the request (i.e. the SO client contract of returning one entry per
 * request in input order is violated).
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

  const expected = savedObjectIds.length * 2;
  if (response.saved_objects.length !== expected) {
    throw new Error(
      `resolveAttachmentSavedObjectTypes: SO bulkGet contract violation. Expected ${expected} entries ` +
        `(2 per id for ${savedObjectIds.length} ids), received ${response.saved_objects.length}.`
    );
  }

  return savedObjectIds.map((_, idx) => {
    const unified = response.saved_objects[idx * 2];
    const legacy = response.saved_objects[idx * 2 + 1];
    if (!isSOError(unified)) {
      return CASE_ATTACHMENT_SAVED_OBJECT;
    }
    if (!isSOError(legacy)) {
      return CASE_COMMENT_SAVED_OBJECT;
    }
    return null;
  });
}
