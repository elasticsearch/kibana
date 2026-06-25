/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { AISummarySectionSettings } from './ai_summary_section_settings';
import type { AISummarySectionSettingsProps } from './ai_summary_section_settings';

const defaultProps: AISummarySectionSettingsProps = {
  showAnonymized: false,
  onChangeShowAnonymized: jest.fn(),
  closePopover: jest.fn(),
  openPopover: jest.fn(),
  isPopoverOpen: false,
  hasAnonymizedContent: true,
};

const renderComponent = (props: Partial<AISummarySectionSettingsProps> = {}) =>
  render(
    <TestProviders>
      <AISummarySectionSettings {...defaultProps} {...props} />
    </TestProviders>
  );

describe('AISummarySectionSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the settings menu button', () => {
    renderComponent();
    expect(screen.getByTestId('overview-tab-ai-summary-settings-menu')).toBeInTheDocument();
  });

  it('calls openPopover when the button is clicked', () => {
    renderComponent();
    fireEvent.click(screen.getByTestId('overview-tab-ai-summary-settings-menu'));
    expect(defaultProps.openPopover).toHaveBeenCalledTimes(1);
  });

  it('renders the anonymized toggle when popover is open', () => {
    renderComponent({ isPopoverOpen: true });
    expect(screen.getByTestId('overview-tab-toggle-anonymized')).toBeInTheDocument();
  });

  it('shows the switch as checked when showAnonymized is true', () => {
    renderComponent({ isPopoverOpen: true, showAnonymized: true });
    const toggle = screen.getByTestId('overview-tab-toggle-anonymized');
    expect(toggle).toBeChecked();
  });

  it('disables the switch when hasAnonymizedContent is false', () => {
    renderComponent({ isPopoverOpen: true, hasAnonymizedContent: false });
    const toggle = screen.getByTestId('overview-tab-toggle-anonymized');
    expect(toggle).toBeDisabled();
  });
});
