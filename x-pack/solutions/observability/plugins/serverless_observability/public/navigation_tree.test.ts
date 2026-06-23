/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createNavigationTree, filterForFeatureAvailability } from './navigation_tree';
import type { NodeDefinition } from '@kbn/core-chrome-browser';
import type { CoreStart } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';

const getAdminSettingsNode = (
  options: Parameters<typeof createNavigationTree>[0]
): NodeDefinition => {
  const { footer } = createNavigationTree(options);
  const adminSettingsNode = footer?.find((item) => item.id === 'admin_and_settings');

  if (!adminSettingsNode) {
    throw new Error('Admin and Settings footer node not found');
  }

  return adminSettingsNode;
};

describe('Navigation Tree', () => {
  let core: CoreStart;

  beforeEach(() => {
    core = coreMock.createStart();
    core.settings.globalClient.get = <T>(_key: string) => false as T;
  });

  it('should generate tree with overview', () => {
    const navigation = createNavigationTree({ core });
    const { body } = navigation;
    expect(body.length).toBeGreaterThan(0);
    const homeNode = body[0];
    expect(homeNode).toMatchObject({
      title: 'Observability',
      link: 'observability-overview',
    });
  });

  it('lists Manage jobs to Stack Management anomaly detection jobs first under ML anomaly detection nav', () => {
    const { body } = createNavigationTree({ core });
    const mlNode = body.find((item) => item.id === 'machine_learning-landing');
    const anomalySection = mlNode?.children?.find(
      (item) => item.id === 'category-anomaly_detection'
    );

    expect(anomalySection?.children?.[0]).toEqual(
      expect.objectContaining({
        link: 'management:anomaly_detection',
        title: 'Manage jobs',
      })
    );
  });

  it('should not generate tree with overview', () => {
    const navigation = createNavigationTree({ core, overviewAvailable: false });
    expect(navigation.body).not.toEqual(
      expect.arrayContaining([
        {
          title: 'Overview',
          link: 'observability-overview',
        },
      ])
    );
  });

  it('shows AI Assistant and hides Agents when AI Assistant is enabled', () => {
    const { body } = createNavigationTree({ core });

    const aiAssistantNode = body.find((item) => item.link === 'observabilityAIAssistant');
    const agentsNode = body.find((item) => item.link === 'agent_builder');

    expect(aiAssistantNode).toBeDefined();
    expect(agentsNode).toBeUndefined();
  });

  it('shows Agents and hides AI Assistant when AI Assistant is disabled', () => {
    const { body } = createNavigationTree({ core, showAiAssistant: false });

    const aiAssistantNode = body.find((item) => item.link === 'observabilityAIAssistant');
    const agentsNode = body.find((item) => item.link === 'agent_builder');

    expect(aiAssistantNode).toBeUndefined();
    expect(agentsNode).toBeDefined();
  });

  it('hides GenAI Settings in admin settings when unavailable', () => {
    const adminSettingsNode = getAdminSettingsNode({ core, genAiSettingsAvailable: false });
    const aiSection = adminSettingsNode?.children?.find(
      (item) => item.title === 'AI' && 'children' in item
    );

    expect(aiSection).toBeUndefined();
  });

  it('hides ML and AI related admin settings when unavailable', () => {
    const adminSettingsNode = getAdminSettingsNode({
      core,
      overviewAvailable: false,
      genAiSettingsAvailable: false,
    });

    expect(adminSettingsNode.children).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'machine_learning' }),
        expect.objectContaining({ id: 'model_management' }),
        expect.objectContaining({ title: 'AI' }),
      ])
    );
  });

  it('uses a single Alerts link to classic Observability alerts even when alerting v2 is enabled', () => {
    core.settings.globalClient.get = <T>(_key: string) => true as T;

    const { body } = createNavigationTree({ core });
    const alertsPanel = body.find(
      (item) => 'id' in item && item.id === 'alerting' && item.renderAs === 'panelOpener'
    );
    const flatAlerts = body.find((item) => item.link === 'observability-overview:alerts');

    expect(alertsPanel).toBeUndefined();
    expect(flatAlerts).toEqual(
      expect.objectContaining({
        link: 'observability-overview:alerts',
        icon: 'warning',
      })
    );
  });

  describe('filterForFeatureAvailability', () => {
    it('should return empty array if feature flag is false', () => {
      const node = {
        title: 'Test',
        link: 'test',
      };
      expect(filterForFeatureAvailability(node as NodeDefinition, false)).toEqual([]);
    });

    it('should return node in array if feature flag is true', () => {
      const node = {
        title: 'Test',
        link: 'test',
      };
      expect(filterForFeatureAvailability(node as NodeDefinition, true)).toEqual([node]);
    });
  });
});
