/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiToolTip } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { MonitorOrigin } from '../../../../../../common/runtime_types';

export function SyntheticsHeartbeatBadge({ origin }: { origin?: MonitorOrigin }) {
  if (origin !== 'heartbeat') {
    return null;
  }

  return (
    <EuiToolTip content={HEARTBEAT_BADGE_TOOLTIP}>
      <EuiBadge
        color="hollow"
        iconType="agentApp"
        data-test-subj="syntheticsHeartbeatBadge"
        onMouseDown={(e: React.MouseEvent) => {
          e.stopPropagation();
        }}
      >
        {HEARTBEAT_BADGE_LABEL}
      </EuiBadge>
    </EuiToolTip>
  );
}

const HEARTBEAT_BADGE_LABEL = i18n.translate('xpack.synthetics.heartbeatBadge.label', {
  defaultMessage: 'Heartbeat',
});

const HEARTBEAT_BADGE_TOOLTIP = i18n.translate('xpack.synthetics.heartbeatBadge.tooltip', {
  defaultMessage:
    'Run by Heartbeat / Elastic Agent (e.g. Kubernetes autodiscovery). It has no Synthetics configuration and is read-only here.',
});
