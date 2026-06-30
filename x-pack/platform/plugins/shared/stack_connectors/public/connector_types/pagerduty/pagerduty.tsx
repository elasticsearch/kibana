/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { lazy } from 'react';
import { i18n } from '@kbn/i18n';
import moment from 'moment';
import type {
  ActionTypeModel as ConnectorTypeModel,
  GenericValidationResult,
} from '@kbn/triggers-actions-ui-plugin/public';
import { AlertProvidedActionVariables } from '@kbn/triggers-actions-ui-plugin/public';
import { isPlainObject } from 'lodash';
import { CONNECTOR_ID } from '@kbn/connector-schemas/pagerduty/constants';
import type { PagerDutyConfig, PagerDutySecrets, PagerDutyActionParams } from '../types';
import { EventActionOptions } from '../types';
import { hasMustacheTokens } from './has_mustache_tokens';

export function getConnectorType(): ConnectorTypeModel<
  PagerDutyConfig,
  PagerDutySecrets,
  PagerDutyActionParams
> {
  return {
    id: CONNECTOR_ID,
    iconClass: lazy(() => import('./logo')),
    selectMessage: i18n.translate('xpack.stackConnectors.components.pagerDuty.selectMessageText', {
      defaultMessage: 'Send an event in PagerDuty.',
    }),
    actionTypeTitle: i18n.translate(
      'xpack.stackConnectors.components.pagerDuty.connectorTypeTitle',
      {
        defaultMessage: 'Send to PagerDuty',
      }
    ),
    validateParams: async (
      actionParams: PagerDutyActionParams
    ): Promise<
      GenericValidationResult<Pick<PagerDutyActionParams, 'summary' | 'timestamp' | 'dedupKey'>>
    > => {
      const translations = await import('./translations');
      const errors = {
        summary: new Array<string>(),
        timestamp: new Array<string>(),
        dedupKey: new Array<string>(),
        links: new Array<string>(),
        customDetails: new Array<string>(),
      };
      const validationResult = { errors };
      if (
        !actionParams.dedupKey?.length &&
        (actionParams.eventAction === 'resolve' || actionParams.eventAction === 'acknowledge')
      ) {
        errors.dedupKey.push(translations.DEDUP_KEY_REQUIRED);
      }
      if (
        actionParams.eventAction === EventActionOptions.TRIGGER &&
        !actionParams.summary?.length
      ) {
        errors.summary.push(translations.SUMMARY_REQUIRED);
      }
      if (actionParams.timestamp && !hasMustacheTokens(actionParams.timestamp)) {
        if (!moment(actionParams.timestamp).isValid()) {
          const { nowShortFormat, nowLongFormat } = getValidTimestampExamples();
          errors.timestamp.push(
            i18n.translate('xpack.stackConnectors.components.pagerDuty.error.invalidTimestamp', {
              defaultMessage:
                'Timestamp must be a valid date, such as {nowShortFormat} or {nowLongFormat}.',
              values: {
                nowShortFormat,
                nowLongFormat,
              },
            })
          );
        }
      }
      if (Array.isArray(actionParams.links)) {
        actionParams.links.forEach(({ href, text }) => {
          if ((!href || !text) && errors.links.length === 0) {
            errors.links.push(
              i18n.translate('xpack.stackConnectors.components.pagerDuty.error.invalidLink', {
                defaultMessage: 'Link properties cannot be empty.',
              })
            );
          }
        });
      }
      if (actionParams.customDetails?.length) {
        const errorMessage = i18n.translate(
          'xpack.stackConnectors.components.pagerDuty.error.invalidCustomDetails',
          {
            defaultMessage: 'Custom details must be a valid JSON object.',
          }
        );

        try {
          const parsedJSON = JSON.parse(actionParams.customDetails);

          if (!isPlainObject(parsedJSON)) {
            errors.customDetails.push(errorMessage);
          }
        } catch {
          errors.customDetails.push(errorMessage);
        }
      }
      return validationResult;
    },
    actionConnectorFields: lazy(() => import('./pagerduty_connectors')),
    actionParamsFields: lazy(() => import('./pagerduty_params')),
    defaultActionParams: {
      dedupKey: `{{${AlertProvidedActionVariables.ruleId}}}:{{${AlertProvidedActionVariables.alertUuid}}}`,
      eventAction: EventActionOptions.TRIGGER,
    },
    defaultRecoveredActionParams: {
      dedupKey: `{{${AlertProvidedActionVariables.ruleId}}}:{{${AlertProvidedActionVariables.alertUuid}}}`,
      eventAction: EventActionOptions.RESOLVE,
    },
  };
}

function getValidTimestampExamples() {
  const now = moment();
  return {
    nowShortFormat: now.format('YYYY-MM-DD'),
    nowLongFormat: now.format('YYYY-MM-DD h:mm:ss'),
  };
}
