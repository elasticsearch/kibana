/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useCallback, useRef } from 'react';
import type { HttpSetup } from '@kbn/core/public';
import type { CleanupItem, SnippetVariableKey } from './use_tutorial_content';
import { parseApiSnippet, executeEsRequest, insertValues } from './use_execute_tutorial_step';
import { useKibana } from './use_kibana';

/**
 * Runs a single cleanup DELETE request. Treats 404 as success (resource already gone).
 * Throws on other errors.
 */
export const executeCleanupItem = async (
  http: HttpSetup,
  item: CleanupItem,
  savedValues: Record<SnippetVariableKey, string>
): Promise<void> => {
  const snippet = insertValues(item.apiSnippet, savedValues);
  const parsed = parseApiSnippet(snippet);
  const response = await executeEsRequest(http, parsed);

  const isNotFound = response.statusCode === 404;
  const hasError = Boolean(response.body.error);
  if (!isNotFound && hasError) {
    const errorObj = response.body.error as Record<string, unknown> | undefined;
    const errorReason =
      typeof response.body.error === 'string'
        ? (response.body.error as string)
        : (errorObj?.reason as string) ?? 'Delete failed';
    throw new Error(errorReason);
  }
};

export type CleanupItemStatus = 'idle' | 'loading' | 'deleted' | 'error';

export interface CleanupItemState {
  status: CleanupItemStatus;
  error?: string;
}

export const useCleanupState = (
  items: CleanupItem[],
  savedValues: Record<SnippetVariableKey, string>
) => {
  const { http } = useKibana().services;
  const [itemStates, setItemStates] = useState<CleanupItemState[]>(() =>
    items.map(() => ({ status: 'idle' as CleanupItemStatus }))
  );

  const savedValuesRef = useRef(savedValues);
  savedValuesRef.current = savedValues;

  const executeDelete = useCallback(
    async (index: number) => {
      const item = items[index];
      if (!item) return;

      setItemStates((prev) => {
        const next = [...prev];
        next[index] = { status: 'loading' };
        return next;
      });

      try {
        await executeCleanupItem(http, item, savedValuesRef.current);

        setItemStates((prev) => {
          const next = [...prev];
          next[index] = { status: 'deleted' };
          return next;
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setItemStates((prev) => {
          const next = [...prev];
          next[index] = { status: 'error', error: message };
          return next;
        });
      }
    },
    [items, http]
  );

  return { itemStates, executeDelete };
};
