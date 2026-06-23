/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonEmpty,
  EuiContextMenu,
  EuiIcon,
  EuiPopover,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { SLODefinitionResponse } from '@kbn/slo-schema';
import React, { useState } from 'react';
import { useActionModal } from '../../../../context/action_modal';

interface Props {
  items: SLODefinitionResponse[];
  setSelectedItems: (items: SLODefinitionResponse[]) => void;
}

export function SloManagementBulkActions({ items, setSelectedItems }: Props) {
  const { triggerAction } = useActionModal();
  const popoverId = useGeneratedHtmlId();
  const [isOpen, setIsOpen] = useState(false);

  const resetSelectedItems = () => {
    setSelectedItems([]);
  };

  const panels = [
    {
      id: 0,
      hasFocus: false,
      items: [
        {
          'data-test-subj': 'sloSloManagementTableBulkDeleteButton',
          onClick: () => {
            triggerAction({ items, type: 'bulk_delete', onConfirm: () => resetSelectedItems() });
            setIsOpen(false);
          },
          icon: 'trash',
          name: i18n.translate(
            'xpack.slo.sloManagementTable.sloSloManagementTableBulkDeleteButtonLabel',
            { defaultMessage: 'Delete' }
          ),
        },
        {
          'data-test-subj': 'sloSloManagementTableBulkPurgeInstancesButton',
          icon: 'broom',
          onClick: () => {
            triggerAction({
              items,
              type: 'purge_instances',
              onConfirm: () => resetSelectedItems(),
            });
            setIsOpen(false);
          },
          name: i18n.translate(
            'xpack.slo.sloManagementTable.sloSloManagementTableBulkPurgeInstancesButtonLabel',
            { defaultMessage: 'Purge stale instances' }
          ),
        },
        {
          'data-test-subj': 'sloSloManagementTableBulkPurgeButton',
          icon: 'logstashOutput',
          onClick: () => {
            triggerAction({
              items,
              type: 'bulk_purge_rollup',
              onConfirm: () => resetSelectedItems(),
            });
            setIsOpen(false);
          },
          name: i18n.translate(
            'xpack.slo.sloManagementTable.sloSloManagementTableBulkPurgeButtonLabel',
            { defaultMessage: 'Purge rollup data' }
          ),
        },
      ],
    },
  ];

  return (
    <EuiPopover
      id={popoverId}
      aria-label={i18n.translate('xpack.slo.sloManagementBulkActions.popoverAriaLabel', {
        defaultMessage: 'Bulk actions for selected SLOs',
      })}
      panelPaddingSize="none"
      button={
        <EuiButtonEmpty
          data-test-subj="sloManagementTableBulkMenuButton"
          css={{
            blockSize: '16px',
            marginBottom: '5px',
          }}
          size="xs"
          onClick={() => setIsOpen((curr) => !curr)}
        >
          {i18n.translate('xpack.slo.sloManagementTable.selectedSLOsButton', {
            defaultMessage: 'Selected {count} {count, plural, =1 {SLO} other {SLOs}}',
            values: { count: items.length },
          })}{' '}
          <EuiIcon type="chevronSingleDown" size="s" aria-hidden={true} />
        </EuiButtonEmpty>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      anchorPosition="downLeft"
    >
      <EuiContextMenu
        initialPanelId={0}
        panels={panels}
        data-test-subj="detailsCollapsedActionPanel"
      />
    </EuiPopover>
  );
}
