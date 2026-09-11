/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps } from 'react';
import React, { useContext, useEffect } from 'react';
import { renderWithKibanaRenderContext } from '@kbn/test-jest-helpers';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { dataViewMock } from '@kbn/discover-utils/src/__mocks__';
import type { DiscoverTopNavProps } from './discover_topnav';
import { DiscoverTopNav } from './discover_topnav';
import { createDiscoverServicesMock } from '../../../../__mocks__/services';
import {
  getDiscoverInternalStateMock,
  type InternalStateMockToolkit,
} from '../../../../__mocks__/discover_state.mock';
import type { SearchBarCustomization } from '../../../../customizations';
import type { DiscoverCustomizationId } from '../../../../customizations/customization_service';
import { useDiscoverCustomization } from '../../../../customizations';
import { internalStateActions } from '../../state_management/redux';
import { DiscoverToolkitTestProvider } from '../../../../__mocks__/test_provider';
import { DiscoverTopNavMenuProvider, discoverTopNavMenuContext } from './discover_topnav_menu';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import { FetchStatus } from '../../../types';

let mockDiscoverService = createDiscoverServicesMock();
type AggregateQueryTopNavMenuProps = ComponentProps<
  typeof mockDiscoverService.navigation.ui.AggregateQueryTopNavMenu
>;

const MockAggregateQueryTopNavMenu = (props: AggregateQueryTopNavMenuProps) => {
  const { dataViewPickerComponentProps, dataViewPickerOverride, onQuerySubmit } = props;

  return (
    <div
      data-test-subj="aggregate-query-top-nav-menu"
      data-has-data-view-picker-component-props={String(Boolean(dataViewPickerComponentProps))}
      data-has-data-view-picker-override={String(Boolean(dataViewPickerOverride))}
    >
      {dataViewPickerOverride}
      <button
        data-test-subj="mock-query-submit"
        onClick={() =>
          onQuerySubmit?.(
            {
              dateRange: { from: 'now-15m', to: 'now' },
              query: { esql: 'FROM test' },
            },
            true
          )
        }
      >
        Submit
      </button>
    </div>
  );
};

const MockCustomSearchBar: typeof mockDiscoverService.navigation.ui.AggregateQueryTopNavMenu =
  () => <div data-test-subj="custom-search-bar" />;

const mockSearchBarCustomization: SearchBarCustomization = {
  id: 'search_bar',
  CustomDataViewPicker: jest.fn(() => <div data-test-subj="custom-data-view-picker" />),
};

const mockSearchBarCustomizationWithCustomSearchBar: SearchBarCustomization = {
  id: 'search_bar',
  CustomSearchBar: MockCustomSearchBar,
};

const mockSearchBarCustomizationWithHiddenDataViewPicker: SearchBarCustomization = {
  id: 'search_bar',
  hideDataViewPicker: true,
};

let mockUseCustomizations = false;

jest.mock('../../../../customizations', () => ({
  ...jest.requireActual('../../../../customizations'),
  useDiscoverCustomization: jest.fn(),
}));

const mockDefaultCapabilities = {
  discover_v2: { save: true },
} as unknown as typeof mockDiscoverService.capabilities;

async function setup(
  {
    capabilities,
  }: {
    capabilities?: Partial<typeof mockDiscoverService.capabilities>;
  } = { capabilities: mockDefaultCapabilities }
) {
  mockDiscoverService = createDiscoverServicesMock();
  if (capabilities) {
    mockDiscoverService.capabilities = capabilities as typeof mockDiscoverService.capabilities;
  }
  mockDiscoverService.navigation.ui.AggregateQueryTopNavMenu = MockAggregateQueryTopNavMenu;

  const toolkit = getDiscoverInternalStateMock({
    services: mockDiscoverService,
    persistedDataViews: [dataViewMock],
  });

  await toolkit.initializeTabs();
  await toolkit.initializeSingleTab({ tabId: toolkit.getCurrentTab().id });

  toolkit.internalState.dispatch(
    internalStateActions.setDataView({
      tabId: toolkit.getCurrentTab().id,
      dataView: dataViewMock,
    })
  );

  const props: DiscoverTopNavProps = {
    savedQuery: '',
    onFieldEdited: jest.fn(),
  };

  return { toolkit, props };
}

// Helper component to capture the topNavMenu from context
let capturedTopNavMenu: AppMenuConfig | undefined;
const TopNavMenuCapture = () => {
  const { topNavMenu$ } = useContext(discoverTopNavMenuContext);

  useEffect(() => {
    const subscription = topNavMenu$.subscribe((menu) => {
      capturedTopNavMenu = menu;
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [topNavMenu$]);

  return null;
};

const renderTestComponent = ({
  toolkit,
  props,
}: {
  toolkit: InternalStateMockToolkit;
  props: DiscoverTopNavProps;
}) =>
  renderWithKibanaRenderContext(
    <DiscoverToolkitTestProvider toolkit={toolkit}>
      <DiscoverTopNavMenuProvider customizationContext={toolkit.customizationContext}>
        <TopNavMenuCapture />
        <DiscoverTopNav {...props} />
      </DiscoverTopNavMenuProvider>
    </DiscoverToolkitTestProvider>
  );

describe('Discover topnav component', () => {
  beforeEach(() => {
    mockUseCustomizations = false;
    capturedTopNavMenu = undefined;
    jest.clearAllMocks();

    (useDiscoverCustomization as jest.Mock).mockImplementation((id: DiscoverCustomizationId) => {
      if (!mockUseCustomizations) {
        return undefined;
      }

      switch (id) {
        case 'search_bar':
          return mockSearchBarCustomization;
        default:
          throw new Error(`Unknown customization id: ${id}`);
      }
    });
  });

  test('generated config of AppMenuConfig is correct when discover save permissions are assigned', async () => {
    const { toolkit, props } = await setup({ capabilities: { discover_v2: { save: true } } });
    renderTestComponent({ toolkit, props });

    await waitFor(() => {
      expect(capturedTopNavMenu).toBeDefined();
    });

    const itemIds = capturedTopNavMenu?.items?.map((item) => item.id) || [];
    expect(itemIds).toEqual(['new', 'open', 'inspect']);
    expect(capturedTopNavMenu?.primaryActionItem?.id).toBe('save');
  });

  test('generated config of AppMenuConfig is correct when no discover save permissions are assigned', async () => {
    const { toolkit, props } = await setup({ capabilities: { discover_v2: { save: false } } });
    renderTestComponent({ toolkit, props });

    await waitFor(() => {
      expect(capturedTopNavMenu).toBeDefined();
    });

    const itemIds = capturedTopNavMenu?.items?.map((item) => item.id) || [];
    expect(itemIds).toEqual(['new', 'open', 'inspect']);
    expect(capturedTopNavMenu?.primaryActionItem).toBeUndefined();
  });

  test.each([
    {
      description: 'closes query history for an uninitialized ES|QL tab',
      fetchStatus: FetchStatus.UNINITIALIZED,
      expectedIsHistoryOpen: false,
    },
    {
      description: 'keeps manually opened query history for an initialized tab',
      fetchStatus: FetchStatus.COMPLETE,
      expectedIsHistoryOpen: true,
    },
  ])('$description', async ({ fetchStatus, expectedIsHistoryOpen }) => {
    const user = userEvent.setup();
    const { toolkit, props } = await setup();
    const tabId = toolkit.getCurrentTab().id;
    const query = { esql: 'FROM test' };

    toolkit.internalState.dispatch(
      internalStateActions.updateAppState({ tabId, appState: { query } })
    );
    toolkit.internalState.dispatch(
      internalStateActions.setESQLEditorUiState({
        tabId,
        esqlEditorUiState: { isHistoryOpen: true },
      })
    );
    toolkit.getCurrentTabDataStateContainer().data$.main$.next({ fetchStatus });

    renderTestComponent({ toolkit, props });
    await user.click(screen.getByTestId('mock-query-submit'));

    expect(toolkit.getCurrentTab().uiState.esqlEditor?.isHistoryOpen).toBe(expectedIsHistoryOpen);
  });

  describe('search bar customization', () => {
    it('should render custom Search Bar', async () => {
      (useDiscoverCustomization as jest.Mock).mockImplementation((id: DiscoverCustomizationId) => {
        if (id === 'search_bar') {
          return mockSearchBarCustomizationWithCustomSearchBar;
        }
      });

      const { toolkit, props } = await setup();
      renderTestComponent({ toolkit, props });

      expect(screen.getByTestId('custom-search-bar')).toBeVisible();
      expect(screen.queryByTestId('aggregate-query-top-nav-menu')).not.toBeInTheDocument();
    });

    it('should render CustomDataViewPicker', async () => {
      mockUseCustomizations = true;
      const { toolkit, props } = await setup();
      renderTestComponent({ toolkit, props });

      const topNav = screen.getByTestId('aggregate-query-top-nav-menu');

      expect(topNav).toHaveAttribute('data-has-data-view-picker-component-props', 'false');
      expect(topNav).toHaveAttribute('data-has-data-view-picker-override', 'true');
      expect(screen.getByTestId('custom-data-view-picker')).toBeVisible();
    });

    it('should not render the dataView picker when hideDataViewPicker is true', async () => {
      (useDiscoverCustomization as jest.Mock).mockImplementation((id: DiscoverCustomizationId) => {
        if (id === 'search_bar') {
          return mockSearchBarCustomizationWithHiddenDataViewPicker;
        }
      });

      const { toolkit, props } = await setup();
      renderTestComponent({ toolkit, props });

      const topNav = screen.getByTestId('aggregate-query-top-nav-menu');

      expect(topNav).toHaveAttribute('data-has-data-view-picker-component-props', 'false');
      expect(topNav).toHaveAttribute('data-has-data-view-picker-override', 'false');
      expect(screen.queryByTestId('custom-data-view-picker')).not.toBeInTheDocument();
    });
  });
});
