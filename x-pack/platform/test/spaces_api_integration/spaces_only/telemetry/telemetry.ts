/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';

import type { FtrProviderContext } from '../../common/ftr_provider_context';

export default function ({ getService }: FtrProviderContext) {
  const spacesService = getService('spaces');
  const usageAPI = getService('usageAPI');

  describe('Verify disabledFeatures telemetry payloads', () => {
    before(async () => {
      await spacesService.create({
        id: 'space-1',
        name: 'space-1',
        description: 'This is your space-1!',
        color: '#00bfb3',
        disabledFeatures: ['canvas', 'maps', 'maps_v2'],
      });

      await spacesService.create({
        id: 'space-2',
        name: 'space-2',
        description: 'This is your space-2!',
        color: '#00bfb3',
        solution: 'security',
        disabledFeatures: ['savedObjectsManagement', 'canvas', 'maps', 'maps_v2'],
      });

      await spacesService.create({
        id: 'space-3',
        name: 'space-3',
        description: 'This is your space-3!',
        color: '#00bfb3',
        disabledFeatures: [],
        solution: 'es',
      });
    });

    after(async () => {
      await spacesService.delete('space-1');
      await spacesService.delete('space-2');
      await spacesService.delete('space-3');
    });

    it('includes only disabledFeatures findings', async () => {
      const [{ stats }] = await usageAPI.getTelemetryStats({
        unencrypted: true,
        refreshCache: true,
      });

      expect(stats.stack_stats.kibana.plugins.spaces.disabledFeatures).to.eql({
        actions: 0,
        anonymization: 0,
        observabilityAIAssistant: 0,
        savedObjectsTagging: 0,
        graph: 0,
        rulesSettings: 0,
        queryActivity: 0,
        maintenanceWindow: 0,
        stackAlerts: 0,
        streams: 0,
        generalCases: 0,
        generalCasesV2: 0,
        generalCasesV3: 0,
        manageReporting: 0,
        maps: 2,
        maps_v2: 2,
        canvas: 2,
        cloudConnect: 0,
        ml: 0,
        fleetv2: 0,
        fleet: 0,
        osquery: 0,
        reportingLegacy: 0,
        observabilityAlerts: 0,
        observabilityCases: 0,
        observabilityCasesV2: 0,
        observabilityCasesV3: 0,
        agentBuilder: 0,
        agentContextLayer: 0,
        automatic_import: 0,
        uptime: 0,
        slo: 0,
        infrastructure: 0,
        logs: 0,
        monitoring: 0,
        apm: 0,
        enterpriseSearch: 0,
        enterpriseSearchApplications: 0,
        enterpriseSearchAnalytics: 0,
        searchInferenceEndpoints: 0,
        searchPlayground: 0,
        searchSynonyms: 0,
        searchQueryRules: 0,
        workflowsManagement: 0,
        siem: 0,
        siemV2: 0,
        siemV3: 0,
        siemV4: 0,
        siemV5: 0,
        securitySolutionRulesV1: 0,
        securitySolutionRulesV2: 0,
        securitySolutionRulesV3: 0,
        securitySolutionRulesV4: 0,
        securitySolutionAlertsV1: 0,
        securitySolutionCases: 0,
        securitySolutionCasesV2: 0,
        securitySolutionCasesV3: 0,
        securitySolutionAssistant: 0,
        securitySolutionAttackDiscovery: 0,
        securitySolutionTimeline: 0,
        securitySolutionNotes: 0,
        securitySolutionSiemMigrations: 0,
        discover: 0,
        discover_v2: 0,
        visualize: 0,
        visualize_v2: 0,
        dashboard: 0,
        dashboard_v2: 0,
        dev_tools: 0,
        advancedSettings: 0,
        indexPatterns: 0,
        filesManagement: 0,
        filesSharedImage: 0,
        savedObjectsManagement: 1,
        savedQueryManagement: 0,
        dataQuality: 0,
      });
    });

    it('includes only solution findings', async () => {
      const [{ stats }] = await usageAPI.getTelemetryStats({
        unencrypted: true,
        refreshCache: true,
      });

      expect(stats.stack_stats.kibana.plugins.spaces.solutions).to.eql({
        security: 1,
        es: 1,
        oblt: 0,
        classic: 0,
        unset: 2,
      });
    });
  });
}
