/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { useCallback, useRef, useState } from 'react';
import type { HttpSetup, IToasts } from '@kbn/core/public';
import {
  API_VERSIONS,
  ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_BULK_ACTION,
} from '@kbn/elastic-assistant-common';
import type {
  PerformAlertSummaryBulkActionRequestBody,
  PerformAlertSummaryBulkActionResponse,
} from '@kbn/elastic-assistant-common/impl/schemas';
import { useAssistantContext } from '@kbn/elastic-assistant';

interface BulkUpdateDocumentSummaryProps {
  documentSummary: PerformAlertSummaryBulkActionRequestBody;
}

interface UseBulkUpdateDocumentSummary {
  abortStream: () => void;
  isLoading: boolean;
  bulkUpdate: (
    props: BulkUpdateDocumentSummaryProps
  ) => Promise<PerformAlertSummaryBulkActionResponse | void>;
}

export const useBulkUpdateDocumentSummary = (): UseBulkUpdateDocumentSummary => {
  const { http, toasts } = useAssistantContext();
  const [isLoading, setIsLoading] = useState(false);
  const abortController = useRef(new AbortController());

  const bulkUpdate = useCallback(
    async ({ documentSummary }: BulkUpdateDocumentSummaryProps) => {
      setIsLoading(true);

      try {
        return await bulkUpdateDocumentSummary({
          http,
          documentSummary,
          toasts,
          signal: abortController.current.signal,
        });
      } catch (error) {
        toasts?.addDanger(
          i18n.translate('xpack.securitySolution.alertSummary.bulkActionsError', {
            defaultMessage: 'Failed to update alert summaries: {error}',
            values: { error: error instanceof Error ? error.message : String(error) },
          })
        );
      } finally {
        setIsLoading(false);
      }
    },
    [http, toasts]
  );

  const cancelRequest = useCallback(() => {
    abortController.current.abort();
    abortController.current = new AbortController();
  }, []);

  return { isLoading, bulkUpdate, abortStream: cancelRequest };
};

const bulkUpdateDocumentSummary = async ({
  documentSummary,
  http,
  signal,
}: {
  documentSummary: PerformAlertSummaryBulkActionRequestBody;
  http: HttpSetup;
  signal?: AbortSignal;
  toasts?: IToasts;
}): Promise<PerformAlertSummaryBulkActionResponse | void> => {
  const result = await http.fetch<PerformAlertSummaryBulkActionResponse>(
    ELASTIC_AI_ASSISTANT_ALERT_SUMMARY_URL_BULK_ACTION,
    {
      method: 'POST',
      version: API_VERSIONS.internal.v1,
      body: JSON.stringify(documentSummary),
      signal,
    }
  );

  if (!result.success) {
    const serverError = result.attributes.errors
      ?.map(
        (e) =>
          `${e.status_code ? `Error code: ${e.status_code}. ` : ''}Error message: ${
            e.message
          } for alert summaries ${e.alert_summaries.map((c) => c.id).join(', ')}`
      )
      .join(',\n');
    throw new Error(serverError);
  }

  return result;
};
