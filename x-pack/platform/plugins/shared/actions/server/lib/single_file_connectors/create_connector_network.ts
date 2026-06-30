/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ConnectorNetwork } from '@kbn/connector-specs';
import type { ActionsConfigurationUtilities } from '../../actions_config';

/**
 * Thrown when an egress destination is not on `xpack.actions.allowedHosts`.
 *
 * Typed so the executor can classify it as a USER error (permanent bad config:
 * it cannot succeed on retry until an admin widens the allowlist) instead of a
 * retryable FRAMEWORK fault, without string-matching the underlying message.
 */
export class AllowlistDeniedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'AllowlistDeniedError';
  }
}

const toAllowlistDeniedError = (err: unknown): never => {
  throw new AllowlistDeniedError(err instanceof Error ? err.message : String(err), { cause: err });
};

export const createConnectorNetwork = (
  configUtils: ActionsConfigurationUtilities
): ConnectorNetwork => ({
  ensureUriAllowed: (url) => {
    try {
      configUtils.ensureUriAllowed(url);
    } catch (err) {
      toAllowlistDeniedError(err);
    }
  },
  ensureHostnameAllowed: (host) => {
    try {
      configUtils.ensureHostnameAllowed(host);
    } catch (err) {
      toAllowlistDeniedError(err);
    }
  },
});
