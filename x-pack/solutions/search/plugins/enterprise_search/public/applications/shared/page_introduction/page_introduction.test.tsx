/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { screen } from '@testing-library/react';

import { EuiLink } from '@elastic/eui';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';

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
          <EuiLink data-test-subj="enterpriseSearchTestLinkToNowhereLink" href="testlink" external>
            test link to nowhere
          </EuiLink>
        }
      />
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', 'testlink');
    expect(links[0]).toHaveTextContent('test link to nowhere');
  });

  it('renders with multiple links', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        links={[
          <EuiLink data-test-subj="enterpriseSearchTestLinkToNowhereLink" href="testlink" external>
            test link to nowhere
          </EuiLink>,
          <EuiLink
            data-test-subj="enterpriseSearchTestLinkToNowhere2Link"
            href="testlink2"
            external
          >
            test link to nowhere2
          </EuiLink>,
        ]}
      />
    );
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', 'testlink');
    expect(links[0]).toHaveTextContent('test link to nowhere');
    expect(links[1]).toHaveAttribute('href', 'testlink2');
    expect(links[1]).toHaveTextContent('test link to nowhere2');
  });

  it('renders with single actions', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        actions={<button>some action</button>}
      />
    );
    expect(screen.getByRole('button')).toHaveTextContent('some action');
  });

  it('renders with multiple action', () => {
    renderWithKibanaRenderContext(
      <PageIntroduction
        description="some description"
        title="some title"
        actions={[<button>some action</button>, <button>another action</button>]}
      />
    );
    const actions = screen.getAllByRole('button');
    expect(actions).toHaveLength(2);
    expect(actions[0]).toHaveTextContent('some action');
    expect(actions[1]).toHaveTextContent('another action');
  });
});
