/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation } from '@kbn/react-query';
import { isError } from 'lodash';
import type { StartOAuthFlowRequestBody, StartOAuthFlowResponse } from '@kbn/actions-plugin/common';
import {
  OAUTH_CALLBACK_QUERY_PARAMS,
  OAuthAuthorizationStatus,
  INTERNAL_BASE_ACTION_API_PATH,
} from '@kbn/actions-plugin/common';
import { i18n } from '@kbn/i18n';
import { isHttpFetchError, type HttpStart } from '@kbn/core-http-browser';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { OAUTH_BROADCAST_CHANNEL_NAME, type OAuthFlowCompletedMessage } from '../oauth';

export enum OAuthRedirectMode {
  NewTab = 'new_tab',
  Redirect = 'redirect',
}

interface ConnectorOAuthConnectBaseProps {
  connectorId: string;
  returnUrl?: string;
  onError?: (error: Error) => void;
}

interface ConnectorOAuthConnectNewTabProps extends ConnectorOAuthConnectBaseProps {
  redirectMode?: OAuthRedirectMode.NewTab;
  timeout?: number;
  onSuccess?: () => void;
}

interface ConnectorOAuthConnectRedirectProps extends ConnectorOAuthConnectBaseProps {
  redirectMode?: OAuthRedirectMode.Redirect;
  timeout?: never;
  onSuccess?: never;
}

export type ConnectorOAuthConnectProps =
  | ConnectorOAuthConnectNewTabProps
  | ConnectorOAuthConnectRedirectProps;

export interface ConnectorOAuthConnect {
  connect: () => void;
  cancelConnect: () => void;
  isConnecting: boolean;
  isAwaitingCallback: boolean;
}

const DEFAULT_TIMEOUT_MS = 60 * 1000 * 10;

/**
 * Initiates the OAuth authorization code grant flow for a connector
 * (via `connect()`).
 *
 * In `NewTab` mode, the hook listens for flow completion and invokes
 * `onSuccess`/`onError` callbacks. `isAwaitingCallback` is `true` while waiting
 * for the user to complete authorization in the other tab, and resets after flow
 * completion or after `timeout` elapses.
 *
 * In `Redirect` mode, the page navigates away. `onSuccess` and
 * `isAwaitingCallback` are not applicable.
 *
 * When `returnUrl` is provided, the OAuth callback redirects to that URL with
 * result query parameters (requires `useOAuthRedirectResult` at that page).
 * When omitted, the callback renders a self-contained HTML page.
 */
export const useConnectorOAuthConnect = ({
  connectorId,
  redirectMode = OAuthRedirectMode.Redirect,
  returnUrl,
  timeout = DEFAULT_TIMEOUT_MS,
  onSuccess,
  onError,
}: ConnectorOAuthConnectProps): ConnectorOAuthConnect => {
  const {
    services: { http },
  } = useKibana<{ http: HttpStart }>();

  const onSuccessRef = useRef(onSuccess);
  const onErrorRef = useRef(onError);
  onSuccessRef.current = onSuccess;
  onErrorRef.current = onError;

  const [isAwaitingCallback, setIsAwaitingCallback] = useState(false);
  const pendingStateRef = useRef<string | undefined>();

  const handleAuthRedirect = useCallback(
    (authorizationUrl: string) => {
      switch (redirectMode) {
        case OAuthRedirectMode.NewTab:
          window.open(authorizationUrl, '_blank', 'noopener');
          return;
        case OAuthRedirectMode.Redirect:
          window.location.assign(authorizationUrl);
          return;
      }
    },
    [redirectMode]
  );

  const { mutate: startOAuthFlow, isLoading: isConnecting } = useMutation<
    StartOAuthFlowResponse,
    Error,
    StartOAuthFlowRequestBody
  >({
    mutationFn: (request) =>
      http.post<StartOAuthFlowResponse>(
        `${INTERNAL_BASE_ACTION_API_PATH}/connector/${encodeURIComponent(
          connectorId
        )}/_start_oauth_flow`,
        { body: JSON.stringify({ returnUrl: request.returnUrl }) }
      ),
    onSuccess: ({ authorizationUrl, state }) => {
      pendingStateRef.current = state;
      setIsAwaitingCallback(true);
      handleAuthRedirect(authorizationUrl);
    },
    onError: (error) => {
      const bodyMessage =
        isHttpFetchError(error) && typeof error.body?.message === 'string'
          ? error.body.message
          : undefined;
      onErrorRef.current?.(
        new Error(bodyMessage ?? (isError(error) ? error.message : String(error)))
      );
    },
  });

  const connect = useCallback(() => {
    pendingStateRef.current = undefined;
    setIsAwaitingCallback(false);
    let resolvedReturnUrl: string | undefined;
    if (returnUrl) {
      const url = new URL(returnUrl);
      if (redirectMode === OAuthRedirectMode.NewTab) {
        url.searchParams.set(OAUTH_CALLBACK_QUERY_PARAMS.AUTO_CLOSE, 'true');
      }
      resolvedReturnUrl = url.toString();
    }
    startOAuthFlow({ returnUrl: resolvedReturnUrl });
  }, [startOAuthFlow, redirectMode, returnUrl]);

  const cancelConnect = useCallback(() => {
    const state = pendingStateRef.current;
    pendingStateRef.current = undefined;
    setIsAwaitingCallback(false);
    if (state) {
      // Fire-and-forget: best-effort server cancel; UI state is already reset above.
      http
        .post(
          `${INTERNAL_BASE_ACTION_API_PATH}/connector/${encodeURIComponent(
            connectorId
          )}/_oauth_cancel`,
          { body: JSON.stringify({ state }) }
        )
        .catch(() => {});
    }
  }, [http, connectorId]);

  // Handle OAuth callback timeout
  useEffect(() => {
    if (redirectMode !== OAuthRedirectMode.NewTab || !isAwaitingCallback) {
      return;
    }

    const callbackTimeout = setTimeout(() => {
      pendingStateRef.current = undefined;
      setIsAwaitingCallback(false);
      onErrorRef.current?.(
        new Error(
          i18n.translate('xpack.responseOpsOAuthHooks.timeoutError', {
            defaultMessage: 'OAuth authorization timed out',
          })
        )
      );
    }, timeout);
    return () => clearTimeout(callbackTimeout);
  }, [redirectMode, isAwaitingCallback, timeout]);

  // Handle OAuth flow completed in new tab
  useEffect(() => {
    if (redirectMode !== OAuthRedirectMode.NewTab || !isAwaitingCallback) {
      return;
    }

    const broadcastChannel = new BroadcastChannel(OAUTH_BROADCAST_CHANNEL_NAME);

    broadcastChannel.onmessage = (event: MessageEvent<OAuthFlowCompletedMessage>) => {
      if (event.data.connectorId !== connectorId) {
        return;
      }
      pendingStateRef.current = undefined;
      if (event.data.status === OAuthAuthorizationStatus.Success) {
        onSuccessRef.current?.();
      } else {
        onErrorRef.current?.(new Error(event.data.error));
      }
      setIsAwaitingCallback(false);
    };
    return () => broadcastChannel.close();
  }, [connectorId, redirectMode, isAwaitingCallback]);

  return {
    connect,
    cancelConnect,
    isConnecting,
    isAwaitingCallback,
  };
};
