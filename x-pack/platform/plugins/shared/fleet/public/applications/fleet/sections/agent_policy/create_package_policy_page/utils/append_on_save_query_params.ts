/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { parse, stringify } from 'query-string';

import type {
  CreatePackagePolicyRouteState,
  OnSaveQueryParamOpts,
  OnSaveQueryParamKeys,
} from '../../../../types';
import type { SavedPolicyResult } from '../types';

export function appendOnSaveQueryParamsToPath({
  path,
  savedPolicyResult,
  paramsToApply,
  mappingOptions = {},
}: {
  path: string;
  savedPolicyResult: SavedPolicyResult;
  paramsToApply: OnSaveQueryParamKeys[];
  mappingOptions?: CreatePackagePolicyRouteState['onSaveQueryParams'];
}) {
  const [basePath, queryStringIn] = path.split('?');
  const queryParams = parse(queryStringIn);
  // Agentless policies have no agent policies; use their own id. TODO handle multiple.
  const policyId =
    savedPolicyResult.type === 'agentless'
      ? savedPolicyResult.policy.id
      : savedPolicyResult.policy.policy_ids[0];

  paramsToApply.forEach((paramName) => {
    const paramOptions = mappingOptions[paramName];
    if (paramOptions) {
      const [paramKey, paramValue] = createQueryParam(
        paramName,
        paramOptions,
        policyId || undefined
      );
      if (paramKey && paramValue) {
        queryParams[paramKey] = paramValue;
      }
    }
  });

  const queryString = stringify(queryParams);

  return basePath + (queryString ? `?${queryString}` : '');
}

function createQueryParam(
  name: string,
  opts: OnSaveQueryParamOpts,
  policyId?: string
): [string?, string?] {
  if (!opts) {
    return [];
  }
  if (typeof opts === 'boolean' && opts) {
    return [name, 'true'];
  }

  const paramKey = opts.renameKey ? opts.renameKey : name;
  const paramValue = opts.policyIdAsValue && policyId ? policyId : 'true';

  return [paramKey, paramValue];
}
