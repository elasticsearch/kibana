/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE, PREVALENCE_SOURCE_IP } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Investigation section',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      // Index a source event carrying `source.ip` and surface it as a custom highlighted field,
      // TODO: Source event, host name, user name, etc.
      // so the Investigation section renders the special IP field as a child-flyout link.
      const { sourceIndex } = await apiServices.prevalence.createPrevalenceFixture(scoutSpace.id);

      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: [sourceIndex],
        investigation_fields: { field_names: ['source.ip'] },
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await apiServices.prevalence.cleanupPrevalenceFixture(scoutSpace.id);
    });

    spaceTest(
      'highlighted fields: clicking the source.ip value opens the network details child flyout',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await expect(pageObjects.documentFlyout.investigationSection).toBeVisible();
        await expect(pageObjects.documentFlyout.highlightedFieldsTable).toBeVisible();

        // `source.ip` is a "special" highlighted field: it renders as a link that opens the
        // network details flyout. Other special fields (e.g. host.name, user.name) will be
        // added here as their child flyouts become available.
        const sourceIpLink = pageObjects.documentFlyout.highlightedFieldChildLink('source.ip');
        await expect(sourceIpLink).toBeVisible();
        await expect(sourceIpLink).toContainText(PREVALENCE_SOURCE_IP);

        await sourceIpLink.click();

        // The network details flyout opens as a child flyout, titled with the clicked IP.
        await expect(pageObjects.documentFlyout.networkDetailsFlyoutTitle).toBeVisible({
          timeout: 10_000,
        });
        await expect(pageObjects.documentFlyout.networkDetailsFlyoutTitle).toContainText(
          PREVALENCE_SOURCE_IP
        );
      }
    );
  }
);
