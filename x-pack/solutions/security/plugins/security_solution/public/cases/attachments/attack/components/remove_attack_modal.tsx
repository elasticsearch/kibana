/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiCheckbox,
  EuiConfirmModal,
  EuiLoadingSpinner,
  EuiSpacer,
  EuiText,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID,
  REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID,
  REMOVE_ATTACK_MODAL_TEST_ID,
} from '../../../../../common/cases/attachments/attack/test_ids';

const TITLE = i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.title', {
  defaultMessage: 'Remove attack',
});

const CONFIRM = i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.confirm', {
  defaultMessage: 'Remove',
});

const CANCEL = i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.cancel', {
  defaultMessage: 'Cancel',
});

const RESOLVING = i18n.translate('xpack.securitySolution.attackDiscovery.cases.remove.resolving', {
  defaultMessage: 'Checking which alerts can be removed with this attack…',
});

const UNRESOLVABLE = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.remove.unresolvable',
  {
    defaultMessage:
      'The alerts belonging to this attack could not be determined, so they cannot be removed with it. The attack may have been deleted, aged into a frozen tier, or be outside your access.',
  }
);

const NO_REMOVABLE_ALERTS = i18n.translate(
  'xpack.securitySolution.attackDiscovery.cases.remove.noRemovableAlerts',
  {
    defaultMessage:
      'None of this attack’s alerts can be removed with it. They are either no longer attached to this case, no longer part of the attack, or still claimed by another attack on this case.',
  }
);

export interface RemoveAttackModalProps {
  /** The attack title, so the user can tell which attachment they are removing. */
  attackTitle: string;
  /** How many alert documents would be removed alongside the attack. */
  alertCount: number;
  /** False when at least one attack on the case could not be resolved. */
  isResolvable: boolean;
  /** True while the removable alerts are still being resolved. */
  isLoading: boolean;
  /** Closes the modal without removing anything. */
  onCancel: () => void;
  /** Confirms the removal, reporting whether the related alerts should go too. */
  onConfirm: (options: { removeRelatedAlerts: boolean }) => void;
}

/**
 * Confirms the removal of a `security.attack` attachment, offering to remove the alerts the
 * attack brought in with it.
 *
 * The checkbox is checked by default: an attack brings its alerts onto the case, so removing it
 * takes them back off unless the analyst says otherwise. It is disabled, with the reason spelled
 * out beneath it, when there is nothing safe to remove — either the attack's alert set could not
 * be resolved, or none of its alerts are removable (see
 * {@link resolveRemovableAlertAttachments}).
 *
 * Purely presentational, so the resolution can be mounted — and paid for — only once the user
 * has asked to remove something.
 */
export const RemoveAttackModal = ({
  attackTitle,
  alertCount,
  isResolvable,
  isLoading,
  onCancel,
  onConfirm,
}: RemoveAttackModalProps) => {
  const [removeRelatedAlerts, setRemoveRelatedAlerts] = useState(true);
  const modalTitleId = useGeneratedHtmlId({ prefix: 'removeAttackTitle' });
  const checkboxId = useGeneratedHtmlId({ prefix: 'removeAttackAlerts' });

  const onCheckboxChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => setRemoveRelatedAlerts(event.target.checked),
    []
  );

  const onConfirmClick = useCallback(
    // `removeRelatedAlerts` can only be true while the checkbox is enabled, but guard anyway so a
    // result that becomes unresolvable after the box was ticked cannot remove anything.
    () => onConfirm({ removeRelatedAlerts: removeRelatedAlerts && isResolvable && alertCount > 0 }),
    [alertCount, isResolvable, onConfirm, removeRelatedAlerts]
  );

  const hasRemovableAlerts = isResolvable && alertCount > 0;
  const explanation = isResolvable ? NO_REMOVABLE_ALERTS : UNRESOLVABLE;

  return (
    <EuiConfirmModal
      aria-labelledby={modalTitleId}
      buttonColor="danger"
      cancelButtonText={CANCEL}
      confirmButtonText={CONFIRM}
      data-test-subj={REMOVE_ATTACK_MODAL_TEST_ID}
      onCancel={onCancel}
      onConfirm={onConfirmClick}
      title={TITLE}
      titleProps={{ id: modalTitleId }}
    >
      <EuiText size="s">
        <p>
          <FormattedMessage
            id="xpack.securitySolution.attackDiscovery.cases.remove.body"
            defaultMessage="{attackTitle} will be removed from this case."
            values={{ attackTitle: <strong>{attackTitle}</strong> }}
          />
        </p>
      </EuiText>
      <EuiSpacer size="m" />
      {isLoading ? (
        <EuiText size="s" data-test-subj={REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID}>
          <EuiLoadingSpinner size="s" /> {RESOLVING}
        </EuiText>
      ) : (
        <>
          <EuiCheckbox
            checked={hasRemovableAlerts && removeRelatedAlerts}
            data-test-subj={REMOVE_ATTACK_ALERTS_CHECKBOX_TEST_ID}
            disabled={!hasRemovableAlerts}
            id={checkboxId}
            label={i18n.translate(
              'xpack.securitySolution.attackDiscovery.cases.remove.alertsCheckboxLabel',
              {
                defaultMessage:
                  'Also remove {alertCount, plural, one {# related alert} other {# related alerts}}',
                values: { alertCount },
              }
            )}
            onChange={onCheckboxChange}
          />
          {hasRemovableAlerts ? null : (
            <>
              <EuiSpacer size="xs" />
              <EuiText
                color="subdued"
                data-test-subj={REMOVE_ATTACK_ALERTS_EXPLANATION_TEST_ID}
                size="xs"
              >
                <p>{explanation}</p>
              </EuiText>
            </>
          )}
        </>
      )}
    </EuiConfirmModal>
  );
};

RemoveAttackModal.displayName = 'RemoveAttackModal';
