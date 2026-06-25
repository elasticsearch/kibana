/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiProgress,
  EuiText,
} from '@elastic/eui';
import type { DataStreamResponse } from '../../../../../../common';
import {
  DATA_STREAM_PHASE_PROGRESS_MAX,
  getPhaseLabel,
  getPhaseProgressValue,
  STATUS_COLOR_MAP,
  STATUS_ICON_MAP,
  STATUS_TEXT_MAP,
} from './constants';
import * as i18n from '../translations';

interface StatusProps {
  status: DataStreamResponse['status'];
  phase?: DataStreamResponse['phase'];
  isDeleting?: boolean;
}

const isInProgressStatus = (status: DataStreamResponse['status']): boolean =>
  status === 'pending' || status === 'processing';

export const Status = ({ status, phase, isDeleting = false }: StatusProps) => {
  const isSpinnerShown =
    isDeleting || status === 'pending' || status === 'processing' || status === 'deleting';
  const displayText = isDeleting ? i18n.STATUS_LABELS.deleting : STATUS_TEXT_MAP[status];

  if (!isDeleting && isInProgressStatus(status)) {
    const phaseLabel = getPhaseLabel(phase);
    const progressValue = getPhaseProgressValue(phase);

    return (
      <EuiFlexGroup direction="column" gutterSize="xs" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiProgress
            value={progressValue}
            max={DATA_STREAM_PHASE_PROGRESS_MAX}
            size="s"
            color="primary"
            aria-label={phaseLabel}
          />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiLoadingSpinner size="s" />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="xs">{phaseLabel}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
      <EuiFlexItem grow={false}>
        {isSpinnerShown ? (
          <EuiLoadingSpinner size="s" />
        ) : (
          <EuiIcon
            type={STATUS_ICON_MAP[status]}
            color={STATUS_COLOR_MAP[status]}
            aria-hidden={true}
          />
        )}
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="s">{displayText}</EuiText>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

Status.displayName = 'Status';
