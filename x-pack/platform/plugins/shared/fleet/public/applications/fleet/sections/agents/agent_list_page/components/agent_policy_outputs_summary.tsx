/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useState } from 'react';

import type { EuiListGroupItemProps } from '@elastic/eui';
import {
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiListGroup,
  EuiPopover,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { useLink } from '../../../../hooks';
import type { OutputsForAgentPolicy } from '../../../../../../../common/types';

export const AgentPolicyOutputsSummary: React.FC<{
  outputs?: OutputsForAgentPolicy;
  isMonitoring?: boolean;
}> = ({ outputs, isMonitoring }) => {
  const { getHref } = useLink();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const closePopover = () => setIsPopoverOpen(false);

  const monitoring = outputs?.monitoring;
  const data = outputs?.data;

  const listItems: EuiListGroupItemProps[] = useMemo(() => {
    if (!data?.integrations) return [];

    return (data?.integrations || []).map((integration, index) => {
      return {
        'data-test-subj': `output-integration-${index}`,
        label: `${integration.integrationPolicyName}: ${integration.name}`,
        href: getHref('settings_edit_outputs', { outputId: integration?.id ?? '' }),
        wrapText: true,
      };
    });
  }, [getHref, data?.integrations]);

  return (
    <EuiFlexGroup
      gutterSize="s"
      alignItems="baseline"
      responsive={false}
      justifyContent="flexStart"
    >
      {isMonitoring ? (
        <EuiFlexItem grow={false}>
          <EuiLink
            href={getHref('settings_edit_outputs', { outputId: monitoring?.output?.id ?? '' })}
            title={monitoring?.output.name}
            data-test-subj="outputNameLink"
          >
            {monitoring?.output.name}
          </EuiLink>
        </EuiFlexItem>
      ) : (
        <EuiFlexItem grow={false}>
          <EuiLink
            href={getHref('settings_edit_outputs', { outputId: data?.output?.id ?? '' })}
            title={data?.output.name}
            data-test-subj="outputNameLink"
          >
            {data?.output.name}
          </EuiLink>
        </EuiFlexItem>
      )}

      {data?.integrations && data?.integrations.length >= 1 && !isMonitoring && (
        <EuiFlexItem grow={false}>
          <EuiBadge
            color="hollow"
            data-test-subj="outputsIntegrationsNumberBadge"
            onClick={() => setIsPopoverOpen(!isPopoverOpen)}
            onClickAriaLabel="Open output integrations popover"
          >
            <FormattedMessage
              id="xpack.fleet.AgentPolicyOutputsSummary.popover.countBadge"
              defaultMessage="{count} more"
              values={{
                count: `+${data?.integrations.length}`,
              }}
            />
          </EuiBadge>
          <EuiPopover
            aria-label={i18n.translate('xpack.fleet.agentPolicyOutputsSummary.popoverAriaLabel', {
              defaultMessage: 'Output integrations',
            })}
            data-test-subj="outputPopover"
            isOpen={isPopoverOpen}
            closePopover={closePopover}
            anchorPosition="downCenter"
            panelPaddingSize="s"
          >
            <EuiListGroup listItems={listItems} color="primary" />
          </EuiPopover>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
