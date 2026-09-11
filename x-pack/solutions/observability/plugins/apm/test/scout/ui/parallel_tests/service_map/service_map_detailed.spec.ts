/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { expect } from '@kbn/scout-oblt/ui';
import { tags } from '@kbn/scout-oblt';
import { test, testData } from '../../fixtures';
import { assertFlyoutApmChartsRendered } from '../../fixtures/service_flyout_helpers';
import {
  DEPENDENCY_POSTGRESQL,
  EDGE_OPBEANS_JAVA_TO_POSTGRESQL,
  EXTENDED_TIMEOUT,
  SERVICE_MAP_KUERY_OPBEANS,
  SERVICE_OPBEANS_JAVA,
  SERVICE_OPBEANS_NODE,
} from '../../fixtures/constants';

test.describe(
  'Service map - nodes, edges and popovers',
  { tag: [...tags.stateful.classic, ...tags.serverless.observability.complete] },
  () => {
    test.use({ viewport: { width: 1600, height: 1200 } });

    test.beforeEach(async ({ browserAuth, pageObjects: { serviceMapPage } }) => {
      await browserAuth.loginAsViewer();
      await serviceMapPage.gotoWithDateSelected(testData.START_DATE, testData.END_DATE, {
        kuery: SERVICE_MAP_KUERY_OPBEANS,
      });
      await serviceMapPage.waitForMapToLoad();
      await serviceMapPage.dismissPopoverIfOpen();
      // Close the options menu so its expanded panel can't overlap the node we click
      // (the menu opens by default and the post-fitView layout may center nodes under it).
      await serviceMapPage.closeOptionsPanelIfOpen();
      await serviceMapPage.settleServiceMapLayout();
    });

    test('renders service map with controls', async ({ pageObjects: { serviceMapPage } }) => {
      await expect(serviceMapPage.serviceMapGraph).toBeVisible();
      await expect(serviceMapPage.mapControls).toBeVisible();
      await expect(serviceMapPage.zoomInBtnControl).toBeVisible();
      await expect(serviceMapPage.zoomOutBtnControl).toBeVisible();
      await expect(serviceMapPage.fitViewBtn).toBeVisible();

      await test.step('zoom controls are interactive', async () => {
        await expect(serviceMapPage.mapControls).toBeVisible();
        await serviceMapPage.clickMapZoomIn();
        await serviceMapPage.clickMapZoomOut();
        await serviceMapPage.clickFitView();
        await expect(serviceMapPage.mapControls).toBeVisible();
      });

      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);

      await test.step('service nodes from opbeans data', async () => {
        const opbeansJavaNode = serviceMapPage.getServiceNode(SERVICE_OPBEANS_JAVA);
        await expect(opbeansJavaNode).toBeVisible();
        const opbeansNodeNode = serviceMapPage.getServiceNode(SERVICE_OPBEANS_NODE);
        await expect(opbeansNodeNode).toBeVisible();
      });

      await test.step('edges from service to dependency', async () => {
        // Opbeans synthtrace has opbeans-java → postgresql (no direct opbeans-java → opbeans-node edge)
        const edge = serviceMapPage.getEdgeById(EDGE_OPBEANS_JAVA_TO_POSTGRESQL);
        await expect(edge).toBeVisible();
      });
    });

    test('shows flyout when clicking on a service node', async ({
      pageObjects: { serviceMapPage, serviceFlyoutPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);
      await expect(serviceFlyoutPage.flyout).toBeVisible();

      const flyoutTitle = await serviceFlyoutPage.getTitle();
      expect(flyoutTitle).toContain(SERVICE_OPBEANS_JAVA);
      await expect(serviceFlyoutPage.content).toBeVisible();

      await assertFlyoutApmChartsRendered(serviceFlyoutPage);

      await expect(serviceFlyoutPage.transactionsSection).toBeVisible({
        timeout: EXTENDED_TIMEOUT,
      });

      await expect(serviceFlyoutPage.transactionSparklines).toHaveCount(3, {
        timeout: EXTENDED_TIMEOUT,
      });
    });

    test('dismisses service flyout when clicking the close button', async ({
      pageObjects: { serviceMapPage, serviceFlyoutPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);
      await expect(serviceFlyoutPage.flyout).toBeVisible();

      await serviceFlyoutPage.close();
      await expect(serviceFlyoutPage.flyout).toBeHidden();
    });

    test('shows popover when clicking on an edge', async ({ pageObjects: { serviceMapPage } }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForEdgeToLoad(EDGE_OPBEANS_JAVA_TO_POSTGRESQL);
      await serviceMapPage.openEdgePopover(EDGE_OPBEANS_JAVA_TO_POSTGRESQL);
      await expect(serviceMapPage.serviceMapPopoverContent).toBeVisible();
      await expect(serviceMapPage.serviceMapEdgeExploreTracesButton).toBeVisible();
      await expect(serviceMapPage.serviceMapEdgeExploreTracesButton).toHaveText('Explore traces');

      const popoverTitle = await serviceMapPage.getPopoverTitle();
      expect(popoverTitle).toContain(`${SERVICE_OPBEANS_JAVA} → ${DEPENDENCY_POSTGRESQL}`);
    });

    test('shows popover when clicking on a dependency node', async ({
      pageObjects: { serviceMapPage },
    }) => {
      await serviceMapPage.dismissPopoverIfOpen();
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForNodeToLoad(`>${DEPENDENCY_POSTGRESQL}`);
      await serviceMapPage.openNodePopover(`>${DEPENDENCY_POSTGRESQL}`);
      await expect(serviceMapPage.serviceMapPopoverContent).toBeVisible();

      const popoverTitle = await serviceMapPage.getPopoverTitle();
      expect(popoverTitle).toContain(DEPENDENCY_POSTGRESQL);
      await expect(serviceMapPage.serviceMapDependencyDetailsButton).toBeVisible();
    });

    test('navigates to Discover (traces)', async ({
      page,
      pageObjects: { serviceMapPage, serviceFlyoutPage, discover, dataGrid },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);

      await expect(serviceFlyoutPage.flyout).toBeVisible();

      await serviceFlyoutPage.clickAction('openTracesInDiscover');

      await expect(page).toHaveURL(new RegExp(`/app/discover`));
      await dataGrid.waitForDocTableRendered();
      expect(await discover.getEsqlQueryValue()).toMatch(new RegExp('traces-'));
    });

    test('navigates to Discover (logs)', async ({
      page,
      pageObjects: { serviceMapPage, serviceFlyoutPage, discover, dataGrid },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);

      await expect(serviceFlyoutPage.flyout).toBeVisible();

      await serviceFlyoutPage.clickAction('openLogsInDiscover');

      await expect(page).toHaveURL(new RegExp(`/app/discover`));
      await dataGrid.waitForDocTableRendered();
      expect(await discover.getEsqlQueryValue()).toMatch(new RegExp('logs-'));
    });

    test('navigates to Service Details (alerts) and page loads', async ({
      page,
      pageObjects: { serviceMapPage, serviceFlyoutPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);
      await expect(serviceFlyoutPage.flyout).toBeVisible();

      await serviceFlyoutPage.clickAction('openAlerts');

      await expect(page).toHaveURL(new RegExp(`/app/apm/services/${SERVICE_OPBEANS_JAVA}/alerts`));
      await expect(page.getByTestId('apmMainTemplateHeaderServiceName')).toBeVisible();
    });

    test('navigates to SLOs and page loads', async ({
      page,
      pageObjects: { serviceMapPage, serviceFlyoutPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);
      await expect(serviceFlyoutPage.flyout).toBeVisible();

      await serviceFlyoutPage.clickAction('openSlos');

      await expect(page).toHaveURL(new RegExp(`/app/slos`));
      await expect(
        page.getByTestId('slosPage').or(page.getByTestId('sloWelcomePage'))
      ).toBeVisible();
    });

    test('navigates to Service Details from flyout title and page loads', async ({
      page,
      pageObjects: { serviceMapPage, serviceFlyoutPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForServiceNodeToLoad(SERVICE_OPBEANS_JAVA);
      await serviceMapPage.openServiceNodeFlyout(SERVICE_OPBEANS_JAVA);

      await serviceFlyoutPage.title.click();

      await expect(page).toHaveURL(
        new RegExp(`/app/apm/services/${SERVICE_OPBEANS_JAVA}/overview`)
      );
      await expect(page.getByTestId('apmMainTemplateHeaderServiceName')).toBeVisible();
    });

    test('navigates to Dependency Details from popover', async ({
      page,
      pageObjects: { serviceMapPage },
    }) => {
      await serviceMapPage.clickFitView();
      await serviceMapPage.waitForNodeToLoad(`>${DEPENDENCY_POSTGRESQL}`);
      await serviceMapPage.openNodePopover(`>${DEPENDENCY_POSTGRESQL}`);
      await serviceMapPage.serviceMapDependencyDetailsButton.click();

      await expect(page).toHaveURL(new RegExp(`/app/apm/dependencies/overview`));
    });
  }
);
