/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { mockPersistedLogFactory } from '@kbn/kql/public/components/query_string_input/query_string_input.test.mocks';

jest.mock('@kbn/esql/public/kibana_services', () => ({
  useKibanaServices: jest.fn(() => ({})),
  untilPluginStartServicesReady: jest.fn(() => new Promise(() => {})),
}));

jest.mock('@kbn/date-range-picker-presets', () => ({
  useDateRangePickerPresets: jest.fn(() => ({
    presets: [],
    onPresetSave: undefined,
    onPresetDelete: undefined,
  })),
}));

import React from 'react';
import { BehaviorSubject } from 'rxjs';
import { render, screen, waitFor, within } from '@testing-library/react';
import { EMPTY, of } from 'rxjs';

import { QueryBarTopRow, SharingMetaFields } from './query_bar_top_row';
import { coreMock } from '@kbn/core/public/mocks';
import { dataPluginMock } from '@kbn/data-plugin/public/mocks';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { I18nProvider } from '@kbn/i18n-react';
import { stubIndexPattern } from '@kbn/data-plugin/public/stubs';
import { kqlPluginMock } from '@kbn/kql/public/mocks';
import type { Filter } from '@kbn/es-query';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import { unifiedSearchPluginMock } from '../mocks';
import { EuiThemeProvider } from '@elastic/eui';
import type { IUnifiedSearchPluginServices } from '../types';
import userEvent from '@testing-library/user-event';
import { getSessionServiceMock } from '@kbn/data-plugin/public/search/session/mocks';
import { SearchSessionState } from '@kbn/data-plugin/public';
import { useDateRangePickerPresets } from '@kbn/date-range-picker-presets';

const mockUseDateRangePickerPresets = useDateRangePickerPresets as jest.Mock;

const startMock = coreMock.createStart();
startMock.chrome.getActiveSolutionNavId$.mockReturnValue(new BehaviorSubject('oblt'));

const mockTimeHistory = {
  add: () => jest.fn(),
  get: () => {
    return [];
  },
  get$: () => EMPTY,
};

let useNewDateRangePickerFlag = true;
let usePresetPersistenceFlag = true;

startMock.uiSettings.get.mockImplementation((key: string) => {
  switch (key) {
    case UI_SETTINGS.TIMEPICKER_QUICK_RANGES:
      return [
        {
          from: 'now/d',
          to: 'now/d',
          display: 'Today',
        },
      ];
    case 'dateFormat':
      return 'MMM D, YYYY @ HH:mm:ss.SSS';
    case 'dateFormat:tz':
      return 'UTC';
    case UI_SETTINGS.HISTORY_LIMIT:
      return 10;
    case UI_SETTINGS.TIMEPICKER_TIME_DEFAULTS:
      return {
        from: 'now-15m',
        to: 'now',
      };
    default:
      throw new Error(`Unexpected config key: ${key}`);
  }
});

startMock.featureFlags.getBooleanValue.mockImplementation((key: string, fallback: boolean) => {
  if (key === 'unifiedSearch.newDateRangePickerEnabled') {
    return useNewDateRangePickerFlag;
  }
  if (key === 'unifiedSearch.dateRangePickerPresetsPersistenceEnabled') {
    return usePresetPersistenceFlag;
  }
  return fallback;
});

startMock.featureFlags.getBooleanValue$.mockImplementation((key: string, fallback: boolean) => {
  if (key === 'unifiedSearch.newDateRangePickerEnabled') {
    return of(useNewDateRangePickerFlag);
  }
  if (key === 'unifiedSearch.dateRangePickerPresetsPersistenceEnabled') {
    return of(usePresetPersistenceFlag);
  }
  return of(fallback);
});

const noop = () => {
  return;
};

const kqlQuery = {
  query: 'response:200',
  language: 'kuery',
};

const esqlQuery = {
  esql: 'FROM test',
};

const createMockWebStorage = () => ({
  clear: jest.fn(),
  getItem: jest.fn(),
  key: jest.fn(),
  removeItem: jest.fn(),
  setItem: jest.fn(),
  length: 0,
});

const createMockStorage = () => ({
  storage: createMockWebStorage(),
  get: jest.fn(),
  set: jest.fn(),
  remove: jest.fn(),
  clear: jest.fn(),
});

function wrapQueryBarTopRowInContext(
  testProps: any,
  { servicesOverride }: { servicesOverride?: Partial<IUnifiedSearchPluginServices> } = {}
) {
  const defaultOptions = {
    screenTitle: 'Another Screen',
    onSubmit: noop,
    onChange: noop,
    intl: null as any,
  };

  const services = {
    ...startMock,
    core: startMock,
    unifiedSearch: unifiedSearchPluginMock.createStartContract(),
    kql: kqlPluginMock.createStartContract(),
    data: dataPluginMock.createStartContract(),
    appName: 'discover',
    storage: createMockStorage(),
    ...servicesOverride,
  };

  return (
    <EuiThemeProvider>
      <I18nProvider>
        <KibanaContextProvider services={services}>
          <QueryBarTopRow {...defaultOptions} {...testProps} />
        </KibanaContextProvider>
      </I18nProvider>
    </EuiThemeProvider>
  );
}

describe('QueryBarTopRowTopRow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useNewDateRangePickerFlag = true;
    usePresetPersistenceFlag = true;
  });

  describe.each([
    {
      value: false,
      description: 'disabled',
      submitId: 'querySubmitButton',
      cancelId: 'queryCancelButton',
    },
    {
      value: true,
      description: 'enabled',
      submitId: 'querySubmitButton',
      cancelId: 'queryCancelButton',
    },
  ])('when background search is $description', ({ value, submitId, cancelId }) => {
    describe('when it is NOT loading', () => {
      it('should render the submit button', async () => {
        const { getByTestId } = render(
          wrapQueryBarTopRowInContext({
            query: kqlQuery,
            screenTitle: 'Another Screen',
            isDirty: false,
            indexPatterns: [stubIndexPattern],
            timeHistory: mockTimeHistory,
            useBackgroundSearchButton: value,
          })
        );

        await waitFor(() => {
          expect(getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
          expect(within(getByTestId(submitId)).getByText('Refresh')).toBeVisible();
        });
      });
    });

    describe('when it is loading', () => {
      it('should render the cancel button', async () => {
        const { getByTestId } = render(
          wrapQueryBarTopRowInContext({
            query: kqlQuery,
            screenTitle: 'Another Screen',
            isDirty: false,
            indexPatterns: [stubIndexPattern],
            timeHistory: mockTimeHistory,
            isLoading: true,
            onCancel: jest.fn(),
            submitButtonStyle: 'withText',
            useBackgroundSearchButton: value,
          })
        );

        await waitFor(() => {
          expect(getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
          expect(within(getByTestId(cancelId)).getByText('Cancel')).toBeVisible();
        });
      });
    });
  });

  describe('when background search is enabled', () => {
    describe('when it is NOT loading', () => {
      const data = dataPluginMock.createStartContract();
      const session = getSessionServiceMock({
        state$: new BehaviorSubject(SearchSessionState.Completed).asObservable(),
      });
      data.search.session = session;

      describe('when the user clicks the main button', () => {
        it('should call the submit callback', async () => {
          // Given
          const user = userEvent.setup();
          const onSubmit = jest.fn();

          // When
          const { getByTestId } = render(
            wrapQueryBarTopRowInContext(
              {
                query: kqlQuery,
                screenTitle: 'Another Screen',
                isDirty: false,
                indexPatterns: [stubIndexPattern],
                timeHistory: mockTimeHistory,
                onSubmit,
                useBackgroundSearchButton: true,
              },
              { servicesOverride: { data } }
            )
          );
          await user.click(getByTestId('querySubmitButton'));

          // Then
          expect(onSubmit).toHaveBeenCalled();
        });
      });

      it('the secondary button should be disabled', async () => {
        // When
        const { getByTestId } = render(
          wrapQueryBarTopRowInContext(
            {
              query: kqlQuery,
              screenTitle: 'Another Screen',
              isDirty: false,
              indexPatterns: [stubIndexPattern],
              timeHistory: mockTimeHistory,
              useBackgroundSearchButton: true,
            },
            { servicesOverride: { data } }
          )
        );

        // Then
        await waitFor(() => {
          expect(getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
          expect(getByTestId('querySubmitButton-secondary-button')).toBeDisabled();
        });
      });
    });

    describe('when it is loading', () => {
      const isLoading = true;

      const data = dataPluginMock.createStartContract();
      const loadingSession = getSessionServiceMock({
        state$: new BehaviorSubject(SearchSessionState.Loading).asObservable(),
      });
      data.search.session = loadingSession;

      describe('when the user clicks the main button', () => {
        it('should call the cancel callback', async () => {
          // Given
          const user = userEvent.setup();
          const onCancel = jest.fn();

          // When
          const { getByTestId } = render(
            wrapQueryBarTopRowInContext(
              {
                query: kqlQuery,
                screenTitle: 'Another Screen',
                isDirty: false,
                indexPatterns: [stubIndexPattern],
                timeHistory: mockTimeHistory,
                isLoading,
                onCancel,
                useBackgroundSearchButton: true,
              },
              { servicesOverride: { data } }
            )
          );
          await user.click(getByTestId('queryCancelButton'));

          // Then
          expect(onCancel).toHaveBeenCalled();
        });
      });

      describe('when the user clicks the secondary button', () => {
        it('should call the send to background callback', async () => {
          // Given
          const user = userEvent.setup();
          const onSendToBackground = jest.fn();

          // When
          const { getByTestId } = render(
            wrapQueryBarTopRowInContext(
              {
                query: kqlQuery,
                screenTitle: 'Another Screen',
                isDirty: false,
                indexPatterns: [stubIndexPattern],
                timeHistory: mockTimeHistory,
                isLoading,
                onCancel: jest.fn(),
                onSendToBackground,
                useBackgroundSearchButton: true,
              },
              { servicesOverride: { data } }
            )
          );

          const button = getByTestId('queryCancelButton-secondary-button');
          await waitFor(() => expect(button).toBeEnabled(), { timeout: 1000 });
          await user.click(button);

          // Then
          expect(onSendToBackground).toHaveBeenCalled();
        });
      });
    });
  });

  it('Should create a unique PersistedLog based on the appName and query language', async () => {
    render(
      wrapQueryBarTopRowInContext({
        query: kqlQuery,
        screenTitle: 'Another Screen',
        indexPatterns: [stubIndexPattern],
        timeHistory: mockTimeHistory,
        disableAutoFocus: true,
        isDirty: false,
      })
    );

    await waitFor(() => {
      expect(mockPersistedLogFactory.mock.calls[0][0]).toBe('typeahead:discover-kuery');
    });
  });

  it('Should render update button as icon button', async () => {
    render(
      wrapQueryBarTopRowInContext({
        isDirty: false,
        screenTitle: 'Another Screen',
        showDatePicker: true,
        showSubmitButton: true,
        submitButtonStyle: 'iconOnly',
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
        timeHistory: mockTimeHistory,
      })
    );

    await waitFor(() => {
      const submitButton = screen.getByTestId('querySubmitButton');
      expect(submitButton).toBeInTheDocument();
      // In icon-only mode, the button should not have visible text
      expect(submitButton.textContent).not.toContain('Update');
    });
  });

  it('Should render the timefilter duration container for sharing', async () => {
    render(
      wrapQueryBarTopRowInContext({
        isDirty: false,
        screenTitle: 'Another Screen',
        showDatePicker: true,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
        timeHistory: mockTimeHistory,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
      const durationElement = screen.getByTestId('dataSharedTimefilterDuration');
      expect(durationElement).toHaveAttribute('data-shared-timefilter-duration');
    });
  });

  it('Should render custom data view picker', async () => {
    const dataViewPickerOverride = <div data-test-subj="dataViewPickerOverride" />;
    const { getByTestId } = render(
      wrapQueryBarTopRowInContext({
        query: kqlQuery,
        screenTitle: 'Another Screen',
        isDirty: false,
        indexPatterns: [stubIndexPattern],
        timeHistory: mockTimeHistory,
        dataViewPickerOverride,
      })
    );

    await waitFor(() => {
      expect(getByTestId('dataViewPickerOverride')).toBeInTheDocument();
    });
  });

  it('Should render cancel button when loading', async () => {
    render(
      wrapQueryBarTopRowInContext({
        isLoading: true,
        onCancel: () => {},
        isDirty: false,
        screenTitle: 'Another Screen',
        showDatePicker: true,
        showSubmitButton: true,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
        timeHistory: mockTimeHistory,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
      expect(screen.getByTestId('queryCancelButton')).toBeInTheDocument();
    });
  });

  it('Should NOT render cancel button when not loading', async () => {
    render(
      wrapQueryBarTopRowInContext({
        isLoading: false,
        onCancel: () => {},
        isDirty: false,
        screenTitle: 'Another Screen',
        showDatePicker: true,
        showSubmitButton: true,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
        timeHistory: mockTimeHistory,
      })
    );

    await waitFor(() => {
      expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
      expect(screen.queryByTestId('queryCancelButton')).not.toBeInTheDocument();
    });
  });

  describe('filter bar toggle button', () => {
    const filtersMock = [{ meta: {} }] as Filter[];

    it('should render when showAddFilter is true and filters has at least one entry', async () => {
      render(
        wrapQueryBarTopRowInContext({
          isDirty: false,
          showAddFilter: true,
          filters: filtersMock,
          indexPatterns: [stubIndexPattern],
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('filterBarToggleButton')).toBeInTheDocument();
      });
    });

    it('should not render when filters is empty', async () => {
      render(
        wrapQueryBarTopRowInContext({
          isDirty: false,
          showAddFilter: true,
          filters: [],
          indexPatterns: [stubIndexPattern],
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.queryByTestId('filterBarToggleButton')).not.toBeInTheDocument();
      });
    });
  });

  describe('draft', () => {
    it('should call onDraftChange when in dirty state', async () => {
      const onDraftChange = jest.fn();
      const state = {
        query: kqlQuery,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
      };
      const { getByText } = render(
        wrapQueryBarTopRowInContext({
          isDirty: true,
          onDraftChange,
          ...state,
        })
      );

      await waitFor(() => {
        expect(getByText(kqlQuery.query)).toBeInTheDocument();
        expect(onDraftChange).toHaveBeenCalledWith(state);
      });
    });

    it('should call onDraftChange when in dirty state and no date picker', async () => {
      const onDraftChange = jest.fn();
      const state = {
        query: kqlQuery,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
      };
      const { getByText } = render(
        wrapQueryBarTopRowInContext({
          isDirty: true,
          showDatePicker: false,
          onDraftChange,
          ...state,
        })
      );

      await waitFor(() => {
        expect(getByText(kqlQuery.query)).toBeInTheDocument();
        expect(onDraftChange).toHaveBeenCalledWith({
          query: state.query,
          dateRangeFrom: undefined,
          dateRangeTo: undefined,
        });
      });
    });

    it('should call onDraftChange with empty draft when in normal state', async () => {
      const onDraftChange = jest.fn();
      const state = {
        query: kqlQuery,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
      };
      const { getByText } = render(
        wrapQueryBarTopRowInContext({
          isDirty: false,
          onDraftChange,
          ...state,
        })
      );

      await waitFor(() => {
        expect(getByText(kqlQuery.query)).toBeInTheDocument();
        expect(onDraftChange).toHaveBeenCalledWith(undefined);
      });
    });

    it('should call onDraftChange only once even if unmounted', async () => {
      const onDraftChange = jest.fn();
      const state = {
        query: kqlQuery,
        dateRangeFrom: 'now-7d',
        dateRangeTo: 'now',
      };
      const { unmount } = render(
        wrapQueryBarTopRowInContext({
          isDirty: false,
          onDraftChange,
          ...state,
        })
      );

      unmount();

      expect(onDraftChange).toHaveBeenCalledTimes(1);
    });
  });

  describe.each([
    {
      pickerMode: 'DateRangePicker',
      useNewPicker: true,
      pickerButtonTestSubj: 'dateRangePickerControlButton',
    },
    {
      pickerMode: 'legacy EuiSuperDatePicker',
      useNewPicker: false,
      pickerButtonTestSubj: 'superDatePickerShowDatesButton',
    },
  ])('with $pickerMode', ({ useNewPicker, pickerButtonTestSubj }) => {
    beforeEach(() => {
      useNewDateRangePickerFlag = useNewPicker;
    });

    const wrapWithPicker = (props: any, opts?: any) =>
      wrapQueryBarTopRowInContext({ enableDateRangePicker: useNewPicker, ...props }, opts);

    it('Should render query and time picker', async () => {
      const { getByText, getByTestId } = render(
        wrapWithPicker({
          query: kqlQuery,
          screenTitle: 'Another Screen',
          isDirty: false,
          indexPatterns: [stubIndexPattern],
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(getByText(kqlQuery.query)).toBeInTheDocument();
        expect(getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
      });
    });

    it('Should render only timepicker when no options provided', async () => {
      const { container } = render(
        wrapWithPicker({
          isDirty: false,
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should not show timepicker when asked', async () => {
      const { container } = render(
        wrapWithPicker({
          showDatePicker: false,
          timeHistory: mockTimeHistory,
          isDirty: false,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
        expect(screen.queryByTestId(pickerButtonTestSubj)).not.toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should render timepicker with options', async () => {
      const { container } = render(
        wrapWithPicker({
          isDirty: false,
          screenTitle: 'Another Screen',
          showDatePicker: true,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should render timepicker without the submit button if showSubmitButton is false', async () => {
      render(
        wrapWithPicker({
          isDirty: false,
          screenTitle: 'Another Screen',
          showDatePicker: true,
          showSubmitButton: false,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
        expect(screen.getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
        expect(screen.queryByTestId('querySubmitButton')).not.toBeInTheDocument();
      });
    });

    it('Should render only query input bar', async () => {
      render(
        wrapWithPicker({
          query: kqlQuery,
          indexPatterns: [stubIndexPattern],
          isDirty: false,
          screenTitle: 'Another Screen',
          showDatePicker: false,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByText(kqlQuery.query)).toBeInTheDocument();
        expect(screen.queryByTestId(pickerButtonTestSubj)).not.toBeInTheDocument();
      });
    });

    it('Should NOT render query input bar if disabled', async () => {
      const { container } = render(
        wrapWithPicker({
          query: kqlQuery,
          isDirty: false,
          screenTitle: 'Another Screen',
          indexPatterns: [stubIndexPattern],
          showQueryInput: false,
          showDatePicker: false,
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
        expect(screen.queryByTestId(pickerButtonTestSubj)).not.toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should NOT render query input bar if missing options', async () => {
      const { container } = render(
        wrapWithPicker({
          isDirty: false,
          screenTitle: 'Another Screen',
          showDatePicker: false,
          timeHistory: mockTimeHistory,
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('dataSharedTimefilterDuration')).toBeInTheDocument();
        expect(screen.queryByTestId(pickerButtonTestSubj)).not.toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should NOT render query input bar if on text based languages mode', async () => {
      const { container } = render(
        wrapWithPicker({
          query: esqlQuery,
          isDirty: false,
          screenTitle: 'SQL Screen',
          timeHistory: mockTimeHistory,
          indexPatterns: [stubIndexPattern],
          showDatePicker: true,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('esql-menu-button')).toBeInTheDocument();
        expect(screen.getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should render disabled date picker if on text based languages mode and no timeFieldName', async () => {
      const dataView = {
        ...stubIndexPattern,
        timeFieldName: undefined,
        isPersisted: () => false,
      };
      const { container } = render(
        wrapWithPicker({
          query: esqlQuery,
          isDirty: false,
          screenTitle: 'SQL Screen',
          timeHistory: mockTimeHistory,
          indexPatterns: [dataView],
          showDatePicker: true,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
        })
      );

      await waitFor(() => {
        expect(screen.getByTestId('esql-menu-button')).toBeInTheDocument();
        if (useNewPicker) {
          const button = screen.getByTestId('dateRangePickerControlButton');
          expect(button).toBeDisabled();
        } else {
          expect(screen.getByTestId('kbnQueryBar-datePicker-disabled')).toBeInTheDocument();
        }
        expect(
          container.querySelector('input[placeholder*="search"], textarea')
        ).not.toBeInTheDocument();
      });
    });

    it('Should hide ES|QL UI when query input is disabled', async () => {
      render(
        wrapWithPicker({
          query: esqlQuery,
          isDirty: false,
          screenTitle: 'SQL Screen',
          timeHistory: mockTimeHistory,
          indexPatterns: [stubIndexPattern],
          showQueryInput: false,
          showDatePicker: true,
          showQueryMenu: false,
          dateRangeFrom: 'now-7d',
          dateRangeTo: 'now',
        })
      );

      await waitFor(() => {
        expect(screen.queryByTestId('esql-menu-button')).not.toBeInTheDocument();
        expect(screen.queryByTestId('unifiedTextLangEditor')).not.toBeInTheDocument();
        expect(screen.getByTestId(pickerButtonTestSubj)).toBeInTheDocument();
        expect(within(screen.getByTestId('querySubmitButton')).getByText('Refresh')).toBeVisible();
      });
    });
  });

  describe('date range picker preset persistence', () => {
    const renderWithDatePicker = () =>
      render(
        wrapQueryBarTopRowInContext({
          query: kqlQuery,
          screenTitle: 'Another Screen',
          isDirty: false,
          indexPatterns: [stubIndexPattern],
          timeHistory: mockTimeHistory,
        })
      );

    it('passes userStorage to the presets hook when the new picker and persistence flag are enabled', async () => {
      useNewDateRangePickerFlag = true;
      usePresetPersistenceFlag = true;

      renderWithDatePicker();

      await waitFor(() => {
        expect(mockUseDateRangePickerPresets).toHaveBeenCalledWith(
          expect.objectContaining({
            userStorage: startMock.userStorage,
            uiSettings: startMock.uiSettings,
            userProfile: startMock.userProfile,
            notifications: startMock.notifications,
          })
        );
      });
    });

    it('passes null userStorage to the presets hook when persistence is disabled', async () => {
      useNewDateRangePickerFlag = true;
      usePresetPersistenceFlag = false;

      renderWithDatePicker();

      await waitFor(() => {
        expect(mockUseDateRangePickerPresets).toHaveBeenCalledWith(
          expect.objectContaining({
            userStorage: null,
          })
        );
      });
    });

    it('passes null userStorage to the presets hook on the legacy picker path', async () => {
      useNewDateRangePickerFlag = false;
      usePresetPersistenceFlag = true;

      renderWithDatePicker();

      await waitFor(() => {
        expect(mockUseDateRangePickerPresets).toHaveBeenCalledWith(
          expect.objectContaining({
            userStorage: null,
          })
        );
      });
    });
  });
});

describe('SharingMetaFields', () => {
  it('Should render the component with data-shared-timefilter-duration if time is set correctly', () => {
    const from = '2023-04-07';
    const to = '2023-04-08';
    const { getByTestId } = render(
      <SharingMetaFields from={from} to={to} dateFormat="MMM D, YYYY" />
    );

    const element = getByTestId('dataSharedTimefilterDuration');
    expect(element).toBeInTheDocument();
    expect(element).toHaveAttribute(
      'data-shared-timefilter-duration',
      'Apr 7, 2023 to Apr 8, 2023'
    );
  });

  it('Should convert to absolute correctly', () => {
    jest.useFakeTimers().setSystemTime(new Date('2024-10-21T10:19:31.254Z'));

    const from = 'now-1d/d';
    const to = 'now-1d/d';
    const { getByTestId } = render(
      <SharingMetaFields from={from} to={to} dateFormat="MMM D, YYYY @ HH:mm:ss" />
    );

    const element = getByTestId('dataSharedTimefilterDuration');
    expect(element).toBeInTheDocument();
    expect(element).toHaveAttribute(
      'data-shared-timefilter-duration',
      'Oct 20, 2024 @ 00:00:00 to Oct 20, 2024 @ 23:59:59'
    );
  });

  it('Should render the component without data-shared-timefilter-duration if time is not set correctly', () => {
    // Mock console.warn to suppress moment.js warnings about invalid date format
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    const { getByTestId } = render(
      <SharingMetaFields from="boom" to="now" dateFormat="MMM D, YYYY @ HH:mm:ss.SSS" />
    );

    const element = getByTestId('dataSharedTimefilterDuration');
    expect(element).toBeInTheDocument();
    expect(element).not.toHaveAttribute('data-shared-timefilter-duration');

    consoleSpy.mockRestore();
  });
});
