/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { EuiSelectableOption } from '@elastic/eui';
import { useEuiTheme } from '@elastic/eui';
import { EuiFilterButton, EuiPopover, EuiSelectable } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import type { AgentPolicy } from '../../../../../../../../common';

export interface Props {
  selectedAgentPolicies: string[];
  onSelectedAgentPoliciesChange: (selectedPolicies: string[]) => void;
  agentPolicies: AgentPolicy[];
}

export const AgentPolicyFilter: React.FunctionComponent<Props> = ({
  selectedAgentPolicies,
  onSelectedAgentPoliciesChange,
  agentPolicies,
}: Props) => {
  const { euiTheme } = useEuiTheme();
  // Policies state for filtering
  const [isAgentPoliciesFilterOpen, setIsAgentPoliciesFilterOpen] = useState<boolean>(false);

  // Add a agent policy id to current search
  const addAgentPolicyFilter = (policyId: string) => {
    onSelectedAgentPoliciesChange([...selectedAgentPolicies, policyId]);
  };

  // Remove a agent policy id from current search
  const removeAgentPolicyFilter = (policyId: string) => {
    onSelectedAgentPoliciesChange(
      selectedAgentPolicies.filter((agentPolicy) => agentPolicy !== policyId)
    );
  };

  const getOptions = useCallback((): EuiSelectableOption[] => {
    return agentPolicies.map((agentPolicy) => ({
      label: agentPolicy.name,
      checked: selectedAgentPolicies.includes(agentPolicy.id) ? 'on' : undefined,
      key: agentPolicy.id,
      'data-test-subj': 'agentList.agentPolicyFilterOption',
    }));
  }, [agentPolicies, selectedAgentPolicies]);

  const [options, setOptions] = useState<EuiSelectableOption[]>(getOptions());

  useEffect(() => {
    setOptions(getOptions());
  }, [getOptions]);

  return (
    <EuiPopover
      aria-label={i18n.translate('xpack.fleet.agentList.policyFilterAriaLabel', {
        defaultMessage: 'Agent policy filter',
      })}
      ownFocus
      zIndex={Number(euiTheme.levels.header) - 1}
      button={
        <EuiFilterButton
          iconType="chevronSingleDown"
          onClick={() => setIsAgentPoliciesFilterOpen(!isAgentPoliciesFilterOpen)}
          isSelected={isAgentPoliciesFilterOpen}
          hasActiveFilters={selectedAgentPolicies.length > 0}
          numActiveFilters={selectedAgentPolicies.length}
          numFilters={agentPolicies.length}
          disabled={agentPolicies.length === 0}
          data-test-subj="agentList.policyFilter"
        >
          <FormattedMessage
            id="xpack.fleet.agentList.policyFilterText"
            defaultMessage="Agent policy"
          />
        </EuiFilterButton>
      }
      isOpen={isAgentPoliciesFilterOpen}
      closePopover={() => setIsAgentPoliciesFilterOpen(false)}
      panelPaddingSize="s"
    >
      <EuiSelectable
        options={options}
        onChange={(newOptions: EuiSelectableOption[]) => {
          setOptions(newOptions);
          newOptions.forEach((option, index) => {
            if (option.checked !== options[index].checked) {
              const agentPolicyId = option.key!;
              if (option.checked !== 'on') {
                removeAgentPolicyFilter(agentPolicyId);
              } else {
                addAgentPolicyFilter(agentPolicyId);
              }
              return;
            }
          });
        }}
        data-test-subj="agentList.agentPolicyFilterOptions"
        listProps={{
          style: {
            minWidth: 200,
          },
        }}
      >
        {(list) => list}
      </EuiSelectable>
    </EuiPopover>
  );
};
