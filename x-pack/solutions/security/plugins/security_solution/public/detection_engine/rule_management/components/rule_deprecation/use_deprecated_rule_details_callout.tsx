/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButton, EuiLink } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { useKibana } from '../../../../common/lib/kibana';
import { RuleDeprecationEventTypes } from '../../../../common/lib/telemetry/events/rule_deprecation/types';
import type { RuleResponse } from '../../../../../common/api/detection_engine';
import { BulkActionTypeEnum } from '../../../../../common/api/detection_engine/rule_management';
import { DuplicateOptions } from '../../../../../common/detection_engine/rule_management/constants';
import { useBulkDuplicateExceptionsConfirmation } from '../../../rule_management_ui/components/rules_table/bulk_actions/use_bulk_duplicate_confirmation';
import { useExecuteBulkAction } from '../../logic/bulk_actions/use_execute_bulk_action';
import { usePrebuiltRulesDeprecationReview } from '../../logic/prebuilt_rules/use_prebuilt_rules_deprecation_review';
import { DeprecatedRulesCallout } from './deprecated_rules_callout';
import { DeprecatedRuleDuplicateConfirmation } from './deprecated_rule_duplicate_confirmation';
import * as i18n from './translations';
import { APP_UI_ID, SecurityPageName } from '../../../../../common';
import {
  getRuleDetailsUrl,
  getRulesUrl,
} from '../../../../common/components/link_to/redirect_to_detection_engine';

interface UseDeprecatedRuleDetailsCalloutProps {
  rule: RuleResponse | null;
  confirmDeletion: () => Promise<boolean>;
}

export const useDeprecatedRuleDetailsCallout = ({
  rule,
  confirmDeletion,
}: UseDeprecatedRuleDetailsCalloutProps) => {
  const {
    application: { navigateToApp },
    telemetry,
    docLinks: {
      links: {
        securitySolution: { manageDetectionRules },
      },
    },
  } = useKibana().services;
  const {
    rules: { edit: canEditRules },
  } = useUserPrivileges().rulesPrivileges;

  const isPrebuiltRule = rule?.rule_source?.type === 'external';
  const { data, isLoading } = usePrebuiltRulesDeprecationReview(
    { ids: rule?.id ? [rule.id] : [] },
    { enabled: isPrebuiltRule }
  );
  const { executeBulkAction } = useExecuteBulkAction();

  const {
    isBulkDuplicateConfirmationVisible,
    showBulkDuplicateConfirmation,
    cancelRuleDuplication,
    confirmRuleDuplication,
  } = useBulkDuplicateExceptionsConfirmation();

  const navigateToRulesPage = useCallback(() => {
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.rules,
      path: getRulesUrl(),
    });
  }, [navigateToApp]);

  const handleDelete = useCallback(async () => {
    if (!rule) {
      return;
    }
    if ((await confirmDeletion()) === false) {
      return;
    }
    telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRuleDeleteClicked, { count: 1 });
    await executeBulkAction({
      type: BulkActionTypeEnum.delete,
      ids: [rule.id],
    });
    navigateToRulesPage();
  }, [confirmDeletion, executeBulkAction, navigateToRulesPage, rule, telemetry]);

  const handleDuplicateAndDelete = useCallback(async () => {
    if (!rule) {
      return;
    }

    const duplicateOption = await showBulkDuplicateConfirmation();
    if (duplicateOption === null) {
      return;
    }

    telemetry.reportEvent(RuleDeprecationEventTypes.DeprecatedRuleDuplicateAndDeleteClicked, {
      count: 1,
    });

    const duplicateResult = await executeBulkAction({
      type: BulkActionTypeEnum.duplicate,
      ids: [rule.id],
      duplicatePayload: {
        include_exceptions:
          duplicateOption === DuplicateOptions.withExceptions ||
          duplicateOption === DuplicateOptions.withExceptionsExcludeExpiredExceptions,
        include_expired_exceptions: !(
          duplicateOption === DuplicateOptions.withExceptionsExcludeExpiredExceptions
        ),
      },
    });

    const createdRules = duplicateResult?.attributes?.results?.created;
    const newRuleId = createdRules?.[0]?.id;

    if (!newRuleId) {
      return;
    }

    await executeBulkAction({
      type: BulkActionTypeEnum.delete,
      ids: [rule.id],
    });

    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.rules,
      path: getRuleDetailsUrl(newRuleId),
    });
  }, [rule, showBulkDuplicateConfirmation, executeBulkAction, navigateToApp, telemetry]);

  const deprecatedRule = data?.rules?.[0];

  if (!deprecatedRule || deprecatedRule?.id !== rule?.id || isLoading) {
    return null;
  }

  return (
    <>
      <DeprecatedRulesCallout
        title={i18n.DEPRECATION_DETAILS_CALLOUT_TITLE}
        description={
          <FormattedMessage
            id="xpack.securitySolution.detectionEngine.deprecation.detailsCalloutDescription"
            defaultMessage="This rule won't receive new updates or fixes. If you still need it, duplicate it as a custom rule. Otherwise, you can delete it now. {docsLink}"
            values={{
              docsLink: (
                <EuiLink href={`${manageDetectionRules}#deprecated-prebuilt-rules`} target="_blank">
                  <FormattedMessage
                    id="xpack.securitySolution.detectionEngine.deprecation.detailsCalloutDocsLink"
                    defaultMessage="Read the docs to learn more."
                  />
                </EuiLink>
              ),
            }}
          />
        }
        reason={deprecatedRule.deprecated_reason}
        buttons={[
          <EuiButton
            color="warning"
            onClick={handleDelete}
            disabled={!canEditRules}
            data-test-subj="deprecated-rule-delete-button"
            fill
          >
            {i18n.DELETE_RULE}
          </EuiButton>,
          <EuiButton
            color="warning"
            onClick={handleDuplicateAndDelete}
            disabled={!canEditRules}
            data-test-subj="deprecated-rule-duplicate-and-delete-button"
          >
            {i18n.DUPLICATE_AND_DELETE_RULE}
          </EuiButton>,
        ]}
        dataTestSubj="deprecated-rule-details-callout"
      />
      {isBulkDuplicateConfirmationVisible && (
        <DeprecatedRuleDuplicateConfirmation
          onCancel={cancelRuleDuplication}
          onConfirm={confirmRuleDuplication}
        />
      )}
    </>
  );
};
