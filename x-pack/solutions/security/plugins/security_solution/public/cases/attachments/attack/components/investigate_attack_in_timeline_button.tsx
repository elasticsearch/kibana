/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiButtonIcon, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID } from '../../../../../common/cases/attachments/attack/test_ids';
import { ACTION_INVESTIGATE_IN_TIMELINE } from '../../../../detections/components/alerts_table/translations';

const ALERTS_UNAVAILABLE_TOOLTIP = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.tab.investigateInTimelineUnavailable',
  {
    defaultMessage:
      'This attack could not be loaded, so the alerts it comprises cannot be sent to Timeline.',
  }
);

export interface InvestigateAttackInTimelineButtonProps {
  /** Id used to build the button's `data-test-subj` and DOM id — the attachment saved object id. */
  id: string;
  /**
   * Disables the action when the attack's constituent alerts are unknown, which is the case for
   * an attack the live query could not resolve. The tooltip explains why.
   */
  isDisabled?: boolean;
  onClick: () => void;
}

/**
 * Opens Timeline scoped to the alerts an attached attack comprises.
 *
 * Carries the `timeline` icon the alerts grid's own row action uses, so the same investigation
 * looks the same in both grids.
 */
export const InvestigateAttackInTimelineButton = ({
  id,
  isDisabled = false,
  onClick,
}: InvestigateAttackInTimelineButtonProps) => (
  <EuiToolTip
    content={isDisabled ? ALERTS_UNAVAILABLE_TOOLTIP : ACTION_INVESTIGATE_IN_TIMELINE}
    disableScreenReaderOutput
    position="top"
  >
    <EuiButtonIcon
      aria-label={ACTION_INVESTIGATE_IN_TIMELINE}
      color="text"
      data-test-subj={`${INVESTIGATE_ATTACK_IN_TIMELINE_BUTTON_TEST_ID}-${id}`}
      iconType="timeline"
      id={`${id}-investigate-attack-in-timeline`}
      isDisabled={isDisabled}
      onClick={onClick}
    />
  </EuiToolTip>
);

InvestigateAttackInTimelineButton.displayName = 'InvestigateAttackInTimelineButton';
