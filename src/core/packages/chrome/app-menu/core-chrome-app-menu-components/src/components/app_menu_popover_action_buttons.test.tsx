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
import { AppMenuPopoverActionButtons } from './app_menu_popover_action_buttons';
import { APP_MENU_TEST_SUBJECTS } from '../test_subjects';

describe('AppMenuPopoverActionButtons', () => {
  const primaryActionItem = {
    id: 'save',
    label: 'Save',
    run: jest.fn(),
    iconType: 'save',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return null when neither primary nor secondary action item is provided', () => {
    const { container } = render(<AppMenuPopoverActionButtons />);

    expect(container).toBeEmptyDOMElement();
  });

  it('should render container when primary action item is provided', () => {
    render(<AppMenuPopoverActionButtons primaryActionItem={primaryActionItem} />);

    expect(
      screen.getByTestId(APP_MENU_TEST_SUBJECTS.popoverActionButtonsContainer)
    ).toBeInTheDocument();
  });

  it('should render primary action button', () => {
    render(<AppMenuPopoverActionButtons primaryActionItem={primaryActionItem} />);

    expect(screen.getByText('Save')).toBeInTheDocument();
  });
});
