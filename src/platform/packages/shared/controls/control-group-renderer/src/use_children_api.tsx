/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import deepEqual from 'fast-deep-equal';
import { omit } from 'lodash';
import { useEffect, useMemo, useRef } from 'react';
import { BehaviorSubject, distinctUntilChanged, map } from 'rxjs';

import type { TimeSlice } from '@kbn/controls-schemas';
import type { DefaultEmbeddableApi } from '@kbn/embeddable-plugin/public';
import type { Filter } from '@kbn/es-query';
import {
  apiPublishesESQLVariable,
  type ESQLControlVariable,
  type PublishesESQLVariable,
} from '@kbn/esql-types';
import {
  childrenUnsavedChanges$,
  combineCompatibleChildrenApis,
  apiAppliesFilters,
  apiAppliesTimeslice,
  apiHasSerializableState,
  apiHasUniqueId,
  type AppliesFilters,
  type AppliesTimeslice,
} from '@kbn/presentation-publishing';

import type { ControlGroupCreationOptions, ControlPanelsState } from './types';

export const useChildrenApi = (
  state: ControlGroupCreationOptions['initialState'] | undefined,
  lastSavedState$Ref: React.MutableRefObject<BehaviorSubject<ControlPanelsState>>
) => {
  const children$Ref = useRef(new BehaviorSubject<{ [id: string]: DefaultEmbeddableApi }>({}));
  const currentChildState$Ref = useRef(new BehaviorSubject<{ [id: string]: object }>({}));
  const lastSavedChildState$Ref = useRef(
    new BehaviorSubject<{ [id: string]: object }>({}) // derived from lastSavedState$Ref
  );
  const cleanupCallbackRef = useRef<() => void | undefined>();

  useEffect(() => {
    /** Derive `lastSavedChildState$Ref` from `lastSavedState$Ref` */
    const lastSavedStateSubscription = lastSavedState$Ref.current.subscribe((lastSavedState) => {
      const serializedState: { [id: string]: object } = {};
      Object.entries(lastSavedState).forEach(([id, control]) => {
        serializedState[id] = omit(control, ['grow', 'width', 'order']);
      });
      lastSavedChildState$Ref.current.next(serializedState);
      currentChildState$Ref.current.next(serializedState);
    });

    return () => {
      lastSavedStateSubscription.unsubscribe();
    };
  }, [lastSavedState$Ref]);

  useEffect(() => {
    /** Keep `currentChildState` in sync with children's state */
    const unsavedChangesSubscription = childrenUnsavedChanges$(children$Ref.current)
      .pipe(map((children) => children.some(({ hasUnsavedChanges }) => hasUnsavedChanges)))
      .subscribe((hasUnsavedChanges) => {
        if (hasUnsavedChanges) {
          const result: { [id: string]: object } = {};
          Object.values(children$Ref.current.getValue()).forEach((child) => {
            if (apiHasSerializableState(child) && apiHasUniqueId(child)) {
              result[child.uuid] = child.serializeState();
            }
          });
          currentChildState$Ref.current.next(result);
        } else {
          // this will trigger `input$` when there are no unsaved changes
          currentChildState$Ref.current.next(lastSavedChildState$Ref.current?.value);
        }
      });
    return () => {
      unsavedChangesSubscription.unsubscribe();
    };
  }, []);

  const childrenApi = useMemo(() => {
    if (!state) return; // don't return children API until state is initialized

    /**
     * Define behaviour subjects that will rely on compatible children API observables
     */
    const esqlVariables$ = new BehaviorSubject<ESQLControlVariable[]>([]);
    const esqlVariablesSubscription = combineCompatibleChildrenApis<
      PublishesESQLVariable,
      ESQLControlVariable[]
    >({ children$: children$Ref.current }, 'esqlVariable$', apiPublishesESQLVariable, [])
      .pipe(distinctUntilChanged(deepEqual))
      .subscribe((variables) => {
        esqlVariables$.next(variables);
      });

    const appliedFilters$ = new BehaviorSubject<Filter[] | undefined>(undefined);
    const appliedFiltersSubscription = combineCompatibleChildrenApis<
      AppliesFilters,
      Filter[] | undefined
    >({ children$: children$Ref.current }, 'appliedFilters$', apiAppliesFilters, [], (values) => {
      const allOutputFilters = values.filter(
        (childOutputFilters) => childOutputFilters && childOutputFilters.length > 0
      ) as Filter[][];
      return allOutputFilters && allOutputFilters.length > 0 ? allOutputFilters.flat() : [];
    })
      .pipe(distinctUntilChanged(deepEqual))
      .subscribe((filters) => {
        appliedFilters$.next(filters);
      });

    const appliedTimeslice$ = new BehaviorSubject<TimeSlice | undefined>(undefined);
    const appliedTimesliceSubscription = combineCompatibleChildrenApis<
      AppliesTimeslice,
      TimeSlice | undefined
    >(
      { children$: children$Ref.current },
      'appliedTimeslice$',
      apiAppliesTimeslice,
      undefined, // flatten method is unnecessary since there is only ever one timeslice
      (values) => {
        return values.length === 0 ? undefined : values[values.length - 1];
      }
    )
      .pipe(distinctUntilChanged(deepEqual))
      .subscribe((timeSlice) => {
        appliedTimeslice$.next(timeSlice);
      });

    cleanupCallbackRef.current = () => {
      esqlVariablesSubscription.unsubscribe();
      appliedFiltersSubscription.unsubscribe();
      appliedTimesliceSubscription.unsubscribe();
    };

    return {
      children$: children$Ref.current,
      registerChildApi: (child: DefaultEmbeddableApi) => {
        children$Ref.current.next({
          ...children$Ref.current.value,
          [child.uuid]: child,
        });
      },
      getChildApi: async (uuid: string): Promise<DefaultEmbeddableApi | undefined> => {
        if (children$Ref.current.value[uuid]) return children$Ref.current.value[uuid];
        return new Promise((resolve) => {
          const subscription = children$Ref.current.subscribe(() => {
            if (children$Ref.current.value[uuid]) {
              subscription.unsubscribe();
              resolve(children$Ref.current.value[uuid]);
            }
          });
        });
      },
      removeChild: (id: string) => {
        const children = { ...children$Ref.current.value };
        if (children[id]) {
          delete children[id];
          children$Ref.current.next(children);
        }
        const currentChildState = { ...currentChildState$Ref.current.getValue() };
        if (currentChildState[id]) {
          delete currentChildState[id];
          currentChildState$Ref.current.next(currentChildState);
        }
      },
      setSerializedStateForChild: (id: string, childState: object) => {
        currentChildState$Ref.current.getValue()[id] = childState;
      },
      getSerializedStateForChild: (id: string) => currentChildState$Ref.current.getValue()[id],
      lastSavedStateForChild$: (id: string) => {
        return lastSavedChildState$Ref.current.pipe(map((lastSavedState) => lastSavedState[id]));
      },
      getLastSavedStateForChild: (id: string) => lastSavedChildState$Ref.current.getValue()[id],
      appliedFilters$,
      esqlVariables$,
      appliedTimeslice$,
    };
  }, [state, lastSavedChildState$Ref]);

  useEffect(() => {
    // run cleanup on dismount
    return () => {
      if (cleanupCallbackRef.current) {
        cleanupCallbackRef.current();
      }
    };
  }, []);

  return { childrenApi, currentChildState$Ref };
};
