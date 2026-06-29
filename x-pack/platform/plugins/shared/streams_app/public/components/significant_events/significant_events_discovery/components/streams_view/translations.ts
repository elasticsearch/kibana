/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const NAME_COLUMN_HEADER = i18n.translate('xpack.streams.streamsTreeTable.nameColumnName', {
  defaultMessage: 'Name',
});

export const SIGNIFICANT_EVENTS_COLUMN_HEADER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.significantEventsColumnName',
  {
    defaultMessage: 'Events',
  }
);

export const SIGNIFICANT_EVENTS_COLUMN_TOOLTIP = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.significantEventsColumnTooltip',
  {
    defaultMessage: 'Number of results produced by created rules.',
  }
);

export const QUERIES_COLUMN_HEADER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.queriesColumnName',
  {
    defaultMessage: 'KI Queries',
  }
);

export const KNOWLEDGE_INDICATORS_COLUMN_HEADER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.knowledgeIndicatorsColumnName',
  {
    defaultMessage: 'KI Features',
  }
);

export const ONBOARDING_STATUS_COLUMN_HEADER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.onboardingStatusColumnName',
  {
    defaultMessage: 'Status',
  }
);

export const ACTIONS_COLUMN_HEADER = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.actionsColumnName',
  {
    defaultMessage: 'Actions',
  }
);

export const NO_STREAMS_MESSAGE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.noStreamsMessage',
  {
    defaultMessage: 'No streams found.',
  }
);

export const STREAMS_TABLE_SEARCH_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.searchAriaLabel',
  { defaultMessage: 'Search streams by name' }
);

export const STREAMS_TABLE_CAPTION_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.tableCaptionAriaLabel',
  {
    defaultMessage: 'Streams data table, listing stream names with links',
  }
);

export const RUN_STREAM_ONBOARDING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.runStreamOnboardingButtonEmptyLabel',
  {
    defaultMessage: 'Onboard stream',
  }
);

export const STOP_STREAM_ONBOARDING_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsTree.stopStreamOnboardingButtonEmptyLabel',
  {
    defaultMessage: 'Stop stream onboarding',
  }
);

export const OCCURRENCES_CHART_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.occurrencesChartTitle',
  {
    defaultMessage: 'Detected event occurrences',
  }
);

export const ONBOARDING_FAILURE_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.onboardingErrorTitle',
  {
    defaultMessage: 'Could not onboard stream',
  }
);

export const DISCOVER_INSIGHTS_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.discoverInsightsButtonLabel',
  {
    defaultMessage: 'Discover Insights',
  }
);
export const DISCOVER_INSIGHTS_CONFIG_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.discoverInsightsConfigAriaLabel',
  {
    defaultMessage: 'Configure discovery model',
  }
);
