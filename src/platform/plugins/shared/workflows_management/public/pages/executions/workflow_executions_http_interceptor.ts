/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useEffect } from 'react';
import type { HttpFetchOptionsWithPath } from '@kbn/core-http-browser';
import { WORKFLOWS_EXECUTIONS_INDEX } from '../../../common';
import { useKibana } from '../../hooks/use_kibana';

export const rewriteWorkflowExecutionsHttpFetchOptions = (
  fetchOptions: HttpFetchOptionsWithPath
): Partial<HttpFetchOptionsWithPath> | undefined => {
  const { path, query } = fetchOptions;

  if (path.startsWith('/internal/controls/optionsList/')) {
    const index = decodeURIComponent(path.split('/').pop() ?? '');
    if (index === WORKFLOWS_EXECUTIONS_INDEX) {
      return {
        path: '/internal/workflows/executions/options_list',
        version: '1',
      };
    }
  }

  if (
    path === '/internal/data_views/fields' &&
    (query as { pattern?: string } | undefined)?.pattern === WORKFLOWS_EXECUTIONS_INDEX
  ) {
    return {
      path: '/internal/workflows/executions/fields',
      version: '1',
    };
  }

  return undefined;
};

export const useWorkflowExecutionsHttpInterceptor = (): void => {
  const { http } = useKibana().services;

  useEffect(() => {
    return http.intercept({
      request: (fetchOptions) => rewriteWorkflowExecutionsHttpFetchOptions(fetchOptions),
    });
  }, [http]);
};
