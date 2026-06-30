/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiButtonGroup } from '@elastic/eui';
import { useOverviewStatusState } from '../../hooks/use_overview_status';
import { useGetUrlParams, useUrlParams } from '../../../../hooks';

export const QuickFilters = () => {
  const { statusFilter } = useGetUrlParams();
  const [_, updateUrlParams] = useUrlParams();
  const { status } = useOverviewStatusState();

  const handleFilterUpdate = (monitorStatus: string) => {
    updateUrlParams({ statusFilter: statusFilter !== monitorStatus ? monitorStatus : undefined });
  };

  const statusButtons = [
    {
      id: 'up',
      label: UP_LABEL,
    },
    {
      id: 'down',
      label: DOWN_LABEL,
    },
    {
      id: 'disabled',
      label: DISABLED_LABEL,
    },
  ];
  if (status?.pending && status?.pending > 0) {
    statusButtons.push({
      id: 'pending',
      label: PENDING_LABEL,
    });
  }
  if (status?.stale && status?.stale > 0) {
    statusButtons.push({
      id: 'stale',
      label: STALE_LABEL,
    });
  }
  return (
    <EuiButtonGroup
      buttonSize="m"
      legend={i18n.translate('xpack.synthetics.overview.status.filters.legend', {
        defaultMessage: 'Monitor status',
      })}
      options={statusButtons}
      idSelected={statusFilter}
      onChange={handleFilterUpdate}
    />
  );
};

const DOWN_LABEL = i18n.translate('xpack.synthetics.overview.status.filters.down', {
  defaultMessage: 'Down',
});

const UP_LABEL = i18n.translate('xpack.synthetics.overview.status.filters.up', {
  defaultMessage: 'Up',
});

const DISABLED_LABEL = i18n.translate('xpack.synthetics.overview.status.filters.disabled', {
  defaultMessage: 'Disabled',
});

const PENDING_LABEL = i18n.translate('xpack.synthetics.overview.status.filters.pending', {
  defaultMessage: 'Pending',
});

const STALE_LABEL = i18n.translate('xpack.synthetics.overview.status.filters.stale', {
  defaultMessage: 'Stale',
});
