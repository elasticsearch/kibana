/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiText,
} from '@elastic/eui';
import type { RuleHistoryItem } from '../../../../../common/api/detection_engine/rule_management';
import * as i18n from './translations';

interface RuleRestoreConflictModalProps {
  item: RuleHistoryItem;
  isDeletedRule: boolean;
  onCancel: () => void;
  onReviewChanges: () => void;
  onRestoreAnyway: () => void;
}

export const RuleRestoreConflictModal = memo(function RuleRestoreConflictModal({
  item,
  isDeletedRule,
  onCancel,
  onReviewChanges,
  onRestoreAnyway,
}: RuleRestoreConflictModalProps): JSX.Element {
  return (
    <EuiModal
      onClose={onCancel}
      aria-labelledby="ruleRestoreConflictModalTitle"
      data-test-subj="ruleRestoreConflictModal"
    >
      <EuiModalHeader>
        <EuiModalHeaderTitle id="ruleRestoreConflictModalTitle">
          {isDeletedRule
            ? i18n.RESTORE_CONFLICT_DELETED_RULE_MODAL_TITLE
            : i18n.RESTORE_CONFLICT_MODAL_TITLE}
        </EuiModalHeaderTitle>
      </EuiModalHeader>
      <EuiModalBody>
        <EuiText>
          <p>
            {isDeletedRule
              ? i18n.RESTORE_CONFLICT_DELETED_RULE_MODAL_PARAGRAPH_1
              : i18n.RESTORE_CONFLICT_MODAL_PARAGRAPH_1}
          </p>
          <p>{i18n.RESTORE_CONFLICT_MODAL_PARAGRAPH_2(item.rule.revision)}</p>
          <p>{i18n.RESTORE_CONFLICT_MODAL_PARAGRAPH_3}</p>
        </EuiText>
      </EuiModalBody>
      <EuiModalFooter>
        <EuiButtonEmpty onClick={onCancel} data-test-subj="ruleRestoreConflictCancelButton">
          {i18n.RESTORE_CONFLICT_CANCEL}
        </EuiButtonEmpty>
        <EuiButton
          onClick={onReviewChanges}
          data-test-subj="ruleRestoreConflictReviewChangesButton"
        >
          {i18n.RESTORE_CONFLICT_REVIEW_CHANGES}
        </EuiButton>
        <EuiButton
          onClick={onRestoreAnyway}
          color="danger"
          fill
          data-test-subj="ruleRestoreConflictRestoreAnywayButton"
        >
          {i18n.RESTORE_CONFLICT_RESTORE_ANYWAY}
        </EuiButton>
      </EuiModalFooter>
    </EuiModal>
  );
});
