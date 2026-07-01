/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { useGetRuleTypesPermissions } from '@kbn/alerts-ui-shared/src/common/hooks';
import { AlertsQueryContext } from '@kbn/alerts-ui-shared/src/common/contexts/alerts_query_context';
import { ALERT_RULE_TYPE_ID, isSiemRuleType } from '@kbn/rule-data-utils';
import { ViewRuleDetailsAlertAction } from './view_rule_details_alert_action';
import type { AdditionalContext, AlertActionsProps } from '../types';
import { ViewAlertDetailsAlertAction } from './view_alert_details_alert_action';
import { SnoozeAlertAction } from './snooze_alert_action';
import { AcknowledgeAlertAction } from './acknowledge_alert_action';
import { MarkAsUntrackedAlertAction } from './mark_as_untracked_alert_action';
import { useAlertsTableContext } from '../contexts/alerts_table_context';
import { EditTagsAction } from './edit_tags_action';

/**
 * Common alerts table row actions
 */
export const DefaultAlertActions = <AC extends AdditionalContext = AdditionalContext>(
  props: AlertActionsProps<AC>
) => {
  const {
    services: {
      http,
      notifications: { toasts },
    },
  } = useAlertsTableContext();
  const { authorizedToCreateAnyRules } = useGetRuleTypesPermissions({
    filteredRuleTypes: [],
    http,
    toasts,
    context: AlertsQueryContext,
  });

  const isSecurityRule =
    props.alert[ALERT_RULE_TYPE_ID] && isSiemRuleType(props.alert[ALERT_RULE_TYPE_ID].toString());
  const { isMutedAlertsEnabled = true, canModifyAlerts } = props;

  const showModifyOption =
    (authorizedToCreateAnyRules || Boolean(canModifyAlerts)) && !isSecurityRule;

  return (
    <>
      <ViewRuleDetailsAlertAction {...props} />
      <ViewAlertDetailsAlertAction {...props} />
      {showModifyOption && <AcknowledgeAlertAction {...props} />}
      {showModifyOption && <MarkAsUntrackedAlertAction {...props} />}
      {showModifyOption && isMutedAlertsEnabled && <SnoozeAlertAction {...props} />}
      {showModifyOption && <EditTagsAction {...props} />}
    </>
  );
};
