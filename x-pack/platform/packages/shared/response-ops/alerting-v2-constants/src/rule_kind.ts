/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

type RuleKind = 'alert' | 'signal';

/** EUI icon names for Alerting V2 rule kind badges. */
export const RULE_KIND_ICONS = {
  alert: 'bell',
  signal: 'radar',
} as const satisfies Record<RuleKind, string>;

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  alert: i18n.translate('xpack.alertingV2.ruleKind.alert.label', {
    defaultMessage: 'Alert',
  }),
  signal: i18n.translate('xpack.alertingV2.ruleKind.signal.label', {
    defaultMessage: 'Signal',
  }),
};

export const RULE_KIND_TOOLTIPS: Record<RuleKind, string> = {
  alert: i18n.translate('xpack.alertingV2.ruleKind.alert.tooltip', {
    defaultMessage:
      'Tracks a problem across state changes and can notify your team or trigger automated actions when the state changes.',
  }),
  signal: i18n.translate('xpack.alertingV2.ruleKind.signal.tooltip', {
    defaultMessage:
      'Records each match as a data point without lifecycle tracking or notifications.',
  }),
};
