/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import React, { useMemo, useCallback } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiFlexItem,
  EuiFlexGroup,
  EuiIcon,
  EuiFormRow,
  EuiComboBox,
  EuiBadge,
  EuiText,
  useEuiTheme,
  EuiTextTruncate,
  EuiBadgeGroup,
  EuiFormPrepend,
} from '@elastic/eui';
import { useMutation, useQueryClient } from '@kbn/react-query';
import type { Connector as BaseConnector } from '@kbn/search-connectors';
import { css } from '@emotion/react';

import { BETA_LABEL, TECH_PREVIEW_LABEL } from '../../../../common/i18n_string';

interface Connector extends BaseConnector {
  iconPath?: string;
}
import { useKibanaServices } from '../../hooks/use_kibana';
import { useConnectorTypes } from '../../hooks/api/use_connector_types';
import { useConnector } from '../../hooks/api/use_connector';

interface EditServiceTypeProps {
  connector: Connector;
  isDisabled?: boolean;
}
interface ConnectorDataSource {
  _icon: React.ReactNode[];
  _badges: React.ReactNode;
  serviceType: string;
}

type ExpandedComboBoxOption = EuiComboBoxOptionOption<ConnectorDataSource>;

interface GeneratedConnectorNameResult {
  connectorName: string;
  indexName: string;
}

export const EditServiceType: React.FC<EditServiceTypeProps> = ({ connector, isDisabled }) => {
  const { http } = useKibanaServices();
  const connectorTypes = useConnectorTypes();
  const queryClient = useQueryClient();
  const { queryKey } = useConnector(connector.id);

  const allConnectors = useMemo(
    () => connectorTypes.sort((a, b) => a.name.localeCompare(b.name)),
    [connectorTypes]
  );

  const { isLoading, mutate } = useMutation({
    mutationFn: async (inputServiceType: string) => {
      if (inputServiceType === null || inputServiceType === '') {
        return { serviceType: inputServiceType, name: connector.name };
      }
      const body = { service_type: inputServiceType };
      await http.post(`/internal/serverless_search/connectors/${connector.id}/service_type`, {
        body: JSON.stringify(body),
      });

      // if name is empty, auto generate it and a similar index name
      const results: Record<string, GeneratedConnectorNameResult> = await http.post(
        `/internal/serverless_search/connectors/${connector.id}/generate_name`,
        {
          body: JSON.stringify({
            name: connector.name,
            is_native: connector.is_native,
            service_type: inputServiceType,
          }),
        }
      );

      const connectorName = results.result.connectorName;
      const indexName = results.result.indexName;

      // save the generated connector name
      await http.post(`/internal/serverless_search/connectors/${connector.id}/name`, {
        body: JSON.stringify({ name: connectorName || '' }),
      });

      // save the generated index name (this does not create an index)
      try {
        // this can fail if another connector has an identical index_name value despite no index being created yet.
        // in this case we just won't update the index_name, the user can do that manually when they reach that step.
        await http.post(`/internal/serverless_search/connectors/${connector.id}/index_name`, {
          body: JSON.stringify({ index_name: indexName }),
        });
      } catch {
        // do nothing
      }

      return { serviceType: inputServiceType, name: connectorName };
    },
    onSuccess: (successData) => {
      queryClient.setQueryData(queryKey, {
        connector: { ...connector, service_type: successData.serviceType, name: successData.name },
      });
      queryClient.invalidateQueries(queryKey);
    },
  });

  const getInitialOptions = (): ExpandedComboBoxOption[] => {
    return allConnectors.map((conn, key) => {
      const _icon: React.ReactNode[] = [];
      let _ariaLabelAppend = '';
      if (conn.isTechPreview) {
        _icon.push(
          <EuiBadge
            aria-label={TECH_PREVIEW_LABEL}
            key={key + '-preview'}
            iconType="flask"
            color="hollow"
          >
            {i18n.translate(
              'xpack.serverlessSearch.connectors.chooseConnectorSelectable.thechPreviewBadgeLabel',
              { defaultMessage: 'Tech preview' }
            )}
          </EuiBadge>
        );
        _ariaLabelAppend += ` ${TECH_PREVIEW_LABEL}`;
      }
      if (conn.isBeta) {
        _icon.push(
          <EuiBadge aria-label={BETA_LABEL} key={key + '-beta'} iconType={'beta'} color="hollow">
            {BETA_LABEL}
          </EuiBadge>
        );
        _ariaLabelAppend += ` ${BETA_LABEL}`;
      }
      return {
        key: key.toString(),
        label: conn.name,
        value: {
          _icon,
          _badges: <EuiIcon size="l" type={conn.iconPath} aria-hidden={true} />,
          serviceType: conn.serviceType,
        },
        'aria-label': conn.name + _ariaLabelAppend,
      };
    });
  };

  const initialOptions = getInitialOptions();
  const { euiTheme } = useEuiTheme();

  const renderOption = (
    option: ExpandedComboBoxOption,
    searchValue: string,
    contentClassName: string
  ) => {
    const {
      value: { _icon, _badges, serviceType } = { _icon: [], _badges: null, serviceType: '' },
      key,
      label,
    } = option;
    return (
      <EuiFlexGroup
        className={contentClassName}
        key={key + '-span'}
        gutterSize="m"
        responsive={false}
        direction="row"
      >
        <EuiFlexItem grow={false}>{_badges}</EuiFlexItem>
        <EuiFlexItem
          css={css`
            overflow: auto;
          `}
          grow
          data-test-subj={`serverlessSearchConnectorServiceType-${serviceType}`}
        >
          <EuiText textAlign="left" size="s">
            <EuiTextTruncate text={label} truncation="end" />
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiBadgeGroup gutterSize="xs">{_icon}</EuiBadgeGroup>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  };

  const onSelectedOptionChange = useCallback(
    (selectedItem: Array<EuiComboBoxOptionOption<ConnectorDataSource>>) => {
      if (selectedItem.length === 0) {
        return;
      }
      const keySelected = Number(selectedItem[0].key);
      mutate(allConnectors[keySelected].serviceType);
    },
    [mutate, allConnectors]
  );
  const selectedOptions = useMemo(() => {
    const selectedOption = initialOptions.find(
      (option) => option.value?.serviceType === connector.service_type
    );
    return selectedOption ? [selectedOption] : [];
  }, [initialOptions, connector.service_type]);

  return (
    <EuiFormRow
      label={i18n.translate('xpack.serverlessSearch.connectors.serviceTypeLabel', {
        defaultMessage: 'Connector type',
      })}
      data-test-subj="serverlessSearchEditConnectorType"
      fullWidth
    >
      <EuiComboBox<ConnectorDataSource>
        aria-label={i18n.translate(
          'xpack.serverlessSearch.connectors.chooseConnectorSelectable.euiComboBox.accessibleScreenReaderLabelLabel',
          { defaultMessage: 'Select a data source for your connector to use.' }
        )}
        isDisabled={Boolean(connector.service_type) || isDisabled}
        isLoading={isLoading}
        data-test-subj="serverlessSearchEditConnectorTypeChoices"
        prepend={
          <EuiFormPrepend
            iconLeft={
              connector.service_type
                ? connectorTypes.find((conn) => conn.serviceType === connector.service_type)
                    ?.iconPath ?? ''
                : 'plugs'
            }
          />
        }
        singleSelection={{ asPlainText: true }}
        fullWidth
        placeholder={i18n.translate(
          'xpack.serverlessSearch.connectors.chooseConnectorSelectable.placeholder.text',
          { defaultMessage: 'Choose a data source' }
        )}
        options={initialOptions}
        selectedOptions={selectedOptions}
        onChange={onSelectedOptionChange}
        renderOption={renderOption}
        rowHeight={(euiTheme.base / 2) * 5}
      />
    </EuiFormRow>
  );
};
