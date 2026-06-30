/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';

import { coreMock, scopedHistoryMock } from '@kbn/core/public/mocks';

import { Providers } from './account_management_app';
import { AccountManagementPage } from './account_management_page';
import * as UserProfileImports from './user_profile/user_profile';
import { UserProfileAPIClient } from './user_profile/user_profile_api_client';
import type { UserProfileData } from '../../common';
import { mockAuthenticatedUser } from '../../common/model/authenticated_user.mock';
import { Breadcrumb } from '../components/breadcrumb';
import { UserAPIClient } from '../management';
import { securityMock } from '../mocks';

const UserProfileMock = jest
  .spyOn(UserProfileImports, 'UserProfile')
  .mockImplementation(({ user }) => (
    <Breadcrumb text={user.username}>
      <form aria-label="user profile" />
    </Breadcrumb>
  ));

describe('<AccountManagementPage>', () => {
  const coreStart = coreMock.createStart();
  // @ts-ignore Capabilities are marked as readonly without a way of overriding.
  coreStart.application.capabilities = {
    management: {
      security: {
        users: true,
      },
    },
  };
  let history = scopedHistoryMock.create();
  const authc = securityMock.createSetup().authc;

  beforeEach(() => {
    history = scopedHistoryMock.create();
    authc.getCurrentUser.mockClear();
    coreStart.http.delete.mockClear();
    coreStart.http.get.mockClear();
    coreStart.notifications.toasts.addDanger.mockClear();
    coreStart.notifications.toasts.addSuccess.mockClear();
  });

  it('should render user profile form and set breadcrumbs', async () => {
    const user = mockAuthenticatedUser();
    const data: UserProfileData = {};

    authc.getCurrentUser.mockResolvedValue(user);
    coreStart.http.get.mockResolvedValue({ user, data });

    const { findByRole } = render(
      coreStart.rendering.addContext(
        <Providers
          services={coreStart}
          history={history}
          authc={authc}
          securityApiClients={{
            userProfiles: new UserProfileAPIClient(coreStart.http),
            users: new UserAPIClient(coreStart.http),
          }}
        >
          <AccountManagementPage />
        </Providers>
      )
    );

    await findByRole('form');

    expect(UserProfileMock).toHaveBeenCalledWith({ user, data }, expect.anything());
    expect(coreStart.chrome.setBreadcrumbs).toHaveBeenLastCalledWith([
      { href: '/security/account', text: 'User settings' },
      { href: undefined, text: 'user' },
    ]);
  });
});
