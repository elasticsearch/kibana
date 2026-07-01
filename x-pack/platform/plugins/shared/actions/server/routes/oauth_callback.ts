/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { CoreSetup, IRouter, KibanaResponseFactory, Logger } from '@kbn/core/server';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import { i18n } from '@kbn/i18n';
import Boom from '@hapi/boom';
import { escape } from 'lodash';
import { OAuthAuthorizationService } from '../lib';
import type { ActionsPluginsStart } from '../plugin';
import type { ILicenseState } from '../lib';
import {
  BASE_ACTION_API_PATH,
  OAuthAuthorizationStatus,
  OAUTH_CALLBACK_QUERY_PARAMS,
  OAUTH_BROADCAST_CHANNEL_NAME,
} from '../../common';
import type { ActionsRequestHandlerContext } from '../types';
import type { ActionsConfigurationUtilities } from '../actions_config';
import { DEFAULT_ACTION_ROUTE_SECURITY } from './constants';
import { verifyAccessAndContext } from './verify_access_and_context';
import { OAUTH_API_TAG } from '../feature';
import { OAuthStateClient } from '../lib/oauth_state_client';
import { requestOAuthAuthorizationCodeToken } from '../lib/request_oauth_authorization_code_token';
import { buildTokenResponseOptions } from '../lib/request_oauth_token';
import { requestEarsToken } from '../lib/ears/request_ears_token';
import type { OAuthRateLimiter } from '../lib/oauth_rate_limiter';
import { UserConnectorTokenClient } from '../lib/user_connector_token_client';

const querySchema = schema.object(
  {
    code: schema.maybe(
      schema.string({
        meta: {
          description: i18n.translate('xpack.actions.oauthCallback.codeParamDescription', {
            defaultMessage: 'The authorization code returned by the OAuth provider.',
          }),
        },
      })
    ),
    state: schema.maybe(
      schema.string({
        meta: {
          description: i18n.translate('xpack.actions.oauthCallback.stateParamDescription', {
            defaultMessage: 'The state parameter for CSRF protection.',
          }),
        },
      })
    ),
    error: schema.maybe(
      schema.string({
        meta: {
          description: i18n.translate('xpack.actions.oauthCallback.errorParamDescription', {
            defaultMessage: 'Error code if the authorization failed.',
          }),
        },
      })
    ),
    error_description: schema.maybe(
      schema.string({
        meta: {
          description: i18n.translate(
            'xpack.actions.oauthCallback.errorDescriptionParamDescription',
            {
              defaultMessage: 'Human-readable error description.',
            }
          ),
        },
      })
    ),
    session_state: schema.maybe(
      schema.string({
        meta: {
          description: i18n.translate('xpack.actions.oauthCallback.sessionStateParamDescription', {
            defaultMessage: 'Session state from the OAuth provider (e.g., Microsoft).',
          }),
        },
      })
    ),
  },
  // Allow unknown query parameters to be passed in like scope, authuser, etc.
  { unknowns: 'allow' }
);

interface OAuthConnectorSecrets {
  authType?: string;
  provider?: string;
  clientId?: string;
  clientSecret?: string;
  tokenUrl?: string;
  useBasicAuth?: boolean;
  accessTokenPath?: string;
  tokenTypePath?: string;
  tokenType?: string;
}

interface OAuthConnectorConfig {
  authType?: string;
  clientId?: string;
  tokenUrl?: string;
  useBasicAuth?: boolean;
}

type RespondWithErrorOptions = {
  details: string;
  statusCode: number;
} & (
  | { connectorId: string; returnUrl?: string }
  | { connectorId?: undefined; returnUrl?: undefined }
);

interface RespondWithSuccessOptions {
  connectorId: string;
  returnUrl?: string;
}

interface OAuthCallbackBroadcast {
  connectorId: string;
  status: OAuthAuthorizationStatus;
  statusCode: number;
  error?: string;
}

const AUTO_CLOSE_DELAY_SECONDS = 3;

/**
 * Path for the companion JS served by {@link oauthCallbackScriptRoute}.
 * Loaded via `<script src>` to satisfy Kibana's `script-src 'self'` CSP.
 */
const OAUTH_CALLBACK_SCRIPT_PATH = `${BASE_ACTION_API_PATH}/connector/_oauth_callback_script`;

/**
 * Generates a styled OAuth callback page using EUI-like styling.
 */
function generateOAuthCallbackPage({
  title,
  heading,
  message,
  details,
  isSuccess,
  autoClose,
  broadcast,
}: {
  title: string;
  heading: string;
  message: string;
  details?: string;
  isSuccess: boolean;
  autoClose?: boolean;
  broadcast?: OAuthCallbackBroadcast;
}): string {
  const iconColor = isSuccess ? '#00BFB3' : '#BD271E';
  const icon = isSuccess ? '✓' : '✕';
  const sanitisedTitle = escape(title);
  const sanitisedHeading = escape(heading);
  const sanitisedMessage = escape(message);
  const sanitisedDetails = details ? escape(details) : '';

  const dataAttributes = [
    autoClose ? 'data-auto-close="true"' : '',
    broadcast ? `data-broadcast="${escape(JSON.stringify(broadcast))}"` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>${sanitisedTitle}</title>
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
            background-color: #F5F7FA;
            color: #343741;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 6px;
            box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            max-width: 500px;
            width: 100%;
            padding: 32px;
            text-align: center;
          }
          .icon {
            width: 64px;
            height: 64px;
            border-radius: 50%;
            background-color: ${iconColor};
            color: white;
            font-size: 32px;
            line-height: 64px;
            margin: 0 auto 24px;
            font-weight: 600;
          }
          h1 {
            font-size: 24px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1a1c21;
          }
          p {
            font-size: 14px;
            line-height: 1.5;
            margin-bottom: 12px;
            color: #69707d;
          }
          p:last-child {
            margin-bottom: 0;
          }
          .details {
            background-color: #F5F7FA;
            border-left: 3px solid ${iconColor};
            padding: 12px 16px;
            margin: 16px 0;
            text-align: left;
            font-size: 13px;
            color: #343741;
            border-radius: 4px;
          }
        </style>
      </head>
      <body ${dataAttributes}>
        <div class="container">
          <div class="icon">${icon}</div>
          <h1>${sanitisedHeading}</h1>
          <p>${sanitisedMessage}</p>
          ${sanitisedDetails ? `<div class="details">${sanitisedDetails}</div>` : ''}
          ${
            autoClose
              ? `<p style="display: none; margin-top: 16px;" class="auto-close-message">${escape(
                  i18n.translate('xpack.actions.oauthCallback.page.manualCloseMessage', {
                    defaultMessage: 'You can close this window manually.',
                  })
                )}</p>`
              : ''
          }
        </div>
        <script src="${OAUTH_CALLBACK_SCRIPT_PATH}"></script>
      </body>
    </html>
  `;
}

const GENERIC_OAUTH_ERROR = i18n.translate('xpack.actions.oauthCallback.error.generic', {
  defaultMessage: 'OAuth authorization failed',
});

const buildOAuthReturnUrl = ({
  kibanaReturnUrl,
  connectorId,
  status,
  statusCode,
  errorMessage,
}: {
  kibanaReturnUrl: string;
  connectorId: string;
  status: OAuthAuthorizationStatus;
  statusCode: number;
  errorMessage?: string;
}): string => {
  const returnUrl = new URL(kibanaReturnUrl);
  returnUrl.searchParams.set(OAUTH_CALLBACK_QUERY_PARAMS.AUTHORIZATION_STATUS, status);
  returnUrl.searchParams.set(OAUTH_CALLBACK_QUERY_PARAMS.CONNECTOR_ID, connectorId);
  returnUrl.searchParams.set(OAUTH_CALLBACK_QUERY_PARAMS.STATUS_CODE, String(statusCode));
  if (errorMessage) {
    returnUrl.searchParams.set(OAUTH_CALLBACK_QUERY_PARAMS.ERROR, errorMessage);
  }
  return returnUrl.toString();
};

/**
 * Returns an OAuth error response. Redirects when `returnUrl` and `connectorId`
 * are set; otherwise renders an HTML callback page.
 *
 * @param res - Kibana response factory
 * @param options.details - Error details
 * @param options.connectorId - Connector ID; enables auto-close
 * @param options.returnUrl - When set (with connectorId), triggers a redirect instead
 */
const respondWithError = (
  res: KibanaResponseFactory,
  { details, statusCode, connectorId, returnUrl }: RespondWithErrorOptions
) => {
  if (returnUrl) {
    return res.redirected({
      headers: {
        location: buildOAuthReturnUrl({
          kibanaReturnUrl: returnUrl,
          connectorId,
          status: OAuthAuthorizationStatus.Error,
          statusCode,
          errorMessage: details,
        }),
      },
    });
  }
  return res.ok({
    headers: { 'content-type': 'text/html' },
    body: generateOAuthCallbackPage({
      title: i18n.translate('xpack.actions.oauthCallback.page.errorTitle', {
        defaultMessage: 'OAuth Authorization Failed',
      }),
      heading: i18n.translate('xpack.actions.oauthCallback.page.errorHeading', {
        defaultMessage: 'Authorization Failed',
      }),
      message: i18n.translate('xpack.actions.oauthCallback.page.errorMessage', {
        defaultMessage: 'You can close this window and try again.',
      }),
      details,
      isSuccess: false,
      broadcast: connectorId
        ? {
            connectorId,
            status: OAuthAuthorizationStatus.Error,
            statusCode,
            error: details,
          }
        : undefined,
    }),
  });
};

/**
 * Returns an OAuth success response. Same redirect-vs-page branching as
 * {@link respondWithError}.
 *
 * @param res - Kibana response factory
 * @param options.connectorId - Connector ID
 * @param options.returnUrl - When set, triggers a redirect instead of rendering the page
 */
const respondWithSuccess = (
  res: KibanaResponseFactory,
  { connectorId, returnUrl }: RespondWithSuccessOptions
) => {
  if (returnUrl) {
    return res.redirected({
      headers: {
        location: buildOAuthReturnUrl({
          kibanaReturnUrl: returnUrl,
          connectorId,
          status: OAuthAuthorizationStatus.Success,
          statusCode: 200,
        }),
      },
    });
  }
  return res.ok({
    headers: { 'content-type': 'text/html' },
    body: generateOAuthCallbackPage({
      title: i18n.translate('xpack.actions.oauthCallback.page.successTitle', {
        defaultMessage: 'OAuth Authorization Successful',
      }),
      heading: i18n.translate('xpack.actions.oauthCallback.page.successHeading', {
        defaultMessage: 'Authorization Successful',
      }),
      message: i18n.translate('xpack.actions.oauthCallback.page.autoCloseMessage', {
        defaultMessage:
          'This window will close in {seconds, plural, one {# second} other {# seconds}}.',
        values: { seconds: AUTO_CLOSE_DELAY_SECONDS },
      }),
      isSuccess: true,
      autoClose: true,
      broadcast: {
        connectorId,
        status: OAuthAuthorizationStatus.Success,
        statusCode: 200,
      },
    }),
  });
};

/**
 * OAuth2 callback endpoint - handles authorization code exchange
 */
export const oauthCallbackRoute = (
  router: IRouter<ActionsRequestHandlerContext>,
  licenseState: ILicenseState,
  configurationUtilities: ActionsConfigurationUtilities,
  logger: Logger,
  coreSetup: CoreSetup<ActionsPluginsStart>,
  oauthRateLimiter: OAuthRateLimiter
) => {
  router.get(
    {
      path: `${BASE_ACTION_API_PATH}/connector/_oauth_callback`,
      security: {
        authz: {
          requiredPrivileges: [OAUTH_API_TAG],
        },
      },
      options: {
        access: 'public',
        availability: {
          since: '9.4.0',
        },
        summary: i18n.translate('xpack.actions.oauthCallback.routeSummary', {
          defaultMessage: 'Handle OAuth callback',
        }),
        description: i18n.translate('xpack.actions.oauthCallback.routeDescription', {
          defaultMessage:
            'Handles the OAuth 2.0 authorization code callback from external providers. Exchanges the authorization code for access and refresh tokens.',
        }),
        tags: ['oas-tag:connectors'],
        // authRequired: true is the default - user must have a valid session
        // The OAuth redirect happens in their browser, so they will have their session cookie
      },
      validate: {
        request: {
          query: querySchema,
        },
        response: {
          302: {
            description: i18n.translate('xpack.actions.oauthCallback.response302Description', {
              defaultMessage:
                'Redirects to the return URL with authorization result query parameters.',
            }),
          },
          200: {
            description: i18n.translate('xpack.actions.oauthCallback.response200Description', {
              defaultMessage: 'Returns an HTML callback page.',
            }),
          },
          401: {
            description: i18n.translate('xpack.actions.oauthCallback.response401Description', {
              defaultMessage: 'User is not authenticated.',
            }),
          },
        },
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const core = await context.core;
        const routeLogger = logger.get('oauth_callback');

        const currentUser = core.security.authc.getCurrentUser();
        if (!currentUser) {
          return res.unauthorized({
            headers: { 'content-type': 'text/html' },
            body: generateOAuthCallbackPage({
              title: i18n.translate('xpack.actions.oauthCallback.page.authRequiredTitle', {
                defaultMessage: 'Authorization Failed',
              }),
              heading: i18n.translate('xpack.actions.oauthCallback.page.authRequiredHeading', {
                defaultMessage: 'Authentication Required',
              }),
              message: i18n.translate('xpack.actions.oauthCallback.page.authRequiredMessage', {
                defaultMessage: 'You must be logged in to complete the OAuth authorization.',
              }),
              details: i18n.translate('xpack.actions.oauthCallback.page.authRequiredDetails', {
                defaultMessage: 'Please log in and try again.',
              }),
              isSuccess: false,
            }),
          });
        }

        const { profile_uid: profileUid } = currentUser;

        if (!profileUid) {
          return respondWithError(res, {
            statusCode: 500,
            details: i18n.translate('xpack.actions.oauthCallback.error.missingProfileUid', {
              defaultMessage: 'Unable to retrieve Kibana user profile ID.',
            }),
          });
        }

        oauthRateLimiter.log(profileUid, 'callback');
        if (oauthRateLimiter.isRateLimited(profileUid, 'callback')) {
          routeLogger.warn(`OAuth callback rate limit exceeded for user: ${profileUid}`);
          return respondWithError(res, {
            statusCode: 429,
            details: i18n.translate('xpack.actions.oauthCallback.error.rateLimited', {
              defaultMessage: 'Too many authorization attempts. Please wait before trying again.',
            }),
          });
        }

        const { code, state: stateParam, error, error_description: errorDescription } = req.query;

        if (!stateParam) {
          return respondWithError(res, {
            statusCode: 400,
            details: i18n.translate('xpack.actions.oauthCallback.error.missingState', {
              defaultMessage: 'Missing required OAuth state parameter.',
            }),
          });
        }

        const [coreStart, { encryptedSavedObjects, spaces }] = await coreSetup.getStartServices();

        const oauthStateClient = new OAuthStateClient({
          encryptedSavedObjectsClient: encryptedSavedObjects.getClient({
            includedHiddenTypes: ['oauth_state'],
          }),
          unsecuredSavedObjectsClient: core.savedObjects.getClient({
            includedHiddenTypes: ['oauth_state'],
          }),
          logger: routeLogger,
        });
        const oauthState = await oauthStateClient.get(stateParam);
        if (!oauthState) {
          return respondWithError(res, {
            statusCode: 400,
            details: i18n.translate('xpack.actions.oauthCallback.error.invalidState', {
              defaultMessage:
                'Invalid or expired state parameter. The authorization session may have timed out.',
            }),
          });
        }

        const { connectorId: stateConnectorId, kibanaReturnUrl } = oauthState;

        if (!oauthState.createdBy || oauthState.createdBy !== profileUid) {
          routeLogger.warn(
            `OAuth callback user mismatch for connector ${stateConnectorId}: expected ${
              oauthState.createdBy ?? 'none'
            }, got ${profileUid}`
          );
          return respondWithError(res, {
            statusCode: 403,
            details: i18n.translate('xpack.actions.oauthCallback.error.userMismatch', {
              defaultMessage:
                'This authorization session was not initiated by you. Please start a new authorization flow.',
            }),
            connectorId: stateConnectorId,
            returnUrl: kibanaReturnUrl,
          });
        }

        if (error || !code) {
          const providerError =
            error ||
            i18n.translate('xpack.actions.oauthCallback.error.missingCode', {
              defaultMessage: 'Missing required OAuth authorization code',
            });
          const details = errorDescription
            ? `${providerError}\n\n${errorDescription}`
            : providerError;
          routeLogger.error(`OAuth provider error for connector ${stateConnectorId}: ${details}`);
          return respondWithError(res, {
            statusCode: 400,
            details,
            connectorId: stateConnectorId,
            returnUrl: kibanaReturnUrl,
          });
        }

        try {
          const connectorEncryptedClient = encryptedSavedObjects.getClient({
            includedHiddenTypes: ['action'],
          });
          const namespace =
            spaces && oauthState.spaceId
              ? spaces.spacesService.spaceIdToNamespace(oauthState.spaceId)
              : undefined;
          const rawAction = await connectorEncryptedClient.getDecryptedAsInternalUser<{
            actionTypeId: string;
            name: string;
            config: OAuthConnectorConfig;
            secrets: OAuthConnectorSecrets;
          }>('action', stateConnectorId, { namespace });

          const config = rawAction.attributes.config;
          const secrets = rawAction.attributes.secrets;
          const authType = secrets.authType || config?.authType;

          let tokenResult;
          if (authType === 'ears') {
            const provider = secrets.provider;
            if (!provider) {
              throw new Error('Connector missing required OAuth configuration (provider)');
            }

            tokenResult = await requestEarsToken(
              provider,
              logger,
              {
                code,
                pkceVerifier: oauthState.codeVerifier,
              },
              configurationUtilities
            );
          } else {
            const clientId = secrets.clientId || config?.clientId;
            const clientSecret = secrets.clientSecret;
            const useBasicAuth = secrets.useBasicAuth ?? config?.useBasicAuth ?? true;
            const tokenUrl = secrets.tokenUrl || config?.tokenUrl;
            if (!clientId || !clientSecret || !tokenUrl) {
              throw new Error(
                'Connector missing required OAuth configuration (clientId, clientSecret, tokenUrl)'
              );
            }

            // Build the redirect URI (must match the one sent to the authorization endpoint)
            const redirectUri = OAuthAuthorizationService.getRedirectUri(
              coreStart.http.basePath.publicBaseUrl
            );

            const tokenResponseOptions = buildTokenResponseOptions({
              accessTokenPath: secrets.accessTokenPath,
              tokenTypePath: secrets.tokenTypePath,
              tokenType: secrets.tokenType,
            });

            tokenResult = await requestOAuthAuthorizationCodeToken(
              tokenUrl,
              logger,
              {
                code,
                redirectUri,
                codeVerifier: oauthState.codeVerifier,
                clientId,
                clientSecret,
              },
              configurationUtilities,
              useBasicAuth,
              tokenResponseOptions
            );
          }
          routeLogger.debug(
            `Successfully exchanged authorization code for access token for connectorId: ${stateConnectorId}`
          );

          const userConnectorTokenClient = new UserConnectorTokenClient({
            encryptedSavedObjectsClient: encryptedSavedObjects.getClient({
              includedHiddenTypes: ['user_connector_token'],
            }),
            unsecuredSavedObjectsClient: core.savedObjects.getClient({
              includedHiddenTypes: ['user_connector_token'],
            }),
            logger: routeLogger,
          });

          await userConnectorTokenClient.deleteConnectorTokens({
            connectorId: stateConnectorId,
            tokenType: 'access_token',
            profileUid,
          });
          const formattedToken = `${tokenResult.tokenType} ${tokenResult.accessToken}`;
          await userConnectorTokenClient.createWithRefreshToken({
            connectorId: stateConnectorId,
            accessToken: formattedToken,
            refreshToken: tokenResult.refreshToken,
            expiresIn: tokenResult.expiresIn,
            refreshTokenExpiresIn: tokenResult.refreshTokenExpiresIn,
            tokenType: 'access_token',
            profileUid,
          });

          await oauthStateClient.delete(oauthState.id);

          return respondWithSuccess(res, {
            connectorId: stateConnectorId,
            returnUrl: kibanaReturnUrl,
          });
        } catch (err) {
          routeLogger.error(`OAuth callback failed: ${getErrorMessage(err)}`);
          if (err instanceof Error && err.stack) {
            routeLogger.debug(`OAuth callback error stack: ${err.stack}`);
          }

          return respondWithError(res, {
            details: err instanceof Error ? err.message : GENERIC_OAUTH_ERROR,
            statusCode: getErrorStatusCode(err),
            connectorId: stateConnectorId,
            returnUrl: kibanaReturnUrl,
          });
        }
      })
    )
  );
};

/**
 * Companion JS for the OAuth callback HTML page.
 *
 * Reads `data-broadcast` and `data-auto-close` attributes from `<body>` and
 * executes BroadcastChannel messaging and auto-close logic. Served as a
 * separate route so it satisfies Kibana's `script-src 'self'` CSP.
 */
const OAUTH_CALLBACK_SCRIPT_BODY = `(() => {
  const { broadcast, autoClose } = document.body.dataset;

  if (broadcast) {
    try {
      const message = JSON.parse(broadcast);
      const channel = new BroadcastChannel(${JSON.stringify(OAUTH_BROADCAST_CHANNEL_NAME)});
      channel.postMessage(message);
      channel.close();
    } catch (_) {
      // BroadcastChannel may not be supported in all browsers
    }
  }

  if (autoClose === 'true') {
    setTimeout(() => {
      window.close();
      setTimeout(() => {
        const fallback = document.querySelector('.auto-close-message');
        if (fallback) {
          fallback.style.display = 'block';
        }
      }, 100);
    }, ${AUTO_CLOSE_DELAY_SECONDS * 1000});
  }
})();
`;

export const oauthCallbackScriptRoute = (router: IRouter<ActionsRequestHandlerContext>) => {
  router.get(
    {
      path: OAUTH_CALLBACK_SCRIPT_PATH,
      security: DEFAULT_ACTION_ROUTE_SECURITY,
      options: {
        access: 'public',
        availability: {
          since: '9.4.0',
        },
        description: i18n.translate('xpack.actions.oauthCallbackScript.routeDescription', {
          defaultMessage: 'Returns the OAuth callback script',
        }),
      },
      validate: {
        request: {},
        response: {
          200: {
            description: i18n.translate(
              'xpack.actions.oauthCallbackScript.response200Description',
              {
                defaultMessage: 'Returns the OAuth callback script',
              }
            ),
          },
        },
      },
    },
    (_context, _req, res) => {
      return res.ok({
        headers: {
          'content-type': 'application/javascript',
          'cache-control': 'public, max-age=86400',
        },
        body: OAUTH_CALLBACK_SCRIPT_BODY,
      });
    }
  );
};

const getErrorMessage = (err: unknown): string => {
  if (SavedObjectsErrorHelpers.isSavedObjectsClientError(err) || Boom.isBoom(err)) {
    return err.output.payload.message;
  }

  return err instanceof Error ? err.message : 'Unknown error';
};

const getErrorStatusCode = (err: unknown): number => {
  if (SavedObjectsErrorHelpers.isSavedObjectsClientError(err) || Boom.isBoom(err)) {
    return err.output.statusCode;
  }

  return 500;
};
