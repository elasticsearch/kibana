/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type { RawRule } from '../../types';
import { generateAPIKeyName, apiKeyAsAlertAttributes, resolveRuleAPIKey } from '../common';
import type { RuleApiKeyOwnership } from '../common';
import type { RulesClientContext } from '../types';

export async function createNewAPIKeySet(
  context: RulesClientContext,
  {
    id,
    ruleName,
    username,
    shouldUpdateApiKey,
    errorMessage,
    apiKeyOwnership,
    refresh,
  }: {
    id: string;
    ruleName: string;
    username: string | null;
    shouldUpdateApiKey: boolean;
    errorMessage?: string;
    apiKeyOwnership?: RuleApiKeyOwnership;
    refresh?: boolean | 'wait_for';
  }
): Promise<
  Pick<
    RawRule,
    'apiKey' | 'apiKeyOwner' | 'apiKeyCreatedByUser' | 'uiamApiKey' | 'uiamApiKeyExternal'
  >
> {
  let createdAPIKey = null;
  let isAuthTypeApiKey = false;
  try {
    const name = generateAPIKeyName(id, ruleName);
    const resolved = await resolveRuleAPIKey(context, name, shouldUpdateApiKey, {
      apiKeyOwnership,
      refresh,
    });
    createdAPIKey = resolved.createdAPIKey;
    isAuthTypeApiKey = resolved.isAuthTypeApiKey;
  } catch (error) {
    const message = errorMessage ? errorMessage : 'Error creating API key for rule';
    throw Boom.badRequest(`${message} - ${error.message}`);
  }

  return apiKeyAsAlertAttributes(createdAPIKey, username, isAuthTypeApiKey);
}
