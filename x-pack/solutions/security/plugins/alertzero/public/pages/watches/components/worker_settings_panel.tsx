/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import { css } from '@emotion/react';
import {
  EuiAccordion,
  EuiBadge,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiSwitch,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import type { Worker } from '@kbn/alertzero-common';
import { useUpdateWorker } from '../../../hooks/use_workers_api';
import { AutonomySlider } from './autonomy_slider';
import { ScheduleIntervalField } from './schedule_interval_field';
import { WorkerSkillsTable } from './worker_skills_table';
import * as settingsI18n from '../settings_translations';
import { workerName } from '../workers/translations';

interface WorkerSettingsPanelProps {
  worker: Worker;
  /** Accordion when a Watch has several Workers; a static panel when it has exactly one. */
  isAccordion: boolean;
  isExpanded: boolean;
  onToggle: (workerId: string, isOpen: boolean) => void;
}

/**
 * A single Worker's settings in the two-column layout. The header (name, autonomy/schedule badges,
 * enabled switch) doubles as the accordion button when a Watch has several Workers, so collapsed
 * panels still summarise their state. Memoized: scroll-spy updates in the parent must not
 * re-render every Worker's settings.
 */
export const WorkerSettingsPanel = React.memo(function WorkerSettingsPanel({
  worker,
  isAccordion,
  isExpanded,
  onToggle,
}: WorkerSettingsPanelProps) {
  const { mutate: updateWorker } = useUpdateWorker();
  const { euiTheme } = useEuiTheme();
  const settingsLocked = worker.state === 'unavailable';
  const name = workerName(worker.id, worker.name);

  const accordionCss = useMemo(
    () => css`
      .euiAccordion__triggerWrapper {
        align-items: center;
        padding: ${euiTheme.size.base};
        /* Full-width rule under the header, mirroring the static single-Worker band. */
        border-bottom: ${isExpanded ? euiTheme.border.thin : 'none'};
      }
      .euiAccordion__children {
        padding: ${euiTheme.size.base};
      }
    `,
    [euiTheme, isExpanded]
  );

  const enabledSwitch = (
    <EuiSwitch
      label={settingsI18n.ENABLED_SWITCH_LABEL}
      checked={worker.enabled}
      disabled={settingsLocked}
      onChange={(event) =>
        updateWorker({ workerId: worker.id, patch: { enabled: event.target.checked } })
      }
      data-test-subj={`alertZeroWorkerEnabledSwitch-${worker.id}`}
    />
  );

  const settingsBody = (
    <>
      {settingsLocked ? (
        <EuiText size="s" color="subdued">
          <p>{settingsI18n.WORKER_SETTINGS_UNAVAILABLE}</p>
        </EuiText>
      ) : null}
      <EuiSpacer size="m" />
      <AutonomySlider
        current={worker.settings.autonomy}
        isDisabled={settingsLocked}
        onChange={(autonomyLevel) =>
          updateWorker({ workerId: worker.id, patch: { autonomyLevel } })
        }
      />
      {/* Only schedule-driven Workers project an interval; the others are alert- or
          event-triggered and own no schedule to configure. */}
      {worker.settings.scheduleInterval != null ? (
        <>
          <EuiSpacer size="m" />
          <ScheduleIntervalField
            current={worker.settings.scheduleInterval}
            isDisabled={settingsLocked}
            onChange={(scheduleInterval) =>
              updateWorker({ workerId: worker.id, patch: { scheduleInterval } })
            }
          />
        </>
      ) : null}
      <EuiSpacer size="m" />
      <WorkerSkillsTable skills={worker.skills} />
    </>
  );

  const collapsedBadges = !isExpanded ? (
    <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
      <EuiFlexItem grow={false}>
        <EuiBadge color="hollow">
          {settingsI18n.autonomyLevelName(worker.settings.autonomy)}
        </EuiBadge>
      </EuiFlexItem>
      {worker.settings.scheduleInterval != null ? (
        <EuiFlexItem grow={false}>
          <EuiBadge color="hollow">
            {settingsI18n.SCHEDULE_INTERVAL_LABEL} {worker.settings.scheduleInterval}
          </EuiBadge>
        </EuiFlexItem>
      ) : null}
    </EuiFlexGroup>
  ) : null;

  if (isAccordion) {
    return (
      <EuiPanel hasBorder hasShadow={false} paddingSize="none">
        <EuiAccordion
          id={`${worker.id}-settings`}
          arrowDisplay="left"
          paddingSize="none"
          forceState={isExpanded ? 'open' : 'closed'}
          onToggle={(isOpen) => onToggle(worker.id, isOpen)}
          buttonContent={
            <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap>
              <EuiFlexItem grow={false}>
                <EuiTitle size="xs">
                  <span id={`${worker.id}-heading`}>{name}</span>
                </EuiTitle>
              </EuiFlexItem>
              {collapsedBadges}
            </EuiFlexGroup>
          }
          extraAction={enabledSwitch}
          data-test-subj={`alertZeroWatchWorkerAccordion-${worker.id}`}
          css={accordionCss}
        >
          {settingsBody}
        </EuiAccordion>
      </EuiPanel>
    );
  }

  return (
    <EuiPanel hasBorder hasShadow={false} paddingSize="l">
      <EuiFlexGroup
        alignItems="center"
        gutterSize="s"
        responsive={false}
        justifyContent="spaceBetween"
      >
        <EuiFlexItem grow={false}>
          <EuiTitle size="xs">
            <span id={`${worker.id}-heading`}>{name}</span>
          </EuiTitle>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>{enabledSwitch}</EuiFlexItem>
      </EuiFlexGroup>
      {settingsBody}
    </EuiPanel>
  );
});
