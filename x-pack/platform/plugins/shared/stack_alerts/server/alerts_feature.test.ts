/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { STACK_ALERTS_ONLY_FEATURE } from './alerts_feature';

describe('Stack Alerts Only Feature Privileges', () => {
  const allPrivilege = STACK_ALERTS_ONLY_FEATURE.privileges?.all;
  const readPrivilege = STACK_ALERTS_ONLY_FEATURE.privileges?.read;

  test('feature ID is stackAlertsOnly', () => {
    expect(STACK_ALERTS_ONLY_FEATURE.id).toBe('stackAlertsOnly');
  });

  test('"all" privilege grants alert.all for all stack rule types', () => {
    expect(allPrivilege?.alerting?.alert?.all).toMatchInlineSnapshot(`
      Array [
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".index-threshold",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".geo-containment",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": "transform_health",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
            "discover",
          ],
          "ruleTypeId": ".es-query",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "xpack.ml.anomaly_detection_alert",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "observability.rules.custom_threshold",
        },
      ]
    `);
  });

  test('"all" privilege grants rule.mute_alerts for all stack rule types', () => {
    expect(allPrivilege?.alerting?.rule?.mute_alerts).toMatchInlineSnapshot(`
      Array [
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".index-threshold",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".geo-containment",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": "transform_health",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
            "discover",
          ],
          "ruleTypeId": ".es-query",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "xpack.ml.anomaly_detection_alert",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "observability.rules.custom_threshold",
        },
      ]
    `);
  });

  test('"all" privilege does NOT grant rule.all, rule.enable, or rule.manage_rule_settings', () => {
    expect(allPrivilege?.alerting?.rule?.all).toBeUndefined();
    expect(allPrivilege?.alerting?.rule?.enable).toBeUndefined();
    expect(allPrivilege?.alerting?.rule?.manage_rule_settings).toBeUndefined();
  });

  test('"read" privilege grants alert.read for all stack rule types', () => {
    expect(readPrivilege?.alerting?.alert?.read).toMatchInlineSnapshot(`
      Array [
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".index-threshold",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": ".geo-containment",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
          ],
          "ruleTypeId": "transform_health",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
            "alerts",
            "discover",
          ],
          "ruleTypeId": ".es-query",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "xpack.ml.anomaly_detection_alert",
        },
        Object {
          "consumers": Array [
            "stackAlerts",
          ],
          "ruleTypeId": "observability.rules.custom_threshold",
        },
      ]
    `);
  });

  test('"read" privilege does NOT grant any rule privileges', () => {
    expect(readPrivilege?.alerting?.rule).toBeUndefined();
  });

  test('both privileges include rac API access', () => {
    expect(allPrivilege?.api).toContain('rac');
    expect(readPrivilege?.api).toContain('rac');
  });

  test('both privileges grant access to triggers/actions management', () => {
    expect(allPrivilege?.management?.insightsAndAlerting).toContain('triggersActions');
    expect(readPrivilege?.management?.insightsAndAlerting).toContain('triggersActions');
  });
});
