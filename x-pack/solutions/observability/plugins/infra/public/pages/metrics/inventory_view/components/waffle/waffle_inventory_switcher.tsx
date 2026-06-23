/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { EuiPopover, EuiContextMenu } from '@elastic/eui';

import React, { useCallback, useState, useMemo } from 'react';
import { i18n } from '@kbn/i18n';
import { findInventoryModel } from '@kbn/metrics-data-access-plugin/common';
import type { InventoryItemType } from '@kbn/metrics-data-access-plugin/common';
import { useWaffleOptionsContext } from '../../hooks/use_waffle_options';
import { DropdownButton } from '../dropdown_button';

const getDisplayNameForType = (type: InventoryItemType) => {
  const inventoryModel = findInventoryModel(type);
  return inventoryModel.displayName;
};

export const WaffleInventorySwitcher: React.FC = () => {
  const {
    changeNodeType,
    changeGroupBy,
    changeMetric,
    changeAccount,
    changeRegion,
    changeCustomMetrics,
    nodeType,
  } = useWaffleOptionsContext();
  const [isOpen, setIsOpen] = useState(false);
  const closePopover = useCallback(() => setIsOpen(false), []);
  const togglePopover = useCallback(() => setIsOpen((currentIsOpen) => !currentIsOpen), []);
  const goToNodeType = useCallback(
    (targetNodeType: InventoryItemType) => {
      closePopover();
      changeNodeType(targetNodeType);
      changeGroupBy([]);
      changeCustomMetrics([]);
      changeAccount('');
      changeRegion('');
      const inventoryModel = findInventoryModel(targetNodeType);
      changeMetric({
        type: inventoryModel.metrics.defaultSnapshot,
      });
    },
    [
      closePopover,
      changeNodeType,
      changeGroupBy,
      changeCustomMetrics,
      changeAccount,
      changeRegion,
      changeMetric,
    ]
  );
  const goToHost = useCallback(() => goToNodeType('host'), [goToNodeType]);
  const goToK8 = useCallback(() => goToNodeType('pod'), [goToNodeType]);
  const goToContainer = useCallback(() => goToNodeType('container'), [goToNodeType]);
  const goToAwsEC2 = useCallback(() => goToNodeType('awsEC2'), [goToNodeType]);
  const goToAwsS3 = useCallback(() => goToNodeType('awsS3'), [goToNodeType]);
  const goToAwsRDS = useCallback(() => goToNodeType('awsRDS'), [goToNodeType]);
  const goToAwsSQS = useCallback(() => goToNodeType('awsSQS'), [goToNodeType]);
  const panels = useMemo(
    () =>
      [
        {
          id: 'firstPanel',
          items: [
            {
              'data-test-subj': 'goToHost',
              name: getDisplayNameForType('host'),
              onClick: goToHost,
            },
            {
              'data-test-subj': 'goToPods',
              name: getDisplayNameForType('pod'),
              onClick: goToK8,
            },
            {
              'data-test-subj': 'goToContainer',
              name: getDisplayNameForType('container'),
              onClick: goToContainer,
            },
            {
              name: 'AWS',
              panel: 'awsPanel',
              'data-test-subj': 'goToAWS-open',
            },
          ],
        },
        {
          id: 'awsPanel',
          title: 'AWS',
          items: [
            {
              name: getDisplayNameForType('awsEC2'),
              onClick: goToAwsEC2,
              'data-test-subj': 'goToAWS-EC2',
            },
            {
              name: getDisplayNameForType('awsS3'),
              onClick: goToAwsS3,
              'data-test-subj': 'goToAWS-S3',
            },
            {
              name: getDisplayNameForType('awsRDS'),
              onClick: goToAwsRDS,
              'data-test-subj': 'goToAWS-RDS',
            },
            {
              name: getDisplayNameForType('awsSQS'),
              onClick: goToAwsSQS,
              'data-test-subj': 'goToAWS-SQS',
            },
          ],
        },
      ] as EuiContextMenuPanelDescriptor[],
    [goToAwsEC2, goToAwsRDS, goToAwsS3, goToAwsSQS, goToContainer, goToHost, goToK8]
  );

  const selectedText = useMemo(() => {
    return getDisplayNameForType(nodeType);
  }, [nodeType]);

  const button = (
    <DropdownButton
      data-test-subj={'openInventorySwitcher'}
      onClick={togglePopover}
      label={i18n.translate('xpack.infra.waffle.showLabel', { defaultMessage: 'Show' })}
      showKubernetesInfo={true}
    >
      {selectedText}
    </DropdownButton>
  );

  return (
    <EuiPopover
      id="contextMenu"
      button={button}
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downLeft"
      aria-label={i18n.translate('xpack.infra.waffle.inventorySwitcher.ariaLabel', {
        defaultMessage: 'Show',
      })}
    >
      <EuiContextMenu initialPanelId="firstPanel" panels={panels} />
    </EuiPopover>
  );
};
