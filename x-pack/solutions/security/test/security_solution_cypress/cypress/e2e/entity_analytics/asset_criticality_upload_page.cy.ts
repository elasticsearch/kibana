/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PAGE_TITLE } from '../../screens/asset_criticality';
import { login } from '../../tasks/login';
import { visit } from '../../tasks/navigation';
import { ENTITY_ANALYTICS_ASSET_CRITICALITY_URL } from '../../urls/navigation';

describe('Asset Criticality Upload page', { tags: ['@ess'] }, () => {
  beforeEach(() => {
    login();
    visit(ENTITY_ANALYTICS_ASSET_CRITICALITY_URL);
  });

  it('renders page as expected', () => {
    cy.get(PAGE_TITLE).should('include.text', 'Entity analytics');
  });
});
