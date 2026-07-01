/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiFlexGroup,
  type EuiFlexGroupProps,
  EuiFlexItem,
  EuiIcon,
  EuiLoadingSpinner,
  EuiText,
  type EuiTextProps,
  type EuiThemeComputed,
  EuiToolTip,
  formatDate,
  useEuiTheme,
} from '@elastic/eui';
import type { EuiIconType } from '@elastic/eui/src/components/icon/icon';
import type { TokenColor } from '@elastic/eui/src/components/token/token_types';
import { css } from '@emotion/react';
import React from 'react';
import { ExecutionStatus } from '@kbn/workflows';
import { FormattedRelativeEnhanced } from './formatted_relative_enhanced/formatted_relative_enhanced';
import { getStatusLabel } from '../translations';

interface ExecutionStatusColors {
  color: string;
  backgroundColor: string;
  tokenColor: TokenColor | undefined;
}

const getExecutionStatusColorsMap = (
  euiTheme: EuiThemeComputed
): Record<ExecutionStatus, ExecutionStatusColors> => {
  return {
    [ExecutionStatus.COMPLETED]: {
      color: euiTheme.colors.vis.euiColorVisSuccess0,
      backgroundColor: euiTheme.colors.backgroundBaseSuccess,
      tokenColor: 'euiColorVis0' as const,
    },
    [ExecutionStatus.FAILED]: {
      color: euiTheme.colors.danger,
      backgroundColor: euiTheme.colors.backgroundBaseDanger,
      tokenColor: 'euiColorVis6' as const,
    },
    [ExecutionStatus.PENDING]: {
      color: euiTheme.colors.textSubdued,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      tokenColor: 'gray' as const,
    },
    [ExecutionStatus.QUEUED]: {
      color: euiTheme.colors.textSubdued,
      backgroundColor: euiTheme.colors.backgroundBaseWarning,
      tokenColor: 'euiColorVis9' as const,
    },
    [ExecutionStatus.RUNNING]: {
      color: euiTheme.colors.textSubdued,
      backgroundColor: euiTheme.colors.backgroundLightNeutral,
      tokenColor: 'euiColorVis3' as const,
    },
    [ExecutionStatus.WAITING]: {
      color: euiTheme.colors.warning,
      backgroundColor: euiTheme.colors.backgroundBaseWarning,
      tokenColor: 'euiColorVis9' as const,
    },
    [ExecutionStatus.WAITING_FOR_INPUT]: {
      color: euiTheme.colors.warning,
      backgroundColor: euiTheme.colors.backgroundBaseWarning,
      tokenColor: 'euiColorVis9' as const,
    },
    [ExecutionStatus.WAITING_FOR_CHILD]: {
      color: euiTheme.colors.warning,
      backgroundColor: euiTheme.colors.backgroundBaseWarning,
      tokenColor: 'euiColorVis9' as const,
    },
    [ExecutionStatus.CANCELLED]: {
      color: euiTheme.colors.textSubdued,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      tokenColor: 'gray',
    },
    [ExecutionStatus.TIMED_OUT]: {
      color: euiTheme.colors.danger,
      backgroundColor: euiTheme.colors.backgroundBaseDanger,
      tokenColor: 'euiColorVis6' as const,
    },
    [ExecutionStatus.SKIPPED]: {
      color: euiTheme.colors.textDisabled,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      tokenColor: 'gray',
    },
  };
};

export const getExecutionStatusColors = (
  euiTheme: EuiThemeComputed,
  status: ExecutionStatus | null
) => {
  if (!status) {
    return {
      color: euiTheme.colors.textSubdued,
      backgroundColor: euiTheme.colors.backgroundBaseSubdued,
      tokenColor: 'gray',
    };
  }
  return getExecutionStatusColorsMap(euiTheme)[status];
};

const ExecutionStatusIconTypeMap: Record<ExecutionStatus, EuiIconType> = {
  [ExecutionStatus.COMPLETED]: 'checkCircleFill',
  [ExecutionStatus.FAILED]: 'errorFill',
  [ExecutionStatus.TIMED_OUT]: 'errorFill',
  [ExecutionStatus.PENDING]: 'clock',
  [ExecutionStatus.QUEUED]: 'sortUp',
  [ExecutionStatus.RUNNING]: 'play',
  [ExecutionStatus.WAITING]: 'clock',
  [ExecutionStatus.WAITING_FOR_INPUT]: 'hourglass',
  [ExecutionStatus.WAITING_FOR_CHILD]: 'hourglass',
  [ExecutionStatus.CANCELLED]: 'crossCircle',
  [ExecutionStatus.SKIPPED]: 'minusCircle',
};

export const getExecutionStatusIcon = (euiTheme: EuiThemeComputed, status: ExecutionStatus) => {
  if (status === ExecutionStatus.RUNNING) {
    return <EuiLoadingSpinner size="m" />;
  }

  if (
    status === ExecutionStatus.WAITING_FOR_INPUT ||
    status === ExecutionStatus.WAITING_FOR_CHILD
  ) {
    return (
      <EuiIcon
        type="hourglass"
        color={getExecutionStatusColors(euiTheme, status).color}
        aria-hidden={true}
      />
    );
  }

  return (
    <EuiIcon
      type={ExecutionStatusIconTypeMap[status]}
      color={getExecutionStatusColors(euiTheme, status).color}
      aria-hidden={true}
    />
  );
};

const CONTAINER_BREAKPOINT_HIDE = '500px';
const CONTAINER_BREAKPOINT_NARROW = '1000px';

const statusBadgeStyles = {
  tooltipAnchor: css({
    maxWidth: '100%',
  }),
  textContainer: css({
    minWidth: 0,
    overflow: 'hidden',
    flexShrink: 1,
    [`@container (max-width: ${CONTAINER_BREAKPOINT_HIDE})`]: {
      display: 'none',
    },
  }),
  text: css({
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }),
  longFormat: css({
    [`@container (max-width: ${CONTAINER_BREAKPOINT_NARROW})`]: {
      display: 'none',
    },
  }),
  narrowFormat: css({
    display: 'none',
    [`@container (max-width: ${CONTAINER_BREAKPOINT_NARROW})`]: {
      display: 'inline',
    },
    [`@container (max-width: ${CONTAINER_BREAKPOINT_HIDE})`]: {
      display: 'none',
    },
  }),
};

export function StatusBadge({
  status,
  date,
  textProps,
  ...props
}: {
  status: ExecutionStatus | undefined;
  date?: string | undefined;
  textProps?: EuiTextProps;
} & EuiFlexGroupProps) {
  const { euiTheme } = useEuiTheme();
  if (!status) {
    return null;
  }

  const statusLabel = getStatusLabel(status);
  const icon = getExecutionStatusIcon(euiTheme, status);

  return (
    <EuiToolTip
      content={date ? `${statusLabel} ${date ? `on ${formatDate(date)}` : ''}` : null}
      anchorProps={{ css: statusBadgeStyles.tooltipAnchor }}
    >
      <EuiFlexGroup alignItems="center" gutterSize="s" wrap={false} responsive={false} {...props}>
        <EuiFlexItem grow={false}>{icon}</EuiFlexItem>
        <EuiFlexItem grow={false} css={statusBadgeStyles.textContainer}>
          <EuiText size="s" {...textProps} css={statusBadgeStyles.text}>
            {date ? (
              <>
                <span css={statusBadgeStyles.longFormat}>
                  <FormattedRelativeEnhanced value={date} style="long" />
                </span>
                <span css={statusBadgeStyles.narrowFormat}>
                  <FormattedRelativeEnhanced value={date} style="narrow" />
                </span>
              </>
            ) : (
              statusLabel
            )}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiToolTip>
  );
}
