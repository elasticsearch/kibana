/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

// Test-only helpers; @testing-library is a devDependency and this filename isn't in the eslint
// dev-file allowlist.
/* eslint-disable import/no-extraneous-dependencies */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { APP_MENU_TEST_SUBJECTS } from './test_subjects';

type AppMenuUser = ReturnType<typeof userEvent.setup>;

// EUI disables pointer events on the closed popover anchor, and `userEvent` wraps clicks in `act()`
// so popover state updates don't trigger `act(...)` warnings.
const createUser = (): AppMenuUser => userEvent.setup({ pointerEventsCheck: 0, delay: null });

/**
 * Opens the app menu overflow popover (the "More" button) so its items become queryable. Defaults
 * to a fresh `userEvent` instance; pass your own when the test already has one.
 */
export const openAppMenuOverflow = async (user: AppMenuUser = createUser()): Promise<void> => {
  await user.click(await screen.findByTestId(APP_MENU_TEST_SUBJECTS.overflowButton));
};
