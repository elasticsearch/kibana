/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  Action,
  ActionExecutionMeta,
  FrequentCompatibilityChangeAction,
} from '@kbn/ui-actions-plugin/public';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import { hasEditCapabilities } from '@kbn/presentation-publishing';
import { i18n } from '@kbn/i18n';
import { map } from 'rxjs';
import type { AnomalySwimLaneEmbeddableApi } from '../embeddables/anomaly_swimlane/types';

export const ANOMALY_SWIMLANE_SEVERITY_BADGE_ID = 'anomaly-swimlane-severity-badge';

function isSwimlaneWithSeverity(embeddable: unknown): embeddable is AnomalySwimLaneEmbeddableApi {
  return Boolean((embeddable as AnomalySwimLaneEmbeddableApi)?.severityThreshold);
}

export class AnomalySwimlaneSeverityBadge
  implements Action<EmbeddableApiContext>, FrequentCompatibilityChangeAction<EmbeddableApiContext>
{
  public readonly type = ANOMALY_SWIMLANE_SEVERITY_BADGE_ID;
  public readonly id = ANOMALY_SWIMLANE_SEVERITY_BADGE_ID;
  public order = 6;

  public couldBecomeCompatible({ embeddable }: EmbeddableApiContext) {
    return isSwimlaneWithSeverity(embeddable);
  }

  public getCompatibilityChangesSubject({ embeddable }: EmbeddableApiContext) {
    if (!isSwimlaneWithSeverity(embeddable)) return undefined;
    return embeddable.severityThreshold.pipe(map(() => undefined));
  }

  public async isCompatible({ embeddable }: EmbeddableApiContext) {
    if (!isSwimlaneWithSeverity(embeddable)) return false;
    const threshold = embeddable.severityThreshold.value;
    return typeof threshold === 'number' && threshold > 0;
  }

  public getDisplayName({ embeddable }: EmbeddableApiContext) {
    if (!isSwimlaneWithSeverity(embeddable)) throw new IncompatibleActionError();
    const threshold = embeddable.severityThreshold.value;
    if (typeof threshold !== 'number') throw new IncompatibleActionError();
    return i18n.translate('xpack.ml.swimlaneEmbeddable.severityBadge.label', {
      defaultMessage: 'Severity ≥ {threshold}',
      values: { threshold },
    });
  }

  public getIconType() {
    return 'filter';
  }

  public async execute({ embeddable }: ActionExecutionMeta & EmbeddableApiContext) {
    if (!isSwimlaneWithSeverity(embeddable) || !hasEditCapabilities(embeddable)) {
      throw new IncompatibleActionError();
    }
    embeddable.onEdit();
  }
}
