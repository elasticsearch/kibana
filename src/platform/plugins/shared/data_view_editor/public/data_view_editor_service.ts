/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { HttpSetup } from '@kbn/core/public';
import type { Observable, Subscription } from 'rxjs';
import {
  BehaviorSubject,
  Subject,
  first,
  firstValueFrom,
  from,
  map,
  distinctUntilChanged,
} from 'rxjs';

import type {
  DataViewsServicePublic,
  MatchedItem,
  DataViewField,
} from '@kbn/data-views-plugin/public';
import { INDEX_PATTERN_TYPE } from '@kbn/data-views-plugin/public';
import type { ICPSManager } from '@kbn/cps-utils';

import type {
  RollupIndicesCapsResponse,
  RollupIndiciesCapability,
  MatchedIndicesSet,
  TimestampOption,
} from './types';
import { getMatchedIndices, ensureMinimumTime, extractTimeFields, removeSpaces } from './lib';
import type { GetFieldsOptions } from './shared_imports';

export const matchedIndiciesDefault = {
  allIndices: [],
  exactMatchedIndices: [],
  partialMatchedIndices: [],
  visibleIndices: [],
};

/**
 * ConstructorArgs for DataViewEditorService
 */
export interface DataViewEditorServiceConstructorArgs {
  /**
   * Dependencies for the DataViewEditorService
   */
  services: {
    http: HttpSetup;
    dataViews: DataViewsServicePublic;
    cpsManager?: ICPSManager;
  };
  /**
   * Whether service requires requireTimestampField
   */
  requireTimestampField?: boolean;
  /**
   * Initial type, indexPattern, and name to populate service
   */
  initialValues: {
    name?: string;
    type?: INDEX_PATTERN_TYPE;
    indexPattern?: string;
  };
}

interface DataViewEditorState {
  matchedIndices: MatchedIndicesSet;
  rollupIndicesCaps: RollupIndicesCapsResponse;
  isLoadingSourcesInternal: boolean;
  loadingTimestampFields: boolean;
  timestampFieldOptions: TimestampOption[];
  timestampFieldsError?: Error;
  rollupIndexName?: string | null;
  rollupCaps?: RollupIndiciesCapability;
}

const defaultDataViewEditorState: DataViewEditorState = {
  matchedIndices: { ...matchedIndiciesDefault },
  rollupIndicesCaps: {},
  isLoadingSourcesInternal: false,
  loadingTimestampFields: false,
  timestampFieldOptions: [],
  timestampFieldsError: undefined,
  rollupIndexName: undefined,
};

export const stateSelectorFactory =
  <S>(state$: Observable<S>) =>
  <R>(selector: (state: S) => R, equalityFn?: (arg0: R, arg1: R) => boolean) =>
    state$.pipe(map(selector), distinctUntilChanged(equalityFn));

export class DataViewEditorService {
  constructor({
    services: { http, dataViews, cpsManager },
    initialValues: {
      type: initialType = INDEX_PATTERN_TYPE.DEFAULT,
      indexPattern: initialIndexPattern = '',
      name: initialName = '',
    },
    requireTimestampField = false,
  }: DataViewEditorServiceConstructorArgs) {
    this.http = http;
    this.dataViews = dataViews;
    this.requireTimestampField = requireTimestampField;
    this.type = initialType;
    this.indexPattern = removeSpaces(initialIndexPattern);
    this.cpsManager = cpsManager;

    // fire off a couple of requests that we know we'll need
    this.rollupCapsResponse = this.getRollupIndexCaps();
    this.dataViewNames$ = from(this.loadDataViewNames(initialName));

    this.state$ = new BehaviorSubject<DataViewEditorState>({
      ...defaultDataViewEditorState,
    });

    const stateSelector = stateSelectorFactory(this.state$);

    // public observables
    this.matchedIndices$ = stateSelector((state) => state.matchedIndices);
    this.rollupIndicesCaps$ = stateSelector((state) => state.rollupIndicesCaps);
    this.isLoadingSources$ = stateSelector((state) => state.isLoadingSourcesInternal);
    this.loadingTimestampFields$ = stateSelector((state) => state.loadingTimestampFields);
    this.timestampFieldOptions$ = stateSelector((state) => state.timestampFieldOptions);
    this.timestampFieldsError$ = stateSelector((state) => state.timestampFieldsError);
    this.rollupIndex$ = stateSelector((state) => state.rollupIndexName);
    this.rollupCaps$ = stateSelector((state) => state.rollupCaps);

    // when list of matched indices is updated always update timestamp fields
    this.loadTimestampFieldsSub = this.matchedIndices$.subscribe(() => this.loadTimestampFields());

    // alternate value with undefined so validation knows when its getting a fresh value
    this.matchedIndicesForProviderSub = this.matchedIndices$.subscribe((matchedIndices) => {
      this.matchedIndicesForProvider$.next(matchedIndices);
      this.matchedIndicesForProvider$.next(undefined);
    });

    // alternate value with undefined so validation knows when its getting a fresh value
    this.rollupIndexForProviderSub = this.rollupIndex$.subscribe((rollupIndex) => {
      this.rollupIndexForProvider$.next(rollupIndex);
      this.rollupIndexForProvider$.next(undefined);
    });

    // Subscribe to CPS project routing changes
    if (cpsManager) {
      this.cpsProjectRoutingSub = cpsManager.getProjectRouting$().subscribe(() => {
        this.loadIndices();
      });
    }
  }

  private http: HttpSetup;
  private dataViews: DataViewsServicePublic;
  // config
  private requireTimestampField: boolean;
  private cpsManager?: ICPSManager;
  private type = INDEX_PATTERN_TYPE.DEFAULT;

  private indexPattern = '';
  private allowHidden = false;

  // used for data view name validation - no dupes!
  dataViewNames$: Observable<string[]>;

  private loadTimestampFieldsSub: Subscription;
  private matchedIndicesForProviderSub: Subscription;
  private rollupIndexForProviderSub: Subscription;
  private cpsProjectRoutingSub?: Subscription;

  private state$: BehaviorSubject<DataViewEditorState>;

  // used for validating rollup data views - must match one and only one data view
  rollupIndicesCaps$: Observable<RollupIndicesCapsResponse>;
  isLoadingSources$: Observable<boolean>;
  loadingTimestampFields$: Observable<boolean>;
  timestampFieldOptions$: Observable<TimestampOption[]>;
  // error thrown while fetching the field list, so the UI can explain why no timestamp field is selectable
  timestampFieldsError$: Observable<Error | undefined>;

  // current matched rollup index
  rollupIndex$: Observable<string | undefined | null>;
  // current matched rollup capabilities
  rollupCaps$: Observable<RollupIndiciesCapability | undefined>;
  // alernates between value and undefined so validation can treat new value as thought its a promise
  private rollupIndexForProvider$ = new Subject<string | undefined | null>();

  matchedIndices$: Observable<MatchedIndicesSet>;

  // alernates between value and undefined so validation can treat new value as thought its a promise
  private matchedIndicesForProvider$ = new Subject<MatchedIndicesSet | undefined>();

  private rollupCapsResponse: Promise<RollupIndicesCapsResponse>;

  private currentLoadingTimestampFields = 0;
  private currentLoadingMatchedIndices = 0;

  private updateState = (newState: Partial<DataViewEditorState>) => {
    this.state$.next({ ...this.state$.getValue(), ...newState });
  };

  private getRollupIndexCaps = async () => {
    if (this.dataViews.getRollupsEnabled() === false) {
      return {};
    }
    let rollupIndicesCaps: RollupIndicesCapsResponse = {};
    try {
      rollupIndicesCaps = await this.http.get<RollupIndicesCapsResponse>('/api/rollup/indices');
    } catch (e) {
      // Silently swallow failure responses such as expired trials
    }
    this.updateState({ rollupIndicesCaps });
    return rollupIndicesCaps;
  };

  private getIsRollupIndex = async () => {
    const response = await this.rollupCapsResponse;
    const indices = Object.keys(response);
    return (indexName: string) => indices.includes(indexName);
  };

  private loadMatchedIndices = async (
    query: string,
    allowHidden: boolean,
    allSources: MatchedItem[],
    type: INDEX_PATTERN_TYPE
  ): Promise<void> => {
    const currentLoadingMatchedIndicesIdx = ++this.currentLoadingMatchedIndices;
    const isRollupIndex = await this.getIsRollupIndex();
    const indexRequests = [];
    let newRollupIndexName: string | undefined | null;

    this.updateState({ loadingTimestampFields: true });

    if (query?.endsWith('*')) {
      const exactMatchedQuery = this.getIndicesCached({
        pattern: query,
        showAllIndices: allowHidden,
      });

      indexRequests.push(exactMatchedQuery);
      // provide default value when not making a request for the partialMatchQuery
      indexRequests.push(Promise.resolve([]));
    } else {
      const exactMatchQuery = this.getIndicesCached({
        pattern: query,
        showAllIndices: allowHidden,
      });
      const partialMatchQuery = this.getIndicesCached({
        pattern: `${query}*`,
        showAllIndices: allowHidden,
      });

      indexRequests.push(exactMatchQuery);
      indexRequests.push(partialMatchQuery);
    }

    const [exactMatched, partialMatched] = (await ensureMinimumTime(
      indexRequests
    )) as MatchedItem[][];

    const matchedIndices = getMatchedIndices(allSources, partialMatched, exactMatched, allowHidden);

    // verify we're looking at the current result
    if (currentLoadingMatchedIndicesIdx === this.currentLoadingMatchedIndices) {
      if (type === INDEX_PATTERN_TYPE.ROLLUP) {
        const rollupIndices = exactMatched.filter(
          (index) =>
            isRollupIndex(index.name) ||
            // if its an alias
            (index.item.indices?.length === 1 && isRollupIndex(index.item.indices[0])) ||
            // if its an index referenced by an alias
            (index.item.aliases?.length === 1 && isRollupIndex(index.item.aliases[0]))
        );

        newRollupIndexName = rollupIndices.length === 1 ? rollupIndices[0].name : null;
        const newRollupCaps = await this.rollupCapsResponse.then((response) => {
          return (
            response[newRollupIndexName || ''] ||
            // if its an alias
            response[rollupIndices[0]?.item.indices?.[0] || '']
          );
        });

        this.updateState({ rollupIndexName: newRollupIndexName, rollupCaps: newRollupCaps });
      } else {
        this.updateState({ rollupIndexName: null, rollupCaps: undefined });
      }

      this.updateState({ matchedIndices });
    }
  };

  setIndexPattern = (indexPattern: string) => {
    this.indexPattern = removeSpaces(indexPattern);
    this.loadIndices();
  };

  setAllowHidden = (allowHidden: boolean) => {
    this.allowHidden = allowHidden;
    this.loadIndices();
  };

  setType = (type: INDEX_PATTERN_TYPE) => {
    this.type = type;
    this.loadIndices();
  };

  private loadIndices = async () => {
    const allSrcs = await this.getIndicesCached({
      pattern: '*',
      showAllIndices: this.allowHidden,
    });
    await this.loadMatchedIndices(this.indexPattern, this.allowHidden, allSrcs, this.type);

    this.updateState({ isLoadingSourcesInternal: false });
  };

  private loadDataViewNames = async (initialName?: string) => {
    const dataViewListItems = await this.dataViews.getIdsWithTitle(true);
    const dataViewNames = dataViewListItems.map((item) => item.name || item.title);
    return initialName ? dataViewNames.filter((v) => v !== initialName) : dataViewNames;
  };

  private getIndicesMemory: Record<string, Promise<MatchedItem[]>> = {};

  private getIndicesCached = async (props: {
    pattern: string;
    showAllIndices?: boolean | undefined;
  }) => {
    const projectRouting = this.cpsManager?.getProjectRouting();
    const key = JSON.stringify({ ...props, projectRouting });

    this.getIndicesMemory[key] =
      this.getIndicesMemory[key] ||
      this.getIsRollupIndex().then((isRollupIndex) =>
        this.dataViews.getIndices({ ...props, isRollupIndex })
      );

    this.getIndicesMemory[key].catch(() => {
      delete this.getIndicesMemory[key];
    });

    return await this.getIndicesMemory[key];
  };

  private timestampOptionsMemory: Record<string, Promise<TimestampOption[]>> = {};
  private getTimestampOptionsForWildcard = async (
    getFieldsOptions: GetFieldsOptions,
    requireTimestampField: boolean
  ) => {
    const fields = await ensureMinimumTime(this.dataViews.getFieldsForWildcard(getFieldsOptions));
    return extractTimeFields(fields as DataViewField[], requireTimestampField);
  };

  private getTimestampOptionsForWildcardCached = async (
    getFieldsOptions: GetFieldsOptions,
    requireTimestampField: boolean
  ) => {
    const projectRouting = this.cpsManager?.getProjectRouting();
    const key = JSON.stringify({ getFieldsOptions, requireTimestampField, projectRouting });

    const getTimestampOptionsPromise = this.getTimestampOptionsForWildcard(
      getFieldsOptions,
      requireTimestampField
    );
    this.timestampOptionsMemory[key] =
      this.timestampOptionsMemory[key] || getTimestampOptionsPromise;

    getTimestampOptionsPromise.catch(() => {
      delete this.timestampOptionsMemory[key];
    });

    return await getTimestampOptionsPromise;
  };

  private loadTimestampFields = async () => {
    const currentState = this.state$.getValue();
    if (currentState.matchedIndices.exactMatchedIndices.length === 0) {
      this.updateState({
        timestampFieldOptions: [],
        timestampFieldsError: undefined,
        loadingTimestampFields: false,
      });
      return;
    }
    const currentLoadingTimestampFieldsIdx = ++this.currentLoadingTimestampFields;

    const getFieldsOptions: GetFieldsOptions = {
      pattern: this.indexPattern,
      allowHidden: this.allowHidden,
      allowNoIndex: true,
    };
    if (this.type === INDEX_PATTERN_TYPE.ROLLUP) {
      getFieldsOptions.type = INDEX_PATTERN_TYPE.ROLLUP;
      getFieldsOptions.rollupIndex = currentState.rollupIndexName || '';
      getFieldsOptions.allowNoIndex = true;
    }

    let timestampFieldOptions: TimestampOption[] = [];
    let timestampFieldsError: Error | undefined;
    try {
      timestampFieldOptions = await this.getTimestampOptionsForWildcardCached(
        getFieldsOptions,
        this.requireTimestampField
      );
    } catch (error) {
      // keep the error around so the UI can explain why the timestamp field can't be selected
      timestampFieldsError = error instanceof Error ? error : new Error(String(error));
    } finally {
      if (currentLoadingTimestampFieldsIdx === this.currentLoadingTimestampFields) {
        this.updateState({
          timestampFieldOptions,
          timestampFieldsError,
          loadingTimestampFields: false,
        });
      }
    }
  };

  // provides info necessary for validation of index pattern in required async format
  indexPatternValidationProvider = async () => {
    const rollupIndexPromise = firstValueFrom(
      this.rollupIndex$.pipe(first((data) => data !== undefined))
    );

    const matchedIndicesPromise = firstValueFrom(
      this.matchedIndicesForProvider$.pipe(first((data) => data !== undefined))
    );

    // necessary to get new observable value if the field hasn't changed
    await this.loadIndices();

    // Wait until we have fetched the indices.
    // The result will then be sent to the field validator(s) (when calling await provider(););
    const [rollupIndex, matchedIndices] = await Promise.all([
      rollupIndexPromise,
      matchedIndicesPromise,
    ]);

    return { rollupIndex, matchedIndices: matchedIndices || matchedIndiciesDefault };
  };

  destroy = () => {
    this.loadTimestampFieldsSub.unsubscribe();
    this.matchedIndicesForProviderSub.unsubscribe();
    this.rollupIndexForProviderSub.unsubscribe();
    this.cpsProjectRoutingSub?.unsubscribe();
  };
}
