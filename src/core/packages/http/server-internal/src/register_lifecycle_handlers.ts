/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Env } from '@kbn/config';
import type { Logger } from '@kbn/logging';
import type { HttpAuth } from '@kbn/core-http-server';
import type { HttpConfig } from './http_config';
import type { LifecycleRegistrar } from './http_server';
import {
  createCustomHeadersPreResponseHandler,
  createRestrictInternalRoutesPostAuthHandler,
  createVersionCheckPostAuthHandler,
  createBuildNrMismatchLoggerPreResponseHandler,
  createXsrfPostAuthHandler,
  createExcludeRoutesPreAuthHandler,
  createDeprecationWarningHeaderPreResponseHandler,
} from './lifecycle_handlers';

export const registerCoreHandlers = (
  registrar: LifecycleRegistrar,
  config: HttpConfig,
  env: Env,
  log: Logger,
  auth: HttpAuth
) => {
  // add headers based on config
  registrar.registerOnPreResponse(createCustomHeadersPreResponseHandler(config));
  // add headers for deprecated endpoints
  registrar.registerOnPreResponse(
    createDeprecationWarningHeaderPreResponseHandler(env.packageInfo.version)
  );
  // add extra request checks stuff
  registrar.registerOnPreAuth(createExcludeRoutesPreAuthHandler(config, log));
  registrar.registerOnPostAuth(createXsrfPostAuthHandler(config, auth.get));
  if (config.versioned.strictClientVersionCheck !== false) {
    // add check on version
    registrar.registerOnPostAuth(createVersionCheckPostAuthHandler(env.packageInfo.version));
  } else {
    registrar.registerOnPreResponse(
      createBuildNrMismatchLoggerPreResponseHandler(env.packageInfo.buildNum, log)
    );
  }
  // add check on header if the route is internal
  registrar.registerOnPostAuth(createRestrictInternalRoutesPostAuthHandler(config, log)); // strictly speaking, we should have access to route.options.access from the request on postAuth
};
