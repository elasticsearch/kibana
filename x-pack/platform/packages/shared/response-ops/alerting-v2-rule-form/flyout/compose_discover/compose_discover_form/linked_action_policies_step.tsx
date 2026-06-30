/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiCallOut,
  EuiIcon,
  EuiLoadingSpinner,
  EuiSelectable,
  EuiSpacer,
  EuiText,
  EuiTitle,
  type EuiSelectableOption,
} from '@elastic/eui';
import type { MatchedActionPolicyCategory } from '@kbn/alerting-v2-schemas';
import type { HttpStart } from '@kbn/core-http-browser';
import { i18n } from '@kbn/i18n';
import React from 'react';
import { useWatch } from 'react-hook-form';
import type { FormValues } from '../../../form/types';
import { useMatchedActionPolicies } from './use_matched_action_policies';

const actionPoliciesTitle = i18n.translate(
  'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.title',
  { defaultMessage: 'Action policies' }
);

const matchingSubtext = i18n.translate(
  'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.matchingSubtext',
  { defaultMessage: 'These policies currently match this rule.' }
);

const emptyStateLabel = i18n.translate(
  'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.noMatchesEmptyState',
  { defaultMessage: '0 matching action policies' }
);

const errorTitle = i18n.translate(
  'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.errorTitle',
  { defaultMessage: 'Failed to load linked action policies' }
);

// TODO: replace with paths.actionPolicyEdit from alerting_v2/public/constants.ts
//       once exported from the plugin or moved to a shared package.
const ACTION_POLICY_EDIT_BASE = '/app/management/alertingV2/action_policies/edit';

const SECTION_CONFIG: Array<{
  category: MatchedActionPolicyCategory;
  title: string;
  description: string;
}> = [
  {
    category: 'global',
    title: i18n.translate('xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.globalTitle', {
      defaultMessage: 'Global policies',
    }),
    description: i18n.translate(
      'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.globalDescription',
      { defaultMessage: 'Matching all rules' }
    ),
  },
  {
    category: 'global-filtered',
    title: i18n.translate(
      'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.globalFilteredTitle',
      { defaultMessage: 'Matching global policies' }
    ),
    description: i18n.translate(
      'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.globalFilteredGroupLabel',
      { defaultMessage: 'Matching this rule' }
    ),
  },
];

interface Props {
  http: HttpStart;
  ruleId?: string;
}

export const LinkedActionPoliciesStep = ({ http, ruleId }: Props) => {
  const metadata = useWatch<FormValues, 'metadata'>({ name: 'metadata' });
  const name = metadata?.name;
  const tags = metadata?.tags;

  const { isLoading, error, items } = useMatchedActionPolicies({ http, ruleId, name, tags });

  return (
    <>
      <EuiTitle size="xs">
        <h3>{actionPoliciesTitle}</h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      <EuiText size="s" color="subdued">
        <p>{matchingSubtext}</p>
      </EuiText>
      <EuiSpacer size="s" />

      {isLoading && <EuiLoadingSpinner size="m" data-test-subj="linkedActionPoliciesLoading" />}

      {error && (
        <EuiCallOut
          announceOnMount
          title={errorTitle}
          color="danger"
          iconType="error"
          data-test-subj="linkedActionPoliciesError"
        >
          <p>{error.message}</p>
        </EuiCallOut>
      )}

      {!isLoading && !error && (
        <>
          {items.length === 0 && (
            <EuiText size="s" color="subdued" data-test-subj="linkedActionPoliciesEmpty">
              <p>{emptyStateLabel}</p>
            </EuiText>
          )}
          {SECTION_CONFIG.map(({ category, title, description }) => {
            const sectionItems = items.filter((item) => item.category === category);
            if (sectionItems.length === 0) return null;

            const options: EuiSelectableOption[] = [
              {
                key: `${category}-header`,
                label: title,
                isGroupLabel: true,
                append: (
                  <EuiText size="xs" color="subdued">
                    {description}
                  </EuiText>
                ),
              },
              ...sectionItems.map(({ actionPolicy }) => ({
                key: actionPolicy.id,
                label: actionPolicy.name,
                append: (
                  <a
                    href={http.basePath.prepend(
                      `${ACTION_POLICY_EDIT_BASE}/${encodeURIComponent(actionPolicy.id)}`
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={i18n.translate(
                      'xpack.responseOps.alertingV2RuleForm.linkedActionPolicies.editPolicyLink',
                      {
                        defaultMessage: 'Edit {name}',
                        values: { name: actionPolicy.name },
                      }
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <EuiIcon type="popout" size="s" aria-hidden={true} />
                  </a>
                ),
              })),
            ];

            return (
              <React.Fragment key={category}>
                <EuiSelectable
                  options={options}
                  onChange={() => {}}
                  listProps={{ showIcons: false, bordered: true, isVirtualized: false }}
                >
                  {(list) => list}
                </EuiSelectable>
                <EuiSpacer size="s" />
              </React.Fragment>
            );
          })}
        </>
      )}
    </>
  );
};
