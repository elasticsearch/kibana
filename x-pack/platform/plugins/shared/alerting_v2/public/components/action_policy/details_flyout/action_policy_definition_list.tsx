/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiBadge,
  EuiCode,
  EuiDescriptionList,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  type EuiDescriptionListProps,
} from '@elastic/eui';
import type { ActionPolicyResponse } from '@kbn/alerting-v2-schemas';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getGroupingModeLabel, getThrottleStrategyLabel } from '../labels';
import { BadgeList } from '../badge_list';
import { PopoverItems } from '../../popover_items';
import { DestinationRow } from './destination_row';

const EMPTY_VALUE = '-';

export interface ActionPolicyDefinitionListProps {
  policy: Partial<ActionPolicyResponse>;
}

export const ActionPolicyDefinitionList = ({ policy }: ActionPolicyDefinitionListProps) => {
  const { description, tags, matcher, groupingMode, groupBy, throttle, destinations = [] } = policy;

  const items: EuiDescriptionListProps['listItems'] = [
    {
      title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.description', {
        defaultMessage: 'Description',
      }),
      description: description || EMPTY_VALUE,
    },
  ];

  items.push(
    {
      title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.tags', {
        defaultMessage: 'Tags',
      }),
      description:
        tags && tags.length > 0 ? (
          <PopoverItems
            items={tags}
            numberOfItemsToDisplay={1}
            wrapItems
            popoverTitle={i18n.translate(
              'xpack.alertingV2.actionPolicyDefinition.tags.popoverTitle',
              { defaultMessage: 'Tags' }
            )}
            popoverButtonTitle={`+${Math.max(tags.length - 1, 0)}`}
            dataTestPrefix="actionPolicyDefinitionTags"
            renderItem={(tag) => (
              <EuiBadge
                key={tag}
                color="hollow"
                title={tag}
                css={{
                  maxWidth: '100%',
                  '.euiBadge__text': { minWidth: 0 },
                }}
              >
                {tag}
              </EuiBadge>
            )}
          />
        ) : (
          EMPTY_VALUE
        ),
    },
    {
      title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.matcher', {
        defaultMessage: 'Matcher',
      }),
      description: matcher ? (
        <EuiCode>{matcher}</EuiCode>
      ) : (
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="xpack.alertingV2.actionPolicyDefinition.matchesAll"
            defaultMessage="Matches all alerts."
          />
        </EuiText>
      ),
    },
    {
      title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.dispatchMode', {
        defaultMessage: 'Dispatch per',
      }),
      description: getGroupingModeLabel(groupingMode),
    }
  );

  if (groupingMode === 'per_field' && groupBy && groupBy.length > 0) {
    items.push({
      title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.groupBy', {
        defaultMessage: 'Group by',
      }),
      description: <BadgeList items={groupBy} />,
    });
  }

  items.push({
    title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.frequency', {
      defaultMessage: 'Frequency',
    }),
    description: (
      <>
        {getThrottleStrategyLabel(throttle?.strategy, groupingMode)}
        {throttle?.interval && (
          <>
            {' '}
            <EuiText size="xs" color="subdued">
              <FormattedMessage
                id="xpack.alertingV2.actionPolicyDefinition.interval"
                defaultMessage="Every {interval}"
                values={{ interval: throttle.interval }}
              />
            </EuiText>
          </>
        )}
      </>
    ),
  });

  items.push({
    title: i18n.translate('xpack.alertingV2.actionPolicyDefinition.destinations', {
      defaultMessage: 'Destinations',
    }),
    description:
      destinations.length === 0 ? (
        EMPTY_VALUE
      ) : (
        <EuiFlexGroup direction="column" gutterSize="xs">
          {destinations.map((destination) => (
            <EuiFlexItem key={`${destination.type}-${destination.id}`}>
              <DestinationRow destination={destination} />
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      ),
  });

  return (
    <EuiDescriptionList
      compressed
      type="column"
      columnWidths={[1, 3]}
      descriptionProps={{ style: { minWidth: 0 } }}
      listItems={items}
    />
  );
};
