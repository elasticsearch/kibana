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
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React, { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { useNavigation } from '../../../../hooks/use_navigation';
import { useToolsActions } from '../../../../context/tools_provider';
import { labels } from '../../../../utils/i18n';
import type { ToolFormData } from '../types/tool_form_types';
import { appPaths } from '../../../../utils/app_paths';

export const ToolEditContextMenu = () => {
  const { euiTheme } = useEuiTheme();
  const { navigateToAgentBuilderUrl } = useNavigation();
  const { cloneTool, deleteTool } = useToolsActions();
  const { control } = useFormContext<ToolFormData>();
  const toolId = useWatch({ name: 'toolId', control });
  const [isOpen, setIsOpen] = useState(false);
  return (
    <EuiPopover
      panelPaddingSize="xs"
      isOpen={isOpen}
      closePopover={() => setIsOpen(false)}
      zIndex={Number(euiTheme.levels.header) - 1}
      button={
        <EuiToolTip content={labels.tools.editToolContextMenuButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj="agentBuilderToolContextMenuButton"
            size="m"
            iconType="boxesVertical"
            onClick={() => setIsOpen((openState) => !openState)}
            aria-label={labels.tools.editToolContextMenuButtonLabel}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.OPEN_CONTEXT_MENU,
              detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
            })}
          />
        </EuiToolTip>
      }
    >
      <EuiContextMenuPanel
        items={[
          <EuiContextMenuItem
            data-test-subj="agentBuilderToolCloneButton"
            key="clone"
            icon="copy"
            onClick={() => {
              cloneTool(toolId);
            }}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_CLONE,
              detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
            })}
          >
            {labels.tools.cloneToolButtonLabel}
          </EuiContextMenuItem>,
          <EuiContextMenuItem
            data-test-subj="agentBuilderToolDeleteButton"
            key="delete"
            icon="trash"
            css={css`
              color: ${euiTheme.colors.textDanger};
            `}
            onClick={() => {
              setIsOpen(false);
              deleteTool(toolId, {
                onConfirm: () => navigateToAgentBuilderUrl(appPaths.tools.list),
              });
            }}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_DELETE,
              detail: AGENT_BUILDER_UI_EBT.entity.TOOL,
            })}
          >
            {labels.tools.deleteToolButtonLabel}
          </EuiContextMenuItem>,
        ]}
      />
    </EuiPopover>
  );
};
