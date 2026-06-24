/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import { EuiButtonGroup, EuiFormRow, EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useFormContext, useWatch } from 'react-hook-form';
import { DELAY_MODE } from '../types';
import type { FormValues } from '../types';
import { deriveRecoveryDelayModeFromStateTransition } from '../utils/state_transition_helpers';
import { StateTransitionCountField } from './state_transition_count_field';
import { StateTransitionTimeframeField } from './state_transition_timeframe_field';
import { useRuleFormMeta } from '../contexts';

type DelayMode =
  | typeof DELAY_MODE.immediate
  | typeof DELAY_MODE.recoveries
  | typeof DELAY_MODE.duration;

const MODE_OPTION_IDS = {
  immediate: 'recovery_delay_mode_immediate',
  recoveries: 'recovery_delay_mode_recoveries',
  duration: 'recovery_delay_mode_duration',
} as const;

const MODE_OPTIONS = [
  {
    id: MODE_OPTION_IDS.immediate,
    label: i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.delayModeImmediate', {
      defaultMessage: 'Immediate',
    }),
  },
  {
    id: MODE_OPTION_IDS.recoveries,
    label: i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.delayModeRecoveries', {
      defaultMessage: 'Recoveries',
    }),
  },
  {
    id: MODE_OPTION_IDS.duration,
    label: i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.delayModeDuration', {
      defaultMessage: 'Duration',
    }),
  },
];

const modeFromOptionId = (id: string): DelayMode => {
  if (id === MODE_OPTION_IDS.immediate) return DELAY_MODE.immediate;
  if (id === MODE_OPTION_IDS.duration) return DELAY_MODE.duration;
  return DELAY_MODE.recoveries;
};

const optionIdForMode = (mode: DelayMode): string => {
  if (mode === DELAY_MODE.immediate) return MODE_OPTION_IDS.immediate;
  if (mode === DELAY_MODE.duration) return MODE_OPTION_IDS.duration;
  return MODE_OPTION_IDS.recoveries;
};

const DEFAULT_RECOVERING_COUNT = 2;
const DEFAULT_RECOVERING_TIMEFRAME = '2m';

export const RecoveryDelayField = () => {
  const { control, getValues, setValue } = useFormContext<FormValues>();
  const { layout } = useRuleFormMeta();
  const stateTransition = useWatch({ control, name: 'stateTransition' });
  const selectedMode = useWatch({ control, name: 'stateTransitionRecoveryDelayMode' });
  const derived = selectedMode ?? deriveRecoveryDelayModeFromStateTransition(stateTransition);
  const displayMode: DelayMode =
    derived === DELAY_MODE.immediate || derived === DELAY_MODE.duration
      ? derived
      : DELAY_MODE.recoveries;

  const onModeChange = useCallback(
    (optionId: string) => {
      const st = getValues('stateTransition') ?? {};
      const nextMode = modeFromOptionId(optionId);
      switch (nextMode) {
        case DELAY_MODE.immediate:
          setValue('stateTransitionRecoveryDelayMode', DELAY_MODE.immediate, { shouldDirty: true });
          setValue(
            'stateTransition',
            {
              ...st,
              recoveringCount: null,
              recoveringTimeframe: null,
            },
            { shouldDirty: true, shouldTouch: true }
          );
          break;
        case DELAY_MODE.recoveries:
          setValue('stateTransitionRecoveryDelayMode', DELAY_MODE.recoveries, {
            shouldDirty: true,
          });
          setValue(
            'stateTransition',
            {
              ...st,
              recoveringCount: st.recoveringCount || DEFAULT_RECOVERING_COUNT,
              recoveringTimeframe: null,
            },
            { shouldDirty: true, shouldTouch: true }
          );
          break;
        case DELAY_MODE.duration:
          setValue('stateTransitionRecoveryDelayMode', DELAY_MODE.duration, { shouldDirty: true });
          setValue(
            'stateTransition',
            {
              ...st,
              recoveringCount: null,
              recoveringTimeframe: st.recoveringTimeframe ?? DEFAULT_RECOVERING_TIMEFRAME,
            },
            { shouldDirty: true, shouldTouch: true }
          );
          break;
      }
    },
    [getValues, setValue]
  );

  return (
    <EuiFormRow
      label={i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.label', {
        defaultMessage: 'Recovery delay',
      })}
      fullWidth
      data-test-subj="recoveryDelayFormRow"
    >
      <>
        <EuiButtonGroup
          buttonSize={layout === 'flyout' ? 'compressed' : 's'}
          legend={i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.delayModeLegend', {
            defaultMessage: 'Recovery delay mode',
          })}
          options={MODE_OPTIONS}
          idSelected={optionIdForMode(displayMode)}
          onChange={onModeChange}
          isFullWidth
          data-test-subj="recoveryDelayMode"
        />
        <EuiSpacer size="s" />
        {displayMode === DELAY_MODE.immediate && (
          <EuiText size="xs" color="subdued" data-test-subj="recoveryDelayImmediateDescription">
            {i18n.translate('xpack.alertingV2.ruleForm.recoveryDelay.immediateDescription', {
              defaultMessage: 'No delay - Recovers on first non-breach',
            })}
          </EuiText>
        )}
        {displayMode === DELAY_MODE.recoveries && (
          <StateTransitionCountField
            variant="recovering"
            prependLabel={i18n.translate(
              'xpack.alertingV2.ruleForm.recoveryDelay.inlineRecoveriesPrepend',
              { defaultMessage: 'Consecutive recoveries' }
            )}
          />
        )}
        {displayMode === DELAY_MODE.duration && (
          <StateTransitionTimeframeField
            variant="recovering"
            numberPrependLabel={i18n.translate(
              'xpack.alertingV2.ruleForm.recoveryDelay.inlineDurationPrepend',
              { defaultMessage: 'Recovering for' }
            )}
          />
        )}
      </>
    </EuiFormRow>
  );
};
