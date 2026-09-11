/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaExecutionContext } from '@kbn/core/public';
import { apiHasDisableTriggers } from '@kbn/presentation-publishing';
import type { GetStateType, LensInternalApi, LensPublicCallbacks } from '@kbn/lens-common';
import type { LensApi } from '@kbn/lens-common-2';
import type { LensEmbeddableStartServices } from '../types';
import type { OnDataCallback } from '../type_guards';
import { prepareOnRender } from './on_render';
import { prepareEventHandler } from './on_event';
import { addLog } from '../logger';

export function prepareCallbacks(
  api: LensApi,
  internalApi: LensInternalApi,
  parentApi: unknown,
  getState: GetStateType,
  services: LensEmbeddableStartServices,
  executionContext: KibanaExecutionContext | undefined,
  onDataUpdate: OnDataCallback,
  dispatchRenderComplete: () => void,
  callbacks: LensPublicCallbacks
) {
  const disableTriggers = apiHasDisableTriggers(parentApi)
    ? parentApi.disableTriggers$.getValue()
    : undefined;

  return {
    disableTriggers,
    onRender: prepareOnRender(
      api,
      internalApi,
      parentApi,
      getState,
      services,
      executionContext,
      dispatchRenderComplete
    ),
    onData: ((...args: Parameters<OnDataCallback>) => {
      addLog(`onData$`);
      onDataUpdate(...args);
    }) satisfies OnDataCallback,
    handleEvent: prepareEventHandler(api, getState, callbacks, services, disableTriggers),
  };
}
