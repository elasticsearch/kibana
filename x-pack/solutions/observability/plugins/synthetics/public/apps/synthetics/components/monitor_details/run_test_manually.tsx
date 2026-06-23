/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiContextMenuItem,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
} from '@elastic/eui';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { useDispatch, useSelector } from 'react-redux';
import { useSyntheticsSettingsContext } from '../../contexts';
import { useKibanaSpace } from '../../../../hooks/use_kibana_space';
import { NoPermissionsTooltip } from '../common/components/permissions';
import { useCanUsePublicLocations } from '../../../../hooks/use_capabilities';
import { ConfigKey } from '../../../../../common/constants/monitor_management';
import { TEST_NOW_ARIA_LABEL, TEST_SCHEDULED_LABEL } from '../monitor_add_edit/form/run_test_btn';
import { useSelectedMonitor } from './hooks/use_selected_monitor';
import {
  manualTestMonitorAction,
  manualTestRunInProgressSelector,
} from '../../state/manual_test_runs';

export const RunTestManuallyContextItem = ({ isRemote = false }: { isRemote?: boolean }) => {
  const dispatch = useDispatch();

  const { monitor } = useSelectedMonitor();
  const testInProgress = useSelector(manualTestRunInProgressSelector(monitor?.config_id));

  const canUsePublicLocations = useCanUsePublicLocations(monitor?.[ConfigKey.LOCATIONS]);

  const { canSave } = useSyntheticsSettingsContext();

  const { space } = useKibanaSpace();

  const content = testInProgress ? TEST_SCHEDULED_LABEL : TEST_NOW_ARIA_LABEL;

  // Remote (CCS) monitors cannot be triggered locally — manual test runs are
  // dispatched against the local saved object, which doesn't exist. Render a
  // disabled item with a remote-specific tooltip, bypassing the permissions
  // wrapper (which only handles permission/enablement reasons).
  if (isRemote) {
    return (
      <EuiContextMenuItem
        data-test-subj="syntheticsRunTestManuallyButton"
        color="success"
        disabled
        toolTipContent={NOT_AVAILABLE_FOR_REMOTE_MONITORS}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="flask" size="s" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <span>{RUN_TEST_LABEL}</span>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiContextMenuItem>
    );
  }

  return (
    <NoPermissionsTooltip
      content={content}
      canEditSynthetics={canSave}
      canUsePublicLocations={canUsePublicLocations}
    >
      <EuiContextMenuItem
        data-test-subj="syntheticsRunTestManuallyButton"
        color="success"
        disabled={!canUsePublicLocations || !canSave}
        onClick={() => {
          if (monitor) {
            const spaceId = 'spaceId' in monitor ? (monitor.spaceId as string) : undefined;
            dispatch(
              manualTestMonitorAction.get({
                configId: monitor.config_id,
                name: monitor.name,
                ...(spaceId && spaceId !== space?.id ? { spaceId } : {}),
              })
            );
          }
        }}
      >
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            {testInProgress ? (
              <EuiLoadingSpinner size="s" />
            ) : (
              <EuiIcon type="flask" size="s" aria-hidden={true} />
            )}
          </EuiFlexItem>
          <EuiFlexItem grow={false}>{<span>{RUN_TEST_LABEL}</span>}</EuiFlexItem>
        </EuiFlexGroup>
      </EuiContextMenuItem>
    </NoPermissionsTooltip>
  );
};

const RUN_TEST_LABEL = i18n.translate('xpack.synthetics.monitorSummary.runTestManually', {
  defaultMessage: 'Run test manually',
});

const NOT_AVAILABLE_FOR_REMOTE_MONITORS = i18n.translate(
  'xpack.synthetics.monitorDetails.actions.notAvailableForRemote',
  {
    defaultMessage: 'This action is not available for remote monitors',
  }
);
