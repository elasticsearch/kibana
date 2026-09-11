/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { useEuiTheme } from '@elastic/eui';

import type { StatItems } from '../../../../components/stat_items';
import { useSpaceId } from '../../../../../common/hooks/use_space_id';
import { KpiBaseComponent } from '../../../../components/kpi';
import { buildKpiTotalUsersMetricLensAttributes } from '../../../../../common/components/visualization_actions/lens_attributes/users/kpi_total_users_metric';
import { getKpiTotalUsersAreaLensAttributes } from '../../../../../common/components/visualization_actions/lens_attributes/users/kpi_total_users_area';
import { useExploreEntityStoreV2Enabled } from '../../../../hooks/use_explore_entity_store_v2_enabled';
import * as i18n from './translations';
import type { UsersKpiProps } from '../types';

export const useGetUsersStatItems: () => Readonly<StatItems[]> = () => {
  const { euiTheme } = useEuiTheme();
  const spaceId = useSpaceId();
  const entityStoreV2Enabled = useExploreEntityStoreV2Enabled();

  return useMemo(
    () => [
      {
        key: 'users',
        fields: [
          {
            key: 'users',
            color: euiTheme.colors.vis.euiColorVis0,
            icon: 'storage',
            lensAttributes: buildKpiTotalUsersMetricLensAttributes(
              entityStoreV2Enabled ? { entityStoreV2Enabled: true, spaceId } : undefined
            ),
          },
        ],
        enableAreaChart: true,
        description: i18n.USERS,
        getAreaChartLensAttributes: getKpiTotalUsersAreaLensAttributes,
      },
    ],
    [euiTheme.colors.vis.euiColorVis0, entityStoreV2Enabled, spaceId]
  );
};

const ID = 'TotalUsersKpiQuery';

const TotalUsersKpiComponent: React.FC<UsersKpiProps> = ({ from, to }) => {
  const usersStatItems = useGetUsersStatItems();
  return <KpiBaseComponent id={ID} statItems={usersStatItems} from={from} to={to} />;
};

export const TotalUsersKpi = React.memo(TotalUsersKpiComponent);
