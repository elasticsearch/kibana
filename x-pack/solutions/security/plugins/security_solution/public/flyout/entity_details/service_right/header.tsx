/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiSpacer, EuiBadge, EuiText, EuiFlexItem, EuiFlexGroup } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import React, { useMemo } from 'react';

import { EntityType } from '../../../../common/search_strategy';
import type { RiskSeverity } from '../../../../common/search_strategy';
import { EntityIconByType } from '../../../entity_analytics/components/entity_store/helpers';
import type { ServiceItem } from '../../../../common/search_strategy/security_solution/services/common';
import { PreferenceFormattedDate } from '../../../common/components/formatted_date';
import { FlyoutHeader } from '../../shared/components/flyout_header';
import { FlyoutTitle } from '../../../flyout_v2/shared/components/flyout_title';
import type { ObservedEntityData } from '../../../flyout_v2/entity/shared/components/observed_entity/types';
import { EntitySourceBadge } from '../shared/components/entity_source_badge';
import { RiskLevelBadge } from '../shared/components/risk_level_badge';

interface ServicePanelHeaderProps {
  serviceName: string;
  observedService: ObservedEntityData<ServiceItem>;
  isEntityInStore?: boolean;
  riskLevel?: RiskSeverity;
}

export const ServicePanelHeader = ({
  serviceName,
  observedService,
  isEntityInStore,
  riskLevel,
}: ServicePanelHeaderProps) => {
  const lastSeenDate = useMemo(
    () => observedService.lastSeen.date && new Date(observedService.lastSeen.date),
    [observedService.lastSeen]
  );

  return (
    <FlyoutHeader data-test-subj="service-panel-header">
      <EuiFlexGroup gutterSize="s" responsive={false} direction="column">
        <EuiFlexItem grow={false}>
          <EuiText size="xs" data-test-subj={'service-panel-header-lastSeen'}>
            {lastSeenDate && <PreferenceFormattedDate value={lastSeenDate} />}
            <EuiSpacer size="xs" />
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <FlyoutTitle title={serviceName} iconType={EntityIconByType[EntityType.service]} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
            <EuiFlexItem grow={false}>
              <EuiBadge data-test-subj="service-panel-header-entity-type-badge" color="hollow">
                <FormattedMessage
                  id="xpack.securitySolution.flyout.entityDetails.service.entityTypeBadge"
                  defaultMessage="Service"
                />
              </EuiBadge>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EntitySourceBadge
                isEntityInStore={!!isEntityInStore}
                hasLastSeenDate={!!observedService.lastSeen.date}
                data-test-subj="service-panel-header-observed-badge"
              />
            </EuiFlexItem>
            {isEntityInStore && riskLevel && (
              <EuiFlexItem grow={false}>
                <RiskLevelBadge riskLevel={riskLevel} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    </FlyoutHeader>
  );
};
