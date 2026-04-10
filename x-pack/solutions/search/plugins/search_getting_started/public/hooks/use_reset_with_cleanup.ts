/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useState, useCallback, useRef } from 'react';
import type { CleanupItem, SnippetVariableKey } from './use_tutorial_content';
import { executeCleanupItem } from './use_cleanup_state';
import { useKibana } from './use_kibana';

/**
 * Runs all cleanup items in parallel via Promise.all(), then calls onReset.
 * Individual item failures are swallowed so the reset always completes.
 */
export const useResetWithCleanup = (
  cleanup: CleanupItem[] | undefined,
  savedValues: Record<SnippetVariableKey, string>,
  onReset: () => void
) => {
  const { http } = useKibana().services;
  const [isResetting, setIsResetting] = useState(false);

  const savedValuesRef = useRef(savedValues);
  savedValuesRef.current = savedValues;

  const resetWithCleanup = useCallback(async () => {
    if (!cleanup?.length) {
      onReset();
      return;
    }

    setIsResetting(true);
    try {
      await Promise.all(
        cleanup.map(async (item) => {
          try {
            await executeCleanupItem(http, item, savedValuesRef.current);
          } catch {
            // Best-effort: individual failures don't block reset
          }
        })
      );
    } finally {
      setIsResetting(false);
      onReset();
    }
  }, [cleanup, http, onReset]);

  return { resetWithCleanup, isResetting };
};
