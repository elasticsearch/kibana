/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiCallOut, EuiComboBox, EuiFormRow, EuiLink } from '@elastic/eui';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { useDebouncedValue } from '@kbn/react-hooks';
import { useQuery } from '@kbn/react-query';
import type { WorkflowListDto } from '@kbn/workflows';
import { WORKFLOWS_UI_SETTING_ID } from '@kbn/workflows';
import { WorkflowApi } from '@kbn/workflows-ui';
import React, { useEffect, useMemo, useState } from 'react';

interface WorkflowReferenceSelectorProps {
  value: string | null;
  onSelect: (workflowId: string | null) => void;
  isInvalid?: boolean;
  errorMessage?: string;
}

export const WorkflowReferenceSelector = ({
  value,
  onSelect,
  isInvalid,
  errorMessage,
}: WorkflowReferenceSelectorProps) => {
  const application = useService(CoreStart('application'));
  const uiSettings = useService(CoreStart('uiSettings'));
  const { toasts } = useService(CoreStart('notifications'));
  const workflowsApi = useService(WorkflowApi);
  const isWorkflowsEnabled = uiSettings.get<boolean>(WORKFLOWS_UI_SETTING_ID);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedQuery = useDebouncedValue(searchQuery, 300);
  const [selectedWorkflow, setSelectedWorkflow] = useState<{ id: string; name: string } | null>(
    null
  );

  const { data: workflowsData, isLoading } = useQuery<WorkflowListDto, Error>({
    queryKey: ['alertingV2RuleForm', 'workflows', { query: debouncedQuery }],
    queryFn: () => workflowsApi.getWorkflows({ query: debouncedQuery, size: 100, page: 1 }),
    enabled: isWorkflowsEnabled,
    refetchOnWindowFocus: false,
    keepPreviousData: true,
    onError: (error: Error) => {
      toasts.addError(error, {
        title: i18n.translate(
          'xpack.responseOps.alertingV2RuleForm.actionForm.workflows.fetchError',
          { defaultMessage: 'Failed to load workflows' }
        ),
      });
    },
  });

  const results = useMemo(() => workflowsData?.results ?? [], [workflowsData?.results]);

  useEffect(() => {
    if (!value) {
      setSelectedWorkflow(null);
      return;
    }
    const found = results.find((w) => w.id === value);
    if (found) setSelectedWorkflow({ id: found.id, name: found.name });
  }, [results, value]);
  const workflowOptions: Array<EuiComboBoxOptionOption<string>> = results.map((w) => ({
    label: w.name,
    value: w.id,
  }));

  const selectedOptions: Array<EuiComboBoxOptionOption<string>> = value
    ? [
        {
          label: results.find((w) => w.id === value)?.name ?? selectedWorkflow?.name ?? value,
          value,
        },
      ]
    : [];

  if (!isWorkflowsEnabled) {
    const settingsUrl = application.getUrlForApp('management', {
      path: `/kibana/settings?query=${encodeURIComponent(WORKFLOWS_UI_SETTING_ID)}`,
    });
    return (
      <EuiCallOut
        announceOnMount={false}
        title={i18n.translate(
          'xpack.responseOps.alertingV2RuleForm.actionForm.workflowsDisabled.title',
          {
            defaultMessage: 'Workflows are not enabled',
          }
        )}
        color="warning"
        iconType="warning"
        data-test-subj="singleStepWorkflowsDisabledCallout"
      >
        <FormattedMessage
          id="xpack.responseOps.alertingV2RuleForm.actionForm.workflowsDisabled.description"
          defaultMessage="Single-step workflows require the Workflows feature. Enable it in {advancedSettingsLink}, then refresh this page."
          values={{
            advancedSettingsLink: (
              <EuiLink href={settingsUrl} data-test-subj="singleStepWorkflowsDisabledSettingsLink">
                <FormattedMessage
                  id="xpack.responseOps.alertingV2RuleForm.actionForm.workflowsDisabled.advancedSettingsLink"
                  defaultMessage="Advanced Settings"
                />
              </EuiLink>
            ),
          }}
        />
      </EuiCallOut>
    );
  }

  return (
    <EuiFormRow
      label={i18n.translate(
        'xpack.responseOps.alertingV2RuleForm.actionForm.workflowReference.label',
        {
          defaultMessage: 'Workflow',
        }
      )}
      fullWidth
      isInvalid={!!isInvalid}
      error={errorMessage}
    >
      <EuiComboBox
        compressed
        fullWidth
        async
        singleSelection={{ asPlainText: true }}
        isLoading={isLoading}
        isInvalid={!!isInvalid}
        data-test-subj="workflowReferenceSelector"
        placeholder={i18n.translate(
          'xpack.responseOps.alertingV2RuleForm.actionForm.workflowReference.placeholder',
          {
            defaultMessage: 'Search for a workflow',
          }
        )}
        selectedOptions={selectedOptions}
        onSearchChange={setSearchQuery}
        onChange={(options) => {
          if (options.length === 0) {
            setSelectedWorkflow(null);
            onSelect(null);
            return;
          }
          const next = options[0];
          if (next.value) {
            const workflow = results.find((w) => w.id === next.value);
            if (workflow) setSelectedWorkflow({ id: workflow.id, name: workflow.name });
            onSelect(next.value);
          }
        }}
        options={workflowOptions}
      />
    </EuiFormRow>
  );
};
