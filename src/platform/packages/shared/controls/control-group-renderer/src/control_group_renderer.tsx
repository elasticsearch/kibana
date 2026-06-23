/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BehaviorSubject, Subject, Subscription, combineLatest, map } from 'rxjs';

import { ControlsRenderer, type ControlsRendererParentApi } from '@kbn/controls-renderer';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  apiHasSerializableState,
  useSearchApi,
  type EmbeddableApiContext,
  type ViewMode,
} from '@kbn/presentation-publishing';
import { asyncForEach } from '@kbn/std';
import type { ActionExecutionMeta, UiActionsStart } from '@kbn/ui-actions-plugin/public';

import { ACTION_CREATE_CONTROL } from '@kbn/controls-constants';
import type {
  ControlGroupCreationOptions,
  ControlGroupRendererApi,
  ControlGroupRuntimeState,
  ControlGroupStateBuilder,
  ControlPanelState,
  ControlPanelsState,
} from './types';
import { useChildrenApi } from './use_children_api';
import { useInitialControlGroupState } from './use_initial_control_group_state';
import { useLayoutApi } from './use_layout_api';
import { usePropsApi } from './use_props_api';
import { gatePublishingSubjectWhileLoading } from './gate_publishing_subject_while_loading';

export interface ControlGroupRendererProps {
  onApiAvailable: (api: ControlGroupRendererApi) => void;
  getCreationOptions: (
    initialState: ControlGroupRuntimeState,
    builder: ControlGroupStateBuilder
  ) => Promise<Partial<ControlGroupCreationOptions>>;
  viewMode?: ViewMode;
  filters?: Filter[];
  timeRange?: TimeRange;
  query?: Query | AggregateQuery;
  dataLoading?: boolean;
  compressed?: boolean;
}

export const ControlGroupRenderer = ({
  onApiAvailable,
  getCreationOptions,
  filters,
  timeRange,
  query,
  viewMode,
  dataLoading,
  compressed,
}: ControlGroupRendererProps) => {
  const {
    services: { uiActions },
  } = useKibana<{
    uiActions: UiActionsStart;
  }>();

  const lastSavedState$Ref = useRef(new BehaviorSubject<ControlPanelsState>({}));

  /** Creation options management */
  const { initialState, getEditorConfig } = useInitialControlGroupState(
    getCreationOptions,
    lastSavedState$Ref
  );
  const input$ = useMemo(() => {
    if (!initialState) return;
    return new BehaviorSubject<Partial<ControlGroupRuntimeState>>(initialState ?? {});
  }, [initialState]);

  const { childrenApi, currentChildState$Ref } = useChildrenApi(initialState, lastSavedState$Ref);
  const layoutApi = useLayoutApi(initialState, childrenApi, lastSavedState$Ref);
  const [controls, setControls] = useState(layoutApi?.layout$.getValue().controls);

  /** Props management */
  const searchApi = useSearchApi({
    filters,
    query,
    timeRange,
  });
  const propsApi = usePropsApi({ dataLoading, viewMode, compressed });

  const parentApi = useMemo(() => {
    if (!childrenApi || !layoutApi) return;

    const disabledActionIds$ = new BehaviorSubject<string[] | undefined>(undefined);
    const reload$ = new Subject<void>();

    return {
      ...childrenApi,
      ...layoutApi,
      ...searchApi,
      ...propsApi,
      reload$,
      panelIsPinned: () => true,
      getEditorConfig: getEditorConfig.current,
      disabledActionIds$,
      setDisabledActionIds: (ids: string[] | undefined) => {
        disabledActionIds$.next(ids);
      },
    };
  }, [childrenApi, layoutApi, searchApi, propsApi, getEditorConfig]);

  useEffect(() => {
    if (!parentApi || !input$) return;
    const currentStateSubscription = combineLatest([
      currentChildState$Ref.current,
      parentApi.layout$,
    ])
      .pipe(
        map(([currentChildState, currentLayout]) => {
          setControls(currentLayout.controls);
          const combinedState: ControlPanelsState = {};
          Object.keys(currentLayout.controls).forEach((id) => {
            combinedState[id] = {
              ...currentChildState[id],
              ...currentLayout.controls[id],
            } as ControlPanelState;
          });
          return { initialChildControlState: combinedState };
        })
      )
      .subscribe((currentState) => {
        input$.next(currentState);
      });

    return () => {
      currentStateSubscription.unsubscribe();
    };
  }, [input$, currentChildState$Ref, parentApi]);

  useEffect(() => {
    if (!parentApi || !input$) return;

    /**
     * The ControlGroupRenderer will render before the children are available and
     * combineCompatibleChildrenApis will default to the empty value; however, we
     * shouldn't publish this until the value is real. Gate subscribers on
     * childrenLoading$ and expose getValue/value from the latest post-load value.
     */
    const subscriptions = new Subscription();

    const esqlVariables$ = gatePublishingSubjectWhileLoading(
      parentApi.esqlVariables$,
      parentApi.childrenLoading$,
      subscriptions
    );
    const appliedFilters$ = gatePublishingSubjectWhileLoading(
      parentApi.appliedFilters$,
      parentApi.childrenLoading$,
      subscriptions
    );
    const appliedTimeslice$ = gatePublishingSubjectWhileLoading(
      parentApi.appliedTimeslice$,
      parentApi.childrenLoading$,
      subscriptions
    );

    const publicApi = {
      ...parentApi,
      esqlVariables$,
      appliedFilters$,
      appliedTimeslice$,
      getControls: parentApi.layout$.getValue().controls ?? {},
      reload: () => {
        parentApi.reload$.next();
      },
      getInput$: () => input$,
      getInput: () => input$.value,
      updateInput: (newInput: Partial<ControlGroupRuntimeState>) => {
        const newState = { ...lastSavedState$Ref.current.getValue() };
        Object.entries(newInput.initialChildControlState ?? {}).forEach(([id, control]) => {
          newState[id] = {
            ...lastSavedState$Ref.current.value[id],
            ...control,
          };
        });
        asyncForEach(Object.entries(parentApi.children$.getValue()), async ([id, child]) => {
          if (apiHasSerializableState(child)) child.applySerializedState(newState[id]);
        });
      },
    };

    const openAddDataControlFlyout: ControlGroupRendererApi['openAddDataControlFlyout'] = async (
      options
    ) => {
      const action = await uiActions.getAction(ACTION_CREATE_CONTROL);
      // get up to date control state transform
      action.execute({
        embeddable: {
          ...publicApi,
          ...(options?.controlStateTransform && {
            getEditorConfig: () => ({
              ...publicApi.getEditorConfig?.(),
              controlStateTransform: options.controlStateTransform,
            }),
          }),
        },
      } as EmbeddableApiContext & ActionExecutionMeta); // casting because we don't need a trigger for this action
    };

    onApiAvailable({
      ...publicApi,
      openAddDataControlFlyout,
    } as unknown as ControlGroupRendererApi);

    return () => {
      subscriptions.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentApi, input$, uiActions]);

  /** Wait for parent API, which relies on the async creation options, before rendering */
  return !parentApi || !controls ? null : (
    <ControlsRenderer
      parentApi={parentApi as ControlsRendererParentApi}
      controls={{ controls }}
      onControlsChanged={(newControls) => {
        parentApi.layout$.next(newControls);
      }}
    />
  );
};
