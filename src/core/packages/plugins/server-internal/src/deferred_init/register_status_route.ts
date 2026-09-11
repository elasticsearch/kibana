/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core-http-server';
import { DEFERRED_INIT_STATUS_ROUTE } from '@kbn/core-deferred-init-common';
import type { DeferredInitStatusResponse } from '@kbn/core-deferred-init-common';
import type { DeferredInitEngine } from './deferred_init_engine';

/**
 * Register the always-available core endpoint the initializing UI polls:
 * `GET /internal/core/deferred_init/{pluginId}` -> {@link DeferredInitStatusResponse}.
 *
 * This is a core-owned route (never wrapped by {@link createGuardedRouter}), so it stays
 * reachable while a plugin is still initializing.
 *
 * Deliberately calls `ensureInitialized` rather than the read-only `getState`: after a plugin
 * cools down from a failed run (see `DeferredInitEngine`), something has to flip it back to trying
 * again. Gated routes provide that nudge for plugins that are actively receiving traffic, but a
 * plugin with no gated request in flight would otherwise stall forever waiting on traffic that
 * never arrives. The initializing UI is already polling this route once a user is on the loading
 * screen, so reusing that poll as the nudge covers that gap without introducing an unconditional
 * background retry loop that would spend Elasticsearch calls on plugins nobody is waiting on.
 * `ensureInitialized` itself only auto-kicks an `idle` plugin, not a `failed` one, so a genuine
 * failure is actually observable here instead of being silently re-kicked away before this
 * handler ever reads it.
 *
 * @internal
 */
export function registerDeferredInitStatusRoute(router: IRouter, engine: DeferredInitEngine): void {
  router.get(
    {
      path: DEFERRED_INIT_STATUS_ROUTE,
      validate: {
        params: schema.object({ pluginId: schema.string({ maxLength: 256 }) }),
      },
      security: {
        authz: {
          enabled: false,
          reason:
            'Exposes only non-sensitive deferred-init lifecycle state for the initializing UI to poll.',
        },
      },
      options: { access: 'internal' },
    },
    (context, request, response) => {
      const { pluginId } = request.params;
      const status = engine.ensureInitialized(pluginId);
      const failure = status === 'failed' ? engine.getFailureDetails(pluginId) : undefined;
      const body: DeferredInitStatusResponse = {
        pluginId,
        status,
        ...(failure && {
          error: { message: failure.message },
          attempts: failure.attempts,
          phase: failure.phase,
        }),
      };
      return response.ok({ body });
    }
  );
}
