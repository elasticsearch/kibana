/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  waitForPluginInitialized,
  waitForEntityDataIndexed,
  dataViewRouteHelpersFactory,
  installEntityStoreV2,
  uninstallEntityStoreV2,
  waitForEntityStoreV2Running,
} from '../../../cloud_security_posture_api/utils';
import type { SecurityTelemetryFtrProviderContext } from '../../config.base';

// eslint-disable-next-line import/no-default-export
export default function ({ getPageObjects, getService }: SecurityTelemetryFtrProviderContext) {
  const es = getService('es');
  const retry = getService('retry');
  const logger = getService('log');
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const ebtUIHelper = getService('kibana_ebt_ui');
  const kibanaServer = getService('kibanaServer');
  const pageObjects = getPageObjects([
    'common',
    'header',
    'alerts',
    'expandedFlyoutGraph',
    'timeline',
  ]);
  const alertsPage = pageObjects.alerts;
  const expandedFlyoutGraph = pageObjects.expandedFlyoutGraph;
  const timelinePage = pageObjects.timeline;

  describe('Security Alerts Page - Graph visualization', function () {
    this.tags(['cloud_security_posture_graph_viz']);

    before(async () => {
      // Clean up any leftover alerts indices from previous failed runs
      for (const suffix of ['000001', '000002']) {
        try {
          await es.indices.delete({
            index: `.internal.alerts-security.alerts-default-${suffix}`,
          });
        } catch (e) {
          // Ignore if index doesn't exist
        }
      }

      // security_alerts_modified_mappings - contains mappings for actor and target
      // security_alerts - does not contain mappings for actor and target
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/security_alerts_modified_mappings'
      );
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );

      await waitForPluginInitialized({ retry, supertest, logger });
      await ebtUIHelper.setOptIn(true); // starts the recording of events from this moment

      // Enable asset inventory and entity store v2 settings
      await kibanaServer.uiSettings.update({
        'securitySolution:enableAssetInventory': true,
        'securitySolution:entityStoreEnableV2': true,
      });

      // Initialize security-solution-default data-view (required by entity store)
      const dataView = dataViewRouteHelpersFactory(supertest);
      await dataView.create('security-solution');

      // Install Entity Store V2 (required for graph visualization)
      await installEntityStoreV2({ supertest, logger });
      await waitForEntityStoreV2Running({ supertest, retry, logger });
    });

    after(async () => {
      await uninstallEntityStoreV2({ supertest, logger });
      await es.deleteByQuery({
        index: '.internal.alerts-*',
        query: { match_all: {} },
        conflicts: 'proceed',
      });
      await esArchiver.unload(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );
    });

    it('expanded flyout - filter by node', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await alertsPage.navigateToAlertsPage(
        `${alertsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${alertsPage.getFlyoutFilter(
          '589e086d7ceec7d4b353340578bd607e96fbac7eab9e2926f110990be15122f1'
        )}`
      );
      await alertsPage.waitForListToHaveAlerts();

      await alertsPage.flyout.expandVisualizations();
      await alertsPage.flyout.assertGraphPreviewVisible();
      await alertsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);
      await expandedFlyoutGraph.toggleSearchBar();

      // Show actions by entity
      await expandedFlyoutGraph.showActionsByEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(0, 'user.id: admin@example.com');
      await expandedFlyoutGraph.expectFilterPreviewEquals(0, 'user.id: admin@example.com');

      // Show actions on entity
      await expandedFlyoutGraph.showActionsOnEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com'
      );

      // Explore related entities
      await expandedFlyoutGraph.exploreRelatedEntities('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Show events with the same action
      await expandedFlyoutGraph.showEventsOfSameAction(
        'label(google.iam.admin.v1.CreateRole)ln(b0f4971b57721f2778832a4f81523af433a4f974671ce49770e1846d12e20760)oe(1)oa(1)'
      );
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp OR event.action: google.iam.admin.v1.CreateRole'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp OR event.action: google.iam.admin.v1.CreateRole'
      );

      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

      await expandedFlyoutGraph.showEntityDetails(
        '788e996886e5d4eea273c24f7d591159076bca81e76bde03cf2936802da9c701'
      );
      // check the preview panel grouped items rendered correctly
      await alertsPage.flyout.assertPreviewPanelGroupedItemsNumber(4);
      await expandedFlyoutGraph.assertPreviewPanelGroupedItemTitleTextNumber(4);

      await expandedFlyoutGraph.closePreviewSection();
      // Hide events with the same action
      await expandedFlyoutGraph.hideEventsOfSameAction(
        'label(google.iam.admin.v1.CreateRole)ln(b0f4971b57721f2778832a4f81523af433a4f974671ce49770e1846d12e20760)oe(1)oa(1)'
      );
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR user.target.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Hide actions on entity
      await expandedFlyoutGraph.hideActionsOnEntity('user:admin@example.com@gcp');
      await expandedFlyoutGraph.expectFilterTextEquals(
        0,
        'user.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );
      await expandedFlyoutGraph.expectFilterPreviewEquals(
        0,
        'user.id: admin@example.com OR related.entity: user:admin@example.com@gcp'
      );

      // Clear filters
      await expandedFlyoutGraph.clearAllFilters();

      // Add custom filter
      await expandedFlyoutGraph.addFilter({
        field: 'user.id',
        operation: 'is',
        value: 'admin2@example.com',
      });
      await pageObjects.header.waitUntilLoadingHasFinished();

      await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();
      await expandedFlyoutGraph.assertGraphNodesNumber(5);

      // Open timeline
      await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
      await timelinePage.ensureTimelineIsOpen();
      await timelinePage.waitForEvents();
      await timelinePage.closeTimeline();

      // Test query bar
      await expandedFlyoutGraph.setKqlQuery('cannotFindThis');
      await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
      await timelinePage.ensureTimelineIsOpen();
      await timelinePage.waitForEvents();
    });

    it('expanded flyout - show alert details', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await alertsPage.navigateToAlertsPage(
        `${alertsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${alertsPage.getFlyoutFilter(
          '589e086d7ceec7d4b353340578bd607e96fbac7eab9e2926f110990be15122f1'
        )}`
      );
      await alertsPage.waitForListToHaveAlerts();

      await alertsPage.flyout.expandVisualizations();
      await alertsPage.flyout.assertGraphPreviewVisible();
      await alertsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.showEventOrAlertDetails(
        'label(google.iam.admin.v1.CreateRole)ln(b0f4971b57721f2778832a4f81523af433a4f974671ce49770e1846d12e20760)oe(1)oa(1)'
      );
      // An alert is always coupled with an event, so we open the group preview panel instead of the alert panel
      await alertsPage.flyout.assertPreviewPanelIsOpen('group');
      await alertsPage.flyout.assertPreviewPanelGroupedItemsNumber(3);

      // assert the grouped items are rendered correctly
      await alertsPage.flyout.assertPreviewPanelGroupedItemsNumber(3);
      await expandedFlyoutGraph.assertPreviewPanelGroupedItemTitleLinkNumber(3);
      await expandedFlyoutGraph.assertGroupedItemActorAndTargetValues(
        2,
        'admin@example.com',
        'projects/your-project-id/roles/customRole'
      );
    });

    it('show related alerts', async () => {
      // Setting the timerange to fit the data and open the flyout for a specific alert
      await alertsPage.navigateToAlertsPage(
        `${alertsPage.getAbsoluteTimerangeFilter(
          '2024-09-01T00:00:00.000Z',
          '2024-09-02T00:00:00.000Z'
        )}&${alertsPage.getFlyoutFilter(
          '589e086d7ceec7d4b353340578bd607e96fbac7eab9e2926f110990be15122f1'
        )}`
      );
      await alertsPage.waitForListToHaveAlerts();

      await alertsPage.flyout.expandVisualizations();
      await alertsPage.flyout.assertGraphPreviewVisible();
      await alertsPage.flyout.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.expandGraph();
      await expandedFlyoutGraph.waitGraphIsLoaded();
      await expandedFlyoutGraph.assertGraphNodesNumber(3);

      await expandedFlyoutGraph.showActionsOnEntity('projects/your-project-id/roles/customRole');

      await expandedFlyoutGraph.showEventOrAlertDetails(
        'label(google.iam.admin.v1.CreateRole2)ln(fe63b16ddd48d7792e4391e9067cdf4f273045a23d5596074c89afe7c03b3083)oe(0)oa(0)'
      );
      // An alert is always coupled with an event, so we open the group preview panel instead of the alert panel
      await alertsPage.flyout.assertPreviewPanelIsOpen('group');
      await alertsPage.flyout.assertPreviewPanelGroupedItemsNumber(2);
    });

    describe('ECS fields only', function () {
      // Entity store v2 is installed at the parent level for graph visibility.
      // Enrichment tests use LOOKUP JOIN (v2) with custom entity data loaded via esArchiver.
      before(async () => {
        await es.deleteByQuery({
          index: '.internal.alerts-*',
          query: { match_all: {} },
          conflicts: 'proceed',
        });

        // Load alerts data
        await esArchiver.load(
          'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/security_alerts_ecs_only_mappings'
        );
      });

      // Shared test suite that registers all test cases - called from both v1 and v2 describe blocks
      const runEnrichmentTests = () => {
        it('expanded flyout - entity enrichment for multiple generic targets - single target field', async () => {
          await alertsPage.navigateToAlertsPage(
            `${alertsPage.getAbsoluteTimerangeFilter(
              '2024-09-01T00:00:00.000Z',
              '2024-09-02T00:00:00.000Z'
            )}&${alertsPage.getFlyoutFilter(
              'new-schema-alert-789xyz456abc123def789ghi012jkl345mno678pqr901stu234vwx567'
            )}`
          );
          await alertsPage.waitForListToHaveAlerts();

          await alertsPage.flyout.expandVisualizations();

          await alertsPage.flyout.assertGraphPreviewVisible();
          // We expect 5 nodes total in the graph:
          // 1. Actor node (serviceaccount@example.com - user)
          // 2. Grouped target node (3 service accounts grouped by same type/subtype)
          // 3. Entity node (api-service full path)
          // 4-5. Two label nodes
          await alertsPage.flyout.assertGraphNodesNumber(5);

          await expandedFlyoutGraph.expandGraph();
          await expandedFlyoutGraph.waitGraphIsLoaded();
          await expandedFlyoutGraph.assertGraphNodesNumber(5);
          await expandedFlyoutGraph.toggleSearchBar();

          // Test filter actions - Show actions by entity (user.id)
          await expandedFlyoutGraph.showActionsByEntity('user:serviceaccount@example.com@gcp');
          await expandedFlyoutGraph.showSearchBar();
          await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();
          await expandedFlyoutGraph.expectFilterTextEquals(
            0,
            'user.name: Service Account OR user.email: serviceaccount@example.com OR user.id: serviceaccount@example.com'
          );
          await expandedFlyoutGraph.expectFilterPreviewEquals(
            0,
            'user.name: Service Account OR user.email: serviceaccount@example.com OR user.id: serviceaccount@example.com'
          );

          await expandedFlyoutGraph.showEntityDetails(
            'aee6fb9ccf55bf0e3e974083019a0a1ba7786ef99ed3fe59a1504f22ac94ee31'
          );
          // check the preview panel grouped items rendered correctly
          await alertsPage.flyout.assertPreviewPanelGroupedItemsNumber(3);
          await expandedFlyoutGraph.assertPreviewPanelGroupedItemTitleLinkNumber(3);

          await expandedFlyoutGraph.closePreviewSection();

          // Clear filters to reset state
          await expandedFlyoutGraph.clearAllFilters();

          // Test custom filter in query bar
          await expandedFlyoutGraph.addFilter({
            field: 'user.id',
            operation: 'is',
            value: 'serviceaccount@example.com',
          });
          await pageObjects.header.waitUntilLoadingHasFinished();
          await expandedFlyoutGraph.clickOnFitGraphIntoViewControl();

          // Open timeline to verify integration
          await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
          await timelinePage.ensureTimelineIsOpen();
          await timelinePage.waitForEvents();
          await timelinePage.closeTimeline();

          // Test query bar with KQL
          await expandedFlyoutGraph.setKqlQuery(
            'event.action: "google.iam.admin.v1.UpdateServiceAccount"'
          );
          await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
          await timelinePage.ensureTimelineIsOpen();
          await timelinePage.waitForEvents();
          await timelinePage.closeTimeline();

          // Test query bar with non-matching query
          await expandedFlyoutGraph.setKqlQuery('cannotFindThis');
          await expandedFlyoutGraph.clickOnInvestigateInTimelineButton();
          await timelinePage.ensureTimelineIsOpen();
          await timelinePage.waitForEvents();
        });

        it('expanded flyout - entity enrichment for service actor with multiple host targets - single target field', async () => {
          // Navigate to alerts page with the multi-target alert
          await alertsPage.navigateToAlertsPage(
            `${alertsPage.getAbsoluteTimerangeFilter(
              '2024-09-01T00:00:00.000Z',
              '2024-09-02T00:00:00.000Z'
            )}&${alertsPage.getFlyoutFilter(
              'multi-target-alert-id-xyz123abc456def789ghi012jkl345mno678pqr901stu234'
            )}`
          );
          await alertsPage.waitForListToHaveAlerts();

          await alertsPage.flyout.expandVisualizations();
          await alertsPage.flyout.assertGraphPreviewVisible();
          // Should have 1 service actor (1 node) + 2 host targets grouped (1 node) + 1 label (1 node) = 3 nodes
          await alertsPage.flyout.assertGraphNodesNumber(3);

          await expandedFlyoutGraph.expandGraph();
          await expandedFlyoutGraph.waitGraphIsLoaded();
          await expandedFlyoutGraph.assertGraphNodesNumber(3);

          // Verify first entity node - Service actor
          await expandedFlyoutGraph.assertNodeEntityTag('service:ApiServiceAccount', 'Service');
          await expandedFlyoutGraph.assertNodeEntityDetails(
            'service:ApiServiceAccount',
            'ApiServiceAccount'
          );

          // Verify second entity node - Host target
          // get Node by sha256 hash of host:host-instance-1 and host:host-instance-2
          await expandedFlyoutGraph.assertNodeEntityTag(
            '081f21718bb4b854bda72b01719d0febe88b10520dede17fc2640260002ea339',
            'Host'
          );
          await expandedFlyoutGraph.assertNodeEntityDetails(
            '081f21718bb4b854bda72b01719d0febe88b10520dede17fc2640260002ea339',
            'GCP Compute Instance'
          );
        });
      };

      describe('via LOOKUP JOIN (v2)', () => {
        before(async () => {
          // Load v2 entity data into the entity store index created by v2 install
          await esArchiver.load(
            'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
          );

          // Wait for entity data to be fully indexed
          await waitForEntityDataIndexed({
            es,
            logger,
            retry,
            entitiesIndex: '.entities.v2.latest.security_*',
            expectedCount: 45,
          });
        });

        after(async () => {
          await esArchiver.unload(
            'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
          );
        });

        runEnrichmentTests();
      });
    });
  });
}
