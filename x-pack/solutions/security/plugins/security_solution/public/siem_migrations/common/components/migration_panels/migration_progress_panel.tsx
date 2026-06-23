/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiText,
  EuiPanel,
  EuiProgress,
  EuiLoadingSpinner,
  EuiIcon,
  EuiSpacer,
  useEuiTheme,
  tint,
  EuiButtonEmpty,
} from '@elastic/eui';
import { AssistantIcon } from '@kbn/ai-assistant-icon';
import { PanelText } from '../../../../common/components/panel_text';
import { useStopSiemMigration } from '../../hooks/use_stop_siem_migration';
import type { MigrationTaskStats } from '../../../../../common/siem_migrations/model/common.gen';
import type { MigrationType } from '../../../../../common/siem_migrations/types';
import { MigrationPanelTitle } from './migration_title';
import { MigrationsReadMore } from './read_more';
import {
  MIGRATION_PROGRESS_DESCRIPTION,
  MIGRATION_PREPARING,
  MIGRATION_TRANSLATING,
  MIGRATION_STOP_BUTTON,
  MIGRATION_STOPPING_BUTTON,
} from './translations';

export interface MigrationProgressPanelProps {
  migrationStats: MigrationTaskStats;
  migrationType: MigrationType;
}

export const MigrationProgressPanel = React.memo(function MigrationProgressPanel({
  migrationStats,
  migrationType,
}: MigrationProgressPanelProps) {
  const { euiTheme } = useEuiTheme();
  const { mutate: stopMigration, isLoading: isStopping } = useStopSiemMigration(migrationType);

  const onStopMigration = useCallback(() => {
    stopMigration({ migrationId: migrationStats.id, vendor: migrationStats.vendor });
  }, [migrationStats, stopMigration]);

  const { items } = migrationStats;
  const finishedCount = items.completed + items.failed;
  const progressValue = (finishedCount / items.total) * 100;

  const preparing = items.pending === items.total;

  // Create dynamic data-test-subj attributes for testing compatibility
  const panelTestId = `${migrationType}MigrationProgressPanel`;
  const descriptionTestId = `${migrationType}MigrationDescription`;
  const spinnerTestId = `${migrationType}MigrationSpinner`;
  const progressBarTestId = `${migrationType}MigrationProgressBar`;

  return (
    <EuiPanel data-test-subj={panelTestId} hasShadow={false} hasBorder paddingSize="m">
      <EuiFlexGroup direction="row" alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFlexGroup direction="column" gutterSize="xs">
            <EuiFlexItem grow={false}>
              <MigrationPanelTitle migrationStats={migrationStats} migrationType={migrationType} />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiText size="s">{MIGRATION_PROGRESS_DESCRIPTION(items.total)}</EuiText>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            iconType="stop"
            isLoading={isStopping}
            onClick={onStopMigration}
            data-test-subj="stopMigrationButton"
          >
            {isStopping ? MIGRATION_STOPPING_BUTTON : MIGRATION_STOP_BUTTON}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiFlexGroup direction="row" justifyContent="flexStart" alignItems="center" gutterSize="s">
        <EuiFlexItem grow={false}>
          <EuiIcon size="m" type={AssistantIcon} aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <PanelText size="s" subdued data-test-subj={descriptionTestId}>
            {preparing ? MIGRATION_PREPARING : MIGRATION_TRANSLATING}
          </PanelText>
        </EuiFlexItem>
        {!isStopping && (
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="s" data-test-subj={spinnerTestId} />
          </EuiFlexItem>
        )}
      </EuiFlexGroup>
      {!preparing && (
        <>
          <EuiProgress
            value={progressValue}
            valueText={`${Math.floor(progressValue)}%`}
            max={100}
            color={tint(euiTheme.colors.success, 0.25)}
            data-test-subj={progressBarTestId}
          />
          <EuiSpacer size="xs" />
          <MigrationsReadMore migrationType={migrationType} />
        </>
      )}
    </EuiPanel>
  );
});
