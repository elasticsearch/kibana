/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButtonIcon, EuiContextMenu, EuiPopover, EuiToolTip } from '@elastic/eui';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import React, { useCallback, useMemo, useState } from 'react';
import { useNavigation } from '../../hooks/use_navigation';
import { appPaths } from '../../utils/app_paths';
import { labels } from '../../utils/i18n';

interface SkillContextMenuProps {
  skill: PublicSkillSummary;
  onDelete: (skillId: string) => void;
  canManage: boolean;
}

export const SkillContextMenu: React.FC<SkillContextMenuProps> = ({
  skill,
  onDelete,
  canManage,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { navigateToAgentBuilderUrl } = useNavigation();

  const closePopover = useCallback(() => setIsOpen(false), []);
  const togglePopover = useCallback(() => setIsOpen((prev) => !prev), []);

  const panels = useMemo(() => {
    const items = [];

    if (skill.readonly) {
      items.push({
        name: labels.skills.viewSkillButtonLabel,
        icon: 'eye',
        onClick: () => {
          navigateToAgentBuilderUrl(appPaths.skills.details({ skillId: skill.id }));
          closePopover();
        },
        'data-test-subj': `agentBuilderSkillViewButton-${skill.id}`,
        ...getEbtProps({
          element: AGENT_BUILDER_UI_EBT.element.pageContent,
          action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_VIEW,
          detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
        }),
      });
    } else {
      items.push({
        name: labels.skills.editSkillButtonLabel,
        icon: 'pencil',
        onClick: () => {
          navigateToAgentBuilderUrl(appPaths.skills.details({ skillId: skill.id }));
          closePopover();
        },
        'data-test-subj': `agentBuilderSkillEditButton-${skill.id}`,
        ...getEbtProps({
          element: AGENT_BUILDER_UI_EBT.element.pageContent,
          action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_EDIT,
          detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
        }),
      });

      if (canManage) {
        items.push({
          name: labels.skills.deleteSkillButtonLabel,
          icon: 'trash',
          onClick: () => {
            onDelete(skill.id);
            closePopover();
          },
          'data-test-subj': `agentBuilderSkillDeleteButton-${skill.id}`,
          ...getEbtProps({
            element: AGENT_BUILDER_UI_EBT.element.pageContent,
            action: AGENT_BUILDER_UI_EBT.action.globalManagement.MANAGE_ENTITY_DELETE,
            detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
          }),
        });
      }
    }

    return [{ id: 0, items }];
  }, [skill, canManage, navigateToAgentBuilderUrl, closePopover, onDelete]);

  return (
    <EuiPopover
      button={
        <EuiToolTip content={labels.skills.skillContextMenuButtonLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="boxesHorizontal"
            aria-label={labels.skills.skillContextMenuButtonLabel}
            onClick={togglePopover}
            data-test-subj={`agentBuilderSkillContextMenuButton-${skill.id}`}
            {...getEbtProps({
              element: AGENT_BUILDER_UI_EBT.element.pageContent,
              action: AGENT_BUILDER_UI_EBT.action.globalManagement.OPEN_CONTEXT_MENU,
              detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
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
