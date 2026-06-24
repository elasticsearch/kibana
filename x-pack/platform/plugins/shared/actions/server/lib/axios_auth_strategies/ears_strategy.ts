/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AxiosError } from 'axios';
import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { normalizeAuthorizationHeaderValue, type GetTokenOpts } from '@kbn/connector-specs';
import type { AxiosErrorWithRetry } from '../axios_utils';
import { getEarsAccessToken } from '../ears';
import type { AxiosAuthStrategy, AuthStrategyDeps } from './types';

interface EarsSecrets {
  provider?: string;
}

// Slack signals a stale token via HTTP 200 + ok:false + error:"token_expired".
// Only that case is recoverable via refresh; other ok:false errors (invalid_auth,
// token_revoked, not_authed, …) indicate permanent auth failures and pass through.

export class EarsStrategy implements AxiosAuthStrategy {
  private async refreshAndRetry(
    axiosInstance: AxiosInstance,
    deps: AuthStrategyDeps,
    config: InternalAxiosRequestConfig & { _retry?: boolean },
    onFailure: (message: string) => never
  ): Promise<AxiosResponse> {
    const {
      connectorId,
      secrets,
      connectorTokenClient,
      logger,
      configurationUtilities,
      authMode,
      profileUid,
    } = deps;

    config._retry = true;

    const { provider } = secrets as EarsSecrets;
    if (!provider) {
      return onFailure('Authentication failed: Missing required EARS provider.');
    }

    const newAccessToken = await getEarsAccessToken({
      connectorId,
      logger,
      configurationUtilities,
      provider,
      connectorTokenClient: connectorTokenClient!,
      authMode,
      profileUid,
      forceRefresh: true,
    });

    if (!newAccessToken) {
      return onFailure(
        'Authentication failed: Unable to refresh access token via EARS. Please re-authorize the connector.'
      );
    }

    const normalizedAccessToken = normalizeAuthorizationHeaderValue(newAccessToken);
    config.headers.Authorization = normalizedAccessToken;
    axiosInstance.defaults.headers.common.Authorization = normalizedAccessToken;
    return axiosInstance.request(config);
  }

  installResponseInterceptor(axiosInstance: AxiosInstance, deps: AuthStrategyDeps): void {
    const { secrets, connectorTokenClient, logger, connectorId } = deps;

    if (!connectorTokenClient) {
      throw new Error('ConnectorTokenClient is required for EARS authorization code flow');
    }

    axiosInstance.interceptors.response.use(
      async (response) => {
        // Only Slack uses HTTP 200 + ok:false to signal auth failures.
        if ((secrets as EarsSecrets).provider !== 'slack') return response;
        const body = response.data as { ok?: boolean; error?: string } | undefined;
        if (body?.ok !== false) return response;
        if (body.error !== 'token_expired') return response;
        // If we already retried after a refresh, let the response through so the
        // spec handler can throw its formatted error rather than looping forever.
        if ((response.config as { _retry?: boolean })._retry) {
          logger.debug(
            `[EARS] Slack returned token_expired after token refresh for connectorId: ${connectorId}; passing response through`
          );
          return response;
        }

        logger.debug(
          `[EARS] Slack returned HTTP 200 with ok:false + token_expired for connectorId: ${connectorId}; attempting token refresh`
        );

        return this.refreshAndRetry(
          axiosInstance,
          deps,
          response.config as InternalAxiosRequestConfig & { _retry?: boolean },
          (msg) => {
            throw new AxiosError(
              msg,
              'ERR_BAD_RESPONSE',
              response.config,
              response.request,
              response
            );
          }
        );
      },
      async (error: AxiosErrorWithRetry) => {
        if (error.response?.status !== 401) {
          return Promise.reject(error);
        }

        if (error.config._retry) {
          return Promise.reject(error);
        }

        try {
          return await this.refreshAndRetry(axiosInstance, deps, error.config, (msg) => {
            error.message = msg;
            throw error;
          });
        } catch (e) {
          return Promise.reject(e);
        }
      }
    );
  }

  async getToken(opts: GetTokenOpts, deps: AuthStrategyDeps): Promise<string | null> {
    if (opts.authType !== 'ears') {
      throw new Error('EarsStrategy received non-ears token opts');
    }

    const {
      connectorId,
      connectorTokenClient,
      logger,
      configurationUtilities,
      authMode,
      profileUid,
    } = deps;
    if (!connectorTokenClient) {
      throw new Error('ConnectorTokenClient is required for EARS OAuth flow');
    }

    const { provider } = opts;
    return getEarsAccessToken({
      connectorId,
      logger,
      configurationUtilities,
      provider,
      connectorTokenClient,
      authMode,
      profileUid,
    });
  }
}
