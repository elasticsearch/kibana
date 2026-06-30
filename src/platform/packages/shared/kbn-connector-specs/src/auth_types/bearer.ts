/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { z, lazySchema } from '@kbn/zod/v4';
import type { AxiosInstance } from 'axios';
import type { AuthContext, AuthTypeSpec } from '../connector_spec';
import * as i18n from './translations';

const authSchema = lazySchema(() =>
  z
    .object({
      token: z
        .string()
        .min(1, { message: i18n.BEARER_AUTH_REQUIRED_MESSAGE })
        .meta({ sensitive: true, label: i18n.BEARER_TOKEN_LABEL }),
    })
    .meta({ label: i18n.BEARER_AUTH_LABEL })
);

type AuthSchemaType = z.infer<typeof authSchema>;

/**
 * Bearer Token Authentication
 * Use for: OAuth tokens, API tokens sent as "Authorization: Bearer <token>"
 */
export const BearerAuth: AuthTypeSpec<AuthSchemaType> = {
  id: 'bearer',
  schema: authSchema,
  configure: async (
    _: AuthContext,
    axiosInstance: AxiosInstance,
    secret: AuthSchemaType
  ): Promise<AxiosInstance> => {
    // set global defaults
    axiosInstance.defaults.headers.common.Authorization = `Bearer ${secret.token}`;

    return axiosInstance;
  },
  getAuthHeaders: async (
    _: AuthContext,
    secret: AuthSchemaType
  ): Promise<Record<string, string>> => {
    return { Authorization: `Bearer ${secret.token}` };
  },
};
