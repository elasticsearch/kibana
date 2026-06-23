/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

import { EuiLink } from '@elastic/eui';

import { PageIntroduction } from './page_introduction';

describe('PageIntroduction component', () => {
  it('renders with title as a string', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction title="string title" description="some description" />
    );

    expect(screen.getByTestId('pageIntroductionTitleContainer')).toHaveTextContent('string title');
  });

  it('renders title as React node', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        title={<h2 data-test-subj="injected">react node title</h2>}
        description="some description"
      />
    );

    expect(screen.getByTestId('injected')).toHaveTextContent('react node title');
  });

  it('renders with description only', () => {
    renderWithKibanaRenderContext(<PageIntroduction description="some description" />);

    expect(screen.getByTestId('pageIntroductionTitleContainer').textContent?.trim()).toBe('');
    expect(screen.getByTestId('pageIntroductionDescriptionText')).toHaveTextContent(
      'some description'
    );
  });

  it('renders with single link', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        links={
          <EuiLink data-test-subj="contentConnectorsTestLinkToNowhereLink" href="testlink" external>
            test link to nowhere
          </EuiLink>
        }
      />
    );

    const link = screen.getByTestId('contentConnectorsTestLinkToNowhereLink');
    expect(link).toHaveAttribute('href', 'testlink');
    expect(link).toHaveTextContent('test link to nowhere');
  });

  it('renders with multiple links', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        links={[
          <EuiLink data-test-subj="contentConnectorsTestLinkToNowhereLink" href="testlink" external>
            test link to nowhere
          </EuiLink>,
          <EuiLink
            data-test-subj="contentConnectorsTestLinkToNowhere2Link"
            href="testlink2"
            external
          >
            test link to nowhere2
          </EuiLink>,
        ]}
      />
    );

    const link1 = screen.getByTestId('contentConnectorsTestLinkToNowhereLink');
    expect(link1).toHaveAttribute('href', 'testlink');
    expect(link1).toHaveTextContent('test link to nowhere');

    const link2 = screen.getByTestId('contentConnectorsTestLinkToNowhere2Link');
    expect(link2).toHaveAttribute('href', 'testlink2');
    expect(link2).toHaveTextContent('test link to nowhere2');
  });

  it('renders with single actions', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        actions={<button>some action</button>}
      />
    );

    expect(screen.getByRole('button', { name: 'some action' })).toBeInTheDocument();
  });

  it('renders with multiple action', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        actions={[<button>some action</button>, <button>another action</button>]}
      />
    );

    expect(screen.getByRole('button', { name: 'some action' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'another action' })).toBeInTheDocument();
  });
});
