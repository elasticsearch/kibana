/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { errorMessageHeader } from '@kbn/alerting-types';

const getCreateRuleErrorSummary = (name: string) => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.createSummary', {
    defaultMessage: `Rule ''{name}'' cannot be created. The maximum number of runs per minute would be exceeded.`,
    values: {
      name,
    },
  });
};

const getUpdateRuleErrorSummary = (name: string) => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.updateSummary', {
    defaultMessage: `Rule ''{name}'' cannot be updated. The maximum number of runs per minute would be exceeded.`,
    values: {
      name,
    },
  });
};

const getEnableRuleErrorSummary = (name: string) => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.enableSummary', {
    defaultMessage: `Rule ''{name}'' cannot be enabled. The maximum number of runs per minute would be exceeded.`,
    values: {
      name,
    },
  });
};

const getBulkEditRuleErrorSummary = () => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.bulkEditSummary', {
    defaultMessage: `Rules cannot be bulk edited. The maximum number of runs per minute would be exceeded.`,
  });
};

const getBulkEnableRuleErrorSummary = () => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.bulkEnableSummary', {
    defaultMessage: `Rules cannot be bulk enabled. The maximum number of runs per minute would be exceeded.`,
  });
};

const getBulkCreateRuleErrorSummary = () => {
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.bulkCreateSummary', {
    defaultMessage: `Rules cannot be bulk created. The maximum number of runs per minute would be exceeded.`,
  });
};

const getRuleCircuitBreakerErrorDetail = ({
  interval,
  intervalAvailable,
  rules,
}: {
  interval: number;
  intervalAvailable: number;
  rules: number;
}) => {
  if (rules === 1) {
    return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.ruleDetail', {
      defaultMessage: `The rule has {interval, plural, one {{interval} run} other {{interval} runs}} per minute; there {intervalAvailable, plural, one {is only {intervalAvailable} run} other {are only {intervalAvailable} runs}} per minute available. Before you can modify this rule, you must increase its check interval so that it runs less frequently. Alternatively, disable other rules or change their check intervals.`,
      values: {
        interval,
        intervalAvailable,
      },
    });
  }
  return i18n.translate('xpack.alerting.ruleCircuitBreaker.error.multipleRuleDetail', {
    defaultMessage: `The rules have {interval, plural, one {{interval} run} other {{interval} runs}} per minute; there {intervalAvailable, plural, one {is only {intervalAvailable} run} other {are only {intervalAvailable} runs}} per minute available. Before you can modify these rules, you must disable other rules or change their check intervals so they run less frequently.`,
    values: {
      interval,
      intervalAvailable,
    },
  });
};

export const getRuleCircuitBreakerErrorMessage = ({
  name = '',
  interval,
  intervalAvailable,
  action,
  rules = 1,
}: {
  name?: string;
  interval: number;
  intervalAvailable: number;
  action: 'update' | 'create' | 'enable' | 'bulkEdit' | 'bulkEnable' | 'bulkCreate';
  rules?: number;
}) => {
  let errorMessageSummary: string;

  switch (action) {
    case 'update':
      errorMessageSummary = getUpdateRuleErrorSummary(name);
      break;
    case 'create':
      errorMessageSummary = getCreateRuleErrorSummary(name);
      break;
    case 'enable':
      errorMessageSummary = getEnableRuleErrorSummary(name);
      break;
    case 'bulkEdit':
      errorMessageSummary = getBulkEditRuleErrorSummary();
      break;
    case 'bulkEnable':
      errorMessageSummary = getBulkEnableRuleErrorSummary();
      break;
    case 'bulkCreate':
      errorMessageSummary = getBulkCreateRuleErrorSummary();
      break;
  }

  return `Error validating circuit breaker - ${errorMessageSummary} - ${getRuleCircuitBreakerErrorDetail(
    {
      interval,
      intervalAvailable,
      rules,
    }
  )}`;
};

export const parseRuleCircuitBreakerErrorMessage = (
  message: string
): {
  summary: string;
  details?: string;
} => {
  if (!message.includes(errorMessageHeader)) {
    return {
      summary: message,
    };
  }
  const segments = message.split(' - ');
  return {
    summary: segments[1],
    details: segments[2],
  };
};
