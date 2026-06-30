/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiButton } from '@elastic/eui';
import { TestProviders } from '../../../common/mock';
import { InnerLinkPanel } from './inner_link_panel';

describe('InnerLinkPanel', () => {
  const defaultProps = {
    body: 'test_body',
    button: <EuiButton />,
    dataTestSubj: 'custom_test_subj',
    title: 'test_title',
  };

  it('renders expected children', () => {
    const { container } = render(
      <TestProviders>
        <InnerLinkPanel color="warning" {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('custom_test_subj')).toBeInTheDocument();
    expect(container.querySelector('button')).toBeInTheDocument();
    expect(screen.getByTestId('inner-link-panel-title')).toHaveTextContent(defaultProps.title);
  });

  it('renders learn more link', () => {
    render(
      <TestProviders>
        <InnerLinkPanel color="warning" {...defaultProps} learnMoreLink="/learn_more" />
      </TestProviders>
    );
    expect(screen.getByTestId('custom_test_subj-learn-more')).toBeInTheDocument();
  });
});
