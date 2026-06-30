/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock, savedObjectsClientMock, httpServerMock } from '@kbn/core/server/mocks';
import { SavedObjectsErrorHelpers } from '@kbn/core/server';
import type { RulesClientApi } from '@kbn/alerting-plugin/server/types';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import { appContextService } from '../../../../app_context';
import type { ArchiveAsset } from '../../../kibana/assets/install';
import { getSpaceScopedAssetId } from '../../../kibana/assets/install';
import { createArchiveIteratorFromMap } from '../../../archive/archive_iterator';
import { createAppContextStartContractMock } from '../../../../../mocks';
import { saveKibanaAssetsRefs } from '../../install';

import type { InstallablePackage } from '../../../../../../common/types';

import { createSavedObjectClientMock } from '../../../../../mocks';

import {
  createAlertingRuleFromTemplate,
  createInactivityMonitoringTemplate,
  stepCreateAlertingAssets,
} from './step_create_alerting_assets';

jest.mock('../../install');

const logger = loggingSystemMock.createLogger();
const savedObjectsClient = savedObjectsClientMock.create();

let internalSoClientMock: ReturnType<typeof createSavedObjectClientMock>;

beforeEach(() => {
  internalSoClientMock = createSavedObjectClientMock();
  internalSoClientMock.asScopedToNamespace.mockReturnValue(internalSoClientMock as any);
  appContextService.start(
    createAppContextStartContractMock(
      {},
      false,
      { internal: internalSoClientMock, withoutSpaceExtensions: internalSoClientMock },
      { enableIntegrationInactivityAlerting: true }
    )
  );
  jest.mocked(saveKibanaAssetsRefs).mockReset();
});

afterEach(() => {
  appContextService.stop();
});

describe('createAlertingRuleFromTemplate', () => {
  it('should create a rule if the rule does not exist', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: 'template-id',
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    const result = await createAlertingRuleFromTemplate(
      { rulesClient, logger },
      {
        alertTemplateArchiveAsset: { id: 'template-id' } as ArchiveAsset,
        pkgName: 'test-package',
        spaceId: 'default',
      }
    );

    expect(rulesClient.getTemplate).toHaveBeenCalledWith({ id: 'template-id' });
    expect(rulesClient.get).toHaveBeenCalledWith({ id: 'fleet-default-test-package-template-id' });
    expect(rulesClient.create).toHaveBeenCalledWith({
      data: {
        enabled: false,
        alertTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      },
      options: { id: 'fleet-default-test-package-template-id' },
    });
    expect(result).toEqual({
      id: 'fleet-default-test-package-template-id',
      deferred: false,
      type: 'alert',
    });
  });

  it('should not create a rule and return a deferred reference if user do not have access to alerts', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockRejectedValue(new Error('No access to alerts')),
      get: jest.fn().mockRejectedValue(new Error('No access to alerts')),
      create: jest.fn().mockRejectedValue(new Error('No access to alerts')),
    } as unknown as RulesClientApi;

    const result = await createAlertingRuleFromTemplate(
      { rulesClient, logger },
      {
        alertTemplateArchiveAsset: { id: 'template-id' } as ArchiveAsset,
        pkgName: 'test-package',
        spaceId: 'default',
      }
    );

    expect(rulesClient.getTemplate).toHaveBeenCalledWith({ id: 'template-id' });
    expect(rulesClient.get).not.toHaveBeenCalled();
    expect(rulesClient.create).not.toHaveBeenCalled();
    expect(result).toEqual({
      id: 'fleet-default-test-package-template-id',
      deferred: true,
      type: 'alert',
    });
  });

  it('should not create a rule if the rule already exists', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: 'template-id',
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockResolvedValue({ id: 'existing-rule-id' }),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    const result = await createAlertingRuleFromTemplate(
      { rulesClient, logger },
      {
        alertTemplateArchiveAsset: { id: 'template-id' } as ArchiveAsset,
        pkgName: 'test-package',
        spaceId: 'default',
      }
    );

    expect(rulesClient.getTemplate).toHaveBeenCalledWith({ id: 'template-id' });
    expect(rulesClient.get).toHaveBeenCalledWith({ id: 'fleet-default-test-package-template-id' });
    expect(rulesClient.create).not.toHaveBeenCalledWith();
    expect(result).toEqual({
      id: 'fleet-default-test-package-template-id',
      deferred: false,
      type: 'alert',
    });
  });

  it('should look up template by hashed space-scoped ID when installAsAdditionalSpace is true', async () => {
    const hashedId = getSpaceScopedAssetId('template-id', 'my-space');
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: hashedId,
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    const result = await createAlertingRuleFromTemplate(
      { rulesClient, logger },
      {
        alertTemplateArchiveAsset: { id: 'template-id' } as ArchiveAsset,
        pkgName: 'test-package',
        spaceId: 'my-space',
        installAsAdditionalSpace: true,
      }
    );

    expect(rulesClient.getTemplate).toHaveBeenCalledWith({ id: hashedId });
    expect(rulesClient.create).toHaveBeenCalledWith({
      data: {
        enabled: false,
        alertTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      },
      options: { id: 'fleet-my-space-test-package-template-id' },
    });
    expect(result).toEqual({
      id: 'fleet-my-space-test-package-template-id',
      deferred: false,
      type: 'alert',
    });
  });

  it('should use the original archive ID for template lookup when installAsAdditionalSpace is false', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: 'template-id',
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    await createAlertingRuleFromTemplate(
      { rulesClient, logger },
      {
        alertTemplateArchiveAsset: { id: 'template-id' } as ArchiveAsset,
        pkgName: 'test-package',
        spaceId: 'my-space',
        installAsAdditionalSpace: false,
      }
    );

    expect(rulesClient.getTemplate).toHaveBeenCalledWith({ id: 'template-id' });
  });
});

describe('createInactivityMonitoringTemplate', () => {
  const mockIntegrationPackage: InstallablePackage = {
    name: 'nginx',
    title: 'Nginx',
    version: '1.0.0',
    type: 'integration',
    description: 'Nginx integration',
    format_version: '1.0.0',
    release: 'ga',
    owner: { github: 'elastic/integrations' },
    data_streams: [
      {
        type: 'logs',
        dataset: 'nginx.access',
        title: 'Nginx access logs',
        release: 'ga',
        package: 'nginx',
        path: 'access',
      },
      {
        type: 'metrics',
        dataset: 'nginx.stubstatus',
        title: 'Nginx stubstatus metrics',
        release: 'ga',
        package: 'nginx',
        path: 'stubstatus',
      },
    ],
  };

  it('should create an inactivity monitoring template for an integration package on fresh install', async () => {
    internalSoClientMock.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );
    internalSoClientMock.create.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(internalSoClientMock.create).toHaveBeenCalledWith(
      'alerting_rule_template',
      expect.objectContaining({
        name: '[Nginx] Idle data streams',
        ruleTypeId: '.es-query',
        tags: ['Nginx'],
        schedule: { interval: '24h' },
        params: expect.objectContaining({
          searchType: 'esQuery',
          index: ['logs-nginx.access-*', 'metrics-nginx.stubstatus-*'],
          timeField: '@timestamp',
          timeWindowSize: 24,
          timeWindowUnit: 'h',
          threshold: [1],
          thresholdComparator: '<',
          size: 0,
          aggType: 'count',
          groupBy: 'all',
        }),
      }),
      { id: 'fleet-nginx-inactivity-monitoring' }
    );

    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring', type: 'alerting_rule_template' }],
      DEFAULT_SPACE_ID,
      false,
      true
    );

    expect(result).toEqual({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
    });
  });

  it('should skip when feature flag is disabled', async () => {
    appContextService.stop();
    appContextService.start(
      createAppContextStartContractMock(
        {},
        false,
        { internal: internalSoClientMock, withoutSpaceExtensions: internalSoClientMock },
        { enableIntegrationInactivityAlerting: false }
      )
    );

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(result).toBeUndefined();
    expect(internalSoClientMock.create).not.toHaveBeenCalled();
  });

  it('should recreate the template on upgrade when it was deleted', async () => {
    internalSoClientMock.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );
    internalSoClientMock.create.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(internalSoClientMock.create).toHaveBeenCalled();
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring', type: 'alerting_rule_template' }],
      DEFAULT_SPACE_ID,
      false,
      true
    );
    expect(result).toEqual({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
    });
  });

  it('should skip when package type is not integration', async () => {
    const inputPackage: InstallablePackage = {
      ...mockIntegrationPackage,
      type: 'input',
    };

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: inputPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(result).toBeUndefined();
    expect(internalSoClientMock.create).not.toHaveBeenCalled();
  });

  it('should skip when package has no data streams', async () => {
    const noDataStreamsPackage: InstallablePackage = {
      ...mockIntegrationPackage,
      data_streams: undefined,
    };

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: noDataStreamsPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(result).toBeUndefined();
    expect(internalSoClientMock.create).not.toHaveBeenCalled();
  });

  it('should not recreate but re-register asset ref if template already exists with same data streams (e.g. on reinstall)', async () => {
    internalSoClientMock.get.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {
        params: {
          index: ['logs-nginx.access-*', 'metrics-nginx.stubstatus-*'],
        },
      },
      references: [],
    });

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(internalSoClientMock.create).not.toHaveBeenCalled();
    expect(internalSoClientMock.update).not.toHaveBeenCalled();
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring', type: 'alerting_rule_template' }],
      DEFAULT_SPACE_ID,
      false,
      true
    );
    expect(result).toEqual({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
    });
  });

  it('should update index patterns if data streams changed on upgrade', async () => {
    internalSoClientMock.get.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {
        params: {
          searchType: 'esQuery',
          esQuery: JSON.stringify({ query: { match_all: {} } }),
          index: ['logs-nginx.access-*'],
          timeField: '@timestamp',
          timeWindowSize: 24,
          timeWindowUnit: 'h',
          threshold: [1],
          thresholdComparator: '<',
          size: 0,
          aggType: 'count',
          groupBy: 'all',
          excludeHitsFromPreviousRun: true,
        },
      },
      references: [],
    });
    internalSoClientMock.update.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(internalSoClientMock.create).not.toHaveBeenCalled();
    expect(internalSoClientMock.update).toHaveBeenCalledWith(
      'alerting_rule_template',
      'fleet-nginx-inactivity-monitoring',
      {
        params: expect.objectContaining({
          searchType: 'esQuery',
          index: ['logs-nginx.access-*', 'metrics-nginx.stubstatus-*'],
          timeField: '@timestamp',
        }),
      }
    );
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring', type: 'alerting_rule_template' }],
      DEFAULT_SPACE_ID,
      false,
      true
    );
    expect(result).toEqual({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
    });
  });

  it('should return undefined and log error on failure', async () => {
    internalSoClientMock.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );
    internalSoClientMock.create.mockRejectedValue(new Error('SO creation failed'));

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: DEFAULT_SPACE_ID }
    );

    expect(result).toBeUndefined();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Error creating inactivity monitoring template for package nginx'),
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it('should save asset refs as additional space when installAsAdditionalSpace is true', async () => {
    internalSoClientMock.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );
    internalSoClientMock.create.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      {
        packageInfo: mockIntegrationPackage,
        spaceId: DEFAULT_SPACE_ID,
        installAsAdditionalSpace: true,
      }
    );

    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring', type: 'alerting_rule_template' }],
      DEFAULT_SPACE_ID,
      true,
      true
    );
  });

  it('should use a space-scoped SO client and space-specific template ID when spaceId is provided', async () => {
    const scopedClientMock = createSavedObjectClientMock();
    internalSoClientMock.asScopedToNamespace.mockReturnValue(scopedClientMock as any);
    scopedClientMock.get.mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError());
    scopedClientMock.create.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring-my-space',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    const result = await createInactivityMonitoringTemplate(
      { logger, savedObjectsClient },
      { packageInfo: mockIntegrationPackage, spaceId: 'my-space' }
    );

    expect(internalSoClientMock.asScopedToNamespace).toHaveBeenCalledWith('my-space');
    expect(scopedClientMock.create).toHaveBeenCalledWith(
      'alerting_rule_template',
      expect.objectContaining({
        name: '[Nginx] Idle data streams',
      }),
      { id: 'fleet-nginx-inactivity-monitoring-my-space' }
    );
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      savedObjectsClient,
      'nginx',
      [{ id: 'fleet-nginx-inactivity-monitoring-my-space', type: 'alerting_rule_template' }],
      'my-space',
      false,
      true
    );
    expect(result).toEqual({
      id: 'fleet-nginx-inactivity-monitoring-my-space',
      type: 'alerting_rule_template',
    });
  });
});

describe('stepCreateAlertingAssets', () => {
  beforeEach(() => {
    jest.mocked(saveKibanaAssetsRefs).mockReset();
  });
  it('does nothing for non elastic_agent package', async () => {
    const context = {
      packageInstallContext: {
        packageInfo: { name: 'not-elastic-agent' },
        archivePackage: { assets: [] },
        savedObjectsClient: {} as any,
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request: httpServerMock.createKibanaRequest(),
    };

    await stepCreateAlertingAssets(context as any);

    expect(saveKibanaAssetsRefs).not.toHaveBeenCalled();
  });

  it('install elastic_agent rules', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: 'template-id',
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockResolvedValue({ id: 'existing-rule-id' }),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    jest
      .mocked(appContextService.getAlertingStart()!.getRulesClientWithRequestInSpace)
      .mockResolvedValue(rulesClient);

    const context = {
      savedObjectsClient,
      spaceId: DEFAULT_SPACE_ID,
      packageInstallContext: {
        packageInfo: { name: 'elastic_agent' },
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'elastic_agent-0.0.1/kibana/alerting_rule_template/template-1.json',
              Buffer.from(
                JSON.stringify({
                  id: 'template-id',
                })
              ),
            ],
          ])
        ),
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request: httpServerMock.createKibanaRequest(),
    };

    await stepCreateAlertingAssets(context as any);
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      expect.anything(),
      'elastic_agent',
      [
        {
          id: 'fleet-default-elastic_agent-template-id',
          type: 'alert',
          deferred: false,
        },
      ],
      DEFAULT_SPACE_ID,
      false,
      true,
      ['alert']
    );
  });

  it('saves rule refs to additional_spaces_installed_kibana when installAsAdditionalSpace is true', async () => {
    const hashedTemplateId = getSpaceScopedAssetId('template-id', 'my-space');
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: hashedTemplateId,
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    jest
      .mocked(appContextService.getAlertingStart()!.getRulesClientWithRequestInSpace)
      .mockResolvedValue(rulesClient);

    const context = {
      savedObjectsClient,
      spaceId: 'my-space',
      installAsAdditionalSpace: true,
      packageInstallContext: {
        packageInfo: { name: 'elastic_agent' },
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'elastic_agent-0.0.1/kibana/alerting_rule_template/template-1.json',
              Buffer.from(JSON.stringify({ id: 'template-id' })),
            ],
          ])
        ),
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request: httpServerMock.createKibanaRequest(),
    };

    await stepCreateAlertingAssets(context as any);

    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      expect.anything(),
      'elastic_agent',
      [
        {
          id: 'fleet-my-space-elastic_agent-template-id',
          type: 'alert',
          deferred: false,
        },
      ],
      'my-space',
      true,
      true,
      ['alert']
    );
  });

  it('derives installAsAdditionalSpace=true from installedPkg when flag is not explicit and spaceId differs from primary', async () => {
    const hashedTemplateId = getSpaceScopedAssetId('template-id', 'my-space');
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: hashedTemplateId,
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    jest
      .mocked(appContextService.getAlertingStart()!.getRulesClientWithRequestInSpace)
      .mockResolvedValue(rulesClient);

    // No installAsAdditionalSpace — the function must derive it from installedPkg
    const context = {
      savedObjectsClient,
      spaceId: 'my-space',
      installedPkg: {
        attributes: { installed_kibana_space_id: DEFAULT_SPACE_ID },
      },
      packageInstallContext: {
        packageInfo: { name: 'elastic_agent' },
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'elastic_agent-0.0.1/kibana/alerting_rule_template/template-1.json',
              Buffer.from(JSON.stringify({ id: 'template-id' })),
            ],
          ])
        ),
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request: httpServerMock.createKibanaRequest(),
    };

    await stepCreateAlertingAssets(context as any);

    // Because spaceId ('my-space') !== installed_kibana_space_id ('default'), the function
    // must behave as an additional-space install and save refs to additional_spaces_installed_kibana.
    expect(saveKibanaAssetsRefs).toHaveBeenCalledWith(
      expect.anything(),
      'elastic_agent',
      [
        {
          id: 'fleet-my-space-elastic_agent-template-id',
          type: 'alert',
          deferred: false,
        },
      ],
      'my-space',
      true, // saveAsAdditionnalSpace
      true,
      ['alert']
    );
  });

  it('calls getRulesClientWithRequestInSpace scoped to the target space, not the request space', async () => {
    const rulesClient = {
      getTemplate: jest.fn().mockResolvedValue({
        id: getSpaceScopedAssetId('template-id', 'my-space'),
        ruleTypeId: 'rule-type-id',
        name: 'Template Rule',
        consumer: 'alerts',
        params: {},
        schedule: { interval: '1m' },
        actions: [],
        tags: [],
      }),
      get: jest.fn().mockRejectedValue(SavedObjectsErrorHelpers.createGenericNotFoundError()),
      create: jest.fn().mockResolvedValue({ id: 'new-rule-id' }),
    } as unknown as RulesClientApi;

    const getRulesClientWithRequestInSpace = jest
      .mocked(appContextService.getAlertingStart()!.getRulesClientWithRequestInSpace)
      .mockResolvedValue(rulesClient);

    const request = httpServerMock.createKibanaRequest();
    const context = {
      savedObjectsClient,
      spaceId: 'my-space',
      installAsAdditionalSpace: true,
      packageInstallContext: {
        packageInfo: { name: 'elastic_agent' },
        archiveIterator: createArchiveIteratorFromMap(
          new Map([
            [
              'elastic_agent-0.0.1/kibana/alerting_rule_template/template-1.json',
              Buffer.from(JSON.stringify({ id: 'template-id' })),
            ],
          ])
        ),
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request,
    };

    await stepCreateAlertingAssets(context as any);

    expect(getRulesClientWithRequestInSpace).toHaveBeenCalledWith(request, 'my-space');
  });

  it('recreates the inactivity monitoring template for secondary spaces when running from the primary space', async () => {
    // Set up the mock internalSoClient to handle secondary-space SO operations
    internalSoClientMock.get.mockRejectedValue(
      SavedObjectsErrorHelpers.createGenericNotFoundError()
    );
    internalSoClientMock.create.mockResolvedValue({
      id: 'fleet-nginx-inactivity-monitoring-other-space',
      type: 'alerting_rule_template',
      attributes: {},
      references: [],
    });

    const context = {
      savedObjectsClient,
      spaceId: DEFAULT_SPACE_ID,
      // installAsAdditionalSpace is intentionally omitted — should be derived as false
      installedPkg: {
        attributes: {
          installed_kibana_space_id: DEFAULT_SPACE_ID,
          additional_spaces_installed_kibana: {
            'other-space': [],
          },
        },
      },
      packageInstallContext: {
        packageInfo: {
          name: 'nginx',
          title: 'Nginx',
          type: 'integration',
          data_streams: [{ type: 'logs', dataset: 'nginx.access' }],
        },
        archiveIterator: createArchiveIteratorFromMap(new Map()),
        esClient: {} as any,
        rulesClient: {} as any,
      },
      logger: loggingSystemMock.createLogger(),
      request: httpServerMock.createKibanaRequest(),
    };

    await stepCreateAlertingAssets(context as any);

    // saveKibanaAssetsRefs should be called for both the primary space and the secondary space.
    const calls = jest.mocked(saveKibanaAssetsRefs).mock.calls;
    const secondarySpaceCall = calls.find((call) => call[3] === 'other-space');
    expect(secondarySpaceCall).toBeDefined();
    // The secondary space call must use saveAsAdditionnalSpace=true
    expect(secondarySpaceCall?.[4]).toBe(true);
  });
});
