/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';

export const BACK_TO_WORKFLOW = i18n.translate('workflows.changeHistory.backToWorkflow', {
  defaultMessage: 'Back to workflow',
});

export const CURRENT_VERSION_BADGE = (version: number): string =>
  i18n.translate('workflows.changeHistory.currentVersionBadge', {
    defaultMessage: 'Current version • v{version}',
    values: { version },
  });

export const CURRENT_VERSION_ONLY_BADGE = i18n.translate(
  'workflows.changeHistory.currentVersionOnlyBadge',
  {
    defaultMessage: 'Current version',
  }
);

export const VERSION_BADGE = (version: number): string =>
  i18n.translate('workflows.changeHistory.versionBadge', {
    defaultMessage: 'v{version}',
    values: { version },
  });
