/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ReactNode } from 'react';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import useObservable from 'react-use/lib/useObservable';
import classNames from 'classnames';
import deepEqual from 'fast-deep-equal';
import { EMPTY, delay, mergeMap, of } from 'rxjs';
import { map } from 'rxjs';
import { throttle, debounce } from 'lodash';

import dateMath from '@kbn/datemath';
import { css } from '@emotion/react';
import type { Filter, TimeRange, Query, AggregateQuery } from '@kbn/es-query';
import {
  getAggregateQueryMode,
  isOfQueryType,
  isOfAggregateQueryType,
  getLanguageDisplayName,
} from '@kbn/es-query';
import {
  ESQLLangEditor,
  ESQLMenu,
  EsqlEditorActionsProvider,
  type ESQLEditorProps,
} from '@kbn/esql/public';
import type { EuiFieldText, EuiIconProps, OnRefreshProps, UseEuiTheme } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiSuperDatePicker,
  usePrettyDuration,
  useIsWithinBreakpoints,
  EuiSuperUpdateButton,
  EuiToolTip,
  EuiButton,
  EuiButtonIcon,
  EuiIconTip,
  EuiSplitButton,
  useEuiTheme,
  type EuiTimeZoneDisplayProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { SearchSessionState, getQueryLog } from '@kbn/data-plugin/public';
import type { PersistedLog, TimeHistoryContract } from '@kbn/data-plugin/public';
import { UI_SETTINGS } from '@kbn/data-plugin/common';
import type { DataView } from '@kbn/data-views-plugin/public';
import type { ESQLControlVariable, ESQLQueryStats } from '@kbn/esql-types';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { QueryStringInput, FilterButtonGroup } from '@kbn/kql/public';
import type { SuggestionsAbstraction, SuggestionsListSize } from '@kbn/kql/public';
import {
  DateRangePicker,
  type DateRangePickerSettings,
  type DateRangePickerOnChangeProps,
  type AutoRefreshSettings,
} from '@kbn/date-range-picker';
import { AddFilterPopover } from './add_filter_popover';
import type { DataViewPickerProps } from '../dataview_picker';
import { DataViewPicker } from '../dataview_picker';
import { NoDataPopover } from './no_data_popover';
import type { IUnifiedSearchPluginServices, UnifiedSearchDraft } from '../types';
import { shallowEqual } from '../utils/shallow_equal';
import { FilterBarToggleButton } from '../filter_bar/filter_bar_toggle_button';
import { FilterBarContextProvider } from '../filter_bar/filter_bar_context';

/** Feature flag key for the new DateRangePicker. Falls back to `true` (new picker). */
const DATE_RANGE_PICKER_FEATURE_FLAG = 'unifiedSearch.newDateRangePickerEnabled';

const SuperDatePicker = React.memo(
  EuiSuperDatePicker as any
) as unknown as typeof EuiSuperDatePicker;

export const strings = {
  getNeedsUpdatingLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.update', {
      defaultMessage: 'Needs updating',
    }),
  getUpdateButtonLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.updateButton', {
      defaultMessage: 'Update',
    }),
  getRefreshQueryLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.refresh', {
      defaultMessage: 'Refresh query',
    }),
  getRefreshButtonLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.refreshButton', {
      defaultMessage: 'Refresh',
    }),
  getCancelQueryLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.cancel', {
      defaultMessage: 'Cancel',
    }),
  getSearchButtonLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.searchButton', {
      defaultMessage: 'Search',
    }),
  getDisabledDatePickerLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.datePicker.disabledLabel', {
      defaultMessage: 'All time',
    }),
  getSendToBackgroundLabel: () =>
    i18n.translate('unifiedSearch.queryBarTopRow.submitButton.sendToBackground', {
      defaultMessage: 'Send to background',
    }),
};

const getWrapperWithTooltip = (
  children: JSX.Element,
  enableTooltip: boolean,
  query?: Query | AggregateQuery
) => {
  if (enableTooltip && query && isOfAggregateQueryType(query)) {
    const textBasedLanguage = getAggregateQueryMode(query);
    const displayName = getLanguageDisplayName(textBasedLanguage);
    return (
      <EuiToolTip
        position="top"
        content={i18n.translate('unifiedSearch.query.queryBar.textBasedNonTimestampWarning', {
          defaultMessage:
            'Date range selection for {language} queries requires an @timestamp field in the dataset.',
          values: { language: displayName },
        })}
      >
        {children}
      </EuiToolTip>
    );
  } else {
    return children;
  }
};

// @internal
export interface QueryBarTopRowProps<QT extends Query | AggregateQuery = Query> {
  customSubmitButton?: any;
  dataViewPickerOverride?: ReactNode;
  dataTestSubj?: string;
  dateRangeFrom?: string;
  dateRangeTo?: string;
  disableAutoFocus?: boolean;
  fillSubmitButton: boolean;
  iconType?: EuiIconProps['type'];
  indexPatterns?: Array<DataView | string>;
  indicateNoData?: boolean;
  isClearable?: boolean;
  isDirty: boolean;
  isLoading?: boolean;
  isRefreshPaused?: boolean;
  nonKqlMode?: 'lucene' | 'text';
  onChange: (payload: { dateRange: TimeRange; query?: Query | QT }) => void;
  onRefresh?: (payload: { dateRange: TimeRange }) => void;
  onRefreshChange?: (options: { isPaused: boolean; refreshInterval: number }) => void;
  onSubmit: (payload: { dateRange: TimeRange; query?: Query | QT }) => void;
  onSendToBackground: (payload: { dateRange: TimeRange; query?: Query | QT }) => Promise<void>;
  onCancel?: () => void;
  onDraftChange?: (draft: UnifiedSearchDraft | undefined) => void;
  placeholder?: string;
  prepend?: React.ComponentProps<typeof EuiFieldText>['prepend'];
  query?: Query | QT;
  refreshInterval?: number;
  minRefreshInterval?: number;
  screenTitle?: string;
  showQueryInput?: boolean;
  showAddFilter?: boolean;
  showDatePicker?: boolean;
  isDisabled?: boolean;
  showAutoRefreshOnly?: boolean;
  timeHistory?: TimeHistoryContract;
  timeRangeForSuggestionsOverride?: boolean;
  filtersForSuggestions?: Filter[];
  filters?: Filter[];
  onFiltersUpdated?: (filters: Filter[]) => void;
  dataViewPickerComponentProps?: DataViewPickerProps;
  textBasedLanguageModeErrors?: Error[];
  textBasedLanguageModeWarning?: string;
  filterBar?: React.ReactNode;
  showDatePickerAsBadge?: boolean;
  showSubmitButton?: boolean;
  /**
   * Style of the submit button
   * `iconOnly` - use IconButton
   * `full` - use SuperUpdateButton
   * (default) `auto` - `iconOnly` on smaller screens, and `full` on larger screens
   */
  submitButtonStyle?: 'auto' | 'iconOnly' | 'full';
  suggestionsSize?: SuggestionsListSize;
  suggestionsAbstraction?: SuggestionsAbstraction;
  isScreenshotMode?: boolean;
  onTextLangQuerySubmit: (query?: Query | AggregateQuery) => void;
  onTextLangQueryChange: (query: AggregateQuery) => void;
  submitOnBlur?: boolean;
  renderQueryInputAppend?: () => React.ReactNode;
  disableExternalPadding?: boolean;
  bubbleSubmitEvent?: boolean;

  esqlEditorInitialState?: ESQLEditorProps['initialState'];
  onEsqlEditorInitialStateChange?: ESQLEditorProps['onInitialStateChange'];

  /**
   * Optional configuration for ES|QL variables.
   *
   * This prop allows you to define and manage variables used within ES|QL queries,
   * typically bound to UI controls like dropdowns or input fields (Dashboard controls).
   */
  esqlVariablesConfig?: {
    /**
     * An array of control variables, each defining a key, an initial value,
     * and its data type, which are used to parameterize the ES|QL query.
     */
    esqlVariables: ESQLControlVariable[];
    /**
     * Callback function invoked when control changes are to be saved.
     * It receives the current state of the UI controls and the updated ES|QL query string.
     * @param controlState - A record containing the current values of the UI controls.
     * @param updatedQuery - The ES|QL query string updated with the new variable values.
     */
    onSaveControl: (controlState: Record<string, unknown>, updatedQuery: string) => Promise<void>;
    /**
     * Callback function invoked when the user cancels changes to the controls.
     * This function reverts the UI to its previous state or closes a modal.
     */
    onCancelControl?: () => void;
    /**
     * A React Node that will be rendered as a wrapper for the UI controls
     * associated with the ES|QL variables. This allows for custom layout or
     * additional elements around the controls.
     */
    controlsWrapper: React.ReactNode;
  };
  /**
   * Optional ES|QL prop - Request statistics to be displayed in the ES|QL editor UI
   */
  esqlQueryStats?: ESQLQueryStats;
  /**
   * Optional ES|QL prop - Callback function invoked to open the given ES|QL query in a new Discover tab
   */
  onOpenQueryInNewTab?: ESQLEditorProps['onOpenQueryInNewTab'];
  onESQLDocsFlyoutVisibilityChanged?: (isOpen: boolean) => void;
  /**
   * Optional ES|QL prop - Enable data source browser in ESQL editor
   */
  enableResourceBrowser?: ESQLEditorProps['enableResourceBrowser'];
  useBackgroundSearchButton?: boolean;
  /**
   * Whether to use the new DateRangePicker. Defaults to `true`; pass `false`
   * to opt out and keep the legacy EuiSuperDatePicker. The new picker is shown
   * only when this resolves to `true` *and* the
   * `unifiedSearch.newDateRangePickerEnabled` feature flag is enabled — when
   * the flag is disabled, the legacy picker is always used.
   */
  enableDateRangePicker?: boolean;
}

export const SharingMetaFields = React.memo(function SharingMetaFields({
  from,
  to,
  dateFormat,
}: {
  from: string;
  to: string;
  dateFormat: string;
}) {
  function toAbsoluteString(value: string, roundUp = false) {
    const valueAsMoment = dateMath.parse(value, { roundUp });
    if (!valueAsMoment) {
      return value;
    }
    return valueAsMoment.toISOString();
  }

  try {
    const dateRangePretty = usePrettyDuration({
      timeFrom: toAbsoluteString(from),
      timeTo: toAbsoluteString(to, true),
      quickRanges: [],
      dateFormat,
    });
    return (
      <div
        data-shared-timefilter-duration={dateRangePretty}
        data-test-subj="dataSharedTimefilterDuration"
      />
    );
  } catch (e) {
    return <div data-test-subj="dataSharedTimefilterDuration" />;
  }
});

type GenericQueryBarTopRow = <QT extends AggregateQuery | Query = Query>(
  props: QueryBarTopRowProps<QT>
) => React.ReactElement;

export const QueryBarTopRow = React.memo(
  function QueryBarTopRow<QT extends Query | AggregateQuery = Query>(
    props: QueryBarTopRowProps<QT>
  ) {
    const isMobile = useIsWithinBreakpoints(['xs', 's']);
    const [isXXLarge, setIsXXLarge] = useState<boolean>(false);
    const [isSendingToBackground, setIsSendingToBackground] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const { euiTheme } = useEuiTheme();
    const submitButtonStyle: QueryBarTopRowProps['submitButtonStyle'] =
      props.submitButtonStyle ?? 'auto';
    const submitButtonIconOnly =
      submitButtonStyle === 'auto' ? !isXXLarge : submitButtonStyle === 'iconOnly';

    useEffect(() => {
      if (submitButtonStyle !== 'auto') return;

      const handleResize = throttle(() => {
        setIsXXLarge(window.innerWidth >= euiTheme.breakpoint.m);
      }, 50);

      window.addEventListener('resize', handleResize);
      handleResize();

      return () => window.removeEventListener('resize', handleResize);
    }, [euiTheme.breakpoint.m, submitButtonStyle]);

    useEffect(() => {
      if (!props.isLoading) {
        setIsCancelling(false);
      }
    }, [props.isLoading]);

    const {
      showQueryInput = true,
      showDatePicker = true,
      showAutoRefreshOnly = false,
      showSubmitButton = true,
      enableDateRangePicker = true,
    } = props;

    const [isDateRangeInvalid, setIsDateRangeInvalid] = useState(false);
    const [isQueryInputFocused, setIsQueryInputFocused] = useState(false);
    const [dateRangePickerSettings, setDateRangePickerSettings] = useState<DateRangePickerSettings>(
      {
        roundRelativeTime: true,
        timePrecision: 'none',
      }
    );
    const isAutoRefreshEnabled = props.isRefreshPaused === false;

    const [autoRefresh, setAutoRefresh] = useState<AutoRefreshSettings>(() => {
      const isConfigured = props.refreshInterval != null && props.refreshInterval > 0;
      return {
        // Only show the auto-refresh UI when the timer is actively running on load.
        // When paused or unconfigured, isEnabled starts false; the user must re-enable
        // from Settings. This avoids the UI reappearing after a page reload when the
        // user had disabled it.
        isEnabled: isAutoRefreshEnabled,
        isPaused: isConfigured && (props.isRefreshPaused ?? false),
        intervalMs: isConfigured ? props.refreshInterval! : 60_000,
        intervalDisplayUnit: 's',
      };
    });

    useEffect(() => {
      setAutoRefresh((prev) => ({
        ...prev,
        ...(props.refreshInterval != null && props.refreshInterval > 0
          ? { intervalMs: props.refreshInterval }
          : {}),
        isPaused: !isAutoRefreshEnabled,
      }));
    }, [props.refreshInterval, isAutoRefreshEnabled]);

    const kibana = useKibana<IUnifiedSearchPluginServices>();

    const {
      uiSettings,
      storage,
      appName,
      data,
      usageCollection,
      kql,
      notifications,
      docLinks,
      http,
      dataViews,
      application,
    } = kibana.services;

    const shouldUseLegacyTimePicker =
      !enableDateRangePicker ||
      !kibana.services.featureFlags?.getBooleanValue(DATE_RANGE_PICKER_FEATURE_FLAG, true);

    const isQueryLangSelected = props.query && !isOfQueryType(props.query);
    const shouldRenderESQLUi = Boolean(showQueryInput && isQueryLangSelected);

    const backgroundSearchState = useObservable(
      data.search.session.state$.pipe(
        mergeMap((state) => {
          // We want to delay enabling the button to avoid flickering when searches are quick
          if (state === SearchSessionState.Loading) return of(state).pipe(delay(500));
          return of(state);
        })
      )
    );
    const canSendToBackground =
      backgroundSearchState === SearchSessionState.Loading && !isSendingToBackground;

    const queryLanguage = props.query && isOfQueryType(props.query) && props.query.language;
    const queryRef = useRef<Query | QT | undefined>(props.query);
    queryRef.current = props.query;

    const persistedLog: PersistedLog | undefined = React.useMemo(
      () =>
        queryLanguage && uiSettings && storage && appName
          ? getQueryLog(uiSettings!, storage, appName, queryLanguage)
          : undefined,
      [appName, queryLanguage, uiSettings, storage]
    );

    function getDateRange() {
      const defaultTimeSetting = uiSettings!.get(UI_SETTINGS.TIMEPICKER_TIME_DEFAULTS);
      return {
        from: props.dateRangeFrom || defaultTimeSetting.from,
        to: props.dateRangeTo || defaultTimeSetting.to,
      };
    }

    const currentDateRange = getDateRange();
    const dateRangeRef = useRef<{ from: string; to: string }>(currentDateRange);
    dateRangeRef.current = currentDateRange;

    const propsOnSubmit = props.onSubmit;
    const propsOnCancel = props.onCancel;

    const toRecentlyUsedRanges = (ranges: TimeRange[]) =>
      ranges.map(({ from, to }: { from: string; to: string }) => {
        return {
          start: from,
          end: to,
        };
      });
    const timeHistory = props.timeHistory;
    const timeHistory$ = useMemo(
      () => timeHistory?.get$().pipe(map(toRecentlyUsedRanges)) ?? EMPTY,
      [timeHistory]
    );

    const recentlyUsedRanges = useObservable(
      timeHistory$,
      toRecentlyUsedRanges(timeHistory?.get() ?? [])
    );
    const [commonlyUsedRanges] = useState(() => {
      return (
        uiSettings
          ?.get(UI_SETTINGS.TIMEPICKER_QUICK_RANGES)
          ?.map(({ from, to, display }: { from: string; to: string; display: string }) => {
            return {
              start: from,
              end: to,
              label: display,
            };
          }) ?? []
      );
    });

    const onSubmit = useCallback(
      ({ query, dateRange }: { query?: Query | QT; dateRange: TimeRange }) => {
        if (timeHistory) {
          timeHistory.add(dateRange);
        }

        propsOnSubmit({ query, dateRange });
      },
      [timeHistory, propsOnSubmit]
    );

    const onClickSubmitButton = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (persistedLog && queryRef.current && isOfQueryType(queryRef.current)) {
          persistedLog.add(queryRef.current.query);
        }
        event.preventDefault();
        onSubmit({
          query: queryRef.current,
          dateRange: dateRangeRef.current,
        });
      },
      [persistedLog, onSubmit]
    );

    const onClickSendToBackground = useCallback(
      async (event: React.MouseEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setIsSendingToBackground(true);
        await props.onSendToBackground({
          query: queryRef.current,
          dateRange: dateRangeRef.current,
        });
        setIsSendingToBackground(false);
      },
      [props]
    );

    const onClickCancelButton = useCallback(
      (event: React.MouseEvent<HTMLButtonElement>) => {
        if (persistedLog && queryRef.current && isOfQueryType(queryRef.current)) {
          persistedLog.add(queryRef.current.query);
        }
        event.preventDefault();

        if (propsOnCancel) {
          setIsCancelling(true);
          propsOnCancel();
        }
      },
      [persistedLog, propsOnCancel]
    );

    const propsOnChange = props.onChange;
    const onQueryChange = useCallback(
      (query: Query) => {
        return propsOnChange({
          query,
          dateRange: dateRangeRef.current,
        });
      },
      [propsOnChange]
    );

    const onChangeQueryInputFocus = useCallback((isFocused: boolean) => {
      setIsQueryInputFocused(isFocused);
    }, []);

    const onTimeChange = useCallback(
      ({
        start,
        end,
        isInvalid,
        isQuickSelection,
      }: {
        start: string;
        end: string;
        isInvalid: boolean;
        isQuickSelection: boolean;
      }) => {
        setIsDateRangeInvalid(isInvalid);
        const retVal = {
          query: queryRef.current,
          dateRange: {
            from: start,
            to: end,
          },
        };

        if (isQuickSelection) {
          onSubmit(retVal);
        } else {
          propsOnChange(retVal);
        }
      },
      [propsOnChange, onSubmit]
    );

    const propsOnRefresh = props.onRefresh;
    const onRefresh = useCallback(
      ({ start, end }: OnRefreshProps) => {
        if (propsOnRefresh) {
          propsOnRefresh({ dateRange: { from: start, to: end } });
        }
      },
      [propsOnRefresh]
    );

    const onDateRangeChange = useCallback(
      ({ start, end, isInvalid }: DateRangePickerOnChangeProps) => {
        setIsDateRangeInvalid(isInvalid);
        if (!isInvalid) {
          onSubmit({
            query: queryRef.current,
            dateRange: { from: start, to: end },
          });
        }
      },
      [onSubmit]
    );

    const onDateRangeInputChange = useCallback(() => {
      setIsDateRangeInvalid(false);
    }, []);

    const propsOnRefreshChange = props.onRefreshChange;

    const onDateRangePickerRefresh = useCallback(() => {
      if (propsOnRefresh) {
        propsOnRefresh({ dateRange: dateRangeRef.current });
      }
    }, [propsOnRefresh]);

    // Subscribe to the Kibana timefilter's actual refresh loop so the DateRangePicker countdown
    // stays in sync with real query cadence. The timefilter drives data fetches in consumers like
    // Discover and Dashboard; without this the two independent timers drift apart over time.
    const [autoRefreshEpoch, setAutoRefreshEpoch] = useState<number | undefined>(undefined);
    useEffect(() => {
      if (shouldUseLegacyTimePicker || !propsOnRefreshChange) return;

      const subscription = data.query.timefilter.timefilter
        .getAutoRefreshFetch$()
        .subscribe((done) => {
          setAutoRefreshEpoch((prev) => (prev ?? 0) + 1);
          done(); // release the loop immediately — we are only resetting the UI countdown
        });

      return () => subscription.unsubscribe();
    }, [shouldUseLegacyTimePicker, propsOnRefreshChange, data.query.timefilter.timefilter]);

    const dateRangePickerSettingsWithAutoRefresh = useMemo<DateRangePickerSettings>(
      () =>
        propsOnRefreshChange
          ? { ...dateRangePickerSettings, autoRefresh }
          : dateRangePickerSettings,
      [dateRangePickerSettings, autoRefresh, propsOnRefreshChange]
    );

    const onDateRangePickerSettingsChange = useCallback(
      (next: DateRangePickerSettings) => {
        const { autoRefresh: nextAutoRefresh, ...rest } = next;

        setDateRangePickerSettings(rest);

        if (nextAutoRefresh) {
          setAutoRefresh((prev) => {
            // When enabling auto-refresh, also clear isPaused so the timer starts immediately
            // without requiring a second click on the play button.
            const resolved: AutoRefreshSettings =
              !prev.isEnabled && nextAutoRefresh.isEnabled
                ? { ...nextAutoRefresh, isPaused: false }
                : nextAutoRefresh;

            const isEnabledChanged = prev.isEnabled !== resolved.isEnabled;
            const intervalChanged = prev.intervalMs !== resolved.intervalMs;
            const isPausedChanged = prev.isPaused !== resolved.isPaused;

            if (isEnabledChanged || intervalChanged || isPausedChanged) {
              propsOnRefreshChange?.({
                isPaused: !resolved.isEnabled || resolved.isPaused,
                refreshInterval: resolved.intervalMs,
              });
            }

            return resolved;
          });
        }
      },
      [propsOnRefreshChange]
    );

    const onInputSubmit = useCallback(
      (query: Query) => {
        onSubmit({
          query,
          dateRange: dateRangeRef.current,
        });
      },
      [onSubmit]
    );

    const {
      onDraftChange,
      isDirty: draftIsDirty,
      query: draftQuery,
      dateRangeFrom: draftDateRangeFrom,
      dateRangeTo: draftDateRangeTo,
    } = props;
    const draft = useMemo(
      () =>
        onDraftChange && draftIsDirty
          ? {
              query: draftQuery,
              dateRangeFrom: showDatePicker ? draftDateRangeFrom : undefined,
              dateRangeTo: showDatePicker ? draftDateRangeTo : undefined,
            }
          : undefined,
      [
        onDraftChange,
        draftIsDirty,
        draftQuery,
        draftDateRangeFrom,
        draftDateRangeTo,
        showDatePicker,
      ]
    );

    const onDraftChangeDebounced = useMemo(
      () => (onDraftChange ? debounce(onDraftChange, 300) : undefined),
      [onDraftChange]
    );

    useEffect(() => {
      onDraftChangeDebounced?.(draft);
    }, [onDraftChangeDebounced, draft]);

    useEffect(() => {
      return () => {
        onDraftChangeDebounced?.flush(); // immediately invoke pending debounced calls on unmount
      };
    }, [onDraftChangeDebounced]);

    // Pass raw date math / ISO strings so DateRangePicker's internal parser can handle them.
    // Display label resolution (e.g. "now/w to now/w" → "This week") is done by
    // DateRangePicker itself using the `presets` it already receives.
    const dateRangeValue = `${currentDateRange.from} to ${currentDateRange.to}`;

    function shouldRenderQueryInput(): boolean {
      return Boolean(showQueryInput && props.query && storage);
    }

    function shouldRenderDatePicker(): boolean {
      return Boolean(showDatePicker || showAutoRefreshOnly);
    }

    function renderFilterMenuOnly(): boolean {
      return !Boolean(props.showAddFilter) && Boolean(props.prepend);
    }

    function shouldRenderUpdateButton(): boolean {
      return (
        Boolean(showSubmitButton) &&
        Boolean(showQueryInput || showDatePicker || showAutoRefreshOnly)
      );
    }

    function shouldShowDatePickerAsBadge(): boolean {
      return (
        (Boolean(props.showDatePickerAsBadge) && !shouldRenderQueryInput()) ||
        Boolean(shouldRenderESQLUi && props.query && isOfAggregateQueryType(props.query))
      );
    }

    function renderDatePicker() {
      if (!shouldRenderDatePicker()) {
        return null;
      }
      let isDisabled: boolean | { display: React.ReactNode } = Boolean(props.isDisabled);
      let enableTooltip = false;
      if (Boolean(isQueryLangSelected) && !props.isDirty) {
        const adHocDataview = props.indexPatterns?.[0];
        if (adHocDataview && typeof adHocDataview !== 'string') {
          if (!adHocDataview.timeFieldName) {
            isDisabled = {
              display: (
                <span data-test-subj="kbnQueryBar-datePicker-disabled">
                  {strings.getDisabledDatePickerLabel()}
                </span>
              ),
            };
          }
          enableTooltip = !Boolean(adHocDataview.timeFieldName);
        }
      }

      const wrapperClasses = classNames('kbnQueryBar__datePickerWrapper');

      let datePicker: JSX.Element;

      if (shouldUseLegacyTimePicker) {
        const timeZoneName = uiSettings.get('dateFormat:tz');
        const timeZoneSettingTip = i18n.translate(
          'unifiedSearch.queryBarTopRow.datePicker.timeZoneSettingTip',
          {
            defaultMessage: 'Time zone is set in space settings by administrators',
          }
        );
        const timeZoneCustomRender: EuiTimeZoneDisplayProps['customRender'] = ({ nameDisplay }) => (
          <>
            {nameDisplay}
            <EuiIconTip content={timeZoneSettingTip} color="subdued" />
          </>
        );
        datePicker = (
          <SuperDatePicker
            isDisabled={isDisabled}
            start={props.dateRangeFrom}
            end={props.dateRangeTo}
            isPaused={props.isRefreshPaused}
            refreshInterval={props.refreshInterval}
            refreshMinInterval={props.minRefreshInterval}
            onTimeChange={onTimeChange}
            onRefresh={onRefresh}
            onRefreshChange={props.onRefreshChange}
            showUpdateButton={false}
            recentlyUsedRanges={recentlyUsedRanges}
            locale={i18n.getLocale()}
            commonlyUsedRanges={commonlyUsedRanges}
            dateFormat={uiSettings.get('dateFormat')}
            isAutoRefreshOnly={showAutoRefreshOnly}
            className="kbnQueryBar__datePicker"
            isQuickSelectOnly={isMobile ? false : isQueryInputFocused}
            width={isMobile ? 'full' : 'auto'}
            compressed
            showTimeWindowButtons
            timeZoneDisplayProps={{
              timeZone: timeZoneName,
              customRender: timeZoneCustomRender,
            }}
          />
        );
      } else {
        const noTimeFieldNameDisabled =
          typeof isDisabled === 'object' && isDisabled.display !== undefined;
        // Visualize-style consumers request auto-refresh-only mode via
        // `showAutoRefreshOnly` + `!showDatePicker`. The legacy picker rendered a
        // read-only date display while still letting users operate the auto-refresh
        // controls. The new picker has no read-only mode, so we disable it here —
        // but that also removes access to auto-refresh, a temporary regression.
        // TODO: add a `readOnly` prop to the new picker so auto-refresh stays
        // operable, and use it instead of `disabled` for this case.
        const autoRefreshOnlyDisabled = Boolean(showAutoRefreshOnly && !showDatePicker);
        const pickerDisabled =
          Boolean(props.isDisabled) || noTimeFieldNameDisabled || autoRefreshOnlyDisabled;
        datePicker = (
          <>
            {(noTimeFieldNameDisabled || autoRefreshOnlyDisabled) && (
              // Hidden sibling so FTR tests can detect the disabled state via
              // testSubjects.existOrFail('kbnQueryBar-datePicker-disabled'), matching
              // the span the legacy picker renders inside its isDisabled.display node.
              <span data-test-subj="kbnQueryBar-datePicker-disabled" style={{ display: 'none' }} />
            )}
            <DateRangePicker
              className="kbnQueryBar__datePicker"
              value={
                noTimeFieldNameDisabled || autoRefreshOnlyDisabled
                  ? strings.getDisabledDatePickerLabel()
                  : dateRangeValue
              }
              onChange={onDateRangeChange}
              onInputChange={onDateRangeInputChange}
              isInvalid={isDateRangeInvalid}
              disabled={pickerDisabled}
              width="auto"
              compressed
              collapsed={isMobile || isQueryInputFocused}
              showTimeWindowButtons
              presets={commonlyUsedRanges}
              recent={recentlyUsedRanges}
              settings={dateRangePickerSettingsWithAutoRefresh}
              onSettingsChange={onDateRangePickerSettingsChange}
              onRefresh={propsOnRefreshChange ? onDateRangePickerRefresh : undefined}
              refreshEpoch={autoRefreshEpoch}
              dateFormat={uiSettings.get('dateFormat')}
              timeZone={uiSettings.get('dateFormat:tz')}
              prependBasePath={http?.basePath.prepend}
              canAccessAdvancedSettings={
                (application?.capabilities.advancedSettings?.save as boolean | undefined) ?? false
              }
            />
          </>
        );
      }

      const component = getWrapperWithTooltip(datePicker, enableTooltip, props.query);

      return (
        <EuiFlexItem className={wrapperClasses} css={styles.datePickerWrapper}>
          {component}
        </EuiFlexItem>
      );
    }

    function renderCancelButton() {
      const buttonLabelCancel = strings.getCancelQueryLabel();

      if (props.useBackgroundSearchButton) {
        return (
          <EuiSplitButton color="text" size="s">
            <EuiSplitButton.ActionPrimary
              aria-label={buttonLabelCancel}
              iconType="cross"
              isLoading={isCancelling}
              isDisabled={isCancelling}
              onClick={onClickCancelButton}
              data-test-subj="queryCancelButton"
            >
              {buttonLabelCancel}
            </EuiSplitButton.ActionPrimary>
            <EuiSplitButton.ActionSecondary
              isLoading={isSendingToBackground}
              isDisabled={!canSendToBackground}
              onClick={onClickSendToBackground}
              tooltipProps={{
                content: strings.getSendToBackgroundLabel(),
                disableScreenReaderOutput: true,
              }}
              aria-label={strings.getSendToBackgroundLabel()}
              iconType="backgroundTask"
              data-test-subj="queryCancelButton-secondary-button"
            />
          </EuiSplitButton>
        );
      }

      if (submitButtonIconOnly) {
        return (
          <EuiToolTip content={buttonLabelCancel} disableScreenReaderOutput>
            <EuiButtonIcon
              iconType="cross"
              aria-label={buttonLabelCancel}
              onClick={onClickCancelButton}
              size="s"
              data-test-subj="queryCancelButton"
              color="text"
              display="base"
              isLoading={isCancelling}
              isDisabled={isCancelling}
            >
              {buttonLabelCancel}
            </EuiButtonIcon>
          </EuiToolTip>
        );
      }

      return (
        <EuiButton
          iconType="cross"
          aria-label={buttonLabelCancel}
          onClick={onClickCancelButton}
          size="s"
          data-test-subj="queryCancelButton"
          color="text"
          isLoading={isCancelling}
          isDisabled={isCancelling}
        >
          {buttonLabelCancel}
        </EuiButton>
      );
    }

    const getSubmitButtonProps = () => {
      if (shouldRenderESQLUi) {
        const label = strings.getSearchButtonLabel();
        return { icon: undefined, text: label, ariaLabel: label, color: 'primary' as const };
      }

      if (props.isDirty) {
        return {
          icon: 'kqlFunction' as const,
          text: strings.getUpdateButtonLabel(),
          ariaLabel: strings.getNeedsUpdatingLabel(),
          color: 'success' as const,
        };
      }

      return {
        icon: 'refresh' as const,
        text: strings.getRefreshButtonLabel(),
        ariaLabel: strings.getRefreshQueryLabel(),
        color: 'primary' as const,
      };
    };

    function renderDatePickerWithUpdateBtn() {
      if (!shouldRenderUpdateButton() && !shouldRenderDatePicker()) {
        return null;
      }

      const {
        icon: buttonIcon,
        text: buttonText,
        ariaLabel: buttonAriaLabel,
        color: buttonColor,
      } = getSubmitButtonProps();

      const updateButton = props.useBackgroundSearchButton ? (
        <EuiSplitButton color={buttonColor} size="s">
          <EuiSplitButton.ActionPrimary
            iconType={buttonIcon}
            isLoading={props.isLoading}
            isDisabled={isDateRangeInvalid || props.isDisabled}
            onClick={onClickSubmitButton}
            aria-label={buttonAriaLabel}
            data-test-subj="querySubmitButton"
          >
            {buttonText}
          </EuiSplitButton.ActionPrimary>
          <EuiSplitButton.ActionSecondary
            iconType="backgroundTask"
            isLoading={isSendingToBackground}
            isDisabled={!canSendToBackground}
            onClick={onClickSendToBackground}
            tooltipProps={{
              content: strings.getSendToBackgroundLabel(),
              disableScreenReaderOutput: true,
            }}
            aria-label={strings.getSendToBackgroundLabel()}
            data-test-subj="querySubmitButton-secondary-button"
          />
        </EuiSplitButton>
      ) : (
        <EuiSuperUpdateButton
          iconType={buttonIcon}
          iconOnly={submitButtonIconOnly}
          aria-label={buttonAriaLabel}
          isDisabled={isDateRangeInvalid || props.isDisabled}
          isLoading={props.isLoading}
          onClick={onClickSubmitButton}
          size="s"
          color={buttonColor}
          fill={false}
          needsUpdate={props.isDirty}
          data-test-subj="querySubmitButton"
          toolTipProps={{
            content: buttonAriaLabel,
            position: 'bottom',
          }}
        >
          {buttonText}
        </EuiSuperUpdateButton>
      );

      const button = props.customSubmitButton ? (
        React.cloneElement(props.customSubmitButton, { onClick: onClickSubmitButton })
      ) : (
        <EuiFlexItem grow={false}>
          {props.isLoading && propsOnCancel && renderCancelButton()}
          {(!props.isLoading || !propsOnCancel) && updateButton}
        </EuiFlexItem>
      );

      // allows to render the button without the datepicker
      if (!shouldRenderDatePicker() && shouldRenderUpdateButton()) {
        return button;
      }

      return (
        <EuiFlexItem grow={false}>
          <NoDataPopover storage={storage} showNoDataPopover={props.indicateNoData}>
            <EuiFlexGroup alignItems="center" responsive={false} gutterSize="s">
              {shouldRenderESQLUi ? (
                <>
                  {shouldRenderUpdateButton() ? button : null}
                  {shouldRenderDatePicker() ? renderDatePicker() : null}
                </>
              ) : (
                <>
                  {shouldRenderDatePicker() ? renderDatePicker() : null}
                  {shouldRenderUpdateButton() ? button : null}
                </>
              )}
            </EuiFlexGroup>
          </NoDataPopover>
        </EuiFlexItem>
      );
    }

    function renderDataViewsPicker() {
      if (props.dataViewPickerComponentProps && !Boolean(isQueryLangSelected)) {
        return (
          <EuiFlexItem
            css={{
              minWidth: 120,
              maxWidth: isMobile ? '100%' : 'max-content',
              ...(!isMobile && {
                flexBasis: '120px',
                flexGrow: 1,
                flexShrink: 1,
              }),
            }}
            grow={isMobile}
          >
            <DataViewPicker
              {...props.dataViewPickerComponentProps}
              trigger={{ fullWidth: isMobile, ...props.dataViewPickerComponentProps.trigger }}
              isDisabled={props.isDisabled}
            />
          </EuiFlexItem>
        );
      }
    }

    function renderAddButton() {
      return (
        Boolean(props.showAddFilter) &&
        props.filters && (
          <EuiFlexItem grow={false}>
            <AddFilterPopover
              indexPatterns={props.indexPatterns}
              filters={props.filters}
              timeRangeForSuggestionsOverride={props.timeRangeForSuggestionsOverride}
              filtersForSuggestions={props.filtersForSuggestions}
              onFiltersUpdated={props.onFiltersUpdated}
              buttonProps={{
                size: 's',
                display: 'empty',
              }}
              isDisabled={props.isDisabled}
              suggestionsAbstraction={props.suggestionsAbstraction}
            />
          </EuiFlexItem>
        )
      );
    }

    function renderFilterBarToggleButton() {
      return <FilterBarToggleButton />;
    }

    function renderFilterButtonGroup() {
      return (
        (Boolean(props.showAddFilter) || Boolean(props.prepend)) && (
          <EuiFlexItem grow={false} className="kbnQueryBar__filterButtonGroup">
            <EuiFlexGroup gutterSize="s">
              <FilterButtonGroup
                items={[renderAddButton(), props.prepend]}
                attached={renderFilterMenuOnly()}
                size="s"
              />
              {Boolean(props.showAddFilter && props.filters?.length) && (
                <FilterButtonGroup items={[renderFilterBarToggleButton()]} size="s" />
              )}
            </EuiFlexGroup>
          </EuiFlexItem>
        )
      );
    }

    function renderEsqlMenuPopover() {
      return (
        <EuiFlexItem
          grow={false}
          css={css`
            margin-left: auto;
            @media (min-width: ${euiTheme.breakpoint.xl}px) {
              order: 1;
            }
          `}
        >
          <ESQLMenu onESQLDocsFlyoutVisibilityChanged={props.onESQLDocsFlyoutVisibilityChanged} />
        </EuiFlexItem>
      );
    }

    function renderQueryInput() {
      const filterButtonGroup = !renderFilterMenuOnly() && renderFilterButtonGroup();
      const queryInput = shouldRenderQueryInput() && (
        <EuiFlexItem data-test-subj="unifiedQueryInput">
          <QueryStringInput
            disableAutoFocus={props.disableAutoFocus}
            indexPatterns={props.indexPatterns!}
            query={props.query! as Query}
            screenTitle={props.screenTitle}
            onChange={onQueryChange}
            onChangeQueryInputFocus={onChangeQueryInputFocus}
            onSubmit={onInputSubmit}
            persistedLog={persistedLog}
            dataTestSubj={props.dataTestSubj}
            placeholder={props.placeholder}
            isClearable={props.isClearable}
            iconType={props.iconType}
            nonKqlMode={props.nonKqlMode}
            timeRangeForSuggestionsOverride={props.timeRangeForSuggestionsOverride}
            filtersForSuggestions={props.filtersForSuggestions}
            disableLanguageSwitcher={true}
            prepend={renderFilterMenuOnly() && renderFilterButtonGroup()}
            size={props.suggestionsSize}
            suggestionsAbstraction={props.suggestionsAbstraction}
            isDisabled={props.isDisabled}
            appName={appName}
            submitOnBlur={props.submitOnBlur}
            bubbleSubmitEvent={props.bubbleSubmitEvent}
            deps={{
              autocomplete: kql.autocomplete,
              data,
              storage,
              usageCollection,
              notifications,
              docLinks,
              http,
              uiSettings,
              dataViews,
            }}
          />
        </EuiFlexItem>
      );
      if (isQueryLangSelected || (!filterButtonGroup && !queryInput)) {
        return null;
      }
      return (
        <EuiFlexItem
          grow={!shouldShowDatePickerAsBadge()}
          style={{ minWidth: shouldShowDatePickerAsBadge() ? 'auto' : 300, maxWidth: '100%' }}
        >
          <EuiFlexGroup gutterSize="s" responsive={false}>
            {filterButtonGroup}
            {queryInput}
          </EuiFlexGroup>
        </EuiFlexItem>
      );
    }

    function renderESQLEditor() {
      return (
        shouldRenderESQLUi &&
        props.query &&
        isOfAggregateQueryType(props.query) && (
          <ESQLLangEditor
            query={props.query}
            onTextLangQueryChange={props.onTextLangQueryChange}
            errors={props.textBasedLanguageModeErrors}
            warning={props.textBasedLanguageModeWarning}
            expandToFitQueryOnMount
            onTextLangQuerySubmit={async () =>
              onSubmit({
                query: queryRef.current,
                dateRange: dateRangeRef.current,
              })
            }
            isDisabled={props.isDisabled}
            data-test-subj="unifiedTextLangEditor"
            isLoading={props.isLoading}
            initialState={props.esqlEditorInitialState}
            onInitialStateChange={props.onEsqlEditorInitialStateChange}
            controlsContext={
              props.esqlVariablesConfig
                ? {
                    onSaveControl: props.esqlVariablesConfig.onSaveControl,
                    onCancelControl: props.esqlVariablesConfig.onCancelControl ?? (() => {}),
                    supportsControls: true,
                  }
                : undefined
            }
            esqlVariables={props.esqlVariablesConfig?.esqlVariables ?? []}
            onOpenQueryInNewTab={props.onOpenQueryInNewTab}
            queryStats={props.esqlQueryStats}
            enableResourceBrowser={props.enableResourceBrowser}
          />
        )
      );
    }
    const isScreenshotMode = props.isScreenshotMode === true;
    const styles = useMemoCss(inputStringStyles);

    const flexDirection: 'column' | 'row' =
      isMobile && !shouldShowDatePickerAsBadge() ? 'column' : 'row';
    const flexJustifyContent: 'flexStart' | 'flexEnd' = shouldShowDatePickerAsBadge()
      ? 'flexStart'
      : 'flexEnd';
    const queryBarFlexGroupProps = {
      className: 'kbnQueryBar',
      'data-test-subj': 'kbnQueryBar',
      direction: flexDirection,
      responsive: false as const,
      gutterSize: 's' as const,
      justifyContent: flexJustifyContent,
      wrap: true,
      css: css`
        padding: ${isQueryLangSelected && !props.disableExternalPadding ? euiTheme.size.s : 0};
      `,
    };

    return (
      <FilterBarContextProvider filters={props.filters} storage={storage}>
        <SharingMetaFields
          from={currentDateRange.from}
          to={currentDateRange.to}
          dateFormat={uiSettings.get('dateFormat')}
        />
        {!isScreenshotMode &&
          (shouldRenderESQLUi ? (
            <EsqlEditorActionsProvider>
              <EuiFlexGroup {...queryBarFlexGroupProps}>
                {props.dataViewPickerOverride || renderDataViewsPicker()}
                {renderDatePickerWithUpdateBtn()}
                {/* Optional wrapper for the ES|QL controls elements */}
                {Boolean(props.esqlVariablesConfig?.controlsWrapper) && (
                  <EuiFlexItem
                    grow={true}
                    css={css`
                      min-width: 0;
                      @media (max-width: ${euiTheme.breakpoint.xl}px) {
                        order: 1;
                        flex-basis: 100%;
                      }
                    `}
                  >
                    {props.esqlVariablesConfig?.controlsWrapper}
                  </EuiFlexItem>
                )}
                {renderEsqlMenuPopover()}
              </EuiFlexGroup>
              {!shouldShowDatePickerAsBadge() && props.filterBar}
              {renderESQLEditor()}
            </EsqlEditorActionsProvider>
          ) : (
            <>
              <EuiFlexGroup {...queryBarFlexGroupProps}>
                {props.dataViewPickerOverride || renderDataViewsPicker()}
                {renderQueryInput()}
                {props.renderQueryInputAppend?.()}
                {shouldShowDatePickerAsBadge() && props.filterBar}
                {renderDatePickerWithUpdateBtn()}
              </EuiFlexGroup>
              {!shouldShowDatePickerAsBadge() && props.filterBar}
              {renderESQLEditor()}
            </>
          ))}
      </FilterBarContextProvider>
    );
  },
  ({ query: prevQuery, ...prevProps }, { query: nextQuery, ...nextProps }) => {
    let isQueryEqual = true;
    if (prevQuery !== nextQuery) {
      if (!deepEqual(prevQuery, nextQuery)) {
        isQueryEqual = false;
      }
    }

    return isQueryEqual && shallowEqual(prevProps, nextProps);
  }
) as GenericQueryBarTopRow;

const inputStringStyles = {
  datePickerWrapper: ({ euiTheme }: UseEuiTheme) =>
    css({
      '.euiDatePopoverButton-isInvalid': {
        backgroundImage: `linear-gradient(0deg,${euiTheme.colors.danger},${euiTheme.colors.danger} ${euiTheme.size.xxs},#0000 0,#0000)`,
      },
    }),
};
