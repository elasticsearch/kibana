/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TestProviders } from '../../../common/mock';
import { SettingsMenu } from './settings_menu';
import { useFlyoutPushVsOverlay } from '../hooks/use_flyout_push_vs_overlay';
import {
  FLYOUT_HEADER_FLYOUT_TYPE_BUTTON_GROUP_TEST_ID,
  FLYOUT_HEADER_FLYOUT_TYPE_PUSH_OPTION_TEST_ID,
  FLYOUT_HEADER_FLYOUT_TYPE_TITLE_TEST_ID,
  FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID,
} from './test_ids';

jest.mock('../hooks/use_flyout_push_vs_overlay');

const mockSetType = jest.fn();

const renderSettingsMenu = () =>
  render(
    <TestProviders>
      <SettingsMenu />
    </TestProviders>
  );

describe('SettingsMenu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useFlyoutPushVsOverlay as jest.Mock).mockReturnValue({
      type: 'overlay',
      setType: mockSetType,
    });
  });

  it('renders the gear button', () => {
    const { getByTestId } = renderSettingsMenu();

    expect(getByTestId(FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID)).toBeInTheDocument();
  });

  it('opens the flyout-type toggle in a popover when the gear is clicked', async () => {
    const { getByTestId, queryByTestId } = renderSettingsMenu();

    expect(queryByTestId(FLYOUT_HEADER_FLYOUT_TYPE_BUTTON_GROUP_TEST_ID)).not.toBeInTheDocument();

    await userEvent.click(getByTestId(FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID));

    expect(getByTestId(FLYOUT_HEADER_FLYOUT_TYPE_TITLE_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(FLYOUT_HEADER_FLYOUT_TYPE_BUTTON_GROUP_TEST_ID)).toBeInTheDocument();
  });

  it('reflects the current type in the button group', async () => {
    (useFlyoutPushVsOverlay as jest.Mock).mockReturnValue({ type: 'push', setType: mockSetType });
    const { getByTestId } = renderSettingsMenu();

    await userEvent.click(getByTestId(FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID));

    // EUI marks the selected single-select button with this class.
    expect(getByTestId(FLYOUT_HEADER_FLYOUT_TYPE_PUSH_OPTION_TEST_ID)).toHaveClass(
      'euiButtonGroupButton-isSelected'
    );
  });

  it('calls setType with the selected mode when an option is clicked', async () => {
    const { getByTestId } = renderSettingsMenu();

    await userEvent.click(getByTestId(FLYOUT_HEADER_SETTINGS_BUTTON_TEST_ID));
    await userEvent.click(getByTestId(FLYOUT_HEADER_FLYOUT_TYPE_PUSH_OPTION_TEST_ID));

    expect(mockSetType).toHaveBeenCalledWith('push');
  });
});
