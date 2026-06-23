/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';

import { EuiFlexGroup, EuiFlexItem, EuiHealth, EuiIcon, EuiToolTip } from '@elastic/eui';
import { css } from '@emotion/css';
import {
  MigrationTranslationResult,
  SiemMigrationStatus,
} from '../../../../../common/siem_migrations/constants';
import { convertTranslationResultIntoText, useResultVisColors } from '../../../common/utils';
import type { RuleMigrationRule } from '../../../../../common/siem_migrations/model/rule_migration.gen';
import * as i18n from './translations';

const statusTextWrapperClassName = css`
  width: 100%;
  display: inline-grid;
`;

interface StatusBadgeProps {
  migrationRule: RuleMigrationRule;
  'data-test-subj'?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = React.memo(
  ({ migrationRule, 'data-test-subj': dataTestSubj = 'translation-result' }) => {
    const colors = useResultVisColors();
    // Installed
    if (migrationRule.elastic_rule?.id) {
      return (
        <EuiToolTip content={i18n.RULE_STATUS_INSTALLED}>
          <EuiFlexGroup gutterSize="xs" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiIcon
                type="check"
                color={colors[MigrationTranslationResult.FULL]}
                aria-hidden={true}
              />
            </EuiFlexItem>
            <EuiFlexItem data-test-subj={dataTestSubj} grow={false}>
              {i18n.RULE_STATUS_INSTALLED}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiToolTip>
      );
    }

    // Failed
    if (migrationRule.status === SiemMigrationStatus.FAILED) {
      const tooltipMessage = migrationRule.comments?.length
        ? migrationRule.comments[0].message
        : i18n.RULE_STATUS_FAILED;
      return (
        <EuiToolTip content={tooltipMessage}>
          <EuiFlexGroup gutterSize="xs" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiIcon type="warningFill" color="danger" aria-hidden={true} />
            </EuiFlexItem>
            <EuiFlexItem data-test-subj={dataTestSubj} grow={false}>
              {i18n.RULE_STATUS_FAILED}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiToolTip>
      );
    }

    const translationResult = migrationRule.translation_result ?? 'untranslatable';
    const displayValue = convertTranslationResultIntoText(translationResult);
    const color = colors[translationResult];

    return (
      <EuiToolTip content={displayValue}>
        <EuiHealth color={color} data-test-subj={dataTestSubj}>
          <div className={statusTextWrapperClassName}>
            <span className="eui-textTruncate">{displayValue}</span>
          </div>
        </EuiHealth>
      </EuiToolTip>
    );
  }
);
StatusBadge.displayName = 'StatusBadge';
