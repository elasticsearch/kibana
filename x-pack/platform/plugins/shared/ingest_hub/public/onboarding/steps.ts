/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';

export interface OnboardingStepConfig {
  id: string;
  title: string;
}

export const ONBOARDING_STEPS: OnboardingStepConfig[] = [
  {
    id: 'services',
    title: i18n.translate('xpack.ingestHub.onboarding.steps.services.title', {
      defaultMessage: 'Services',
    }),
  },
  {
    id: 'service-settings',
    title: i18n.translate('xpack.ingestHub.onboarding.steps.serviceSettings.title', {
      defaultMessage: 'Service Settings',
    }),
  },
  {
    id: 'deploy-settings',
    title: i18n.translate('xpack.ingestHub.onboarding.steps.connect.title', {
      defaultMessage: 'Deploy Settings & Auth',
    }),
  },
  {
    id: 'deploy-and-detect',
    title: i18n.translate('xpack.ingestHub.onboarding.steps.deployment.title', {
      defaultMessage: 'Deploy and Detect',
    }),
  },
];
