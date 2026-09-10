/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { EuiButton, EuiLink } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useBoolState } from '../../../../common/hooks/use_bool_state';
import { useTimedDismissal } from '../../../../common/hooks/use_timed_dismissal';
import { useKibana } from '../../../../common/lib/kibana';
import { RuleDeprecationEventTypes } from '../../../../common/lib/telemetry/events/rule_deprecation/types';
import { BulkActionTypeEnum } from '../../../../../common/api/detection_engine/rule_management';
import { useExecuteBulkAction } from '../../logic/bulk_actions/use_execute_bulk_action';
import { usePrebuiltRulesDeprecationReview } from '../../logic/prebuilt_rules/use_prebuilt_rules_deprecation_review';
import { DeleteDeprecatedRulesConfirmModal } from './delete_deprecated_rules_confirm_modal';
import { DeprecatedRulesCallout } from './deprecated_rules_callout';
import { DeprecatedRulesModal } from './deprecated_rules_modal';
import * as i18n from './translations';

export const DISMISSAL_STORAGE_KEY = 'securitySolution.deprecatedRulesCallout.dismissedAt';

export const useDeprecatedRulesTableCallout = () => {
  const [isModalVisible, showModal, hideModal] = useBoolState();
  const [isConfirmVisible, showConfirm, hideConfirm] = useBoolState();
  const [isDismissed, dismiss] = useTimedDismissal(DISMISSAL_STORAGE_KEY);
  const canEditRules = useUserPrivileges().rulesPrivileges.rules.edit;
  const {
    telemetry,
    docLinks: {
      links: {
        securitySolution: { manageDetectionRules },
      },
    },
  } = useKibana().services;
  const { data, isLoading } = usePrebuiltRulesDeprecationReview(null);
  const { executeBulkAction } = useExecuteBulkAction();

  const hasReportedShown = useRef(false);
  const rulesCount = data?.rules.length ?? 0;
  const isCalloutVisible = !isDismissed && !isLoading && rulesCount > 0;

  useEffect(() => {
    if (isCalloutVisible && !hasReportedShown.current) {
      hasReportedShown.current = true;
      telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRulesCalloutShown, {
        count: rulesCount,
      });
    }
  }, [isCalloutVisible, rulesCount, telemetry]);

  const handleDismiss = useCallback(() => {
    telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRulesCalloutDismissed, {
      count: rulesCount,
    });
    dismiss();
  }, [dismiss, rulesCount, telemetry]);

  const handleShowModal = useCallback(() => {
    telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRulesModalOpened, {
      count: rulesCount,
    });
    showModal();
  }, [rulesCount, showModal, telemetry]);

  const handleDeleteAll = useCallback(async () => {
    if (!data?.rules.length) {
      return;
    }
    telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRulesDeleteAllClicked, {
      count: data.rules.length,
    });
    hideConfirm();
    await executeBulkAction({
      type: BulkActionTypeEnum.delete,
      ids: data.rules.map((rule) => rule.id),
    });
  }, [data?.rules, executeBulkAction, hideConfirm, telemetry]);

  if (!isCalloutVisible || !data) {
    return null;
  }

  return (
    <>
      <DeprecatedRulesCallout
        title={i18n.DEPRECATION_CALLOUT_TITLE(data.rules.length)}
        description={
          <FormattedMessage
            id="xpack.securitySolution.detectionEngine.deprecation.tableCalloutDescription"
            defaultMessage="These rules have been deprecated and won't receive new updates or fixes. Duplicate them as custom rules, delete them now, or dismiss this to be reminded in 7 days. {docsLink}"
            values={{
              docsLink: (
                <EuiLink href={`${manageDetectionRules}#deprecated-prebuilt-rules`} target="_blank">
                  <FormattedMessage
                    id="xpack.securitySolution.detectionEngine.deprecation.tableCalloutDocsLink"
                    defaultMessage="Read the docs to learn more."
                  />
                </EuiLink>
              ),
            }}
          />
        }
        buttons={[
          <EuiButton
            color="warning"
            onClick={handleShowModal}
            data-test-subj="deprecated-rules-table-view-button"
            fill
          >
            {i18n.REVIEW_DEPRECATED_RULES}
          </EuiButton>,
          <EuiButton
            color="warning"
            onClick={showConfirm}
            disabled={!canEditRules}
            data-test-subj="deprecated-rules-table-delete-button"
          >
            {i18n.DELETE_DEPRECATED_RULES}
          </EuiButton>,
        ]}
        onDismiss={handleDismiss}
        dataTestSubj="deprecated-rules-table-callout"
      />
      {isModalVisible && (
        <DeprecatedRulesModal rules={data.rules} isLoading={isLoading} onClose={hideModal} />
      )}
      {isConfirmVisible && (
        <DeleteDeprecatedRulesConfirmModal
          count={data.rules.length}
          onCancel={hideConfirm}
          onConfirm={handleDeleteAll}
        />
      )}
    </>
  );
};
