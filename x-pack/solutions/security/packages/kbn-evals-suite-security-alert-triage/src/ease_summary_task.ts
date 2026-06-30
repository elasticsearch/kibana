/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { HttpHandler } from '@kbn/core/public';
import type { ToolingLog } from '@kbn/tooling-log';

interface EaseConnectorResponse {
  data: string;
  connector_id: string;
  status: string;
}

/**
 * Mirrors the HTTP call made by use_alert_summary.tsx's fetchAISummary via
 * useChatComplete / postChatComplete. Posts to the actions/connector execute
 * route with EASE prompt IDs and returns the raw response string for the
 * evaluator to parse.
 *
 * Path: POST_ACTIONS_CONNECTOR_EXECUTE is not importable from a shared eval
 * package, so the path is hardcoded here.
 */
export const callEaseSummary = async ({
  fetch,
  connectorId,
  alertContext,
  log,
}: {
  fetch: HttpHandler;
  connectorId: string;
  alertContext: string;
  log: ToolingLog;
}): Promise<{ rawResponse: string }> => {
  log.info(`Calling EASE alert summary for connector ${connectorId}`);

  const raw = (await fetch(
    // POST_ACTIONS_CONNECTOR_EXECUTE is not importable from a shared eval package
    `/internal/elastic_assistant/actions/connector/${connectorId}/_execute`,
    {
      method: 'POST',
      version: '1',
      headers: { 'elastic-api-version': '1' },
      query: { content_references_disabled: true },
      body: JSON.stringify({
        actionTypeId: '.gen-ai',
        message: alertContext,
        promptIds: { promptGroupId: 'ease', promptId: 'alertSummarySystemPrompt' },
        replacements: {},
        subAction: 'invokeAI',
      }),
    }
  )) as EaseConnectorResponse;

  return { rawResponse: raw.data };
};
