/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiPopover,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { ToolDefinition } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React, { useState } from 'react';
import { labels } from '../../../utils/i18n';
import { useToolsActions } from '../../../context/tools_provider';
import { useUiPrivileges } from '../../../hooks/use_ui_privileges';

export interface ToolContextMenuProps {
  tool: ToolDefinition;
}

export const ToolContextMenu = ({ tool }: ToolContextMenuProps) => {
  const { euiTheme } = useEuiTheme();
  const { editTool, deleteTool, testTool, cloneTool, viewTool } = useToolsActions();
  const [isOpen, setIsOpen] = useState(false);
  const { manageTools } = useUiPrivileges();

  const editMenuItem = (
    <EuiContextMenuItem
      icon="pencil"
      key="edit"
      onClick={() => {
        editTool(tool.id);
        setIsOpen(false);
      }}
      {...getEbtProps({
        element: AGENT_BUILDER_UI_EBT.element.pageContent,
        action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_EDIT,
        detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
      })}
    >
      {labels.tools.editToolButtonLabel}
    </EuiContextMenuItem>
  );

  const deleteMenuItem = (
    <EuiContextMenuItem
      icon="trash"
      key="delete"
      css={css`
        color: ${euiTheme.colors.textDanger};
      `}
      onClick={() => {
        deleteTool(tool.id);
        setIsOpen(false);
      }}
      {...getEbtProps({
        element: AGENT_BUILDER_UI_EBT.element.pageContent,
        action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_DELETE,
        detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
      })}
    >
      {labels.tools.deleteToolButtonLabel}
    </EuiContextMenuItem>
  );

  const testMenuItem = (
    <EuiContextMenuItem
      icon="play"
      key="test"
      onClick={() => {
        testTool(tool.id);
        setIsOpen(false);
      }}
      {...getEbtProps({
        element: AGENT_BUILDER_UI_EBT.element.pageContent,
        action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_TEST,
        detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
      })}
    >
      {labels.tools.testToolButtonLabel}
    </EuiContextMenuItem>
  );

  const cloneMenuItem = (
    <EuiContextMenuItem
      icon="copy"
      key="clone"
      onClick={() => {
        cloneTool(tool.id);
        setIsOpen(false);
      }}
      {...getEbtProps({
        element: AGENT_BUILDER_UI_EBT.element.pageContent,
        action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_CLONE,
        detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
      })}
    >
      {labels.tools.cloneToolButtonLabel}
    </EuiContextMenuItem>
  );

  const viewMenuItem = (
    <EuiContextMenuItem
      icon="eye"
      key="view"
      onClick={() => {
        viewTool(tool.id);
        setIsOpen(false);
      }}
      {...getEbtProps({
        element: AGENT_BUILDER_UI_EBT.element.pageContent,
        action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_VIEW,
        detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
      })}
    >
      {labels.tools.viewToolButtonLabel}
    </EuiContextMenuItem>
  );

  const menuItems =
    !tool.readonly && manageTools
      ? [editMenuItem, testMenuItem, cloneMenuItem, deleteMenuItem]
      : [testMenuItem, viewMenuItem];

  return (
    <EuiPopover
      id={`${tool.id}_context-menu`}
      panelPaddingSize="s"
      button={
        <EuiToolTip content={labels.tools.toolContextMenuButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesVertical"
            onClick={() => setIsOpen((openState) => !openState)}
            aria-label={labels.tools.toolContextMenuButtonLabel}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.OPEN_CONTEXT_MENU,
              detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
            })}
          />
        </EuiToolTip>
      }
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
    >
      <EuiContextMenuPanel items={menuItems} />
    </EuiPopover>
  );
};
