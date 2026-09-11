/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { serverUnavailable } from '@hapi/boom';
import { z } from '@kbn/zod/v4';
import { MAX_TEXT_LENGTH } from '@kbn/significant-events-schema';
import { freeFormContextSchema } from '../../common';
import { DEFAULT_MANUAL_INVESTIGATION_SUBJECT_ID, MAX_KEYWORD_LENGTH } from '../../common';
import { fetchAlertSnapshot } from '../lib/alert_snapshot';
import { createNightshiftInvestigationsServerRoute } from './create_server_route';
import { rethrowInvestigationClientError } from './rethrow_investigation_client_error';

const subjectIdAndSummary = {
  id: z.string().min(1).max(MAX_KEYWORD_LENGTH),
  summary: z.string().max(MAX_TEXT_LENGTH).optional(),
};

const startInvestigationMessage = {
  message: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
};

export const startInvestigationRoute = createNightshiftInvestigationsServerRoute({
  endpoint: 'POST /internal/nightshift/investigations',
  options: {
    access: 'internal',
    summary: 'Start an investigation',
    description: 'Triggers an investigation workflow for a given subject.',
  },
  security: {
    // agentBuilder:write is used as a proxy for "this user is authorized to spend AI tokens."
    // The investigation workflow itself creates the Agent Builder conversation — the calling user
    // does not create it directly — so this is not a strict AB permission requirement. We use
    // agentBuilder:write because it is the best available signal that a user has been granted
    // access to AI-resource-consuming features in this deployment. When conversation templates
    // land with their own privilege model, this should be revisited.
    authz: {
      requiredPrivileges: ['agentBuilder:write'],
    },
  },
  params: z.object({
    // A union rather than one object with a loose `context`, so that an alert investigation is
    // always backed by alert data: the alert branch accepts no caller context — the handler loads
    // the alert server-side (through the RAC alerts client, which enforces alert-index
    // authorization) and builds the snapshot itself. zod's discriminatedUnion needs the
    // discriminator at the top level, and ours is nested under `subject`, hence a plain union.
    body: z.union([
      z.object({
        subject: z.object({
          type: z.literal('alert'),
          ...subjectIdAndSummary,
        }),
        concurrency_key: z.string().max(MAX_KEYWORD_LENGTH).optional(),
        ...startInvestigationMessage,
      }),
      z.object({
        subject: z.object({
          type: z.literal('significant_event'),
          ...subjectIdAndSummary,
        }),
        concurrency_key: z.string().max(MAX_KEYWORD_LENGTH).optional(),
        context: freeFormContextSchema.optional(),
        ...startInvestigationMessage,
      }),
      // A manual investigation is defined by its question, so `message` is required and the
      // subject id is optional: there is no entity to point at, only the prompt.
      z.object({
        subject: z.object({
          type: z.literal('manual'),
          id: z
            .string()
            .min(1)
            .max(MAX_KEYWORD_LENGTH)
            .default(DEFAULT_MANUAL_INVESTIGATION_SUBJECT_ID),
          summary: z.string().max(MAX_TEXT_LENGTH).optional(),
        }),
        concurrency_key: z.string().max(MAX_KEYWORD_LENGTH).optional(),
        context: freeFormContextSchema.optional(),
        message: z.string().min(1).max(MAX_TEXT_LENGTH),
      }),
    ]),
  }),
  handler: async ({ request, params, getInvestigationsClient, getAlertsClient }) => {
    const client = getInvestigationsClient(request);
    const { body } = params;

    // User-initiated starts are always manual.
    try {
      switch (body.subject.type) {
        case 'alert': {
          const alertsClient = await getAlertsClient(request);
          if (!alertsClient) {
            throw serverUnavailable('Alert lookup is unavailable');
          }
          const snapshot = await fetchAlertSnapshot(alertsClient, body.subject.id);
          return await client.start({
            subject: body.subject,
            concurrency_key: body.concurrency_key ?? snapshot.id,
            context: { alerts: [snapshot] },
            trigger_type: 'manual',
            message: body.message,
          });
        }
        case 'significant_event':
        case 'manual':
          return await client.start({
            ...body,
            trigger_type: 'manual',
          });
      }
    } catch (error) {
      rethrowInvestigationClientError(error);
    }
  },
});
