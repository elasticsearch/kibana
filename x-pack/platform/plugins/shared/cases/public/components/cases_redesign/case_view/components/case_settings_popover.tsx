/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiComboBox,
  EuiFormRow,
  EuiPopoverTitle,
  EuiSpacer,
  EuiSwitch,
  EuiWrappingPopover,
} from '@elastic/eui';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import type { CaseUI } from '../../../../../common';
import { useCasesContext } from '../../../cases_context/use_cases_context';
import { useCasesFeatures } from '../../../../common/use_cases_features';
import { useGetTemplates } from '../../../templates_v2/hooks/use_get_templates';
import { useChangeAppliedTemplate } from '../../../case_view/use_change_applied_template';
import { useGetTemplate } from '../../../templates_v2/hooks/use_get_template';
import { KibanaServices } from '../../../../common/lib/kibana';
import * as i18n from '../../../case_view/translations';
import * as commonI18n from '../../../../common/translations';
import { SHOW_METRICS } from '../../translations';

interface CaseSettingsPopoverProps {
  caseData: CaseUI;
  syncAlerts: boolean;
  onSyncAlertsChange: (enabled: boolean) => void;
  showMetrics: boolean;
  onShowMetricsChange: (enabled: boolean) => void;
  isOpen: boolean;
  onClose: () => void;
  anchorElement: HTMLElement;
}

export const CaseSettingsPopover: FC<CaseSettingsPopoverProps> = ({
  caseData,
  syncAlerts,
  onSyncAlertsChange,
  showMetrics,
  onShowMetricsChange,
  isOpen,
  onClose,
  anchorElement,
}) => {
  const { owner } = useCasesContext();
  const { isSyncAlertsEnabled, metricsFeatures } = useCasesFeatures();
  const hasMetrics = metricsFeatures.length > 0;
  const isTemplatesEnabled = KibanaServices.getConfig()?.templates?.enabled ?? false;

  const { data: templatesData, isLoading: isLoadingTemplates } = useGetTemplates({
    queryParams: { page: 1, perPage: 10000, owner, isEnabled: true },
  });

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(caseData.template?.id ?? '');

  const options: Array<EuiComboBoxOptionOption<string>> = useMemo(
    () =>
      (templatesData?.templates ?? []).map((t) => ({
        key: t.templateId,
        label: t.name,
        value: t.templateId,
      })),
    [templatesData?.templates]
  );

  const selectedOptions = useMemo(
    () => options.filter((o) => o.value === selectedTemplateId),
    [options, selectedTemplateId]
  );

  const { data: selectedTemplateData } = useGetTemplate(
    isTemplatesEnabled ? selectedTemplateId || undefined : undefined
  );
  const { mutate: changeTemplate } = useChangeAppliedTemplate();

  // Applied via useEffect rather than inside onTemplateChange because the
  // template definition (fields, version) is fetched asynchronously by
  // useGetTemplate and isn't available at the time the user selects a template.
  useEffect(() => {
    if (
      isTemplatesEnabled &&
      selectedTemplateId &&
      selectedTemplateData &&
      selectedTemplateData.templateId === selectedTemplateId &&
      caseData.template?.id !== selectedTemplateId
    ) {
      changeTemplate({
        caseData,
        newTemplate: {
          id: selectedTemplateData.templateId,
          version: selectedTemplateData.templateVersion,
          fields: selectedTemplateData.definition.fields,
        },
      });
    }
  }, [isTemplatesEnabled, selectedTemplateId, selectedTemplateData, caseData, changeTemplate]);

  const onTemplateChange = useCallback((selected: Array<EuiComboBoxOptionOption<string>>) => {
    setSelectedTemplateId(selected[0]?.value ?? '');
  }, []);

  return (
    <EuiWrappingPopover
      button={anchorElement}
      isOpen={isOpen}
      closePopover={onClose}
      anchorPosition="downRight"
      panelPaddingSize="m"
      aria-label={i18n.CASE_SETTINGS}
      data-test-subj="case-settings-popover"
    >
      <EuiPopoverTitle>{i18n.CASE_SETTINGS}</EuiPopoverTitle>
      {isTemplatesEnabled && (
        <>
          <EuiFormRow label={commonI18n.APPLY_TEMPLATE_MODAL_TEMPLATE_LABEL} fullWidth>
            <EuiComboBox
              fullWidth
              singleSelection={{ asPlainText: true }}
              options={options}
              selectedOptions={selectedOptions}
              onChange={onTemplateChange}
              isLoading={isLoadingTemplates}
              placeholder={commonI18n.APPLY_TEMPLATE_MODAL_TEMPLATE_PLACEHOLDER}
              data-test-subj="case-settings-template-select"
              compressed
            />
          </EuiFormRow>
          <EuiSpacer size="m" />
        </>
      )}
      {isSyncAlertsEnabled && (
        <>
          <EuiSwitch
            label={i18n.SYNC_ALERTS}
            checked={syncAlerts}
            onChange={(e) => onSyncAlertsChange(e.target.checked)}
            compressed
            data-test-subj="case-settings-sync-alerts-switch"
          />
          <EuiSpacer size="m" />
        </>
      )}
      {hasMetrics && (
        <EuiSwitch
          label={SHOW_METRICS}
          checked={showMetrics}
          onChange={(e) => onShowMetricsChange(e.target.checked)}
          compressed
          data-test-subj="case-settings-show-metrics-switch"
        />
      )}
    </EuiWrappingPopover>
  );
};

CaseSettingsPopover.displayName = 'CaseSettingsPopover';
