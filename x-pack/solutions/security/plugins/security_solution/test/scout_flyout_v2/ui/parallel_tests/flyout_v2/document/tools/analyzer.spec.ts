/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  spaceTest,
  tags,
  CUSTOM_QUERY_RULE,
  ANALYZER_ORIGIN_PROCESS_NAME,
} from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Analyzer tool overlay',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      const { sourceIndex } = await apiServices.analyzer.createAnalyzerFixture(scoutSpace.id);

      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: [sourceIndex],
        // Only the origin process matches, so exactly one alert is generated; its ancestors stay in
        // the index purely so the resolver can build the process tree.
        query: `process.name: "${ANALYZER_ORIGIN_PROCESS_NAME}"`,
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      await apiServices.analyzer.cleanupAnalyzerFixture(scoutSpace.id);
    });

    // Note: the shared tools-flyout header (title + alert icon → child document flyout) is the same
    // `ToolsFlyoutTitle` component covered in tools_flyout_title.test.tsx and smoke-tested once in
    // prevalence.spec.ts, so it's not duplicated here.

    spaceTest(
      'opens analyzer tool overlay and renders the resolver process tree',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.visualizationsSection.click();
        await pageObjects.analyzerTool.titleLink.click();

        // The analyzer overlay mounts asynchronously once the resolver tree fetch kicks off, so
        // allow extra time for the header/graph to appear.
        await expect(pageObjects.analyzerTool.toolsFlyoutHeader).toBeVisible({ timeout: 10_000 });
        await expect(pageObjects.analyzerTool.analyzerGraph).toBeVisible();

        // Wait for the resolver tree fetch to finish, then assert the graph rendered with nodes.
        await expect(pageObjects.analyzerTool.resolverLoading).toHaveCount(0, { timeout: 15_000 });
        await expect(pageObjects.analyzerTool.resolverGraph).toBeVisible();

        // origin → parent → grandparent yields three process nodes.
        await expect(pageObjects.analyzerTool.resolverNodes).toHaveCount(3, { timeout: 15_000 });
        await expect(pageObjects.analyzerTool.resolverNoData).toHaveCount(0);
      }
    );

    spaceTest(
      'clicking an analyzed process node opens its document in a child flyout',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.visualizationsSection.click();
        await pageObjects.analyzerTool.titleLink.click();

        // The resolver tree fetch is slow on first load; wait for it to settle before asserting.
        await expect(pageObjects.analyzerTool.resolverLoading).toHaveCount(0, { timeout: 15_000 });
        await expect(pageObjects.analyzerTool.resolverGraph).toBeVisible();

        // Click the analyzed (origin) process node — its detail panel opens.
        await pageObjects.analyzerTool.resolverNodeButton(ANALYZER_ORIGIN_PROCESS_NAME).click();
        await expect(pageObjects.analyzerTool.nodeDetailPanel).toBeVisible({ timeout: 15_000 });

        // Pressing the node title opens the process document in a child flyout alongside the
        // original alert flyout, so two document titles are now present.
        await pageObjects.analyzerTool.nodeDetailTitleLink.click();
        await expect(pageObjects.documentFlyout.title).toHaveCount(2, { timeout: 15_000 });
      }
    );

    spaceTest(
      'drills an analyzed node down to its alert event type and opens the corresponding rule',
      async ({ pageObjects }) => {
        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.visualizationsSection.click();
        await pageObjects.analyzerTool.titleLink.click();

        // The resolver tree fetch is slow on first load; wait for it to settle before asserting.
        await expect(pageObjects.analyzerTool.resolverLoading).toHaveCount(0, { timeout: 15_000 });
        await expect(pageObjects.analyzerTool.resolverGraph).toBeVisible();

        // Open the analyzed (origin) node's detail panel, then drill into its related events.
        await pageObjects.analyzerTool.resolverNodeButton(ANALYZER_ORIGIN_PROCESS_NAME).click();
        await expect(pageObjects.analyzerTool.nodeDetailPanel).toBeVisible({ timeout: 15_000 });
        await pageObjects.analyzerTool.nodeDetailEventsLink.click();

        // The alert generated for this node appears as the "alert" event type — drill into it.
        await pageObjects.analyzerTool.eventTypeLink.click();
        await expect(pageObjects.analyzerTool.eventsInCategoryPanel).toBeVisible({
          timeout: 15_000,
        });
        await expect(pageObjects.analyzerTool.eventsInCategoryPanel).toContainText(ruleName);

        // Clicking the rule opens the corresponding alert in a child flyout
        await pageObjects.analyzerTool.eventInCategoryLink.click();
        await expect(pageObjects.documentFlyout.title.filter({ hasText: ruleName })).toHaveCount(
          2,
          { timeout: 15_000 }
        );
      }
    );
  }
);
