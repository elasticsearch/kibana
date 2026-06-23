/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UseQueryResult } from '@kbn/react-query';
import { useQuery } from '@kbn/react-query';
import { useToasts } from '../../../common/lib/kibana';
import type { ServerError } from '../../../types';
import type { FieldDefinitionsFindResponse } from '../../../../common/types/api/field_definition/v1';
import { getFieldDefinitions } from '../api/api';
import { casesQueriesKeys } from '../../../containers/constants';
import * as i18n from '../translations';

export const useGetFieldDefinitions = ({
  owner,
  isGlobal,
  staleTime,
}: {
  owner?: string | string[];
  isGlobal?: boolean;
  /** Override React Query's default staleTime (ms). Pass `Infinity` for data that
   * should be fetched once and never re-fetched during the session. */
  staleTime?: number;
} = {}): UseQueryResult<FieldDefinitionsFindResponse> => {
  const toasts = useToasts();
  const hasOwner = Array.isArray(owner) ? owner.length > 0 : owner !== undefined;

  return useQuery(
    casesQueriesKeys.fieldDefinitionsList({ owner, isGlobal }),
    ({ signal }) => getFieldDefinitions({ owner, isGlobal, signal }),
    {
      enabled: hasOwner,
      keepPreviousData: true,
      staleTime,
      onError: (error: ServerError) => {
        if (error.name !== 'AbortError') {
          toasts.addError(
            error.body && error.body.message ? new Error(error.body.message) : error,
            { title: i18n.ERROR_FETCHING_FIELD_DEFINITIONS }
          );
        }
      },
    }
  );
};
