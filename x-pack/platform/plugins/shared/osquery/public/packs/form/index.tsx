/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { filter, isEmpty, map, omit, reduce } from 'lodash';
import type { EuiAccordionProps } from '@elastic/eui';
import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiButtonEmpty,
  EuiButton,
  EuiSpacer,
  EuiBottomBar,
  EuiHorizontalRule,
  EuiAccordion,
} from '@elastic/eui';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import deepEqual from 'fast-deep-equal';
import { FormProvider, useForm as useHookForm } from 'react-hook-form';

import { PackShardsField } from './shards/pack_shards_field';
import { useKibana, useRouterNavigate } from '../../common/lib/kibana';
import { ExperimentalFeaturesService } from '../../common/experimental_features_service';
import { PolicyIdComboBoxField } from './policy_id_combobox_field';
import { QueriesField } from './queries_field';
import { ConfirmDeployAgentPolicyModal } from './confirmation_modal';
import { useAgentPolicies } from '../../agent_policies';
import { useCreatePack } from '../use_create_pack';
import { useUpdatePack } from '../use_update_pack';
import { convertPackQueriesToSO, convertSOQueriesToPack } from './utils';
import { deserializeSchedule, serializeSchedule } from './schedule_serializer';
import { ScheduleSection } from '../../components/schedule_section';
import { validateScheduleFormData } from '../../components/schedule_section/validation';
import {
  PACK_QUERY_STALE_INTERVAL_ERROR,
  SCHEDULE_ERRORS_TOAST_TITLE,
} from '../../components/schedule_section/translations';
import type { ScheduleFormData } from '../../components/schedule_section/types';
import type { PackItem } from '../types';
import { NameField } from './name_field';
import { DescriptionField } from './description_field';
import type { PackQueryFormData } from '../queries/use_pack_query_form';
import { PackTypeSelectable } from './shards/pack_type_selectable';
import { TargetingWarningCallout } from './targeting_warning_callout';
import { overflowCss } from '../utils';

type PackFormData = Omit<PackItem, 'id' | 'queries'> & {
  queries: PackQueryFormData[];
  pack_type: string;
  schedule?: ScheduleFormData;
};

const euiAccordionCss = ({ euiTheme }: UseEuiTheme) => ({
  '.euiAccordion__button': {
    color: euiTheme.colors.primary,
  },
});

interface PackFormProps {
  defaultValue?: PackItem;
  editMode?: boolean;
  isReadOnly?: boolean;
  isPrebuilt?: boolean;
  onDirtyStateChange?: (isDirty: boolean) => void;
}

const PackFormComponent: React.FC<PackFormProps> = ({
  defaultValue,
  editMode = false,
  isReadOnly = false,
  isPrebuilt = false,
  onDirtyStateChange,
}) => {
  const [shardsToggleState, setShardsToggleState] =
    useState<EuiAccordionProps['forceState']>('closed');
  const handleToggle = useCallback((isOpen: any) => {
    const newState = isOpen ? 'open' : 'closed';
    setShardsToggleState(newState);
  }, []);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const handleHideConfirmationModal = useCallback(() => setShowConfirmationModal(false), []);

  const {
    notifications: { toasts },
  } = useKibana().services;

  const { data: { agentPoliciesById } = {} } = useAgentPolicies();

  // Cancel returns to the Packs list. The read-only Pack details page was
  // removed, so edit mode no longer navigates back to `packs/:packId`.
  const cancelButtonProps = useRouterNavigate('packs');

  const { mutateAsync: createAsync } = useCreatePack({
    withRedirect: true,
  });
  const { mutateAsync: updateAsync } = useUpdatePack({
    withRedirect: true,
  });

  const isRruleSchedulingEnabled = ExperimentalFeaturesService.get().rruleScheduling;

  // Whether the pack SO actually persisted a pack-level schedule (`schedule_type`
  // set), vs. a legacy pack (pre-9.5, no pack-level schedule fields at all) for
  // which the client synthesizes an interval-mode default purely so the form has
  // something to render. Only a real pack-level schedule is a legitimate
  // inheritance target for a non-override query — see elastic/kibana#277700.
  // A brand-new pack has no legacy baggage, so it's treated as explicit too:
  // its first save always writes a real `schedule_type`.
  const packHasExplicitSchedule =
    isRruleSchedulingEnabled && (!editMode || defaultValue?.schedule_type !== undefined);

  // Computed once and reused for both `defaultValues.schedule` and
  // `originalStartDate` so they can't diverge on independent `new Date()` calls.
  const deserializedSchedule = useMemo(
    () =>
      isRruleSchedulingEnabled
        ? deserializeSchedule(
            defaultValue
              ? {
                  schedule_type: defaultValue.schedule_type,
                  interval: defaultValue.interval,
                  rrule_schedule: defaultValue.rrule_schedule,
                }
              : undefined
          )
        : undefined,

    [isRruleSchedulingEnabled, defaultValue]
  );

  const deserializer = (payload: PackItem) => {
    const defaultPolicyIds = filter(
      payload.policy_ids,
      (policyId) => payload.shards?.[policyId] == null
    );

    // Strip rrule-era fields before spreading so a flag-off form never
    // carries them into state or re-emits them on submit.
    const {
      schedule_type: payloadScheduleType,
      interval: payloadInterval,
      rrule_schedule: payloadRruleSchedule,
      ...legacyPayload
    } = payload;

    return {
      ...(isRruleSchedulingEnabled ? payload : legacyPayload),
      policy_ids: defaultPolicyIds ?? [],
      queries: convertPackQueriesToSO(payload.queries),
      shards: omit(payload.shards, '*') ?? {},
      schedule: deserializedSchedule,
    };
  };

  const defaultPackType = defaultValue?.shards?.['*'] ? 'global' : 'policy';

  const hooksForm = useHookForm<PackFormData>({
    defaultValues: defaultValue
      ? { ...deserializer(defaultValue), pack_type: defaultPackType }
      : {
          name: '',
          description: '',
          policy_ids: [],
          enabled: true,
          queries: [],
          pack_type: 'policy',
          schedule: deserializedSchedule,
        },
  });

  useEffect(() => {
    if (!isEmpty(defaultValue?.shards) && !defaultValue?.shards?.['*']) {
      setShardsToggleState('open');
    }
  }, [defaultValue, defaultValue?.shards]);

  const {
    handleSubmit,
    watch,
    trigger,
    setValue,
    formState: { isSubmitting, isDirty, dirtyFields },
  } = hooksForm;
  const { policy_ids: policyIds, shards, pack_type: packType, schedule, queries } = watch();

  const originalStartDate = useMemo(() => {
    if (!editMode || !defaultValue) {
      return undefined;
    }

    return deserializedSchedule?.startDate;
  }, [editMode, defaultValue, deserializedSchedule]);

  const scheduleErrors = useMemo(() => {
    if (!isRruleSchedulingEnabled || !schedule) {
      return [];
    }

    const errors = validateScheduleFormData(schedule, { originalStartDate });

    if (
      schedule.scheduleType === 'rrule' &&
      queries?.some((query) => query.schedule_type === 'interval')
    ) {
      errors.push(PACK_QUERY_STALE_INTERVAL_ERROR);
    }

    return errors;
  }, [isRruleSchedulingEnabled, schedule, queries, originalStartDate]);

  const [showScheduleErrors, setShowScheduleErrors] = useState(false);

  const onDirtyStateChangeRef = useRef(onDirtyStateChange);
  onDirtyStateChangeRef.current = onDirtyStateChange;

  useEffect(() => {
    onDirtyStateChangeRef.current?.(isDirty);
  }, [isDirty]);

  const getShards = useCallback(() => {
    if (packType === 'global') {
      return { '*': 100 };
    }

    return reduce(
      shards,
      (acc, shard, key) => {
        if (!isEmpty(key)) {
          return { ...acc, [key]: shard };
        }

        return acc;
      },
      {}
    );
  }, [packType, shards]);

  // RHF clears dirtyFields.schedule when the value equals the synthesized default
  // (e.g. a legacy pack whose default interval is 3600s), so value-equality alone
  // would drop a deliberate "set it to 3600" choice. Track raw interaction instead.
  const scheduleInteractedRef = useRef(false);
  const handleScheduleChange = useCallback(
    (next: ScheduleFormData) => {
      scheduleInteractedRef.current = true;
      setValue('schedule', next, { shouldDirty: true });
    },
    [setValue]
  );

  // Surface schedule errors so a blocked submit is never a silent no-op.
  const showScheduleErrorsToast = useCallback(
    (errors: string[]) => {
      setShowScheduleErrors(true);
      toasts.addDanger({
        title: SCHEDULE_ERRORS_TOAST_TITLE,
        text: errors.join('\n'),
      });
    },
    [toasts]
  );

  const onSubmit = useCallback(
    async (values: PackFormData) => {
      // RHF field errors alone don't block submit for the controlled
      // ScheduleSection object; re-validate here before allowing submit.
      if (isRruleSchedulingEnabled && values.schedule) {
        const submitScheduleErrors = validateScheduleFormData(values.schedule, {
          originalStartDate,
        });
        if (submitScheduleErrors.length > 0) {
          showScheduleErrorsToast(submitScheduleErrors);

          return;
        }
      }

      const serializer = ({
        shards: _,
        pack_type: __,
        schedule: scheduleFormState,
        policy_ids: payloadAgentPolicyIds,
        queries: payloadQueries,
        schedule_type: _scheduleType,
        interval: _interval,
        rrule_schedule: _rruleSchedule,
        ...restPayload
      }: PackFormData) => {
        const mappedShards = !isEmpty(shards)
          ? (filter(
              map(shards, (shard, key) => {
                if (!isEmpty(key)) {
                  return key;
                }
              })
            ) as string[])
          : [];
        const policies = [...payloadAgentPolicyIds, ...mappedShards];

        // Emit schedule fields only when the user touched the schedule or the pack
        // already has one — otherwise an untouched legacy pack triggers a spurious
        // legacy→interval transition that strips every bare per-query interval.
        const scheduleIsDirtyOrExplicit =
          Boolean(dirtyFields.schedule) || scheduleInteractedRef.current || packHasExplicitSchedule;
        const scheduleFields =
          isRruleSchedulingEnabled && scheduleFormState && scheduleIsDirtyOrExplicit
            ? serializeSchedule(scheduleFormState)
            : {};

        return {
          ...restPayload,
          policy_ids: policies ?? [],
          // On edit, round-trip each query's id so the server preserves schedule_id.
          queries: convertSOQueriesToPack(payloadQueries, { includeId: editMode }),
          shards: getShards() ?? {},
          ...scheduleFields,
        };
      };

      try {
        if (editMode && defaultValue?.saved_object_id) {
          await updateAsync({ id: defaultValue?.saved_object_id, ...serializer(values) });
        } else {
          await createAsync(serializer(values));
        }
        // eslint-disable-next-line no-empty
      } catch (e) {}
    },
    [
      createAsync,
      defaultValue?.saved_object_id,
      dirtyFields.schedule,
      editMode,
      getShards,
      isRruleSchedulingEnabled,
      originalStartDate,
      packHasExplicitSchedule,
      shards,
      showScheduleErrorsToast,
      updateAsync,
    ]
  );

  const handleSubmitForm = useMemo(() => handleSubmit(onSubmit), [handleSubmit, onSubmit]);

  const agentCount = useMemo(
    () =>
      reduce(
        policyIds,
        (acc, policyId) => {
          const agentPolicy = agentPoliciesById && agentPoliciesById[policyId];

          return acc + (agentPolicy?.agents ?? 0);
        },
        0
      ),
    [policyIds, agentPoliciesById]
  );

  const handleSaveClick = useCallback(async () => {
    const isValid = await trigger();
    if (!isValid) {
      return;
    }

    if (scheduleErrors.length > 0) {
      showScheduleErrorsToast(scheduleErrors);

      return;
    }

    if (agentCount) {
      setShowConfirmationModal(true);

      return;
    }

    handleSubmitForm();
  }, [agentCount, handleSubmitForm, scheduleErrors, showScheduleErrorsToast, trigger]);

  const handleConfirmConfirmationClick = useCallback(async () => {
    setShowConfirmationModal(false);
    await handleSubmitForm();
  }, [handleSubmitForm]);

  // Pack content (name, description, queries) is immutable for both read-only
  // (readPacks-only) users and prebuilt Elastic packs.
  const isContentDisabled = isReadOnly || isPrebuilt;
  const euiFieldProps = useMemo(() => ({ isDisabled: isContentDisabled }), [isContentDisabled]);
  // Scheduled agent policies / shards / Type stay editable for prebuilt packs
  // (a writePacks user may re-target them) — only a fully read-only user is
  // blocked. Matches the prebuiltPackModeDescription callout.
  const policyFieldProps = useMemo(() => ({ isDisabled: isReadOnly }), [isReadOnly]);

  const changePackType = useCallback(
    (type: 'global' | 'policy' | 'shards') => {
      setValue('pack_type', type, { shouldDirty: true });
    },
    [setValue]
  );

  const options = useMemo(
    () =>
      Object.entries(agentPoliciesById ?? {}).map(([agentPolicyId, agentPolicy]) => ({
        key: agentPolicyId,
        label: agentPolicy.name,
      })),
    [agentPoliciesById]
  );

  // Must mirror the `policy_ids` built in the submit handler (combo-box selection
  // plus shard keys). Passing only `policyIds` would flag a shard-targeted policy
  // as collateral damage, contradicting the server's own post-save check.
  const targetPolicyIds = useMemo(
    () => [
      ...(policyIds ?? []),
      ...filter(
        map(shards, (shard, key) => key),
        (key) => !isEmpty(key)
      ),
    ],
    [policyIds, shards]
  );

  const availableOptions = useMemo(() => {
    const currentShardsFieldValues = map(shards, (shard, key) => key);
    const currentPolicyIdsFieldValues = map(policyIds, (policy) => policy);

    const currentValues = [...currentShardsFieldValues, ...currentPolicyIdsFieldValues];

    return options.filter(({ key }) => !currentValues.includes(key));
  }, [shards, policyIds, options]);

  return (
    <>
      <FormProvider {...hooksForm}>
        <EuiFlexGroup>
          <EuiFlexItem>
            <NameField euiFieldProps={euiFieldProps} />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <EuiFlexItem>
            <DescriptionField euiFieldProps={euiFieldProps} />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        <EuiFlexGroup>
          <PackTypeSelectable
            packType={packType}
            setPackType={changePackType}
            isDisabled={isReadOnly}
          />
        </EuiFlexGroup>
        <EuiSpacer size="m" />

        {packType === 'policy' && (
          <>
            <EuiFlexGroup>
              <EuiFlexItem css={overflowCss}>
                <PolicyIdComboBoxField
                  options={availableOptions}
                  euiFieldProps={policyFieldProps}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            {/* The callout supplies its own leading spacer when it renders. */}
            <TargetingWarningCallout
              targetPolicyIds={targetPolicyIds}
              agentPoliciesById={agentPoliciesById}
            />
            <EuiSpacer size="m" />

            <EuiFlexGroup>
              <EuiFlexItem css={overflowCss}>
                <EuiAccordion
                  css={euiAccordionCss}
                  id="shardsToggle"
                  forceState={shardsToggleState}
                  onToggle={handleToggle}
                  buttonContent="Partial deployment (shards)"
                >
                  <EuiSpacer size="xs" />
                  <PackShardsField options={availableOptions} isDisabled={isReadOnly} />
                </EuiAccordion>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        )}

        {isRruleSchedulingEnabled && schedule ? (
          <>
            <EuiFlexGroup>
              <EuiFlexItem>
                <ScheduleSection
                  value={schedule}
                  onChange={handleScheduleChange}
                  disabled={isContentDisabled}
                  showErrors={showScheduleErrors || scheduleErrors.length > 0}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </>
        ) : null}

        <EuiSpacer size="xl" />

        <EuiHorizontalRule />

        <QueriesField
          euiFieldProps={euiFieldProps}
          packHasExplicitSchedule={packHasExplicitSchedule}
        />
      </FormProvider>
      <EuiSpacer size="xxl" />
      <EuiSpacer size="xxl" />
      <EuiSpacer size="xxl" />
      <EuiBottomBar>
        <EuiFlexGroup justifyContent="flexEnd">
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="m">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty color="text" {...cancelButtonProps}>
                  <FormattedMessage
                    id="xpack.osquery.pack.form.cancelButtonLabel"
                    defaultMessage="Cancel"
                  />
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  isLoading={isSubmitting}
                  // Prebuilt packs keep an enabled save so writePacks users can
                  // persist scheduled-policy/shards changes; only a read-only
                  // (readPacks-only) user has saving disabled.
                  isDisabled={isReadOnly}
                  color="primary"
                  fill
                  size="m"
                  iconType="save"
                  onClick={handleSaveClick}
                  data-test-subj={`${editMode ? 'update' : 'save'}-pack-button`}
                >
                  {editMode ? (
                    <FormattedMessage
                      id="xpack.osquery.pack.form.updatePackButtonLabel"
                      defaultMessage="Update pack"
                    />
                  ) : (
                    <FormattedMessage
                      id="xpack.osquery.pack.form.savePackButtonLabel"
                      defaultMessage="Save pack"
                    />
                  )}
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiBottomBar>
      {showConfirmationModal && (
        <ConfirmDeployAgentPolicyModal
          onCancel={handleHideConfirmationModal}
          onConfirm={handleConfirmConfirmationClick}
          agentCount={agentCount}
          agentPolicyCount={policyIds.length}
        />
      )}
    </>
  );
};

export const PackForm = React.memo(PackFormComponent, deepEqual);
