/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios from 'axios';
import { stableStringify } from '@kbn/std';
import type { Logger } from '@kbn/core/server';
import { getEarsEndpointsForProvider, resolveEarsUrl } from './url';
import { request } from '../axios_utils';
import type { ActionsConfigurationUtilities } from '../../actions_config';
import type { OAuthTokenResponse } from '../request_oauth_token';

export interface EarsTokenRequestParams {
  code: string;
  pkceVerifier: string;
}

/**
 * Exchange an authorization code for tokens via the EARS token endpoint.
 *
 * EARS uses a JSON request body with `{ code, pkce_verifier }` — no grant_type,
 * no client credentials, and no redirect_uri.
 */
export async function requestEarsToken(
  provider: string,
  logger: Logger,
  params: EarsTokenRequestParams,
  configurationUtilities: ActionsConfigurationUtilities
): Promise<OAuthTokenResponse> {
  const axiosInstance = axios.create();
  const { tokenEndpoint: earsTokenPath } = getEarsEndpointsForProvider(provider);
  const tokenUrl = resolveEarsUrl(earsTokenPath, configurationUtilities.getEarsUrl());

  const res = await request({
    axios: axiosInstance,
    url: tokenUrl,
    method: 'post',
    logger,
    data: {
      code: params.code,
      pkce_verifier: params.pkceVerifier,
    },
    headers: {
      'Content-Type': 'application/json',
    },
    configurationUtilities,
    sslOverrides: configurationUtilities.getEARSSSLSettings(),
    validateStatus: () => true,
  });

  if (res.status === 200) {
    return {
      tokenType: res.data.token_type,
      accessToken: res.data.access_token,
      expiresIn: res.data.expires_in,
      refreshToken: res.data.refresh_token,
      refreshTokenExpiresIn: res.data.refresh_token_expires_in,
    };
  } else {
    const errString = stableStringify(res.data);
    logger.debug(`error thrown getting the access token from EARS ${tokenUrl}: ${errString}`);
    throw new Error('Failed to request access token from auth redirect service');
  }
}
