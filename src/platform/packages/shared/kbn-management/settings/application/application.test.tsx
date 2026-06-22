/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { of } from 'rxjs';
import {
  SettingsApplication,
  DATA_TEST_SUBJ_SETTINGS_TITLE,
  SPACE_SETTINGS_TAB_ID,
  GLOBAL_SETTINGS_TAB_ID,
} from './application';
import { DATA_TEST_SUBJ_SETTINGS_SEARCH_BAR } from './query_input';
import {
  DATA_TEST_SUBJ_SETTINGS_EMPTY_STATE,
  DATA_TEST_SUBJ_SETTINGS_CLEAR_SEARCH_LINK,
} from './empty_state';
import { DATA_TEST_SUBJ_PREFIX_TAB } from './tab';
import { DATA_TEST_SUBJ_SETTINGS_CATEGORY } from '@kbn/management-settings-components-field-category/category';
import { wrap, createSettingsApplicationServicesMock } from './mocks';
import type { SettingsApplicationServices } from './services';
import { SettingsApplicationKibanaProvider } from './services';
import { KibanaRootContextProvider } from '@kbn/react-kibana-context-root';
import { userProfileServiceMock } from '@kbn/core-user-profile-browser-mocks';
import type { Space } from '@kbn/spaces-plugin/common';
import {
  analyticsServiceMock,
  applicationServiceMock,
  chromeServiceMock,
  docLinksServiceMock,
  i18nServiceMock,
  notificationServiceMock,
  scopedHistoryMock,
  themeServiceMock,
  uiSettingsServiceMock,
} from '@kbn/core/public/mocks';

const spaceCategories = ['general', 'dashboard', 'notifications'];
const globalCategories = ['custom branding'];

const createRootMock = () => {
  return {
    analytics: analyticsServiceMock.createAnalyticsServiceStart(),
    i18n: i18nServiceMock.createStartContract(),
    theme: themeServiceMock.createStartContract(),
    userProfile: userProfileServiceMock.createStart(),
  };
};

describe('Settings application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders without errors', () => {
    const { container, getByTestId } = render(wrap(<SettingsApplication />));

    expect(container).toBeInTheDocument();
    expect(getByTestId(DATA_TEST_SUBJ_SETTINGS_TITLE)).toBeInTheDocument();
    expect(getByTestId(DATA_TEST_SUBJ_SETTINGS_SEARCH_BAR)).toBeInTheDocument();
    // Verify that all category panels are rendered
    for (const category of spaceCategories) {
      expect(getByTestId(`${DATA_TEST_SUBJ_SETTINGS_CATEGORY}-${category}`)).toBeInTheDocument();
    }
  });

  it('replaces history while typing so browser back does not step through each character', async () => {
    const history = scopedHistoryMock.create({ pathname: '', search: '' });
    const activeSpace: Space = {
      id: 'default',
      name: 'Default',
      disabledFeatures: [],
      solution: 'classic',
    };
    const application = applicationServiceMock.createStartContract();
    application.capabilities = {
      advancedSettings: { show: true, save: true },
      globalSettings: { show: true, save: true },
      filterSettings: { bySolutionView: false },
    } as any;

    const { getByTestId } = render(
      <KibanaRootContextProvider {...createRootMock()}>
        <SettingsApplicationKibanaProvider
          docLinks={docLinksServiceMock.createStartContract()}
          notifications={{ toasts: notificationServiceMock.createStartContract().toasts }}
          userProfile={userProfileServiceMock.createStart()}
          theme={themeServiceMock.createStartContract()}
          i18n={i18nServiceMock.createStartContract()}
          settings={{
            client: uiSettingsServiceMock.createStartContract(),
            globalClient: uiSettingsServiceMock.createStartContract(),
            metadata: { getAll: jest.fn().mockResolvedValue({}) },
          }}
          history={history}
          sectionRegistry={{
            getSpacesSections: () => [],
            getGlobalSections: () => [],
          }}
          application={application}
          chrome={chromeServiceMock.createStartContract()}
          spaces={{
            getActiveSpace: () => Promise.resolve(activeSpace),
            getActiveSpace$: () => of(activeSpace),
          }}
        >
          <SettingsApplication />
        </SettingsApplicationKibanaProvider>
      </KibanaRootContextProvider>
    );

    const searchBar = getByTestId(DATA_TEST_SUBJ_SETTINGS_SEARCH_BAR);

    // Simulate typing characters one at a time, as a user would.
    const valuesByKeystroke = ['t', 'te', 'tes', 'test'];
    for (const value of valuesByKeystroke) {
      act(() => {
        fireEvent.change(searchBar, { target: { value } });
      });
    }

    await waitFor(() => {
      expect(history.push).not.toHaveBeenCalled();
      expect(history.replace).toHaveBeenCalledTimes(valuesByKeystroke.length);
      expect(history.replace).toHaveBeenNthCalledWith(1, { pathname: '', search: '?query=t' });
      expect(history.replace).toHaveBeenNthCalledWith(2, { pathname: '', search: '?query=te' });
      expect(history.replace).toHaveBeenNthCalledWith(3, { pathname: '', search: '?query=tes' });
      expect(history.replace).toHaveBeenNthCalledWith(4, { pathname: '', search: '?query=test' });
    });
  });

  it('renders the empty state when no settings match the query', async () => {
    const { getByTestId } = render(wrap(<SettingsApplication />));

    const searchBar = getByTestId(DATA_TEST_SUBJ_SETTINGS_SEARCH_BAR);
    act(() => {
      fireEvent.change(searchBar, { target: { value: 'some-random-text' } });
    });

    expect(getByTestId(DATA_TEST_SUBJ_SETTINGS_EMPTY_STATE)).toBeInTheDocument();

    // Clicking the "clear search" link should return the form back
    const clearSearchLink = getByTestId(DATA_TEST_SUBJ_SETTINGS_CLEAR_SEARCH_LINK);
    act(() => {
      fireEvent.click(clearSearchLink);
    });

    for (const category of spaceCategories) {
      expect(getByTestId(`${DATA_TEST_SUBJ_SETTINGS_CATEGORY}-${category}`)).toBeInTheDocument();
    }
  });

  it("doesn't render settings that are not applicable in the current solution", async () => {
    const services: SettingsApplicationServices = createSettingsApplicationServicesMock(
      undefined,
      ['classic', 'es'],
      'security'
    );

    const { findByTestId } = render(wrap(<SettingsApplication />, services));

    // The empty state should be rendered since all settings are for es solution and current space solution is security
    expect(findByTestId(DATA_TEST_SUBJ_SETTINGS_EMPTY_STATE)).toBeTruthy();
  });

  it('renders settings that are applicable in the current solution', async () => {
    const services: SettingsApplicationServices = createSettingsApplicationServicesMock(
      undefined,
      ['classic', 'oblt'],
      'oblt'
    );

    const { getByTestId } = render(wrap(<SettingsApplication />, services));

    // The form should be rendered
    for (const category of spaceCategories) {
      expect(getByTestId(`${DATA_TEST_SUBJ_SETTINGS_CATEGORY}-${category}`)).toBeInTheDocument();
    }
  });

  describe('Tabs', () => {
    const spaceSettingsTestSubj = `${DATA_TEST_SUBJ_PREFIX_TAB}-${SPACE_SETTINGS_TAB_ID}`;
    const globalSettingsTestSubj = `${DATA_TEST_SUBJ_PREFIX_TAB}-${GLOBAL_SETTINGS_TAB_ID}`;

    it("doesn't render tabs when there are no global settings", () => {
      const services: SettingsApplicationServices = createSettingsApplicationServicesMock(false);

      const { container, queryByTestId } = render(wrap(<SettingsApplication />, services));

      expect(container).toBeInTheDocument();
      expect(queryByTestId(spaceSettingsTestSubj)).toBeNull();
      expect(queryByTestId(globalSettingsTestSubj)).toBeNull();
    });

    it('renders tabs when global settings are enabled', () => {
      const services: SettingsApplicationServices = createSettingsApplicationServicesMock(true);

      const { container, getByTestId } = render(wrap(<SettingsApplication />, services));

      expect(container).toBeInTheDocument();
      expect(getByTestId(spaceSettingsTestSubj)).toBeInTheDocument();
      expect(getByTestId(globalSettingsTestSubj)).toBeInTheDocument();
    });

    it('can switch between tabs', () => {
      const services: SettingsApplicationServices = createSettingsApplicationServicesMock(true);

      const { getByTestId } = render(wrap(<SettingsApplication />, services));

      const spaceTab = getByTestId(spaceSettingsTestSubj);
      const globalTab = getByTestId(globalSettingsTestSubj);

      // Initially the Space tab should be selected
      expect(spaceTab.className).toContain('selected');
      expect(globalTab.className).not.toContain('selected');

      act(() => {
        fireEvent.click(globalTab);
      });

      expect(spaceTab.className).not.toContain('selected');
      expect(globalTab.className).toContain('selected');

      // Should render the page correctly with the Global tab selected
      expect(getByTestId(DATA_TEST_SUBJ_SETTINGS_TITLE)).toBeInTheDocument();
      expect(getByTestId(DATA_TEST_SUBJ_SETTINGS_SEARCH_BAR)).toBeInTheDocument();
      // Verify that all category panels are rendered
      for (const category of globalCategories) {
        expect(getByTestId(`${DATA_TEST_SUBJ_SETTINGS_CATEGORY}-${category}`)).toBeInTheDocument();
      }
    });
  });
});
