/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeHistoryListItem } from '../types/change_history_list_item';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Reads a domain version/sequence label from list-item metadata when present. */
export const getRestoreVersionLabel = (change: ChangeHistoryListItem): number | undefined => {
  const metadata = change.metadata;
  if (!isRecord(metadata)) {
    return undefined;
  }

  const { version, sequence } = metadata;
  if (typeof version === 'number') {
    return version;
  }
  if (typeof sequence === 'number') {
    return sequence;
  }

  return undefined;
};
