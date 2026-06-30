/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { v4 as uuidv4 } from 'uuid';
import { memoize, once } from 'lodash';
import type { Observable, Subscription } from 'rxjs';
import {
  BehaviorSubject,
  catchError,
  EMPTY,
  filter,
  finalize,
  from,
  fromEvent,
  map,
  of,
  shareReplay,
  skip,
  switchMap,
  take,
  takeUntil,
  tap,
  throwError,
} from 'rxjs';
import type { estypes } from '@elastic/elasticsearch';
import type {
  AsyncSearchGetResponse,
  ErrorResponseBase,
  EsqlAsyncQueryResponse,
} from '@elastic/elasticsearch/lib/api/types';
import { i18n } from '@kbn/i18n';
import type { PublicMethodsOf } from '@kbn/utility-types';
import type { HttpSetup, IHttpFetchError } from '@kbn/core-http-browser';
import { type Start as InspectorStart, RequestAdapter } from '@kbn/inspector-plugin/public';

import type {
  AnalyticsServiceStart,
  ApplicationStart,
  CoreStart,
  DocLinksStart,
  ExecutionContextSetup,
  I18nStart,
  IUiSettingsClient,
  ThemeServiceStart,
  ToastsSetup,
  UserProfileService,
} from '@kbn/core/public';

import { buildPath } from '@kbn/core-http-browser';
import { toMountPoint } from '@kbn/react-kibana-mount';
import type { KibanaServerError } from '@kbn/kibana-utils-plugin/public';
import { AbortError } from '@kbn/kibana-utils-plugin/public';
import type {
  IKibanaSearchRequest,
  IKibanaSearchResponse,
  ISearchOptions,
  ISearchOptionsSerializable,
  SanitizedConnectionRequestParams,
} from '@kbn/search-types';
import { createEsError, isEsError, renderSearchError } from '@kbn/search-errors';
import { AbortReason, defaultFreeze } from '@kbn/kibana-utils-plugin/common';
import type { ICPSManager } from '@kbn/cps-utils';
import moment from 'moment';
import {
  EVENT_TYPE_DATA_SEARCH_TIMEOUT,
  EVENT_PROPERTY_SEARCH_TIMEOUT_MS,
  EVENT_PROPERTY_EXECUTION_CONTEXT,
} from '../constants';
import type { IAsyncSearchOptions } from '../../../common';
import {
  ENHANCED_ES_SEARCH_STRATEGY,
  ESQL_ASYNC_SEARCH_STRATEGY,
  getTotalLoaded,
  isRunningResponse,
  pollSearch,
  shimHitsTotal,
  strategyToString,
  UI_SETTINGS,
} from '../../../common';
import type { SearchUsageCollector } from '../collectors';
import { SearchTimeoutError, TimeoutErrorMode } from './timeout_error';
import { SearchSessionIncompleteWarning } from './search_session_incomplete_warning';
import { toPartialResponseAfterTimeout } from './to_partial_response';
import type { ISessionService } from '../session';
import { SearchSessionState } from '../session';
import { SearchResponseCache } from './search_response_cache';
import { SearchAbortController } from './search_abort_controller';
import type { SearchConfigSchema } from '../../../server/config';
import type { SearchServiceStartDependencies } from '../search_service';
import {
  createRequestHashForBackgroundSearches,
  createRequestHashForClientCache,
} from './create_request_hash';

export interface SearchInterceptorDeps {
  http: HttpSetup;
  executionContext: ExecutionContextSetup;
  uiSettings: IUiSettingsClient;
  startServices: Promise<[CoreStart, object, unknown]>;
  toasts: ToastsSetup;
  usageCollector?: SearchUsageCollector;
  session: ISessionService;
  searchConfig: SearchConfigSchema;
  getCPSManager?: () => ICPSManager | undefined;
}

const MAX_CACHE_ITEMS = 50;
const MAX_CACHE_SIZE_MB = 10;

const DEFAULT_MULTIPLEXING_POLL_LENGTH = '30s';

export class SearchInterceptor {
  private uiSettingsSubs: Subscription[] = [];
  private searchTimeout: number;
  private readonly responseCache: SearchResponseCache = new SearchResponseCache(
    MAX_CACHE_ITEMS,
    MAX_CACHE_SIZE_MB
  );
  private protocolSupportsMultiplexing: boolean = false;
  private performanceObserver?: PerformanceObserver;

  /**
   * Observable that emits when the number of pending requests changes.
   * @internal
   */
  private pendingCount$ = new BehaviorSubject(0);

  /**
   * @internal
   */
  private application!: ApplicationStart;
  private docLinks!: DocLinksStart;
  private inspector!: InspectorStart;
  /*
   * Services for toMountPoint
   * @internal
   */
  private startRenderServices!: {
    analytics: Pick<AnalyticsServiceStart, 'reportEvent'>;
    i18n: I18nStart;
    theme: Pick<ThemeServiceStart, 'theme$'>;
    userProfile: UserProfileService;
  };

  /*
   * @internal
   */
  constructor(private readonly deps: SearchInterceptorDeps) {
    this.deps.http.addLoadingCountSource(this.pendingCount$);

    this.deps.startServices.then(([coreStart, depsStart]) => {
      const { application, docLinks, ...startRenderServices } = coreStart;
      this.application = application;
      this.docLinks = docLinks;
      this.startRenderServices = startRenderServices;
      this.inspector = (depsStart as SearchServiceStartDependencies).inspector;
    });

    this.searchTimeout = deps.uiSettings.get(UI_SETTINGS.SEARCH_TIMEOUT);

    this.uiSettingsSubs.push(
      deps.uiSettings.get$(UI_SETTINGS.SEARCH_TIMEOUT).subscribe((timeout: number) => {
        this.searchTimeout = timeout;
      })
    );

    // Set up PerformanceObserver to capture search requests as they happen
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries() as PerformanceResourceTiming[];
        const entry = entries.find(({ name }) => name.includes('/internal/search/'));
        if (entry) {
          this.protocolSupportsMultiplexing = ['h2', 'h3'].includes(entry.nextHopProtocol);
          this.performanceObserver?.disconnect(); // We only need to detect this once, so we can disconnect the observer after the first match
        }
      });
      this.performanceObserver.observe({ entryTypes: ['resource'] });
    } catch (e) {
      // Silently fail - protocol detection is not critical
    }
  }

  public stop() {
    this.responseCache.clear();
    this.uiSettingsSubs.forEach((s) => s.unsubscribe());
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }
  }

  /*
   * @returns `TimeoutErrorMode` indicating what action should be taken in case of a request timeout based on license and permissions.
   * @internal
   */
  private getTimeoutMode() {
    return this.application.capabilities.advancedSettings?.save
      ? TimeoutErrorMode.CHANGE
      : TimeoutErrorMode.CONTACT;
  }

  private createRequestHash$(
    request: IKibanaSearchRequest,
    options: IAsyncSearchOptions
  ): Observable<string | undefined> {
    const { sessionId, projectRouting } = options;
    const hashOptions = {
      ...request.params,
      sessionId,
      projectRouting,
    };

    if (!sessionId) return of(undefined); // don't use cache if doesn't belong to a session

    return from(Promise.resolve(createRequestHashForClientCache(hashOptions)));
  }

  /*
   * @returns `Error` a search service specific error or the original error, if a specific error can't be recognized.
   * @internal
   */
  private handleSearchError(
    e: KibanaServerError | AbortError,
    requestBody: estypes.SearchRequest,
    options?: IAsyncSearchOptions,
    isTimeout?: boolean
  ): Error {
    if (isTimeout || e.message === 'Request timed out') {
      // Handle a client or a server side timeout
      const err = new SearchTimeoutError(e, this.getTimeoutMode());

      // Show the timeout error here, so that it's shown regardless of how an application chooses to handle errors.
      // The timeout error is shown any time a request times out, or once per session, if the request is part of a session.
      this.showTimeoutError(err, options?.sessionId);
      return err;
    }

    if (e instanceof AbortError) {
      // In the case an application initiated abort, throw the existing AbortError
      return e;
    }

    if (isEsError(e)) {
      const openInInspector = () => {
        const requestId = options?.inspector?.id ?? uuidv4();
        const requestAdapter = options?.inspector?.adapter ?? new RequestAdapter();
        if (!options?.inspector?.adapter) {
          const requestResponder = requestAdapter.start(
            i18n.translate('data.searchService.anonymousRequestTitle', {
              defaultMessage: 'Request',
            }),
            {
              id: requestId,
            }
          );
          requestResponder.json(requestBody);
          requestResponder.error({ json: e.attributes });
        }
        this.inspector.open(
          {
            requests: requestAdapter,
          },
          {
            options: {
              initialRequestId: requestId,
              initialTabs: ['clusters', 'response'],
            },
          }
        );
      };
      return createEsError(
        e,
        openInInspector,
        {
          application: this.application,
          docLinks: this.docLinks,
        },
        options?.indexPattern
      );
    }

    return e instanceof Error ? e : new Error(e.message);
  }

  private getSerializableOptions(options?: ISearchOptions) {
    const { sessionId, ...requestOptions } = options || {};

    const serializableOptions: ISearchOptionsSerializable = {};
    const combined = {
      ...requestOptions,
      ...this.deps.session.getSearchOptions(sessionId),
    };

    if (combined.sessionId !== undefined) serializableOptions.sessionId = combined.sessionId;
    if (combined.isRestore !== undefined) serializableOptions.isRestore = combined.isRestore;
    if (combined.returnIntermediateResults !== undefined)
      serializableOptions.returnIntermediateResults = combined.returnIntermediateResults;
    if (combined.legacyHitsTotal !== undefined)
      serializableOptions.legacyHitsTotal = combined.legacyHitsTotal;
    if (combined.strategy !== undefined) serializableOptions.strategy = combined.strategy;
    if (combined.isStored !== undefined) serializableOptions.isStored = combined.isStored;
    if (combined.isSearchStored !== undefined)
      serializableOptions.isSearchStored = combined.isSearchStored;
    if (combined.executionContext !== undefined) {
      serializableOptions.executionContext = combined.executionContext;
    }
    if (combined.projectRouting !== undefined) {
      serializableOptions.projectRouting = combined.projectRouting;
    }
    if (combined.approximation !== undefined) {
      serializableOptions.approximation = combined.approximation;
    }

    return serializableOptions;
  }

  /**
   * @internal
   * Creates a new pollSearch that share replays its results
   */
  private runSearch$(
    { id, ...request }: IKibanaSearchRequest,
    options: IAsyncSearchOptions,
    searchAbortController: SearchAbortController
  ) {
    const { sessionId, strategy } = options;

    const search = ({
      abortSignal = searchAbortController.getSignal(),
      pollLength,
    }: Pick<ISearchOptions, 'abortSignal'> & { pollLength?: string } = {}) => {
      const [{ isSearchStored }, afterPoll] = searchTracker?.beforePoll() ?? [
        { isSearchStored: false },
        () => {},
      ];
      const projectRouting = this.deps.getCPSManager?.()?.getProjectRouting(options.projectRouting);
      return this.runSearch(
        { id, ...request },
        {
          ...options,
          projectRouting,
          ...this.deps.session.getSearchOptions(sessionId),
          abortSignal,
          isSearchStored,
          pollLength,
        }
      )
        .then((result) => {
          afterPoll({ isSearchStored: result.isStored ?? false });
          return result;
        })
        .catch((err) => {
          afterPoll({ isSearchStored: false });
          throw err;
        });
    };

    const searchTracker = this.deps.session.isCurrentSession(sessionId)
      ? this.deps.session.trackSearch({
          abort: (reason?: AbortReason) => searchAbortController.abort(reason),
          poll: async (abortSignal) => {
            if (id) {
              await search({
                abortSignal,
                // pollLength should be 0 because this poll is not for results, but just to signal to the server to
                // record the search in the background search saved object. we want it to finish quickly
                pollLength: '0',
              });
            }
          },
        })
      : undefined;

    // track if this search's session will be send to background
    // if yes, then we don't need to cancel this search when it is aborted
    let isSavedToBackground =
      this.deps.session.isCurrentSession(sessionId) &&
      (this.deps.session.isSaving() || this.deps.session.isStored());
    if (isSavedToBackground) searchAbortController.cleanup();

    const savedToBackgroundSub =
      this.deps.session.isCurrentSession(sessionId) &&
      this.deps.session.state$
        .pipe(
          skip(1), // ignore any state, we are only interested in transition x -> BackgroundLoading
          filter(
            (state) =>
              this.deps.session.isCurrentSession(sessionId) &&
              state === SearchSessionState.BackgroundLoading
          ),
          take(1)
        )
        .subscribe(() => {
          searchAbortController.cleanup();
          isSavedToBackground = true;
        });

    const sendCancelRequest = once(() =>
      this.deps.http.delete(
        buildPath('/internal/search/{strategy}/{id}', {
          strategy: strategyToString(strategy),
          id: id as string,
        }),
        {
          version: '1',
        }
      )
    );

    const cancel = async () => {
      // If the request times out/is canceled, we handle cancellation after we make the last call to retrieve the results
      if (
        !id ||
        isSavedToBackground ||
        searchAbortController.isTimeout() ||
        searchAbortController.isCanceled()
      )
        return;
      try {
        await sendCancelRequest();
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    };

    // Async search requires a series of requests
    // 1) POST /<index pattern>/_async_search/
    // 2..n) GET /_async_search/<async search identifier>
    //
    // First request contains useful request params for tools like Inspector.
    // Preserve and project first request params into responses.
    let firstRequestParams: SanitizedConnectionRequestParams;

    const pollInterval = this.deps.searchConfig.asyncSearch.pollInterval
      ? // the types incorrectly report asyncSearch.pollInterval as a duration already, but it
        // is actually a duration string that needs to be initialized with moment.duration
        // TODO — can we fix this?
        moment.duration(this.deps.searchConfig.asyncSearch.pollInterval).asMilliseconds()
      : this.protocolSupportsMultiplexing
      ? 0
      : undefined;

    return pollSearch(search, cancel, {
      pollInterval,
      ...options,
      abortSignal: searchAbortController.getSignal(),
    }).pipe(
      tap((response) => {
        if (!firstRequestParams && response.requestParams) {
          firstRequestParams = response.requestParams;
        }

        id = response.id;

        if (!isRunningResponse(response)) {
          searchTracker?.complete(response);
        }
      }),
      map((response) => {
        return firstRequestParams
          ? {
              ...response,
              requestParams: firstRequestParams,
            }
          : response;
      }),
      catchError((e: Error) => {
        // If we aborted (search:timeout advanced setting) or the user canceled and there was a partial response, return it instead of just erroring out
        if (searchAbortController.isTimeout() || searchAbortController.isCanceled()) {
          if (searchAbortController.isTimeout()) {
            this.startRenderServices.analytics.reportEvent(EVENT_TYPE_DATA_SEARCH_TIMEOUT, {
              [EVENT_PROPERTY_SEARCH_TIMEOUT_MS]: this.searchTimeout,
              [EVENT_PROPERTY_EXECUTION_CONTEXT]: options.executionContext,
            });
          }
          return from(
            this.runSearch(
              { id, ...request },
              {
                ...options,
                abortSignal: new AbortController().signal,
                returnIntermediateResults: true,
              }
            )
          ).pipe(
            map((response) =>
              options.strategy === ENHANCED_ES_SEARCH_STRATEGY
                ? toPartialResponseAfterTimeout(response)
                : response
            ),
            tap(async (response) => {
              id = id ?? response.id;
              await sendCancelRequest();
              if (searchAbortController.isTimeout()) {
                this.handleSearchError(e, request?.params?.body ?? {}, options, true);
              }
            })
          );
        } else {
          // Don't error out the search or cancel if it is being saved to the background
          if (!isSavedToBackground) {
            searchTracker?.error(e);
            cancel();
          }
          return throwError(e);
        }
      }),
      finalize(() => {
        searchAbortController.cleanup();
        if (savedToBackgroundSub) {
          savedToBackgroundSub.unsubscribe();
        }
      }),
      // This observable is cached in the responseCache.
      // Using shareReplay makes sure that future subscribers will get the final response

      shareReplay(1)
    );
  }

  /**
   * @internal
   * @throws `AbortError` | `ErrorLike`
   */
  private runSearch(
    { params, ...request }: IKibanaSearchRequest,
    options?: ISearchOptions & { pollLength?: string }
  ): Promise<IKibanaSearchResponse> {
    const { abortSignal } = options || {};

    const requestHash = params ? createRequestHashForBackgroundSearches(params) : undefined;

    const { executionContext, strategy, ...searchOptions } = this.getSerializableOptions(options);
    const paramsToUse = request.id
      ? {
          wait_for_completion_timeout: options?.pollLength
            ? options.pollLength
            : // don't set or override user-configured pollLength, it will be applied server-side
            !this.deps.searchConfig.asyncSearch.pollLength && this.protocolSupportsMultiplexing
            ? DEFAULT_MULTIPLEXING_POLL_LENGTH
            : undefined,

          // FIXME: the dropNullColumns param shouldn't be needed during polling
          // once https://github.com/elastic/elasticsearch/issues/138439 is resolved
          // at that point, exclude all params when request.id is defined (polling phase)
          dropNullColumns: params?.dropNullColumns,
        }
      : params || {};
    return this.deps.http
      .post<IKibanaSearchResponse | ErrorResponseBase>(
        buildPath('/internal/search/{strategy}/{id?}', {
          strategy: strategyToString(strategy),
          id: request.id,
        }),
        {
          version: '1',
          signal: abortSignal,
          context: this.deps.executionContext.withGlobalContext(executionContext),
          body: JSON.stringify({
            ...{ ...request, params: paramsToUse },
            ...searchOptions,
            requestHash,
            stream:
              strategy === ESQL_ASYNC_SEARCH_STRATEGY ||
              strategy === ENHANCED_ES_SEARCH_STRATEGY ||
              strategy === undefined, // undefined strategy is treated as enhanced ES
          }),
          asResponse: true,
        }
      )
      .then((rawResponse) => {
        const warning = rawResponse.response?.headers.get('warning');
        const requestParams =
          rawResponse.body && 'requestParams' in rawResponse.body
            ? rawResponse.body.requestParams
            : JSON.parse(rawResponse.response?.headers.get('kbn-search-request-params') || '{}');
        const isRestored =
          rawResponse.body && 'isRestored' in rawResponse.body
            ? rawResponse.body.isRestored
            : rawResponse.response?.headers.get('kbn-search-is-restored') === '?1';

        if (rawResponse.body && 'error' in rawResponse.body) {
          // eslint-disable-next-line no-throw-literal
          throw {
            attributes: {
              error: rawResponse.body.error,
              rawResponse: rawResponse.body,
              requestParams,
              isRestored,
            },
          };
        }

        switch (strategy) {
          case ENHANCED_ES_SEARCH_STRATEGY:
            if (rawResponse.body?.rawResponse) return rawResponse.body;
            const typedResponse = rawResponse.body as unknown as AsyncSearchGetResponse;
            const shimmedResponse = shimHitsTotal(typedResponse.response, {
              legacyHitsTotal: searchOptions.legacyHitsTotal,
            });
            return {
              id: typedResponse.id,
              isPartial: typedResponse.is_partial,
              isRunning: typedResponse.is_running,
              rawResponse: shimmedResponse,
              warning,
              requestParams,
              isRestored,
              ...getTotalLoaded(shimmedResponse),
            };
          case ESQL_ASYNC_SEARCH_STRATEGY:
            const esqlResponse = rawResponse.body as unknown as EsqlAsyncQueryResponse;
            return {
              id: esqlResponse.id,
              rawResponse: esqlResponse,
              isPartial: esqlResponse.is_partial,
              isRunning: esqlResponse.is_running,
              isRestored,
              requestParams,
              warning,
            };
          default:
            return rawResponse.body;
        }
      })
      .catch((e: IHttpFetchError<KibanaServerError>) => {
        if (e?.body) {
          throw e.body;
        } else {
          throw e;
        }
      }) as Promise<IKibanaSearchResponse>;
  }

  /**
   * @internal
   * Creates a new search observable and a corresponding search abort controller
   * If requestHash is defined, tries to return them first from cache.
   */
  private getSearchResponse$(request: IKibanaSearchRequest, options: IAsyncSearchOptions) {
    const { requestHash } = options;
    const sessionOptions = this.deps.session.getSearchOptions(options.sessionId);
    const cached =
      requestHash && !sessionOptions?.isRestore ? this.responseCache.get(requestHash) : undefined; // don't use cache if restoring a session

    const searchAbortController =
      cached?.searchAbortController || new SearchAbortController(this.searchTimeout);

    // Create a new abort signal if one was not passed. This fake signal will never be aborted,
    // So the underlaying search will not be aborted, even if the other consumers abort.
    searchAbortController.addAbortSignal(options.abortSignal ?? new AbortController().signal);
    const response$ = cached?.response$ || this.runSearch$(request, options, searchAbortController);

    if (requestHash && !this.responseCache.has(requestHash)) {
      this.responseCache.set(requestHash, {
        response$,
        searchAbortController,
      });
    }

    return {
      response$,
      searchAbortController,
    };
  }

  /**
   * Searches using the given `search` method. Overrides the `AbortSignal` with one that will abort
   * either when the request times out, or when the original `AbortSignal` is aborted. Updates
   * `pendingCount$` when the request is started/finalized.
   *
   * @param request
   * @options
   * @returns `Observable` emitting the search response or an error.
   */
  public search({ id, ...request }: IKibanaSearchRequest, options: IAsyncSearchOptions = {}) {
    const searchOptions = {
      ...options,
    };
    if (!searchOptions.strategy) {
      searchOptions.strategy = ENHANCED_ES_SEARCH_STRATEGY;
    }

    const { sessionId, abortSignal } = searchOptions;

    return this.createRequestHash$(request, searchOptions).pipe(
      switchMap((requestHash) => {
        searchOptions.requestHash = requestHash;
        const { searchAbortController, response$ } = this.getSearchResponse$(
          request,
          searchOptions
        );

        this.pendingCount$.next(this.pendingCount$.getValue() + 1);

        // Abort the replay if the abortSignal is aborted.
        // The underlaying search will not abort unless searchAbortController fires.
        const aborted$ = (abortSignal ? fromEvent(abortSignal, 'abort') : EMPTY).pipe(
          switchMap((e) =>
            (e.target as AbortSignal)?.reason === AbortReason.CANCELED
              ? EMPTY
              : throwError(new AbortError())
          )
        );

        return response$.pipe(
          takeUntil(aborted$),
          catchError((e) => {
            return throwError(
              this.handleSearchError(
                e,
                request?.params?.body ?? {},
                searchOptions,
                searchAbortController.isTimeout()
              )
            );
          }),
          tap((response) => {
            const isSearchInScopeOfSession =
              sessionId && sessionId === this.deps.session.getSessionId();
            if (
              isSearchInScopeOfSession &&
              this.deps.session.isRestore() &&
              response.isRestored === false
            ) {
              this.showRestoreWarning(sessionId);
            }

            defaultFreeze(response);
          }),
          finalize(() => {
            this.pendingCount$.next(this.pendingCount$.getValue() - 1);
          })
        );
      })
    );
  }

  private showTimeoutErrorToast = (e: SearchTimeoutError, _sessionId?: string) => {
    this.deps.toasts.addDanger({
      title: 'Timed out',
      text: toMountPoint(e.getErrorMessage(this.application), this.startRenderServices),
      // TODO: explore possibility of "Infinity" without hiding the toast on mouse leave (see https://github.com/elastic/kibana/pull/210576#discussion_r1952215353)
      toastLifeTimeMs: 1000 * 60 * 60 * 24 * 7, // 7 days
    });
  };

  private showTimeoutErrorMemoized = memoize(
    this.showTimeoutErrorToast,
    (_: SearchTimeoutError, sessionId?: string) => {
      return sessionId;
    }
  );

  private showRestoreWarningToast = async (_sessionId?: string) => {
    this.deps.toasts.addWarning(
      {
        title: i18n.translate('data.searchService.backgroundSearchRestoreWarning', {
          defaultMessage: 'Your background search is still running',
        }),
        text: toMountPoint(SearchSessionIncompleteWarning(this.docLinks), this.startRenderServices),
      },
      {
        toastLifeTimeMs: 60000,
      }
    );
  };

  private showRestoreWarning = memoize(this.showRestoreWarningToast);

  /**
   * Show one error notification per session.
   * @internal
   */
  private showTimeoutError = (e: SearchTimeoutError, sessionId?: string) => {
    if (sessionId) {
      this.showTimeoutErrorMemoized(e, sessionId);
    } else {
      this.showTimeoutErrorToast(e, sessionId);
    }
  };

  public showError(e: Error) {
    if (e instanceof AbortError || e instanceof SearchTimeoutError) {
      // The SearchTimeoutError is shown by the interceptor in getSearchError (regardless of how the app chooses to handle errors)
      return;
    }

    const searchErrorDisplay = renderSearchError(e);

    if (searchErrorDisplay) {
      this.deps.toasts.addDanger({
        title: searchErrorDisplay.title,
        text: toMountPoint(searchErrorDisplay.body, this.startRenderServices),
      });
    } else {
      this.deps.toasts.addError(e, {
        title: 'Search Error',
      });
    }
  }
}

export type ISearchInterceptor = PublicMethodsOf<SearchInterceptor>;
