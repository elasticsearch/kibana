/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import { i18n } from '@kbn/i18n';
import { useFetchRule } from '../../../hooks/use_fetch_rule';
import { useDeleteRule } from '../../../hooks/use_delete_rule';
import { useToggleRuleEnabled } from '../../../hooks/use_toggle_rule_enabled';
import type { RuleApiResponse } from '../../../services/rules_api';
import { DeleteConfirmationModal } from '../modals/delete_confirmation_modal';
import { EntityNotFoundFlyout } from '../../entity_not_found_flyout';
import { LoadingFlyout } from '../../loading_flyout';
import { RuleSummaryFlyout } from './rule_summary_flyout';

interface Props {
  ruleId: string;
  onClose: () => void;
  onEdit: (rule: RuleApiResponse) => void;
  onClone: (rule: RuleApiResponse) => void;
}

export const RuleSummaryFlyoutContainer = ({ ruleId, onClose, onEdit, onClone }: Props) => {
  const [ruleToDelete, setRuleToDelete] = useState<RuleApiResponse | null>(null);

  const { data: rule, isLoading, isError } = useFetchRule(ruleId);
  const { mutate: deleteRule, isLoading: isDeleting } = useDeleteRule();
  const { mutate: toggleRuleEnabled } = useToggleRuleEnabled();

  if (isLoading) {
    return <LoadingFlyout onClose={onClose} />;
  }

  if (isError || !rule) {
    return (
      <EntityNotFoundFlyout
        title={i18n.translate('xpack.alertingV2.rule.summaryFlyout.notFoundTitle', {
          defaultMessage: 'Rule not found',
        })}
        body={i18n.translate('xpack.alertingV2.rule.summaryFlyout.notFoundBody', {
          defaultMessage: 'The rule may have been deleted or you may not have access to it.',
        })}
        onClose={onClose}
      />
    );
  }

  return (
    <>
      <RuleSummaryFlyout
        rule={rule}
        hasAnimation={false}
        ownFocus={false}
        session="start"
        onClose={onClose}
        onEdit={onEdit}
        onClone={onClone}
        onDelete={(r) => setRuleToDelete(r)}
        onToggleEnabled={(r) => toggleRuleEnabled({ id: r.id, enabled: !r.enabled })}
      />
      {ruleToDelete && (
        <DeleteConfirmationModal
          ruleName={ruleToDelete.metadata.name}
          onCancel={() => setRuleToDelete(null)}
          onConfirm={() => {
            deleteRule(
              { id: ruleToDelete.id, name: ruleToDelete.metadata.name },
              {
                onSuccess: () => {
                  setRuleToDelete(null);
                  onClose();
                },
              }
            );
          }}
          isLoading={isDeleting}
        />
      )}
    </>
  );
};
