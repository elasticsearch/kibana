/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { BehaviorSubject, of } from 'rxjs';
import { UpsellingService } from '@kbn/security-solution-upselling/service';
import type { ProductFeatureKeyType } from '@kbn/security-solution-features';
import type { BreadcrumbsNav } from './common/breadcrumbs';
import { allowedExperimentalValues } from '../common/experimental_features';
import type { PluginStart, PluginSetup, ContractStartServices } from './types';
import { OnboardingService } from './onboarding/service';

const upselling = new UpsellingService();
const onboardingService = new OnboardingService();

export const contractStartServicesMock: ContractStartServices = {
  getComponents$: jest.fn(() => of({})),
  upselling,
  onboarding: onboardingService,
  productFeatureKeys$: new BehaviorSubject<Set<ProductFeatureKeyType> | null>(null),
};

const setupMock = (): PluginSetup => ({
  resolver: jest.fn(),
  experimentalFeatures: allowedExperimentalValues, // default values,
  setProductFeatureKeys: jest.fn(),
});

const startMock = (): PluginStart => ({
  setComponents: jest.fn(),
  getBreadcrumbsNav$: jest.fn(
    () => new BehaviorSubject<BreadcrumbsNav>({ leading: [], trailing: [] })
  ),
  getUpselling: () => upselling,
  setOnboardingSettings: onboardingService.setSettings.bind(onboardingService),
  setSolutionNavigationTree: jest.fn(),
  getAIValueReport: jest.fn(() => () => null),
});

export const securitySolutionMock = {
  createSetup: setupMock,
  createStart: startMock,
};
