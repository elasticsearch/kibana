/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { first } from 'lodash';
import { i18n } from '@kbn/i18n';
import { EuiPopover, EuiToolTip } from '@elastic/eui';
import type { InventoryItemType } from '@kbn/metrics-data-access-plugin/common';
import { useBoolean } from '@kbn/react-hooks';
import type {
  InfraWaffleMapBounds,
  InfraWaffleMapNode,
  InfraWaffleMapOptions,
} from '../../../../../common/inventory/types';
import { ConditionalToolTip } from './conditional_tooltip';
import { colorFromValue } from '../../lib/color_from_value';

import { NodeContextMenu } from './node_context_menu';
import { NodeSquare } from './node_square';
import { type AssetDetailsFlyoutPropertiesUpdater } from '../../hooks/use_asset_details_flyout_url_state';

interface Props {
  squareSize: number;
  options: InfraWaffleMapOptions;
  node: InfraWaffleMapNode;
  formatter: (val: number) => string;
  bounds: InfraWaffleMapBounds;
  nodeType: InventoryItemType;
  currentTime: number;
  setFlyoutUrlState: AssetDetailsFlyoutPropertiesUpdater;
  detailsItemId: string | null;
}

export const Node = ({
  nodeType,
  node,
  options,
  squareSize,
  bounds,
  formatter,
  currentTime,
  setFlyoutUrlState,
  detailsItemId,
}: Props) => {
  const [isPopoverOpen, { off: closePopover, toggle: togglePopover }] = useBoolean(false);

  const metric = first(node.metrics);
  const rawValue = (metric && metric.value) || 0;
  const color = colorFromValue(options.legend, rawValue, bounds);
  const value = formatter(rawValue);

  const isFlyoutMode = nodeType === 'host' || nodeType === 'container';

  const toggleAssetPopover = () => {
    if (isFlyoutMode) {
      setFlyoutUrlState({ detailsItemId: node.id, entityType: nodeType });
    } else {
      togglePopover();
    }
  };

  const nodeSquare = (
    <EuiToolTip
      position="right"
      content={<ConditionalToolTip currentTime={currentTime} node={node} nodeType={nodeType} />}
    >
      <div role="listitem" tabIndex={0}>
        <NodeSquare
          squareSize={squareSize}
          togglePopover={toggleAssetPopover}
          color={color}
          nodeName={node.name}
          nodeMetric={metric ? metric.name : ''}
          value={value}
          showBorder={detailsItemId === node.id || isPopoverOpen}
        />
      </div>
    </EuiToolTip>
  );

  return (
    <EuiPopover
      button={nodeSquare}
      isOpen={!isFlyoutMode && isPopoverOpen}
      closePopover={closePopover}
      anchorPosition="downCenter"
      zIndex={0}
      aria-label={i18n.translate('xpack.infra.waffle.nodePopover.ariaLabel', {
        defaultMessage: 'Details for {nodeName}',
        values: { nodeName: node.name },
      })}
    >
      {!isFlyoutMode && isPopoverOpen && (
        <NodeContextMenu
          node={node}
          nodeType={nodeType}
          options={options}
          currentTime={currentTime}
        />
      )}
    </EuiPopover>
  );
};
