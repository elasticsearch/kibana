/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseQueryResult } from '@kbn/react-query';
import { useQuery } from '@kbn/react-query';
import { loadActionTypes } from '@kbn/triggers-actions-ui-plugin/public/common/constants';
import type { IHttpFetchError, ResponseErrorBody, HttpSetup } from '@kbn/core-http-browser';

import type { ActionType } from '@kbn/actions-plugin/common';
import type { IToasts } from '@kbn/core-notifications-browser';
import { GenerativeAIForSecurityConnectorFeatureId } from '@kbn/actions-plugin/common';
import * as i18n from '../translations';

/**
 * Cache expiration in ms -- 1 minute, useful if connector is deleted/access removed
 */
const STALE_TIME = 1000 * 60;
export const QUERY_KEY = ['elastic-assistant, load-action-types'];

export interface Props {
  http: HttpSetup;
  toasts?: IToasts;
}

export const useLoadActionTypes = ({
  http,
  toasts,
}: Props): UseQueryResult<ActionType[], IHttpFetchError> => {
  return useQuery(
    QUERY_KEY,

    async () => {
      const queryResult = await loadActionTypes({
        http,
        featureId: GenerativeAIForSecurityConnectorFeatureId,
      });

      // TODO add .inference once all the providers support unified completion
      const actionTypes = ['.bedrock', '.gen-ai', '.gemini'];

      return queryResult
        .filter((p) => actionTypes.includes(p.id))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    {
      retry: false,
      keepPreviousData: true,
      staleTime: STALE_TIME,
      onError: (error: IHttpFetchError<ResponseErrorBody>) => {
        if (error.name !== 'AbortError') {
          toasts?.addError(
            error.body && error.body.message ? new Error(error.body.message) : error,
            {
              title: i18n.LOAD_ACTIONS_ERROR_MESSAGE,
            }
          );
        }
      },
    }
  );
};
