/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiAccordion,
  EuiCallOut,
  EuiCheckbox,
  EuiCodeBlock,
  EuiConfirmModal,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { ALERTING_V2_RULE_API_PATH } from '@kbn/alerting-v2-constants';
import type { CreateRuleData } from '@kbn/alerting-v2-schemas';
import type { Rule } from '../../../rule_management/logic/types';
import {
  getUnsupportedFields,
  hasBlockingFields,
  BLOCKING_FIELDS,
} from '../../../../rules_v2/utils/v1_rule_to_v2_create';
import type { UnsupportedV1Fields } from '../../../../rules_v2/utils/v1_rule_to_v2_create';

const UNSUPPORTED_FIELD_LABELS: Record<string, string> = {
  severity: i18n.translate('xpack.securitySolution.convertToV2.unsupported.severity', {
    defaultMessage: 'Severity',
  }),
  riskScore: i18n.translate('xpack.securitySolution.convertToV2.unsupported.riskScore', {
    defaultMessage: 'Risk score',
  }),
  severityMapping: i18n.translate('xpack.securitySolution.convertToV2.unsupported.severityMapping', {
    defaultMessage: 'Severity mapping',
  }),
  riskScoreMapping: i18n.translate('xpack.securitySolution.convertToV2.unsupported.riskScoreMapping', {
    defaultMessage: 'Risk score mapping',
  }),
  actions: i18n.translate('xpack.securitySolution.convertToV2.unsupported.actions', {
    defaultMessage: 'Actions / connectors',
  }),
  responseActions: i18n.translate('xpack.securitySolution.convertToV2.unsupported.responseActions', {
    defaultMessage: 'Response actions',
  }),
  timelineTemplate: i18n.translate('xpack.securitySolution.convertToV2.unsupported.timelineTemplate', {
    defaultMessage: 'Timeline template',
  }),
  maxSignals: i18n.translate('xpack.securitySolution.convertToV2.unsupported.maxSignals', {
    defaultMessage: 'Max signals (non-default)',
  }),
  ruleNameOverride: i18n.translate('xpack.securitySolution.convertToV2.unsupported.ruleNameOverride', {
    defaultMessage: 'Rule name override',
  }),
  missingFieldsStrategy: i18n.translate('xpack.securitySolution.convertToV2.unsupported.missingFieldsStrategy', {
    defaultMessage: 'Missing fields strategy (alert suppression)',
  }),
  dataViewId: i18n.translate('xpack.securitySolution.convertToV2.unsupported.dataViewId', {
    defaultMessage: 'No index patterns configured (required for threshold ES|QL conversion)',
  }),
  luceneQuery: i18n.translate('xpack.securitySolution.convertToV2.unsupported.luceneQuery', {
    defaultMessage: 'Lucene query filter (not supported in ES|QL)',
  }),
};

interface ConvertToV2ConfirmationProps {
  rule: Rule;
  onConfirm: (disableOriginal: boolean) => void;
  onCancel: () => void;
  isLoading?: boolean;
  /** Pre-built v2 payload (resolved with data view index patterns). Null while loading. */
  v2Payload: CreateRuleData | null;
  /** Whether the v2 payload is currently being built */
  isPayloadLoading?: boolean;
  /** Error from building the payload */
  payloadError?: string | null;
  /** Trigger lazy payload build (called on accordion expand) */
  onBuildPayload?: () => void;
}

export const ConvertToV2Confirmation: React.FC<ConvertToV2ConfirmationProps> = ({
  rule,
  onConfirm,
  onCancel,
  isLoading = false,
  v2Payload,
  isPayloadLoading = false,
  payloadError = null,
  onBuildPayload,
}) => {
  const [disableOriginal, setDisableOriginal] = useState(true);

  const alreadyMigrated = useMemo(
    () => (rule.tags ?? []).includes('migrated_to_v2'),
    [rule.tags]
  );

  const unsupported = useMemo(() => getUnsupportedFields(rule), [rule]);
  const blocked = useMemo(() => hasBlockingFields(unsupported), [unsupported]);

  const requestPreview = useMemo(() => {
    if (payloadError) {
      return `// ${payloadError}`;
    }
    if (!v2Payload) {
      return '';
    }
    return `POST kbn:${ALERTING_V2_RULE_API_PATH}\n${JSON.stringify(v2Payload, null, 2)}`;
  }, [v2Payload, payloadError]);

  const handleAccordionToggle = useCallback(
    (isOpen: boolean) => {
      if (isOpen && !v2Payload && !isPayloadLoading && onBuildPayload) {
        onBuildPayload();
      }
    },
    [v2Payload, isPayloadLoading, onBuildPayload]
  );

  const blockingFieldLabels = useMemo(
    () =>
      Object.entries(unsupported)
        .filter(
          ([key, present]) => present && BLOCKING_FIELDS.has(key as keyof UnsupportedV1Fields)
        )
        .map(([key]) => UNSUPPORTED_FIELD_LABELS[key] ?? key),
    [unsupported]
  );

  const warningFieldLabels = useMemo(
    () =>
      Object.entries(unsupported)
        .filter(
          ([key, present]) => present && !BLOCKING_FIELDS.has(key as keyof UnsupportedV1Fields)
        )
        .map(([key]) => UNSUPPORTED_FIELD_LABELS[key] ?? key),
    [unsupported]
  );

  const handleConfirm = useCallback(() => {
    onConfirm(disableOriginal);
  }, [onConfirm, disableOriginal]);

  return (
    <EuiConfirmModal
      title={i18n.translate('xpack.securitySolution.convertToV2.title', {
        defaultMessage: 'Convert "{name}" to v2?',
        values: { name: rule.name },
      })}
      onCancel={onCancel}
      onConfirm={handleConfirm}
      cancelButtonText={i18n.translate('xpack.securitySolution.convertToV2.cancel', {
        defaultMessage: 'Cancel',
      })}
      confirmButtonText={i18n.translate('xpack.securitySolution.convertToV2.confirm', {
        defaultMessage: 'Convert',
      })}
      confirmButtonDisabled={isLoading || blocked}
      isLoading={isLoading}
      defaultFocusedButton={alreadyMigrated ? 'cancel' : 'confirm'}
      data-test-subj="convertToV2ConfirmModal"
    >
      {alreadyMigrated && (
        <>
          <EuiCallOut
            title={i18n.translate('xpack.securitySolution.convertToV2.alreadyMigratedTitle', {
              defaultMessage: 'This rule has already been converted to v2',
            })}
            color="warning"
            iconType="warning"
            size="s"
          >
            <EuiText size="xs">
              <p>
                {i18n.translate('xpack.securitySolution.convertToV2.alreadyMigratedBody', {
                  defaultMessage:
                    'Converting again will create a duplicate v2 rule. Are you sure you want to continue?',
                })}
              </p>
            </EuiText>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      <EuiText size="s">
        <p>
          {i18n.translate('xpack.securitySolution.convertToV2.description', {
            defaultMessage:
              'A new v2 rule will be created with the same detection logic. The original v1 rule will not be deleted.',
          })}
        </p>
      </EuiText>

      {blocked && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            title={i18n.translate('xpack.securitySolution.convertToV2.blockedTitle', {
              defaultMessage: 'This rule cannot be converted',
            })}
            color="danger"
            iconType="error"
            size="s"
          >
            <EuiText size="xs">
              <p>
                {i18n.translate('xpack.securitySolution.convertToV2.blockedBody', {
                  defaultMessage:
                    'The following configurations prevent conversion to v2:',
                })}
              </p>
              <ul>
                {blockingFieldLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </EuiText>
          </EuiCallOut>
        </>
      )}

      {warningFieldLabels.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiCallOut
            title={i18n.translate('xpack.securitySolution.convertToV2.warningTitle', {
              defaultMessage: 'Some fields cannot be converted',
            })}
            color="warning"
            iconType="warning"
            size="s"
          >
            <EuiText size="xs">
              <p>
                {i18n.translate('xpack.securitySolution.convertToV2.warningBody', {
                  defaultMessage:
                    'The following fields are not supported in v2 and will not be carried over:',
                })}
              </p>
              <ul>
                {warningFieldLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </EuiText>
          </EuiCallOut>
        </>
      )}

      <EuiSpacer size="m" />

      <EuiCheckbox
        id="convertToV2DisableOriginal"
        label={i18n.translate('xpack.securitySolution.convertToV2.disableOriginal', {
          defaultMessage: 'Disable the original v1 rule after conversion',
        })}
        checked={disableOriginal}
        onChange={(e) => setDisableOriginal(e.target.checked)}
        data-test-subj="convertToV2DisableOriginalCheckbox"
      />

      <EuiSpacer size="m" />

      <EuiAccordion
        id="convertToV2RequestPreview"
        buttonContent={i18n.translate('xpack.securitySolution.convertToV2.showRequest', {
          defaultMessage: 'Show request',
        })}
        paddingSize="s"
        onToggle={handleAccordionToggle}
        data-test-subj="convertToV2ShowRequestAccordion"
      >
        {isPayloadLoading ? (
          <EuiLoadingSpinner size="m" />
        ) : (
          <EuiCodeBlock language="json" isCopyable fontSize="s" overflowHeight={300}>
            {requestPreview}
          </EuiCodeBlock>
        )}
      </EuiAccordion>
    </EuiConfirmModal>
  );
};
