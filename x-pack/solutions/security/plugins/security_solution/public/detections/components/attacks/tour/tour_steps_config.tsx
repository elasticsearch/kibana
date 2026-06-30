/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiIcon, EuiImage, EuiSpacer, EuiText } from '@elastic/eui';
import type { EuiTourStepProps } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { ATTACKS_TOUR_ANCHORS } from './constants';
import runAndScheduleImage from './images/run_and_schedule.svg';
import newFiltersImage from './images/new_filters.svg';
import attackDetailsFlyoutImage from './images/attack_details_flyout.svg';
import * as i18n from './translations';

export type AttacksTourStepId = 'run_schedule' | 'filters' | 'flyout';

export interface AttacksTourStep {
  stepId: AttacksTourStepId;
  title: string;
  content: React.ReactNode;
  anchor: string;
  anchorPosition: EuiTourStepProps['anchorPosition'];
}

const bold = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

const RUN_SCHEDULE_STEP: AttacksTourStep = {
  stepId: 'run_schedule',
  title: i18n.STEP_RUN_SCHEDULE_TITLE,
  anchor: ATTACKS_TOUR_ANCHORS.runSchedule,
  anchorPosition: 'downCenter',
  content: (
    <>
      <EuiImage size="fullWidth" alt={i18n.STEP_RUN_SCHEDULE_TITLE} src={runAndScheduleImage} />
      <EuiSpacer size="s" />
      <EuiText size="s">
        <FormattedMessage
          id="xpack.securitySolution.attacksPage.tour.runSchedule.description"
          defaultMessage="Use <b>Run</b> to trigger attack detection manually, or <b>Schedule</b> a recurring run to detect attacks automatically over time."
          values={{ b: bold }}
        />
      </EuiText>
    </>
  ),
};

const FILTERS_STEP: AttacksTourStep = {
  stepId: 'filters',
  title: i18n.STEP_FILTERS_TITLE,
  anchor: ATTACKS_TOUR_ANCHORS.filters,
  anchorPosition: 'upRight',
  content: (
    <>
      <EuiImage size="fullWidth" alt={i18n.STEP_FILTERS_TITLE} src={newFiltersImage} />
      <EuiSpacer size="s" />
      <EuiText size="s">
        <FormattedMessage
          id="xpack.securitySolution.attacksPage.tour.filters.description"
          defaultMessage="Filter attacks by <b>Type</b>, <b>Assignees</b>, <b>Connector</b>, <b>Status</b> or build <b>your own</b> custom filters."
          values={{ b: bold }}
        />
      </EuiText>
    </>
  ),
};

const FLYOUT_STEP: AttacksTourStep = {
  stepId: 'flyout',
  title: i18n.STEP_FLYOUT_TITLE,
  anchor: ATTACKS_TOUR_ANCHORS.flyout,
  anchorPosition: 'rightCenter',
  content: (
    <>
      <EuiImage size="fullWidth" alt={i18n.STEP_FLYOUT_TITLE} src={attackDetailsFlyoutImage} />
      <EuiSpacer size="s" />
      <EuiText size="s">
        <FormattedMessage
          id="xpack.securitySolution.attacksPage.tour.flyout.description"
          defaultMessage="Click {icon} on any Attack to open the details flyout with an <b>Attack Summary</b>, <b>Attack Chain</b>, <b>Insights</b>, <b>Entities</b>, and <b>Notes</b>."
          values={{ b: bold, icon: <EuiIcon type="maximize" size="s" aria-hidden={true} /> }}
        />
      </EuiText>
    </>
  ),
};

/**
 * Builds the ordered list of tour steps. The attack-details-flyout step is only
 * included when attacks are present (there is no table row to anchor it to
 * otherwise), so `hasAttacks` controls whether the tour has 3 steps or 2.
 */
export const getAttacksTourSteps = (hasAttacks: boolean): AttacksTourStep[] =>
  hasAttacks ? [RUN_SCHEDULE_STEP, FILTERS_STEP, FLYOUT_STEP] : [RUN_SCHEDULE_STEP, FILTERS_STEP];
