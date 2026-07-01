/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { MouseEventHandler } from 'react';
import React from 'react';
import { css } from '@emotion/react';
import { EuiBadge, EuiToolTip } from '@elastic/eui';
import type { EbtClickAttrs } from '@kbn/ebt-click';
import { getEbtProps } from '@kbn/ebt-click';
import { i18n } from '@kbn/i18n';

const DEFAULT_DATA_TEST_SUBJ = 'apmAlertsBadge';

/**
 * EUI only applies `cursor: pointer` to the clickable badge's text span, so hovering the icon (or
 * its surrounding content) keeps the default cursor. Force the pointer across the whole button.
 */
const clickableBadgeStyles = css`
  &,
  .euiBadge__content,
  .euiBadge__icon {
    cursor: pointer;
  }
`;

function getClickableTooltip(count: number) {
  return i18n.translate('xpack.apm.alertsBadge.tooltip.clickable', {
    defaultMessage: '{count, plural, one {# active alert} other {# active alerts}}. Click to view.',
    values: { count },
  });
}

function getDisplayTooltip(count: number) {
  return i18n.translate('xpack.apm.alertsBadge.tooltip', {
    defaultMessage: '{count, plural, one {# active alert} other {# active alerts}}',
    values: { count },
  });
}

function getAriaLabel(count: number, serviceName: string) {
  return i18n.translate('xpack.apm.alertsBadge.ariaLabel', {
    defaultMessage:
      '{count, plural, one {# active alert} other {# active alerts}} for {serviceName}',
    values: { count, serviceName },
  });
}

export interface AlertsBadgeProps {
  count: number;
  /** Used to build the accessible label (e.g. "3 active alerts for opbeans-java"). */
  serviceName: string;
  /** When provided, the badge becomes an interactive button (e.g. navigate to the Alerts tab). */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** When true, no `EuiToolTip` is rendered (e.g. display-only service map nodes). */
  hideTooltip?: boolean;
  /** EBT click attributes; only applied when `onClick` is provided. */
  ebt?: EbtClickAttrs;
  'data-test-subj'?: string;
}

/**
 * Active-alerts count badge shared by the APM service detail header, the service flyout, and the
 * service map (nodes + popover title). Mirrors {@link SloStatusBadge}: it centralizes the markup,
 * tooltip, accessibility wiring, and the clickable/display-only split so the callers only decide
 * whether the badge navigates.
 *
 * `EuiBadgeProps` is a discriminated union, so `onClick` cannot be spread conditionally — the two
 * variants are rendered explicitly while sharing their static props. When non-interactive but
 * still tooltipped, the badge is wrapped in a focusable `<span>` so the tooltip is reachable by
 * keyboard (EUI requires the tooltip anchor to be focusable).
 */
export function AlertsBadge({
  count,
  serviceName,
  onClick,
  hideTooltip = false,
  ebt,
  'data-test-subj': dataTestSubj = DEFAULT_DATA_TEST_SUBJ,
}: AlertsBadgeProps) {
  const ariaLabel = getAriaLabel(count, serviceName);
  const ebtProps = onClick && ebt ? getEbtProps(ebt) : {};

  const badge = onClick ? (
    <EuiBadge
      data-test-subj={dataTestSubj}
      color="danger"
      iconType="warning"
      onClick={onClick}
      onClickAriaLabel={ariaLabel}
      tabIndex={0}
      role="button"
      css={clickableBadgeStyles}
      {...ebtProps}
    >
      {count}
    </EuiBadge>
  ) : (
    <EuiBadge
      data-test-subj={dataTestSubj}
      color="danger"
      iconType="warning"
      aria-label={ariaLabel}
    >
      {count}
    </EuiBadge>
  );

  if (hideTooltip) {
    return badge;
  }

  const tooltipContent = onClick ? getClickableTooltip(count) : getDisplayTooltip(count);

  if (onClick) {
    return (
      <EuiToolTip position="bottom" content={tooltipContent}>
        {badge}
      </EuiToolTip>
    );
  }

  return (
    <EuiToolTip position="bottom" content={tooltipContent}>
      <span tabIndex={0}>{badge}</span>
    </EuiToolTip>
  );
}
