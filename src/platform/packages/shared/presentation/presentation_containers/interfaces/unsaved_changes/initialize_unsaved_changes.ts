/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  PublishesUnsavedChanges,
  SerializedPanelState,
  StateComparators,
  areComparatorsEqual,
  getTitle,
} from '@kbn/presentation-publishing';
import { MaybePromise } from '@kbn/utility-types';
import { Observable, combineLatestWith, debounceTime, map, of } from 'rxjs';
import { isEqual, sortBy } from 'lodash';
import { apiHasLastSavedChildState } from '../last_saved_child_state';
import { PresentationContainer } from '../presentation_container';
const UNSAVED_CHANGES_DEBOUNCE = 100;

export const initializeUnsavedChanges = <StateType extends object = object>({
  uuid,
  onReset,
  parentApi,
  getComparators,
  defaultState,
  serializeState,
  anyStateChange$,
  checkRefEquality,
}: {
  uuid: string;
  parentApi: unknown;
  anyStateChange$: Observable<void>;
  serializeState: () => SerializedPanelState<StateType>;
  getComparators: () => StateComparators<StateType>;
  defaultState?: Partial<StateType>;
  onReset: (lastSavedPanelState?: SerializedPanelState<StateType>) => MaybePromise<void>;
  checkRefEquality?: boolean;
}): PublishesUnsavedChanges => {
  if (!apiHasLastSavedChildState<StateType>(parentApi)) {
    return {
      hasUnsavedChanges$: of(false),
      resetUnsavedChanges: () => Promise.resolve(),
    };
  }

  const hasUnsavedChanges$ = anyStateChange$.pipe(
    combineLatestWith(parentApi.lastSavedStateForChild$(uuid)),
    debounceTime(UNSAVED_CHANGES_DEBOUNCE),
    map(([, lastSavedState]) => {
      const currentState = serializeState();

      // check ref equality
      if (checkRefEquality) {
        const lastSavedRefs = sortBy(lastSavedState?.references ?? [], 'id');
        const currentRefs = sortBy(currentState?.references ?? [], 'id');
        const equalRefs = isEqual(lastSavedRefs, currentRefs);

        if (!equalRefs) return true;
      }

      // check state equality
      return !areComparatorsEqual(
        getComparators(),
        lastSavedState?.rawState,
        currentState.rawState,
        defaultState,
        (key: string) => {
          const childApi = (parentApi as Partial<PresentationContainer>).children$?.getValue()[
            uuid
          ];
          const childlTitle = childApi ? getTitle(childApi) : undefined;
          const childLabel = childlTitle ? `"${childlTitle}"` : uuid;
          return `child: ${childLabel}, key: ${key}`;
        }
      );
    })
  );

  const resetUnsavedChanges = async () => {
    const lastSavedState = parentApi.getLastSavedStateForChild(uuid);
    await onReset(lastSavedState);
  };

  return { hasUnsavedChanges$, resetUnsavedChanges };
};
