/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiPageHeader,
  EuiSpacer,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useKibanaTimeZone } from '../../hooks/use_kibana_time_zone';

/**
 * `timeZone` rather than `new Date().getHours()`: the OS timezone is not
 * necessarily the one Kibana renders in, and greeting someone "good evening" at
 * 10am is the visible cost of assuming it is.
 */
const getAlertZeroGreeting = (timeZone?: string): string => {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone }).format(
      new Date()
    )
  );

  if (hour < 12) {
    return i18n.translate('xpack.alertzero.hero.morningGreetingDescription', {
      defaultMessage: 'Good morning!',
    });
  }

  if (hour < 18) {
    return i18n.translate('xpack.alertzero.hero.afternoonGreetingDescription', {
      defaultMessage: 'Good afternoon!',
    });
  }

  return i18n.translate('xpack.alertzero.hero.eveningGreetingDescription', {
    defaultMessage: 'Good evening!',
  });
};

const getAlertZeroHeroTitle = ({
  isQueueEmpty,
  isLoading,
  hasError,
  hasNeedsAction,
  eventCount,
}: {
  isQueueEmpty: boolean;
  isLoading: boolean;
  hasError: boolean;
  hasNeedsAction: boolean;
  eventCount: number;
}): string => {
  if (isLoading) {
    return i18n.translate('xpack.alertzero.hero.checkingTitle', {
      defaultMessage: 'Looking into your data...',
    });
  }

  // Before every count-bearing branch. A failed count arrives as zero, which is
  // indistinguishable from "nothing to do" — and claiming the queue is clear over
  // a queue that is not is the worst thing this header can say.
  if (hasError) {
    return i18n.translate('xpack.alertzero.hero.countUnavailableTitle', {
      defaultMessage: "Your action count couldn't be loaded",
    });
  }

  if (isQueueEmpty) {
    return i18n.translate('xpack.alertzero.hero.noEventsTitle', {
      defaultMessage: 'No events found',
    });
  }

  if (hasNeedsAction) {
    return i18n.translate('xpack.alertzero.hero.needsActionTitle', {
      defaultMessage: '{eventCount, plural, one {# action needs you} other {# actions need you}}',
      values: {
        eventCount,
      },
    });
  }

  return i18n.translate('xpack.alertzero.hero.allClearTitle', {
    defaultMessage: "You're all caught up",
  });
};

export interface AlertZeroPageHeaderProps {
  isQueueEmpty?: boolean;
  isLoading?: boolean;
  /** The count could not be fetched, so `eventCount` says nothing about reality. */
  hasError?: boolean;
  eventCount?: number;
}
/**
 * Page header for AlertZero routes.
 *
 * Important: keep everything in `EuiPageHeader` children and do **not** pass
 * `rightSideItems` into EUI. When `rightSideItems` is set, EUI leaves the
 * children-only path and prepends an `EuiSpacer` before custom children —
 * which pushes Watches (and any page with actions) down vs placeholders.
 */
export const AlertZeroPageHeader: React.FC<AlertZeroPageHeaderProps> = ({
  isQueueEmpty = false,
  isLoading = false,
  hasError = false,
  eventCount = 0,
}) => {
  const { euiTheme } = useEuiTheme();
  const timeZone = useKibanaTimeZone();
  const title = getAlertZeroHeroTitle({
    isQueueEmpty,
    isLoading,
    hasError,
    hasNeedsAction: eventCount > 0,
    eventCount,
  });
  return (
    <>
      <EuiPageHeader
        alignItems="center"
        bottomBorder={false}
        responsive
        data-test-subj="alertZeroPageHeader"
      >
        <EuiFlexGroup
          alignItems="center"
          justifyContent="flexStart"
          gutterSize="m"
          responsive={false}
          wrap
        >
          <EuiFlexItem grow={false}>
            <div
              aria-label={i18n.translate('xpack.alertzero.hero.alertZeroIconAriaLabel', {
                defaultMessage: 'AlertZero',
              })}
              role="img"
              css={css`
                align-items: center;
                border: 1px solid ${euiTheme.colors.lightShade};
                border-radius: 50%;
                color: ${euiTheme.colors.textAssistance};
                display: inline-flex;
                height: calc(${euiTheme.size.xxl} + ${euiTheme.size.s});
                justify-content: center;
                position: relative;
                width: calc(${euiTheme.size.xxl} + ${euiTheme.size.s});
                transition: background ${euiTheme.animation.slow} ease,
                  border-color ${euiTheme.animation.slow} ease;
              `}
            >
              <EuiIcon type="sun" size="m" aria-hidden={true} />
              <span
                style={{
                  display: 'inline-block',
                  background: `${euiTheme.colors.danger}`,
                  width: `${euiTheme.size.s}`,
                  height: `${euiTheme.size.s}`,
                  borderRadius: '50%',
                  boxShadow: `0 0 0 2px ${euiTheme.colors.textGhost}`,
                  position: 'absolute',
                  pointerEvents: 'none',
                  top: '1px',
                  right: '1px',
                }}
              />
            </div>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiTitle size="m" css={{ fontWeight: 500 }}>
              <h1>
                <span style={{ color: euiTheme.colors.mediumShade }}>
                  {getAlertZeroGreeting(timeZone)}
                </span>{' '}
                <span>{title}</span>
              </h1>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiPageHeader>
      <EuiSpacer size="l" />
    </>
  );
};
