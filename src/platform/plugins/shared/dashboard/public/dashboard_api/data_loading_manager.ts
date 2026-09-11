/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject, debounceTime, first, map } from 'rxjs';
import type { PublishesDataLoading, PublishingSubject } from '@kbn/presentation-publishing';
import {
  apiCanCancelRequests,
  apiPublishesDataLoading,
  combineCompatibleChildrenApis,
} from '@kbn/presentation-publishing';
import { AbortReason } from '@kbn/kibana-utils-plugin/common';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';

export function initializeDataLoadingManager(
  children$: PublishingSubject<{ [key: string]: DefaultEmbeddableApi }>
) {
  const dataLoading$ = new BehaviorSubject<boolean | undefined>(undefined);

  const dataLoadingSubscription = combineCompatibleChildrenApis<
    PublishesDataLoading,
    boolean | undefined
  >(
    { children$ },
    'dataLoading$',
    apiPublishesDataLoading,
    undefined,
    // flatten method
    (values) => {
      return values.some((isLoading) => isLoading);
    }
  ).subscribe((isAtLeastOneChildLoading) => {
    dataLoading$.next(isAtLeastOneChildLoading);
  });

  const cancelAllRequests = () => {
    const children = children$.getValue();
    Object.values(children).forEach((childApi) => {
      if (apiCanCancelRequests(childApi)) {
        childApi.cancelRequests(AbortReason.CANCELED);
      }
    });
  };

  return {
    api: {
      dataLoading$,
      cancelAllRequests,
    },
    internalApi: {
      waitForPanelsToLoad$: dataLoading$.pipe(
        // debounce to give time for panels to start loading if they are going to load
        debounceTime(300),
        first((isLoading: boolean | undefined) => {
          return !isLoading;
        }),
        map(() => {
          // Observable notifies subscriber when loading is finished
          // Return void to not expose internal implementation details of observable
          return;
        })
      ),
    },
    cleanup: () => {
      dataLoadingSubscription.unsubscribe();
    },
  };
}
