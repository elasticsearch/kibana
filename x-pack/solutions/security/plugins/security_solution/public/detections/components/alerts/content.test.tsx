/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { UserProfileWithAvatar } from '@kbn/user-profile-components';
import { TestProviders } from '../../../common/mock';
import { AlertsPageContent, SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID } from './content';
import type { DataView } from '@kbn/data-views-plugin/common';
import { createStubDataView } from '@kbn/data-views-plugin/common/data_views/data_view.stub';
import { GO_TO_RULES_BUTTON_TEST_ID } from './header/header_section';
import { FILTER_BY_ASSIGNEES_BUTTON } from '../../../common/components/filter_by_assignees_popover/test_ids';
import { useUserPrivileges } from '../../../common/components/user_privileges';
import { getUserPrivilegesMockDefaultValue } from '../../../common/components/user_privileges/__mocks__';
import { useLicense } from '../../../common/hooks/use_license';
import { useGetCurrentUserProfile } from '../../../common/components/user_profiles/use_get_current_user_profile';
import { useBulkGetUserProfiles } from '../../../common/components/user_profiles/use_bulk_get_user_profiles';
import { useSuggestUsers } from '../../../common/components/user_profiles/use_suggest_users';

jest.mock('../../../common/components/user_privileges');
jest.mock('../../../common/hooks/use_license');
jest.mock('../../../common/components/user_profiles/use_get_current_user_profile');
jest.mock('../../../common/components/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../common/components/user_profiles/use_suggest_users');

const mockUseUserPrivileges = useUserPrivileges as jest.Mock;

const currentUser: UserProfileWithAvatar = {
  uid: 'uid1',
  enabled: true,
  user: {
    username: 'current.user',
    email: 'current.user@elastic.co',
    full_name: 'Current User',
  },
  data: {},
};
const user: UserProfileWithAvatar = {
  uid: 'uid2',
  enabled: true,
  user: {
    username: 'jon.doe',
    email: 'jon.do@elastic.co',
    full_name: 'John Doe',
  },
  data: {},
};

const noProfiles: UserProfileWithAvatar[] = [];
const selectedProfiles: UserProfileWithAvatar[] = [user];

const dataView: DataView = createStubDataView({ spec: {} });

describe('AlertsPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useLicense as jest.Mock).mockReturnValue({ isPlatinumPlus: () => true });
    // Stable references per uid set, mirroring the memoized react-query hook, so the sync effect in `AssigneesSelectable` doesn't loop.
    (useBulkGetUserProfiles as jest.Mock).mockImplementation(({ uids }: { uids: Set<string> }) => ({
      isLoading: false,
      data: uids.has(user.uid) ? selectedProfiles : noProfiles,
    }));
    mockUseUserPrivileges.mockReturnValue(
      getUserPrivilegesMockDefaultValue({
        rulesPrivileges: {
          ...getUserPrivilegesMockDefaultValue().rulesPrivileges,
          rules: {
            read: true,
            edit: false,
          },
          exceptions: {
            read: false,
            edit: false,
          },
        },
      })
    );
  });

  it('should render correctly', async () => {
    render(
      <TestProviders>
        <AlertsPageContent dataView={dataView} />
      </TestProviders>
    );

    await waitFor(() => {
      expect(screen.getByTestId(SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId('header-page-title')).toHaveTextContent('Alerts');
      expect(screen.getByTestId(FILTER_BY_ASSIGNEES_BUTTON)).toBeInTheDocument();
      expect(screen.getByTestId(GO_TO_RULES_BUTTON_TEST_ID)).toBeInTheDocument();
      expect(screen.getByTestId('chartPanels')).toBeInTheDocument();
    });
  });

  it('should set the assignees when selecting a user', async () => {
    (useGetCurrentUserProfile as jest.Mock).mockReturnValue({
      data: user,
    });
    (useSuggestUsers as jest.Mock).mockReturnValue({
      isLoading: false,
      data: [currentUser, user],
    });

    render(
      <TestProviders>
        <AlertsPageContent dataView={dataView} />
      </TestProviders>
    );

    fireEvent.click(screen.getByTestId(FILTER_BY_ASSIGNEES_BUTTON));

    await waitFor(() => {
      expect(
        screen.getByTestId(`userProfileSelectableOption-${user.user.username}`)
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId(`userProfileSelectableOption-${user.user.username}`));

    await waitFor(() => {
      expect(
        screen.getByTestId(`userProfileSelectableOption-${user.user.username}`)
      ).toHaveAttribute('aria-checked', 'true');
    });
  }, 15000);

  describe('when the user has no rules privileges', () => {
    beforeEach(() => {
      mockUseUserPrivileges.mockReturnValue(
        getUserPrivilegesMockDefaultValue({
          rulesPrivileges: {
            ...getUserPrivilegesMockDefaultValue().rulesPrivileges,
            rules: {
              read: false,
              edit: false,
            },
            exceptions: {
              read: false,
              edit: false,
            },
          },
        })
      );
    });

    it('renders the page content without the Go to Rules button', async () => {
      render(
        <TestProviders>
          <AlertsPageContent dataView={dataView} />
        </TestProviders>
      );

      await waitFor(() => {
        expect(screen.getByTestId(SECURITY_SOLUTION_PAGE_WRAPPER_TEST_ID)).toBeInTheDocument();
        expect(screen.getByTestId('header-page-title')).toHaveTextContent('Alerts');
        expect(screen.getByTestId(FILTER_BY_ASSIGNEES_BUTTON)).toBeInTheDocument();
        expect(screen.queryByTestId(GO_TO_RULES_BUTTON_TEST_ID)).not.toBeInTheDocument();
        expect(screen.getByTestId('chartPanels')).toBeInTheDocument();
      });
    });
  });
});
