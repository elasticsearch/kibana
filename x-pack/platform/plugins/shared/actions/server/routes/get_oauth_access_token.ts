/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { IRouter } from '@kbn/core/server';
import type { ILicenseState } from '../lib';
import { CONNECTOR_ID_MAX_LENGTH, INTERNAL_BASE_ACTION_API_PATH } from '../../common';
import type { ActionsRequestHandlerContext } from '../types';
import { verifyAccessAndContext } from './verify_access_and_context';
import type { ActionsConfigurationUtilities } from '../actions_config';
import { DEFAULT_ACTION_ROUTE_SECURITY } from './constants';

const oauthJwtBodySchema = schema.object({
  tokenUrl: schema.string({ maxLength: 2048 }),
  config: schema.object({
    clientId: schema.string({ maxLength: 256 }),
    jwtKeyId: schema.string({ maxLength: 256 }),
    userIdentifierValue: schema.string({ maxLength: 256 }),
  }),
  secrets: schema.object({
    clientSecret: schema.string({ maxLength: 4096 }),
    privateKey: schema.string({ maxLength: 8192 }),
    privateKeyPassword: schema.maybe(schema.string({ maxLength: 256 })),
  }),
});

export type OAuthJwtParams = TypeOf<typeof oauthJwtBodySchema>;

const oauthClientCredentialsBodySchema = schema.object({
  tokenUrl: schema.string({ maxLength: 2048 }),
  scope: schema.string({ maxLength: 1024 }),
  config: schema.object({
    clientId: schema.string({ maxLength: 256 }),
  }),
  secrets: schema.object({
    clientSecret: schema.string({ maxLength: 4096 }),
  }),
});

export type OAuthClientCredentialsParams = TypeOf<typeof oauthClientCredentialsBodySchema>;

const oauthAuthorizationCodeBodySchema = schema.object({
  connectorId: schema.string({ maxLength: CONNECTOR_ID_MAX_LENGTH }),
  tokenUrl: schema.string({ maxLength: 2048 }),
  scope: schema.maybe(schema.string({ maxLength: 1024 })),
  config: schema.object({
    clientId: schema.string({ maxLength: 256 }),
    tokenUrl: schema.string({ maxLength: 2048 }),
  }),
  secrets: schema.object({
    clientSecret: schema.string({ maxLength: 4096 }),
  }),
});

export type OAuthAuthorizationCodeParams = TypeOf<typeof oauthAuthorizationCodeBodySchema>;

const bodySchema = schema.object({
  type: schema.oneOf([
    schema.literal('jwt'),
    schema.literal('client'),
    schema.literal('authorization_code'),
  ]),
  options: schema.conditional(
    schema.siblingRef('type'),
    schema.literal('jwt'),
    oauthJwtBodySchema,
    schema.conditional(
      schema.siblingRef('type'),
      schema.literal('client'),
      oauthClientCredentialsBodySchema,
      oauthAuthorizationCodeBodySchema
    )
  ),
});

export type OAuthParams = TypeOf<typeof bodySchema>;

export const getOAuthAccessToken = (
  router: IRouter<ActionsRequestHandlerContext>,
  licenseState: ILicenseState,
  configurationUtilities: ActionsConfigurationUtilities
) => {
  router.post(
    {
      path: `${INTERNAL_BASE_ACTION_API_PATH}/connector/_oauth_access_token`,
      security: DEFAULT_ACTION_ROUTE_SECURITY,
      validate: {
        body: bodySchema,
      },
      options: {
        access: 'internal',
      },
    },
    router.handleLegacyErrors(
      verifyAccessAndContext(licenseState, async function (context, req, res) {
        const actionsClient = (await context.actions).getActionsClient();
        return res.ok({
          body: await actionsClient.getOAuthAccessToken(req.body, configurationUtilities),
        });
      })
    )
  );
};
