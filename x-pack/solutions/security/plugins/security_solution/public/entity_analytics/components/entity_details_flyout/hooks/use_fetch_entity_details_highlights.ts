/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { useCallback, useState } from 'react';
import type { AnonymizationFieldResponse, Replacements } from '@kbn/elastic-assistant-common';
import type { ToolSchema } from '@kbn/inference-common';
import { isInferenceRequestAbortedError } from '@kbn/inference-common';
import { i18n } from '@kbn/i18n';
import { ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS } from '../../../../../common/constants';
import { useKibana } from '../../../../common/lib/kibana/kibana_react';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import { useEntityAnalyticsRoutes } from '../../../api/api';
import { getAnonymizedEntityIdentifier } from '../utils/helpers';
import type { EntityHighlightsResponse } from '../types';

const entityHighlightsSchema = {
  type: 'object',
  properties: {
    highlights: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The title of the highlight section',
          },
          text: {
            type: 'string',
            description: 'The detailed text content for this highlight section.',
          },
        },
        required: ['title', 'text'],
      },
      description:
        'A list of highlight items, each with a title and text. Only include highlights for which information is available in the context.',
    },
    recommendedActions: {
      type: 'array',
      items: {
        type: 'string',
      },
      description:
        'A list of actionable recommendations for the security analyst. Omit this field if no actions are available.',
    },
  },
  required: ['highlights'],
} as const satisfies ToolSchema;

export const useFetchEntityDetailsHighlights = ({
  connectorId,
  anonymizationFields,
  entityType,
  entityIdentifier,
}: {
  connectorId: string;
  anonymizationFields: AnonymizationFieldResponse[];
  entityType: string;
  entityIdentifier: string;
}) => {
  const { inference } = useKibana().services;
  const { fetchEntityDetailsHighlights } = useEntityAnalyticsRoutes();
  const { addError } = useAppToasts();
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [assistantResult, setAssistantResult] = useState<{
    response: EntityHighlightsResponse | null;
    replacements: Replacements;
    summaryAsText: string;
    generatedAt: number;
  } | null>(null);

  const fetchEntityHighlights = useCallback(async () => {
    const errorTitle = i18n.translate(
      'xpack.securitySolution.flyout.entityDetails.highlights.fetch.errorTitle',
      {
        defaultMessage: `Failed to run LLM`,
      }
    );

    // Clear any previously shown error while a new generation attempt is in progress
    setError(null);

    const toDate = Date.now();
    const fromDate = toDate - ENTITY_ANOMALY_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
    const { summary, replacements, prompt } = await fetchEntityDetailsHighlights({
      entityType,
      entityIdentifier,
      anonymizationFields,
      from: fromDate,
      to: toDate,
      connectorId,
    }).catch((e: Error) => {
      const caughtError = e instanceof Error ? e : new Error(String(e));
      addError(caughtError, {
        title: errorTitle,
      });
      setError(caughtError);
      return { summary: null, replacements: null, prompt: null };
    });

    if (!summary || !replacements || !prompt) {
      return;
    }

    const summaryFormatted = JSON.stringify(summary);

    const controller = new AbortController();
    setAbortController(controller);
    setIsChatLoading(true);

    try {
      const outputResponse = await inference.output({
        id: 'entity-highlights',
        connectorId,
        schema: entityHighlightsSchema,
        system: prompt,
        input: `Context:
            EntityType: ${entityType},
            EntityIdentifier: ${getAnonymizedEntityIdentifier(entityIdentifier, replacements)},
          ${summaryFormatted}`,
        abortSignal: controller.signal,
      });
      const typedOutput = outputResponse.output as EntityHighlightsResponse;

      setAssistantResult({
        summaryAsText: summaryFormatted,
        response: typedOutput,
        replacements,
        generatedAt: Date.now(),
      });
    } catch (e) {
      if (isInferenceRequestAbortedError(e)) {
        return;
      }
      const caughtError = e instanceof Error ? e : new Error(String(e));
      addError(caughtError, {
        title: errorTitle,
      });
      setError(caughtError);
    } finally {
      setIsChatLoading(false);
      setAbortController(null);
    }
  }, [
    fetchEntityDetailsHighlights,
    entityType,
    entityIdentifier,
    anonymizationFields,
    connectorId,
    inference,
    addError,
  ]);

  const abortStream = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsChatLoading(false);
    }
  }, [abortController]);

  return {
    fetchEntityHighlights,
    isChatLoading,
    abortStream,
    result: assistantResult,
    error,
  };
};
