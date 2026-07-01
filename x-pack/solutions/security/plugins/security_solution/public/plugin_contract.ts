/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { lazy } from 'react';
import { BehaviorSubject } from 'rxjs';
import { UpsellingService } from '@kbn/security-solution-upselling/service';
import type { CoreStart } from '@kbn/core/public';
import type { NavigationTreeDefinition } from '@kbn/core-chrome-browser';
import type {
  ProductFeatureKeyType,
  ProductFeatureKeys,
} from '@kbn/security-solution-features/src/types';
import type { ContractStartServices, PluginSetup, PluginStart } from './types';
import type { ExperimentalFeatures } from '../common/experimental_features';
import { breadcrumbsNav$ } from './common/breadcrumbs';
import { ContractComponentsService } from './contract_components';
import { OnboardingService } from './onboarding/service';

const AIValueReportLazy = lazy(() =>
  import(
    /* webpackChunkName: "ai_value_report" */
    './reports/components/ai_value'
  ).then(({ AIValueReport }) => ({ default: AIValueReport }))
);

export class PluginContract {
  public componentsService: ContractComponentsService;
  public upsellingService: UpsellingService;
  public onboardingService: OnboardingService;
  public solutionNavigationTree$: BehaviorSubject<NavigationTreeDefinition | null>;
  public productFeatureKeys$: BehaviorSubject<Set<ProductFeatureKeyType> | null>;

  constructor(private readonly experimentalFeatures: ExperimentalFeatures) {
    this.onboardingService = new OnboardingService();
    this.componentsService = new ContractComponentsService();
    this.upsellingService = new UpsellingService();
    this.solutionNavigationTree$ = new BehaviorSubject<NavigationTreeDefinition | null>(null); // defaults to classic navigation
    this.productFeatureKeys$ = new BehaviorSubject<Set<ProductFeatureKeyType> | null>(null);
  }

  public getSetupContract(): PluginSetup {
    return {
      resolver: lazyResolver,
      experimentalFeatures: { ...this.experimentalFeatures },
      setProductFeatureKeys: (productFeatureKeys: ProductFeatureKeys) => {
        this.productFeatureKeys$.next(new Set(productFeatureKeys));
      },
    };
  }

  public getStartContract(_core: CoreStart): PluginStart {
    return {
      setComponents: (components) => {
        this.componentsService.setComponents(components);
      },
      getBreadcrumbsNav$: () => breadcrumbsNav$,
      getUpselling: () => this.upsellingService,
      setSolutionNavigationTree: (navigationTree) => {
        this.solutionNavigationTree$.next(navigationTree);
      },
      setOnboardingSettings: this.onboardingService.setSettings.bind(this.onboardingService),
      getAIValueReport: () => AIValueReportLazy,
    };
  }

  public getStartServices(): ContractStartServices {
    return {
      getComponents$: this.componentsService.getComponents$.bind(this.componentsService),
      upselling: this.upsellingService,
      onboarding: this.onboardingService,
      productFeatureKeys$: this.productFeatureKeys$.asObservable(),
    };
  }
}

/**
 * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
 * See https://webpack.js.org/api/module-methods/#magic-comments
 */
const lazyResolver = async () => {
  const { resolverPluginSetup } = await import(
    /* webpackChunkName: "resolver" */
    './resolver'
  );
  return resolverPluginSetup();
};
