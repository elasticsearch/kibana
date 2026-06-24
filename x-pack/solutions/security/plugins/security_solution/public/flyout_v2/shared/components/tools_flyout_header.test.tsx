/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { __IntlProvider as IntlProvider } from '@kbn/i18n-react';
import { ToolsFlyoutHeader } from './tools_flyout_header';
import { TOOLS_FLYOUT_HEADER_TEST_ID } from './test_ids';

jest.mock('./tools_flyout_title', () => ({
  ToolsFlyoutTitle: ({ label }: { label: string }) => (
    <div data-test-subj="mockToolsFlyoutTitle">{label}</div>
  ),
}));

const renderHeader = (props: Partial<Parameters<typeof ToolsFlyoutHeader>[0]> = {}) =>
  render(
    <IntlProvider locale="en">
      <ToolsFlyoutHeader title={<span>{'Correlations'}</span>} {...props} />
    </IntlProvider>
  );

const sourceProps = {
  onTitleClick: jest.fn(),
  label: 'Test Rule',
  iconType: 'warning',
};

describe('<ToolsFlyoutHeader />', () => {
  it('renders the header container', () => {
    const { getByTestId } = renderHeader();
    expect(getByTestId(TOOLS_FLYOUT_HEADER_TEST_ID)).toBeInTheDocument();
  });

  it('renders the tool title', () => {
    const { getByText } = renderHeader({ title: <span>{'Session view'}</span> });
    expect(getByText('Session view')).toBeInTheDocument();
  });

  it('renders ToolsFlyoutTitle when onTitleClick, label and iconType are provided', () => {
    const { getByTestId } = renderHeader(sourceProps);
    expect(getByTestId('mockToolsFlyoutTitle')).toBeInTheDocument();
    expect(getByTestId('mockToolsFlyoutTitle')).toHaveTextContent('Test Rule');
  });

  it('does not render source context when props are missing', () => {
    const { queryByTestId } = renderHeader();
    expect(queryByTestId('mockToolsFlyoutTitle')).not.toBeInTheDocument();
  });

  it('renders badge when provided', () => {
    const { getByTestId } = renderHeader({
      ...sourceProps,
      badge: <div data-test-subj="mockBadge" />,
    });
    expect(getByTestId('mockBadge')).toBeInTheDocument();
  });

  it('renders timestamp when provided', () => {
    const { getByTestId } = renderHeader({
      ...sourceProps,
      timestamp: <div data-test-subj="mockTimestamp" />,
    });
    expect(getByTestId('mockTimestamp')).toBeInTheDocument();
  });
});
