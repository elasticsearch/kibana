/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render } from '@testing-library/react';
import { userEvent, type UserEvent } from '@testing-library/user-event';

import { AssigneesSelectable } from './assignees_selectable';

import { useGetCurrentUserProfile } from '../user_profiles/use_get_current_user_profile';
import { useBulkGetUserProfiles } from '../user_profiles/use_bulk_get_user_profiles';
import { useSuggestUsers } from '../user_profiles/use_suggest_users';
import { TestProviders } from '../../mock';
import * as i18n from './translations';
import { mockUserProfiles } from './mocks';

jest.mock('../user_profiles/use_get_current_user_profile');
jest.mock('../user_profiles/use_bulk_get_user_profiles');
jest.mock('../user_profiles/use_suggest_users');

const renderAssigneesSelectable = (
  {
    assignedUserIds,
    showUnassignedOption,
    onSelectionChange,
  }: {
    assignedUserIds: string[];
    showUnassignedOption?: boolean;
    onSelectionChange?: () => void;
  } = { assignedUserIds: [] }
) => {
  const assignedProfiles = mockUserProfiles.filter((user) => assignedUserIds.includes(user.uid));
  (useBulkGetUserProfiles as jest.Mock).mockReturnValue({
    isLoading: false,
    data: assignedProfiles,
  });
  return render(
    <TestProviders>
      <AssigneesSelectable
        assignedUserIds={assignedUserIds}
        showUnassignedOption={showUnassignedOption}
        onSelectionChange={onSelectionChange}
      />
    </TestProviders>
  );
};

describe('<AssigneesSelectable />', () => {
  let user: UserEvent;

  beforeEach(() => {
    jest.clearAllMocks();
    // Disable pointer events check to avoid the per-event getComputedStyle ancestor walk that blows the Jest timeout under CI load
    user = userEvent.setup({ pointerEventsCheck: 0 });
    (useGetCurrentUserProfile as jest.Mock).mockReturnValue({
      isLoading: false,
      data: mockUserProfiles[0],
    });
    (useSuggestUsers as jest.Mock).mockReturnValue({
      isLoading: false,
      data: mockUserProfiles,
    });
  });

  it('should not render `no assignees` option', () => {
    const { getByTestId } = renderAssigneesSelectable({
      assignedUserIds: [],
      showUnassignedOption: false,
    });

    const assigneesList = getByTestId('euiSelectableList');
    expect(assigneesList).not.toHaveTextContent(i18n.ASSIGNEES_NO_ASSIGNEES);
  });

  it('should render `no assignees` option', () => {
    const { getByTestId } = renderAssigneesSelectable({
      assignedUserIds: [],
      showUnassignedOption: true,
    });

    const assigneesList = getByTestId('euiSelectableList');
    expect(assigneesList).toHaveTextContent(i18n.ASSIGNEES_NO_ASSIGNEES);
  });

  it('should call `onSelectionChange` on user selection', async () => {
    (useBulkGetUserProfiles as jest.Mock).mockReturnValue({
      isLoading: false,
      data: [],
    });

    const onSelectionChangeMock = jest.fn();
    const { getByText } = renderAssigneesSelectable({
      assignedUserIds: [],
      onSelectionChange: onSelectionChangeMock,
    });

    await user.click(getByText('User 1'));
    await user.click(getByText('User 2'));
    await user.click(getByText('User 3'));
    await user.click(getByText('User 3'));
    await user.click(getByText('User 2'));
    await user.click(getByText('User 1'));

    expect(onSelectionChangeMock).toHaveBeenCalledTimes(6);
    expect(onSelectionChangeMock.mock.calls).toEqual([
      [['user-id-1']],
      [['user-id-2', 'user-id-1']],
      [['user-id-3', 'user-id-2', 'user-id-1']],
      [['user-id-2', 'user-id-1']],
      [['user-id-1']],
      [[]],
    ]);
  });
});
