/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiImageProps } from '@elastic/eui';
import { EuiImage, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useEffect } from 'react';
import { useState } from 'react';

const imageSets = {
  welcome: {
    light: () => import('./welcome_light.svg'),
    dark: () => import('./welcome_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.welcomeImage', {
      defaultMessage: 'Welcome image for the streams app',
    }),
  },
  noResults: {
    light: () => import('./no_results_light.svg'),
    dark: () => import('./no_results_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.noResultsImage', {
      defaultMessage: 'No results image for the streams app',
    }),
  },
  noDocuments: {
    light: () => import('./no_documents_light.svg'),
    dark: () => import('./no_documents_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.noDocumentsImage', {
      defaultMessage: 'No documents image for the streams app',
    }),
  },
  significantEventsEmptyState: {
    light: () => import('./significant_events_empty_state_light.svg'),
    dark: () => import('./significant_events_empty_state_dark.svg'),
    alt: i18n.translate('xpack.streams.significantEvents.emptyStateImage', {
      defaultMessage: 'Empty state illustration for the Significant events view',
    }),
  },
  addStreams: {
    light: () => import('./add_streams_light.svg'),
    dark: () => import('./add_streams_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.addStreamsImage', {
      defaultMessage: 'Add streams image for the streams app',
    }),
  },
  unableToGeneratePreview: {
    light: () => import('./unable_to_generate_preview_light.svg'),
    dark: () => import('./unable_to_generate_preview_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.unableToGeneratePreviewImage', {
      defaultMessage: 'Unable to generate preview image for the streams app',
    }),
  },
  yourPreviewWillAppearHere: {
    light: () => import('./your_preview_will_appear_here_light.svg'),
    dark: () => import('./your_preview_will_appear_here_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.yourPreviewWillAppearHereImage', {
      defaultMessage: 'Your preview will appear here image for the streams app',
    }),
  },
  processorsCannotBeAddedToRootStreams: {
    light: () => import('./processors_cannot_be_added_to_root_streams_light.svg'),
    dark: () => import('./processors_cannot_be_added_to_root_streams_dark.svg'),
    alt: i18n.translate(
      'xpack.streams.streamDetailView.processorsCannotBeAddedToRootStreamsImage',
      {
        defaultMessage: 'Processors cannot be added to root streams image for the streams app',
      }
    ),
  },
  extractFields: {
    light: () => import('./extract_fields_light.svg'),
    dark: () => import('./extract_fields_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.extractFieldsImage', {
      defaultMessage: 'Extract fields image for the streams app',
    }),
  },
  barChart: {
    light: () => import('./bar_chart.svg'),
    dark: () => import('./bar_chart.svg'),
    alt: i18n.translate('xpack.streams.barChartImage', {
      defaultMessage: 'Bar chart sample',
    }),
  },
  attachmentsEmpty: {
    light: () => import('./attachments_empty_light.svg'),
    dark: () => import('./attachments_empty_dark.svg'),
    alt: i18n.translate('xpack.streams.attachments.emptyStateImage', {
      defaultMessage: 'Attachments empty state image',
    }),
  },
  suggestPipeline: {
    light: () => import('./suggest_pipeline_light.svg'),
    dark: () => import('./suggest_pipeline_dark.svg'),
    alt: i18n.translate('xpack.streams.suggestPipelineImage', {
      defaultMessage: 'Suggest pipeline',
    }),
  },
  routingSuggestionEmptyState: {
    light: () => import('./routing_suggestion_empty_state_light.svg'),
    dark: () => import('./routing_suggestion_empty_state_dark.svg'),
    alt: i18n.translate('xpack.streams.streamDetailView.routingTab.noDataEmptyPrompt.image', {
      defaultMessage: 'Suggest AI partitioning image for the streams app',
    }),
  },
  knowledgeIndicatorsEmptyState: {
    light: () => import('./knowledge_indicators_empty_state_light.svg'),
    dark: () => import('./knowledge_indicators_empty_state_dark.svg'),
    alt: i18n.translate('xpack.streams.knowledgeIndicators.emptyStateImage', {
      defaultMessage: 'Empty state illustration for the Knowledge Indicators view',
    }),
  },
  queryStreamsEmptyState: {
    light: () => import('./query_streams_empty_state_light.svg'),
    dark: () => import('./query_streams_empty_state_dark.svg'),
    alt: i18n.translate('xpack.streams.queryStreams.emptyStateImage', {
      defaultMessage: 'Empty state illustration for query streams',
    }),
  },
  significantEventsDiscovery: {
    light: () => import('./significant_events_discovery_light.svg'),
    dark: () => import('./significant_events_discovery_dark.svg'),
    alt: i18n.translate('xpack.streams.significantEventsDiscovery.illustrationImage', {
      defaultMessage: 'Illustration for the Significant Events discovery view',
    }),
  },
};

interface AssetImageProps extends Omit<EuiImageProps, 'src' | 'url' | 'alt'> {
  type?: keyof typeof imageSets;
}

export function AssetImage({ type = 'welcome', ...props }: AssetImageProps) {
  const { colorMode } = useEuiTheme();
  const { alt, dark, light } = imageSets[type];

  const [imageSrc, setImageSrc] = useState<string>();

  useEffect(() => {
    let isMounted = true;
    const dynamicImageImport = colorMode === 'LIGHT' ? light() : dark();

    dynamicImageImport.then((module) => {
      if (isMounted) {
        setImageSrc(module.default);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [colorMode, dark, light]);

  const { size = 'm', ...restProps } = props;
  return imageSrc ? <EuiImage size={size} {...restProps} alt={alt} src={imageSrc} /> : null;
}
