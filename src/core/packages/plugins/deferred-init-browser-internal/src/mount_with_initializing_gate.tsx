/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import ReactDOM from 'react-dom';
import type { Observable } from 'rxjs';
import { AppInitializingGate } from '@kbn/core-application-browser';
import type { AppMount, AppMountParameters, AppUnmount } from '@kbn/core-application-browser';
import type { CoreStart } from '@kbn/core-lifecycle-browser';
import type { DeferredInitStatus } from '@kbn/core-deferred-init-browser';

export interface MountWithInitializingGateDeps<HistoryLocationState = unknown> {
  /** The plugin whose deferred init this gate is waiting on. Shown in the failed-state message. */
  pluginId: string;
  /** The plugin's real app mount function, called once init is `available`. */
  mount: AppMount<HistoryLocationState>;
  status$: Observable<DeferredInitStatus>;
  onRetry: () => void;
  getStartServices: () => Promise<[CoreStart, unknown, unknown]>;
}

/**
 * Wraps a lazy plugin's app mount so it never runs until deferred init is `available`: renders
 * `<AppInitializingGate>` into the app's element while waiting, then swaps it out for the real
 * app once ready. `status$` never re-emits after `available` (it's terminal), so the gate is
 * only ever shown once, before the real app takes over the element for good.
 *
 * @internal
 */
export function mountWithInitializingGate<HistoryLocationState = unknown>({
  pluginId,
  mount,
  status$,
  onRetry,
  getStartServices,
}: MountWithInitializingGateDeps<HistoryLocationState>): AppMount<HistoryLocationState> {
  return async (params: AppMountParameters<HistoryLocationState>) => {
    const [{ rendering }] = await getStartServices();

    let cancelled = false;
    let mounted = false;
    let realUnmount: AppUnmount | undefined;
    let gateRendered = false;

    const renderGate = (
      { status, error, attempts }: DeferredInitStatus,
      failureStage: 'initialization' | 'mount' = 'initialization'
    ) => {
      ReactDOM.render(
        rendering.addContext(
          <AppInitializingGate
            status={status}
            pluginId={pluginId}
            error={error}
            attempts={attempts}
            failureStage={failureStage}
            onRetry={onRetry}
          >
            {null}
          </AppInitializingGate>
        ),
        params.element
      );
      gateRendered = true;
    };

    const clearGate = () => {
      if (gateRendered) {
        ReactDOM.unmountComponentAtNode(params.element);
        gateRendered = false;
      }
    };

    renderGate({ status: 'idle' });

    const subscription = status$.subscribe((current) => {
      if (cancelled || mounted) {
        return;
      }
      if (current.status !== 'available') {
        renderGate(current);
        return;
      }
      mounted = true;
      clearGate();
      Promise.resolve(mount(params)).then(
        (unmountFn) => {
          if (cancelled) {
            unmountFn();
          } else {
            realUnmount = unmountFn;
          }
        },
        (mountError: unknown) => {
          if (cancelled) {
            return;
          }
          // This wrapper's own mount promise resolved back in `AppContainer` as soon as the gate
          // went up, so core already recorded the app as mounted and will not route this rejection
          // to its error boundary the way it does for a non-lazy app. Without handling it here the
          // user is left on the blank element `clearGate` just emptied.
          //
          // Logged as well as rendered: the gate only shows `error.message`, and attaching this
          // handler is what stops the rejection reaching the global `unhandledrejection` listener
          // in `fatalErrors` that would otherwise have dumped the stack to the console.
          // eslint-disable-next-line no-console
          console.error(mountError);
          renderGate(
            {
              status: 'failed',
              error: {
                message: mountError instanceof Error ? mountError.message : String(mountError),
              },
            },
            'mount'
          );
        }
      );
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      if (realUnmount) {
        realUnmount();
      } else {
        // Either still waiting on init, or the real mount rejected and left the failure gate up.
        clearGate();
      }
    };
  };
}
