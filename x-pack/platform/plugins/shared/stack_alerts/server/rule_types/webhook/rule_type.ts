/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import axios from 'axios';

import { DEFAULT_APP_CATEGORIES } from '@kbn/core/server';
import { schema, TypeOf } from '@kbn/config-schema';
import { STACK_ALERTS_FEATURE_ID } from '@kbn/rule-data-utils';
import { AlertsClientError } from '@kbn/alerting-plugin/server';
import { AlertInstanceContext } from '@kbn/alerting-plugin/server';

import { STACK_ALERTS_AAD_CONFIG } from '..';
import { RuleType, RuleExecutorOptions } from '../../types';
import { StackAlertType } from '../types';

type JSONable = ReturnType<typeof JSON.parse> | null;

// rule type context provided to actions
export interface ActionContext extends AlertInstanceContext {
  nothing: JSONable;
}

const StringML1 = schema.string({ minLength: 1 });

type Params = TypeOf<typeof Params>;
const Params = schema.object({
  url: StringML1,
  method: StringML1,
  headers: schema.recordOf(StringML1, StringML1),
  body: StringML1,
});

type AlertData = TypeOf<typeof AlertData>;
const AlertData = schema.object({
  alerts: schema.arrayOf(
    schema.object({
      instanceId: StringML1,
      actionGroup: StringML1,
      context: schema.any(),
    })
  ),
});

export const ID = '.webhook';
export const NAME = 'Webhook';
export const ActionGroupId = 'alert';
export const ActionGroupName = 'Alert';

type ActionGroupIdType = typeof ActionGroupId;

export function getRuleType(): RuleType<
  Params,
  never,
  {},
  {},
  ActionContext,
  typeof ActionGroupId,
  never,
  StackAlertType
> {
  return {
    id: ID,
    name: NAME,
    actionGroups: [{ id: ActionGroupId, name: ActionGroupName }],
    defaultActionGroupId: ActionGroupId,
    validate: {
      params: Params,
    },
    schemas: {
      params: {
        type: 'config-schema',
        schema: Params,
      },
    },
    actionVariables: {
      context: [],
      params: [
        { name: 'url', description: 'url' },
        { name: 'method', description: 'method' },
        { name: 'body', description: 'body' },
        { name: 'headers', description: 'headers' },
      ],
    },
    minimumLicenseRequired: 'basic',
    isExportable: true,
    executor,
    category: DEFAULT_APP_CATEGORIES.management.id,
    producer: STACK_ALERTS_FEATURE_ID,
    doesSetRecoveryContext: false,
    alerts: STACK_ALERTS_AAD_CONFIG,
  };

  async function executor(
    options: RuleExecutorOptions<
      Params,
      {},
      {},
      ActionContext,
      typeof ActionGroupId,
      StackAlertType
    >
  ) {
    const {
      rule: { id: ruleId, name: ruleName },
      services,
      params,
      logger,
      executionId,
      state,
    } = options;
    const { alertsClient } = services;
    if (!alertsClient) {
      throw new AlertsClientError();
    }
    const { url, method, headers, body } = params;
    const ruleData = {
      ruleId,
      ruleName,
      executionId,
      body,
      state,
    };

    const axiosInstance = axios.create();
    const rawResponse = await axiosInstance.request({
      url,
      method,
      data: ruleData,
      headers,
      validateStatus: null,
    });

    const { status, data } = rawResponse;
    if (status !== 200) {
      throw new Error(`webhook returned status ${status}: ${JSON.stringify(data)}`);
    }

    let response: AlertData;
    try {
      response = AlertData.validate(data);
    } catch (err) {
      const message = `webhook returned invalid data: ${err.message}`;
      logger.error(`${message}: "${JSON.stringify(data)}"`);
      throw new Error(message);
    }

    for (const alertData of response.alerts) {
      const { instanceId: id, actionGroup: actionGroupUntyped, context } = alertData;
      const actionGroup = actionGroupUntyped as ActionGroupIdType;
      alertsClient.report({
        id,
        actionGroup,
        context,
      });
    }

    return { state: {} };
  }
}
