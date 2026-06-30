/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SplitButtonWithNotification } from './split_button_with_notification';
import { APP_MENU_TEST_SUBJECTS } from '../test_subjects';

const setup = (props: Partial<React.ComponentProps<typeof SplitButtonWithNotification>> = {}) => {
  const onMainButtonClick = jest.fn();
  const onSecondaryButtonClick = jest.fn();
  const user = userEvent.setup();

  render(
    <SplitButtonWithNotification
      data-test-subj="split-button"
      label="Save"
      onClick={onMainButtonClick}
      onSecondaryButtonClick={onSecondaryButtonClick}
      secondaryButtonAriaLabel="More options"
      {...props}
    />
  );

  return { onMainButtonClick, onSecondaryButtonClick, user };
};

describe('<SplitButtonWithNotification />', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render the primary and secondary buttons', () => {
    setup();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByLabelText('More options')).toBeInTheDocument();
  });

  it('should call onClick when the primary button is clicked', async () => {
    const { onMainButtonClick, user } = setup();
    await user.click(screen.getByText('Save'));
    expect(onMainButtonClick).toHaveBeenCalledTimes(1);
    expect(onMainButtonClick).toHaveBeenCalledWith(expect.objectContaining({ type: 'click' }));
  });

  it('should call onSecondaryButtonClick when the secondary button is clicked', async () => {
    const { onSecondaryButtonClick, user } = setup();
    await user.click(screen.getByLabelText('More options'));
    expect(onSecondaryButtonClick).toHaveBeenCalledTimes(1);
  });

  it('should not show the notification indicator by default', () => {
    setup();
    expect(
      screen.queryByTestId(APP_MENU_TEST_SUBJECTS.notificationIndicator)
    ).not.toBeInTheDocument();
  });

  it('should show the notification indicator when showNotificationIndicator is true', () => {
    setup({ showNotificationIndicator: true, iconType: 'save' });
    expect(screen.getByTestId(APP_MENU_TEST_SUBJECTS.notificationIndicator)).toBeVisible();
  });

  it('should not trigger onClick via the indicator when disabled', async () => {
    const onMainButtonClick = jest.fn();
    // bypass pointer-events: none on the outer wrapper — only the inner icon is interactive
    const user = userEvent.setup({ pointerEventsCheck: 0 });

    render(
      <SplitButtonWithNotification
        label="Save"
        onClick={onMainButtonClick}
        onSecondaryButtonClick={jest.fn()}
        secondaryButtonAriaLabel="More options"
        showNotificationIndicator={true}
        iconType="save"
        isDisabled={true}
      />
    );

    const indicator = screen.getByTestId(APP_MENU_TEST_SUBJECTS.notificationIndicator);
    await user.click(indicator);
    expect(onMainButtonClick).not.toHaveBeenCalled();
  });
});
