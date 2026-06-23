/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlexItem, EuiPopover, EuiBadge, EuiSpacer, EuiButton, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useMonitorIntegrationHealth } from '../../common/hooks/use_monitor_integration_health';

export const UnhealthyCountBadge = ({ item }: { item: { id: string; label: string } }) => {
  const { getUnhealthyMonitorCountForLocation, getUnhealthyConfigIdsForLocation } =
    useMonitorIntegrationHealth();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const history = useHistory();

  const unhealthyMonitorCount = getUnhealthyMonitorCountForLocation(item.id);

  if (unhealthyMonitorCount === 0) {
    return null;
  }

  const unhealthyConfigIds = getUnhealthyConfigIdsForLocation(item.id);
  const href = history.createHref({
    pathname: '/monitors',
    search: `?locations=${JSON.stringify([item.label])}&configIds=${JSON.stringify(
      unhealthyConfigIds
    )}`,
  });

  const badge = (
    <EuiBadge
      color="warning"
      data-test-subj="syntheticsLocationMissingIntegrationBadge"
      onClick={() => setIsPopoverOpen((prev) => !prev)}
      onClickAriaLabel={UNHEALTHY_MONITORS_ARIA_LABEL}
    >
      {i18n.translate('xpack.synthetics.privateLocations.missingIntegrations.count', {
        defaultMessage: '{count, plural, one {# unhealthy monitor} other {# unhealthy monitors}}',
        values: { count: unhealthyMonitorCount },
      })}
    </EuiBadge>
  );

  return (
    <EuiFlexItem grow={false}>
      <EuiPopover
        button={badge}
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        aria-label={i18n.translate('xpack.synthetics.unhealthyCountBadge.popoverAriaLabel', {
          defaultMessage: 'Unhealthy monitors details',
        })}
      >
        <EuiText size="s">
          <FormattedMessage
            id="xpack.synthetics.privateLocations.missingIntegrations.popover"
            defaultMessage="{count, plural, one {# monitor} other {# monitors}} at <strong>{name}</strong> {count, plural, one {is} other {are}} unhealthy and will not run until resolved."
            values={{
              count: unhealthyMonitorCount,
              name: item.label,
              strong: (chunks: React.ReactNode) => <strong>{chunks}</strong>,
            }}
          />
        </EuiText>
        <EuiSpacer size="s" />
        <EuiButton size="s" data-test-subj="syntheticsViewUnhealthyMonitorsButton" href={href}>
          {VIEW_MONITORS_LABEL}
        </EuiButton>
      </EuiPopover>
    </EuiFlexItem>
  );
};

const VIEW_MONITORS_LABEL = i18n.translate(
  'xpack.synthetics.privateLocations.missingIntegrations.viewMonitors',
  { defaultMessage: 'View monitors' }
);

const UNHEALTHY_MONITORS_ARIA_LABEL = i18n.translate(
  'xpack.synthetics.privateLocations.missingIntegrations.ariaLabel',
  { defaultMessage: 'View unhealthy monitors' }
);
