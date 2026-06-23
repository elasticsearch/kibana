/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { setMockValues } from '../../__mocks__/kea_logic';

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { NotFoundPrompt } from '.';

describe('NotFoundPrompt', () => {
  it('renders', () => {
    renderWithKibanaRenderContext(
      <NotFoundPrompt productSupportUrl="https://discuss.elastic.co/c/enterprise-search/app-search/" />
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('404 error');
    expect(screen.getByRole('link', { name: 'Back to your dashboard' })).toHaveAttribute(
      'href',
      '/app/enterprise_search/'
    );
    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      'https://discuss.elastic.co/c/enterprise-search/app-search/'
    );
  });

  it('renders with a custom "Back to dashboard" link if passed', () => {
    renderWithKibanaRenderContext(
      <NotFoundPrompt
        productSupportUrl="https://discuss.elastic.co/c/enterprise-search/workplace-search/"
        backToLink="/workplace_search/p/sources"
      />
    );

    expect(screen.getByRole('link', { name: 'Back to your dashboard' })).toHaveAttribute(
      'href',
      '/app/enterprise_search/workplace_search/p/sources'
    );
  });

  it('renders with a link to our licensed support URL for gold+ licenses', () => {
    setMockValues({ hasGoldLicense: true });
    renderWithKibanaRenderContext(<NotFoundPrompt productSupportUrl="" />);

    expect(screen.getByRole('link', { name: 'Contact support' })).toHaveAttribute(
      'href',
      'https://support.elastic.co'
    );
  });
});
