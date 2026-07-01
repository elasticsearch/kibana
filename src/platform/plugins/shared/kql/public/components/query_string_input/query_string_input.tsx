/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { PureComponent } from 'react';
import classNames from 'classnames';
import { METRIC_TYPE } from '@kbn/analytics';

import type { EuiIconProps, PopoverAnchorPosition } from '@elastic/eui';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormControlLayoutIcons,
  EuiLink,
  EuiOutsideClickDetector,
  EuiPortal,
  EuiTextArea,
  htmlIdGenerator,
  toSentenceCase,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { compact, debounce, isEmpty, isEqual, isFunction, partition } from 'lodash';
import type { CoreStart, DocLinksStart, Toast } from '@kbn/core/public';
import type { Query, Filter } from '@kbn/es-query';
import { getQueryLog } from '@kbn/data-plugin/public';
import type { DataViewsPublicPluginStart } from '@kbn/data-views-plugin/public';
import { type DataView } from '@kbn/data-views-plugin/public';
import type { PersistedLog, DataPublicPluginStart } from '@kbn/data-plugin/public';
import {
  getFieldSubtypeNested,
  KIBANA_USER_QUERY_LANGUAGE_KEY,
  KQL_TELEMETRY_ROUTE_LATEST_VERSION,
} from '@kbn/data-plugin/common';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { IStorageWrapper } from '@kbn/kibana-utils-plugin/public';
import type { UsageCollectionStart } from '@kbn/usage-collection-plugin/public';
import { buildQueryFromFilters } from '@kbn/es-query';
import { matchPairs } from './match_pairs';
import { toUser } from './to_user';
import { fromUser } from './from_user';
import { type DataViewByIdOrTitle, fetchIndexPatterns } from './fetch_index_patterns';
import { QueryLanguageSwitcher } from './language_switcher';
import type {
  SuggestionsAbstraction,
  SuggestionsListSize,
} from '../typeahead/suggestions_component';
import { SuggestionsComponent } from '../typeahead';
import { onRaf } from '../utils';
import { FilterButtonGroup } from './filter_button_group';
import type { AutocompleteService, QuerySuggestion } from '../../autocomplete';
import { QuerySuggestionTypes } from '../../autocomplete';
import { getCoreStart } from '../../services';
import { StyledDiv } from './query_string_input.styles';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function recentSearchEntryToText(recentSearch: unknown): string {
  if (typeof recentSearch === 'string') {
    return recentSearch;
  }
  if (isRecord(recentSearch)) {
    return toUser(recentSearch);
  }
  return '';
}

export const strings = {
  getSearchInputPlaceholderForText: () =>
    i18n.translate('kql.query.queryBar.searchInputPlaceholderForText', {
      defaultMessage: 'Filter your data',
    }),
  getSearchInputPlaceholder: (language: string) =>
    i18n.translate('kql.query.queryBar.searchInputPlaceholder', {
      defaultMessage: 'Filter your data using {language} syntax',
      values: { language },
    }),
  getQueryBarComboboxAriaLabel: (pageType: string) =>
    i18n.translate('kql.query.queryBar.comboboxAriaLabel', {
      defaultMessage: 'Search and filter the {pageType} page',
      values: { pageType },
    }),
  getQueryBarSearchInputAriaLabel: (pageType: string) =>
    i18n.translate('kql.query.queryBar.searchInputAriaLabel', {
      defaultMessage: 'Start typing to search and filter the {pageType} page',
      values: { pageType },
    }),
  getQueryBarClearInputLabel: () =>
    i18n.translate('kql.query.queryBar.clearInputLabel', {
      defaultMessage: 'Clear input',
    }),
  getKQLNestedQuerySyntaxInfoTitle: () =>
    i18n.translate('kql.query.queryBar.KQLNestedQuerySyntaxInfoTitle', {
      defaultMessage: 'KQL nested query syntax',
    }),
};

export interface QueryStringInputDependencies {
  autocomplete: ReturnType<AutocompleteService['start']>;
  usageCollection?: UsageCollectionStart;
  data: DataPublicPluginStart;
  storage: IStorageWrapper;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
  docLinks: DocLinksStart;
  uiSettings: CoreStart['uiSettings'];
  dataViews: DataViewsPublicPluginStart;
}

export interface QueryStringInputProps {
  indexPatterns: Array<DataView | string | DataViewByIdOrTitle>;
  query: Query;
  disableAutoFocus?: boolean;
  screenTitle?: string;
  prepend?: any;
  persistedLog?: PersistedLog;
  bubbleSubmitEvent?: boolean;
  placeholder?: string;
  disableLanguageSwitcher?: boolean;
  languageSwitcherPopoverAnchorPosition?: PopoverAnchorPosition;
  onBlur?: () => void;
  onChange?: (query: Query) => void;
  onChangeQueryInputFocus?: (isFocused: boolean) => void;
  onSubmit?: (query: Query) => void;
  submitOnBlur?: boolean;
  dataTestSubj?: string;
  size?: SuggestionsListSize;
  suggestionsAbstraction?: SuggestionsAbstraction;
  className?: string;
  isInvalid?: boolean;
  isClearable?: boolean;
  iconType?: EuiIconProps['type'];
  isDisabled?: boolean;
  appName: string;
  deps: QueryStringInputDependencies;

  /**
   * @param nonKqlMode by default if language switch is enabled, user can switch between kql and lucene syntax mode
   * this params add another option text, which is just a  simple keyword search mode, the way a simple search box works
   */
  nonKqlMode?: 'lucene' | 'text';
  /**
   * @param autoSubmit if user selects a value, in that case kuery will be auto submitted
   */
  autoSubmit?: boolean;
  /**
   * @param storageKey this key is used to use user preference between kql and non-kql mode
   */
  storageKey?: string;

  /**
   * Override whether autocomplete suggestions are restricted by time range.
   */
  timeRangeForSuggestionsOverride?: boolean;

  /**
   * Add additional filters used for suggestions
   */
  filtersForSuggestions?: Filter[];

  /**
   * Debounce delay in ms for fetching suggestions. Defaults to 100.
   */
  suggestionsDebounceMs?: number;
}

interface State {
  isSuggestionsVisible: boolean;
  index: number | null;
  suggestions: QuerySuggestion[];
  suggestionLimit: number;
  selectionStart: number | null;
  selectionEnd: number | null;
  indexPatterns: DataView[];

  /**
   * Part of state because passed down to child components
   */
  queryBarInputDiv: HTMLDivElement | null;
}

const KEY_CODES = {
  LEFT: 37,
  UP: 38,
  RIGHT: 39,
  DOWN: 40,
  ENTER: 13,
  ESC: 27,
  TAB: 9,
  HOME: 36,
  END: 35,
};

export class QueryStringInput extends PureComponent<QueryStringInputProps, State> {
  static defaultProps = {
    storageKey: KIBANA_USER_QUERY_LANGUAGE_KEY,
    iconType: 'magnify',
    isClearable: true,
  };

  public state: State = {
    isSuggestionsVisible: false,
    index: null,
    suggestions: [],
    suggestionLimit: 50,
    selectionStart: null,
    selectionEnd: null,
    indexPatterns: [],
    queryBarInputDiv: null,
  };

  public inputRef: HTMLTextAreaElement | null = null;

  private persistedLog: PersistedLog | undefined;
  private abortController?: AbortController;
  private fetchIndexPatternsAbortController?: AbortController;

  private reportUiCounter = this.props.deps.usageCollection?.reportUiCounter.bind(
    this.props.deps.usageCollection,
    this.props.appName
  );
  private componentIsUnmounting = false;
  private hasScrollListener = false;

  /**
   * If any element within the container is currently focused
   * @internal
   */
  private isFocusWithin = false;

  private getQueryString = () => {
    return toUser(this.props.query.query);
  };

  private fetchIndexPatterns = () => {
    const [objectPatterns = [], stringPatterns = []] = partition<
      QueryStringInputProps['indexPatterns'][number],
      DataView
    >(this.props.indexPatterns || [], (indexPattern): indexPattern is DataView => {
      return (
        typeof indexPattern === 'object' &&
        Object.hasOwn(indexPattern, 'fields') &&
        Object.hasOwn(indexPattern, 'title')
      );
    });
    const idOrTitlePatterns: DataViewByIdOrTitle[] = stringPatterns.map((sp) =>
      typeof sp === 'string' ? { type: 'title', value: sp } : sp
    );

    if (idOrTitlePatterns.length === 0) {
      this.setState({ indexPatterns: objectPatterns });
      this.updateSuggestions();
      return;
    }

    this.fetchIndexPatternsDebounced(objectPatterns, idOrTitlePatterns);
  };

  private fetchIndexPatternsDebounced = debounce(
    async (objectPatterns: DataView[], idOrTitlePatterns: DataViewByIdOrTitle[]) => {
      // abort the previous fetch to avoid overriding with outdated data
      // issue https://github.com/elastic/kibana/issues/80831
      if (this.fetchIndexPatternsAbortController) this.fetchIndexPatternsAbortController.abort();
      this.fetchIndexPatternsAbortController = new AbortController();
      const currentAbortController = this.fetchIndexPatternsAbortController;

      const objectPatternsFromStrings = await fetchIndexPatterns(
        this.props.deps.data.dataViews,
        idOrTitlePatterns
      );

      if (!currentAbortController.signal.aborted) {
        this.setState({
          indexPatterns: [...objectPatterns, ...objectPatternsFromStrings],
        });

        this.updateSuggestions();
      }
    },
    200
  );

  private getSuggestions = async () => {
    if (!this.inputRef) {
      return;
    }

    const language = this.props.query.language;
    const queryString = this.getQueryString();

    const recentSearchSuggestions = this.getRecentSearchSuggestions(queryString);

    const hasQuerySuggestions = this.props.deps.autocomplete.hasQuerySuggestions(language);

    if (
      !hasQuerySuggestions ||
      !Array.isArray(this.state.indexPatterns) ||
      compact(this.state.indexPatterns).length === 0
    ) {
      return recentSearchSuggestions;
    }

    const indexPatterns = this.state.indexPatterns;

    const { selectionStart, selectionEnd } = this.inputRef;
    if (selectionStart === null || selectionEnd === null) {
      return;
    }

    try {
      if (this.abortController) this.abortController.abort();
      this.abortController = new AbortController();
      const suggestions =
        (await this.props.deps.autocomplete.getQuerySuggestions({
          language,
          indexPatterns,
          query: queryString,
          selectionStart,
          selectionEnd,
          signal: this.abortController.signal,
          useTimeRange: this.props.timeRangeForSuggestionsOverride,
          boolFilter: buildQueryFromFilters(this.props.filtersForSuggestions, undefined).filter,
          method: this.props.filtersForSuggestions?.length ? 'terms_agg' : undefined,
          suggestionsAbstraction: this.props.suggestionsAbstraction,
        })) || [];
      return [...suggestions, ...recentSearchSuggestions];
    } catch (e) {
      // TODO: Waiting on https://github.com/elastic/kibana/issues/51406 for a properly typed error
      // Ignore aborted requests
      if (e.message === 'The user aborted a request.') return;

      this.reportUiCounter?.(METRIC_TYPE.LOADED, `query_string:suggestions_error`);

      throw e;
    }
  };

  private getRecentSearchSuggestions = (query: string) => {
    if (!this.persistedLog) {
      return [];
    }
    const recentSearches = this.persistedLog.get();
    const matchingRecentSearches = recentSearches.filter((recentQuery) => {
      const recentQueryString = recentSearchEntryToText(recentQuery);
      return recentQueryString !== '' && recentQueryString.includes(query);
    });
    return matchingRecentSearches.map((recentSearch) => {
      const text = recentSearchEntryToText(recentSearch);
      const start = 0;
      const end = query.length;
      return { type: QuerySuggestionTypes.RecentSearch, text, start, end };
    });
  };

  private updateSuggestions = debounce(async () => {
    const suggestions = (await this.getSuggestions()) || [];
    if (!this.componentIsUnmounting) {
      this.setState({ suggestions });
    }
  }, this.props.suggestionsDebounceMs ?? 100);

  private onSubmit = (query: Query) => {
    if (this.props.onSubmit) {
      if (this.persistedLog) {
        this.persistedLog.add(query.query);
      }

      this.props.onSubmit({ query: fromUser(query.query), language: query.language });
    }
  };

  private onChange = (query: Query) => {
    this.updateSuggestions();

    if (this.props.onChange) {
      this.props.onChange({ query: fromUser(query.query), language: query.language });
    }
  };

  private onQueryStringChange = (value: string) => {
    this.setState({
      isSuggestionsVisible: true,
      index: null,
      suggestionLimit: 50,
    });

    if (this.props.query.query !== value) {
      this.onChange({ query: value, language: this.props.query.language });
    }
  };

  private onInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = this.formatTextAreaValue(event.target.value);
    this.onQueryStringChange(value);
    if (event.target.value === '') {
      this.handleRemoveHeight();
    } else {
      this.handleAutoHeight();
    }
  };

  private onClickInput = (event: React.MouseEvent<HTMLTextAreaElement>) => {
    if (event.target instanceof HTMLTextAreaElement) {
      const value = this.formatTextAreaValue(event.target.value);
      this.onQueryStringChange(value);
    }
  };

  private onKeyUp = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ([KEY_CODES.LEFT, KEY_CODES.RIGHT, KEY_CODES.HOME, KEY_CODES.END].includes(event.keyCode)) {
      this.setState({ isSuggestionsVisible: true });
      if (event.target instanceof HTMLTextAreaElement) {
        const value = this.formatTextAreaValue(event.target.value);
        this.onQueryStringChange(value);
      }
    }
  };

  private onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.target instanceof HTMLTextAreaElement) {
      const { isSuggestionsVisible, index } = this.state;
      const preventDefault = event.preventDefault.bind(event);
      const { target, key, metaKey } = event;
      const { value, selectionStart, selectionEnd } = target;
      const updateQuery = (query: string, newSelectionStart: number, newSelectionEnd: number) => {
        this.onQueryStringChange(query);

        if (
          this.inputRef?.selectionStart !== newSelectionStart ||
          this.inputRef?.selectionEnd !== newSelectionEnd
        ) {
          this.setState({
            selectionStart: newSelectionStart,
            selectionEnd: newSelectionEnd,
          });
        }
      };

      switch (event.keyCode) {
        case KEY_CODES.DOWN:
          if (isSuggestionsVisible && index !== null) {
            event.preventDefault();
            this.incrementIndex(index);
            // Note to engineers. `isSuggestionVisible` does not mean the suggestions are visible.
            // This should likely be fixed, it's more that suggestions can be shown.
          } else if ((isSuggestionsVisible && index == null) || this.getQueryString() === '') {
            event.preventDefault();
            this.setState({ isSuggestionsVisible: true, index: 0 });
          }
          break;
        case KEY_CODES.UP:
          if (isSuggestionsVisible && index !== null) {
            event.preventDefault();
            this.decrementIndex(index);
          }
          break;
        case KEY_CODES.ENTER:
          if (!this.props.bubbleSubmitEvent) {
            event.preventDefault();
          }
          if (isSuggestionsVisible && index !== null && this.state.suggestions[index]) {
            event.preventDefault();
            this.selectSuggestion(this.state.suggestions[index], index);
          } else {
            this.onSubmit(this.props.query);
            this.setState({
              isSuggestionsVisible: false,
            });
          }
          break;
        case KEY_CODES.ESC:
          if (isSuggestionsVisible) {
            event.preventDefault();
            // Without this, the Esc keeps bubbling up to ancestor handlers
            // (e.g. EuiFlyout's Esc-to-close), so closing the autocomplete
            // would also dismiss the surrounding overlay.
            event.stopPropagation();
          }
          this.setState({ isSuggestionsVisible: false, index: null });
          break;
        case KEY_CODES.TAB:
          this.setState({ isSuggestionsVisible: false, index: null });
          break;
        default:
          if (selectionStart !== null && selectionEnd !== null) {
            matchPairs({
              value,
              selectionStart,
              selectionEnd,
              key,
              metaKey,
              updateQuery,
              preventDefault,
            });
          }

          break;
      }
    }
  };

  private selectSuggestion = (suggestion: QuerySuggestion, listIndex: number) => {
    if (!this.inputRef) {
      return;
    }
    const { type, text, start, end, cursorIndex } = suggestion;

    this.handleNestedFieldSyntaxNotification(suggestion);

    const query = this.getQueryString();
    const { selectionStart, selectionEnd } = this.inputRef;
    if (selectionStart === null || selectionEnd === null) {
      return;
    }

    const value = query.substr(0, selectionStart) + query.substr(selectionEnd);
    const newQueryString = value.substr(0, start) + text + value.substr(end);

    this.reportUiCounter?.(
      METRIC_TYPE.CLICK,
      `query_string:${type}:suggestions_select_position_${listIndex}`
    );
    this.reportUiCounter?.(
      METRIC_TYPE.CLICK,
      `query_string:${type}:suggestions_select_q_length_${end - start}`
    );

    this.onQueryStringChange(newQueryString);

    this.setState({
      selectionStart: start + (cursorIndex ? cursorIndex : text.length),
      selectionEnd: start + (cursorIndex ? cursorIndex : text.length),
    });
    const isTypeRecentSearch = type === QuerySuggestionTypes.RecentSearch;

    const isAutoSubmitAndValid =
      this.props.autoSubmit &&
      (type === QuerySuggestionTypes.Value || [':*', ': *'].includes(value.trim()));

    if (isTypeRecentSearch || isAutoSubmitAndValid) {
      this.setState({ isSuggestionsVisible: false, index: null });
      this.onSubmit({ query: newQueryString, language: this.props.query.language });
    }
  };

  private handleNestedFieldSyntaxNotification = (suggestion: QuerySuggestion) => {
    const subTypeNested = 'field' in suggestion && getFieldSubtypeNested(suggestion.field);
    if (
      subTypeNested &&
      subTypeNested.nested &&
      !this.props.deps.storage.get('kibana.KQLNestedQuerySyntaxInfoOptOut')
    ) {
      const { notifications, docLinks } = this.props.deps;

      const onKQLNestedQuerySyntaxInfoOptOut = (toast: Toast) => {
        if (!this.props.deps.storage) return;
        this.props.deps.storage.set('kibana.KQLNestedQuerySyntaxInfoOptOut', true);
        notifications!.toasts.remove(toast);
      };

      if (notifications && docLinks) {
        const toast = notifications.toasts.add({
          title: strings.getKQLNestedQuerySyntaxInfoTitle(),
          text: toMountPoint(
            <div>
              <p>
                <FormattedMessage
                  id="kql.query.queryBar.KQLNestedQuerySyntaxInfoText"
                  defaultMessage="It looks like you're querying on a nested field.
                  You can construct KQL syntax for nested queries in different ways, depending on the results you want.
                  Learn more in our {link}."
                  values={{
                    link: (
                      <EuiLink href={docLinks.links.query.kueryQuerySyntax} target="_blank">
                        <FormattedMessage
                          id="kql.query.queryBar.KQLNestedQuerySyntaxInfoDocLinkText"
                          defaultMessage="docs"
                        />
                      </EuiLink>
                    ),
                  }}
                />
              </p>
              <EuiFlexGroup justifyContent="flexEnd" gutterSize="s">
                <EuiFlexItem grow={false}>
                  <EuiButton size="s" onClick={() => onKQLNestedQuerySyntaxInfoOptOut(toast)}>
                    <FormattedMessage
                      id="kql.query.queryBar.KQLNestedQuerySyntaxInfoOptOutText"
                      defaultMessage="Don't show again"
                    />
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
            </div>,
            getCoreStart()
          ),
        });
      }
    }
  };

  private increaseLimit = () => {
    this.setState({
      suggestionLimit: this.state.suggestionLimit + 50,
    });
  };

  private incrementIndex = (currentIndex: number) => {
    let nextIndex = currentIndex + 1;
    if (currentIndex === null || nextIndex >= this.state.suggestions.length) {
      nextIndex = 0;
    }
    this.setState({ index: nextIndex });
  };

  private decrementIndex = (currentIndex: number) => {
    const previousIndex = currentIndex - 1;
    if (previousIndex < 0) {
      this.setState({ index: this.state.suggestions.length - 1 });
    } else {
      this.setState({ index: previousIndex });
    }
  };

  private onSelectLanguage = (language: string) => {
    // Send telemetry info every time the user opts in or out of kuery
    // As a result it is important this function only ever gets called in the
    // UI component's change handler.
    this.props.deps.http.post('/internal/kql_opt_in_stats', {
      version: KQL_TELEMETRY_ROUTE_LATEST_VERSION,
      body: JSON.stringify({ opt_in: language === 'kuery' }),
    });

    const storageKey = this.props.storageKey;
    this.props.deps.storage.set(storageKey!, language);

    const newQuery = { query: '', language };
    this.onChange(newQuery);
    this.onSubmit(newQuery);
    this.reportUiCounter?.(
      METRIC_TYPE.LOADED,
      storageKey ? `${storageKey}:language:${language}` : `query_string:language:${language}`
    );
  };

  private onOutsideClick = () => {
    if (this.state.isSuggestionsVisible) {
      this.setState({ isSuggestionsVisible: false, index: null });
      this.scheduleOnInputBlur();
    }
  };

  private blurTimeoutHandle: number | undefined;
  /**
   * Notify parent about input's blur after a delay only
   * if the focus didn't get back inside the input container
   * and if suggestions were closed
   * https://github.com/elastic/kibana/issues/92040
   */
  private scheduleOnInputBlur = () => {
    clearTimeout(this.blurTimeoutHandle);
    this.blurTimeoutHandle = window.setTimeout(() => {
      if (!this.isFocusWithin && !this.state.isSuggestionsVisible && !this.componentIsUnmounting) {
        this.handleBlurHeight();
        if (this.props.onChangeQueryInputFocus) {
          this.props.onChangeQueryInputFocus(false);
        }

        if (this.props.submitOnBlur) {
          this.onSubmit(this.props.query);
        }
      }
    }, 50);
  };

  private onInputBlur = () => {
    if (isFunction(this.props.onBlur)) {
      this.props.onBlur();
    }
  };

  private handleResize = () => {
    this.handleAutoHeight();
    this.handleBlurOnScroll();
  };

  private onClickSuggestion = (suggestion: QuerySuggestion, index: number) => {
    if (!this.inputRef) {
      return;
    }
    this.selectSuggestion(suggestion, index);
    this.inputRef.focus();
  };

  private initPersistedLog = () => {
    const { uiSettings } = this.props.deps;
    const { appName } = this.props;
    this.persistedLog = this.props.persistedLog
      ? this.props.persistedLog
      : getQueryLog(uiSettings, this.props.deps.storage, appName, this.props.query.language);
  };

  public onMouseEnterSuggestion = (_suggestion: QuerySuggestion, index: number) => {
    this.setState({ index });
  };

  textareaId = htmlIdGenerator()();

  public componentDidMount() {
    const parsedQuery = fromUser(toUser(this.props.query.query));
    if (!isEqual(this.props.query.query, parsedQuery)) {
      this.onChange({ ...this.props.query, query: parsedQuery });
    }

    this.initPersistedLog();
    this.fetchIndexPatterns();
    this.handleAutoHeight();

    window.addEventListener('resize', this.handleResize);

    this.handleBlurOnScroll();
  }

  public componentDidUpdate(prevProps: QueryStringInputProps) {
    const parsedQuery = fromUser(toUser(this.props.query.query));
    if (!isEqual(this.props.query.query, parsedQuery)) {
      this.onChange({ ...this.props.query, query: parsedQuery });
    }

    this.initPersistedLog();

    if (!isEqual(prevProps.indexPatterns, this.props.indexPatterns)) {
      this.fetchIndexPatterns();
    } else if (!isEqual(prevProps.query, this.props.query)) {
      this.updateSuggestions();
    }

    if (this.state.selectionStart !== null && this.state.selectionEnd !== null) {
      if (this.inputRef != null) {
        this.inputRef.setSelectionRange(this.state.selectionStart, this.state.selectionEnd);
      }
      this.setState({
        selectionStart: null,
        selectionEnd: null,
      });
    }

    if (document.activeElement !== null && document.activeElement.id === this.textareaId) {
      this.handleAutoHeight();
    } else {
      this.handleRemoveHeight();
    }
  }

  public componentWillUnmount() {
    if (this.abortController) this.abortController.abort();
    if (this.fetchIndexPatternsAbortController) this.fetchIndexPatternsAbortController.abort();
    if (this.updateSuggestions.cancel) this.updateSuggestions.cancel();
    if (this.fetchIndexPatternsDebounced.cancel) this.fetchIndexPatternsDebounced.cancel();
    if (this.props.onChangeQueryInputFocus) {
      this.props.onChangeQueryInputFocus(false);
    }
    this.componentIsUnmounting = true;
    window.removeEventListener('resize', this.handleResize);
    if (this.hasScrollListener) window.removeEventListener('scroll', this.onOutsideClick);
  }

  handleAutoHeight = onRaf(() => {
    if (this.inputRef !== null && document.activeElement === this.inputRef) {
      this.inputRef.classList.add('kbnQueryBar__textarea--autoHeight');
      this.inputRef.style.setProperty('height', `${this.inputRef.scrollHeight}px`, 'important');
    }
  });

  handleBlurOnScroll = onRaf(() => {
    // for small screens, unified search bar is no longer sticky,
    // so we need to blur the input when it scrolls out of view
    // TODO: replace screen width value with euiTheme breakpoint once this component is converted to a functional component
    const isSmallScreen = window.innerWidth < 768;

    if (isSmallScreen && !this.hasScrollListener) {
      window.addEventListener('scroll', this.onOutsideClick);
      this.hasScrollListener = true;
    } else if (!isSmallScreen && this.hasScrollListener) {
      window.removeEventListener('scroll', this.onOutsideClick);
      this.hasScrollListener = false;
    }
  });

  handleRemoveHeight = onRaf(() => {
    if (this.inputRef !== null) {
      this.inputRef.style.removeProperty('height');
      this.inputRef.classList.remove('kbnQueryBar__textarea--autoHeight');
    }
  });

  handleBlurHeight = onRaf(() => {
    if (this.inputRef !== null) {
      this.handleRemoveHeight();
      this.inputRef.scrollTop = 0;
    }
  });

  handleOnFocus = () => {
    if (this.props.onChangeQueryInputFocus) {
      this.props.onChangeQueryInputFocus(true);
    }

    this.handleAutoHeight();
  };

  getSearchInputPlaceholder = () => {
    if (!this.props.query.language || this.props.query.language === 'text') {
      return strings.getSearchInputPlaceholderForText();
    }
    const language =
      this.props.query.language === 'kuery' ? 'KQL' : toSentenceCase(this.props.query.language);

    return strings.getSearchInputPlaceholder(language);
  };

  public render() {
    const isSuggestionsVisible = this.state.isSuggestionsVisible && {
      'aria-controls': 'kbnTypeahead__items',
      'aria-owns': 'kbnTypeahead__items',
    };
    const ariaCombobox = { ...isSuggestionsVisible, role: 'combobox' };

    const simpleLanguageSwitcher = this.props.disableLanguageSwitcher ? null : (
      <QueryLanguageSwitcher
        language={this.props.query.language}
        anchorPosition={this.props.languageSwitcherPopoverAnchorPosition}
        onSelectLanguage={this.onSelectLanguage}
        nonKqlMode={this.props.nonKqlMode}
        deps={{
          docLinks: this.props.deps.docLinks,
        }}
      />
    );

    const prependElement =
      this.props.prepend || simpleLanguageSwitcher ? (
        <FilterButtonGroup attached items={[this.props.prepend, simpleLanguageSwitcher]} />
      ) : undefined;

    const containerClassName = classNames('kbnQueryBar__wrap', this.props.className);
    const inputClassName = classNames('kbnQueryBar__textarea', 'eui-scrollBar', {
      'kbnQueryBar__textarea--withIcon': this.props.iconType,
      'kbnQueryBar__textarea--isClearable': this.props.isClearable,
      'kbnQueryBar__textarea--withPrepend': prependElement,
    });
    const inputWrapClassName = classNames('kbnQueryBar__textareaWrap', {
      'kbnQueryBar__textareaWrap--withSuggestionVisible':
        isSuggestionsVisible && !isEmpty(this.state.suggestions),
    });
    return (
      <StyledDiv
        className={containerClassName}
        onFocus={this.onFocusWithin}
        onBlur={this.onBlurWithin}
      >
        {prependElement}

        <EuiOutsideClickDetector onOutsideClick={this.onOutsideClick}>
          <div
            {...ariaCombobox}
            className="kbnQueryBar__textareaWrapOuter"
            aria-label={strings.getQueryBarComboboxAriaLabel(this.props.appName)}
            aria-haspopup="true"
            aria-expanded={this.state.isSuggestionsVisible}
            data-skip-axe="aria-required-children"
          >
            <div role="search" className={inputWrapClassName} ref={this.assignQueryInputDivRef}>
              <EuiTextArea
                placeholder={this.props.placeholder || this.getSearchInputPlaceholder()}
                value={this.forwardNewValueIfNeeded(this.getQueryString())}
                onKeyDown={this.onKeyDown}
                onKeyUp={this.onKeyUp}
                onChange={this.onInputChange}
                onClick={this.onClickInput}
                onBlur={this.onInputBlur}
                onFocus={this.handleOnFocus}
                disabled={this.props.isDisabled}
                className={inputClassName}
                fullWidth
                resize="none"
                rows={1}
                id={this.textareaId}
                autoFocus={
                  this.props.onChangeQueryInputFocus ? false : !this.props.disableAutoFocus
                }
                inputRef={this.assignInputRef}
                autoComplete="off"
                spellCheck={false}
                aria-label={strings.getQueryBarSearchInputAriaLabel(this.props.appName)}
                aria-autocomplete="list"
                aria-controls={this.state.isSuggestionsVisible ? 'kbnTypeahead__items' : undefined}
                aria-activedescendant={
                  this.state.isSuggestionsVisible && typeof this.state.index === 'number'
                    ? `suggestion-${this.state.index}`
                    : undefined
                }
                role="textbox"
                data-test-subj={this.props.dataTestSubj || 'queryInput'}
                isInvalid={this.props.isInvalid}
              >
                {this.forwardNewValueIfNeeded(this.getQueryString())}
              </EuiTextArea>
              {this.props.iconType ? (
                <EuiFormControlLayoutIcons
                  side="left"
                  iconsPosition="absolute"
                  icon={{ type: this.props.iconType }}
                  isDisabled={this.props.isDisabled}
                />
              ) : null}
              {this.props.isClearable && !this.props.isDisabled && this.props.query.query ? (
                <EuiFormControlLayoutIcons
                  side="right"
                  iconsPosition="absolute"
                  clear={{
                    onClick: () => {
                      this.onQueryStringChange('');
                      // Force close the dropdown/suggestions
                      this.setState({
                        isSuggestionsVisible: false,
                        index: null,
                      });
                      if (this.props.autoSubmit) {
                        this.onSubmit({ query: '', language: this.props.query.language });
                      }
                    },
                    title: strings.getQueryBarClearInputLabel(),
                  }}
                />
              ) : null}
            </div>
            <EuiPortal>
              <SuggestionsComponent
                show={this.state.isSuggestionsVisible}
                suggestions={this.state.suggestions.slice(0, this.state.suggestionLimit)}
                index={this.state.index}
                onClick={this.onClickSuggestion}
                onMouseEnter={this.onMouseEnterSuggestion}
                loadMore={this.increaseLimit}
                size={this.props.size}
                inputContainer={this.state.queryBarInputDiv}
              />
            </EuiPortal>
          </div>
        </EuiOutsideClickDetector>
      </StyledDiv>
    );
  }

  /**
   * Used to apply any string formatting to textarea value before converting it to {@link Query} and emitting it to the parent.
   * This is a bit lower level then {@link fromUser} and needed to address any cross-browser inconsistencies where
   * {@link forwardNewValueIfNeeded} should be kept in mind
   */
  private formatTextAreaValue(newValue: string): string {
    // Safari has a bug that it sometimes uses a non-breaking space instead of a regular space
    // this breaks the search query: https://github.com/elastic/kibana/issues/87176
    return newValue.replace(/\u00A0/g, ' ');
  }

  /**
   * When passing a "value" prop into a textarea,
   * check first if value has changed because of {@link formatTextAreaValue},
   * if this is just a formatting change, then skip this update by re-using current textarea value.
   * This is needed to avoid re-rendering to preserve focus and selection
   * @internal
   */
  private forwardNewValueIfNeeded(newQueryString: string) {
    const oldQueryString = this.inputRef?.value ?? '';

    const formattedNewQueryString = this.formatTextAreaValue(newQueryString);
    // if old & new values are equal with formatting applied, then return an old query without formatting applied
    if (formattedNewQueryString === this.formatTextAreaValue(oldQueryString)) {
      return oldQueryString;
    } else {
      return formattedNewQueryString;
    }
  }

  private assignInputRef = (node: HTMLTextAreaElement | null) => {
    this.inputRef = node;
  };

  private assignQueryInputDivRef = (node: HTMLDivElement | null) => {
    if (this.state.queryBarInputDiv !== node) {
      this.setState({ queryBarInputDiv: node });
    }
  };

  private onFocusWithin = () => {
    this.isFocusWithin = true;
  };

  private onBlurWithin = () => {
    this.isFocusWithin = false;
    this.scheduleOnInputBlur();
  };
}
