/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { AppContextTestRender } from '../../../../common/mock/endpoint';
import { createAppRootMockRenderer } from '../../../../common/mock/endpoint';
import { ResponseActionStatusBadge } from './response_action_status_badge';

describe('ResponseActionStatusBadge', () => {
  let appTestContext: AppContextTestRender;
  let renderResult: ReturnType<AppContextTestRender['render']>;

  beforeEach(() => {
    appTestContext = createAppRootMockRenderer();
  });

  it.each([
    { status: 'successful', expectedText: 'Successful', expectedColor: 'success' },
    { status: 'failed', expectedText: 'Failed', expectedColor: 'danger' },
    { status: 'canceled', expectedText: 'Canceled', expectedColor: 'default' },
    { status: 'pending', expectedText: 'Pending', expectedColor: 'warning' },
  ] as const)(
    'should render "$expectedText" with color "$expectedColor" for status "$status"',
    ({ status, expectedText, expectedColor }) => {
      renderResult = appTestContext.render(
        <ResponseActionStatusBadge status={status} data-test-subj="test" />
      );
      const badge = renderResult.getByTestId('test');
      expect(badge).not.toBeNull();
      expect(badge.textContent).toEqual(expectedText);
      expect(badge.className).toContain(expectedColor);
    }
  );

  it('should apply custom data-test-subj', () => {
    renderResult = appTestContext.render(
      <ResponseActionStatusBadge status="successful" data-test-subj="my-custom-badge" />
    );
    expect(renderResult.getByTestId('my-custom-badge')).not.toBeNull();
  });
});
