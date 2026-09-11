/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback } from 'react';
import moment from 'moment';
import type { AttackDiscoveryAlert } from '@kbn/elastic-assistant-common';
import { useKibana } from '../../../../common/lib/kibana';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useInvestigateInTimeline } from '../../../../common/hooks/timeline/use_investigate_in_timeline';
import { buildAlertsKqlFilter } from '../../../../detections/components/alerts_table/actions';
import type { TimeRange } from '../../../../common/store/inputs/model';
import { AttacksEventTypes } from '../../../../common/lib/telemetry';
import { getAttackAlertIds } from '../utils';

/**
 * How far back from the attack's own timestamp the timeline looks.
 *
 * Matches Attack Discovery's default alert selection window, which is the widest span the alerts
 * behind an attack are normally drawn from. A schedule configured to look back further could
 * still generate an attack whose oldest alerts fall outside this.
 */
const ATTACK_LOOKBACK_HOURS = 24;

/**
 * The window the attack's alerts were drawn from, opened back from when the attack was detected.
 *
 * It ends at the present rather than at the attack, because a constituent alert can be newer
 * than the attack that references it: a scheduled generation stamps the attack with the rule's
 * `startedAt`, then retrieves alerts up to the `now` of a query that runs moments later. The
 * filter names the alerts by id, so the range only ever has to be wide enough to hold them.
 *
 * Left to the caller's own time picker when the attack carries no usable timestamp, which is
 * the behaviour every attack surface had before this range existed.
 */
const getAttackTimeRange = (attack: AttackDiscoveryAlert | undefined): TimeRange | undefined => {
  const timestamp = attack?.timestamp;

  // `moment(undefined)` is now, which would silently anchor the range on the wrong moment.
  if (timestamp == null) {
    return undefined;
  }

  const detectedOn = moment(timestamp, moment.ISO_8601);

  if (!detectedOn.isValid()) {
    return undefined;
  }

  return {
    kind: 'absolute',
    from: detectedOn.clone().subtract(ATTACK_LOOKBACK_HOURS, 'hours').toISOString(),
    to: moment().toISOString(),
  };
};

export interface UseInvestigateAttackInTimelineResult {
  /** False when the user cannot read timelines, in which case the action is not offered at all. */
  canInvestigateInTimeline: boolean;
  /** Opens Timeline scoped to the attack's constituent alerts. A no-op for an unresolved attack. */
  investigateAttackInTimeline: (attack: AttackDiscoveryAlert | undefined) => void;
}

/**
 * Opens Timeline filtered to an attack's constituent alerts — the same investigation the Attacks
 * page offers from its "Take actions" menu, reached here from an attached attack.
 *
 * Meant to be called once per grid rather than once per row: `useInvestigateInTimeline` resolves
 * data views and timeline state, which is not work to repeat for every rendered row.
 */
export const useInvestigateAttackInTimeline = (): UseInvestigateAttackInTimelineResult => {
  const { telemetry } = useKibana().services;
  const { investigateInTimeline } = useInvestigateInTimeline();
  const {
    timelinePrivileges: { read: canInvestigateInTimeline },
  } = useUserPrivileges();

  const investigateAttackInTimeline = useCallback(
    (attack: AttackDiscoveryAlert | undefined) => {
      const alertIds = getAttackAlertIds(attack);

      if (alertIds.length === 0) {
        return;
      }

      telemetry.reportEvent(AttacksEventTypes.TimelineInvestigationOpened, {
        source: 'case_attachment_table',
      });

      // Without a range, timeline opens on the global time picker — "Today" by default — which
      // hides every alert older than it even though the filter names them by id.
      investigateInTimeline({
        filters: buildAlertsKqlFilter('_id', alertIds),
        timeRange: getAttackTimeRange(attack),
      });
    },
    [investigateInTimeline, telemetry]
  );

  return { canInvestigateInTimeline, investigateAttackInTimeline };
};
