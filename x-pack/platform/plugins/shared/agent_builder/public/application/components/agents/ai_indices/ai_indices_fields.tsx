/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiBadge,
  EuiBadgeGroup,
  EuiComboBox,
  EuiFormRow,
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
} from '@elastic/eui';
import { KbnDangerCallout } from '@kbn/ui-callout';
import type { AiIndexHttpItem } from '@kbn/context-engine-plugin/common/http_api/ai_indices';
import type { AgentAiIndicesWarning } from '../../../../../common/http_api/agents';
import { useAgentAiIndicesById } from '../../../hooks/ai_indices/use_agent_ai_indices_by_id';
import { useListAiIndices } from '../../../hooks/ai_indices/use_list_ai_indices';
import { labels } from '../../../utils/i18n';
import { AiIndicesWarningsPanel } from './ai_indices_warnings_panel';

export const useAiIndices = (agentId?: string) => {
  const {
    aiIndices: availableAiIndices,
    isLoading: isLoadingAiIndices,
    error: aiIndicesError,
  } = useListAiIndices();
  const {
    aiIndices: agentAiIndices,
    warnings,
    isLoading: isLoadingAgentAiIndices,
    error: agentAiIndicesError,
  } = useAgentAiIndicesById(agentId, { enabled: Boolean(agentId) });

  const inheritedIds = useMemo(
    () => agentAiIndices.filter(({ is_default: isDefault }) => isDefault).map(({ id }) => id),
    [agentAiIndices]
  );

  return {
    availableAiIndices,
    inheritedIds,
    warnings,
    isLoading: isLoadingAiIndices || isLoadingAgentAiIndices,
    error: aiIndicesError ?? agentAiIndicesError,
  };
};

export interface AiIndicesFieldsProps {
  aiIndices: Array<Pick<AiIndexHttpItem, 'id' | 'description'>>;
  /** AI Indices assigned to the agent itself: editable, and the only ones a change writes back. */
  assignedIds: string[];
  /** AI Indices contributed by the agent's type. They always apply and cannot be removed here. */
  inheritedIds: string[];
  warnings?: AgentAiIndicesWarning[];
  isLoading: boolean;
  error?: Error;
  isFormDisabled: boolean;
  onChange: (assignedIds: string[]) => void;
}

export const AiIndicesFields: React.FC<AiIndicesFieldsProps> = ({
  aiIndices,
  assignedIds,
  inheritedIds,
  warnings = [],
  isLoading,
  error,
  isFormDisabled,
  onChange,
}) => {
  const inheritedIdSet = useMemo(() => new Set(inheritedIds), [inheritedIds]);

  // Inherited ids are listed above as defaults, so they are not shown again here.
  const hiddenAssignedIds = useMemo(
    () => assignedIds.filter((id) => inheritedIdSet.has(id)),
    [assignedIds, inheritedIdSet]
  );

  // The API does not validate stored ids, so an agent can reference an index that was deleted.
  const selectedOptions = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () =>
      assignedIds
        .filter((id) => !inheritedIdSet.has(id))
        .map((id) => ({
          key: id,
          label: id,
          'data-test-subj': `agentBuilderSelectedAiIndex-${id}`,
        })),
    [assignedIds, inheritedIdSet]
  );

  const options = useMemo<Array<EuiComboBoxOptionOption<string>>>(
    () =>
      aiIndices
        .filter(({ id }) => !inheritedIdSet.has(id))
        .map(({ id, description }) => ({
          key: id,
          label: id,
          append: description ? (
            <EuiText size="xs" color="subdued">
              {description}
            </EuiText>
          ) : undefined,
          'data-test-subj': `agentBuilderAiIndexOption-${id}`,
        })),
    [aiIndices, inheritedIdSet]
  );

  // Configured but not listed for this user: deleted, unreadable, or hidden in this space.
  const unavailable = useMemo(() => {
    if (isLoading || error) {
      return { inherited: [], assigned: [] };
    }
    const availableIds = new Set(aiIndices.map(({ id }) => id));
    const isMissing = (id: string) => !availableIds.has(id);
    return {
      inherited: inheritedIds.filter(isMissing),
      assigned: selectedOptions.map(({ label }) => label).filter(isMissing),
    };
  }, [aiIndices, inheritedIds, selectedOptions, isLoading, error]);

  const handleChange = useCallback(
    (newSelectedOptions: Array<EuiComboBoxOptionOption<string>>) =>
      onChange([...hiddenAssignedIds, ...newSelectedOptions.map(({ label }) => label)]),
    [hiddenAssignedIds, onChange]
  );

  return (
    <EuiFlexGroup direction="column" gutterSize="m">
      {error && (
        <EuiFlexItem grow={false}>
          <KbnDangerCallout
            announceOnMount
            size="s"
            title={labels.aiIndices.loadErrorMessage}
            data-test-subj="agentBuilderAiIndicesLoadError"
          />
        </EuiFlexItem>
      )}

      {warnings.length > 0 && (
        <EuiFlexItem grow={false}>
          <AiIndicesWarningsPanel warnings={warnings} />
        </EuiFlexItem>
      )}

      {inheritedIds.length > 0 && (
        <EuiFlexItem grow={false}>
          <EuiFormRow
            label={labels.aiIndices.defaultIndicesLabel}
            helpText={
              <>
                {labels.aiIndices.defaultIndicesHelpText}
                {unavailable.inherited.length > 0 && (
                  <span data-test-subj="agentBuilderUnavailableDefaultAiIndices">
                    {` ${labels.aiIndices.unavailableIndicesHelpText(
                      unavailable.inherited.join(', ')
                    )}`}
                  </span>
                )}
              </>
            }
            fullWidth
          >
            <EuiBadgeGroup gutterSize="s" role="list" data-test-subj="agentBuilderDefaultAiIndices">
              {inheritedIds.map((id) => (
                <EuiBadge
                  key={id}
                  color="hollow"
                  role="listitem"
                  data-test-subj={`agentBuilderDefaultAiIndex-${id}`}
                >
                  {labels.aiIndices.defaultIndexBadge(id)}
                </EuiBadge>
              ))}
            </EuiBadgeGroup>
          </EuiFormRow>
        </EuiFlexItem>
      )}

      <EuiFlexItem grow={false}>
        <EuiFormRow
          label={labels.aiIndices.additionalIndicesLabel}
          labelAppend={
            <EuiText size="xs" color="subdued">
              {labels.aiIndices.optionalLabel}
            </EuiText>
          }
          helpText={
            unavailable.assigned.length > 0 ? (
              <span data-test-subj="agentBuilderUnavailableAiIndices">
                {labels.aiIndices.unavailableIndicesHelpText(unavailable.assigned.join(', '))}
              </span>
            ) : undefined
          }
          fullWidth
        >
          <EuiComboBox
            fullWidth
            aria-label={labels.aiIndices.additionalIndicesLabel}
            placeholder={labels.aiIndices.additionalIndicesPlaceholder}
            options={options}
            selectedOptions={selectedOptions}
            onChange={handleChange}
            isLoading={isLoading}
            isDisabled={isFormDisabled}
            data-test-subj="agentBuilderAdditionalAiIndices"
          />
        </EuiFormRow>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
