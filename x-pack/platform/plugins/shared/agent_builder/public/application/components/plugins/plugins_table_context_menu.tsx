/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiContextMenu, EuiPopover, EuiToolTip } from '@elastic/eui';
import type { PluginDefinition } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '../../hooks/use_navigation';
import { appPaths } from '../../utils/app_paths';
import { labels } from '../../utils/i18n';

interface PluginContextMenuProps {
  plugin: PluginDefinition;
  onDelete: (
    pluginId: string,
    pluginName: string,
    options?: { onConfirm?: () => void; onCancel?: () => void }
  ) => void;
  canManage: boolean;
}

export const PluginContextMenu: React.FC<PluginContextMenuProps> = ({
  plugin,
  onDelete,
  canManage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { navigateToAgentBuilderUrl } = useNavigation();

  const closePopover = useCallback(() => setIsOpen(false), []);
  const togglePopover = useCallback(() => setIsOpen((prev) => !prev), []);

  const panels = useMemo(() => {
    const items = [
      {
        name: labels.plugins.viewPluginButtonLabel,
        icon: 'eye',
        onClick: () => {
          navigateToAgentBuilderUrl(appPaths.plugins.details({ pluginId: plugin.id }));
          closePopover();
        },
        'data-test-subj': `agentBuilderPluginViewButton-${plugin.id}`,
        ...getEbtProps({
          element: AGENT_BUILDER_UI_EBT.element.pageContent,
          action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_VIEW,
          detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
        }),
      },
    ];

    if (canManage && !plugin.readonly) {
      items.push({
        name: labels.plugins.deletePluginButtonLabel,
        icon: 'trash',
        onClick: () => {
          onDelete(plugin.id, plugin.name);
          closePopover();
        },
        'data-test-subj': `agentBuilderPluginDeleteButton-${plugin.id}`,
        ...getEbtProps({
          element: AGENT_BUILDER_UI_EBT.element.pageContent,
          action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_DELETE,
          detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
        }),
      });
    }

    return [{ id: 0, items }];
  }, [plugin, canManage, closePopover, onDelete, navigateToAgentBuilderUrl]);

  return (
    <EuiPopover
      button={
        <EuiToolTip content={labels.plugins.pluginContextMenuButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesHorizontal"
            aria-label={labels.plugins.pluginContextMenuButtonLabel}
            onClick={togglePopover}
            data-test-subj={`agentBuilderPluginContextMenuButton-${plugin.id}`}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.OPEN_CONTEXT_MENU,
              detail: AGENT_BUILDER_UI_EBT.entity.PLUGIN,
            })}
          />
        </EuiToolTip>
      }
      isOpen={isOpen}
      closePopover={closePopover}
      panelPaddingSize="none"
      anchorPosition="downRight"
    >
      <EuiContextMenu initialPanelId={0} panels={panels} />
    </EuiPopover>
  );
};
