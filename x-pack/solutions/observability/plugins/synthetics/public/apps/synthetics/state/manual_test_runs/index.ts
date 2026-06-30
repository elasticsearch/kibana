/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PayloadAction } from '@reduxjs/toolkit';
import { createReducer } from '@reduxjs/toolkit';

import type { Draft } from 'immer';
import type { IHttpFetchError } from '@kbn/core-http-browser';

import type { ActionPayload } from '../utils/actions';
import type { TestNowPayload } from './actions';
import {
  clearTestNowMonitorAction,
  hideTestNowFlyoutAction,
  manualTestMonitorAction,
  manualTestRunUpdateAction,
  toggleTestNowFlyoutAction,
} from './actions';
import type { ServiceLocationErrors } from '../../../../../common/runtime_types';
import type { EnrichedTestNowResponse } from './api';

export enum TestRunStatus {
  LOADING = 'loading',
  IN_PROGRESS = 'in-progress',
  COMPLETED = 'completed',
}

export const isTestRunning = (testRun?: ManualTestRun) =>
  testRun?.status === TestRunStatus.IN_PROGRESS || testRun?.status === TestRunStatus.LOADING;

export interface ManualTestRun {
  configId: string;
  testRunId?: string;
  status: TestRunStatus;
  errors?: ServiceLocationErrors;
  fetchError?: { name: string; message: string };
  isTestNowFlyoutOpen: boolean;
}

export interface ManualTestRunsState {
  [configId: string]: ManualTestRun;
}

const initialState: ManualTestRunsState = {};

export const manualTestRunsReducer = createReducer(initialState, (builder) => {
  builder
    .addCase(
      String(manualTestMonitorAction.get),
      (state: Draft<ManualTestRunsState>, action: PayloadAction<TestNowPayload>) => {
        state = Object.values(state).reduce((acc, curr) => {
          acc[curr.configId] = {
            ...curr,
            isTestNowFlyoutOpen: false,
          };

          return acc;
        }, state);

        state[action.payload.configId] = {
          configId: action.payload.configId,
          status: TestRunStatus.LOADING,
          isTestNowFlyoutOpen: true,
        };
      }
    )
    .addCase(
      String(manualTestMonitorAction.success),
      (state: Draft<ManualTestRunsState>, { payload }: PayloadAction<EnrichedTestNowResponse>) => {
        state[payload.configId] = {
          configId: payload.configId,
          testRunId: payload.testRunId,
          status: TestRunStatus.IN_PROGRESS,
          errors: payload.errors,
          isTestNowFlyoutOpen: true,
        };
      }
    )
    .addCase(
      String(manualTestMonitorAction.fail),
      (
        state: Draft<ManualTestRunsState>,
        action: ActionPayload<EnrichedTestNowResponse, TestNowPayload>
      ) => {
        const fetchError = action.payload as unknown as IHttpFetchError;
        if (fetchError?.request?.url) {
          const { name, message } = fetchError;

          const [, errorMonitor] =
            Object.entries(state).find(([key]) => fetchError.request.url.indexOf(key) > -1) ?? [];

          if (errorMonitor) {
            state[errorMonitor.configId] = {
              ...state[errorMonitor.configId],
              status: TestRunStatus.COMPLETED,
              errors: undefined,
              fetchError: { name, message },
            };
          }
        }
        const configId = action.payload.configId ?? action.payload.getPayload?.configId;
        if (configId) {
          state[configId] = {
            ...state[configId],
            status: TestRunStatus.COMPLETED,
            errors: action.payload.errors,
            fetchError: undefined,
          };
        }

        return state;
      }
    )
    .addCase(manualTestRunUpdateAction, (state: Draft<ManualTestRunsState>, action) => {
      const { testRunId, ...rest } = action.payload;
      const configId = Object.keys(state).find((key) => state[key].testRunId === testRunId);
      if (configId) {
        state[configId] = {
          ...state[configId],
          ...rest,
        };
      }
    })
    .addCase(toggleTestNowFlyoutAction, (state: Draft<ManualTestRunsState>, action) => {
      state = Object.values(state).reduce((acc, curr) => {
        acc[curr.configId] = {
          ...curr,
          isTestNowFlyoutOpen: false,
        };

        return acc;
      }, state);

      state[action.payload] = {
        ...state[action.payload],
        isTestNowFlyoutOpen: !state[action.payload].isTestNowFlyoutOpen,
      };
    })
    .addCase(hideTestNowFlyoutAction, (state: Draft<ManualTestRunsState>) => {
      state = Object.values(state).reduce((acc, curr) => {
        acc[curr.configId] = {
          ...curr,
          isTestNowFlyoutOpen: false,
        };

        return acc;
      }, state);
      return state;
    })
    .addCase(
      String(clearTestNowMonitorAction),
      (state: Draft<ManualTestRunsState>, action: PayloadAction<string>) => {
        delete state[action.payload];
      }
    );
});

export * from './actions';
export * from './selectors';
