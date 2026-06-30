/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { OnboardingCardPanel } from './onboarding_card_panel';
import { CARD_COMPLETE_BADGE, EXPAND_CARD_BUTTON_LABEL } from './translations';
import type { OnboardingCardId } from '../../constants';
import { TestProviders } from '../../../common/mock/test_providers';

const mockUseDarkMode = jest.fn(() => false);
jest.mock('@kbn/react-kibana-context-theme', () => ({
  ...jest.requireActual('@kbn/react-kibana-context-theme'),
  useKibanaIsDarkMode: () => mockUseDarkMode(),
}));

jest.mock('@elastic/eui', () => ({
  ...jest.requireActual('@elastic/eui'),
  EuiIcon: jest.fn(({ type }: { type: string }) => <div data-test-subj={`EuiIcon-${type}`} />),
}));

describe('OnboardingCardPanel Component', () => {
  const defaultProps = {
    id: 'card-1' as OnboardingCardId,
    title: 'Test Card',
    icon: 'testIcon',
    iconDark: undefined,
    badge: undefined,
    isExpanded: false,
    isComplete: false,
    onToggleExpanded: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the card title', () => {
    render(
      <OnboardingCardPanel {...defaultProps}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>,
      { wrapper: TestProviders }
    );

    // Verify that the card title and icon are rendered
    expect(screen.getByText('Test Card')).toBeInTheDocument();
  });

  it('displays the complete badge if the card is complete', () => {
    render(
      <OnboardingCardPanel {...defaultProps} isComplete={true}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>,
      { wrapper: TestProviders }
    );

    // Verify that the complete badge is displayed
    expect(screen.getByText(CARD_COMPLETE_BADGE)).toBeInTheDocument();
  });

  it('does not display the complete badge if the card is not complete', () => {
    render(
      <OnboardingCardPanel {...defaultProps} isComplete={false}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>,
      { wrapper: TestProviders }
    );

    // Verify that the complete badge is not displayed
    expect(screen.queryByText(CARD_COMPLETE_BADGE)).not.toBeInTheDocument();
  });

  it('calls onToggleExpanded when clicking on the card header', () => {
    render(
      <OnboardingCardPanel {...defaultProps}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>,
      { wrapper: TestProviders }
    );

    // Click on the card header
    fireEvent.click(screen.getByText('Test Card'));

    // Ensure that the onToggleExpanded function is called
    expect(defaultProps.onToggleExpanded).toHaveBeenCalledTimes(1);
  });

  it('displays the correct button icon based on isExpanded prop', () => {
    const { container, rerender } = render(
      <OnboardingCardPanel {...defaultProps} isExpanded={false}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>,
      { wrapper: TestProviders }
    );

    // Check the button icon when card is not expanded
    const buttonIcon = container.querySelector(
      `[aria-label='${EXPAND_CARD_BUTTON_LABEL('Test Card')}']`
    );
    expect(buttonIcon).toHaveAttribute('aria-expanded', 'false');
    expect(buttonIcon).toHaveClass('euiButtonIcon'); // EuiButtonIcon should be rendered

    // Re-render the component with the card expanded
    rerender(
      <OnboardingCardPanel {...defaultProps} isExpanded={true}>
        <div>{'Test Card Content'}</div>
      </OnboardingCardPanel>
    );

    // Check the button icon when card is expanded
    expect(buttonIcon).toHaveAttribute('aria-expanded', 'true');
  });

  describe('when badge is defined', () => {
    it('should render the badge', () => {
      render(
        <OnboardingCardPanel {...defaultProps} badge={'beta'}>
          <div>{'Test Card Content'}</div>
        </OnboardingCardPanel>,
        { wrapper: TestProviders }
      );

      expect(screen.getByTestId('onboardingCardBadge')).toBeInTheDocument();
    });
  });

  describe('when iconDark is defined', () => {
    const iconDark = 'testIconDark';

    it('should render the dark icon with the dark theme', () => {
      mockUseDarkMode.mockReturnValue(true);

      render(
        <OnboardingCardPanel {...defaultProps} iconDark={iconDark}>
          <div>{'Test Card Content'}</div>
        </OnboardingCardPanel>,
        { wrapper: TestProviders }
      );

      expect(screen.queryByTestId('EuiIcon-testIconDark')).toBeInTheDocument();
      expect(screen.queryByTestId('EuiIcon-testIcon')).not.toBeInTheDocument();
    });

    it('should not render the dark icon with the light theme', () => {
      mockUseDarkMode.mockReturnValue(false);

      render(
        <OnboardingCardPanel {...defaultProps} iconDark={iconDark}>
          <div>{'Test Card Content'}</div>
        </OnboardingCardPanel>,
        { wrapper: TestProviders }
      );

      expect(screen.queryByTestId('EuiIcon-testIconDark')).not.toBeInTheDocument();
      expect(screen.queryByTestId('EuiIcon-testIcon')).toBeInTheDocument();
    });
  });
});
