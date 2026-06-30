/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';

import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { InferenceAPIConfigResponse } from '@kbn/ml-trained-models-utils';
import type {
  InferenceInferenceEndpointInfo,
  InferenceTaskType,
} from '@elastic/elasticsearch/lib/api/types';
import type { ServiceProviderKeys } from '@kbn/inference-endpoint-ui-common';

import { useEndpointActions } from '../../hooks/use_endpoint_actions';
import { useInferenceCapabilities } from '../../hooks/use_inference_capabilities';
import { type FilterOptions, GroupByOptions } from '../../types';
import { getModelId } from '../../utils/get_model_id';
import { isEndpointPreconfigured } from '../../utils/preconfigured_endpoint_helper';
import { EditInferenceFlyout } from '../edit_inference_endpoints/edit_inference_flyout';

import { DEFAULT_FILTER_OPTIONS } from './constants';
import { ServiceProviderFilter } from './filter/service_provider_filter';
import { TaskTypeFilter } from './filter/task_type_filter';
import { TableSearch } from './search/table_search';
import { GroupBySelect } from './group_by_select';
import { EndpointInfo } from './render_table_columns/render_endpoint/endpoint_info';
import { Model } from './render_table_columns/render_model/model';
import { ServiceProvider } from './render_table_columns/render_service_provider/service_provider';
import { DeleteAction } from './render_table_columns/render_actions/actions/delete/delete_action';

import { EndpointsTable } from './endpoints_table';
import { GroupedEndpointsTables } from './grouped_endpoints/grouped_endpoints_tables';
import { SearchContainerStyles } from './styles';

const DEFAULT_GROUP_BY = GroupByOptions.None;

const initializeGroupBy = (): GroupByOptions => {
  const params = new URLSearchParams(window.location.search);
  const groupByParam = (params.get('groupBy') ?? '').toLowerCase();

  switch (groupByParam) {
    case GroupByOptions.None:
      return GroupByOptions.None;
    case GroupByOptions.Service:
      return GroupByOptions.Service;
    default:
      // Fallback to default group by setting
      return DEFAULT_GROUP_BY;
  }
};

interface TabularPageProps {
  inferenceEndpoints: InferenceAPIConfigResponse[];
}

export const TabularPage: React.FC<TabularPageProps> = ({ inferenceEndpoints }) => {
  const [searchKey, setSearchKey] = useState('');
  const [groupBy, setGroupBy] = useState<GroupByOptions>(initializeGroupBy);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(DEFAULT_FILTER_OPTIONS);
  const { canManage } = useInferenceCapabilities();

  const {
    showDeleteAction,
    showInferenceFlyout,
    selectedInferenceEndpoint,
    copyContent,
    onCancelDeleteModal,
    displayDeleteActionItem,
    displayInferenceFlyout,
    onCloseInferenceFlyout,
  } = useEndpointActions();

  const uniqueProvidersAndTaskTypes = useMemo(() => {
    return inferenceEndpoints.reduce(
      (acc, { service, task_type: taskType }) => {
        acc.providers.add(service as ServiceProviderKeys);
        acc.taskTypes.add(taskType);
        return acc;
      },
      {
        providers: new Set<ServiceProviderKeys>(),
        taskTypes: new Set<InferenceTaskType>(),
      }
    );
  }, [inferenceEndpoints]);

  const onFilterChangedCallback = useCallback((newFilterOptions: Partial<FilterOptions>) => {
    setFilterOptions((prev) => ({ ...prev, ...newFilterOptions }));
  }, []);

  const tableColumns = useMemo<Array<EuiBasicTableColumn<InferenceInferenceEndpointInfo>>>(
    () => [
      {
        id: 'inference_id-column',
        field: 'inference_id',
        name: i18n.translate('xpack.searchInferenceEndpoints.endpoint', {
          defaultMessage: 'Endpoint',
        }),
        'data-test-subj': 'endpointCell',

        render: (
          inferenceId: InferenceInferenceEndpointInfo['inference_id'],
          endpointInfo: InferenceInferenceEndpointInfo
        ) => {
          if (inferenceId) {
            return <EndpointInfo inferenceId={inferenceId} endpointInfo={endpointInfo} />;
          }

          return null;
        },
        sortable: true,
        width: '300px',
      },
      {
        id: 'model-column',
        name: i18n.translate('xpack.searchInferenceEndpoints.model', { defaultMessage: 'Model' }),
        'data-test-subj': 'modelCell',
        render: (endpointInfo: InferenceInferenceEndpointInfo) => {
          return <Model endpointInfo={endpointInfo} />;
        },
        sortable: (endpointInfo: InferenceInferenceEndpointInfo) => getModelId(endpointInfo) ?? '',
        width: '200px',
      },
      {
        id: 'service-column',
        field: 'service',
        name: i18n.translate('xpack.searchInferenceEndpoints.serviceProvider', {
          defaultMessage: 'Service',
        }),
        'data-test-subj': 'providerCell',
        render: (service: ServiceProviderKeys, endpointInfo: InferenceInferenceEndpointInfo) => {
          if (service) {
            return <ServiceProvider service={service} endpointInfo={endpointInfo} />;
          }

          return null;
        },
        sortable: true,
        width: '285px',
      },
      {
        actions: [
          {
            name: i18n.translate('xpack.searchInferenceEndpoints.actions.viewEndpooint', {
              defaultMessage: 'View endpoint',
            }),
            description: i18n.translate('xpack.searchInferenceEndpoints.actions.viewEndpooint', {
              defaultMessage: 'View endpoint',
            }),
            icon: 'eye',
            type: 'icon',
            available: () => canManage,
            onClick: (item) => displayInferenceFlyout(item),
            'data-test-subj': 'inference-endpoints-action-view-endpoint-label',
          },
          {
            name: i18n.translate('xpack.searchInferenceEndpoints.actions.copyID', {
              defaultMessage: 'Copy endpoint ID',
            }),
            description: i18n.translate('xpack.searchInferenceEndpoints.actions.copyID', {
              defaultMessage: 'Copy endpoint ID',
            }),
            icon: 'copy',
            type: 'icon',
            onClick: (item) => copyContent(item.inference_id),
            'data-test-subj': 'inference-endpoints-action-copy-id-label',
          },
          {
            name: i18n.translate('xpack.searchInferenceEndpoints.actions.deleteEndpoint', {
              defaultMessage: 'Delete endpoint',
            }),
            description: i18n.translate('xpack.searchInferenceEndpoints.actions.deleteEndpoint', {
              defaultMessage: 'Delete endpoint',
            }),
            icon: 'trash',
            type: 'icon',
            available: () => canManage,
            enabled: (item) => !isEndpointPreconfigured(item.inference_id),
            onClick: (item) => displayDeleteActionItem(item),
            'data-test-subj': (item) =>
              isEndpointPreconfigured(item.inference_id)
                ? 'inferenceUIDeleteAction-preconfigured'
                : 'inferenceUIDeleteAction-user-defined',
          },
        ],
        width: '165px',
      },
    ],
    [canManage, copyContent, displayDeleteActionItem, displayInferenceFlyout]
  );

  return (
    <>
      <EuiFlexGroup direction="column">
        <EuiFlexGroup gutterSize="s" alignItems="center" justifyContent="spaceBetween">
          <EuiFlexItem css={SearchContainerStyles} grow={false}>
            <TableSearch searchKey={searchKey} setSearchKey={setSearchKey} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <ServiceProviderFilter
                  optionKeys={filterOptions.provider}
                  uniqueProviders={uniqueProvidersAndTaskTypes.providers}
                  onChange={onFilterChangedCallback}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <TaskTypeFilter
                  optionKeys={filterOptions.type}
                  onChange={onFilterChangedCallback}
                  uniqueTaskTypes={uniqueProvidersAndTaskTypes.taskTypes}
                />
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <GroupBySelect value={groupBy} onChange={setGroupBy} />
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
        {groupBy === GroupByOptions.None ? (
          <EndpointsTable
            inferenceEndpoints={inferenceEndpoints}
            filterOptions={filterOptions}
            searchKey={searchKey}
            columns={tableColumns}
          />
        ) : (
          <EuiFlexItem>
            <GroupedEndpointsTables
              inferenceEndpoints={inferenceEndpoints}
              groupBy={groupBy}
              filterOptions={filterOptions}
              searchKey={searchKey}
              columns={tableColumns}
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {showDeleteAction && selectedInferenceEndpoint && (
        <DeleteAction
          selectedEndpoint={selectedInferenceEndpoint}
          displayModal={showDeleteAction}
          onCancel={onCancelDeleteModal}
        />
      )}
      {showInferenceFlyout && selectedInferenceEndpoint && (
        <EditInferenceFlyout
          onFlyoutClose={onCloseInferenceFlyout}
          selectedInferenceEndpoint={selectedInferenceEndpoint}
        />
      )}
    </>
  );
};
