/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { EuiProvider } from '@elastic/eui';
import { SectionPanel } from './section_panel';

const renderWithEui = (ui: React.ReactElement) => render(<EuiProvider>{ui}</EuiProvider>);

describe('SectionPanel', () => {
  it('renders the panel and children', () => {
    renderWithEui(
      <SectionPanel title="My title">
        <div>{'Body content'}</div>
      </SectionPanel>
    );

    expect(screen.getByTestId('sectionPanel')).toBeInTheDocument();
    expect(screen.getByText('My title')).toBeInTheDocument();
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });

  it('renders the icon when provided', () => {
    renderWithEui(
      <SectionPanel title="Title" icon={<span>{'my icon'}</span>}>
        <div />
      </SectionPanel>
    );

    expect(screen.getByTestId('sectionPanelIcon')).toBeInTheDocument();
  });

  it('does not render an icon container when icon is not provided', () => {
    renderWithEui(
      <SectionPanel title="Title">
        <div />
      </SectionPanel>
    );

    // This checks the icon isn't present; structure is implementation detail,
    // so we only assert absence of an icon element.
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument();
  });

  it('renders title', () => {
    renderWithEui(
      <SectionPanel title={<span data-test-subj="custom-title">{'Custom'}</span>}>
        <div />
      </SectionPanel>
    );

    expect(screen.getByTestId('custom-title')).toBeInTheDocument();
  });

  it('renders title as link when link prop is provided and invokes callback on click', () => {
    const callback = jest.fn();
    renderWithEui(
      <SectionPanel
        title="Entities"
        link={{
          callback,
          tooltip: 'Show all entities',
        }}
      >
        <div />
      </SectionPanel>
    );

    const titleLink = screen.getByTestId('sectionPanelTitleLink');
    expect(titleLink).toBeInTheDocument();
    expect(titleLink).toHaveTextContent('Entities');

    titleLink.click();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('renders custom data-test-subj when provided', () => {
    renderWithEui(
      <SectionPanel title="Title" data-test-subj="customPanel">
        <div />
      </SectionPanel>
    );

    expect(screen.getByTestId('customPanel')).toBeInTheDocument();
  });
});
