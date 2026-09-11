/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { CaseAttachmentsWithoutOwner } from '@kbn/cases-plugin/public/types';
import { OBSERVABILITY_ALERT_ATTACHMENT_TYPE } from '@kbn/cases-plugin/common';
import { EuiButtonEmpty, EuiText } from '@elastic/eui';
import { ALERT_UUID } from '@kbn/rule-data-utils';

import type { Rule } from '@kbn/alerts-ui-shared';
import { useKibana } from '../../../utils/kibana_react';
import type { TopAlert } from '../../../typings/alerts';

export function AddToCaseButton({
  alert,
  alertIndex,
  rule,
  setIsPopoverOpen,
}: {
  alert: TopAlert | null;
  alertIndex?: string;
  rule?: Rule;
  setIsPopoverOpen: (isOpen: boolean) => void;
}) {
  const {
    services,
    services: { telemetryClient },
  } = useKibana();

  const selectCaseModal = services.cases?.hooks.useCasesAddToExistingCaseModal({
    onSuccess: (_theCase, isNewCase) => {
      telemetryClient.reportAlertAddedToCase(
        isNewCase,
        'alertDetails.addToCaseBtn',
        rule?.ruleTypeId || 'unknown'
      );
    },
  });

  const attachments: CaseAttachmentsWithoutOwner =
    alert && rule
      ? [
          {
            type: OBSERVABILITY_ALERT_ATTACHMENT_TYPE,
            attachmentId: alert?.fields[ALERT_UUID] || '',
            metadata: {
              index: alertIndex || '',
              rule: {
                id: rule.id,
                name: rule.name,
              },
            },
          },
        ]
      : [];

  const handleAddToCase = () => {
    setIsPopoverOpen(false);
    selectCaseModal?.open({ getAttachments: () => attachments });
  };

  return (
    <EuiButtonEmpty
      size="s"
      color="text"
      iconType="casesApp"
      onClick={handleAddToCase}
      data-test-subj={`add-to-cases-button-${rule?.ruleTypeId}`}
    >
      <EuiText size="s">
        {i18n.translate('xpack.observability.alertDetails.addToCase', {
          defaultMessage: 'Add to case',
        })}
      </EuiText>
    </EuiButtonEmpty>
  );
}
