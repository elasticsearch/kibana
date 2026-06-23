/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FeatureKibanaPrivileges } from '@kbn/features-plugin/server';
import { KibanaFeature } from '@kbn/features-plugin/server';

import { FeaturePrivilegeAlertingBuilder } from './alerting';
import { Actions } from '../../actions';

describe(`feature_privilege_builder`, () => {
  describe(`alerting`, () => {
    test('grants no privileges by default', () => {
      const actions = new Actions();
      const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

      const privilege: FeatureKibanaPrivileges = {
        alerting: {
          rule: {
            all: [],
            read: [],
          },
          alert: {
            all: [],
            read: [],
          },
        },
        savedObject: {
          all: [],
          read: [],
        },
        ui: [],
      };

      const feature = new KibanaFeature({
        id: 'my-feature',
        name: 'my-feature',
        app: [],
        category: { id: 'foo', label: 'foo' },
        privileges: {
          all: privilege,
          read: privilege,
        },
      });

      expect(alertingFeaturePrivileges.getActions(privilege, feature)).toEqual([]);
    });

    describe(`within feature`, () => {
      test('grants `read` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              read: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
          ]
        `);
      });

      test('grants `read` privileges to alerts under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            alert: {
              all: [],
              read: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/alert/get",
            "alerting:alert-type/my-consumer/alert/find",
            "alerting:alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:alert-type/my-consumer/alert/getAlertSummary",
          ]
        `);
      });

      test('grants `read` privileges to rules and alerts under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              read: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
            alert: {
              all: [],
              read: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/alert/get",
            "alerting:alert-type/my-consumer/alert/find",
            "alerting:alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:alert-type/my-consumer/alert/getAlertSummary",
          ]
        `);
      });
      test('grants `manual_run` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              manual_run: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/deleteBackfill",
            "alerting:alert-type/my-consumer/rule/fillGaps",
            "alerting:alert-type/my-consumer/rule/scheduleBackfill",
          ]
        `);
      });

      test('grants `enable` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              enable: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/enable",
            "alerting:alert-type/my-consumer/rule/disable",
            "alerting:alert-type/my-consumer/rule/bulkEnable",
            "alerting:alert-type/my-consumer/rule/bulkDisable",
          ]
        `);
      });

      test('grants `manage_rule_settings` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              manage_rule_settings: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/createGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/updateGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/deleteGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/scheduleBackfill",
          ]
        `);
      });

      test('grants `mute_alerts` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [],
              mute_alerts: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
          ]
        `);
      });

      test('grants `all` privileges to rules under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [],
            },
          },

          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
          ]
        `);
      });

      test('grants `all` privileges to alerts under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            alert: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/alert/get",
            "alerting:alert-type/my-consumer/alert/find",
            "alerting:alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:alert-type/my-consumer/alert/getAlertSummary",
            "alerting:alert-type/my-consumer/alert/update",
          ]
        `);
      });

      test('grants `all` privileges to rules and alerts under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [],
            },
            alert: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
            "alerting:alert-type/my-consumer/alert/get",
            "alerting:alert-type/my-consumer/alert/find",
            "alerting:alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:alert-type/my-consumer/alert/getAlertSummary",
            "alerting:alert-type/my-consumer/alert/update",
          ]
        `);
      });

      test('grants both `all` and `read` to rules privileges under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
            "alerting:readonly-alert-type/my-consumer/rule/get",
            "alerting:readonly-alert-type/my-consumer/rule/bulkGet",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleState",
            "alerting:readonly-alert-type/my-consumer/rule/getAlertSummary",
            "alerting:readonly-alert-type/my-consumer/rule/getExecutionLog",
            "alerting:readonly-alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:readonly-alert-type/my-consumer/rule/find",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type/my-consumer/rule/getBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findGaps",
            "alerting:readonly-alert-type/my-consumer/rule/bulkEditParams",
            "alerting:readonly-alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type/my-consumer/rule/getHistory",
          ]
        `);
      });

      test('grants all possible privileges to rules privileges under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
          },
          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
            "alerting:readonly-alert-type/my-consumer/rule/get",
            "alerting:readonly-alert-type/my-consumer/rule/bulkGet",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleState",
            "alerting:readonly-alert-type/my-consumer/rule/getAlertSummary",
            "alerting:readonly-alert-type/my-consumer/rule/getExecutionLog",
            "alerting:readonly-alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:readonly-alert-type/my-consumer/rule/find",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type/my-consumer/rule/getBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findGaps",
            "alerting:readonly-alert-type/my-consumer/rule/bulkEditParams",
            "alerting:readonly-alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type/my-consumer/rule/getHistory",
          ]
        `);
      });

      test('grants both `all` and `read` to alerts privileges under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            alert: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
          },

          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/alert/get",
            "alerting:alert-type/my-consumer/alert/find",
            "alerting:alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:alert-type/my-consumer/alert/getAlertSummary",
            "alerting:alert-type/my-consumer/alert/update",
            "alerting:readonly-alert-type/my-consumer/alert/get",
            "alerting:readonly-alert-type/my-consumer/alert/find",
            "alerting:readonly-alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-alert-type/my-consumer/alert/getAlertSummary",
          ]
        `);
      });

      test('grants both `all` and `read` to rules and alerts privileges under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
            alert: {
              all: [{ ruleTypeId: 'another-alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
          },

          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
            "alerting:readonly-alert-type/my-consumer/rule/get",
            "alerting:readonly-alert-type/my-consumer/rule/bulkGet",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleState",
            "alerting:readonly-alert-type/my-consumer/rule/getAlertSummary",
            "alerting:readonly-alert-type/my-consumer/rule/getExecutionLog",
            "alerting:readonly-alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:readonly-alert-type/my-consumer/rule/find",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type/my-consumer/rule/getBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findGaps",
            "alerting:readonly-alert-type/my-consumer/rule/bulkEditParams",
            "alerting:readonly-alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type/my-consumer/rule/getHistory",
            "alerting:another-alert-type/my-consumer/alert/get",
            "alerting:another-alert-type/my-consumer/alert/find",
            "alerting:another-alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type/my-consumer/alert/getAlertSummary",
            "alerting:another-alert-type/my-consumer/alert/update",
            "alerting:readonly-alert-type/my-consumer/alert/get",
            "alerting:readonly-alert-type/my-consumer/alert/find",
            "alerting:readonly-alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-alert-type/my-consumer/alert/getAlertSummary",
          ]
        `);
      });

      test('grants all possible privileges to rules and alerts privileges under feature consumer', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [{ ruleTypeId: 'alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
            alert: {
              all: [{ ruleTypeId: 'another-alert-type', consumers: ['my-consumer'] }],
              read: [{ ruleTypeId: 'readonly-alert-type', consumers: ['my-consumer'] }],
            },
          },

          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type/my-consumer/rule/get",
            "alerting:alert-type/my-consumer/rule/bulkGet",
            "alerting:alert-type/my-consumer/rule/getRuleState",
            "alerting:alert-type/my-consumer/rule/getAlertSummary",
            "alerting:alert-type/my-consumer/rule/getExecutionLog",
            "alerting:alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:alert-type/my-consumer/rule/find",
            "alerting:alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:alert-type/my-consumer/rule/getBackfill",
            "alerting:alert-type/my-consumer/rule/findBackfill",
            "alerting:alert-type/my-consumer/rule/findGaps",
            "alerting:alert-type/my-consumer/rule/bulkEditParams",
            "alerting:alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type/my-consumer/rule/getHistory",
            "alerting:alert-type/my-consumer/rule/create",
            "alerting:alert-type/my-consumer/rule/delete",
            "alerting:alert-type/my-consumer/rule/update",
            "alerting:alert-type/my-consumer/rule/updateApiKey",
            "alerting:alert-type/my-consumer/rule/muteAll",
            "alerting:alert-type/my-consumer/rule/unmuteAll",
            "alerting:alert-type/my-consumer/rule/muteAlert",
            "alerting:alert-type/my-consumer/rule/unmuteAlert",
            "alerting:alert-type/my-consumer/rule/snooze",
            "alerting:alert-type/my-consumer/rule/bulkEdit",
            "alerting:alert-type/my-consumer/rule/bulkDelete",
            "alerting:alert-type/my-consumer/rule/unsnooze",
            "alerting:alert-type/my-consumer/rule/runSoon",
            "alerting:readonly-alert-type/my-consumer/rule/get",
            "alerting:readonly-alert-type/my-consumer/rule/bulkGet",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleState",
            "alerting:readonly-alert-type/my-consumer/rule/getAlertSummary",
            "alerting:readonly-alert-type/my-consumer/rule/getExecutionLog",
            "alerting:readonly-alert-type/my-consumer/rule/getActionErrorLog",
            "alerting:readonly-alert-type/my-consumer/rule/find",
            "alerting:readonly-alert-type/my-consumer/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type/my-consumer/rule/getBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findBackfill",
            "alerting:readonly-alert-type/my-consumer/rule/findGaps",
            "alerting:readonly-alert-type/my-consumer/rule/bulkEditParams",
            "alerting:readonly-alert-type/my-consumer/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type/my-consumer/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type/my-consumer/rule/getHistory",
            "alerting:another-alert-type/my-consumer/alert/get",
            "alerting:another-alert-type/my-consumer/alert/find",
            "alerting:another-alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type/my-consumer/alert/getAlertSummary",
            "alerting:another-alert-type/my-consumer/alert/update",
            "alerting:readonly-alert-type/my-consumer/alert/get",
            "alerting:readonly-alert-type/my-consumer/alert/find",
            "alerting:readonly-alert-type/my-consumer/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-alert-type/my-consumer/alert/getAlertSummary",
          ]
        `);
      });

      test('handles multiple rule types and consumers correctly', () => {
        const actions = new Actions();
        const alertingFeaturePrivileges = new FeaturePrivilegeAlertingBuilder(actions);

        const privilege: FeatureKibanaPrivileges = {
          alerting: {
            rule: {
              all: [
                { ruleTypeId: 'alert-type-1', consumers: ['my-consumer-1', 'my-consumer-2'] },
                { ruleTypeId: 'alert-type-2', consumers: ['my-consumer-3'] },
              ],
              read: [
                {
                  ruleTypeId: 'readonly-alert-type-1',
                  consumers: ['my-read-consumer-1', 'my-read-consumer-2'],
                },
                {
                  ruleTypeId: 'readonly-alert-type-2',
                  consumers: ['my-read-consumer-3', 'my-read-consumer-4'],
                },
              ],
            },
            alert: {
              all: [
                {
                  ruleTypeId: 'another-alert-type-1',
                  consumers: ['my-consumer-another-1', 'my-consumer-another-2'],
                },
                {
                  ruleTypeId: 'another-alert-type-2',
                  consumers: ['my-consumer-another-3', 'my-consumer-another-1'],
                },
              ],
              read: [
                {
                  ruleTypeId: 'readonly-another-alert-type-1',
                  consumers: ['my-read-other-consumer-1', 'my-read-other-consumer-2'],
                },
                {
                  ruleTypeId: 'readonly-another-alert-type-2',
                  consumers: ['my-read-other-consumer-3', 'my-read-other-consumer-4'],
                },
              ],
            },
          },

          savedObject: {
            all: [],
            read: [],
          },
          ui: [],
        };

        const feature = new KibanaFeature({
          id: 'my-feature',
          name: 'my-feature',
          app: [],
          category: { id: 'foo', label: 'foo' },
          privileges: {
            all: privilege,
            read: privilege,
          },
        });

        expect(alertingFeaturePrivileges.getActions(privilege, feature)).toMatchInlineSnapshot(`
          Array [
            "alerting:alert-type-1/my-consumer-1/rule/get",
            "alerting:alert-type-1/my-consumer-1/rule/bulkGet",
            "alerting:alert-type-1/my-consumer-1/rule/getRuleState",
            "alerting:alert-type-1/my-consumer-1/rule/getAlertSummary",
            "alerting:alert-type-1/my-consumer-1/rule/getExecutionLog",
            "alerting:alert-type-1/my-consumer-1/rule/getActionErrorLog",
            "alerting:alert-type-1/my-consumer-1/rule/find",
            "alerting:alert-type-1/my-consumer-1/rule/getRuleExecutionKPI",
            "alerting:alert-type-1/my-consumer-1/rule/getBackfill",
            "alerting:alert-type-1/my-consumer-1/rule/findBackfill",
            "alerting:alert-type-1/my-consumer-1/rule/findGaps",
            "alerting:alert-type-1/my-consumer-1/rule/bulkEditParams",
            "alerting:alert-type-1/my-consumer-1/rule/getGapAutoFillScheduler",
            "alerting:alert-type-1/my-consumer-1/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type-1/my-consumer-1/rule/getHistory",
            "alerting:alert-type-1/my-consumer-1/rule/create",
            "alerting:alert-type-1/my-consumer-1/rule/delete",
            "alerting:alert-type-1/my-consumer-1/rule/update",
            "alerting:alert-type-1/my-consumer-1/rule/updateApiKey",
            "alerting:alert-type-1/my-consumer-1/rule/muteAll",
            "alerting:alert-type-1/my-consumer-1/rule/unmuteAll",
            "alerting:alert-type-1/my-consumer-1/rule/muteAlert",
            "alerting:alert-type-1/my-consumer-1/rule/unmuteAlert",
            "alerting:alert-type-1/my-consumer-1/rule/snooze",
            "alerting:alert-type-1/my-consumer-1/rule/bulkEdit",
            "alerting:alert-type-1/my-consumer-1/rule/bulkDelete",
            "alerting:alert-type-1/my-consumer-1/rule/unsnooze",
            "alerting:alert-type-1/my-consumer-1/rule/runSoon",
            "alerting:alert-type-1/my-consumer-2/rule/get",
            "alerting:alert-type-1/my-consumer-2/rule/bulkGet",
            "alerting:alert-type-1/my-consumer-2/rule/getRuleState",
            "alerting:alert-type-1/my-consumer-2/rule/getAlertSummary",
            "alerting:alert-type-1/my-consumer-2/rule/getExecutionLog",
            "alerting:alert-type-1/my-consumer-2/rule/getActionErrorLog",
            "alerting:alert-type-1/my-consumer-2/rule/find",
            "alerting:alert-type-1/my-consumer-2/rule/getRuleExecutionKPI",
            "alerting:alert-type-1/my-consumer-2/rule/getBackfill",
            "alerting:alert-type-1/my-consumer-2/rule/findBackfill",
            "alerting:alert-type-1/my-consumer-2/rule/findGaps",
            "alerting:alert-type-1/my-consumer-2/rule/bulkEditParams",
            "alerting:alert-type-1/my-consumer-2/rule/getGapAutoFillScheduler",
            "alerting:alert-type-1/my-consumer-2/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type-1/my-consumer-2/rule/getHistory",
            "alerting:alert-type-1/my-consumer-2/rule/create",
            "alerting:alert-type-1/my-consumer-2/rule/delete",
            "alerting:alert-type-1/my-consumer-2/rule/update",
            "alerting:alert-type-1/my-consumer-2/rule/updateApiKey",
            "alerting:alert-type-1/my-consumer-2/rule/muteAll",
            "alerting:alert-type-1/my-consumer-2/rule/unmuteAll",
            "alerting:alert-type-1/my-consumer-2/rule/muteAlert",
            "alerting:alert-type-1/my-consumer-2/rule/unmuteAlert",
            "alerting:alert-type-1/my-consumer-2/rule/snooze",
            "alerting:alert-type-1/my-consumer-2/rule/bulkEdit",
            "alerting:alert-type-1/my-consumer-2/rule/bulkDelete",
            "alerting:alert-type-1/my-consumer-2/rule/unsnooze",
            "alerting:alert-type-1/my-consumer-2/rule/runSoon",
            "alerting:alert-type-2/my-consumer-3/rule/get",
            "alerting:alert-type-2/my-consumer-3/rule/bulkGet",
            "alerting:alert-type-2/my-consumer-3/rule/getRuleState",
            "alerting:alert-type-2/my-consumer-3/rule/getAlertSummary",
            "alerting:alert-type-2/my-consumer-3/rule/getExecutionLog",
            "alerting:alert-type-2/my-consumer-3/rule/getActionErrorLog",
            "alerting:alert-type-2/my-consumer-3/rule/find",
            "alerting:alert-type-2/my-consumer-3/rule/getRuleExecutionKPI",
            "alerting:alert-type-2/my-consumer-3/rule/getBackfill",
            "alerting:alert-type-2/my-consumer-3/rule/findBackfill",
            "alerting:alert-type-2/my-consumer-3/rule/findGaps",
            "alerting:alert-type-2/my-consumer-3/rule/bulkEditParams",
            "alerting:alert-type-2/my-consumer-3/rule/getGapAutoFillScheduler",
            "alerting:alert-type-2/my-consumer-3/rule/findGapAutoFillSchedulerLogs",
            "alerting:alert-type-2/my-consumer-3/rule/getHistory",
            "alerting:alert-type-2/my-consumer-3/rule/create",
            "alerting:alert-type-2/my-consumer-3/rule/delete",
            "alerting:alert-type-2/my-consumer-3/rule/update",
            "alerting:alert-type-2/my-consumer-3/rule/updateApiKey",
            "alerting:alert-type-2/my-consumer-3/rule/muteAll",
            "alerting:alert-type-2/my-consumer-3/rule/unmuteAll",
            "alerting:alert-type-2/my-consumer-3/rule/muteAlert",
            "alerting:alert-type-2/my-consumer-3/rule/unmuteAlert",
            "alerting:alert-type-2/my-consumer-3/rule/snooze",
            "alerting:alert-type-2/my-consumer-3/rule/bulkEdit",
            "alerting:alert-type-2/my-consumer-3/rule/bulkDelete",
            "alerting:alert-type-2/my-consumer-3/rule/unsnooze",
            "alerting:alert-type-2/my-consumer-3/rule/runSoon",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/get",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/bulkGet",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getRuleState",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getAlertSummary",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getExecutionLog",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getActionErrorLog",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/find",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getBackfill",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/findBackfill",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/findGaps",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/bulkEditParams",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type-1/my-read-consumer-1/rule/getHistory",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/get",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/bulkGet",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getRuleState",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getAlertSummary",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getExecutionLog",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getActionErrorLog",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/find",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getBackfill",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/findBackfill",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/findGaps",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/bulkEditParams",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type-1/my-read-consumer-2/rule/getHistory",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/get",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/bulkGet",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getRuleState",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getAlertSummary",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getExecutionLog",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getActionErrorLog",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/find",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getBackfill",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/findBackfill",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/findGaps",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/bulkEditParams",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type-2/my-read-consumer-3/rule/getHistory",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/get",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/bulkGet",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getRuleState",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getAlertSummary",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getExecutionLog",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getActionErrorLog",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/find",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getRuleExecutionKPI",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getBackfill",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/findBackfill",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/findGaps",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/bulkEditParams",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getGapAutoFillScheduler",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/findGapAutoFillSchedulerLogs",
            "alerting:readonly-alert-type-2/my-read-consumer-4/rule/getHistory",
            "alerting:another-alert-type-1/my-consumer-another-1/alert/get",
            "alerting:another-alert-type-1/my-consumer-another-1/alert/find",
            "alerting:another-alert-type-1/my-consumer-another-1/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type-1/my-consumer-another-1/alert/getAlertSummary",
            "alerting:another-alert-type-1/my-consumer-another-1/alert/update",
            "alerting:another-alert-type-1/my-consumer-another-2/alert/get",
            "alerting:another-alert-type-1/my-consumer-another-2/alert/find",
            "alerting:another-alert-type-1/my-consumer-another-2/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type-1/my-consumer-another-2/alert/getAlertSummary",
            "alerting:another-alert-type-1/my-consumer-another-2/alert/update",
            "alerting:another-alert-type-2/my-consumer-another-3/alert/get",
            "alerting:another-alert-type-2/my-consumer-another-3/alert/find",
            "alerting:another-alert-type-2/my-consumer-another-3/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type-2/my-consumer-another-3/alert/getAlertSummary",
            "alerting:another-alert-type-2/my-consumer-another-3/alert/update",
            "alerting:another-alert-type-2/my-consumer-another-1/alert/get",
            "alerting:another-alert-type-2/my-consumer-another-1/alert/find",
            "alerting:another-alert-type-2/my-consumer-another-1/alert/getAuthorizedAlertsIndices",
            "alerting:another-alert-type-2/my-consumer-another-1/alert/getAlertSummary",
            "alerting:another-alert-type-2/my-consumer-another-1/alert/update",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-1/alert/get",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-1/alert/find",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-1/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-1/alert/getAlertSummary",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-2/alert/get",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-2/alert/find",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-2/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-another-alert-type-1/my-read-other-consumer-2/alert/getAlertSummary",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-3/alert/get",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-3/alert/find",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-3/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-3/alert/getAlertSummary",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-4/alert/get",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-4/alert/find",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-4/alert/getAuthorizedAlertsIndices",
            "alerting:readonly-another-alert-type-2/my-read-other-consumer-4/alert/getAlertSummary",
          ]
        `);
      });
    });
  });
});
