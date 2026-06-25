/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getEntitiesLatestIndexName } from '@kbn/cloud-security-posture-common/utils/helpers';
import {
  waitForPluginInitialized,
  cleanupEntityStore,
  waitForEntityDataIndexed,
  dataViewRouteHelpersFactory,
  initEntityEnginesWithRetry,
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
    'networkEvents',
    'expandedFlyoutGraph',
    'entityFlyout',
  ]);
  const networkEventsPage = pageObjects.networkEvents;
  const expandedFlyoutGraph = pageObjects.expandedFlyoutGraph;
  const entityFlyout = pageObjects.entityFlyout;

  describe('Security Network Page - Entity Preview flyout', function () {
    this.tags(['cloud_security_posture_graph_viz']);

    before(async () => {
      await cleanupEntityStore({ supertest, logger });

      try {
        await es.indices.delete({
          index: getEntitiesLatestIndexName(),
          ignore_unavailable: true,
        });
      } catch (e) {
        // Ignore if index doesn't exist
      }

      // Enable asset inventory setting
      await kibanaServer.uiSettings.update({ 'securitySolution:enableAssetInventory': true });

      // Initialize security-solution-default data-view (required by entity store)
      const dataView = dataViewRouteHelpersFactory(supertest);
      await dataView.create('security-solution');

      // Initialize entity engine for 'generic' type ONCE - this is reused by both v1 and v2 tests
      await initEntityEnginesWithRetry({
        supertest,
        retry,
        logger,
        entityTypes: ['generic'],
      });

      // Load security alerts with modified mappings (includes actor and target)
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/security_alerts_modified_mappings'
      );
      // Load GCP audit logs
      await esArchiver.load(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );

      await waitForPluginInitialized({ retry, supertest, logger });
      await ebtUIHelper.setOptIn(true);
    });

    after(async () => {
      // Clean up entity store resources
      await cleanupEntityStore({ supertest, logger });

      // Disable asset inventory setting
      await kibanaServer.uiSettings.update({ 'securitySolution:enableAssetInventory': false });

      // Delete alerts
      await es.deleteByQuery({
        index: '.internal.alerts-*',
        query: { match_all: {} },
        conflicts: 'proceed',
      });

      // Unload GCP audit logs
      await esArchiver.unload(
        'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/logs_gcp_audit'
      );
    });

    describe('via LOOKUP JOIN (v2)', () => {
      before(async () => {
        // Delete v2 manually since its not being deleted by the cleanupEntityStore function
        try {
          await es.indices.delete({
            index: getEntitiesLatestIndexName(),
            ignore_unavailable: true,
          });
        } catch (e) {
          // Ignore if index doesn't exist
        }

        // Load v2 entity data
        await esArchiver.load(
          'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
        );

        // Wait for entity data to be fully indexed
        await waitForEntityDataIndexed({
          es,
          logger,
          retry,
          entitiesIndex: getEntitiesLatestIndexName(),
          expectedCount: 41,
        });
      });

      after(async () => {
        await esArchiver.unload(
          'x-pack/solutions/security/test/cloud_security_posture_functional/es_archives/entity_store_v2'
        );
      });

      it('expanded flyout - show generic entity details', async () => {
        // Setting the timerange to fit the data and open the flyout for a specific event
        await networkEventsPage.navigateToNetworkEventsPage(
          `${networkEventsPage.getAbsoluteTimerangeFilter(
            '2024-09-01T00:00:00.000Z',
            '2024-09-02T00:00:00.000Z'
          )}&${networkEventsPage.getFlyoutFilter('MvExpandBugTest123')}`
        );
        await networkEventsPage.waitForListToHaveEvents();

        await networkEventsPage.flyout.expandVisualizations();
        await networkEventsPage.flyout.assertGraphPreviewVisible();
        await networkEventsPage.flyout.assertGraphNodesNumber(4);

        await expandedFlyoutGraph.expandGraph();
        await expandedFlyoutGraph.waitGraphIsLoaded();
        await expandedFlyoutGraph.assertGraphNodesNumber(4);

        // Click on the entity node to show entity details
        await expandedFlyoutGraph.showEntityDetails('mv-expand-target-storage');

        // Verify entity preview panel is open
        await entityFlyout.assertEntityPanelIsOpen('generic');
        await entityFlyout.assertEntityPanelHeader('generic', 'MvExpandTargetStorage');
      });

      it('expanded flyout - show user entity details', async () => {
        // Setting the timerange to fit the data and open the flyout for a specific event
        await networkEventsPage.navigateToNetworkEventsPage(
          `${networkEventsPage.getAbsoluteTimerangeFilter(
            '2024-09-01T00:00:00.000Z',
            '2024-09-02T00:00:00.000Z'
          )}&${networkEventsPage.getFlyoutFilter('MvExpandBugTest123')}`
        );
        await networkEventsPage.waitForListToHaveEvents();

        await networkEventsPage.flyout.expandVisualizations();
        await networkEventsPage.flyout.assertGraphPreviewVisible();
        await networkEventsPage.flyout.assertGraphNodesNumber(4);

        await expandedFlyoutGraph.expandGraph();
        await expandedFlyoutGraph.waitGraphIsLoaded();
        await expandedFlyoutGraph.assertGraphNodesNumber(4);

        // Click on the entity node to show entity details
        await expandedFlyoutGraph.showEntityDetails('user:mv-expand-test-actor@example.com@gcp');

        // Verify entity preview panel is open
        await entityFlyout.assertEntityPanelIsOpen('user');
        await entityFlyout.assertEntityPanelHeader('user', 'MvExpandTestActor');
      });

      it('expanded flyout - show service entity details', async () => {
        // Setting the timerange to fit the data and open the flyout for a specific event
        await networkEventsPage.navigateToNetworkEventsPage(
          `${networkEventsPage.getAbsoluteTimerangeFilter(
            '2024-09-01T00:00:00.000Z',
            '2024-09-02T00:00:00.000Z'
          )}&${networkEventsPage.getFlyoutFilter('MultiTargetEventDoc789')}`
        );
        await networkEventsPage.waitForListToHaveEvents();

        await networkEventsPage.flyout.expandVisualizations();
        await networkEventsPage.flyout.assertGraphPreviewVisible();
        await networkEventsPage.flyout.assertGraphNodesNumber(3);

        await expandedFlyoutGraph.expandGraph();
        await expandedFlyoutGraph.waitGraphIsLoaded();
        await expandedFlyoutGraph.assertGraphNodesNumber(3);

        // Click on the entity node to show entity details
        await expandedFlyoutGraph.showEntityDetails('service:ApiServiceAccount');

        // Verify entity preview panel is open
        await entityFlyout.assertEntityPanelIsOpen('service');
        await entityFlyout.assertEntityPanelHeader('service', 'ApiServiceAccount');
      });

      it('expanded flyout - grouped entities - show host entity details', async () => {
        // Setting the timerange to fit the data and open the flyout for a specific event
        await networkEventsPage.navigateToNetworkEventsPage(
          `${networkEventsPage.getAbsoluteTimerangeFilter(
            '2024-09-01T00:00:00.000Z',
            '2024-09-02T00:00:00.000Z'
          )}&${networkEventsPage.getFlyoutFilter('MultiTargetEventDoc789')}`
        );
        await networkEventsPage.waitForListToHaveEvents();

        await networkEventsPage.flyout.expandVisualizations();
        await networkEventsPage.flyout.assertGraphPreviewVisible();
        await networkEventsPage.flyout.assertGraphNodesNumber(3);

        await expandedFlyoutGraph.expandGraph();
        await expandedFlyoutGraph.waitGraphIsLoaded();
        await expandedFlyoutGraph.assertGraphNodesNumber(3);

        // Click on the entity node to show grouped entities
        await expandedFlyoutGraph.showEntityDetails(
          '081f21718bb4b854bda72b01719d0febe88b10520dede17fc2640260002ea339'
        );

        // Verify grouped entities preview panel is open
        await entityFlyout.clickOnEntity('host:host-instance-1');

        // Verify entity preview panel is open
        await entityFlyout.assertEntityPanelIsOpen('host');
        await entityFlyout.assertEntityPanelHeader('host', 'HostInstance1');
      });
    });
  });
}
