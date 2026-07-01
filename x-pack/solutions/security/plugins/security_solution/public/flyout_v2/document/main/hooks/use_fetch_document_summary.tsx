/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FindAlertSummaryResponse } from '@kbn/elastic-assistant-common/impl/schemas';
import { useQuery } from '@kbn/react-query';
import {
  API_VERSIONS,
  ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_FIND,
} from '@kbn/elastic-assistant-common';
import { useAssistantContext } from '@kbn/elastic-assistant';

export interface UseFetchDocumentSummaryParams {
  signal?: AbortSignal | undefined;
  documentId: string;
  connectorId: string;
}

/**
 * API call for fetching the AI document summary for the current spaceId.
 *
 * @param {Object} options - The options object.
 * @param {string} options.documentId - document id
 * @param {AbortSignal} [options.signal] - AbortSignal
 *
 * @returns {useQuery} hook for getting the status of the document summary
 */
export const useFetchDocumentSummary = ({
  documentId,
  connectorId,
  signal,
}: UseFetchDocumentSummaryParams) => {
  const {
    assistantAvailability: { isAssistantEnabled },
    http,
  } = useAssistantContext();

  const QUERY = {
    page: 1,
    per_page: 1, // only fetching one alert summary
    filter: `alert_id:${documentId}`,
    connector_id: connectorId,
  };

  const CACHING_KEYS = [
    ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_FIND,
    QUERY.page,
    QUERY.per_page,
    QUERY.filter,
    QUERY.connector_id,
    API_VERSIONS.internal.v1,
  ];

  return useQuery<FindAlertSummaryResponse, unknown, FindAlertSummaryResponse>(
    CACHING_KEYS,
    async () =>
      http.fetch(ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_FIND, {
        method: 'GET',
        version: API_VERSIONS.internal.v1,
        query: QUERY,
        signal,
      }),
    {
      initialData: {
        data: [],
        page: 1,
        perPage: 1,
        total: 0,
        prompt: '',
      },
      placeholderData: {
        data: [],
        page: 1,
        perPage: 1,
        total: 0,
        prompt: '',
      },
      keepPreviousData: true,
      enabled: isAssistantEnabled,
    }
  );
};
