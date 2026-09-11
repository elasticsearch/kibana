/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiTextTruncate } from '@elastic/eui';
import React, { useMemo } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { TableId } from '@kbn/securitysolution-data-table';
import { i18n } from '@kbn/i18n';
import { ADD_TO_CASE } from '@kbn/response-ops-alerts-table/translations';
import { get } from 'lodash/fp';
import { ALERT_RULE_NAME } from '@kbn/rule-data-utils';
import { useCanAttachToCase } from '../../../../cases/attachments/hooks/use_can_attach_to_case';
import { withGroupSeparators } from '../../../../common/utils/action_menu_items';
import { useRiskInputActions } from './use_risk_input_actions';
import type { InputAlert } from '../../../hooks/use_risk_contributing_alerts';
import { useGlobalTime } from '../../../../common/containers/use_global_time';
import { useSendBulkToTimeline } from '../../../../detections/components/alerts_table/timeline_actions/use_send_bulk_to_timeline';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { EntityEventTypes } from '../../../../common/lib/telemetry';
import { useKibana } from '../../../../common/lib/kibana/kibana_react';
import { useIsInSecurityApp } from '../../../../common/hooks/is_in_security_app';

export const RISK_INPUT_ACTION_IDS = {
  addToNewTimeline: 'add-to-new-timeline',
  addToCase: 'add-to-case',
} as const;

export const useRiskInputActionsPanels = (inputs: InputAlert[], closePopover: () => void) => {
  const { telemetry } = useKibana().services;
  const { addToCase } = useRiskInputActions(inputs, closePopover);
  const { from, to } = useGlobalTime();
  const {
    timelinePrivileges: { read: canReadTimelines },
  } = useUserPrivileges();
  const isInSecurityApp = useIsInSecurityApp();
  const hasCasesPermissions = useCanAttachToCase();

  const { sendBulkEventsToTimelineHandler } = useSendBulkToTimeline({
    to,
    from,
    tableId: TableId.riskInputs,
  });
  const timelineActions = useMemo(() => {
    if (!canReadTimelines || !isInSecurityApp) {
      return [];
    }

    return [
      {
        key: RISK_INPUT_ACTION_IDS.addToNewTimeline,
        icon: 'timeline',
        'data-test-subj': RISK_INPUT_ACTION_IDS.addToNewTimeline,
        name: (
          <FormattedMessage
            id="xpack.securitySolution.flyout.entityDetails.riskInputs.actions.addToNewTimeline"
            defaultMessage="Add to new timeline"
          />
        ),

        onClick: () => {
          telemetry.reportEvent(EntityEventTypes.AddRiskInputToTimelineClicked, {
            quantity: inputs.length,
          });

          closePopover();
          const items = inputs.map(({ input }: InputAlert) => {
            return {
              _id: input.id,
              _index: input.index,
              data: [],
              ecs: {
                _id: input.id,
                _index: input.index,
              },
            };
          });
          sendBulkEventsToTimelineHandler(items);
        },
      },
    ];
  }, [
    canReadTimelines,
    isInSecurityApp,
    inputs,
    sendBulkEventsToTimelineHandler,
    closePopover,
    telemetry,
  ]);

  return useMemo(() => {
    const ruleName = get(['alert', ALERT_RULE_NAME], inputs[0]) ?? '';
    const title = i18n.translate(
      'xpack.securitySolution.flyout.entityDetails.riskInputs.actions.title',
      {
        defaultMessage: 'Risk input: {description}',
        values: {
          description:
            inputs.length === 1
              ? ruleName
              : i18n.translate(
                  'xpack.securitySolution.flyout.entityDetails.riskInputs.actions.titleDescription',
                  {
                    defaultMessage: '{quantity} selected',
                    values: {
                      quantity: inputs.length,
                    },
                  }
                ),
        },
      }
    );

    return [
      {
        title: (
          <EuiTextTruncate
            width={230} // It prevents the title from taking too much space
            text={title}
          />
        ),
        id: 0,
        items: withGroupSeparators([
          timelineActions,
          hasCasesPermissions
            ? [
                {
                  key: RISK_INPUT_ACTION_IDS.addToCase,
                  icon: 'briefcase' as const,
                  'data-test-subj': RISK_INPUT_ACTION_IDS.addToCase,
                  name: ADD_TO_CASE,
                  onClick: addToCase,
                },
              ]
            : [],
        ]),
      },
    ];
  }, [addToCase, inputs, hasCasesPermissions, timelineActions]);
};
