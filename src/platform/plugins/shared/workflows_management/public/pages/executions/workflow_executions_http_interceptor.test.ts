/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { rewriteWorkflowExecutionsHttpFetchOptions } from './workflow_executions_http_interceptor';

describe('rewriteWorkflowExecutionsHttpFetchOptions', () => {
  it('rewrites options list requests for the executions index', () => {
    expect(
      rewriteWorkflowExecutionsHttpFetchOptions({
        path: '/internal/controls/optionsList/.workflows-executions',
        method: 'POST',
      })
    ).toEqual({
      path: '/internal/workflows/executions/options_list',
      version: '1',
    });
  });

  it('rewrites data view fields requests for the executions index', () => {
    expect(
      rewriteWorkflowExecutionsHttpFetchOptions({
        path: '/internal/data_views/fields',
        method: 'GET',
        query: {
          pattern: '.workflows-executions',
          meta_fields: ['_source'],
        },
      })
    ).toEqual({
      path: '/internal/workflows/executions/fields',
      version: '1',
    });
  });

  it('does not rewrite unrelated requests', () => {
    expect(
      rewriteWorkflowExecutionsHttpFetchOptions({
        path: '/internal/controls/optionsList/.alerts-security.alerts-default',
        method: 'POST',
      })
    ).toBeUndefined();

    expect(
      rewriteWorkflowExecutionsHttpFetchOptions({
        path: '/internal/data_views/fields',
        method: 'GET',
        query: {
          pattern: '.alerts-security.alerts-default',
        },
      })
    ).toBeUndefined();
  });
});
