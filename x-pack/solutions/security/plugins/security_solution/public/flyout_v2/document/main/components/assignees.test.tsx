/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { DataTableRecord } from '@kbn/discover-utils';
import {
  ASSIGNEES_ADD_BUTTON_TEST_ID,
  ASSIGNEES_EMPTY_TEST_ID,
  ASSIGNEES_TEST_ID,
  ASSIGNEES_TITLE_TEST_ID,
} from './test_ids';
import { Assignees } from './assignees';
import { useGetCurrentUserProfile } from '../../../../common/components/user_profiles/use_get_current_user_profile';
import { useBulkGetUserProfiles } from '../../../../common/components/user_profiles/use_bulk_get_user_profiles';
import { useSuggestUsers } from '../../../../common/components/user_profiles/use_suggest_users';
import type { SetAlertAssigneesFunc } from '../../../../common/components/toolbar/bulk_actions/use_set_alert_assignees';
import { useSetAlertAssignees } from '../../../../common/components/toolbar/bulk_actions/use_set_alert_assignees';
import { TestProviders } from '../../../../common/mock';
import { useLicense } from '../../../../common/hooks/use_license';
import { useUpsellingMessage } from '../../../../common/hooks/use_upselling';
import {
  USER_AVATAR_ITEM_TEST_ID,
  USERS_AVATARS_PANEL_TEST_ID,
} from '../../../../common/components/user_profiles/test_ids';
import { useAlertsPrivileges } from '../../../../detections/containers/detection_engine/alerts/use_alerts_privileges';

jest.mock('@elastic/eui', () => {
  const actual = jest.requireActual('@elastic/eui');

  return {
    ...actual,
    EuiPopover: ({
      button,
      children,
      isOpen,
    }: {
      button: React.ReactNode;
      children: React.ReactNode;
      isOpen: boolean;
    }) => (
      <div>
        {button}
        {isOpen ? children : null}
      </div>
    ),
    useGeneratedHtmlId: () => 'mock-search-input',
  };
});

jest.mock('../../../../common/components/assignees/assignees_apply_panel', () => ({
  AssigneesApplyPanel: ({
    onApply,
  }: {
    onApply: (assignees: { add: string[]; remove: string[] }) => void;
  }) => (
    <button
      type="button"
      data-test-subj="mock-assignees-apply-panel"
      onClick={() => onApply({ add: ['user-id-3'], remove: [] })}
    >
      {'Apply assignees'}
    </button>
  ),
}));

jest.mock('../../../../common/components/user_profiles/use_get_current_user_profile');
jest.mock('../../../../common/components/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../../common/components/user_profiles/use_suggest_users');
jest.mock('../../../../common/components/toolbar/bulk_actions/use_set_alert_assignees');
jest.mock('../../../../common/hooks/use_license');
jest.mock('../../../../common/hooks/use_upselling');
jest.mock('../../../../detections/containers/detection_engine/alerts/use_alerts_privileges');

const mockUserProfiles = [
  { uid: 'user-id-1', enabled: true, user: { username: 'user1', full_name: 'User 1' }, data: {} },
  { uid: 'user-id-2', enabled: true, user: { username: 'user2', full_name: 'User 2' }, data: {} },
  { uid: 'user-id-3', enabled: true, user: { username: 'user3', full_name: 'User 3' }, data: {} },
];

const createMockHit = (
  assignedUserIds: string[] = ['user-id-1'],
  raw: DataTableRecord['raw'] = { _id: 'event-1' }
): DataTableRecord => {
  return {
    id: 'event-1',
    raw,
    flattened: {
      'event.kind': 'signal',
      'kibana.alert.workflow_assignee_ids': assignedUserIds,
    },
    isAnchor: false,
  } as DataTableRecord;
};

const remoteAlertHit = createMockHit(['user-id-1'], {
  _id: 'event-1',
  _index: 'remote-cluster:.alerts-security.alerts-default',
});

const renderAssignees = (
  props: Partial<Parameters<typeof Assignees>[0]> = {},
  assignedUserIds: string[] = ['user-id-1']
) => {
  (useBulkGetUserProfiles as jest.Mock).mockImplementation(
    ({ uids }: { uids: Set<string> | undefined }) => ({
      isLoading: false,
      data: mockUserProfiles.filter((user) => uids?.has(user.uid)),
    })
  );

  return render(
    <TestProviders>
      <Assignees hit={createMockHit(assignedUserIds)} onAlertUpdated={jest.fn()} {...props} />
    </TestProviders>
  );
};

describe('<Assignees />', () => {
  let setAlertAssigneesMock: jest.MockedFunction<SetAlertAssigneesFunc>;

  beforeEach(() => {
    jest.clearAllMocks();
    (useGetCurrentUserProfile as jest.Mock).mockReturnValue({
      isLoading: false,
      data: mockUserProfiles[0],
    });
    (useSuggestUsers as jest.Mock).mockReturnValue({
      isLoading: false,
      data: mockUserProfiles,
    });
    (useAlertsPrivileges as jest.Mock).mockReturnValue({ hasAlertsUpdate: true });
    (useLicense as jest.Mock).mockReturnValue({ isPlatinumPlus: () => true });
    (useUpsellingMessage as jest.Mock).mockReturnValue('Go for Platinum!');

    setAlertAssigneesMock = jest.fn<
      ReturnType<SetAlertAssigneesFunc>,
      Parameters<SetAlertAssigneesFunc>
    >();
    (useSetAlertAssignees as jest.Mock).mockReturnValue(setAlertAssigneesMock);
  });

  it('renders the alert header block and assignee avatars', () => {
    const { getByTestId } = renderAssignees();

    expect(getByTestId(ASSIGNEES_TITLE_TEST_ID)).toHaveTextContent('Assignees');
    expect(getByTestId(ASSIGNEES_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(USERS_AVATARS_PANEL_TEST_ID)).toBeInTheDocument();
    expect(getByTestId(USER_AVATAR_ITEM_TEST_ID('user1'))).toBeInTheDocument();
  });

  it('renders all assignee avatars when multiple users are assigned', () => {
    const { getByTestId } = renderAssignees({}, ['user-id-1', 'user-id-2']);

    expect(getByTestId(USER_AVATAR_ITEM_TEST_ID('user1'))).toBeInTheDocument();
    expect(getByTestId(USER_AVATAR_ITEM_TEST_ID('user2'))).toBeInTheDocument();
  });

  it('applies updated assignees and calls the success callback', async () => {
    const onAlertUpdated = jest.fn();
    const { getByTestId, queryByTestId } = renderAssignees({ onAlertUpdated });

    fireEvent.click(getByTestId(ASSIGNEES_ADD_BUTTON_TEST_ID));
    fireEvent.click(getByTestId('mock-assignees-apply-panel'));

    expect(setAlertAssigneesMock).toHaveBeenCalledWith(
      {
        add: ['user-id-3'],
        remove: [],
      },
      ['event-1'],
      expect.any(Function),
      expect.any(Function)
    );

    const onSuccess = setAlertAssigneesMock.mock.calls[0][2];
    act(() => {
      onSuccess();
    });

    expect(onAlertUpdated).toHaveBeenCalled();

    await waitFor(() => {
      expect(getByTestId(USER_AVATAR_ITEM_TEST_ID('user3'))).toBeInTheDocument();
    });
    expect(queryByTestId(USER_AVATAR_ITEM_TEST_ID('user1'))).toBeInTheDocument();
  });

  it('disables the add-assignees button for a remote alert', () => {
    const { getByTestId } = renderAssignees({ hit: remoteAlertHit });

    expect(getByTestId(ASSIGNEES_ADD_BUTTON_TEST_ID)).toBeDisabled();
  });

  it('renders the empty state when assignees are hidden', () => {
    const { getByTestId, queryByTestId } = renderAssignees({ showAssignees: false });

    expect(queryByTestId(ASSIGNEES_TEST_ID)).not.toBeInTheDocument();
    expect(queryByTestId(ASSIGNEES_ADD_BUTTON_TEST_ID)).not.toBeInTheDocument();
    expect(getByTestId(ASSIGNEES_EMPTY_TEST_ID)).toHaveTextContent('—');
  });
});
