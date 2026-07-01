/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import type { Meta } from '@storybook/react';
import { action } from '@storybook/addon-actions';
import type { EmbeddableStoryObj } from '@kbn/storybook';

import { FeedbackTriggerButton, FeedbackContainer } from '../components';
import type { FeedbackFormData, FeedbackRegistryEntry } from '../types';

const questions: FeedbackRegistryEntry[] = [
  {
    id: 'overall_experience',
    order: 1,
    question: 'How would you rate your overall experience?',
    placeholder: {
      i18nId: 'kbnUI.feedback.stories.overallExperiencePlaceholder',
      defaultMessage: 'Tell us about your experience',
    },
  },
  {
    id: 'missing_features',
    order: 2,
    question: 'What features are you missing?',
    placeholder: {
      i18nId: 'kbnUI.feedback.stories.missingFeaturesPlaceholder',
      defaultMessage: 'Let us know what would make this better',
    },
  },
];

const services = {
  getQuestions: async () => questions,
  getAppDetails: () => ({ title: 'Storybook', id: 'storybook', url: 'https://example.com' }),
  getCurrentUserEmail: async () => undefined,
  sendFeedback: async (data: FeedbackFormData) => action('sendFeedback')(data),
  showToast: (title: string, type: 'success' | 'error') => action('showToast')({ title, type }),
};

const meta: Meta = {
  title: 'Feedback',
};

export default meta;

export const TriggerButton: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 48 } },
  render: () => <FeedbackTriggerButton {...services} checkTelemetryOptIn={async () => true} />,
};

export const Form: EmbeddableStoryObj = {
  tags: ['embeddable'],
  parameters: { embeddable: { height: 640 } },
  render: () => (
    <FeedbackContainer {...services} hideFeedbackContainer={action('hideFeedbackContainer')} />
  ),
};
