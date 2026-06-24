/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCallOut } from '@elastic/eui';
import { AgentAccessControlMode, type AgentDefinition } from '@kbn/agent-builder-common';
import { ACCESS_CONTROL_MODE_LABELS } from '../../../utils/access_control_mode_i18n';
import { accessControlModeContextMessage } from './access_i18n';

interface AccessControlModeContextStripProps {
  agent: AgentDefinition;
}

export const AccessControlModeContextStrip: React.FC<AccessControlModeContextStripProps> = ({
  agent,
}) => {
  const accessControlMode = agent.access_control?.access_mode ?? AgentAccessControlMode.Public;
  const label = ACCESS_CONTROL_MODE_LABELS[accessControlMode];
  const messages = accessControlModeContextMessage(label);

  let title: string;
  switch (accessControlMode) {
    case AgentAccessControlMode.Private:
      title = messages.privateMessage;
      break;
    case AgentAccessControlMode.Shared:
      title = messages.sharedMessage;
      break;
    case AgentAccessControlMode.Public:
    default:
      title = messages.publicMessage;
      break;
  }

  return (
    <EuiCallOut
      color="primary"
      size="s"
      title={title}
      data-test-subj="agentBuilderAclContextStrip"
    />
  );
};
