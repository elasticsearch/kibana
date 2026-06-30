/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiListGroup,
  EuiPanel,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { SignificantEvent } from '@kbn/significant-events-schema';

const ROOT_CAUSE_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.rootCause', {
  defaultMessage: 'Root Cause',
});
const RECOMMENDATIONS_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.recommendations', {
  defaultMessage: 'Recommendations',
});
const CAUSE_KIS_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.causeKis', {
  defaultMessage: 'Cause KIs',
});
const STREAMS_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.streams', {
  defaultMessage: 'Streams',
});
const RULES_TITLE = i18n.translate('xpack.streams.sigEventsTab.flyout.rules', {
  defaultMessage: 'Rules',
});

const evidencePanelCss = css`
  margin-bottom: 4px;
`;

const BadgeRow = ({ items, color }: { items: string[]; color?: string }) => (
  <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
    {items.map((item, idx) => (
      <EuiFlexItem grow={false} key={`${item}-${idx}`}>
        <EuiBadge color={color ?? 'default'}>{item}</EuiBadge>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
);

interface SigEventDetailsProps {
  event: SignificantEvent;
}

export const SigEventDetails = ({ event }: SigEventDetailsProps) => {
  const ruleNames = event.rule_names ?? [];

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      {event.summary && (
        <EuiText size="s">
          <p>{event.summary}</p>
        </EuiText>
      )}

      {event.root_cause && (
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiTitle size="xs">
            <h3>{ROOT_CAUSE_TITLE}</h3>
          </EuiTitle>
          <EuiPanel color="plain" hasBorder paddingSize="s">
            <EuiText size="s">
              <p>{event.root_cause}</p>
            </EuiText>
          </EuiPanel>
        </EuiFlexGroup>
      )}

      {event.recommendations && event.recommendations.length > 0 && (
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiTitle size="xs">
            <h3>{RECOMMENDATIONS_TITLE}</h3>
          </EuiTitle>
          <EuiPanel color="subdued" paddingSize="s" hasBorder={false}>
            <EuiListGroup
              listItems={event.recommendations.map((rec, idx) => ({
                label: `${idx + 1}. ${rec}`,
                size: 's' as const,
                wrapText: true,
              }))}
              bordered={false}
              maxWidth={false}
            />
          </EuiPanel>
        </EuiFlexGroup>
      )}

      {event.evidences && event.evidences.length > 0 && (
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiTitle size="xs">
            <h3>
              {i18n.translate('xpack.streams.sigEventsTab.flyout.evidence', {
                defaultMessage: 'Evidence ({count})',
                values: { count: event.evidences.length },
              })}
            </h3>
          </EuiTitle>
          {event.evidences.map((ev, idx) => (
            <EuiPanel key={idx} color="plain" hasBorder paddingSize="s" css={evidencePanelCss}>
              <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
                {ev.rule_name && (
                  <EuiFlexItem grow={false}>
                    <EuiText size="s">
                      <strong>{ev.rule_name}</strong>
                    </EuiText>
                  </EuiFlexItem>
                )}
                {ev.stream_name && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="hollow">{ev.stream_name}</EuiBadge>
                  </EuiFlexItem>
                )}
                {ev.result && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color={ev.result === 'anomaly' ? 'warning' : 'hollow'}>
                      {ev.result}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
              {ev.description && (
                <EuiText size="xs" color="subdued">
                  {ev.description}
                </EuiText>
              )}
            </EuiPanel>
          ))}
        </EuiFlexGroup>
      )}

      {event.cause_kis && event.cause_kis.length > 0 && (
        <EuiFlexGroup direction="column" gutterSize="xs">
          <EuiTitle size="xxs">
            <h4>{CAUSE_KIS_TITLE}</h4>
          </EuiTitle>
          <BadgeRow
            items={event.cause_kis.map(
              (ki) => `${ki.name || '-'}${ki.stream_name ? ` (${ki.stream_name})` : ''}`
            )}
          />
        </EuiFlexGroup>
      )}

      <EuiFlexGroup direction="column" gutterSize="xs">
        <EuiTitle size="xxs">
          <h4>{STREAMS_TITLE}</h4>
        </EuiTitle>
        <BadgeRow items={event.stream_names ?? []} color="hollow" />
      </EuiFlexGroup>

      {ruleNames.length > 0 && (
        <EuiFlexGroup direction="column" gutterSize="xs">
          <EuiTitle size="xxs">
            <h4>{RULES_TITLE}</h4>
          </EuiTitle>
          <BadgeRow items={ruleNames} />
        </EuiFlexGroup>
      )}
    </EuiFlexGroup>
  );
};
