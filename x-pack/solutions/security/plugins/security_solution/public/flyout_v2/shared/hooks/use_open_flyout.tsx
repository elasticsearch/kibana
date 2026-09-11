/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { Suspense, useCallback } from 'react';
import { useStore } from 'react-redux-v7';
import { useHistory } from 'react-router-dom';
import type { OverlaySystemFlyoutOpenOptions } from '@kbn/core-overlays-browser';
import type { OverlayRef } from '@kbn/core-mount-utils-browser';
import { useKibana } from '../../../common/lib/kibana';
import { flyoutProviders } from '../components/flyout_provider';
import { FlyoutLoading } from '../components/flyout_loading';
import type { FlyoutTelemetryMeta } from './use_flyout_telemetry';
import { trackFlyoutOpen } from './use_flyout_telemetry';
import { FlyoutSessionContextProvider, useFlyoutSessionContext } from '../../session_context';
import type { MainFlyoutSession } from '../../session_context';
import { getStoredFlyoutType } from './use_flyout_push_vs_overlay';

/**
 * Opens a system flyout, optionally reporting telemetry for it. When `meta` is provided, an
 * opened event fires immediately and a matching closed event (with the dwell time) fires once the
 * returned `OverlayRef`'s `onClose` resolves.
 */
export type OpenFlyout = (
  children: ReactNode,
  properties: OverlaySystemFlyoutOpenOptions,
  meta?: FlyoutTelemetryMeta,
  sessionOverride?: MainFlyoutSession
) => OverlayRef;

/**
 * Shared, instrumented replacement for the `overlays.openSystemFlyout(flyoutProviders({...}),
 * properties)` block that every v2 flyout open site repeats. Centralizing it here means every
 * caller gets open/close telemetry (including dwell time, via the `OverlayRef.onClose` promise)
 * for free, just by passing a `meta` describing what's being opened.
 *
 * Must be used within the Security Solution app shell (Redux store + router + Kibana services).
 */
export const useOpenFlyout = (): OpenFlyout => {
  const { services } = useKibana();
  const { overlays, storage } = services;
  const store = useStore();
  const history = useHistory();
  const { session: mainSession, historyKey } = useFlyoutSessionContext();

  return useCallback(
    (children, properties, meta, sessionOverride) => {
      const session = sessionOverride ?? mainSession;
      // Seed the flyout's push/overlay mode from the persisted preference (read
      // fresh at open time), unless the caller pinned an explicit `type`. The
      // core system flyout keeps this reactive, so the settings menu can switch
      // it live afterwards.
      const type = properties.type ?? getStoredFlyoutType(storage);
      const ref = overlays.openSystemFlyout(
        flyoutProviders({
          services,
          store,
          history,
          children: (
            <FlyoutSessionContextProvider value={{ session, historyKey }}>
              <Suspense fallback={<FlyoutLoading />}>{children}</Suspense>
            </FlyoutSessionContextProvider>
          ),
        }),
        { ...properties, type }
      );

      if (meta) {
        trackFlyoutOpen(services.telemetry, ref, meta);
      }

      return ref;
    },
    [overlays, storage, services, store, history, mainSession, historyKey]
  );
};
