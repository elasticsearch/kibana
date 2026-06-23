/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiText } from '@elastic/eui';
import { css } from '@emotion/react';
import type { EuiTourStepProps } from '@elastic/eui';
import type { StreamsTourStepId } from './constants';

export type TourStepConfig = Omit<EuiTourStepProps, 'children' | 'isStepOpen' | 'onFinish'> & {
  stepId: StreamsTourStepId;
};

const tightContentCss = css`
  margin-top: -14px;
`;

const TOUR_SUBTITLE = i18n.translate('xpack.streams.tour.subtitle', {
  defaultMessage: 'Streams',
});

const STREAMS_LIST_STEP: Omit<TourStepConfig, 'step' | 'stepsTotal'> = {
  stepId: 'streams_list',
  subtitle: TOUR_SUBTITLE,
  title: i18n.translate('xpack.streams.tour.streamsList.title', {
    defaultMessage: 'All your data in one place',
  }),
  content: (
    <EuiText size="s" css={tightContentCss}>
      {i18n.translate('xpack.streams.tour.streamsList.content', {
        defaultMessage:
          'Browse all streams from your data. Select a stream to explore its data, structure, and attached assets.',
      })}
    </EuiText>
  ),
  anchorPosition: 'rightUp',
  offset: 56,
  maxWidth: 360,
};

const RETENTION_STEP: Omit<TourStepConfig, 'step' | 'stepsTotal'> = {
  stepId: 'retention',
  subtitle: TOUR_SUBTITLE,
  title: i18n.translate('xpack.streams.tour.retention.title', {
    defaultMessage: 'Retention',
  }),
  content: (
    <EuiText size="s" css={tightContentCss}>
      {i18n.translate('xpack.streams.tour.retention.content', {
        defaultMessage: 'Control how long your data is kept and when it is removed.',
      })}
    </EuiText>
  ),
  anchorPosition: 'downLeft',
  maxWidth: 360,
};

const PROCESSING_STEP: Omit<TourStepConfig, 'step' | 'stepsTotal'> = {
  stepId: 'processing',
  subtitle: TOUR_SUBTITLE,
  title: i18n.translate('xpack.streams.tour.processing.title', {
    defaultMessage: 'Parse, enrich, and transform your data',
  }),
  content: (
    <EuiText size="s" css={tightContentCss}>
      {i18n.translate('xpack.streams.tour.processing.content', {
        defaultMessage:
          'Review high-level indicators to quickly understand the state of this stream.',
      })}
    </EuiText>
  ),
  anchorPosition: 'downCenter',
  maxWidth: 360,
};

const ATTACHMENTS_STEP: Omit<TourStepConfig, 'step' | 'stepsTotal'> = {
  stepId: 'attachments',
  subtitle: TOUR_SUBTITLE,
  title: i18n.translate('xpack.streams.tour.attachments.title', {
    defaultMessage: 'Manage assets built on this stream’s data in one place',
  }),
  content: (
    <EuiText size="s" css={tightContentCss}>
      {i18n.translate('xpack.streams.tour.attachments.content', {
        defaultMessage:
          'Link dashboards, rules, and SLOs based on this stream’s data so you can manage them from a single page.',
      })}
    </EuiText>
  ),
  anchorPosition: 'downCenter',
  maxWidth: 360,
};

export function getTourStepsConfig(): TourStepConfig[] {
  const baseSteps: Array<Omit<TourStepConfig, 'step' | 'stepsTotal'>> = [
    STREAMS_LIST_STEP,
    RETENTION_STEP,
    PROCESSING_STEP,
    ATTACHMENTS_STEP,
  ];

  const stepsTotal = baseSteps.length;

  return baseSteps.map((stepConfig, index) => ({
    ...stepConfig,
    step: index + 1,
    stepsTotal,
  }));
}
