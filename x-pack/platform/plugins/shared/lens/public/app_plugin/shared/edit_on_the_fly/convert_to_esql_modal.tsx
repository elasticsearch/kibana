/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { ReactNode } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import type {
  EuiBasicTableColumn,
  EuiConfirmModalProps,
  EuiTableSelectionType,
} from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiIconTip,
  EuiLink,
  EuiScreenReaderOnly,
  EuiSpacer,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { esql } from '@elastic/esql';

import { i18n } from '@kbn/i18n';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { getFailureTooltip } from '@kbn/lens-common';

import { layerTypes } from '../../..';

import type { ConvertibleLayer, LayerType } from './esql_conversion_types';

const typeLabels: Record<LayerType, (count: number) => string> = {
  data: (count: number) =>
    i18n.translate('xpack.lens.config.visualizationDescription', {
      defaultMessage: '{count, plural, one {Visualization} other {Visualizations}}',
      values: { count },
    }),
  annotations: (count: number) =>
    i18n.translate('xpack.lens.config.annotationDescription', {
      defaultMessage: '{count, plural, one {Annotation} other {Annotations}}',
      values: { count },
    }),
  referenceLine: (count: number) =>
    i18n.translate('xpack.lens.config.referenceLineDescription', {
      defaultMessage: '{count, plural, one {Reference line} other {Reference lines}}',
      values: { count },
    }),
};

export const ConvertToEsqlModal: React.FunctionComponent<{
  layers: ConvertibleLayer[];
  onCancel: EuiConfirmModalProps['onCancel'];
  /**
   * Callback invoked when user confirms the conversion.
   */
  onConfirm: () => void;
}> = ({ layers, onCancel, onConfirm }) => {
  const { euiTheme } = useEuiTheme();

  const [selectedItems, setSelectedItems] = useState<ConvertibleLayer[]>([]);
  const onSelectionChange = useCallback((items: ConvertibleLayer[]) => {
    setSelectedItems(items);
  }, []);

  const [itemIdToExpandedRowMap, setItemIdToExpandedRowMap] = useState<Record<string, ReactNode>>(
    {}
  );

  const toggleDetails = useCallback(
    (layer: ConvertibleLayer) => {
      const itemIdToExpandedRowMapValues = { ...itemIdToExpandedRowMap };

      if (itemIdToExpandedRowMapValues[layer.id]) {
        delete itemIdToExpandedRowMapValues[layer.id];
      } else {
        itemIdToExpandedRowMapValues[layer.id] = (
          <EuiFlexItem>
            <EuiCodeBlock isCopyable language="esql" paddingSize="s">
              {esql(layer.query).print('wrapping')}
            </EuiCodeBlock>
          </EuiFlexItem>
        );
      }

      setItemIdToExpandedRowMap(itemIdToExpandedRowMapValues);
    },
    [itemIdToExpandedRowMap]
  );

  const columns: Array<EuiBasicTableColumn<ConvertibleLayer>> = useMemo(
    () => [
      {
        field: 'icon',
        name: '',
        width: euiTheme.size.l,
        render: (icon: string) => <EuiIcon type={icon} aria-hidden={true} />,
      },
      {
        field: 'name',
        name: 'Layer',
        width: `${parseInt(euiTheme.size.xl, 10) * 5}px`,
        truncateText: true,
        render: (name: string, layer: ConvertibleLayer) => {
          if (layer.isConvertibleToEsql || layer.type !== layerTypes.DATA) {
            return name;
          }
          return (
            <EuiFlexGroup alignItems="center" gutterSize="xs" responsive={false}>
              <EuiFlexItem grow={false}>{name}</EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiIconTip
                  type="warning"
                  color="warning"
                  content={getFailureTooltip(layer.failureReason)}
                  iconProps={{
                    'aria-label': getFailureTooltip(layer.failureReason),
                    'data-test-subj': `lnsEsqlConversionFailureReason-${layer.id}`,
                  }}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          );
        },
      },
      {
        field: 'type',
        name: 'Typology',
        truncateText: true,
        render: (type: LayerType) => typeLabels[type](1),
      },
      {
        align: 'right',
        width: euiTheme.size.xxl,
        isExpander: true,
        name: (
          <EuiScreenReaderOnly>
            <p>
              {i18n.translate('xpack.lens.config.expandEsqlPreviewDescription', {
                defaultMessage: 'Expand to view ES|QL query',
              })}
            </p>
          </EuiScreenReaderOnly>
        ),
        render: (layer: ConvertibleLayer) => {
          const isExpanded = Boolean(itemIdToExpandedRowMap[layer.id]);

          return (
            <EuiToolTip
              content={
                isExpanded
                  ? i18n.translate('xpack.lens.config.collapseAriaLabel', {
                      defaultMessage: 'Collapse',
                    })
                  : i18n.translate('xpack.lens.config.expandAriaLabel', {
                      defaultMessage: 'Expand',
                    })
              }
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                onClick={() => toggleDetails(layer)}
                aria-label={
                  isExpanded
                    ? i18n.translate('xpack.lens.config.collapseAriaLabel', {
                        defaultMessage: 'Collapse',
                      })
                    : i18n.translate('xpack.lens.config.expandAriaLabel', {
                        defaultMessage: 'Expand',
                      })
                }
                iconType={isExpanded ? 'chevronSingleDown' : 'chevronSingleRight'}
                disabled={!layer.isConvertibleToEsql}
              />
            </EuiToolTip>
          );
        },
      },
    ],
    [euiTheme.size.l, euiTheme.size.xl, euiTheme.size.xxl, itemIdToExpandedRowMap, toggleDetails]
  );

  const selection: EuiTableSelectionType<ConvertibleLayer> = {
    selectable: (layer: ConvertibleLayer) => {
      return layer.type === layerTypes.DATA && layer.isConvertibleToEsql;
    },
    selectableMessage: (selectable: boolean, layer: ConvertibleLayer) => {
      if (selectable) {
        return i18n.translate('xpack.lens.config.selectLayerAriaLabel', {
          defaultMessage: 'Select {layerName} for conversion to query mode',
          values: {
            layerName: layer.name,
          },
        });
      }

      if (layer.type === layerTypes.DATA) {
        return i18n.translate('xpack.lens.config.layerNameCannotBeSwitchedAriaLabel', {
          defaultMessage: '{layerName} cannot be switched to query mode',
          values: {
            layerName: layer.name,
          },
        });
      } else {
        return i18n.translate('xpack.lens.config.layerTypesCannotBeSwitchedAriaLabel', {
          defaultMessage: '{layerTypes} cannot be switched to query mode',
          values: {
            layerTypes: typeLabels[layer.type](2),
          },
        });
      }
    },
    onSelectionChange,
    initialSelected: [],
  };

  const isConfirmButtonEnabled =
    (layers.length === 1 && layers[0].isConvertibleToEsql) ||
    (layers.length > 1 && selectedItems.length > 0);

  return (
    <EuiConfirmModal
      aria-label={i18n.translate('xpack.lens.config.switchToQueryModeAriaLabel', {
        defaultMessage: 'Switch to query mode',
      })}
      title={i18n.translate('xpack.lens.config.switchToQueryModeTitle', {
        defaultMessage: 'Switch to query mode',
      })}
      onCancel={onCancel}
      cancelButtonText={i18n.translate('xpack.lens.config.cancelButtonTextButtonLabel', {
        defaultMessage: 'Cancel',
      })}
      onConfirm={onConfirm}
      confirmButtonText={i18n.translate('xpack.lens.config.switchToQueryModeButtonLabel', {
        defaultMessage: 'Switch to query mode',
      })}
      confirmButtonDisabled={!isConfirmButtonEnabled}
      data-test-subj="lnsConvertToEsqlModal"
    >
      <p>
        {i18n.translate('xpack.lens.config.queryModeDescription', {
          defaultMessage: 'Query mode enables advanced data analysis with ES|QL.',
        })}{' '}
        {/* TODO: Add link to docs */}
        <EuiLink href="" target="_blank" external={false}>
          {i18n.translate('xpack.lens.config.readMoreLinkText', {
            defaultMessage: 'Read more.',
          })}
        </EuiLink>
      </p>

      <KbnWarningCallout
        size="s"
        title={i18n.translate('xpack.lens.config.queryModeWarningDescription', {
          defaultMessage: `Once you save the chart after switching to query mode, you can't switch back.`,
        })}
      />

      <EuiSpacer size="l" />

      {layers.length > 1 ? (
        <EuiBasicTable
          tableCaption={i18n.translate('xpack.lens.config.layersTableCaption', {
            defaultMessage: 'Layers available for conversion to query mode',
          })}
          responsiveBreakpoint={false}
          items={layers}
          itemId="id"
          columns={columns}
          itemIdToExpandedRowMap={itemIdToExpandedRowMap}
          selection={selection}
        />
      ) : layers.length === 1 && layers[0].isConvertibleToEsql ? (
        <EuiFlexGroup direction="column" gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiText size="xs" component="div">
              <p>
                <strong>
                  {i18n.translate('xpack.lens.config.queryPreviewDescription', {
                    defaultMessage: 'Query preview',
                  })}
                </strong>
              </p>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCodeBlock isCopyable language="esql" paddingSize="s">
              {esql(layers[0].query).print('wrapping')}
            </EuiCodeBlock>
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : null}
    </EuiConfirmModal>
  );
};
