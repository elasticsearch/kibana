/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import { useCallback } from 'react';
import useLocalStorage from 'react-use/lib/useLocalStorage';
import { useSpaceId } from '../../../../common/hooks/use_space_id';

/**
 * Local-storage key (per Kibana space) used to persist the user's preference
 * for showing anonymized values in the AI summary section.
 *
 * The key is preserved verbatim from the original EASE flyout implementation
 * so the user's preference survives the move to a single shared component.
 */
const ANONYMIZATION_STORAGE_KEY_PREFIX = 'securitySolution.aiAlertFlyout.showAnonymization';

export interface UseAnonymizationToggleResult {
  /**
   * Whether anonymized values are currently shown.
   * `undefined` while the active space id is unresolved (no toggle is
   * rendered in that case, matching the original EASE behaviour).
   */
  showAnonymizedValues: boolean | undefined;
  /**
   * Setter for the anonymized-values toggle.
   */
  setShowAnonymizedValues: React.Dispatch<React.SetStateAction<boolean | undefined>>;
}

/**
 * Hook that owns the anonymized-values toggle state for the shared AI
 * summary section. Backs the value with a per-space local-storage key so
 * the preference is shared across all flyouts (EASE, legacy, v2) that
 * render the section.
 */
export const useAnonymizationToggle = (): UseAnonymizationToggleResult => {
  const spaceId = useSpaceId();

  const [storedValue, setStoredValue] = useLocalStorage<boolean | undefined>(
    `${ANONYMIZATION_STORAGE_KEY_PREFIX}.${spaceId}`
  );

  // Match legacy EASE behaviour: default to `false` once the space id is
  // known, and remain `undefined` until then so the switch isn't rendered.
  const showAnonymizedValues = storedValue ?? (spaceId ? false : undefined);

  // Wrap the local-storage setter so consumers can pass either a value or a
  // functional updater while preserving the underlying persistence behaviour.
  const setShowAnonymizedValues = useCallback<
    React.Dispatch<React.SetStateAction<boolean | undefined>>
  >(
    (next) => {
      setStoredValue((prev) => {
        const previous = prev ?? (spaceId ? false : undefined);
        return typeof next === 'function'
          ? (next as (p: boolean | undefined) => boolean | undefined)(previous)
          : next;
      });
    },
    [setStoredValue, spaceId]
  );

  return { showAnonymizedValues, setShowAnonymizedValues };
};
