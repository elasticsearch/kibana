/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

import { renderWithI18n } from '@kbn/test-jest-helpers';

import { SolutionSelector } from './solution_selector';

describe('SolutionSelector', () => {
  test('renders options and calls onSolutionChange', async () => {
    const user = userEvent.setup();
    const onSolutionChange = jest.fn();

    renderWithI18n(<SolutionSelector selectedSolution="es" onSolutionChange={onSolutionChange} />);

    // Open the EuiSuperSelect popover
    await user.click(screen.getByTestId('solutionViewSwitchSelect'));
    await waitForEuiPopoverOpen();
    // Pick an option
    await user.click(await screen.findByText('Observability'));

    expect(onSolutionChange).toHaveBeenCalledWith('oblt');
  });
});
