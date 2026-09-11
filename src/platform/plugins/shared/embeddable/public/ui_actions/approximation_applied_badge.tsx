/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { i18n } from '@kbn/i18n';
import type { EmbeddableApiContext, PublishesEsql } from '@kbn/presentation-publishing';
import { apiPublishesEsql } from '@kbn/presentation-publishing';
import type { ActionDefinition } from '@kbn/ui-actions-plugin/public/actions';
import { map } from 'rxjs';
import { APPROXIMATION_APPLIED_BADGE } from './constants';

export type ApproximationAppliedBadgeApi = Pick<PublishesEsql, 'approximationApplied$'>;

const isApiCompatible = (api: unknown | null): api is ApproximationAppliedBadgeApi =>
  apiPublishesEsql(api);

export const approximationAppliedBadge: ActionDefinition<EmbeddableApiContext> = {
  id: APPROXIMATION_APPLIED_BADGE,
  type: APPROXIMATION_APPLIED_BADGE,
  order: 10,
  getIconType: () => 'bolt',
  getDisplayName: ({ embeddable }: EmbeddableApiContext) => {
    return '';
  },
  getDisplayNameTooltip: ({ embeddable }: EmbeddableApiContext) => {
    return i18n.translate('embeddableApi.badge.approximationApplied.displayNameTooltip', {
      defaultMessage:
        'This panel shows approximate results because fast mode is enabled on the page or the ES|QL query that powers the panel enables approximation.',
    });
  },
  isCompatible: async ({ embeddable }: EmbeddableApiContext) => {
    if (!isApiCompatible(embeddable)) return false;
    return embeddable.approximationApplied$.getValue() ?? false;
  },
  couldBecomeCompatible: ({ embeddable }: EmbeddableApiContext) => {
    return isApiCompatible(embeddable);
  },
  getCompatibilityChangesSubject: ({ embeddable }: EmbeddableApiContext) => {
    return isApiCompatible(embeddable)
      ? embeddable.approximationApplied$.pipe(map(() => undefined))
      : undefined;
  },
  execute: async ({ embeddable }: EmbeddableApiContext) => {
    return;
  },
  extension: {
    color: 'success',
  },
};
