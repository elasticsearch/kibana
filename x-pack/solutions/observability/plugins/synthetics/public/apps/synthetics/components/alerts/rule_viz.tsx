/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';
import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiPopoverTitle,
  EuiSpacer,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { useSelector, useDispatch } from 'react-redux';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { i18n } from '@kbn/i18n';
import { useInspectorContext } from '@kbn/observability-shared-plugin/public';
import type { PayloadAction } from '@reduxjs/toolkit';
import { enableInspectEsQueries } from '@kbn/observability-plugin/common';
import { RuleMonitorsTable } from './rule_monitors_table';
import { apiService } from '../../../../utils/api_service';
import { selectInspectRule } from '../../state/alert_rules/selectors';
import type { ClientPluginsStart } from '../../../../plugin';

export const RuleViz = ({ dispatchedAction }: { dispatchedAction: PayloadAction<unknown> }) => {
  const { data, loading } = useSelector(selectInspectRule);
  const dispatch = useDispatch();
  const {
    services: { inspector, uiSettings },
  } = useKibana<ClientPluginsStart>();

  const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
  const ruleVizPopoverTitleId = useGeneratedHtmlId();

  const { inspectorAdapters, addInspectorRequest } = useInspectorContext();

  const isInspectorEnabled = uiSettings.get<boolean>(enableInspectEsQueries);

  const inspect = () => {
    inspector.open(inspectorAdapters);
  };

  useEffect(() => {
    apiService.addInspectorRequest = addInspectorRequest;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    inspectorAdapters?.requests?.reset();
    dispatch(dispatchedAction);
  }, [dispatchedAction, dispatch, inspectorAdapters?.requests]);

  const detailsButton = (
    <EuiButtonEmpty
      data-test-subj="syntheticsRuleVizInspectButton"
      onClick={inspect}
      iconType="inspect"
      size="xs"
      disabled={!isInspectorEnabled}
    >
      {i18n.translate('xpack.synthetics.rules.details', {
        defaultMessage: 'Details',
      })}
    </EuiButtonEmpty>
  );

  return (
    <EuiCallOut iconType="magnify" size="s">
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          {i18n.translate('xpack.synthetics.statusRuleViz.ruleAppliesToFlexItemLabel', {
            defaultMessage: 'Rule applies to ',
          })}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiPopover
            isOpen={isPopoverOpen}
            closePopover={() => setIsPopoverOpen(false)}
            button={
              loading ? undefined : (
                <EuiButtonEmpty
                  data-test-subj="syntheticsStatusRuleVizMonitorQueryIDsButton"
                  size="xs"
                  onClick={() => setIsPopoverOpen(!isPopoverOpen)}
                >
                  {i18n.translate('xpack.synthetics.statusRuleViz.monitorQueryIdsPopoverButton', {
                    defaultMessage:
                      '{total} existing {total, plural, one {monitor} other {monitors}}',
                    values: { total: data?.monitors.length },
                  })}
                </EuiButtonEmpty>
              )
            }
            aria-labelledby={ruleVizPopoverTitleId}
          >
            <EuiPopoverTitle id={ruleVizPopoverTitleId}>
              {i18n.translate('xpack.synthetics.statusRuleViz.monitorsPopoverTitleLabel', {
                defaultMessage: 'Monitors',
              })}
            </EuiPopoverTitle>
            {i18n.translate('xpack.synthetics.statusRuleViz.ruleAppliesToFollowingPopoverLabel', {
              defaultMessage: 'Rule applies to following existing monitors.',
            })}
            <EuiSpacer size="s" />
            <RuleMonitorsTable />
          </EuiPopover>
        </EuiFlexItem>
        {loading && (
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" />
          </EuiFlexItem>
        )}
        {/* to push detail button to end*/}
        <EuiFlexItem />
        <EuiFlexItem grow={false}>
          {isInspectorEnabled ? (
            detailsButton
          ) : (
            <EuiToolTip content={inspectorDisabledTooltip}>{detailsButton}</EuiToolTip>
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiCallOut>
  );
};

const inspectorDisabledTooltip = i18n.translate('xpack.synthetics.rules.inspectorDisabled', {
  defaultMessage: 'Enable "Inspect ES queries" in Advanced Settings to see Details',
});
