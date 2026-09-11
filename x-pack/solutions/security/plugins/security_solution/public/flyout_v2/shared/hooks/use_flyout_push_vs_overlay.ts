/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import type { Storage } from '@kbn/kibana-utils-plugin/public';
import type { SystemFlyoutType } from '@kbn/core-overlays-browser';
import { useSystemFlyoutType } from '@kbn/core-overlays-browser';
import { useKibana } from '../../../common/lib/kibana';
import { FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE } from '../constants/local_storage';

/**
 * Default when the user has never chosen a mode. Matches EUI's own `EuiFlyout`
 * default and the legacy expandable flyout behavior.
 */
export const DEFAULT_FLYOUT_TYPE: SystemFlyoutType = 'overlay';

/**
 * Reads the persisted push/overlay preference from localStorage, falling back to
 * {@link DEFAULT_FLYOUT_TYPE} when unset or malformed. Kept as a plain function
 * (not a hook) so it can be read fresh at flyout open time.
 */
export const getStoredFlyoutType = (storage: Storage): SystemFlyoutType => {
  const stored = storage.get(FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE);
  return stored === 'push' || stored === 'overlay' ? stored : DEFAULT_FLYOUT_TYPE;
};

export interface UseFlyoutPushVsOverlayResult {
  /** The push/overlay type of the currently open flyout. */
  type: SystemFlyoutType;
  /**
   * Switch the flyout mode: applies live to the open flyout (via the core
   * system-flyout context) and persists the choice for subsequent opens.
   */
  setType: (type: SystemFlyoutType) => void;
}

/**
 * Drives the push/overlay setting shown in the flyout settings menu.
 *
 * The live value comes from the core system-flyout context (seeded from the
 * persisted preference at open time), and changes are both applied to the open
 * flyout and written to localStorage so the next flyout opens the same way.
 *
 * Must be used inside a system flyout (where {@link useSystemFlyoutType} resolves).
 */
export const useFlyoutPushVsOverlay = (): UseFlyoutPushVsOverlayResult => {
  const { storage } = useKibana().services;
  const systemFlyoutType = useSystemFlyoutType();

  const type = systemFlyoutType?.type ?? getStoredFlyoutType(storage);

  const setType = useCallback(
    (next: SystemFlyoutType) => {
      storage.set(FLYOUT_PUSH_VS_OVERLAY_LOCAL_STORAGE, next);
      systemFlyoutType?.setType(next);
    },
    [storage, systemFlyoutType]
  );

  return { type, setType };
};
