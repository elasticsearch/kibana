/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE, THREAT_FEED_NAME } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Threat intelligence tool overlay',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.threatIntelligence.cleanupFileIndicatorFixture(scoutSpace.id);
      await apiServices.detectionAlerts.deleteAll();
    });

    spaceTest(
      'shows fields enriched with threat intelligence count in insights section',
      async ({ pageObjects, scoutSpace, apiServices }) => {
        const { sourceIndex } = await apiServices.threatIntelligence.createFileIndicatorFixture(
          scoutSpace.id
        );

        const tiRuleName = `TI Enrichment Test_${scoutSpace.id}_${Date.now()}`;
        await apiServices.detectionRule.createCustomQueryRule({
          ...CUSTOM_QUERY_RULE,
          rule_id: `ti-enrichment-rule-${scoutSpace.id}`,
          name: tiRuleName,
          index: [sourceIndex],
        });

        await pageObjects.documentFlyout.openForRule(tiRuleName);

        await expect(pageObjects.documentFlyout.insightsSection).toBeVisible();

        // "Fields enriched with threat intelligence" should show 1
        await expect(pageObjects.threatIntelligenceTool.enrichedButton).toBeVisible();
        await expect(pageObjects.threatIntelligenceTool.enrichedButton).toHaveText('1');

        // Drill into the threat intelligence tool overlay
        await pageObjects.threatIntelligenceTool.enrichedButton.click();

        // Wait for the tool view to fully render (event-data load + investigation-time query)
        await expect(pageObjects.threatIntelligenceTool.detailsLoading).toHaveCount(0, {
          timeout: 15_000,
        });
        await expect(pageObjects.threatIntelligenceTool.detailsLoadingEnrichment).toHaveCount(0, {
          timeout: 15_000,
        });

        // "Enriched with threat intelligence" section (investigation-time) must be present
        await expect(pageObjects.threatIntelligenceTool.detailsEnrichedSection).toBeVisible();

        // Date range picker is always rendered for investigation-time enrichments
        await expect(pageObjects.threatIntelligenceTool.detailsRangePicker).toBeVisible();

        // Exactly one accordion — one indicator matched the source doc's file.hash.sha256
        await expect(pageObjects.threatIntelligenceTool.detailsAccordions).toHaveCount(1);

        // Accordion detail table renders field/value rows for the indicator
        await expect(pageObjects.threatIntelligenceTool.detailsAccordionTable(0)).toBeVisible();

        // Feed name from the fixture indicator is displayed in the accordion
        await expect(pageObjects.threatIntelligenceTool.detailsAccordionTable(0)).toContainText(
          THREAT_FEED_NAME
        );
      }
    );
  }
);
