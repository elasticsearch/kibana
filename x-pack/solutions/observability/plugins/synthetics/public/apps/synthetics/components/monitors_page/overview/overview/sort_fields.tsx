/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import type { PayloadAction } from 'redux-toolkit-v1';
import { useDispatch, useSelector } from 'react-redux-v7';
import { i18n } from '@kbn/i18n';
import { EuiFlexGroup, EuiFlexItem, EuiTitle } from '@elastic/eui';
import type { MonitorListSortField } from '../../../../../../../common/runtime_types/monitor_management/sort_field';
import { ConfigKey } from '../../../../../../../common/runtime_types';

import { selectOverviewPageState, setOverviewPageStateAction } from '../../../../state/overview';
import { SortMenu } from './sort_menu';

export const SortFields = () => {
  const { sortOrder, sortField } = useSelector(selectOverviewPageState);
  const dispatch = useDispatch();
  const { asc, desc, label } = getOrderContent(sortField);
  const handleSortChange = (payloadAction: PayloadAction<unknown>) => {
    dispatch(payloadAction);
  };

  const orderByOptions = [
    {
      label: asc,
      value: 'asc',
      checked: sortOrder === 'asc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortOrder: 'asc',
            page: 1,
          })
        );
      },
    },
    {
      label: desc,
      value: 'desc',
      checked: sortOrder === 'desc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortOrder: 'desc',
            page: 1,
          })
        );
      },
    },
  ];
  const sortByOptions = [
    {
      label: STATUS_LABEL,
      value: 'status',
      checked: sortField === 'status',
      defaultSortOrder: 'asc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: 'status',
            sortOrder: 'asc',
            page: 1,
          })
        );
      },
    },
    {
      label: ALPHABETICAL_LABEL,
      value: `${ConfigKey.NAME}.keyword`,
      checked: sortField === `${ConfigKey.NAME}.keyword`,
      defaultSortOrder: 'asc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: `${ConfigKey.NAME}.keyword`,
            sortOrder: 'asc',
            page: 1,
          })
        );
      },
    },
    {
      label: URL_LABEL,
      value: 'urls',
      checked: sortField === 'urls',
      defaultSortOrder: 'asc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: 'urls',
            sortOrder: 'asc',
            page: 1,
          })
        );
      },
    },
    {
      label: MONITOR_TYPE_LABEL,
      value: `${ConfigKey.MONITOR_TYPE}.keyword`,
      checked: sortField === `${ConfigKey.MONITOR_TYPE}.keyword`,
      defaultSortOrder: 'asc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: `${ConfigKey.MONITOR_TYPE}.keyword`,
            sortOrder: 'asc',
            page: 1,
          })
        );
      },
    },
    {
      label: LAST_MODIFIED_LABEL,
      value: 'updated_at',
      checked: sortField === 'updated_at',
      defaultSortOrder: 'desc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: 'updated_at',
            sortOrder: 'desc',
            page: 1,
          })
        );
      },
    },
    {
      label: CREATED_LABEL,
      value: 'created_at',
      checked: sortField === 'created_at',
      defaultSortOrder: 'desc',
      onClick: () => {
        handleSortChange(
          setOverviewPageStateAction({
            sortField: 'created_at',
            sortOrder: 'desc',
          })
        );
      },
    },
  ];

  return (
    <EuiFlexGroup gutterSize="s" alignItems="center">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup responsive={false} gutterSize="none" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiTitle size="xxxs">
              <span>{SORT_TITLE}</span>
            </EuiTitle>
          </EuiFlexItem>
          <EuiFlexItem grow={false} data-test-subj="syntheticsOverviewSortButton">
            <SortMenu sortOptions={sortByOptions} orderOptions={orderByOptions} sortField={label} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const getOrderContent = (sortField: MonitorListSortField) => {
  switch (sortField) {
    case `${ConfigKey.NAME}.keyword`:
      return {
        asc: SORT_ALPHABETICAL_ASC,
        desc: SORT_ALPHABETICAL_DESC,
        label: ALPHABETICAL_LABEL,
      };
    case 'updated_at':
      return {
        asc: SORT_UPDATED_ASC,
        desc: SORT_UPDATED_DESC,
        label: LAST_MODIFIED_LABEL,
      };
    case 'created_at':
      return {
        asc: SORT_UPDATED_ASC,
        desc: SORT_UPDATED_DESC,
        label: CREATED_LABEL,
      };
    case 'status':
      return {
        asc: SORT_STATUS_ASC,
        desc: SORT_STATUS_DESC,
        label: STATUS_LABEL,
      };
    case 'urls':
      return {
        asc: SORT_ALPHABETICAL_ASC,
        desc: SORT_ALPHABETICAL_DESC,
        label: URL_LABEL,
      };
    case `${ConfigKey.MONITOR_TYPE}.keyword`:
      return {
        asc: SORT_ALPHABETICAL_ASC,
        desc: SORT_ALPHABETICAL_DESC,
        label: MONITOR_TYPE_LABEL,
      };
    default:
      return {
        asc: ASCENDING_LABEL,
        desc: DESCENDING_LABEL,
        label: '',
      };
  }
};

const SORT_TITLE = i18n.translate('xpack.synthetics.overview.sortPopover.sort.title', {
  defaultMessage: 'Sort by',
});

const SORT_ALPHABETICAL_ASC = i18n.translate(
  'xpack.synthetics.overview.sortPopover.alphabetical.asc',
  {
    defaultMessage: 'A -> Z',
    description: 'Describes ascending alphabetical sort order',
  }
);

const SORT_ALPHABETICAL_DESC = i18n.translate(
  'xpack.synthetics.overview.sortPopover.alphabetical.desc',
  {
    defaultMessage: 'Z -> A',
    description: 'Describes descending alphabetical sort order',
  }
);

const SORT_UPDATED_ASC = i18n.translate('xpack.synthetics.overview.sortPopover.lastModified.asc', {
  defaultMessage: 'Oldest first',
});

const SORT_UPDATED_DESC = i18n.translate(
  'xpack.synthetics.overview.sortPopover.lastModified.desc',
  {
    defaultMessage: 'Newest first',
  }
);

const SORT_STATUS_ASC = i18n.translate('xpack.synthetics.overview.sortPopover.status.asc', {
  defaultMessage: 'Down first',
});

const SORT_STATUS_DESC = i18n.translate('xpack.synthetics.overview.sortPopover.status.desc', {
  defaultMessage: 'Up first',
});

const ASCENDING_LABEL = i18n.translate('xpack.synthetics.overview.sortPopover.ascending.label', {
  defaultMessage: 'Ascending',
});

const DESCENDING_LABEL = i18n.translate('xpack.synthetics.overview.sortPopover.descending.label', {
  defaultMessage: 'Descending',
});

const STATUS_LABEL = i18n.translate('xpack.synthetics.overview.sortPopover.status.label', {
  defaultMessage: 'Status',
});

const URL_LABEL = i18n.translate('xpack.synthetics.overview.sortPopover.url.label', {
  defaultMessage: 'URL',
});

const MONITOR_TYPE_LABEL = i18n.translate(
  'xpack.synthetics.overview.sortPopover.monitorType.label',
  {
    defaultMessage: 'Monitor type',
  }
);

const ALPHABETICAL_LABEL = i18n.translate(
  'xpack.synthetics.overview.sortPopover.alphabetical.label',
  {
    defaultMessage: 'Alphabetical',
  }
);

const LAST_MODIFIED_LABEL = i18n.translate(
  'xpack.synthetics.overview.sortPopover.lastModified.label',
  {
    defaultMessage: 'Last modified',
  }
);

const CREATED_LABEL = i18n.translate('xpack.synthetics.overview.sortPopover.createdLabel', {
  defaultMessage: 'Created',
});
