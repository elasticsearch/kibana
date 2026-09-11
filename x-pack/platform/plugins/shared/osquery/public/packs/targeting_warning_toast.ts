/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { NotificationsStart } from '@kbn/core/public';

interface TargetingWarning {
  untargeted_agent_policy_names?: string[];
}

/**
 * Surfaces the server's post-save `targeting_warning`. The pre-save callout in
 * the pack form warns about the same over-delivery, but only the server sees the
 * set actually written — including drift repaired at save time — so this is the
 * authoritative confirmation of where the pack really landed.
 */
export const showTargetingWarningToast = (
  toasts: NotificationsStart['toasts'],
  targetingWarning: TargetingWarning | undefined
) => {
  const names = targetingWarning?.untargeted_agent_policy_names ?? [];
  if (!names.length) return;

  toasts.addWarning({
    title: i18n.translate('xpack.osquery.pack.targetingWarningToast.title', {
      defaultMessage: 'This pack also runs on other agent policies',
    }),
    text: i18n.translate('xpack.osquery.pack.targetingWarningToast.text', {
      defaultMessage:
        'The Osquery Manager integration is shared, so this pack also runs on: {names}. To limit it to the policies you selected, give each agent policy its own Osquery Manager integration policy in Fleet.',
      values: { names: names.join(', ') },
    }),
  });
};
