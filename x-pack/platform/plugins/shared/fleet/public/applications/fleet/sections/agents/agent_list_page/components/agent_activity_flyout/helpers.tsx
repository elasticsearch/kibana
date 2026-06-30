/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { FormattedDate, FormattedMessage, FormattedTime } from '@kbn/i18n-react';
import { EuiIconTip, EuiFlexGroup } from '@elastic/eui';

import type { ActionStatus } from '../../../../../types';

const actionNames: {
  [key: string]: { inProgressText: string; completedText: string; cancelledText: string };
} = {
  POLICY_REASSIGN: {
    inProgressText: 'Reassigning',
    completedText: 'assigned to a new policy',
    cancelledText: 'assignment',
  },
  UPGRADE: { inProgressText: 'Upgrading', completedText: 'upgraded', cancelledText: 'upgrade' },
  ROLLBACK: {
    inProgressText: 'Rolling back',
    completedText: 'rolled back',
    cancelledText: 'rollback',
  },
  UNENROLL: {
    inProgressText: 'Unenrolling',
    completedText: 'unenrolled',
    cancelledText: 'unenrollment',
  },
  FORCE_UNENROLL: {
    inProgressText: 'Force unenrolling',
    completedText: 'force unenrolled',
    cancelledText: 'force unenrollment',
  },
  AUTOMATIC_FORCE_UNENROLL: {
    inProgressText: 'Automatic unenrolling',
    completedText: 'automatically unenrolled',
    cancelledText: 'automatic unenrollment',
  },
  UPDATE_TAGS: {
    inProgressText: 'Updating tags of',
    completedText: 'updated tags',
    cancelledText: 'update tags',
  },
  CANCEL: { inProgressText: 'Cancelling', completedText: 'cancelled', cancelledText: '' },
  REQUEST_DIAGNOSTICS: {
    inProgressText: 'Requesting diagnostics for',
    completedText: 'requested diagnostics',
    cancelledText: 'request diagnostics',
  },
  SETTINGS: {
    inProgressText: 'Updating settings of',
    completedText: 'updated settings',
    cancelledText: 'update settings',
  },
  POLICY_CHANGE: {
    inProgressText: 'Applying policy change on',
    completedText: 'applied policy change',
    cancelledText: 'policy change',
  },
  INPUT_ACTION: {
    inProgressText: 'Input action in progress of',
    completedText: 'input action completed',
    cancelledText: 'input action',
  },
  MIGRATE: {
    inProgressText: 'Migrating',
    completedText: 'migrated',
    cancelledText: 'migration',
  },
  PRIVILEGE_LEVEL_CHANGE: {
    inProgressText: 'Changing privilege level of',
    completedText: 'changed privilege level',
    cancelledText: 'change privilege level',
  },
  REMOVE_COLLECTOR: {
    inProgressText: 'Removing',
    completedText: 'removed',
    cancelledText: 'removal',
  },
  ACTION: { inProgressText: 'Actioning', completedText: 'actioned', cancelledText: 'action' },
};

export const getAction = (type?: string, actionId?: string) => {
  // handling a special case of force unenrollment coming from an automatic task
  // we know what kind of action is from the actionId prefix
  if (actionId?.includes('UnenrollInactiveAgentsTask-'))
    return actionNames.AUTOMATIC_FORCE_UNENROLL;
  return actionNames[type ?? 'ACTION'] ?? actionNames.ACTION;
};

const getNbAgentsText = ({ nbAgentsAck, nbAgentsActioned }: ActionStatus): string => {
  if (nbAgentsAck >= nbAgentsActioned) return String(nbAgentsAck);
  if (nbAgentsAck === 0) return String(nbAgentsActioned);
  return `${nbAgentsActioned - nbAgentsAck} of ${nbAgentsActioned}`;
};

const getActionSuffix = ({ type, newPolicyId, version }: ActionStatus): string => {
  if (type === 'POLICY_REASSIGN' && newPolicyId) return ` to ${newPolicyId}`;
  if (type === 'UPGRADE' || type === 'ROLLBACK') return ` to version ${version}`;
  return '';
};

export const inProgressTitle = (action: ActionStatus, isAutomatic: boolean | undefined) => (
  <EuiFlexGroup gutterSize="s" alignItems="center">
    <FormattedMessage
      id="xpack.fleet.agentActivity.inProgressTitle"
      defaultMessage="{inProgressText} {nbAgents} {agents}{actionSuffix}{failuresText}{automaticIcon}"
      values={{
        inProgressText: getAction(action.type, action.actionId).inProgressText,
        nbAgents: getNbAgentsText(action),
        agents: action.nbAgentsActioned === 1 ? 'agent' : 'agents',
        actionSuffix: getActionSuffix(action),
        failuresText: action.nbAgentsFailed > 0 ? `, has ${action.nbAgentsFailed} failure(s)` : '',
        automaticIcon: isAutomatic ? (
          <EuiIconTip
            anchorProps={{ style: { display: 'flex', alignItems: 'center' } }}
            type="refreshTime"
            content="Triggered by an automatic upgrade"
          />
        ) : null,
      }}
    />
  </EuiFlexGroup>
);

export const inProgressDescription = (time?: string) => (
  <FormattedMessage
    id="xpack.fleet.agentActivityFlyout.startedDescription"
    defaultMessage="Started on {date}."
    values={{
      date: formattedTime(time),
    }}
  />
);

export const formattedTime = (time?: string) => {
  return time ? (
    <>
      <FormattedDate value={time} year="numeric" month="short" day="2-digit" />
      &nbsp;
      <FormattedTime value={time} />
    </>
  ) : null;
};
