/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared/src/common/hooks';
import { useKibana } from '../utils/kibana_react';

export type AuthorizedToReadRuleType = (ruleTypeId: string, consumer?: string) => boolean;

/**
 * Returns a function that checks whether the current user is authorized to read a
 * specific rule type (and optionally a consumer).
 *
 * Rule read is authorized per rule type, so UI affordances that link to or depend
 * on a single rule (rule links, "View rule details" actions, custom alert details
 * sections, etc.) should gate on this rather than the coarse
 * `authorizedToReadAnyRules` flag. This wraps `useGetRuleTypesPermissions` and
 * sources `http`/`toasts` from Kibana so callers don't have to wire them up.
 */
export const useAuthorizedToReadRuleType = (): AuthorizedToReadRuleType => {
  const {
    http,
    notifications: { toasts },
  } = useKibana().services;

  const { authorizedToReadRuleType } = useGetRuleTypesPermissions({ http, toasts });

  return authorizedToReadRuleType;
};
