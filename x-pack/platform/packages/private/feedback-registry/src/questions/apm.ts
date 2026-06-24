/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeedbackRegistryEntry } from '@kbn/ui-feedback';

export const questions: FeedbackRegistryEntry[] = [
  {
    id: 'apm_service_count',
    order: 1,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.apmServiceCountPlaceholder',
      defaultMessage: '1-10, 11-50, 51-100, 101-500, 500+',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.apmServiceCountLabel',
      defaultMessage: 'How many services do you want to observe?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.apmServiceCountAriaLabel',
      defaultMessage: 'How many services do you want to observe?',
    },
    question: 'How many services do you want to observe?',
  },
  {
    id: 'apm_used_technologies',
    order: 2,
    placeholder: {
      i18nId: 'xpack.feedbackRegistry.apmUsedTechnologiesPlaceholder',
      defaultMessage: 'e.g. Java, Node.js, Python, .NET, Go...',
    },
    label: {
      i18nId: 'xpack.feedbackRegistry.apmUsedTechnologiesLabel',
      defaultMessage: 'What technologies are you using?',
    },
    ariaLabel: {
      i18nId: 'xpack.feedbackRegistry.apmUsedTechnologiesAriaLabel',
      defaultMessage: 'What technologies are you using?',
    },
    question: 'What technologies are you using?',
  },
];
