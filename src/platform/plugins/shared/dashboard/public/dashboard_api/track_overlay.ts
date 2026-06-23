/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import { BehaviorSubject } from 'rxjs';

interface Api {
  setFocusedPanelId: (id: string | undefined) => void;
  setRelatedPanelsIndicatorId: (id: string | undefined) => void;
}

export function initializeTrackOverlay({ setFocusedPanelId, setRelatedPanelsIndicatorId }: Api) {
  let overlayRef: OverlayRef;
  const hasOverlays$ = new BehaviorSubject(false);

  function clearOverlays() {
    hasOverlays$.next(false);
    setFocusedPanelId(undefined);
    // Clear related panels indicator ID when closing overlays as well
    setRelatedPanelsIndicatorId(undefined);
    overlayRef?.close();
  }

  return {
    clearOverlays,
    hasOverlays$,
    openOverlay: (ref: OverlayRef, options?: { focusedPanelId?: string }) => {
      clearOverlays();
      hasOverlays$.next(true);
      overlayRef = ref;
      if (options?.focusedPanelId) {
        setFocusedPanelId(options.focusedPanelId);
        // Related panel indicator state should not persist across modes, so clear it on overlay open too
        setRelatedPanelsIndicatorId(undefined);
      }
    },
  };
}
