/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('.', () => ({
  generateReactRouterProps: ({ to }: { to: string }) => ({
    href: `/app/enterprise_search${to}`,
    onClick: () => {},
  }),
}));

import React from 'react';

import { screen } from '@testing-library/react';

import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import {
  EuiLinkTo,
  EuiButtonTo,
  EuiButtonEmptyTo,
  EuiButtonIconTo,
  EuiListGroupItemTo,
  EuiPanelTo,
  EuiCardTo,
} from './eui_components';

describe('React Router EUI component helpers', () => {
  it('renders an EuiLink', () => {
    renderWithKibanaRenderContext(<EuiLinkTo to="/" />);
    expect(screen.getByTestId('enterpriseSearchEuiLinkToLink')).toBeInTheDocument();
  });

  it('renders an EuiButton', () => {
    renderWithKibanaRenderContext(<EuiButtonTo to="/" />);
    expect(screen.getByTestId('enterpriseSearchEuiButtonToButton')).toBeInTheDocument();
  });

  it('renders an EuiButtonEmpty', () => {
    renderWithKibanaRenderContext(<EuiButtonEmptyTo to="/" />);
    expect(screen.getByTestId('enterpriseSearchEuiButtonEmptyToButton')).toBeInTheDocument();
  });

  it('renders an EuiButtonIconTo', () => {
    renderWithKibanaRenderContext(<EuiButtonIconTo iconType="pencil" to="/" />);
    expect(screen.getByTestId('enterpriseSearchEuiButtonIconToButton')).toBeInTheDocument();
  });

  it('renders an EuiListGroupItem', () => {
    renderWithKibanaRenderContext(<EuiListGroupItemTo to="/" label="foo" />);
    expect(screen.getByText('foo')).toBeInTheDocument();
  });

  it('renders an EuiPanel', () => {
    const { container } = renderWithKibanaRenderContext(<EuiPanelTo to="/" paddingSize="l" />);
    expect(container.querySelector('.euiPanel--paddingLarge')).not.toBeNull();
  });

  it('renders an EuiCard', () => {
    renderWithKibanaRenderContext(<EuiCardTo to="/" title="test" description="" />);
    expect(screen.getByRole('link', { name: 'test' })).toBeInTheDocument();
  });

  it('passes down all ...rest props', () => {
    renderWithKibanaRenderContext(
      <EuiLinkTo to="/" data-test-subj="test" target="_blank" external />
    );
    const link = screen.getByTestId('test');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('renders with generated href and onClick props', () => {
    renderWithKibanaRenderContext(<EuiLinkTo to="/hello/world" />);
    const link = screen.getByTestId('enterpriseSearchEuiLinkToLink');
    expect(link).toHaveAttribute('href', '/app/enterprise_search/hello/world');
  });
});
