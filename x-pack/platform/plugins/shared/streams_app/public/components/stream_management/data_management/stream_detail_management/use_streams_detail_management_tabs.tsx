/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import { Streams } from '@kbn/streams-schema';
import React from 'react';
import { useStreamsPrivileges } from '../../../../hooks/use_streams_privileges';
import { StreamDetailSignificantEventsView } from '../../../significant_events/stream_detail_significant_events_view';
import { StreamDetailEnrichment } from '../stream_detail_enrichment';

export function useStreamsDetailManagementTabs({
  definition,
  refreshDefinition,
}: {
  definition: Streams.all.GetResponse;
  refreshDefinition: () => void;
}) {
  const {
    features: { significantEvents },
    isLoading,
  } = useStreamsPrivileges();

  const isSignificantEventsEnabled = !!significantEvents?.enabled && !!significantEvents?.available;
  const isReplicated =
    Streams.ingest.all.GetResponse.is(definition) && definition.replicated === true;
  const isProcessingEnabled = Streams.ingest.all.GetResponse.is(definition) && !isReplicated;

  return {
    isLoading,
    ...(isProcessingEnabled && {
      processing: {
        content: (
          <StreamDetailEnrichment definition={definition} refreshDefinition={refreshDefinition} />
        ),
        label: i18n.translate('xpack.streams.streamDetailView.processingTab', {
          defaultMessage: 'Processing',
        }),
      },
    }),
    ...(isSignificantEventsEnabled
      ? {
          significantEvents: {
            content: <StreamDetailSignificantEventsView definition={definition} />,
            label: i18n.translate('xpack.streams.streamDetailView.significantEventsTab', {
              defaultMessage: 'Significant events',
            }),
          },
        }
      : {}),
  };
}
