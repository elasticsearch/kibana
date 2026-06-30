/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { TestProviders } from '../../../common/mock';
import { DisabledLinkPanel } from './disabled_link_panel';
import { ThreatIntelPanelView as TestView } from '../overview_cti_links/threat_intel_panel_view';

jest.mock('../../../common/lib/kibana');

describe('DisabledLinkPanel', () => {
  const defaultProps = {
    bodyCopy: 'body',
    buttonCopy: 'button',
    dataTestSubjPrefix: '_test_prefix_',
    docLink: '/doclink',
    LinkPanelViewComponent: TestView,
    listItems: [],
    titleCopy: 'title',
  };

  it('renders expected children', () => {
    render(
      <TestProviders>
        <DisabledLinkPanel {...defaultProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('_test_prefix_-inner-panel-danger')).toBeInTheDocument();
    expect(screen.getByTestId('_test_prefix_-enable-module-button')).toHaveTextContent(
      defaultProps.buttonCopy
    );
    expect(screen.getByTestId('_test_prefix_-enable-module-button')).toHaveAttribute(
      'href',
      defaultProps.docLink
    );
  });

  it('renders more buttons', () => {
    const moreButtons: React.ReactElement = <div data-test-subj="more-button">{'More Button'}</div>;
    const testProps = {
      ...defaultProps,
      moreButtons,
    };
    render(
      <TestProviders>
        <DisabledLinkPanel {...testProps} />
      </TestProviders>
    );

    expect(screen.getByTestId('more-button')).toBeInTheDocument();
  });
});
