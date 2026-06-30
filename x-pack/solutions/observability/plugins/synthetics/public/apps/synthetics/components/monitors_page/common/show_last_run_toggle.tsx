/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import type { EuiSwitchEvent } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiIconTip, EuiSwitch, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useDispatch, useSelector } from 'react-redux';
import { selectOverviewShowLastRun, setOverviewShowLastRunAction } from '../../../state';
import { persistShowLastRun } from '../../../state/utils/get_initial_show_last_run';
import { useOverviewStatusState } from '../hooks/use_overview_status';

/**
 * Standalone toolbar toggle that flips monitors demoted to `stale` (stopped
 * reporting) back to their last-known up/down. The transform happens in
 * `selectOverviewStatus` using the `lastStatus` the server carries, so flipping
 * this never triggers a refetch.
 *
 * It only renders when there are stale monitors to act on (or while it's already
 * on, so it can be turned back off) — otherwise it would be dead toolbar weight.
 */
export const ShowLastRunToggle: React.FC = () => {
  const dispatch = useDispatch();
  const showLastRun = Boolean(useSelector(selectOverviewShowLastRun));
  const { status } = useOverviewStatusState();

  const onChange = useCallback(
    (e: EuiSwitchEvent) => {
      const { checked } = e.target;
      persistShowLastRun(checked);
      dispatch(setOverviewShowLastRunAction(checked));
    },
    [dispatch]
  );

  const hasStaleMonitors = (status?.stale ?? 0) > 0;
  if (!hasStaleMonitors && !showLastRun) {
    return null;
  }

  return (
    <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        <EuiSwitch
          compressed
          data-test-subj="syntheticsShowLastRunToggle"
          checked={showLastRun}
          onChange={onChange}
          label={<EuiText size="xs">{SHOW_LAST_RUN_LABEL}</EuiText>}
        />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiIconTip type="question" content={SHOW_LAST_RUN_HINT} position="top" />
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const SHOW_LAST_RUN_LABEL = i18n.translate('xpack.synthetics.overview.showLastRun.label', {
  defaultMessage: 'Show last run',
});

const SHOW_LAST_RUN_HINT = i18n.translate('xpack.synthetics.overview.showLastRun.hint', {
  defaultMessage: 'For monitors that stopped reporting, show their last known status instead.',
});
