/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  AttachmentResolveContext,
  AttachmentTypeDefinition,
} from '@kbn/agent-builder-server/attachments';
import { getLatestVersion, type VersionedAttachment } from '@kbn/agent-builder-common/attachments';
import type { Logger } from '@kbn/core/server';
import { significantEventSchema, type SignificantEvent } from '@kbn/significant-events-schema';
import { SIGNIFICANT_EVENT_ATTACHMENT_TYPE } from '../../../common';
import type { GetScopedClients } from '../../routes/types';

interface CreateSignificantEventAttachmentTypeOptions {
  logger: Logger;
  getScopedClients: GetScopedClients;
}

const formatList = (values: string[] | undefined): string => {
  if (!values || values.length === 0) {
    return 'None';
  }
  return values.join(', ');
};

export const formatSignificantEventAsText = (event: SignificantEvent): string => {
  const recommendations = event.recommendations
    .map((recommendation, index) => `${index + 1}. ${recommendation}`)
    .join('\n');

  return [
    `Significant Event "${event.title}"`,
    `Event ID: ${event.event_id}`,
    `Discovery slug: ${event.discovery_slug}`,
    `Status: ${event.status}`,
    `Criticality: ${event.criticality}`,
    `Confidence: ${event.confidence}`,
    `Streams: ${formatList(event.stream_names)}`,
    `Summary: ${event.summary}`,
    `Root cause: ${event.root_cause}`,
    recommendations ? `Recommendations:\n${recommendations}` : undefined,
  ]
    .filter((line): line is string => Boolean(line))
    .join('\n');
};

export const createSignificantEventAttachmentType = ({
  logger,
  getScopedClients,
}: CreateSignificantEventAttachmentTypeOptions): AttachmentTypeDefinition<
  typeof SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
  SignificantEvent
> => {
  const fetchByDiscoverySlug = async (
    discoverySlug: string,
    context: AttachmentResolveContext
  ): Promise<SignificantEvent | undefined> => {
    const { getEventClient } = await getScopedClients({ request: context.request });
    const { hits } = await getEventClient().findByDiscoverySlug(discoverySlug);

    return hits.at(-1);
  };

  return {
    id: SIGNIFICANT_EVENT_ATTACHMENT_TYPE,
    isReadonly: true,
    validate: (input) => {
      const parseResult = significantEventSchema.safeParse(input);
      if (parseResult.success) {
        return { valid: true, data: parseResult.data };
      }
      return { valid: false, error: parseResult.error.message };
    },
    resolve: async (origin, context): Promise<SignificantEvent | undefined> => {
      try {
        return await fetchByDiscoverySlug(origin, context);
      } catch (error) {
        logger.warn(
          `Failed to resolve significant event attachment for origin "${origin}": ${error}`
        );
        return undefined;
      }
    },
    isStale: async (
      attachment: VersionedAttachment<typeof SIGNIFICANT_EVENT_ATTACHMENT_TYPE, SignificantEvent>,
      context
    ): Promise<boolean> => {
      if (!attachment.origin) {
        return false;
      }

      const latestVersion = getLatestVersion(attachment);
      if (!latestVersion) {
        return false;
      }

      try {
        const latestEvent = await fetchByDiscoverySlug(attachment.origin, context);
        return (
          !latestEvent ||
          latestVersion.data.event_id !== latestEvent.event_id ||
          latestVersion.data['@timestamp'] !== latestEvent['@timestamp']
        );
      } catch (error) {
        logger.warn(
          `Failed to check staleness for significant event attachment "${attachment.origin}": ${error}`
        );
        return false;
      }
    },
    format: (attachment) => ({
      getRepresentation: () => ({
        type: 'text',
        value: formatSignificantEventAsText(attachment.data),
      }),
    }),
    getAgentDescription: () =>
      'A significant event attachment represents a durable incident-level Streams event. Rendering it inline displays a read-only event summary card in the conversation UI. Use it as authoritative context for the incident, affected streams, root cause, and recommendations.',
    getTools: () => [],
  };
};
