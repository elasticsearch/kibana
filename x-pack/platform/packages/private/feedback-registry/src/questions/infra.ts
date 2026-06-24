/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeedbackRegistryEntry } from '@kbn/ui-feedback';

export const questions: FeedbackRegistryEntry[] = [
  {
    id: 'infra_host_count',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.infraHostCountPlaceholder',
      defaultMessage: '1-500, 501-2,000, 2,001-5,000, 5,001-10,000, 10,000+',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.infraHostCountLabel',
      defaultMessage: 'How many hosts do you want to observe?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.infraHostCountAriaLabel',
      defaultMessage: 'How many hosts do you want to observe?',
    },
    question: 'How many hosts do you want to observe?',
  },
  {
    id: 'infra_used_technologies',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.infraUsedTechnologiesPlaceholder',
      defaultMessage: 'e.g. Linux, Kubernetes, Docker, AWS EC2, GCP...',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.infraUsedTechnologiesLabel',
      defaultMessage: 'What technologies are you using?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.infraUsedTechnologiesAriaLabel',
      defaultMessage: 'What technologies are you using?',
    },
    question: 'What technologies are you using?',
  },
];
