/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import useObservable from 'react-use/lib/useObservable';
import { BehaviorSubject } from 'rxjs';

import { I18nProvider } from '@kbn/i18n-react';

import { SecurityNavControl } from './nav_control_component';
import { mockAuthenticatedUser } from '../../common/model/authenticated_user.mock';
import { userProfileMock } from '../../common/model/user_profile.mock';
import * as UseCurrentUserImports from '../components/use_current_user';

jest.mock('../components/use_current_user');
jest.mock('react-use/lib/useObservable');

const useObservableMock = useObservable as jest.Mock;
const useUserProfileMock = jest.spyOn(UseCurrentUserImports, 'useUserProfile');
const useCurrentUserMock = jest.spyOn(UseCurrentUserImports, 'useCurrentUser');

const userProfileWithSecurity = userProfileMock.createWithSecurity();
const userProfile = {
  ...userProfileWithSecurity,
  user: {
    ...userProfileWithSecurity.user,
    authentication_provider: { type: 'basic', name: 'basic1' },
  },
};
const userMenuLinks$ = new BehaviorSubject([]);

const renderWithIntl = (ui: React.ReactElement) => render(<I18nProvider>{ui}</I18nProvider>);

describe('SecurityNavControl', () => {
  beforeEach(() => {
    useUserProfileMock.mockReset();
    useUserProfileMock.mockReturnValue({
      loading: false,
      value: userProfile,
    });

    useCurrentUserMock.mockReset();
    useCurrentUserMock.mockReturnValue({
      loading: false,
      value: mockAuthenticatedUser(),
    });

    useObservableMock.mockReset();
    useObservableMock.mockImplementation(
      (observable: BehaviorSubject<any>, initialValue = {}) => observable.value ?? initialValue
    );
  });

  it('should render an avatar when user profile has loaded', async () => {
    renderWithIntl(
      <SecurityNavControl editProfileUrl="" logoutUrl="" userMenuLinks$={userMenuLinks$} />
    );

    expect(useUserProfileMock).toHaveBeenCalledTimes(1);
    expect(useCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('userMenuButton')).toMatchInlineSnapshot(`
      <button
        aria-expanded="false"
        aria-haspopup="true"
        aria-label="Account menu"
        class="euiButtonEmpty euiHeaderSectionItemButton emotion-euiButtonDisplay-euiButtonEmpty-m-empty-text-euiHeaderSectionItemButton"
        data-test-subj="userMenuButton"
        style="line-height: normal;"
        type="button"
      >
        <span
          class="euiButtonEmpty__content emotion-euiButtonDisplayContent"
        >
          <span
            class="eui-textTruncate euiButtonEmpty__text css-13ifi6d-m"
          >
            <span
              class="euiHeaderSectionItemButton__content emotion-euiHeaderSectionItemButton__content"
            >
              <span
                class="euiToolTipAnchor emotion-euiToolTipAnchor-inlineBlock-user"
                id="generated-id_euiToolTipAnchor"
              >
                <div
                  aria-label="some@email"
                  class="euiAvatar euiAvatar--s euiAvatar--user emotion-euiAvatar-user-s-uppercase"
                  data-test-subj="userMenuAvatar"
                  role="img"
                  style="background-color: rgb(255, 199, 219); color: rgb(0, 0, 0);"
                >
                  <span
                    aria-hidden="true"
                  >
                    s
                  </span>
                </div>
              </span>
            </span>
          </span>
        </span>
      </button>
    `);
  });

  it('should render a spinner while loading', () => {
    useUserProfileMock.mockReturnValue({
      loading: true,
    });
    useCurrentUserMock.mockReturnValue({
      loading: true,
    });

    renderWithIntl(
      <SecurityNavControl editProfileUrl="" logoutUrl="" userMenuLinks$={userMenuLinks$} />
    );

    expect(useUserProfileMock).toHaveBeenCalledTimes(1);
    expect(useCurrentUserMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('userMenuButton')).toMatchInlineSnapshot(`
      <button
        aria-expanded="false"
        aria-haspopup="true"
        aria-label="Account menu"
        class="euiButtonEmpty euiHeaderSectionItemButton emotion-euiButtonDisplay-euiButtonEmpty-m-empty-text-euiHeaderSectionItemButton"
        data-test-subj="userMenuButton"
        style="line-height: normal;"
        type="button"
      >
        <span
          class="euiButtonEmpty__content emotion-euiButtonDisplayContent"
        >
          <span
            class="eui-textTruncate euiButtonEmpty__text css-13ifi6d-m"
          >
            <span
              class="euiHeaderSectionItemButton__content emotion-euiHeaderSectionItemButton__content"
            >
              <span
                aria-label="Loading"
                class="euiLoadingSpinner emotion-euiLoadingSpinner-m"
                role="progressbar"
              />
            </span>
          </span>
        </span>
      </button>
    `);
  });

  it('should open popover when avatar is clicked', async () => {
    renderWithIntl(
      <SecurityNavControl editProfileUrl="" logoutUrl="" userMenuLinks$={userMenuLinks$} />
    );

    fireEvent.click(screen.getByTestId('userMenuButton'));
    await waitFor(() => {
      expect(screen.getByTestId('logoutLink')).toBeInTheDocument();
    });
  });

  it('should not open popover while loading', () => {
    useUserProfileMock.mockReturnValue({
      loading: true,
    });
    useCurrentUserMock.mockReturnValue({
      loading: true,
    });

    renderWithIntl(
      <SecurityNavControl editProfileUrl="" logoutUrl="" userMenuLinks$={userMenuLinks$} />
    );

    fireEvent.click(screen.getByTestId('userMenuButton'));
    expect(screen.queryByTestId('logoutLink')).not.toBeInTheDocument();
  });

  it('should render additional user menu links registered by other plugins and should render the default Edit Profile link as the first link when no custom profile link is provided', async () => {
    const DummyComponent = <div>Dummy Component</div>;

    renderWithIntl(
      <SecurityNavControl
        editProfileUrl="edit-profile-link"
        logoutUrl=""
        userMenuLinks$={
          new BehaviorSubject([
            { label: 'link1', href: 'path-to-link-1', iconType: 'empty', order: 1 },
            { label: 'link2', href: 'path-to-link-2', iconType: 'empty', order: 2 },
            { label: 'link3', href: 'path-to-link-3', iconType: 'empty', order: 3 },
            {
              label: 'dummyComponent',
              href: '',
              iconType: 'empty',
              order: 4,
              content: DummyComponent,
            },
          ])
        }
      />
    );

    fireEvent.click(screen.getByTestId('userMenuButton'));

    expect(screen.getByTestId('userMenu')).toMatchInlineSnapshot(`
      <div
        class="euiContextMenu chrNavControl__userMenu emotion-euiContextMenu"
        data-test-subj="userMenu"
        style="height: 0px;"
      >
        <div
          class="euiContextMenuPanel emotion-euiContextMenuPanel-euiContextMenu__panel"
          tabindex="-1"
        >
          <div
            class="euiContextMenuPanelTitle euiContextMenuPanel__title emotion-euiContextMenuPanelTitle"
            data-test-subj="contextMenuPanelTitle"
          >
            <h2
              class="euiContextMenuPanelTitle__text css-8u7lys-text"
              id="generated-id_euiContextMenuPanelTitle"
            >
              full name
            </h2>
          </div>
          <div
            aria-labelledby="generated-id_euiContextMenuPanelTitle"
            class="euiContextMenuPanel__list"
          >
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="profileLink"
              href="edit-profile-link"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="user"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  Edit profile
                </span>
              </span>
            </a>
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link1"
              href="path-to-link-1"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link1
                </span>
              </span>
            </a>
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link2"
              href="path-to-link-2"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link2
                </span>
              </span>
            </a>
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link3"
              href="path-to-link-3"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link3
                </span>
              </span>
            </a>
            <div>
              Dummy Component
            </div>
            <div
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-euiContextMenuItem-center"
              data-test-subj="logoutLink"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="logOut"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  Log out
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `);
  });

  it('should render custom profile link registered by other plugins and not render default Edit Profile link', async () => {
    renderWithIntl(
      <SecurityNavControl
        editProfileUrl="edit-profile-link"
        logoutUrl=""
        userMenuLinks$={
          new BehaviorSubject([
            { label: 'link1', href: 'path-to-link-1', iconType: 'empty', order: 1 },
            { label: 'link2', href: 'path-to-link-2', iconType: 'empty', order: 2 },
            {
              label: 'link3',
              href: 'path-to-link-3',
              iconType: 'empty',
              order: 3,
              setAsProfile: true,
            },
          ])
        }
      />
    );

    fireEvent.click(screen.getByTestId('userMenuButton'));

    expect(screen.getByTestId('userMenu')).toMatchInlineSnapshot(`
      <div
        class="euiContextMenu chrNavControl__userMenu emotion-euiContextMenu"
        data-test-subj="userMenu"
        style="height: 0px;"
      >
        <div
          class="euiContextMenuPanel emotion-euiContextMenuPanel-euiContextMenu__panel"
          tabindex="-1"
        >
          <div
            class="euiContextMenuPanelTitle euiContextMenuPanel__title emotion-euiContextMenuPanelTitle"
            data-test-subj="contextMenuPanelTitle"
          >
            <h2
              class="euiContextMenuPanelTitle__text css-8u7lys-text"
              id="generated-id_euiContextMenuPanelTitle"
            >
              full name
            </h2>
          </div>
          <div
            aria-labelledby="generated-id_euiContextMenuPanelTitle"
            class="euiContextMenuPanel__list"
          >
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link1"
              href="path-to-link-1"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link1
                </span>
              </span>
            </a>
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link2"
              href="path-to-link-2"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link2
                </span>
              </span>
            </a>
            <a
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-isInteractive-euiContextMenuItem-center"
              data-test-subj="userMenuLink__link3"
              href="path-to-link-3"
              rel="noreferrer"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="empty"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  link3
                </span>
              </span>
            </a>
            <div
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-euiContextMenuItem-center"
              data-test-subj="logoutLink"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="logOut"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  Log out
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `);
  });

  it('should render anonymous user', async () => {
    useUserProfileMock.mockReturnValue({
      loading: false,
      value: undefined,
      error: new Error('404'),
    });

    useCurrentUserMock.mockReturnValue({
      loading: false,
      value: mockAuthenticatedUser({
        authentication_provider: { type: 'anonymous', name: 'does no matter' },
      }),
    });

    renderWithIntl(
      <SecurityNavControl editProfileUrl="" logoutUrl="" userMenuLinks$={userMenuLinks$} />
    );

    fireEvent.click(screen.getByTestId('userMenuButton'));

    expect(screen.getByTestId('userMenu')).toMatchInlineSnapshot(`
      <div
        class="euiContextMenu chrNavControl__userMenu emotion-euiContextMenu"
        data-test-subj="userMenu"
        style="height: 0px;"
      >
        <div
          class="euiContextMenuPanel emotion-euiContextMenuPanel-euiContextMenu__panel"
          tabindex="-1"
        >
          <div
            class="euiContextMenuPanelTitle euiContextMenuPanel__title emotion-euiContextMenuPanelTitle"
            data-test-subj="contextMenuPanelTitle"
          >
            <h2
              class="euiContextMenuPanelTitle__text css-8u7lys-text"
              id="generated-id_euiContextMenuPanelTitle"
            >
              full name
            </h2>
          </div>
          <div
            aria-labelledby="generated-id_euiContextMenuPanelTitle"
            class="euiContextMenuPanel__list"
          >
            <div
              class="euiListItemLayout euiContextMenuItem emotion-euiListItemLayout-euiContextMenuItem-center"
              data-test-subj="logoutLink"
            >
              <span
                class="euiListItemLayout__content emotion-euiListItemLayout__content"
              >
                <span
                  class="euiListItemLayout__prepend emotion-euiListItemLayout__prepend"
                >
                  <span
                    aria-hidden="true"
                    class="emotion-euiContextMenu__icon"
                    data-euiicon-type="logOut"
                  />
                </span>
                <span
                  class="euiListItemLayout__text euiContextMenuItem__text emotion-euiListItemLayout__text-wrap-euiContextMenuItem__text"
                >
                  Log in
                </span>
              </span>
            </div>
          </div>
        </div>
      </div>
    `);
  });
});
