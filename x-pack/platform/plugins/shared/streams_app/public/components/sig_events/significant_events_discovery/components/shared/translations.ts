/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { Detection, Discovery, SigEventStatus } from '@kbn/streams-schema';

export const FIND_SIGNIFICANT_EVENTS_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.findSignificantEventsLabel',
  {
    defaultMessage: 'Find Significant Events',
  }
);

export const CANCEL_DISCOVERY_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.cancelDiscoveryLabel',
  {
    defaultMessage: 'Cancel',
  }
);

export const GENERATE_FEATURES_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateFeaturesButtonLabel',
  {
    defaultMessage: 'Generate KI Features',
  }
);

export const GENERATE_QUERIES_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateQueriesButtonLabel',
  {
    defaultMessage: 'Generate KI Queries',
  }
);

export const CONNECTOR_LOAD_ERROR = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.connectorLoadError',
  {
    defaultMessage: 'Failed to load connectors',
  }
);

export const GENERATE_CONFIG_ARIA_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateConfigAriaLabel',
  {
    defaultMessage: 'Configure generation steps and models',
  }
);

export const GENERATE_BUTTON_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateButtonLabel',
  {
    defaultMessage: 'Generate',
  }
);

export const MODEL_SELECTION_PANEL_TITLE = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.modelSelectionPanelTitle',
  {
    defaultMessage: 'Model selection',
  }
);

export const MODEL_SETTINGS_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.modelSettingsLabel',
  {
    defaultMessage: 'Model settings',
  }
);

export const DEFAULT_MODEL_BADGE_LABEL = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.defaultModelBadgeLabel',
  {
    defaultMessage: 'Default',
  }
);

export const GENERATE_FEATURES_TOOLTIP = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateFeaturesTooltip',
  {
    defaultMessage:
      'Runs only feature identification on selected streams using the configured model.',
  }
);

export const GENERATE_QUERIES_TOOLTIP = i18n.translate(
  'xpack.streams.significantEventsDiscovery.streamsView.generateQueriesTooltip',
  {
    defaultMessage: 'Runs only query generation on selected streams using the configured model.',
  }
);

export const CHANGE_TYPE_LABELS: Record<string, string> = {
  dip: i18n.translate('xpack.streams.changeType.dip', {
    defaultMessage: 'Dip',
  }),
  distribution_change: i18n.translate('xpack.streams.changeType.distributionChange', {
    defaultMessage: 'Distribution change',
  }),
  non_stationary: i18n.translate('xpack.streams.changeType.nonStationary', {
    defaultMessage: 'Non-stationary',
  }),
  spike: i18n.translate('xpack.streams.changeType.spike', {
    defaultMessage: 'Spike',
  }),
  stationary: i18n.translate('xpack.streams.changeType.stationary', {
    defaultMessage: 'Stationary',
  }),
  step_change: i18n.translate('xpack.streams.changeType.stepChange', {
    defaultMessage: 'Step change',
  }),
  trend_change: i18n.translate('xpack.streams.changeType.trendChange', {
    defaultMessage: 'Trend change',
  }),
};

export const changeTypeLabel = (type?: string): string =>
  (type ? CHANGE_TYPE_LABELS[type] : undefined) ?? type ?? '-';
export const DETECTION_KIND_LABELS: Record<Detection['kind'], string> = {
  detection: i18n.translate('xpack.streams.detection.kind.detected', {
    defaultMessage: 'Detected',
  }),
  quiet: i18n.translate('xpack.streams.detection.kind.recovered', {
    defaultMessage: 'Recovered',
  }),
  handled: i18n.translate('xpack.streams.detection.kind.investigated', {
    defaultMessage: 'Processed',
  }),
};

export const DISCOVERY_KIND_LABELS: Record<Discovery['kind'], string> = {
  discovery: i18n.translate('xpack.streams.discovery.kind.discovery', {
    defaultMessage: 'Discovery',
  }),
  clearance: i18n.translate('xpack.streams.discovery.kind.clearance', {
    defaultMessage: 'Cleared',
  }),
  handled: i18n.translate('xpack.streams.discovery.kind.handled', {
    defaultMessage: 'Processed',
  }),
};

export const SIG_EVENT_STATUS_LABELS: Record<SigEventStatus, string> = {
  promoted: i18n.translate('xpack.streams.sigEvent.status.promoted', {
    defaultMessage: 'Promoted',
  }),
  acknowledged: i18n.translate('xpack.streams.sigEvent.status.acknowledged', {
    defaultMessage: 'Acknowledged',
  }),
  resolved: i18n.translate('xpack.streams.sigEvent.status.resolved', {
    defaultMessage: 'Resolved',
  }),
  demoted: i18n.translate('xpack.streams.sigEvent.status.demoted', {
    defaultMessage: 'Demoted',
  }),
};
