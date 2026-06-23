/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, ObltPageObjects } from '@kbn/scout-oblt';
import { createLazyPageObject } from '@kbn/scout-oblt';
import { OnboardingApp } from './onboarding_app';
import { HostPage } from './host_page';
import { KubernetesPage } from './kubernetes_page';

export interface OnboardingPageObjects extends ObltPageObjects {
  onboarding: OnboardingApp;
  host: HostPage;
  kubernetes: KubernetesPage;
}

export function extendPageObjects(
  pageObjects: ObltPageObjects,
  page: ScoutPage
): OnboardingPageObjects {
  return {
    ...pageObjects,
    onboarding: createLazyPageObject(OnboardingApp, page),
    host: createLazyPageObject(HostPage, page),
    kubernetes: createLazyPageObject(KubernetesPage, page),
  };
}
