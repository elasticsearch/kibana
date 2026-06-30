/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ES_TEST_INDEX_NAME } from '@kbn/alerting-api-integration-helpers';
import type { AlertsFilter } from '@kbn/alerting-plugin/common/rule';
import type { SupertestWithoutAuthProviderType } from '@kbn/ftr-common-functional-services';
import type { SnoozeBody } from '@kbn/alerting-plugin/common/routes/rule/apis/snooze';
import type { Space, User } from '../types';
import type { ObjectRemover } from './object_remover';
import { getUrlPrefix } from './space_test_utils';
import { getTestRuleData } from './get_test_rule_data';

export interface AlertUtilsOpts {
  user?: User;
  space: Space;
  supertestWithoutAuth: SupertestWithoutAuthProviderType;
  indexRecordActionId?: string;
  objectRemover?: ObjectRemover;
}

export interface CreateAlertWithActionOpts {
  indexRecordActionId?: string;
  objectRemover?: ObjectRemover;
  overwrites?: Record<string, any>;
  reference: string;
  notifyWhen?: string;
  summary?: boolean;
  throttle?: string | null;
  alertsFilter?: AlertsFilter;
  messageTemplate?: string;
}
export interface CreateNoopAlertOpts {
  objectRemover?: ObjectRemover;
  overwrites?: Record<string, any>;
}

interface UpdateAlwaysFiringAction {
  alertId: string;
  actionId: string | undefined;
  reference: string;
  user: User;
  overwrites: Record<string, any>;
}

const SNOOZE_SCHEDULE = {
  rRule: {
    dtstart: '2021-03-07T00:00:00.000Z',
    tzid: 'UTC',
    count: 1,
  },
  duration: 864000000,
};

const snoozeSchedule: SnoozeBody = {
  schedule: {
    custom: {
      duration: '15m',
      start: '2021-03-07T00:00:00.000Z',
    },
  },
};

export class AlertUtils {
  private referenceCounter = 1;
  private readonly user?: User;
  private readonly space: Space;
  private readonly supertestWithoutAuth: SupertestWithoutAuthProviderType;
  private readonly indexRecordActionId?: string;
  private readonly objectRemover?: ObjectRemover;

  constructor({
    indexRecordActionId,
    objectRemover,
    space,
    supertestWithoutAuth,
    user,
  }: AlertUtilsOpts) {
    this.user = user;
    this.space = space;
    this.objectRemover = objectRemover;
    this.indexRecordActionId = indexRecordActionId;
    this.supertestWithoutAuth = supertestWithoutAuth;
  }

  public generateReference() {
    return ['alert-utils-ref', this.referenceCounter++, this.user ? this.user.username : ''].join(
      ':'
    );
  }

  public getEnableRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/_enable`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getAPIKeyRequest(ruleId: string) {
    const request = this.supertestWithoutAuth.get(
      `${getUrlPrefix(this.space.id)}/api/alerts_fixture/rule/${ruleId}/_get_api_key`
    );
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getDisableRequest(alertId: string, untrack?: boolean) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/_disable`)
      .set('kbn-xsrf', 'foo')
      .send({
        untrack: untrack === undefined ? true : untrack,
      });
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getSnoozeInternalRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/internal/alerting/rule/${alertId}/_snooze`)
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json')
      .send({
        snooze_schedule: SNOOZE_SCHEDULE,
      });

    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getSnoozeRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/snooze_schedule`)
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json')
      .send(snoozeSchedule);

    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUnsnoozeInternalRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/internal/alerting/rule/${alertId}/_unsnooze`)
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json')
      .send({
        schedule_ids: [alertId],
      });
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUnsnoozeRequest(alertId: string, scheduleId: string) {
    const request = this.supertestWithoutAuth
      .delete(
        `${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/snooze_schedule/${scheduleId}`
      )
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getMuteAllRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/_mute_all`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUnmuteAllRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/_unmute_all`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getMuteInstanceRequest(alertId: string, instanceId: string) {
    const request = this.supertestWithoutAuth
      .post(
        `${getUrlPrefix(
          this.space.id
        )}/api/alerting/rule/${alertId}/alert/${instanceId}/_mute?validate_alerts_existence=false`
      )
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUnmuteInstanceRequest(alertId: string, instanceId: string) {
    const request = this.supertestWithoutAuth
      .post(
        `${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/alert/${instanceId}/_unmute`
      )
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getSnoozeInstanceRequest(
    alertId: string,
    instanceId: string,
    body: { expires_at?: string; conditions?: unknown[]; condition_operator?: string }
  ) {
    const request = this.supertestWithoutAuth
      .post(
        `${getUrlPrefix(
          this.space.id
        )}/api/alerting/rule/${alertId}/alert/${instanceId}/_snooze?validate_alerts_existence=false`
      )
      .set('kbn-xsrf', 'foo')
      .send(body);
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUnsnoozeInstanceRequest(alertId: string, instanceId: string) {
    const request = this.supertestWithoutAuth
      .post(
        `${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/alert/${instanceId}/_unsnooze`
      )
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public getUpdateApiKeyRequest(alertId: string) {
    const request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}/_update_api_key`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      return request.auth(this.user.username, this.user.password);
    }
    return request;
  }

  public async enable(alertId: string) {
    await this.getEnableRequest(alertId).expect(204, '');
  }

  public async disable(alertId: string) {
    await this.getDisableRequest(alertId).expect(204, '');
  }

  public async muteAll(alertId: string) {
    await this.getMuteAllRequest(alertId).expect(204, '');
  }

  public async unmuteAll(alertId: string) {
    await this.getUnmuteAllRequest(alertId).expect(204, '');
  }

  public async muteInstance(alertId: string, instanceId: string) {
    await this.getMuteInstanceRequest(alertId, instanceId).expect(204, '');
  }

  public async unmuteInstance(alertId: string, instanceId: string) {
    await this.getUnmuteInstanceRequest(alertId, instanceId).expect(204, '');
  }

  public async updateApiKey(alertId: string) {
    await this.getUpdateApiKeyRequest(alertId).expect(204, '');
  }

  public async createAlwaysFiringAction({
    objectRemover,
    overwrites = {},
    indexRecordActionId,
    reference,
    notifyWhen,
    summary,
    throttle,
  }: CreateAlertWithActionOpts) {
    const objRemover = objectRemover || this.objectRemover;
    const actionId = indexRecordActionId || this.indexRecordActionId;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }
    if (!actionId) {
      throw new Error('indexRecordActionId is required ');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    let alertBody;
    if (summary !== undefined) {
      alertBody = getAlwaysFiringAlertWithThrottledActionData(
        reference,
        actionId,
        notifyWhen,
        throttle,
        summary
      );
    } else {
      alertBody = getDefaultAlwaysFiringAlertData(reference, actionId, notifyWhen);
    }

    const response = await request.send({ ...alertBody, ...overwrites });
    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }
    return response;
  }

  public async createAlwaysFiringRuleWithSummaryAction({
    objectRemover,
    overwrites = {},
    indexRecordActionId,
    reference,
    notifyWhen,
    throttle,
    alertsFilter,
    messageTemplate,
  }: CreateAlertWithActionOpts) {
    const objRemover = objectRemover || this.objectRemover;
    const actionId = indexRecordActionId || this.indexRecordActionId;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }
    if (!actionId) {
      throw new Error('indexRecordActionId is required ');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    const rule = getAlwaysFiringRuleWithSummaryAction(
      reference,
      actionId,
      notifyWhen,
      throttle,
      alertsFilter,
      messageTemplate
    );

    const response = await request.send({ ...rule, ...overwrites });
    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }
    return response;
  }

  public async createPatternFiringRuleWithSummaryAction({
    objectRemover,
    overwrites = {},
    indexRecordActionId,
    reference,
    notifyWhen,
    throttle,
    alertsFilter,
    messageTemplate,
    pattern,
  }: CreateAlertWithActionOpts & { pattern: object }) {
    const objRemover = objectRemover || this.objectRemover;
    const actionId = indexRecordActionId || this.indexRecordActionId;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }
    if (!actionId) {
      throw new Error('indexRecordActionId is required ');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    const rule = getPatternFiringRuleWithSummaryAction(
      reference,
      pattern,
      actionId,
      notifyWhen,
      throttle,
      alertsFilter,
      messageTemplate
    );

    const response = await request.send({ ...rule, ...overwrites });
    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }
    return response;
  }

  public async createAlwaysFiringSystemAction({
    objectRemover,
    overwrites = {},
    reference,
  }: CreateAlertWithActionOpts) {
    const objRemover = objectRemover || this.objectRemover;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }

    const rule = getAlwaysFiringRuleWithSystemAction(reference);

    const response = await request.send({ ...rule, ...overwrites });

    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }

    return response;
  }

  public async updateAlwaysFiringAction({
    alertId,
    actionId,
    reference,
    user,
    overwrites = {},
  }: UpdateAlwaysFiringAction) {
    actionId = actionId || this.indexRecordActionId;

    if (!actionId) {
      throw new Error('actionId is required ');
    }

    const request = this.supertestWithoutAuth
      .put(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${alertId}`)
      .set('kbn-xsrf', 'foo')
      .auth(user.username, user.password);

    const {
      rule_type_id: alertTypeId,
      enabled,
      consumer,
      ...alertBody
    } = getDefaultAlwaysFiringAlertData(reference, actionId);

    const response = await request.send({ ...alertBody, ...overwrites });
    return response;
  }

  public async createAlwaysFailingAction({
    objectRemover,
    overwrites = {},
    indexRecordActionId,
    reference,
  }: CreateAlertWithActionOpts) {
    const objRemover = objectRemover || this.objectRemover;
    const actionId = indexRecordActionId || this.indexRecordActionId;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }
    if (!actionId) {
      throw new Error('indexRecordActionId is required ');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    const response = await request.send({
      enabled: true,
      name: 'fail',
      schedule: { interval: '30s' },
      throttle: '30s',
      tags: [],
      rule_type_id: 'test.failing',
      consumer: 'alertsFixture',
      params: {
        index: ES_TEST_INDEX_NAME,
        reference,
      },
      notify_when: 'onActiveAlert',
      actions: [],
      ...overwrites,
    });
    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }
    return response;
  }

  public replaceApiKeys(id: string) {
    let request = this.supertestWithoutAuth
      .put(`/api/alerts_fixture/${id}/replace_api_key`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    return request.send({ spaceId: this.space.id });
  }

  public async createNoopAlert({ objectRemover, overwrites = {} }: CreateNoopAlertOpts) {
    const objRemover = objectRemover || this.objectRemover;

    if (!objRemover) {
      throw new Error('objectRemover is required');
    }

    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');
    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    const response = await request.send({
      ...getTestRuleData(),
      ...overwrites,
    });
    if (response.statusCode === 200) {
      objRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }
    return response;
  }

  public async runSoon(ruleId: string, options?: { force?: boolean }) {
    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/internal/alerting/rule/${ruleId}/_run_soon`)
      .set('kbn-xsrf', 'foo');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }
    if (options?.force) {
      request = request.query({ force: true });
    }
    return await request.send();
  }

  public async createInternallyManagedRule(objectRemover?: ObjectRemover) {
    let request = this.supertestWithoutAuth
      .post(`${getUrlPrefix(this.space.id)}/api/alerting/rule`)
      .set('kbn-xsrf', 'foo');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }

    const response = await request.send({
      ...getTestRuleData({
        name: 'test.internal-rule-type',
        rule_type_id: 'test.internal-rule-type',
      }),
    });

    if (response.statusCode === 200 && objectRemover) {
      objectRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }

    return response;
  }

  public async updateInternallyManagedRule(ruleId: string, objectRemover?: ObjectRemover) {
    let request = this.supertestWithoutAuth
      .put(`${getUrlPrefix(this.space.id)}/api/alerting/rule/${ruleId}`)
      .set('kbn-xsrf', 'foo');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }

    const response = await request.send({
      ...getTestRuleData({
        name: 'test.internal-rule-type-update',
      }),
    });

    if (response.statusCode === 200 && objectRemover) {
      objectRemover.add(this.space.id, response.body.id, 'rule', 'alerting');
    }

    return response;
  }

  public async deleteInternallyManagedRule(ruleId: string) {
    let request = this.supertestWithoutAuth
      .delete(`${getUrlPrefix(this.space.id)}/api/alerts_fixture/rule/internally_managed/${ruleId}`)
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }

    const response = await request.send();

    return response;
  }

  public async deleteAllInternallyManagedRules() {
    let request = this.supertestWithoutAuth
      .delete(`${getUrlPrefix(this.space.id)}/api/alerts_fixture/rule/internally_managed`)
      .set('kbn-xsrf', 'foo')
      .set('content-type', 'application/json');

    if (this.user) {
      request = request.auth(this.user.username, this.user.password);
    }

    const response = await request.send();

    return response;
  }
}

export function getUnauthorizedErrorMessage(operation: string, alertType: string, scope: string) {
  return `Unauthorized by "${scope}" to ${operation} "${alertType}" rule`;
}

function getDefaultAlwaysFiringAlertData(
  reference: string,
  actionId: string,
  notifyWhen = 'onActiveAlert'
) {
  const messageTemplate = `
ruleId: {{rule.id}},
ruleName: {{rule.name}},
spaceId: {{rule.spaceId}},
tags: {{rule.tags}},
alertId: {{alert.id}},
alertActionGroup: {{alert.actionGroup}},
instanceContextValue: {{context.instanceContextValue}},
instanceStateValue: {{state.instanceStateValue}}
`.trim();
  return {
    enabled: true,
    name: 'abc',
    schedule: { interval: '1m' },
    throttle: '1m',
    tags: ['tag-A', 'tag-B'],
    rule_type_id: 'test.always-firing',
    consumer: 'alertsFixture',
    params: {
      index: ES_TEST_INDEX_NAME,
      reference,
    },
    notify_when: notifyWhen,
    actions: [
      {
        group: 'default',
        id: actionId,
        params: {
          index: ES_TEST_INDEX_NAME,
          reference,
          message: messageTemplate,
        },
      },
    ],
  };
}

function getAlwaysFiringAlertWithThrottledActionData(
  reference: string,
  actionId: string,
  notifyWhen = 'onActiveAlert',
  throttle: string | null = '1m',
  summary = false
) {
  const messageTemplate = `
ruleId: {{rule.id}},
ruleName: {{rule.name}},
spaceId: {{rule.spaceId}},
tags: {{rule.tags}},
alertId: {{alert.id}},
alertActionGroup: {{alert.actionGroup}},
instanceContextValue: {{context.instanceContextValue}},
instanceStateValue: {{state.instanceStateValue}}
`.trim();
  return {
    enabled: true,
    name: 'abc',
    schedule: { interval: '1m' },
    tags: ['tag-A', 'tag-B'],
    rule_type_id: 'test.always-firing',
    consumer: 'alertsFixture',
    params: {
      index: ES_TEST_INDEX_NAME,
      reference,
    },
    actions: [
      {
        group: 'default',
        id: actionId,
        params: {
          index: ES_TEST_INDEX_NAME,
          reference,
          message: messageTemplate,
        },
        frequency: {
          summary,
          notify_when: notifyWhen,
          throttle,
        },
      },
    ],
  };
}

function getAlwaysFiringRuleWithSummaryAction(
  reference: string,
  actionId: string,
  notifyWhen = 'onActiveAlert',
  throttle: string | null = '1m',
  alertsFilter?: AlertsFilter,
  messageTemplate?: string
) {
  const message =
    messageTemplate ??
    `Alerts, ` +
      `all:{{alerts.all.count}}, ` +
      `new:{{alerts.new.count}} IDs:[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}], ` +
      `ongoing:{{alerts.ongoing.count}} IDs:[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}], ` +
      `recovered:{{alerts.recovered.count}} IDs:[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]`.trim();

  return {
    enabled: true,
    name: 'abc',
    schedule: { interval: '1m' },
    tags: ['tag-A', 'tag-B'],
    rule_type_id: 'test.always-firing-alert-as-data',
    consumer: 'alertsFixture',
    params: {
      index: ES_TEST_INDEX_NAME,
      reference,
    },
    actions: [
      {
        group: 'default',
        id: actionId,
        params: {
          index: ES_TEST_INDEX_NAME,
          reference,
          message,
        },
        frequency: {
          summary: true,
          notify_when: notifyWhen,
          throttle,
        },
        ...(alertsFilter && { alerts_filter: alertsFilter }),
      },
    ],
  };
}

function getPatternFiringRuleWithSummaryAction(
  reference: string,
  pattern: object,
  actionId: string,
  notifyWhen = 'onActiveAlert',
  throttle: string | null = null,
  alertsFilter?: AlertsFilter,
  messageTemplate?: string
) {
  const message =
    messageTemplate ??
    `Alerts, ` +
      `all:{{alerts.all.count}}, ` +
      `new:{{alerts.new.count}} IDs:[{{#alerts.new.data}}{{kibana.alert.instance.id}},{{/alerts.new.data}}], ` +
      `ongoing:{{alerts.ongoing.count}} IDs:[{{#alerts.ongoing.data}}{{kibana.alert.instance.id}},{{/alerts.ongoing.data}}], ` +
      `recovered:{{alerts.recovered.count}} IDs:[{{#alerts.recovered.data}}{{kibana.alert.instance.id}},{{/alerts.recovered.data}}]`.trim();

  return {
    enabled: true,
    name: 'pattern-firing-rule-aad',
    schedule: { interval: '1m' },
    tags: ['tag-A', 'tag-B'],
    rule_type_id: 'test.patternFiringAad',
    consumer: 'alertsFixture',
    params: {
      pattern,
    },
    actions: [
      {
        group: 'default',
        id: actionId,
        params: {
          index: ES_TEST_INDEX_NAME,
          reference,
          message,
        },
        frequency: {
          summary: true,
          notify_when: notifyWhen,
          throttle,
        },
        ...(alertsFilter && { alerts_filter: alertsFilter }),
      },
    ],
  };
}

function getAlwaysFiringRuleWithSystemAction(reference: string) {
  return {
    enabled: true,
    name: 'abc',
    schedule: { interval: '1m' },
    tags: ['tag-A', 'tag-B'],
    rule_type_id: 'test.always-firing-alert-as-data',
    consumer: 'alertsFixture',
    params: {
      index: ES_TEST_INDEX_NAME,
      reference,
    },
    actions: [
      {
        id: 'system-connector-test.system-action-connector-adapter',
        /**
         * The injected param required by the action will be set by the corresponding
         * connector adapter. Setting it here it will lead to a 400 error by the
         * rules API as only the connector adapter can set the injected property.
         *
         * Adapter: x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/connector_adapters.ts
         * Connector type: x-pack/platform/test/alerting_api_integration/common/plugins/alerts/server/action_types.ts
         */
        params: { myParam: 'param from rule action', index: ES_TEST_INDEX_NAME, reference },
      },
    ],
  };
}

export function getAlwaysFiringInternalRule() {
  return {
    enabled: true,
    name: 'Internal Rule',
    schedule: { interval: '1m' },
    tags: [],
    rule_type_id: 'test.internal-rule-type',
    consumer: 'alertsFixture',
    params: {},
  };
}
