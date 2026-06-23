/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiFieldSearch,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPopover,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { useQueryClient } from '@kbn/react-query';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAgentBuilderAgentById } from '../../../hooks/agents/use_agent_by_id';
import { useCanUpdateAgent } from '../../../hooks/agents/use_can_update_agent';
import { useSkillsService } from '../../../hooks/skills/use_skills';
import { useFlyoutState } from '../../../hooks/use_flyout_state';
import { useNavigation } from '../../../hooks/use_navigation';
import { useQueryState } from '../../../hooks/use_query_state';
import { useUiPrivileges } from '../../../hooks/use_ui_privileges';
import { queryKeys } from '../../../query_keys';
import { searchParamNames } from '../../../search_param_names';
import { appPaths } from '../../../utils/app_paths';
import { labels } from '../../../utils/i18n';
import { PageWrapper } from '../common/page_wrapper';
import { useListDetailPageStyles } from '../common/styles';
import { ActiveSkillRow } from './active_skill_row';
import { SkillCreateFlyout } from './skill_create_flyout';
import { SkillDetailPanel } from './skill_detail_panel';
import { SkillEditFlyout } from './skill_edit_flyout';
import { SkillLibraryPanel } from './skill_library_panel';
import { SkillsCustomizeEmptyState } from './skills_customize_empty_state';
import { useSkillsMutation } from './use_skills_mutation';

export const AgentSkills: React.FC = () => {
  const { agentId } = useParams<{ agentId: string }>();
  const styles = useListDetailPageStyles();
  const { createAgentBuilderUrl } = useNavigation();
  const queryClient = useQueryClient();

  const { agent, isLoading: agentLoading } = useAgentBuilderAgentById(agentId);
  const { skills: allSkills, isLoading: skillsLoading } = useSkillsService();
  const { manageSkills } = useUiPrivileges();
  const canEditAgent = useCanUpdateAgent({ agent });

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSkillId, setSelectedSkillId] = useQueryState<string>(searchParamNames.skillId);
  const pendingSelectSkillIdRef = useRef<string | null>(null);
  const [editingSkillId, setEditingSkillId] = useState<string | null>(null);
  const [isCreateFlyoutOpen, setIsCreateFlyoutOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const { handleAddSkill, handleRemoveSkill } = useSkillsMutation({ agent });
  const {
    isOpen: isLibraryOpen,
    openFlyout: openLibrary,
    closeFlyout: closeLibrary,
  } = useFlyoutState();

  const handleImportFromLibrary = () => {
    setIsAddMenuOpen(false);
    openLibrary();
  };

  const handleOpenCreateFlyout = () => {
    setIsAddMenuOpen(false);
    setIsCreateFlyoutOpen(true);
  };

  const agentSkillIds = useMemo(
    () => agent?.configuration?.skill_ids,
    [agent?.configuration?.skill_ids]
  );

  const agentSkillIdSet = useMemo(
    () => (agentSkillIds ? new Set(agentSkillIds) : undefined),
    [agentSkillIds]
  );

  const enableElasticCapabilities = agent?.configuration?.enable_elastic_capabilities ?? false;

  const builtinSkills = useMemo(() => allSkills.filter((s) => s.readonly), [allSkills]);

  const builtinSkillIdSet = useMemo(() => new Set(builtinSkills.map((s) => s.id)), [builtinSkills]);

  const activeSkills = useMemo(() => {
    if (!agentSkillIdSet) {
      return enableElasticCapabilities ? builtinSkills : [];
    }
    if (enableElasticCapabilities) {
      const explicitSkills = allSkills.filter((s) => agentSkillIdSet.has(s.id));
      const builtinNotExplicit = builtinSkills.filter((s) => !agentSkillIdSet.has(s.id));
      return [...explicitSkills, ...builtinNotExplicit];
    }
    return allSkills.filter((s) => agentSkillIdSet.has(s.id));
  }, [allSkills, agentSkillIdSet, enableElasticCapabilities, builtinSkills]);

  useEffect(() => {
    if (agentLoading || skillsLoading) return;

    // When a newly added skill is pending to be selected. Once it is active, select it.
    if (pendingSelectSkillIdRef.current) {
      const pendingInActive = activeSkills.some((s) => s.id === pendingSelectSkillIdRef.current);
      if (pendingInActive) {
        setSelectedSkillId(pendingSelectSkillIdRef.current);
        pendingSelectSkillIdRef.current = null;
        return;
      }
    }

    // Select first skill when no skill is currently selected, like on first render
    if (!selectedSkillId) {
      if (activeSkills.length > 0) {
        setSelectedSkillId(activeSkills[0].id);
      }
      return;
    }

    // Selected skill is no longer active, for example after deleting a skill
    const selectedSkillNotActive = activeSkills.every((s) => s.id !== selectedSkillId);
    if (selectedSkillNotActive) {
      setSelectedSkillId(activeSkills[0]?.id ?? null);
    }
  }, [activeSkills, selectedSkillId, setSelectedSkillId, agentLoading, skillsLoading]);

  const filteredActiveSkills = useMemo(() => {
    if (!searchQuery.trim()) return activeSkills;
    const lower = searchQuery.toLowerCase();
    return activeSkills.filter(
      (s) => s.name.toLowerCase().includes(lower) || s.description.toLowerCase().includes(lower)
    );
  }, [activeSkills, searchQuery]);

  const handleSelectSkill = (skillId: string) => {
    setSelectedSkillId(skillId);
  };

  const handleRemoveSkillWithReport = (skill: PublicSkillSummary) => {
    handleRemoveSkill(skill);
  };

  const handleToggleSkill = (skill: PublicSkillSummary, isActive: boolean) => {
    if (enableElasticCapabilities && skill.readonly) return;
    if (isActive) {
      handleAddSkill(skill);
    } else {
      handleRemoveSkill(skill);
    }
  };

  const handleRemoveSelectedSkill = () => {
    if (!selectedSkillId) return;
    const skill = activeSkills.find((s) => s.id === selectedSkillId);
    if (skill) {
      if (enableElasticCapabilities && skill.readonly) return;
      handleRemoveSkillWithReport(skill);
    }
  };

  const libraryActiveSkillIdSet = useMemo(() => {
    if (!agentSkillIdSet) {
      return enableElasticCapabilities ? builtinSkillIdSet : new Set<string>();
    }
    if (enableElasticCapabilities) return new Set([...agentSkillIdSet, ...builtinSkillIdSet]);
    return agentSkillIdSet;
  }, [agentSkillIdSet, enableElasticCapabilities, builtinSkillIdSet]);

  const showCustomizeEmptyState = activeSkills.length === 0 && !searchQuery.trim();

  const isLoading = agentLoading || skillsLoading;

  if (isLoading) {
    return (
      <EuiFlexGroup alignItems="center" justifyContent="center" css={styles.loadingSpinner}>
        <EuiLoadingSpinner size="xl" />
      </EuiFlexGroup>
    );
  }

  const skillModals = (
    <>
      {isLibraryOpen ? (
        <SkillLibraryPanel
          onClose={closeLibrary}
          allSkills={allSkills}
          activeSkillIdSet={libraryActiveSkillIdSet}
          onToggleSkill={handleToggleSkill}
          enableElasticCapabilities={enableElasticCapabilities}
          builtinSkillIdSet={builtinSkillIdSet}
        />
      ) : null}
      {editingSkillId ? (
        <SkillEditFlyout
          skillId={editingSkillId}
          onClose={() => setEditingSkillId(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: queryKeys.skills.byId(editingSkillId) });
            setSelectedSkillId(editingSkillId);
          }}
        />
      ) : null}
      {isCreateFlyoutOpen ? (
        <SkillCreateFlyout
          onClose={() => setIsCreateFlyoutOpen(false)}
          onSkillCreated={(skill) =>
            handleAddSkill(skill, {
              onSuccess: () => {
                pendingSelectSkillIdRef.current = skill.id;
              },
            })
          }
        />
      ) : null}
    </>
  );

  return (
    <PageWrapper>
      {showCustomizeEmptyState ? (
        <SkillsCustomizeEmptyState canEditAgent={canEditAgent} onOpenLibrary={openLibrary} />
      ) : (
        <>
          <div css={styles.header}>
            <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiTitle size="l">
                  <h1>{labels.skills.title}</h1>
                </EuiTitle>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
                  <EuiFlexItem grow={false}>
                    <EuiButtonEmpty href={createAgentBuilderUrl(appPaths.manage.skills)}>
                      {labels.agentSkills.manageAllSkills}
                    </EuiButtonEmpty>
                  </EuiFlexItem>
                  {canEditAgent && (
                    <EuiFlexItem grow={false}>
                      <EuiPopover
                        aria-label={labels.agentSkills.addSkillButton}
                        button={
                          <EuiButton
                            fill
                            iconType="plusInCircle"
                            iconSide="left"
                            onClick={() => setIsAddMenuOpen((prev) => !prev)}
                          >
                            {labels.agentSkills.addSkillButton}
                          </EuiButton>
                        }
                        isOpen={isAddMenuOpen}
                        closePopover={() => setIsAddMenuOpen(false)}
                        anchorPosition="downLeft"
                        panelPaddingSize="none"
                      >
                        <EuiContextMenuPanel
                          items={[
                            <EuiContextMenuItem
                              key="importFromLibrary"
                              icon="importAction"
                              onClick={handleImportFromLibrary}
                              {...getEbtProps({
                                element: AGENT_BUILDER_UI_EBT.element.pageContent,
                                action:
                                  AGENT_BUILDER_UI_EBT.action.agentCustomization
                                    .ENTITY_ADD_FROM_LIBRARY,
                                detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
                              })}
                            >
                              {labels.agentSkills.importFromLibraryMenuItem}
                            </EuiContextMenuItem>,
                            ...(manageSkills
                              ? [
                                  <EuiContextMenuItem
                                    key="createSkill"
                                    icon="pencil"
                                    onClick={handleOpenCreateFlyout}
                                    {...getEbtProps({
                                      element: AGENT_BUILDER_UI_EBT.element.pageContent,
                                      action:
                                        AGENT_BUILDER_UI_EBT.action.agentCustomization
                                          .ENTITY_CREATE_NEW,
                                      detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
                                    })}
                                  >
                                    {labels.agentSkills.createSkillMenuItem}
                                  </EuiContextMenuItem>,
                                ]
                              : []),
                          ]}
                        />
                      </EuiPopover>
                    </EuiFlexItem>
                  )}
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexGroup>

            <EuiSpacer size="m" />
            <EuiText size="m" color="default">
              {labels.agentSkills.pageDescription}
            </EuiText>
          </div>

          <EuiFlexGroup gutterSize="none" responsive={false} css={styles.body}>
            <EuiFlexItem grow={false} css={styles.searchColumn}>
              <div css={styles.searchInputWrapper}>
                <EuiFieldSearch
                  placeholder={labels.agentSkills.searchActiveSkillsPlaceholder}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  incremental
                  fullWidth
                />
              </div>

              <EuiFlexGroup direction="column" gutterSize="xs" css={styles.scrollableList}>
                {filteredActiveSkills.length === 0 ? (
                  <EuiText size="s" color="subdued" textAlign="center">
                    <p>
                      {searchQuery.trim()
                        ? labels.agentSkills.noActiveSkillsMatchMessage
                        : labels.agentSkills.noActiveSkillsMessage}
                    </p>
                  </EuiText>
                ) : (
                  filteredActiveSkills.map((skill) => (
                    <EuiFlexItem key={skill.id} grow={false}>
                      <ActiveSkillRow
                        skill={skill}
                        isSelected={selectedSkillId === skill.id}
                        onSelect={(s) => handleSelectSkill(s.id)}
                        onRemove={handleRemoveSkillWithReport}
                        isAutoIncluded={enableElasticCapabilities && skill.readonly}
                        canEditAgent={canEditAgent}
                      />
                    </EuiFlexItem>
                  ))
                )}
              </EuiFlexGroup>
            </EuiFlexItem>

            <EuiFlexItem css={styles.detailPanelWrapper}>
              {selectedSkillId ? (
                <SkillDetailPanel
                  skillId={selectedSkillId}
                  onEdit={() => setEditingSkillId(selectedSkillId)}
                  onRemove={handleRemoveSelectedSkill}
                  isAutoIncluded={
                    enableElasticCapabilities &&
                    (activeSkills.find((s) => s.id === selectedSkillId)?.readonly ?? false)
                  }
                  canEditAgent={canEditAgent}
                />
              ) : (
                <EuiFlexGroup
                  justifyContent="center"
                  alignItems="center"
                  css={styles.noSelectionPlaceholder}
                >
                  <EuiText size="s" color="subdued">
                    {labels.agentSkills.noSkillSelectedMessage}
                  </EuiText>
                </EuiFlexGroup>
              )}
            </EuiFlexItem>
          </EuiFlexGroup>
        </>
      )}

      {skillModals}
    </PageWrapper>
  );
};
