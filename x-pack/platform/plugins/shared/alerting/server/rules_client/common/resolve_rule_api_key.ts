/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { withSpan } from '@kbn/apm-utils';
import type { RulesClientContext, CreateAPIKeyResult } from '../types';

export interface ResolvedAPIKey {
  createdAPIKey: CreateAPIKeyResult | null;
  isAuthTypeApiKey: boolean;
}

export interface RuleApiKeyOwnership {
  apiKeyCreatedByUser?: boolean | null;
}

const cloneKey = async (context: RulesClientContext, name: string): Promise<ResolvedAPIKey> => {
  return { createdAPIKey: await context.cloneAPIKey(name), isAuthTypeApiKey: false };
};

const grantKey = async (
  context: RulesClientContext,
  name: string,
  refresh?: boolean | 'wait_for'
): Promise<ResolvedAPIKey> => {
  const createdAPIKey = await withSpan({ name: 'createAPIKey', type: 'rules' }, () =>
    context.createAPIKey(name, refresh)
  );
  return { createdAPIKey, isAuthTypeApiKey: false };
};

export interface ResolveRuleAPIKeyOptions {
  apiKeyOwnership?: RuleApiKeyOwnership;
  cloneApiKey?: boolean;
  refresh?: boolean | 'wait_for';
}

export const resolveRuleAPIKey = async (
  context: RulesClientContext,
  name: string,
  enabled: boolean,
  { apiKeyOwnership, cloneApiKey, refresh }: ResolveRuleAPIKeyOptions = {}
): Promise<ResolvedAPIKey> => {
  if (!enabled) {
    return { createdAPIKey: null, isAuthTypeApiKey: false };
  }

  if (!apiKeyOwnership && context.cloneApiKeysOnCreate) {
    return cloneKey(context, name);
  }

  const isApiKeyAuth = context.isAuthenticationTypeAPIKey();
  const callerKeyIsBorrowed = Boolean(cloneApiKey) && !apiKeyOwnership && isApiKeyAuth;
  const frameworkManaged = apiKeyOwnership?.apiKeyCreatedByUser === false;

  if (callerKeyIsBorrowed) {
    return cloneKey(context, name);
  }

  if (frameworkManaged) {
    return isApiKeyAuth ? cloneKey(context, name) : grantKey(context, name, refresh);
  }

  if (isApiKeyAuth) {
    return {
      createdAPIKey: context.getAuthenticationAPIKey(`${name}-user-created`),
      isAuthTypeApiKey: true,
    };
  }

  return grantKey(context, name, refresh);
};
