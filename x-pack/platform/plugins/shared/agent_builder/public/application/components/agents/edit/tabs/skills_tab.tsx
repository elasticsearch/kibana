/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useCallback, useState } from 'react';
import type { CriteriaWithPagination } from '@elastic/eui';
import {
  EuiBadge,
  EuiCheckbox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiInMemoryTable,
  EuiLink,
  EuiLoadingSpinner,
  EuiPanel,
  EuiProgress,
  EuiSearchBar,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { PublicSkillSummary } from '@kbn/agent-builder-common';
import { isBuiltinSkillAutoIncludedForElasticCapabilities } from '@kbn/agent-builder-common';
import { AGENT_BUILDER_UI_EBT } from '@kbn/agent-builder-common';
import { getEbtProps } from '@kbn/ebt-click';
import { Controller } from 'react-hook-form';
import type { Control } from 'react-hook-form';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { AgentFormData } from '../agent_form';
import { labels } from '../../../../utils/i18n';
import { useNavigation } from '../../../../hooks/use_navigation';
import { appPaths } from '../../../../utils/app_paths';

interface SkillsTabProps {
  control: Control<AgentFormData>;
  skills: PublicSkillSummary[];
  isLoading: boolean;
  isFormDisabled: boolean;
  areElasticCapabilitiesEnabled: boolean;
}

export const SkillsTab: React.FC<SkillsTabProps> = ({
  control,
  skills,
  isLoading,
  isFormDisabled,
  areElasticCapabilitiesEnabled,
}) => {
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const showActiveOnlyChangeHandler = !isFormDisabled ? setShowActiveOnly : undefined;

  return (
    <>
      <EuiSpacer size="l" />
      <Controller
        name="configuration.skill_ids"
        control={control}
        render={({ field }) => (
          <SkillsSelection
            skills={skills}
            skillsLoading={isLoading}
            selectedSkills={field.value}
            onSkillsChange={field.onChange}
            disabled={isFormDisabled}
            showActiveOnly={showActiveOnly || isFormDisabled}
            onShowActiveOnlyChange={showActiveOnlyChangeHandler}
            areElasticCapabilitiesEnabled={areElasticCapabilitiesEnabled}
          />
        )}
      />
    </>
  );
};

interface SkillsSelectionProps {
  skills: PublicSkillSummary[];
  skillsLoading: boolean;
  selectedSkills: string[] | undefined;
  onSkillsChange: (skills: string[]) => void;
  disabled?: boolean;
  showActiveOnly: boolean;
  onShowActiveOnlyChange?: (showActiveOnly: boolean) => void;
  areElasticCapabilitiesEnabled: boolean;
}

const SkillsSelection: React.FC<SkillsSelectionProps> = ({
  skills,
  skillsLoading,
  selectedSkills,
  onSkillsChange,
  disabled = false,
  showActiveOnly,
  onShowActiveOnlyChange,
  areElasticCapabilitiesEnabled,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const selectedIdSet = useMemo(() => new Set(selectedSkills ?? []), [selectedSkills]);

  const isSkillAutoIncluded = useCallback(
    (skill: PublicSkillSummary) =>
      isBuiltinSkillAutoIncludedForElasticCapabilities(skill, areElasticCapabilitiesEnabled),
    [areElasticCapabilitiesEnabled]
  );

  const isSkillActive = useCallback(
    (skill: PublicSkillSummary) => selectedIdSet.has(skill.id) || isSkillAutoIncluded(skill),
    [selectedIdSet, isSkillAutoIncluded]
  );

  const displaySkills = useMemo(() => {
    if (showActiveOnly) {
      return skills.filter((skill) => isSkillActive(skill));
    }
    return skills;
  }, [skills, showActiveOnly, isSkillActive]);

  const filteredSkills = useMemo(() => {
    if (!searchQuery) {
      return displaySkills;
    }

    return EuiSearchBar.Query.execute(EuiSearchBar.Query.parse(searchQuery), displaySkills, {
      defaultFields: ['id', 'name', 'description'],
    });
  }, [searchQuery, displaySkills]);

  const activeSkillsCount = useMemo(() => {
    return skills.filter((skill) => isSkillActive(skill)).length;
  }, [skills, isSkillActive]);

  const handleToggleSkill = useCallback(
    (skillId: string) => {
      const skill = skills.find((s) => s.id === skillId);
      if (skill && isSkillAutoIncluded(skill)) return;
      const currentIds = selectedSkills ?? [];
      if (currentIds.includes(skillId)) {
        onSkillsChange(currentIds.filter((id) => id !== skillId));
      } else {
        onSkillsChange([...currentIds, skillId]);
      }
    },
    [selectedSkills, onSkillsChange, skills, isSkillAutoIncluded]
  );

  const handleSearchChange = useCallback((query: string) => {
    setSearchQuery(query);
    setPageIndex(0);
  }, []);

  const handleTableChange = useCallback(
    ({ page }: CriteriaWithPagination<PublicSkillSummary>) => {
      if (page) {
        setPageIndex(page.index);
        if (page.size !== pageSize) {
          setPageSize(page.size);
          setPageIndex(0);
        }
      }
    },
    [pageSize]
  );

  if (skillsLoading) {
    return <EuiLoadingSpinner size="l" />;
  }

  const columns = [
    createCheckboxColumn(isSkillActive, isSkillAutoIncluded, handleToggleSkill, disabled),
    createSkillDetailsColumn(),
    createTypeColumn(),
  ];

  return (
    <div>
      <ActiveSkillsStatus activeSkillsCount={activeSkillsCount} totalSkills={skills.length} />

      <EuiSpacer size="l" />

      <EuiFlexGroup alignItems="center" gutterSize="m">
        <EuiFlexItem>
          <EuiSearchBar
            box={{
              incremental: true,
              placeholder: labels.skills.searchSkillsPlaceholder,
            }}
            onChange={({ queryText, error }) => {
              if (!error) {
                handleSearchChange(queryText);
              }
            }}
            query={searchQuery}
          />
        </EuiFlexItem>
        {onShowActiveOnlyChange && (
          <EuiFlexItem grow={false}>
            <EuiSwitch
              label={i18n.translate('xpack.agentBuilder.skills.showActiveOnly', {
                defaultMessage: 'Show active only',
              })}
              checked={showActiveOnly}
              onChange={(e) => onShowActiveOnlyChange(e.target.checked)}
              disabled={disabled}
              compressed
            />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiFlexGroup justifyContent="flexStart">
        <EuiText size="xs">
          <FormattedMessage
            id="xpack.agentBuilder.skills.skillsSelectionSummary"
            defaultMessage="Showing {start}-{end} of {total} {skills}"
            values={{
              start: <strong>{Math.min(pageIndex * pageSize + 1, filteredSkills.length)}</strong>,
              end: <strong>{Math.min((pageIndex + 1) * pageSize, filteredSkills.length)}</strong>,
              total: filteredSkills.length,
              skills: <strong>{labels.skills.title}</strong>,
            }}
          />
        </EuiText>
      </EuiFlexGroup>

      <EuiInMemoryTable
        columns={columns}
        items={filteredSkills}
        itemId="id"
        pagination={{
          pageIndex,
          pageSize,
          pageSizeOptions: [10, 25, 50, 100],
          showPerPageOptions: true,
        }}
        onTableChange={handleTableChange}
        sorting={{
          sort: {
            field: 'id',
            direction: 'asc',
          },
        }}
        noItemsMessage={
          skills.length > 0 ? labels.skills.noSkillsMatchMessage : labels.skills.noSkillsMessage
        }
      />
    </div>
  );
};

const ActiveSkillsStatus: React.FC<{ activeSkillsCount: number; totalSkills: number }> = ({
  activeSkillsCount,
  totalSkills,
}) => {
  const { createAgentBuilderUrl } = useNavigation();
  const isZeroSkills = activeSkillsCount === 0;
  const statusColor = isZeroSkills ? 'warning' : 'success';
  const iconType = isZeroSkills ? 'alert' : 'checkCircleFill';

  return (
    <EuiPanel hasBorder hasShadow={false} paddingSize="m">
      <EuiFlexGroup alignItems="center" gutterSize="l">
        <EuiFlexItem grow={1}>
          <EuiFlexGroup direction="column">
            <EuiFlexItem>
              <EuiFlexGroup direction="row" gutterSize="s" alignItems="center" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type={iconType} color={statusColor} size="m" aria-hidden={true} />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="m" color={statusColor}>
                    <strong>
                      {i18n.translate('xpack.agentBuilder.activeSkillsStatus.title', {
                        defaultMessage:
                          'This agent has {count} active {count, plural, one {skill} other {skills}}',
                        values: { count: activeSkillsCount },
                      })}
                    </strong>
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            <EuiFlexItem>
              <EuiText size="s" color="subdued">
                <FormattedMessage
                  id="xpack.agentBuilder.activeSkillsStatus.description"
                  defaultMessage="{skillsLink} provide specialized knowledge and instructions that guide agents on specific tasks."
                  values={{
                    skillsLink: (
                      <EuiLink
                        href={createAgentBuilderUrl(appPaths.skills.list)}
                        {...getEbtProps({
                          element: AGENT_BUILDER_UI_EBT.element.pageContent,
                          action: AGENT_BUILDER_UI_EBT.action.agentEdit.MANAGE_ALL,
                          detail: AGENT_BUILDER_UI_EBT.entity.SKILL,
                        })}
                      >
                        {labels.skills.title}
                      </EuiLink>
                    ),
                  }}
                />
              </EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>

        <EuiFlexItem grow={1}>
          <EuiProgress
            value={activeSkillsCount}
            max={totalSkills}
            color={statusColor}
            size="m"
            label={i18n.translate('xpack.agentBuilder.activeSkillsStatus.progressLabel', {
              defaultMessage: 'Active skills',
            })}
            valueText={`${activeSkillsCount}/${totalSkills}`}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );
};

const SkillDetailsColumn: React.FC<{ skill: PublicSkillSummary }> = ({ skill }) => {
  const { euiTheme } = useEuiTheme();
  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiText
        size="s"
        css={css`
          font-weight: ${euiTheme.font.weight.semiBold};
        `}
      >
        {skill.id}
      </EuiText>
      <EuiText size="s" color="subdued">
        {skill.description}
      </EuiText>
    </EuiFlexGroup>
  );
};

const createCheckboxColumn = (
  isSkillActive: (skill: PublicSkillSummary) => boolean,
  isSkillAutoIncluded: (skill: PublicSkillSummary) => boolean,
  onToggle: (skillId: string) => void,
  disabled: boolean
) => ({
  width: '40px',
  render: (skill: PublicSkillSummary) => {
    const autoIncluded = isSkillAutoIncluded(skill);
    const checkbox = (
      <EuiCheckbox
        id={`skill-${skill.id}`}
        checked={isSkillActive(skill)}
        onChange={() => onToggle(skill.id)}
        disabled={disabled || autoIncluded}
      />
    );
    return autoIncluded ? (
      <EuiToolTip content={labels.agentSkills.elasticCapabilitiesManagedTooltip}>
        {checkbox}
      </EuiToolTip>
    ) : (
      checkbox
    );
  },
});

const createSkillDetailsColumn = () => ({
  name: labels.skills.skillIdLabel,
  sortable: (item: PublicSkillSummary) => item.id,
  width: '60%',
  render: (item: PublicSkillSummary) => <SkillDetailsColumn skill={item} />,
});

const createTypeColumn = () => ({
  field: 'readonly',
  name: labels.skills.typeLabel,
  render: (readonly: boolean) => (
    <EuiBadge color={readonly ? 'hollow' : 'primary'}>
      {readonly ? labels.skills.builtinLabel : labels.skills.customLabel}
    </EuiBadge>
  ),
});
