/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { useEuiTheme } from '@elastic/eui';
import type { OverlaySystemFlyoutOpenOptions } from '@kbn/core-overlays-browser';

/**
 * Hook that returns the main properties used when opening a document flyout, to ensure consistency.
 * The minWidth and maxWidth values are mimicking what Discover is doing here `src/platform/plugins/shared/unified_doc_viewer/public/components/doc_viewer_flyout/doc_viewer_flyout.tsx`.
 *
 * The result is memoized so consumers can safely use it as a dependency of
 * `useEffect`/`useCallback`/`useMemo` without re-running on every render.
 * Returning a fresh object on each render previously caused an infinite
 * render loop in `AlertsTableComponent`, where this value feeds an effect
 * that writes to the alerts pagination external store and the component
 * subscribes to that store via `useSyncExternalStore`.
 */
export const useDefaultDocumentFlyoutProperties = (): OverlaySystemFlyoutOpenOptions => {
  const { euiTheme } = useEuiTheme();

  return useMemo(
    () => ({
      maxWidth: euiTheme.breakpoint.xl,
      minWidth: euiTheme.base * 24,
      ownFocus: false,
      paddingSize: 'm',
      resizable: true,
      size: 's',
    }),
    [euiTheme.base, euiTheme.breakpoint.xl]
  );
};

/**
 * Hook that returns the main properties used when opening a tools flyout, to ensure consistency.
 */
export const defaultToolsFlyoutProperties: OverlaySystemFlyoutOpenOptions = {
  ownFocus: false,
  paddingSize: 'm',
  resizable: true,
  size: 'm',
};
