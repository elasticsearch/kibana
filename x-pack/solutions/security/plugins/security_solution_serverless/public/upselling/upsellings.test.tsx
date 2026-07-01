/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { SecurityPageName } from '@kbn/security-solution-plugin/common';
import { ProductFeatureKey } from '@kbn/security-solution-features/keys';

import { upsellingPages } from './upsellings';

describe('upsellingPages', () => {
  it('registers the Attack discovery page with the Attack discovery PLI', () => {
    const attackDiscoveryPage = upsellingPages.find(
      ({ pageName }) => pageName === SecurityPageName.attackDiscovery
    );

    expect(attackDiscoveryPage?.pli).toEqual(ProductFeatureKey.attackDiscovery);
  });

  it('registers the AI Value Report page upsell with the aiValueReport PLI', () => {
    const aiValuePage = upsellingPages.find(
      ({ pageName }) => pageName === SecurityPageName.aiValue
    );

    expect(aiValuePage?.pli).toEqual(ProductFeatureKey.aiValueReport);
  });
});
