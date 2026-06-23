/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { getSpaceNPRE, PROJECT_ROUTING_ORIGIN } from '@kbn/cps-server-utils';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { isKibanaRequest } from '@kbn/core-http-router-server-internal';
import type {
  OnRequestHandlerFactory,
  OnRequestHandler,
  FactoryRoutingOpts,
} from '../cluster_client';
import { getCpsRequestHandler } from './cps_request_handler';
import { getTimingRequestHandler } from '../timing';

const noopHandler: OnRequestHandler = () => undefined;

/**
 * Returns an {@link OnRequestHandlerFactory} that maps routing options to the
 * appropriate CPS `OnRequestHandler` for each client scope, composed with
 * timing instrumentation.
 *
 * @internal
 */
export function getRequestHandlerFactory(
  cpsEnabled: boolean,
  esTimingEnabled: boolean = true
): OnRequestHandlerFactory {
  return (opts) => {
    const request = 'request' in opts && isKibanaRequest(opts.request) ? opts.request : undefined;

    // Get the timing handler (or noop if disabled)
    const timingHandler = esTimingEnabled ? getTimingRequestHandler(request) : noopHandler;

    // Get the CPS handler based on routing options
    const cpsHandler = getCpsRequestHandler(cpsEnabled, resolveProjectRouting(opts), opts.logger);

    // Return a composed handler that calls both in sequence
    return (ctx, params, options, logger) => {
      timingHandler(ctx, params, options, logger);
      cpsHandler(ctx, params, options, logger);
    };
  };
}

/**
 * Resolves the `project_routing` expression to inject based on the routing options:
 * - `'space'`: derived from the request's active space NPRE.
 * - `'expression'`: the caller-supplied expression, injected verbatim.
 * - otherwise (internal user): origin-only routing.
 */
function resolveProjectRouting(opts: FactoryRoutingOpts): string {
  if ('projectRouting' in opts) {
    if (opts.projectRouting === 'space') {
      return getSpaceNPRE(opts.request.spaceId ?? DEFAULT_SPACE_ID);
    }
    if (opts.projectRouting === 'expression') {
      return opts.value;
    }
  }
  return PROJECT_ROUTING_ORIGIN;
}
