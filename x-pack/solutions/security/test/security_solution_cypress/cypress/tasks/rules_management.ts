/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { LAST_BREADCRUMB, RULE_MANAGEMENT_PAGE_BREADCRUMB } from '../screens/breadcrumbs';
import {
  INSTALL_PREBUILT_RULES_URL,
  RULES_MANAGEMENT_URL,
  RULES_UPGRADE_URL,
} from '../urls/rules_management';
import { resetRulesTableState } from './common';
import { visit } from './navigation';

export function visitRulesManagementTable(): void {
  resetRulesTableState(); // Clear persistent rules filter data before page loading
  visit(RULES_MANAGEMENT_URL);
}

export function openRuleManagementPageViaBreadcrumbs(): void {
  cy.log('Navigate back to rules table via breadcrumbs');
  cy.get(RULE_MANAGEMENT_PAGE_BREADCRUMB).not(LAST_BREADCRUMB).click();
  cy.get(RULE_MANAGEMENT_PAGE_BREADCRUMB).filter(LAST_BREADCRUMB).should('exist');
}

export function visitAddRulesPage(): void {
  visit(INSTALL_PREBUILT_RULES_URL);
}

export function visitAddRulesPageWithRuleId(ruleId: string): void {
  visit(`${INSTALL_PREBUILT_RULES_URL}/${ruleId}`);
}

export function visitRulesUpgradeTable(): void {
  visit(RULES_UPGRADE_URL);
  cy.url().should('include', RULES_UPGRADE_URL);
}
