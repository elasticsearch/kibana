/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createNavigationTree } from './navigation_tree';
import type { CoreStart } from '@kbn/core/public';
import { coreMock } from '@kbn/core/public/mocks';

describe('Navigation Tree', () => {
  let mockApplication: Parameters<typeof createNavigationTree>[0];
  let core: CoreStart;

  beforeEach(() => {
    core = coreMock.createStart();
    core.settings.globalClient.get = <T>(_key: string) => false as T;

    mockApplication = {
      ...core.application,
      core,
    };
  });

  it('should generate tree with home link', () => {
    const navigation = createNavigationTree(mockApplication);
    const { body } = navigation;
    expect(body.length).toBeGreaterThan(0);
    const homeNode = body[0];
    expect(homeNode).toMatchObject({
      title: 'Elasticsearch',
      link: 'searchHomepage',
    });
  });

  it('has agent_builder as the first item after home', () => {
    const { body } = createNavigationTree(mockApplication);
    expect(body[1]).toMatchObject({ link: 'agent_builder' });
  });

  it('includes Manage jobs link to Stack Management anomaly detection jobs list under ML nav', () => {
    const { body } = createNavigationTree(mockApplication);
    const mlNode = body.find((item: any) => item.id === 'machine_learning');
    const anomalySection = mlNode?.children?.find(
      (item: any) => item.id === 'category-anomaly_detection'
    );

    expect(anomalySection?.children?.[0]).toEqual(
      expect.objectContaining({
        link: 'management:anomaly_detection',
        title: 'Manage jobs',
      })
    );
  });

  it('includes Stack Management ML Overview in Machine Learning admin links', () => {
    const { footer } = createNavigationTree(mockApplication);

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const mlSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'settings_ml'
    );

    expect(mlSection).toBeDefined();
    expect(mlSection?.children?.[0]).toEqual(
      expect.objectContaining({ link: 'management:overview' })
    );
  });

  it('includes Data Federation under Data management > Indices and data streams', () => {
    const { body } = createNavigationTree(mockApplication);
    const dataManagement = body.find((item: any) => item.title === 'Data management');
    const indicesSection = dataManagement?.children?.find(
      (item: any) => item.title === 'Indices and data streams'
    );

    expect(indicesSection).toBeDefined();
    expect(indicesSection?.children).toContainEqual(
      expect.objectContaining({ link: 'management:data_federation' })
    );
  });

  it('shows AI section with GenAI settings and AI Assistant when AI Assistant is enabled', () => {
    const { footer } = createNavigationTree(mockApplication);

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const aiSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'settings_ai'
    );

    expect(aiSection).toBeDefined();
    expect(aiSection?.children).toContainEqual(
      expect.objectContaining({
        link: 'management:genAiSettings',
      })
    );
    expect(aiSection?.children).toContainEqual(
      expect.objectContaining({
        link: 'management:evals',
      })
    );
    expect(aiSection?.children).toContainEqual(
      expect.objectContaining({
        link: 'management:observabilityAiAssistantManagement',
      })
    );
  });

  it('shows AI section with GenAI settings but hides AI Assistant when AI Assistant is disabled', () => {
    const { footer } = createNavigationTree({ ...mockApplication, showAiAssistant: false });

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const aiSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'settings_ai'
    );

    expect(aiSection).toBeDefined();
    expect(aiSection?.children).toContainEqual(
      expect.objectContaining({
        link: 'management:genAiSettings',
      })
    );
    expect(aiSection?.children).toContainEqual(
      expect.objectContaining({
        link: 'management:evals',
      })
    );
    expect(aiSection?.children).not.toContainEqual(
      expect.objectContaining({
        link: 'management:observabilityAiAssistantManagement',
      })
    );
  });

  it('shows Performance link in Organization section when showPerformanceLink is true', () => {
    const { footer } = createNavigationTree({ ...mockApplication, showPerformanceLink: true });

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const orgSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'organization'
    );

    expect(orgSection).toBeDefined();
    expect(orgSection?.children).toContainEqual(
      expect.objectContaining({
        id: 'cloudLinkDeployment',
        cloudLink: 'deployment',
      })
    );
  });

  it('hides Performance link in Organization section when showPerformanceLink is false', () => {
    const { footer } = createNavigationTree({ ...mockApplication, showPerformanceLink: false });

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const orgSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'organization'
    );

    expect(orgSection).toBeDefined();
    expect(orgSection?.children).not.toContainEqual(
      expect.objectContaining({
        id: 'cloudLinkDeployment',
      })
    );
  });

  it('hides Performance link by default (no manage cluster privilege)', () => {
    const { footer } = createNavigationTree(mockApplication);

    const adminAndSettingsNode = footer?.find((item: any) => item.id === 'admin_and_settings');
    const orgSection = adminAndSettingsNode?.children?.find(
      (item: any) => item.id === 'organization'
    );

    expect(orgSection?.children).not.toContainEqual(
      expect.objectContaining({
        id: 'cloudLinkDeployment',
      })
    );
  });
});
