/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import queryString from 'query-string';
import { useCallback, useState } from 'react';
import { useHistory, useLocation } from 'react-router-dom';

export function useInRouterContext() {
  try {
    useLocation();
    return true;
  } catch (e: unknown) {
    return false;
  }
}

export function useUrlState<
  T extends Record<string, unknown> = {},
  Q extends Record<string, unknown> = {}
>({
  queryParamsDeserializer,
  queryParamsSerializer,
}: {
  queryParamsDeserializer: (params: Q) => T;
  queryParamsSerializer: (params: Record<string, unknown>) => Partial<Q>;
}): [T, (updated: Record<string, unknown>) => void] {
  const history = useHistory();

  const [initialUrlState] = useState(() =>
    queryParamsDeserializer(queryString.parse(history.location.search) as Q)
  );

  const updateQueryParams = useCallback(
    (updated: Record<string, unknown>) => {
      const updatedQuery = queryParamsSerializer(updated);

      const queryParams = {
        ...queryString.parse(history.location.search),
        ...updatedQuery,
      };

      history.replace({
        search: `?${queryString.stringify(queryParams)}`,
      });
    },
    [history, queryParamsSerializer]
  );

  return [initialUrlState, updateQueryParams];
}
