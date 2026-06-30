/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ApiOperation } from '@kbn/core-security-server';
import { KibanaFeature } from '@kbn/features-plugin/server';
import { featuresPluginMock } from '@kbn/features-plugin/server/mocks';

import { getReplacedByForPrivilege, privilegesFactory } from './privileges';
import { licenseMock } from '../__fixtures__/licensing.mock';
import { Actions } from '../actions';

const actions = new Actions();

const mockLicenseServiceBasic = licenseMock.create({ allowSubFeaturePrivileges: false }, 'basic');
const mockLicenseServiceGold = licenseMock.create({ allowSubFeaturePrivileges: true }, 'gold');
const mockLicenseServicePlatinum = licenseMock.create(
  { allowSubFeaturePrivileges: true },
  'platinum'
);

const getAllSavedObjectsActions = (soId: string) =>
  [
    'bulk_get',
    'get',
    'find',
    'open_point_in_time',
    'close_point_in_time',
    'create',
    'bulk_create',
    'update',
    'bulk_update',
    'delete',
    'bulk_delete',
    'share_to_space',
  ].map((action) => actions.savedObject.get(soId, action));
const getReadSavedObjectsActions = (soId: string) =>
  ['bulk_get', 'get', 'find', 'open_point_in_time', 'close_point_in_time'].map((action) =>
    actions.savedObject.get(soId, action)
  );

describe('features', () => {
  test('actions defined at the feature do not cascade to the privileges', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo-feature',
        name: 'Foo KibanaFeature',
        app: ['app-1', 'app-2'],
        category: { id: 'foo', label: 'foo' },
        catalogue: ['catalogue-1', 'catalogue-2'],
        management: {
          foo: ['management-1', 'management-2'],
        },
        privileges: {
          all: {
            savedObject: {
              all: [],
              read: [],
            },
            ui: [],
          },
          read: {
            savedObject: {
              all: [],
              read: [],
            },
            ui: [],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);

    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.foo-feature', {
      all: [actions.login],
      read: [actions.login],
      minimal_all: [actions.login],
      minimal_read: [actions.login],
    });
  });

  test(`actions only specified at the privilege are alright too`, () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-savedObject-all-1', 'all-savedObject-all-2'],
              read: ['all-savedObject-read-1', 'all-savedObject-read-2'],
            },
            ui: ['all-ui-1', 'all-ui-2'],
          },
          read: {
            savedObject: {
              all: ['read-savedObject-all-1', 'read-savedObject-all-2'],
              read: ['read-savedObject-read-1', 'read-savedObject-read-2'],
            },
            ui: ['read-ui-1', 'read-ui-2'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const expectedAllPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('all-savedObject-all-1'),
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      ...getReadSavedObjectsActions('all-savedObject-read-1'),
      ...getReadSavedObjectsActions('all-savedObject-read-2'),
      actions.ui.get('foo', 'all-ui-1'),
      actions.ui.get('foo', 'all-ui-2'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('read-savedObject-all-1'),
      ...getAllSavedObjectsActions('read-savedObject-all-2'),
      ...getReadSavedObjectsActions('read-savedObject-read-1'),
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('foo', 'read-ui-1'),
      actions.ui.get('foo', 'read-ui-2'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.foo', {
      all: [...expectedAllPrivileges],
      read: [...expectedReadPrivileges],
      minimal_all: [...expectedAllPrivileges],
      minimal_read: [...expectedReadPrivileges],
    });
  });

  test('actions should respect `composedOf` specified at the privilege', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-savedObject-all-1'],
              read: ['all-savedObject-read-1'],
            },
            ui: ['all-ui-1'],
          },
          read: {
            savedObject: {
              all: ['read-savedObject-all-1'],
              read: ['read-savedObject-read-1'],
            },
            ui: ['read-ui-1'],
          },
        },
      }),
      new KibanaFeature({
        id: 'bar',
        name: 'Bar KibanaFeature',
        app: [],
        category: { id: 'bar', label: 'bar' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-savedObject-all-2'],
              read: ['all-savedObject-read-2'],
            },
            ui: ['all-ui-2'],
            composedOf: [{ feature: 'foo', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-savedObject-all-2'],
              read: ['read-savedObject-read-2'],
            },
            ui: ['read-ui-2'],
            composedOf: [{ feature: 'foo', privileges: ['read'] }],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const expectedAllPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      ...getReadSavedObjectsActions('all-savedObject-read-2'),
      actions.ui.get('bar', 'all-ui-2'),
      ...getAllSavedObjectsActions('all-savedObject-all-1'),
      ...getReadSavedObjectsActions('all-savedObject-read-1'),
      actions.ui.get('foo', 'all-ui-1'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('read-savedObject-all-2'),
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('bar', 'read-ui-2'),
      ...getAllSavedObjectsActions('read-savedObject-all-1'),
      ...getReadSavedObjectsActions('read-savedObject-read-1'),
      actions.ui.get('foo', 'read-ui-1'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.bar', {
      all: [...expectedAllPrivileges],
      read: [...expectedReadPrivileges],
      minimal_all: [...expectedAllPrivileges],
      minimal_read: [...expectedReadPrivileges],
    });
  });

  test('actions should respect `composedOf` specified at the privilege even if the referenced feature is hidden', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        hidden: true,
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-savedObject-all-1'],
              read: ['all-savedObject-read-1'],
            },
            ui: ['all-ui-1'],
          },
          read: {
            savedObject: {
              all: ['read-savedObject-all-1'],
              read: ['read-savedObject-read-1'],
            },
            ui: ['read-ui-1'],
          },
        },
      }),
      new KibanaFeature({
        id: 'bar',
        name: 'Bar KibanaFeature',
        app: [],
        category: { id: 'bar', label: 'bar' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-savedObject-all-2'],
              read: ['all-savedObject-read-2'],
            },
            ui: ['all-ui-2'],
            composedOf: [{ feature: 'foo', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-savedObject-all-2'],
              read: ['read-savedObject-read-2'],
            },
            ui: ['read-ui-2'],
            composedOf: [{ feature: 'foo', privileges: ['read'] }],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const expectedAllPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      ...getReadSavedObjectsActions('all-savedObject-read-2'),
      actions.ui.get('bar', 'all-ui-2'),
      ...getAllSavedObjectsActions('all-savedObject-all-1'),
      ...getReadSavedObjectsActions('all-savedObject-read-1'),
      actions.ui.get('foo', 'all-ui-1'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      ...getAllSavedObjectsActions('read-savedObject-all-2'),
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('bar', 'read-ui-2'),
      ...getAllSavedObjectsActions('read-savedObject-all-1'),
      ...getReadSavedObjectsActions('read-savedObject-read-1'),
      actions.ui.get('foo', 'read-ui-1'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.bar', {
      all: [...expectedAllPrivileges],
      read: [...expectedReadPrivileges],
      minimal_all: [...expectedAllPrivileges],
      minimal_read: [...expectedReadPrivileges],
    });
  });

  test('actions should respect nested `composedOf` specified at the privilege', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'feature-a',
        name: 'Feature A',
        app: [],
        category: { id: 'cat-a', label: 'cat-a' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-1'], read: [] },
            ui: ['all-ui-1'],
            composedOf: [{ feature: 'feature-b', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-1'] },
            ui: ['read-ui-1'],
            composedOf: [{ feature: 'feature-b', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-b',
        name: 'Feature B',
        app: [],
        category: { id: 'cat-b', label: 'cat-b' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-2'], read: [] },
            ui: ['all-ui-2'],
            composedOf: [{ feature: 'feature-c', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-2'] },
            ui: ['read-ui-2'],
            composedOf: [{ feature: 'feature-c', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-c',
        name: 'Feature C',
        app: [],
        category: { id: 'cat-c', label: 'cat-c' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-3'], read: [] },
            ui: ['all-ui-3'],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-3'] },
            ui: ['read-ui-3'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const expectedAllPrivilegesFeatureA = [
      actions.login,
      ...getAllSavedObjectsActions('all-savedObject-all-1'),
      actions.ui.get('feature-a', 'all-ui-1'),
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      actions.ui.get('feature-b', 'all-ui-2'),
      ...getAllSavedObjectsActions('all-savedObject-all-3'),
      actions.ui.get('feature-c', 'all-ui-3'),
    ];

    const expectedReadPrivilegesFeatureA = [
      actions.login,
      ...getReadSavedObjectsActions('read-savedObject-read-1'),
      actions.ui.get('feature-a', 'read-ui-1'),
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('feature-b', 'read-ui-2'),
      ...getReadSavedObjectsActions('read-savedObject-read-3'),
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.feature-a', {
      all: [...expectedAllPrivilegesFeatureA],
      read: [...expectedReadPrivilegesFeatureA],
      minimal_all: [...expectedAllPrivilegesFeatureA],
      minimal_read: [...expectedReadPrivilegesFeatureA],
    });

    const expectedAllPrivilegesFeatureB = [
      actions.login,
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      actions.ui.get('feature-b', 'all-ui-2'),
      ...getAllSavedObjectsActions('all-savedObject-all-3'),
      actions.ui.get('feature-c', 'all-ui-3'),
    ];

    const expectedReadPrivilegesFeatureB = [
      actions.login,
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('feature-b', 'read-ui-2'),
      ...getReadSavedObjectsActions('read-savedObject-read-3'),
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    expect(actual).toHaveProperty('features.feature-b', {
      all: [...expectedAllPrivilegesFeatureB],
      read: [...expectedReadPrivilegesFeatureB],
      minimal_all: [...expectedAllPrivilegesFeatureB],
      minimal_read: [...expectedReadPrivilegesFeatureB],
    });
  });

  test('cyclical dependencies in `composedOf` should be forbidden', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'feature-a',
        name: 'Feature A',
        app: [],
        category: { id: 'cat-a', label: 'cat-a' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-1'], read: ['all-savedObject-read-1'] },
            ui: ['all-ui-1'],
            composedOf: [{ feature: 'feature-b', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: ['read-savedObject-all-1'], read: ['read-savedObject-read-1'] },
            ui: ['read-ui-1'],
            composedOf: [{ feature: 'feature-b', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-b',
        name: 'Feature B',
        app: [],
        category: { id: 'cat-b', label: 'cat-b' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-2'], read: ['all-savedObject-read-2'] },
            ui: ['all-ui-2'],
            composedOf: [{ feature: 'feature-c', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: ['read-savedObject-all-2'], read: ['read-savedObject-read-2'] },
            ui: ['read-ui-2'],
            composedOf: [{ feature: 'feature-c', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-c',
        name: 'Feature C',
        app: [],
        category: { id: 'cat-c', label: 'cat-c' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-3'], read: ['all-savedObject-read-3'] },
            ui: ['all-ui-3'],
            composedOf: [{ feature: 'feature-a', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: ['read-savedObject-all-3'], read: ['read-savedObject-read-3'] },
            ui: ['read-ui-3'],
            composedOf: [{ feature: 'feature-a', privileges: ['read'] }],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    expect(() => privileges.get()).toThrowErrorMatchingInlineSnapshot(
      `"Topological ordering of privileges did not complete, these feature privileges have cyclic dependencies: [\\"feature-a.all\\",\\"feature-a.read\\",\\"feature-a.minimal_all\\",\\"feature-a.minimal_read\\",\\"feature-b.all\\",\\"feature-b.read\\",\\"feature-b.minimal_all\\",\\"feature-b.minimal_read\\",\\"feature-c.all\\",\\"feature-c.read\\",\\"feature-c.minimal_all\\",\\"feature-c.minimal_read\\"]"`
    );
  });

  test('actions should respect `replacedBy` specified by the deprecated privileges', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'alpha',
        name: 'Feature Alpha',
        app: [],
        category: { id: 'alpha', label: 'alpha' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-alpha-all-so'],
              read: ['all-alpha-read-so'],
            },
            ui: ['all-alpha-ui'],
            app: ['all-alpha-app'],
            api: ['all-alpha-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }] } },
            replacedBy: [{ feature: 'beta', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-alpha-all-so'],
              read: ['read-alpha-read-so'],
            },
            ui: ['read-alpha-ui'],
            app: ['read-alpha-app'],
            api: ['read-alpha-api'],
            replacedBy: {
              default: [{ feature: 'beta', privileges: ['read'] }],
              minimal: [{ feature: 'beta', privileges: ['minimal_read'] }],
            },
          },
        },
      }),
      new KibanaFeature({
        id: 'beta',
        name: 'Feature Beta',
        app: [],
        category: { id: 'beta', label: 'beta' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-beta-all-so'],
              read: ['all-beta-read-so'],
            },
            ui: ['all-beta-ui'],
            app: ['all-beta-app'],
            api: ['all-beta-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }] } },
          },
          read: {
            savedObject: {
              all: ['read-beta-all-so'],
              read: ['read-beta-read-so'],
            },
            ui: ['read-beta-ui'],
            app: ['read-beta-app'],
            api: ['read-beta-api'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const alertingOperations = [
      ...[
        'get',
        'bulkGet',
        'getRuleState',
        'getAlertSummary',
        'getExecutionLog',
        'getActionErrorLog',
        'find',
        'findMutedAlerts',
        'getRuleExecutionKPI',
        'getBackfill',
        'findBackfill',
        'findGaps',
        'bulkEditParams',
        'getGapAutoFillScheduler',
        'findGapAutoFillSchedulerLogs',
        'getHistory',
      ],
      ...[
        'create',
        'delete',
        'update',
        'updateApiKey',
        'muteAll',
        'unmuteAll',
        'muteAlert',
        'unmuteAlert',
        'snooze',
        'unsnooze',
        'snoozeAlert',
        'unsnoozeAlert',
        'bulkEdit',
        'bulkDelete',
        'runSoon',
      ],
    ];

    const expectedAllPrivileges = [
      actions.login,
      actions.api.get('all-alpha-api'),
      actions.app.get('all-alpha-app'),
      actions.ui.get('navLinks', 'all-alpha-app'),
      ...getAllSavedObjectsActions('all-alpha-all-so'),
      ...getReadSavedObjectsActions('all-alpha-read-so'),
      actions.ui.get('alpha', 'all-alpha-ui'),
      ...alertingOperations.map((operation) =>
        actions.alerting.get('rule-type-1', 'alpha', 'rule', operation)
      ),
      actions.ui.get('navLinks', 'all-beta-app'),
      actions.ui.get('beta', 'all-beta-ui'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      actions.api.get('read-alpha-api'),
      actions.app.get('read-alpha-app'),
      actions.ui.get('navLinks', 'read-alpha-app'),
      ...getAllSavedObjectsActions('read-alpha-all-so'),
      ...getReadSavedObjectsActions('read-alpha-read-so'),
      actions.ui.get('alpha', 'read-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific
      // read.replacedBy: [{ feature: 'beta', privileges: ['read'] }]
      actions.ui.get('navLinks', 'read-beta-app'),
      actions.ui.get('beta', 'read-beta-ui'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.alpha', {
      all: [...expectedAllPrivileges],
      read: [...expectedReadPrivileges],
      minimal_all: [...expectedAllPrivileges],
      minimal_read: [...expectedReadPrivileges],
    });
  });

  test('actions should respect nested `replacedBy` specified by the deprecated privileges', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'alpha',
        name: 'Feature Alpha',
        app: [],
        category: { id: 'alpha', label: 'alpha' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-alpha-all-so'],
              read: ['all-alpha-read-so'],
            },
            ui: ['all-alpha-ui'],
            app: ['all-alpha-app'],
            api: ['all-alpha-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }] } },
            replacedBy: [{ feature: 'beta', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-alpha-all-so'],
              read: ['read-alpha-read-so'],
            },
            ui: ['read-alpha-ui'],
            app: ['read-alpha-app'],
            api: ['read-alpha-api'],
            replacedBy: {
              default: [{ feature: 'beta', privileges: ['read'] }],
              minimal: [{ feature: 'beta', privileges: ['minimal_read'] }],
            },
          },
        },
      }),
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'beta',
        name: 'Feature Beta',
        app: [],
        category: { id: 'beta', label: 'beta' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-beta-all-so'],
              read: ['all-beta-read-so'],
            },
            ui: ['all-beta-ui'],
            app: ['all-beta-app'],
            api: ['all-beta-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }] } },
            replacedBy: [{ feature: 'gamma', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-beta-all-so'],
              read: ['read-beta-read-so'],
            },
            ui: ['read-beta-ui'],
            app: ['read-beta-app'],
            api: ['read-beta-api'],
            replacedBy: [{ feature: 'gamma', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'gamma',
        name: 'Feature Gamma',
        app: [],
        category: { id: 'gamma', label: 'gamma' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['gamma'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-gamma-all-so'],
              read: ['all-gamma-read-so'],
            },
            ui: ['all-gamma-ui'],
            app: ['all-gamma-app'],
            api: ['all-gamma-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['gamma'] }] } },
          },
          read: {
            savedObject: {
              all: ['read-gamma-all-so'],
              read: ['read-gamma-read-so'],
            },
            ui: ['read-gamma-ui'],
            app: ['read-gamma-app'],
            api: ['read-gamma-api'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const alertingOperations = [
      ...[
        'get',
        'bulkGet',
        'getRuleState',
        'getAlertSummary',
        'getExecutionLog',
        'getActionErrorLog',
        'find',
        'findMutedAlerts',
        'getRuleExecutionKPI',
        'getBackfill',
        'findBackfill',
        'findGaps',
        'bulkEditParams',
        'getGapAutoFillScheduler',
        'findGapAutoFillSchedulerLogs',
        'getHistory',
      ],
      ...[
        'create',
        'delete',
        'update',
        'updateApiKey',
        'muteAll',
        'unmuteAll',
        'muteAlert',
        'unmuteAlert',
        'snooze',
        'unsnooze',
        'snoozeAlert',
        'unsnoozeAlert',
        'bulkEdit',
        'bulkDelete',
        'runSoon',
      ],
    ];

    const expectedAllPrivileges = [
      actions.login,
      actions.api.get('all-alpha-api'),
      actions.app.get('all-alpha-app'),
      actions.ui.get('navLinks', 'all-alpha-app'),
      ...getAllSavedObjectsActions('all-alpha-all-so'),
      ...getReadSavedObjectsActions('all-alpha-read-so'),
      actions.ui.get('alpha', 'all-alpha-ui'),
      ...alertingOperations.map((operation) =>
        actions.alerting.get('rule-type-1', 'alpha', 'rule', operation)
      ),
      actions.ui.get('navLinks', 'all-beta-app'),
      actions.ui.get('beta', 'all-beta-ui'),
      actions.ui.get('navLinks', 'all-gamma-app'),
      actions.ui.get('gamma', 'all-gamma-ui'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      actions.api.get('read-alpha-api'),
      actions.app.get('read-alpha-app'),
      actions.ui.get('navLinks', 'read-alpha-app'),
      ...getAllSavedObjectsActions('read-alpha-all-so'),
      ...getReadSavedObjectsActions('read-alpha-read-so'),
      actions.ui.get('alpha', 'read-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific
      // read.replacedBy: [{ feature: 'beta', privileges: ['read'] }]
      actions.ui.get('navLinks', 'read-beta-app'),
      actions.ui.get('beta', 'read-beta-ui'),
      actions.ui.get('navLinks', 'read-gamma-app'),
      actions.ui.get('gamma', 'read-gamma-ui'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.alpha', {
      all: [...expectedAllPrivileges],
      read: [...expectedReadPrivileges],
      minimal_all: [...expectedAllPrivileges],
      minimal_read: [...expectedReadPrivileges],
    });
  });

  test('cyclical dependencies in `replacedBy` should be forbidden', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'alpha',
        name: 'Feature Alpha',
        app: [],
        category: { id: 'alpha', label: 'alpha' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-alpha-all-so'],
              read: ['all-alpha-read-so'],
            },
            ui: ['all-alpha-ui'],
            app: ['all-alpha-app'],
            api: ['all-alpha-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['alpha'] }] } },
            replacedBy: [{ feature: 'beta', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-alpha-all-so'],
              read: ['read-alpha-read-so'],
            },
            ui: ['read-alpha-ui'],
            app: ['read-alpha-app'],
            api: ['read-alpha-api'],
            replacedBy: {
              default: [{ feature: 'beta', privileges: ['read'] }],
              minimal: [{ feature: 'beta', privileges: ['minimal_read'] }],
            },
          },
        },
      }),
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'beta',
        name: 'Feature Beta',
        app: [],
        category: { id: 'beta', label: 'beta' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-beta-all-so'],
              read: ['all-beta-read-so'],
            },
            ui: ['all-beta-ui'],
            app: ['all-beta-app'],
            api: ['all-beta-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['beta'] }] } },
            replacedBy: [{ feature: 'gamma', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-beta-all-so'],
              read: ['read-beta-read-so'],
            },
            ui: ['read-beta-ui'],
            app: ['read-beta-app'],
            api: ['read-beta-api'],
            replacedBy: [{ feature: 'gamma', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'gamma',
        name: 'Feature Gamma',
        app: [],
        category: { id: 'gamma', label: 'gamma' },
        alerting: [{ ruleTypeId: 'rule-type-1', consumers: ['gamma'] }],
        privileges: {
          all: {
            savedObject: {
              all: ['all-gamma-all-so'],
              read: ['all-gamma-read-so'],
            },
            ui: ['all-gamma-ui'],
            app: ['all-gamma-app'],
            api: ['all-gamma-api'],
            alerting: { rule: { all: [{ ruleTypeId: 'rule-type-1', consumers: ['gamma'] }] } },
            replacedBy: [{ feature: 'alpha', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-gamma-all-so'],
              read: ['read-gamma-read-so'],
            },
            ui: ['read-gamma-ui'],
            app: ['read-gamma-app'],
            api: ['read-gamma-api'],
            replacedBy: [{ feature: 'alpha', privileges: ['read'] }],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    expect(() => privileges.get()).toThrowErrorMatchingInlineSnapshot(
      `"Topological ordering of privileges did not complete, these feature privileges have cyclic dependencies: [\\"alpha.all\\",\\"alpha.read\\",\\"alpha.minimal_all\\",\\"alpha.minimal_read\\",\\"beta.all\\",\\"beta.read\\",\\"beta.minimal_all\\",\\"beta.minimal_read\\",\\"gamma.all\\",\\"gamma.read\\",\\"gamma.minimal_all\\",\\"gamma.minimal_read\\"]"`
    );
  });

  test('actions should respect `composedOf` when specified with `replaceBy` at the privilege', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'feature-a',
        name: 'Feature A',
        app: [],
        category: { id: 'cat-a', label: 'cat-a' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-1'], read: [] },
            ui: ['all-ui-1'],
            replacedBy: [{ feature: 'feature-b', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-1'] },
            ui: ['read-ui-1'],
            replacedBy: [{ feature: 'feature-b', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-b',
        name: 'Feature B',
        app: [],
        category: { id: 'cat-b', label: 'cat-b' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-2'], read: [] },
            ui: ['all-ui-2'],
            composedOf: [{ feature: 'feature-d', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-2'] },
            ui: ['read-ui-2'],
            composedOf: [{ feature: 'feature-d', privileges: ['read'] }],
          },
        },
      }),
      new KibanaFeature({
        id: 'feature-c',
        name: 'Feature C',
        app: [],
        category: { id: 'cat-c', label: 'cat-c' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-3'], read: [] },
            ui: ['all-ui-3'],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-3'] },
            ui: ['read-ui-3'],
          },
        },
      }),
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'feature-d',
        name: 'Feature D',
        app: [],
        category: { id: 'cat-d', label: 'cat-d' },
        privileges: {
          all: {
            savedObject: { all: ['all-savedObject-all-4'], read: [] },
            ui: ['all-ui-4'],
            replacedBy: [{ feature: 'feature-c', privileges: ['all'] }],
          },
          read: {
            savedObject: { all: [], read: ['read-savedObject-read-4'] },
            ui: ['read-ui-4'],
            replacedBy: [{ feature: 'feature-c', privileges: ['read'] }],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    // The feature A is being replaced and therefore only "inherits" UI capabilities from the dependency chain.
    const expectedAllPrivilegesFeatureA = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature A itself.
      ...getAllSavedObjectsActions('all-savedObject-all-1'),
      actions.ui.get('feature-a', 'all-ui-1'),

      // This UI capability is coming from the Feature B that replaces Feature A.
      actions.ui.get('feature-b', 'all-ui-2'),

      // This UI capability is coming from the Feature D that Feature B is composed of.
      actions.ui.get('feature-d', 'all-ui-4'),

      // This UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'all-ui-3'),
    ];
    const expectedReadPrivilegesFeatureA = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature A itself.
      ...getReadSavedObjectsActions('read-savedObject-read-1'),
      actions.ui.get('feature-a', 'read-ui-1'),

      // This UI capability is coming from the Feature B that replaces Feature A.
      actions.ui.get('feature-b', 'read-ui-2'),

      // This UI capability is coming from the Feature D that Feature B is composed of.
      actions.ui.get('feature-d', 'read-ui-4'),

      // This UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.feature-a', {
      all: [...expectedAllPrivilegesFeatureA],
      read: [...expectedReadPrivilegesFeatureA],
      minimal_all: [...expectedAllPrivilegesFeatureA],
      minimal_read: [...expectedReadPrivilegesFeatureA],
    });

    // The feature B is composed of other privilege and therefore only "inherits" all capabilities from the direct
    // dependency, but only UI capabilities from the "replaceBy" part of the chain.
    const expectedAllPrivilegesFeatureB = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature B itself.
      ...getAllSavedObjectsActions('all-savedObject-all-2'),
      actions.ui.get('feature-b', 'all-ui-2'),

      // These capabilities are coming from the Feature D that Feature B is composed of.
      ...getAllSavedObjectsActions('all-savedObject-all-4'),
      actions.ui.get('feature-d', 'all-ui-4'),

      // These UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'all-ui-3'),
    ];
    const expectedReadPrivilegesFeatureB = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature B itself.
      ...getReadSavedObjectsActions('read-savedObject-read-2'),
      actions.ui.get('feature-b', 'read-ui-2'),

      // These capabilities are coming from the Feature D that Feature B is composed of.
      ...getReadSavedObjectsActions('read-savedObject-read-4'),
      actions.ui.get('feature-d', 'read-ui-4'),

      // This UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    expect(actual).toHaveProperty('features.feature-b', {
      all: [...expectedAllPrivilegesFeatureB],
      read: [...expectedReadPrivilegesFeatureB],
      minimal_all: [...expectedAllPrivilegesFeatureB],
      minimal_read: [...expectedReadPrivilegesFeatureB],
    });

    // The feature C is neither composed of any other privilege nor replaced by any privilege.
    const expectedAllPrivilegesFeatureC = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature C itself.
      ...getAllSavedObjectsActions('all-savedObject-all-3'),
      actions.ui.get('feature-c', 'all-ui-3'),
    ];
    const expectedReadPrivilegesFeatureC = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature C itself.
      ...getReadSavedObjectsActions('read-savedObject-read-3'),
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    expect(actual).toHaveProperty('features.feature-c', {
      all: [...expectedAllPrivilegesFeatureC],
      read: [...expectedReadPrivilegesFeatureC],
      minimal_all: [...expectedAllPrivilegesFeatureC],
      minimal_read: [...expectedReadPrivilegesFeatureC],
    });

    // The feature D is being replaced and therefore only "inherits" UI capabilities from the dependency chain.
    const expectedAllPrivilegesFeatureD = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature D itself.
      ...getAllSavedObjectsActions('all-savedObject-all-4'),
      actions.ui.get('feature-d', 'all-ui-4'),

      // This UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'all-ui-3'),
    ];
    const expectedReadPrivilegesFeatureD = [
      // This is capability that is automatically included for all privileges.
      actions.login,

      // These are defined by the Feature D itself.
      ...getReadSavedObjectsActions('read-savedObject-read-4'),
      actions.ui.get('feature-d', 'read-ui-4'),

      // This UI capability is coming from the Feature C that replaces Feature D.
      actions.ui.get('feature-c', 'read-ui-3'),
    ];

    expect(actual).toHaveProperty('features.feature-d', {
      all: [...expectedAllPrivilegesFeatureD],
      read: [...expectedReadPrivilegesFeatureD],
      minimal_all: [...expectedAllPrivilegesFeatureD],
      minimal_read: [...expectedReadPrivilegesFeatureD],
    });
  });

  test(`features with no privileges aren't listed`, () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: null,
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).not.toHaveProperty('features.foo');
  });

  test(`hidden features aren't listed`, () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        hidden: true,
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: {
            management: {
              'all-management': ['all-management-1'],
            },
            catalogue: ['all-catalogue-1'],
            savedObject: {
              all: ['all-savedObject-all-1'],
              read: ['all-savedObject-read-1'],
            },
            ui: ['all-ui-1'],
          },
          read: {
            management: {
              'read-management': ['read-management-1'],
            },
            catalogue: ['read-catalogue-1'],
            savedObject: {
              all: ['read-savedObject-all-1'],
              read: ['read-savedObject-read-1'],
            },
            ui: ['read-ui-1'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).not.toHaveProperty('features.foo');

    const checkPredicate = (action: string) => action.includes('all-') || action.includes('read-');
    expect(actual.global.all.some(checkPredicate)).toBe(false);
    expect(actual.global.read.some(checkPredicate)).toBe(false);
    expect(actual.space.all.some(checkPredicate)).toBe(false);
    expect(actual.space.read.some(checkPredicate)).toBe(false);
  });
});

// the `global` and `space` privileges behave very similarly, with the one exception being that
// "global all" includes the ability to manage spaces. The following tests both groups at once...
[
  {
    group: 'global',
    expectManageSpaces: true,
    expectGetFeatures: true,
    expectEnterpriseSearch: true,
    expectDecryptedTelemetry: true,
    expectGlobalSettings: true,
  },
  {
    group: 'space',
    expectManageSpaces: false,
    expectGetFeatures: false,
    expectEnterpriseSearch: false,
    expectDecryptedTelemetry: false,
    expectGlobalSettings: false,
  },
].forEach(
  ({
    group,
    expectManageSpaces,
    expectGetFeatures,
    expectEnterpriseSearch,
    expectDecryptedTelemetry,
    expectGlobalSettings,
  }) => {
    describe(`${group}`, () => {
      test('actions defined in any feature privilege are included in `all`', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            catalogue: ['ignore-me-1', 'ignore-me-2'],
            management: {
              foo: ['ignore-me-1', 'ignore-me-2'],
            },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1', 'all-management-2'],
                },
                catalogue: ['all-catalogue-1', 'all-catalogue-2'],
                savedObject: {
                  all: ['all-savedObject-all-1', 'all-savedObject-all-2'],
                  read: ['all-savedObject-read-1', 'all-savedObject-read-2'],
                },
                ui: ['all-ui-1', 'all-ui-2'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1', 'read-management-2'],
                },
                catalogue: ['read-catalogue-1', 'read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-1', 'read-savedObject-all-2'],
                  read: ['read-savedObject-read-1', 'read-savedObject-read-2'],
                },
                ui: ['read-ui-1', 'read-ui-2'],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
          actions.ui.get('catalogue', 'all-catalogue-1'),
          actions.ui.get('catalogue', 'all-catalogue-2'),
          actions.ui.get('management', 'all-management', 'all-management-1'),
          actions.ui.get('management', 'all-management', 'all-management-2'),
          ...getAllSavedObjectsActions('all-savedObject-all-1'),
          ...getAllSavedObjectsActions('all-savedObject-all-2'),
          ...getReadSavedObjectsActions('all-savedObject-read-1'),
          ...getReadSavedObjectsActions('all-savedObject-read-2'),
          actions.ui.get('foo', 'all-ui-1'),
          actions.ui.get('foo', 'all-ui-2'),
          actions.ui.get('catalogue', 'read-catalogue-1'),
          actions.ui.get('catalogue', 'read-catalogue-2'),
          actions.ui.get('management', 'read-management', 'read-management-1'),
          actions.ui.get('management', 'read-management', 'read-management-2'),
          ...getAllSavedObjectsActions('read-savedObject-all-1'),
          ...getAllSavedObjectsActions('read-savedObject-all-2'),
          ...getReadSavedObjectsActions('read-savedObject-read-1'),
          ...getReadSavedObjectsActions('read-savedObject-read-2'),
          actions.ui.get('foo', 'read-ui-1'),
          actions.ui.get('foo', 'read-ui-2'),
        ]);
      });

      test('actions defined in any feature privilege of a hidden but referenced feature are included in `all`, ignoring the excludeFromBasePrivileges property', () => {
        const getFeatures = ({
          excludeFromBasePrivileges,
        }: {
          excludeFromBasePrivileges: boolean;
        }) => [
          new KibanaFeature({
            hidden: true,
            excludeFromBasePrivileges,
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
          new KibanaFeature({
            id: 'bar',
            name: 'Bar KibanaFeature',
            app: [],
            category: { id: 'bar', label: 'bar' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-2'],
                },
                catalogue: ['all-catalogue-2'],
                savedObject: {
                  all: ['all-savedObject-all-2'],
                  read: ['all-savedObject-read-2'],
                },
                ui: ['all-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['all'] }],
              },
              read: {
                management: {
                  'read-management': ['read-management-2'],
                },
                catalogue: ['read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-2'],
                  read: ['read-savedObject-read-2'],
                },
                ui: ['read-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['read'] }],
              },
            },
          }),
        ];

        const expectedActions = [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
          actions.ui.get('catalogue', 'all-catalogue-2'),
          actions.ui.get('management', 'all-management', 'all-management-2'),
          ...getAllSavedObjectsActions('all-savedObject-all-2'),
          ...getReadSavedObjectsActions('all-savedObject-read-2'),
          actions.ui.get('bar', 'all-ui-2'),
          actions.ui.get('catalogue', 'read-catalogue-2'),
          actions.ui.get('management', 'read-management', 'read-management-2'),
          ...getAllSavedObjectsActions('read-savedObject-all-2'),
          ...getReadSavedObjectsActions('read-savedObject-read-2'),
          actions.ui.get('bar', 'read-ui-2'),
          actions.ui.get('catalogue', 'read-catalogue-1'),
          actions.ui.get('management', 'read-management', 'read-management-1'),
          ...getAllSavedObjectsActions('read-savedObject-all-1'),
          ...getReadSavedObjectsActions('read-savedObject-read-1'),
          actions.ui.get('foo', 'read-ui-1'),
          actions.ui.get('catalogue', 'all-catalogue-1'),
          actions.ui.get('management', 'all-management', 'all-management-1'),
          ...getAllSavedObjectsActions('all-savedObject-all-1'),
          ...getReadSavedObjectsActions('all-savedObject-read-1'),
          actions.ui.get('foo', 'all-ui-1'),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();

        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(
          getFeatures({ excludeFromBasePrivileges: false })
        );
        expect(
          privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic).get()
        ).toHaveProperty(`${group}.all`, expectedActions);

        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(
          getFeatures({ excludeFromBasePrivileges: true })
        );
        expect(
          privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic).get()
        ).toHaveProperty(`${group}.all`, expectedActions);
      });

      test('actions defined in a feature privilege with name `read` are included in `read`', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            catalogue: ['ignore-me-1', 'ignore-me-2'],
            management: {
              foo: ['ignore-me-1', 'ignore-me-2'],
            },
            privileges: {
              all: {
                management: {
                  'ignore-me': ['ignore-me-1', 'ignore-me-2'],
                },
                catalogue: ['ignore-me-1', 'ignore-me-2'],
                savedObject: {
                  all: ['ignore-me-1', 'ignore-me-2'],
                  read: ['ignore-me-1', 'ignore-me-2'],
                },
                ui: ['ignore-me-1', 'ignore-me-2'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1', 'read-management-2'],
                },
                catalogue: ['read-catalogue-1', 'read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-1', 'read-savedObject-all-2'],
                  read: ['read-savedObject-read-1', 'read-savedObject-read-2'],
                },
                ui: ['read-ui-1', 'read-ui-2'],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
          actions.ui.get('catalogue', 'read-catalogue-1'),
          actions.ui.get('catalogue', 'read-catalogue-2'),
          actions.ui.get('management', 'read-management', 'read-management-1'),
          actions.ui.get('management', 'read-management', 'read-management-2'),
          ...getAllSavedObjectsActions('read-savedObject-all-1'),
          ...getAllSavedObjectsActions('read-savedObject-all-2'),
          ...getReadSavedObjectsActions('read-savedObject-read-1'),
          ...getReadSavedObjectsActions('read-savedObject-read-2'),
          actions.ui.get('foo', 'read-ui-1'),
          actions.ui.get('foo', 'read-ui-2'),
        ]);
      });

      test('actions defined in a feature privilege with name `read` of a hidden but referenced feature are included in `read`, ignoring the excludeFromBasePrivileges property', () => {
        const getFeatures = ({
          excludeFromBasePrivileges,
        }: {
          excludeFromBasePrivileges: boolean;
        }) => [
          new KibanaFeature({
            hidden: true,
            excludeFromBasePrivileges,
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
          new KibanaFeature({
            id: 'bar',
            name: 'Bar KibanaFeature',
            app: [],
            category: { id: 'bar', label: 'bar' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-2'],
                },
                catalogue: ['all-catalogue-2'],
                savedObject: {
                  all: ['all-savedObject-all-2'],
                  read: ['all-savedObject-read-2'],
                },
                ui: ['all-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['all'] }],
              },
              read: {
                management: {
                  'read-management': ['read-management-2'],
                },
                catalogue: ['read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-2'],
                  read: ['read-savedObject-read-2'],
                },
                ui: ['read-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['read'] }],
              },
            },
          }),
        ];

        const expectedActions = [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
          actions.ui.get('catalogue', 'read-catalogue-2'),
          actions.ui.get('management', 'read-management', 'read-management-2'),
          ...getAllSavedObjectsActions('read-savedObject-all-2'),
          ...getReadSavedObjectsActions('read-savedObject-read-2'),
          actions.ui.get('bar', 'read-ui-2'),
          actions.ui.get('catalogue', 'read-catalogue-1'),
          actions.ui.get('management', 'read-management', 'read-management-1'),
          ...getAllSavedObjectsActions('read-savedObject-all-1'),
          ...getReadSavedObjectsActions('read-savedObject-read-1'),
          actions.ui.get('foo', 'read-ui-1'),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();

        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(
          getFeatures({ excludeFromBasePrivileges: false })
        );
        expect(
          privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic).get()
        ).toHaveProperty(`${group}.read`, expectedActions);

        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(
          getFeatures({ excludeFromBasePrivileges: true })
        );
        expect(
          privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic).get()
        ).toHaveProperty(`${group}.read`, expectedActions);
      });

      test('actions defined in a reserved privilege are not included in `all` or `read`', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            catalogue: ['ignore-me-1', 'ignore-me-2'],
            management: {
              foo: ['ignore-me-1', 'ignore-me-2'],
            },
            privileges: null,
            reserved: {
              privileges: [
                {
                  id: 'reserved',
                  privilege: {
                    savedObject: {
                      all: ['ignore-me-1', 'ignore-me-2'],
                      read: ['ignore-me-1', 'ignore-me-2'],
                    },
                    ui: ['ignore-me-1'],
                  },
                },
              ],
              description: '',
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
      });

      test('actions defined in a feature with excludeFromBasePrivileges are not included in `all` or `read', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            id: 'foo',
            name: 'Foo KibanaFeature',
            excludeFromBasePrivileges: true,
            app: [],
            category: { id: 'foo', label: 'foo' },
            catalogue: ['ignore-me-1', 'ignore-me-2'],
            management: {
              foo: ['ignore-me-1', 'ignore-me-2'],
            },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
      });

      test('actions defined via `composedOf` in a feature with excludeFromBasePrivileges are not included in `all` or `read', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            hidden: true,
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
          new KibanaFeature({
            excludeFromBasePrivileges: true,
            id: 'bar',
            name: 'Bar KibanaFeature',
            app: [],
            category: { id: 'bar', label: 'bar' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-2'],
                },
                catalogue: ['all-catalogue-2'],
                savedObject: {
                  all: ['all-savedObject-all-2'],
                  read: ['all-savedObject-read-2'],
                },
                ui: ['all-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['all'] }],
              },
              read: {
                management: {
                  'read-management': ['read-management-2'],
                },
                catalogue: ['read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-2'],
                  read: ['read-savedObject-read-2'],
                },
                ui: ['read-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['read'] }],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
      });

      test('actions defined in an individual feature privilege with excludeFromBasePrivileges are not included in `all` or `read`', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            catalogue: ['ignore-me-1', 'ignore-me-2'],
            management: {
              foo: ['ignore-me-1', 'ignore-me-2'],
            },
            privileges: {
              all: {
                excludeFromBasePrivileges: true,
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                excludeFromBasePrivileges: true,
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
      });

      test('actions defined via `composedOf` in an individual feature privilege with excludeFromBasePrivileges are not included in `all` or `read`', () => {
        const features: KibanaFeature[] = [
          new KibanaFeature({
            hidden: true,
            id: 'foo',
            name: 'Foo KibanaFeature',
            app: [],
            category: { id: 'foo', label: 'foo' },
            privileges: {
              all: {
                management: {
                  'all-management': ['all-management-1'],
                },
                catalogue: ['all-catalogue-1'],
                savedObject: {
                  all: ['all-savedObject-all-1'],
                  read: ['all-savedObject-read-1'],
                },
                ui: ['all-ui-1'],
              },
              read: {
                management: {
                  'read-management': ['read-management-1'],
                },
                catalogue: ['read-catalogue-1'],
                savedObject: {
                  all: ['read-savedObject-all-1'],
                  read: ['read-savedObject-read-1'],
                },
                ui: ['read-ui-1'],
              },
            },
          }),
          new KibanaFeature({
            id: 'bar',
            name: 'Bar KibanaFeature',
            app: [],
            category: { id: 'bar', label: 'bar' },
            privileges: {
              all: {
                excludeFromBasePrivileges: true,
                management: {
                  'all-management': ['all-management-2'],
                },
                catalogue: ['all-catalogue-2'],
                savedObject: {
                  all: ['all-savedObject-all-2'],
                  read: ['all-savedObject-read-2'],
                },
                ui: ['all-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['all'] }],
              },
              read: {
                excludeFromBasePrivileges: true,
                management: {
                  'read-management': ['read-management-2'],
                },
                catalogue: ['read-catalogue-2'],
                savedObject: {
                  all: ['read-savedObject-all-2'],
                  read: ['read-savedObject-read-2'],
                },
                ui: ['read-ui-2'],
                composedOf: [{ feature: 'foo', privileges: ['read'] }],
              },
            },
          }),
        ];

        const mockFeaturesPlugin = featuresPluginMock.createSetup();
        mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
        const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

        const actual = privileges.get();
        expect(actual).toHaveProperty(`${group}.all`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Read, 'features')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'taskManager')] : []),
          ...(expectGetFeatures ? [actions.api.get(ApiOperation.Manage, 'spaces')] : []),
          ...(expectManageSpaces
            ? [
                actions.space.manage,
                actions.ui.get('spaces', 'manage'),
                actions.ui.get('management', 'kibana', 'spaces'),
                actions.ui.get('catalogue', 'spaces'),
              ]
            : []),
          ...(expectEnterpriseSearch ? [actions.ui.get('enterpriseSearch', 'all')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'save')] : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
        expect(actual).toHaveProperty(`${group}.read`, [
          actions.login,
          ...(expectDecryptedTelemetry
            ? [actions.api.get(ApiOperation.Read, 'decryptedTelemetry')]
            : []),
          ...(expectGlobalSettings ? [actions.ui.get('globalSettings', 'show')] : []),
        ]);
      });
    });
  }
);

describe('reserved', () => {
  test('actions defined at the feature do not cascade to the privileges', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: ['app-1', 'app-2'],
        category: { id: 'foo', label: 'foo' },
        catalogue: ['catalogue-1', 'catalogue-2'],
        management: {
          foo: ['management-1', 'management-2'],
        },
        privileges: null,
        reserved: {
          privileges: [
            {
              id: 'foo',
              privilege: {
                savedObject: {
                  all: [],
                  read: [],
                },
                ui: [],
              },
            },
          ],
          description: '',
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).toHaveProperty('reserved.foo');
  });

  test(`actions only specified at the privilege are alright too`, () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: null,
        reserved: {
          privileges: [
            {
              id: 'foo',
              privilege: {
                savedObject: {
                  all: ['savedObject-all-1', 'savedObject-all-2'],
                  read: ['savedObject-read-1', 'savedObject-read-2'],
                },
                ui: ['ui-1', 'ui-2'],
              },
            },
          ],
          description: '',
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).toHaveProperty('reserved.foo', [
      ...getAllSavedObjectsActions('savedObject-all-1'),
      ...getAllSavedObjectsActions('savedObject-all-2'),
      ...getReadSavedObjectsActions('savedObject-read-1'),
      ...getReadSavedObjectsActions('savedObject-read-2'),
      actions.ui.get('foo', 'ui-1'),
      actions.ui.get('foo', 'ui-2'),
    ]);
  });

  test(`features with no reservedPrivileges aren't listed`, () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        id: 'foo',
        name: 'Foo KibanaFeature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: {
            savedObject: {
              all: [],
              read: [],
            },
            ui: ['foo'],
          },
          read: {
            savedObject: {
              all: [],
              read: [],
            },
            ui: ['foo'],
          },
        },
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

    const actual = privileges.get();
    expect(actual).not.toHaveProperty('reserved.foo');
  });
});

describe('subFeatures', () => {
  describe(`with includeIn: 'none'`, () => {
    test(`should not augment the primary feature privileges, base privileges, or minimal feature privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty('foo.all', [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual.features).toHaveProperty('foo.minimal_all', [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty('foo.read', [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual.features).toHaveProperty('foo.minimal_read', [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('space.all', [actions.login, actions.ui.get('foo', 'foo')]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });

    test(`with replacedBy and without excludeFromBasePrivileges show sub-features in base-privilege: ALL`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
            read: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-foo'],
                      replacedBy: [{ feature: 'bar', privileges: ['subFeaturePriv1'] }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        // `bar` is hidden so its own top-level privileges do not pollute base privileges,
        // isolating the assertions to the composable privilege code path.
        new KibanaFeature({
          hidden: true,
          id: 'bar',
          name: 'Bar KibanaFeature',
          app: [],
          category: { id: 'bar', label: 'bar' },
          privileges: {
            all: { savedObject: { all: [], read: [] }, ui: [] },
            read: { savedObject: { all: [], read: [] }, ui: [] },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-bar'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();

      // The composable privilege loop adds the replacement's UI actions to the sub-feature
      // privilege itself so deprecated roles keep their UI capabilities.
      expect(actual.features).toHaveProperty('foo.subFeaturePriv1', [
        actions.login,
        actions.ui.get('foo', 'sub-feature-ui-foo'),
        actions.ui.get('bar', 'sub-feature-ui-bar'),
      ]);

      // Without excludeFromBasePrivileges, those same composed UI actions ALSO get added to
      // the base 'all' privilege set, even though the sub-feature uses includeIn: 'none'.
      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('bar', 'sub-feature-ui-bar'),
      ]);
      expect(actual).toHaveProperty('space.all', [
        actions.login,
        actions.ui.get('foo', 'foo'),
        actions.ui.get('bar', 'sub-feature-ui-bar'),
      ]);

      // base 'read' is not affected because the composable privilege id is the sub-feature
      // privilege id, not 'read'.
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });

    test(`with replacedBy and excludeFromBasePrivileges hide sub-features in base-privilege: ALL`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
            read: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      excludeFromBasePrivileges: true,
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-foo'],
                      replacedBy: [{ feature: 'bar', privileges: ['subFeaturePriv1'] }],
                    },
                  ],
                },
              ],
            },
          ],
        }),
        new KibanaFeature({
          hidden: true,
          id: 'bar',
          name: 'Bar KibanaFeature',
          app: [],
          category: { id: 'bar', label: 'bar' },
          privileges: {
            all: { savedObject: { all: [], read: [] }, ui: [] },
            read: { savedObject: { all: [], read: [] }, ui: [] },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-bar'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();

      // The sub-feature privilege itself still receives the composed UI actions so
      // deprecated roles keep their UI capabilities — excludeFromBasePrivileges does NOT
      // remove actions from the sub-feature privilege, only from base privileges.
      expect(actual.features).toHaveProperty('foo.subFeaturePriv1', [
        actions.login,
        actions.ui.get('foo', 'sub-feature-ui-foo'),
        actions.ui.get('bar', 'sub-feature-ui-bar'),
      ]);

      // The composed UI action from `bar` is excluded from base 'all' and space 'all'
      // because excludeFromBasePrivileges: true gates that code path.
      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.all', [actions.login, actions.ui.get('foo', 'foo')]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });

    test(`without replacedBy and without excludeFromBasePrivileges, sub-feature UI only appears in standalone feature privilege and no ALL/READ base privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
            read: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-foo'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();

      // The sub-feature privilege only contains its own UI action — no composition occurs.
      expect(actual.features).toHaveProperty('foo.subFeaturePriv1', [
        actions.login,
        actions.ui.get('foo', 'sub-feature-ui-foo'),
      ]);

      // Without replacedBy there is no composable privilege, so the sub-feature UI action
      // never reaches base privileges regardless of excludeFromBasePrivileges.
      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.all', [actions.login, actions.ui.get('foo', 'foo')]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });

    test(`with excludeFromBasePrivileges and without replacedBy, sub-feature UI only appears in standalone feature privilege and no ALL/READ base privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
            read: {
              savedObject: { all: [], read: [] },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'none',
                      excludeFromBasePrivileges: true,
                      savedObject: { all: [], read: [] },
                      ui: ['sub-feature-ui-foo'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();

      // excludeFromBasePrivileges does not strip actions from the standalone feature privilege.
      expect(actual.features).toHaveProperty('foo.subFeaturePriv1', [
        actions.login,
        actions.ui.get('foo', 'sub-feature-ui-foo'),
      ]);

      // Without replacedBy, excludeFromBasePrivileges has no additional effect — the sub-feature
      // UI action is absent from base privileges for the same reason as the non-excluded case.
      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.all', [actions.login, actions.ui.get('foo', 'foo')]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });
  });

  describe(`with includeIn: 'read'`, () => {
    test(`should augment the primary feature privileges and base privileges, but never the minimal versions`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
    });

    test(`should augment the primary feature privileges, but not base privileges if feature is excluded from them.`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          excludeFromBasePrivileges: true,
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
      ]);

      expect(actual).toHaveProperty('space.all', [actions.login]);
      expect(actual).toHaveProperty('space.read', [actions.login]);
    });
  });

  describe(`with includeIn: 'all'`, () => {
    test(`should augment the primary 'all' feature privileges and base 'all' privileges, but never the minimal versions`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'all',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [actions.login, actions.ui.get('foo', 'foo')]);
    });

    test(`should augment the primary 'all' feature privileges, but not the base privileges if the feature is excluded from them`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          excludeFromBasePrivileges: true,
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'all',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
      ]);

      expect(actual).toHaveProperty('space.all', [actions.login]);
      expect(actual).toHaveProperty('space.read', [actions.login]);
    });
  });

  describe(`when license does not allow sub features`, () => {
    test(`should augment the primary feature privileges, and should not create sub-feature privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

      const actual = privileges.get();
      expect(actual.features).not.toHaveProperty(`foo.subFeaturePriv1`);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
    });

    test(`should get the sub-feature privileges if 'respectLicenseLevel' is false`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceBasic);

      const actual = privileges.get(false);
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
    });
  });

  describe(`when license allows subfeatures, but not a specific sub feature`, () => {
    test(`should create minimal privileges, but not augment the primary feature privileges or create the disallowed sub-feature privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'licensedSubFeaturePriv',
                      name: 'licensed sub feature priv',
                      includeIn: 'read',
                      minimumLicense: 'platinum',
                      savedObject: {
                        all: ['all-licensed-sub-feature-type'],
                        read: ['read-licensed-sub-feature-type'],
                      },
                      ui: ['licensed-sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`);
      expect(actual.features).not.toHaveProperty(`foo.licensedSubFeaturePriv`);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
      ]);
    });
  });

  describe(`when license allows subfeatures, but and a licensed sub feature`, () => {
    test(`should create minimal privileges, augment the primary feature privileges, and create the licensed sub-feature privileges`, () => {
      const features: KibanaFeature[] = [
        new KibanaFeature({
          id: 'foo',
          name: 'Foo KibanaFeature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
            read: {
              savedObject: {
                all: [],
                read: [],
              },
              ui: ['foo'],
            },
          },
          subFeatures: [
            {
              name: 'subFeature1',
              privilegeGroups: [
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'subFeaturePriv1',
                      name: 'sub feature priv 1',
                      includeIn: 'read',
                      savedObject: {
                        all: ['all-sub-feature-type'],
                        read: ['read-sub-feature-type'],
                      },
                      ui: ['sub-feature-ui'],
                    },
                  ],
                },
                {
                  groupType: 'independent',
                  privileges: [
                    {
                      id: 'licensedSubFeaturePriv',
                      name: 'licensed sub feature priv',
                      includeIn: 'read',
                      minimumLicense: 'platinum',
                      savedObject: {
                        all: ['all-licensed-sub-feature-type'],
                        read: ['read-licensed-sub-feature-type'],
                      },
                      ui: ['licensed-sub-feature-ui'],
                    },
                  ],
                },
              ],
            },
          ],
        }),
      ];

      const mockFeaturesPlugin = featuresPluginMock.createSetup();
      mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
      const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServicePlatinum);

      const actual = privileges.get();
      expect(actual.features).toHaveProperty(`foo.subFeaturePriv1`);
      expect(actual.features).toHaveProperty(`foo.licensedSubFeaturePriv`);

      expect(actual.features).toHaveProperty(`foo.all`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_all`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual.features).toHaveProperty(`foo.read`, [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);

      expect(actual.features).toHaveProperty(`foo.minimal_read`, [
        actions.login,
        actions.ui.get('foo', 'foo'),
      ]);

      expect(actual).toHaveProperty('global.all', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.api.get(ApiOperation.Read, 'features'),
        actions.api.get(ApiOperation.Manage, 'taskManager'),
        actions.api.get(ApiOperation.Manage, 'spaces'),
        actions.space.manage,
        actions.ui.get('spaces', 'manage'),
        actions.ui.get('management', 'kibana', 'spaces'),
        actions.ui.get('catalogue', 'spaces'),
        actions.ui.get('enterpriseSearch', 'all'),
        actions.ui.get('globalSettings', 'save'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('global.read', [
        actions.login,
        actions.api.get(ApiOperation.Read, 'decryptedTelemetry'),
        actions.ui.get('globalSettings', 'show'),
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);

      expect(actual).toHaveProperty('space.all', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);
      expect(actual).toHaveProperty('space.read', [
        actions.login,
        ...getAllSavedObjectsActions('all-sub-feature-type'),
        ...getAllSavedObjectsActions('all-licensed-sub-feature-type'),
        ...getReadSavedObjectsActions('read-sub-feature-type'),
        ...getReadSavedObjectsActions('read-licensed-sub-feature-type'),
        actions.ui.get('foo', 'foo'),
        actions.ui.get('foo', 'sub-feature-ui'),
        actions.ui.get('foo', 'licensed-sub-feature-ui'),
      ]);
    });
  });

  test('actions should respect `replacedBy` specified by the deprecated sub-feature privileges', () => {
    const features: KibanaFeature[] = [
      new KibanaFeature({
        deprecated: { notice: 'It is deprecated, sorry.' },
        id: 'alpha',
        name: 'Feature Alpha',
        app: [],
        category: { id: 'alpha', label: 'alpha' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-alpha-all-so'],
              read: ['all-alpha-read-so'],
            },
            ui: ['all-alpha-ui'],
            app: ['all-alpha-app'],
            api: ['all-alpha-api'],
            replacedBy: [{ feature: 'beta', privileges: ['all'] }],
          },
          read: {
            savedObject: {
              all: ['read-alpha-all-so'],
              read: ['read-alpha-read-so'],
            },
            ui: ['read-alpha-ui'],
            app: ['read-alpha-app'],
            api: ['read-alpha-api'],
            replacedBy: {
              default: [{ feature: 'beta', privileges: ['read', 'sub_beta'] }],
              minimal: [{ feature: 'beta', privileges: ['minimal_read'] }],
            },
          },
        },
        subFeatures: [
          {
            name: 'sub-feature-alpha',
            privilegeGroups: [
              {
                groupType: 'independent',
                privileges: [
                  {
                    id: 'sub_alpha',
                    name: 'Sub Feature Alpha',
                    includeIn: 'all',
                    savedObject: {
                      all: ['sub-alpha-all-so'],
                      read: ['sub-alpha-read-so'],
                    },
                    ui: ['sub-alpha-ui'],
                    app: ['sub-alpha-app'],
                    api: ['sub-alpha-api'],
                    replacedBy: [
                      { feature: 'beta', privileges: ['minimal_read'] },
                      { feature: 'beta', privileges: ['sub_beta'] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
      new KibanaFeature({
        id: 'beta',
        name: 'Feature Beta',
        app: [],
        category: { id: 'beta', label: 'beta' },
        privileges: {
          all: {
            savedObject: {
              all: ['all-beta-all-so'],
              read: ['all-beta-read-so'],
            },
            ui: ['all-beta-ui'],
            app: ['all-beta-app'],
            api: ['all-beta-api'],
          },
          read: {
            savedObject: {
              all: ['read-beta-all-so'],
              read: ['read-beta-read-so'],
            },
            ui: ['read-beta-ui'],
            app: ['read-beta-app'],
            api: ['read-beta-api'],
          },
        },
        subFeatures: [
          {
            name: 'sub-feature-beta',
            privilegeGroups: [
              {
                groupType: 'independent',
                privileges: [
                  {
                    id: 'sub_beta',
                    name: 'Sub Feature Beta',
                    includeIn: 'all',
                    savedObject: {
                      all: ['sub-beta-all-so'],
                      read: ['sub-beta-read-so'],
                    },
                    ui: ['sub-beta-ui'],
                    app: ['sub-beta-app'],
                    api: ['sub-beta-api'],
                  },
                ],
              },
            ],
          },
        ],
      }),
    ];

    const mockFeaturesPlugin = featuresPluginMock.createSetup();
    mockFeaturesPlugin.getKibanaFeatures.mockReturnValue(features);
    const privileges = privilegesFactory(actions, mockFeaturesPlugin, mockLicenseServiceGold);

    const expectedAllPrivileges = [
      actions.login,
      actions.api.get('all-alpha-api'),
      actions.api.get('sub-alpha-api'),
      actions.app.get('all-alpha-app'),
      actions.app.get('sub-alpha-app'),
      actions.ui.get('navLinks', 'all-alpha-app'),
      actions.ui.get('navLinks', 'sub-alpha-app'),
      ...getAllSavedObjectsActions('all-alpha-all-so'),
      ...getAllSavedObjectsActions('sub-alpha-all-so'),
      ...getReadSavedObjectsActions('all-alpha-read-so'),
      ...getReadSavedObjectsActions('sub-alpha-read-so'),
      actions.ui.get('alpha', 'all-alpha-ui'),
      actions.ui.get('alpha', 'sub-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific:
      // all.replacedBy: [{ feature: 'beta', privileges: ['all'] }],
      actions.ui.get('navLinks', 'all-beta-app'),
      actions.ui.get('navLinks', 'sub-beta-app'),
      actions.ui.get('beta', 'all-beta-ui'),
      actions.ui.get('beta', 'sub-beta-ui'),
    ];

    const expectedMinimalAllPrivileges = [
      actions.login,
      actions.api.get('all-alpha-api'),
      actions.app.get('all-alpha-app'),
      actions.ui.get('navLinks', 'all-alpha-app'),
      ...getAllSavedObjectsActions('all-alpha-all-so'),
      ...getReadSavedObjectsActions('all-alpha-read-so'),
      actions.ui.get('alpha', 'all-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific.
      // Actions from the beta feature top-level and sub-feature privileges are included because
      // used simple `replacedBy` format:
      // all.replacedBy: [{ feature: 'beta', privileges: ['all'] }],
      actions.ui.get('navLinks', 'all-beta-app'),
      actions.ui.get('navLinks', 'sub-beta-app'),
      actions.ui.get('beta', 'all-beta-ui'),
      actions.ui.get('beta', 'sub-beta-ui'),
    ];

    const expectedReadPrivileges = [
      actions.login,
      actions.api.get('read-alpha-api'),
      actions.app.get('read-alpha-app'),
      actions.ui.get('navLinks', 'read-alpha-app'),
      ...getAllSavedObjectsActions('read-alpha-all-so'),
      ...getReadSavedObjectsActions('read-alpha-read-so'),
      actions.ui.get('alpha', 'read-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific:
      // read.replacedBy: {
      //   default: [{ feature: 'beta', privileges: ['read', 'sub_beta'] }]
      // },
      actions.ui.get('navLinks', 'read-beta-app'),
      actions.ui.get('beta', 'read-beta-ui'),
      actions.ui.get('navLinks', 'sub-beta-app'),
      actions.ui.get('beta', 'sub-beta-ui'),
    ];

    const expectedMinimalReadPrivileges = [
      actions.login,
      actions.api.get('read-alpha-api'),
      actions.app.get('read-alpha-app'),
      actions.ui.get('navLinks', 'read-alpha-app'),
      ...getAllSavedObjectsActions('read-alpha-all-so'),
      ...getReadSavedObjectsActions('read-alpha-read-so'),
      actions.ui.get('alpha', 'read-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific:
      // read.replacedBy: {
      //   minimal: [{ feature: 'beta', privileges: ['minimal_read'] }],
      // },
      actions.ui.get('navLinks', 'read-beta-app'),
      actions.ui.get('beta', 'read-beta-ui'),
    ];

    const expectedSubFeaturePrivileges = [
      actions.login,
      actions.api.get('sub-alpha-api'),
      actions.app.get('sub-alpha-app'),
      actions.ui.get('navLinks', 'sub-alpha-app'),
      ...getAllSavedObjectsActions('sub-alpha-all-so'),
      ...getReadSavedObjectsActions('sub-alpha-read-so'),
      actions.ui.get('alpha', 'sub-alpha-ui'),
      // To maintain compatibility with the new UI capabilities that are feature specific:
      // sub_alpha.replacedBy: [
      //   { feature: 'beta', privileges: ['minimal_read'] },
      //   { feature: 'beta', privileges: ['sub_beta'] },
      // ],
      actions.ui.get('navLinks', 'read-beta-app'),
      actions.ui.get('beta', 'read-beta-ui'),
      actions.ui.get('navLinks', 'sub-beta-app'),
      actions.ui.get('beta', 'sub-beta-ui'),
    ];

    const actual = privileges.get();
    expect(actual).toHaveProperty('features.alpha', {
      all: expectedAllPrivileges,
      read: expectedReadPrivileges,
      minimal_all: expectedMinimalAllPrivileges,
      minimal_read: expectedMinimalReadPrivileges,
      sub_alpha: expectedSubFeaturePrivileges,
    });
  });
});

describe('#getReplacedByForPrivilege', () => {
  test('correctly gets `replacedBy` with simple format', () => {
    const basePrivilege = { savedObject: { all: [], read: [] }, ui: [] };
    expect(getReplacedByForPrivilege('all', basePrivilege)).toBeUndefined();
    expect(getReplacedByForPrivilege('minimal_all', basePrivilege)).toBeUndefined();

    const privilegeWithReplacedBy = {
      ...basePrivilege,
      replacedBy: [{ feature: 'alpha', privileges: ['all', 'read'] }],
    };
    expect(getReplacedByForPrivilege('all', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['all', 'read'] },
    ]);
    expect(getReplacedByForPrivilege('minimal_all', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['all', 'read'] },
    ]);
    expect(getReplacedByForPrivilege('custom', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['all', 'read'] },
    ]);
  });

  test('correctly gets `replacedBy` with extended format', () => {
    const basePrivilege = { savedObject: { all: [], read: [] }, ui: [] };
    expect(getReplacedByForPrivilege('all', basePrivilege)).toBeUndefined();
    expect(getReplacedByForPrivilege('minimal_all', basePrivilege)).toBeUndefined();

    const privilegeWithReplacedBy = {
      ...basePrivilege,
      replacedBy: {
        default: [{ feature: 'alpha', privileges: ['all', 'read', 'custom'] }],
        minimal: [{ feature: 'alpha', privileges: ['minimal_all'] }],
      },
    };
    expect(getReplacedByForPrivilege('all', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['all', 'read', 'custom'] },
    ]);
    expect(getReplacedByForPrivilege('custom', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['all', 'read', 'custom'] },
    ]);
    expect(getReplacedByForPrivilege('minimal_all', privilegeWithReplacedBy)).toEqual([
      { feature: 'alpha', privileges: ['minimal_all'] },
    ]);
  });
});
