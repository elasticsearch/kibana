/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiAccordion,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiResizableContainer,
  EuiSpacer,
} from '@elastic/eui';
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styled from 'styled-components';

import { ruleTypeMappings } from '@kbn/securitysolution-rules';
import { useGetEndpointExceptionsPerPolicyOptIn } from '../../../../management/hooks/artifacts/use_endpoint_per_policy_opt_in';
import { EndpointExceptionsMovedCallout } from '../../../../exceptions/components/endpoint_exceptions_moved_callout';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import {
  isEsqlRule,
  isMlRule,
  isThreatMatchRule,
} from '../../../../../common/detection_engine/utils';
import { useCreateRule } from '../../../rule_management/logic';
import type { RuleCreateProps } from '../../../../../common/api/detection_engine/model/rule_schema';
import { useListsConfig } from '../../../../detections/containers/detection_engine/lists/use_lists_config';

import {
  getDetectionEngineUrl,
  getRuleDetailsUrl,
  getRulesUrl,
} from '../../../../common/components/link_to/redirect_to_detection_engine';
import { SecuritySolutionPageWrapper } from '../../../../common/components/page_wrapper';
import { SpyRoute } from '../../../../common/utils/route/spy_routes';
import { useUserData } from '../../../../detections/components/user_info';
import { AccordionTitle } from '../../components/accordion_title';
import { StepDefineRule, StepDefineRuleReadOnly } from '../../components/step_define_rule';
import { useExperimentalFeatureFieldsTransform } from '../../components/step_define_rule/use_experimental_feature_fields_transform';
import { StepAboutRule, StepAboutRuleReadOnly } from '../../components/step_about_rule';
import { StepScheduleRule, StepScheduleRuleReadOnly } from '../../components/step_schedule_rule';
import {
  stepActionsDefaultValue,
  StepRuleActions,
  StepRuleActionsReadOnly,
} from '../../../rule_creation/components/step_rule_actions';
import * as RuleI18n from '../../../common/translations';
import {
  getActionMessageParams,
  MaxWidthEuiFlexItem,
  redirectToDetections,
} from '../../../common/helpers';
import type { DefineStepRule } from '../../../common/types';
import { RuleStep } from '../../../common/types';
import { ALERT_SUPPRESSION_FIELDS_FIELD_NAME } from '../../../rule_creation/components/alert_suppression_edit';
import { useConfirmValidationErrorsModal } from '../../../../common/hooks/use_confirm_validation_errors_modal';
import { formatRule } from './helpers';
import { useEsqlIndex, useEsqlQueryForAboutStep } from '../../hooks';
import * as i18n from './translations';
import { SecurityPageName } from '../../../../app/types';
import {
  defaultSchedule,
  defaultThreatMatchSchedule,
  ruleStepsOrder,
  stepAboutDefaultValue,
  stepDefineDefaultValue,
} from '../../../common/utils';
import {
  APP_UI_ID,
  DEFAULT_INDEX_KEY,
  DEFAULT_INDICATOR_SOURCE_PATH,
  DEFAULT_THREAT_INDEX_KEY,
} from '../../../../../common/constants';
import { useKibana, useUiSetting$ } from '../../../../common/lib/kibana';
import { RulePreview } from '../../components/rule_preview';
import { useStartMlJobs } from '../../../rule_management/logic/use_start_ml_jobs';
import { VALIDATION_WARNING_CODE_FIELD_NAME_MAP } from '../../../rule_creation/constants/validation_warning_codes';
import { extractValidationMessages } from '../../../rule_creation/logic/extract_validation_messages';
import { NextStep } from '../../components/next_step';
import { useRuleForms, useRuleIndexPattern } from '../form';
import { CustomHeaderPageMemo } from '..';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { AddRuleAttachmentToChatButton } from '../../components/add_rule_attachment_to_chat_button';
import { NON_ESQL_RULE_ADD_TO_CHAT_DISABLED_TOOLTIP } from '../../../../agent_builder/components/translations';
import { useAgentBuilderAvailability } from '../../../../agent_builder/hooks/use_agent_builder_availability';
import { useAgentBuilderRuleCreation } from './hooks/use_agent_builder_rule_creation';
import { useRuleCreationTelemetry } from './hooks/use_rule_creation_telemetry';

const MyEuiPanel = styled(EuiPanel)<{
  zindex?: number;
}>`
  position: relative;
  z-index: ${(props) => props.zindex}; /* ugly fix to allow searchBar to overflow the EuiPanel */

  > .euiAccordion > .euiAccordion__triggerWrapper {
    .euiAccordion__button {
      cursor: default !important;
      &:hover {
        text-decoration: none !important;
      }
    }

    .euiAccordion__iconWrapper {
      display: none;
    }
  }
  .euiAccordion__childWrapper {
    transform: none; /* To circumvent an issue in Eui causing the fullscreen datagrid to break */
  }
`;

MyEuiPanel.displayName = 'MyEuiPanel';

const CreateRulePageComponent: React.FC<{}> = () => {
  const { application, triggersActionsUi, aiRuleCreation } = useKibana().services;
  const { navigateToApp } = application;
  const [{ loading: userInfoLoading, isSignalIndexExists, isAuthenticated, hasEncryptionKey }] =
    useUserData();
  const canEditRules = useUserPrivileges().rulesPrivileges.rules.edit;
  const { isAgentChatExperienceEnabled } = useAgentBuilderAvailability();
  const { loading: listsConfigLoading, needsConfiguration: needsListsConfiguration } =
    useListsConfig();
  const { addSuccess } = useAppToasts();
  const loading = userInfoLoading || listsConfigLoading;
  const [activeStep, setActiveStep] = useState<RuleStep>(RuleStep.defineRule);
  const getNextStep = (step: RuleStep): RuleStep | undefined =>
    ruleStepsOrder[ruleStepsOrder.indexOf(step) + 1];

  const [indicesConfig] = useUiSetting$<string[]>(DEFAULT_INDEX_KEY);
  const [threatIndicesConfig] = useUiSetting$<string[]>(DEFAULT_THREAT_INDEX_KEY);
  const defineStepDefault = useMemo(
    () => ({
      ...stepDefineDefaultValue,
      index: indicesConfig,
      threatIndex: threatIndicesConfig,
    }),
    [indicesConfig, threatIndicesConfig]
  );

  const kibanaAbsoluteUrl = useMemo(
    () =>
      application.getUrlForApp(`${APP_UI_ID}`, {
        absolute: true,
      }),
    [application]
  );
  const actionsStepDefault = useMemo(
    () => ({
      ...stepActionsDefaultValue,
      kibanaSiemAppUrl: kibanaAbsoluteUrl,
    }),
    [kibanaAbsoluteUrl]
  );

  const {
    defineStepForm,
    defineStepData,
    aboutStepForm,
    aboutStepData,
    scheduleStepForm,
    scheduleStepData,
    actionsStepForm,
    actionsStepData,
    handleNewConnectorCreated,
  } = useRuleForms({
    defineStepDefault,
    aboutStepDefault: stepAboutDefaultValue,
    scheduleStepDefault: defaultSchedule,
    actionsStepDefault,
  });

  const { modal: confirmSavingWithWarningModal, confirmValidationErrors } =
    useConfirmValidationErrorsModal();

  const isThreatMatchRuleValue = useMemo(
    () => isThreatMatchRule(defineStepData.ruleType),
    [defineStepData.ruleType]
  );

  const isEsqlRuleValue = useMemo(
    () => isEsqlRule(defineStepData.ruleType),
    [defineStepData.ruleType]
  );

  const [openSteps, setOpenSteps] = useState({
    // Matches define-rule EuiAccordion initialIsOpen={true}
    [RuleStep.defineRule]: true,
    [RuleStep.aboutRule]: false,
    [RuleStep.scheduleRule]: false,
    [RuleStep.ruleActions]: false,
  });
  const { mutateAsync: createRule, isLoading: isCreateRuleLoading } = useCreateRule();
  const ruleType = defineStepData.ruleType;
  const actionMessageParams = useMemo(() => getActionMessageParams(ruleType), [ruleType]);
  const [isRulePreviewVisible, setIsRulePreviewVisible] = useState(true);
  const collapseFn = useRef<() => void | undefined>();
  const [prevRuleType, setPrevRuleType] = useState<string>();
  const [isQueryBarValid, setIsQueryBarValid] = useState(false);

  const esqlQueryForAboutStep = useEsqlQueryForAboutStep({ defineStepData, activeStep });

  const esqlIndex = useEsqlIndex(defineStepData.queryBar.query.query, ruleType);

  const memoizedIndex = useMemo(
    () => (isEsqlRuleValue ? esqlIndex : defineStepData.index),
    [defineStepData.index, esqlIndex, isEsqlRuleValue]
  );

  const defineFieldsTransform = useExperimentalFeatureFieldsTransform<DefineStepRule>();

  const { isAiRuleUpdateRef } = useAgentBuilderRuleCreation({
    defineStepForm,
    aboutStepForm,
    scheduleStepForm,
    actionsStepForm,
    defineStepData,
    aboutStepData,
    scheduleStepData,
    actionsStepData,
    actionTypeRegistry: triggersActionsUi.actionTypeRegistry,
  });

  const { getAiMeta, reportRuleCreated, reportRuleCreationError } =
    useRuleCreationTelemetry(ruleType);

  useEffect(() => {
    if (prevRuleType && prevRuleType !== ruleType) {
      if (isAiRuleUpdateRef.current) {
        isAiRuleUpdateRef.current = false;
      } else {
        aboutStepForm.updateFieldValues({
          threatIndicatorPath: isThreatMatchRuleValue ? DEFAULT_INDICATOR_SOURCE_PATH : undefined,
        });
        scheduleStepForm.updateFieldValues(
          isThreatMatchRuleValue ? defaultThreatMatchSchedule : defaultSchedule
        );
      }
    }
    setPrevRuleType(ruleType);
  }, [
    aboutStepForm,
    scheduleStepForm,
    isThreatMatchRuleValue,
    prevRuleType,
    ruleType,
    isAiRuleUpdateRef,
  ]);

  const { starting: isStartingJobs, startMlJobs } = useStartMlJobs();

  const { indexPattern, isIndexPatternLoading } = useRuleIndexPattern({
    dataSourceType: defineStepData.dataSourceType,
    index: memoizedIndex,
    dataViewId: defineStepData.dataViewId,
  });

  const rulesUrl = getRulesUrl();
  const backOptions = useMemo(
    () => ({
      path: rulesUrl,
      text: i18n.BACK_TO_RULES,
      pageId: SecurityPageName.rules,
    }),
    [rulesUrl]
  );

  const handleAccordionToggle = useCallback(
    (step: RuleStep, isOpen: boolean) =>
      setOpenSteps((_openSteps) => ({
        ..._openSteps,
        [step]: isOpen,
      })),
    []
  );
  const toggleDefineStep = useCallback(
    (isOpen: boolean) => handleAccordionToggle(RuleStep.defineRule, isOpen),
    [handleAccordionToggle]
  );
  const toggleAboutStep = useCallback(
    (isOpen: boolean) => handleAccordionToggle(RuleStep.aboutRule, isOpen),
    [handleAccordionToggle]
  );
  const toggleScheduleStep = useCallback(
    (isOpen: boolean) => handleAccordionToggle(RuleStep.scheduleRule, isOpen),
    [handleAccordionToggle]
  );
  const toggleActionsStep = useCallback(
    (isOpen: boolean) => handleAccordionToggle(RuleStep.ruleActions, isOpen),
    [handleAccordionToggle]
  );

  const toggleStepAccordion = useCallback(
    (step: RuleStep | null) => {
      if (step === RuleStep.defineRule) {
        handleAccordionToggle(RuleStep.defineRule, true);
      } else if (step === RuleStep.aboutRule) {
        handleAccordionToggle(RuleStep.aboutRule, true);
      } else if (step === RuleStep.scheduleRule) {
        handleAccordionToggle(RuleStep.scheduleRule, true);
      } else if (step === RuleStep.ruleActions) {
        handleAccordionToggle(RuleStep.ruleActions, true);
      }
    },
    [handleAccordionToggle]
  );

  const goToStep = useCallback(
    (step: RuleStep) => {
      if (
        !openSteps[step] &&
        ((aiRuleCreation.getSession()?.applyCount ?? 0) > 0 ||
          ruleStepsOrder.indexOf(step) > ruleStepsOrder.indexOf(activeStep))
      ) {
        toggleStepAccordion(step);
      }
      setActiveStep(step);
    },
    [activeStep, aiRuleCreation, openSteps, toggleStepAccordion]
  );

  const openStepsRef = useRef(openSteps);
  openStepsRef.current = openSteps;
  const goToStepRef = useRef(goToStep);
  goToStepRef.current = goToStep;
  const toggleStepAccordionRef = useRef(toggleStepAccordion);
  toggleStepAccordionRef.current = toggleStepAccordion;

  const validateStep = useCallback(
    async (step: RuleStep) => {
      switch (step) {
        case RuleStep.defineRule: {
          const valid = await defineStepForm.validate();

          return {
            valid,
            warnings: defineStepForm.getValidationWarnings(),
          };
        }

        case RuleStep.aboutRule: {
          const valid = await aboutStepForm.validate();

          return {
            valid,
            warnings: aboutStepForm.getValidationWarnings(),
          };
        }
        case RuleStep.scheduleRule: {
          const valid = await scheduleStepForm.validate();

          return {
            valid,
            warnings: scheduleStepForm.getValidationWarnings(),
          };
        }
        case RuleStep.ruleActions: {
          const valid = await actionsStepForm.validate();

          return {
            valid,
            warnings: actionsStepForm.getValidationWarnings(),
          };
        }
      }
    },
    [aboutStepForm, actionsStepForm, defineStepForm, scheduleStepForm]
  );

  const validateAllSteps = useCallback(async () => {
    const { valid: defineStepFormValid, warnings: defineStepWarnings } = await validateStep(
      RuleStep.defineRule
    );
    const { valid: aboutStepFormValid, warnings: aboutStepWarnings } = await validateStep(
      RuleStep.aboutRule
    );
    const { valid: scheduleStepFormValid, warnings: scheduleStepWarnings } = await validateStep(
      RuleStep.scheduleRule
    );
    const { valid: actionsStepFormValid, warnings: actionsStepWarnings } = await validateStep(
      RuleStep.ruleActions
    );
    const valid =
      defineStepFormValid && aboutStepFormValid && scheduleStepFormValid && actionsStepFormValid;

    const warnings = [
      ...defineStepWarnings,
      ...aboutStepWarnings,
      ...scheduleStepWarnings,
      ...actionsStepWarnings,
    ];

    return { valid, warnings };
  }, [validateStep]);

  const verifyRuleDefinitionForPreview = useCallback(
    () => defineStepForm.validate(),
    [defineStepForm]
  );

  const editStep = useCallback(
    async (step: RuleStep) => {
      if ((aiRuleCreation.getSession()?.applyCount ?? 0) > 0) {
        goToStep(step);
        return;
      }

      const { valid } = await validateStep(activeStep);

      if (valid) {
        goToStep(step);
      }
    },
    [validateStep, activeStep, goToStep, aiRuleCreation]
  );

  const createRuleFromFormData = useCallback(
    async (enabled: boolean) => {
      const localDefineStepData: DefineStepRule = defineFieldsTransform(
        defineStepForm.getFormData()
      );
      const localAboutStepData = aboutStepForm.getFormData();
      const localScheduleStepData = scheduleStepForm.getFormData();
      const localActionsStepData = actionsStepForm.getFormData();
      const startMlJobsIfNeeded = async () => {
        if (!isMlRule(ruleType) || !enabled) {
          return;
        }
        await startMlJobs(localDefineStepData.machineLearningJobId);
      };

      const formattedRule = formatRule<RuleCreateProps>(
        localDefineStepData,
        localAboutStepData,
        localScheduleStepData,
        {
          ...localActionsStepData,
          enabled,
        },
        triggersActionsUi.actionTypeRegistry
      );

      const aiMeta = getAiMeta();
      if (aiMeta) {
        formattedRule.meta = { ...formattedRule.meta, ...aiMeta };
      }

      try {
        const [, createdRule] = await Promise.all([
          startMlJobsIfNeeded(),
          createRule(formattedRule),
        ]);

        reportRuleCreated({ rule: createdRule });

        addSuccess(i18n.SUCCESSFULLY_CREATED_RULES(createdRule.name));

        navigateToApp(APP_UI_ID, {
          deepLinkId: SecurityPageName.rules,
          path: getRuleDetailsUrl(createdRule.id),
        });
      } catch (error) {
        reportRuleCreationError({ ruleType, error });
        throw error;
      }
    },
    [
      aboutStepForm,
      actionsStepForm,
      addSuccess,
      createRule,
      defineFieldsTransform,
      defineStepForm,
      getAiMeta,
      navigateToApp,
      reportRuleCreated,
      reportRuleCreationError,
      ruleType,
      scheduleStepForm,
      startMlJobs,
      triggersActionsUi.actionTypeRegistry,
    ]
  );

  const submitRule = useCallback(
    async (enabled: boolean) => {
      const { valid, warnings } = await validateAllSteps();
      const warningMessages = extractValidationMessages(
        warnings,
        VALIDATION_WARNING_CODE_FIELD_NAME_MAP
      );

      if (!valid || !(await confirmValidationErrors(warningMessages))) {
        return;
      }

      await createRuleFromFormData(enabled);
    },
    [createRuleFromFormData, validateAllSteps, confirmValidationErrors]
  );

  const defineRuleButtonType =
    activeStep === RuleStep.defineRule ? 'active' : defineStepForm.isValid ? 'valid' : 'passive';
  const defineRuleButton = useMemo(
    () => <AccordionTitle name="1" title={RuleI18n.DEFINE_RULE} type={defineRuleButtonType} />,
    [defineRuleButtonType]
  );
  const defineRuleNextStep = useCallback(async () => {
    const nextStep = getNextStep(RuleStep.defineRule);
    if (nextStep) {
      await editStep(nextStep);
    }
  }, [editStep]);

  const aboutRuleButtonType =
    activeStep === RuleStep.aboutRule ? 'active' : aboutStepForm.isValid ? 'valid' : 'passive';
  const aboutRuleButton = useMemo(
    () => <AccordionTitle name="2" title={RuleI18n.ABOUT_RULE} type={aboutRuleButtonType} />,
    [aboutRuleButtonType]
  );
  const aboutRuleNextStep = useCallback(async () => {
    const nextStep = getNextStep(RuleStep.aboutRule);
    if (nextStep) {
      await editStep(nextStep);
    }
  }, [editStep]);

  const scheduleRuleButtonType =
    activeStep === RuleStep.scheduleRule
      ? 'active'
      : scheduleStepForm.isValid
      ? 'valid'
      : 'passive';
  const scheduleRuleButton = useMemo(
    () => <AccordionTitle name="3" title={RuleI18n.SCHEDULE_RULE} type={scheduleRuleButtonType} />,
    [scheduleRuleButtonType]
  );
  const scheduleRuleNextStep = useCallback(async () => {
    const nextStep = getNextStep(RuleStep.scheduleRule);
    if (nextStep) {
      await editStep(nextStep);
    }
  }, [editStep]);

  const actionsRuleButtonType =
    activeStep === RuleStep.ruleActions ? 'active' : actionsStepForm.isValid ? 'valid' : 'passive';
  const ruleActionsButton = useMemo(
    () => <AccordionTitle name="4" title={RuleI18n.RULE_ACTIONS} type={actionsRuleButtonType} />,
    [actionsRuleButtonType]
  );
  const submitRuleDisabled = useCallback(() => {
    submitRule(false);
  }, [submitRule]);
  const submitRuleEnabled = useCallback(() => {
    submitRule(true);
  }, [submitRule]);

  const memoDefineStepReadOnly = useMemo(
    () =>
      activeStep !== RuleStep.defineRule && (
        <StepDefineRuleReadOnly
          addPadding
          defaultValues={defineStepData}
          descriptionColumns="singleSplit"
          indexPattern={indexPattern}
        />
      ),
    [activeStep, defineStepData, indexPattern]
  );
  const memoStepDefineRule = useMemo(
    () => (
      <>
        <EuiHorizontalRule margin="m" />
        <div
          style={{
            display: activeStep === RuleStep.defineRule ? undefined : 'none',
          }}
        >
          <StepDefineRule
            isLoading={isCreateRuleLoading || loading}
            indicesConfig={indicesConfig}
            form={defineStepForm}
            indexPattern={indexPattern}
            isIndexPatternLoading={isIndexPatternLoading}
            isQueryBarValid={isQueryBarValid}
            setIsQueryBarValid={setIsQueryBarValid}
            index={memoizedIndex}
            threatIndex={defineStepData.threatIndex}
            alertSuppressionFields={defineStepData[ALERT_SUPPRESSION_FIELDS_FIELD_NAME]}
            dataSourceType={defineStepData.dataSourceType}
            shouldLoadQueryDynamically={defineStepData.shouldLoadQueryDynamically}
            queryBarTitle={defineStepData.queryBar.title}
            queryBarSavedId={defineStepData.queryBar.saved_id}
          />
          <NextStep
            dataTestSubj="define-continue"
            onClick={defineRuleNextStep}
            isDisabled={isCreateRuleLoading}
          />
        </div>
        {memoDefineStepReadOnly}
      </>
    ),
    [
      activeStep,
      defineRuleNextStep,
      defineStepData,
      memoizedIndex,
      defineStepForm,
      indexPattern,
      indicesConfig,
      isCreateRuleLoading,
      isIndexPatternLoading,
      isQueryBarValid,
      loading,
      memoDefineStepReadOnly,
    ]
  );
  const memoDefineStepExtraAction = useMemo(
    () =>
      // During rule creation we would like to hide the edit button if user did not reach current step yet,
      // thus we do `defineStepForm.isValid !== undefined` check which that the form validation has not been checked yet.
      // Otherwise, we would like to show step edit button if user is currently at another step.
      defineStepForm.isValid !== undefined &&
      activeStep !== RuleStep.defineRule && (
        <EuiButtonEmpty
          data-test-subj="edit-define-rule"
          iconType="pencil"
          size="xs"
          onClick={() => editStep(RuleStep.defineRule)}
        >
          {i18n.EDIT_RULE}
        </EuiButtonEmpty>
      ),
    [activeStep, defineStepForm.isValid, editStep]
  );

  const memoAboutStepReadOnly = useMemo(
    () =>
      activeStep !== RuleStep.aboutRule && (
        <StepAboutRuleReadOnly
          addPadding
          defaultValues={aboutStepData}
          descriptionColumns="singleSplit"
        />
      ),
    [aboutStepData, activeStep]
  );
  const memoStepAboutRule = useMemo(
    () => (
      <>
        <EuiHorizontalRule margin="m" />
        <div
          style={{
            display: activeStep === RuleStep.aboutRule ? undefined : 'none',
          }}
        >
          <StepAboutRule
            ruleType={defineStepData.ruleType}
            machineLearningJobId={defineStepData.machineLearningJobId}
            index={memoizedIndex}
            dataViewId={defineStepData.dataViewId}
            timestampOverride={aboutStepData.timestampOverride}
            isLoading={isCreateRuleLoading || loading}
            form={aboutStepForm}
            esqlQuery={esqlQueryForAboutStep}
          />

          <NextStep
            dataTestSubj="about-continue"
            onClick={aboutRuleNextStep}
            isDisabled={isCreateRuleLoading}
          />
        </div>
        {memoAboutStepReadOnly}
      </>
    ),
    [
      aboutRuleNextStep,
      aboutStepData.timestampOverride,
      aboutStepForm,
      activeStep,
      defineStepData.dataViewId,
      memoizedIndex,
      defineStepData.machineLearningJobId,
      defineStepData.ruleType,
      isCreateRuleLoading,
      loading,
      memoAboutStepReadOnly,
      esqlQueryForAboutStep,
    ]
  );
  const memoAboutStepExtraAction = useMemo(
    () =>
      // During rule creation we would like to hide the edit button if user did not reach current step yet,
      // thus we do `defineStepForm.isValid !== undefined` check which that the form validation has not been checked yet.
      // Otherwise, we would like to show step edit button if user is currently at another step.
      aboutStepForm.isValid !== undefined &&
      activeStep !== RuleStep.aboutRule && (
        <EuiButtonEmpty
          data-test-subj="edit-about-rule"
          iconType="pencil"
          size="xs"
          onClick={() => editStep(RuleStep.aboutRule)}
        >
          {i18n.EDIT_RULE}
        </EuiButtonEmpty>
      ),
    [aboutStepForm.isValid, activeStep, editStep]
  );

  const memoStepScheduleRule = useMemo(
    () => (
      <>
        <EuiHorizontalRule margin="m" />
        <div
          style={{
            display: activeStep === RuleStep.scheduleRule ? undefined : 'none',
          }}
        >
          <StepScheduleRule isLoading={isCreateRuleLoading || loading} form={scheduleStepForm} />
          <NextStep
            dataTestSubj="schedule-continue"
            onClick={scheduleRuleNextStep}
            isDisabled={isCreateRuleLoading}
          />
        </div>
        <div
          style={{
            display: activeStep === RuleStep.scheduleRule ? 'none' : undefined,
          }}
        >
          <StepScheduleRuleReadOnly
            addPadding
            descriptionColumns="singleSplit"
            defaultValues={scheduleStepData}
          />
        </div>
      </>
    ),
    [
      activeStep,
      isCreateRuleLoading,
      loading,
      scheduleRuleNextStep,
      scheduleStepData,
      scheduleStepForm,
    ]
  );
  const memoScheduleStepExtraAction = useMemo(
    () =>
      // During rule creation we would like to hide the edit button if user did not reach current step yet,
      // thus we do `defineStepForm.isValid !== undefined` check which that the form validation has not been checked yet.
      // Otherwise, we would like to show step edit button if user is currently at another step.
      scheduleStepForm.isValid !== undefined &&
      activeStep !== RuleStep.scheduleRule && (
        <EuiButtonEmpty iconType="pencil" size="xs" onClick={() => editStep(RuleStep.scheduleRule)}>
          {i18n.EDIT_RULE}
        </EuiButtonEmpty>
      ),
    [activeStep, editStep, scheduleStepForm.isValid]
  );

  const memoStepRuleActions = useMemo(
    () => (
      <>
        <EuiHorizontalRule margin="m" />
        <div
          style={{
            display: activeStep === RuleStep.ruleActions ? undefined : 'none',
          }}
        >
          <StepRuleActions
            ruleTypeId={ruleTypeMappings[ruleType]}
            isLoading={isCreateRuleLoading || loading || isStartingJobs}
            actionMessageParams={actionMessageParams}
            summaryActionMessageParams={actionMessageParams}
            form={actionsStepForm}
            ruleInterval={scheduleStepData.interval}
            onNewConnectorCreated={handleNewConnectorCreated}
          />

          <EuiHorizontalRule margin="m" />
          <EuiFlexGroup
            alignItems="center"
            justifyContent="flexEnd"
            gutterSize="xs"
            responsive={false}
          >
            <EuiFlexItem grow={false}>
              <EuiButton
                fill={false}
                isDisabled={isCreateRuleLoading}
                isLoading={isCreateRuleLoading}
                onClick={submitRuleDisabled}
                data-test-subj="create-enabled-false"
              >
                {i18n.COMPLETE_WITHOUT_ENABLING}
              </EuiButton>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiButton
                fill
                isDisabled={isCreateRuleLoading}
                isLoading={isCreateRuleLoading}
                onClick={submitRuleEnabled}
                data-test-subj="create-enable"
              >
                {i18n.COMPLETE_WITH_ENABLING}
              </EuiButton>
            </EuiFlexItem>
          </EuiFlexGroup>
        </div>
        <div
          style={{
            display: activeStep === RuleStep.ruleActions ? 'none' : undefined,
          }}
        >
          <StepRuleActionsReadOnly addPadding defaultValues={actionsStepData} />
        </div>
      </>
    ),
    [
      actionMessageParams,
      actionsStepData,
      actionsStepForm,
      activeStep,
      isCreateRuleLoading,
      isStartingJobs,
      loading,
      ruleType,
      submitRuleDisabled,
      submitRuleEnabled,
      scheduleStepData.interval,
      handleNewConnectorCreated,
    ]
  );
  const memoActionsStepExtraAction = useMemo(
    () =>
      // During rule creation we would like to hide the edit button if user did not reach current step yet,
      // thus we do `defineStepForm.isValid !== undefined` check which that the form validation has not been checked yet.
      // Otherwise, we would like to show step edit button if user is currently at another step.
      actionsStepForm.isValid !== undefined &&
      activeStep !== RuleStep.ruleActions && (
        <EuiButtonEmpty iconType="pencil" size="xs" onClick={() => editStep(RuleStep.ruleActions)}>
          {i18n.EDIT_RULE}
        </EuiButtonEmpty>
      ),
    [actionsStepForm.isValid, activeStep, editStep]
  );

  const addToChatButton = useMemo(
    () =>
      isAgentChatExperienceEnabled ? (
        <AddRuleAttachmentToChatButton
          defineStepData={defineStepData}
          aboutStepData={aboutStepData}
          scheduleStepData={scheduleStepData}
          actionsStepData={actionsStepData}
          actionTypeRegistry={triggersActionsUi.actionTypeRegistry}
          pathway="rule_creation"
          disabled={!isEsqlRuleValue}
          disabledTooltip={NON_ESQL_RULE_ADD_TO_CHAT_DISABLED_TOOLTIP}
        />
      ) : null,
    [
      isAgentChatExperienceEnabled,
      isEsqlRuleValue,
      defineStepData,
      aboutStepData,
      scheduleStepData,
      actionsStepData,
      triggersActionsUi.actionTypeRegistry,
    ]
  );

  const onToggleCollapsedMemo = useCallback(
    () => setIsRulePreviewVisible((isVisible) => !isVisible),
    []
  );

  const { data: endpointPerPolicyOptIn } = useGetEndpointExceptionsPerPolicyOptIn();
  const shouldShowEndpointExceptionsCannotBeAddedToRuleCallout =
    endpointPerPolicyOptIn?.status === true && endpointPerPolicyOptIn.reason === 'userOptedIn';

  if (
    redirectToDetections(
      isSignalIndexExists,
      isAuthenticated,
      hasEncryptionKey,
      needsListsConfiguration
    )
  ) {
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.alerts,
      path: getDetectionEngineUrl(),
    });
    return null;
  } else if (!canEditRules) {
    navigateToApp(APP_UI_ID, {
      deepLinkId: SecurityPageName.rules,
      path: getRulesUrl(),
    });
    return null;
  }

  return (
    <>
      {confirmSavingWithWarningModal}
      <SecuritySolutionPageWrapper>
        <EuiResizableContainer>
          {(EuiResizablePanel, EuiResizableButton, { togglePanel }) => {
            collapseFn.current = () => togglePanel?.('preview', { direction: 'left' });
            return (
              <>
                <EuiResizablePanel initialSize={70} minSize={'40%'} mode="main">
                  <EuiFlexGroup direction="row" justifyContent="spaceAround">
                    <MaxWidthEuiFlexItem>
                      {shouldShowEndpointExceptionsCannotBeAddedToRuleCallout && (
                        <EndpointExceptionsMovedCallout
                          id="ruleCreation"
                          dismissable
                          title="cannotBeAddedToRules"
                        />
                      )}

                      <CustomHeaderPageMemo
                        backOptions={backOptions}
                        isLoading={isCreateRuleLoading || loading}
                        title={i18n.PAGE_TITLE}
                        isRulePreviewVisible={isRulePreviewVisible}
                        setIsRulePreviewVisible={setIsRulePreviewVisible}
                        togglePanel={togglePanel}
                        addToChatButton={addToChatButton}
                      />
                      <MyEuiPanel zindex={4} hasBorder>
                        <MemoEuiAccordion
                          forceState={openSteps[RuleStep.defineRule] ? 'open' : 'closed'}
                          initialIsOpen={true}
                          id={RuleStep.defineRule}
                          buttonContent={defineRuleButton}
                          paddingSize="xs"
                          onToggle={toggleDefineStep}
                          extraAction={memoDefineStepExtraAction}
                        >
                          {memoStepDefineRule}
                        </MemoEuiAccordion>
                      </MyEuiPanel>
                      <EuiSpacer size="l" />
                      <MyEuiPanel hasBorder zindex={3}>
                        <MemoEuiAccordion
                          forceState={openSteps[RuleStep.aboutRule] ? 'open' : 'closed'}
                          initialIsOpen={false}
                          id={RuleStep.aboutRule}
                          buttonContent={aboutRuleButton}
                          paddingSize="xs"
                          onToggle={toggleAboutStep}
                          extraAction={memoAboutStepExtraAction}
                        >
                          {memoStepAboutRule}
                        </MemoEuiAccordion>
                      </MyEuiPanel>
                      <EuiSpacer size="l" />
                      <MyEuiPanel hasBorder zindex={2}>
                        <MemoEuiAccordion
                          forceState={openSteps[RuleStep.scheduleRule] ? 'open' : 'closed'}
                          initialIsOpen={false}
                          id={RuleStep.scheduleRule}
                          buttonContent={scheduleRuleButton}
                          paddingSize="xs"
                          onToggle={toggleScheduleStep}
                          extraAction={memoScheduleStepExtraAction}
                        >
                          {memoStepScheduleRule}
                        </MemoEuiAccordion>
                      </MyEuiPanel>
                      <EuiSpacer size="l" />
                      <MyEuiPanel hasBorder zindex={1}>
                        <MemoEuiAccordion
                          forceState={openSteps[RuleStep.ruleActions] ? 'open' : 'closed'}
                          initialIsOpen={false}
                          id={RuleStep.ruleActions}
                          buttonContent={ruleActionsButton}
                          paddingSize="xs"
                          onToggle={toggleActionsStep}
                          extraAction={memoActionsStepExtraAction}
                        >
                          {memoStepRuleActions}
                        </MemoEuiAccordion>
                      </MyEuiPanel>
                    </MaxWidthEuiFlexItem>
                  </EuiFlexGroup>
                </EuiResizablePanel>

                <EuiResizableButton />

                <EuiResizablePanel
                  id={'preview'}
                  mode="collapsible"
                  initialSize={30}
                  minSize={'20%'}
                  onToggleCollapsed={onToggleCollapsedMemo}
                >
                  <RulePreview
                    verifyRuleDefinition={verifyRuleDefinitionForPreview}
                    defineRuleData={defineStepData}
                    aboutRuleData={aboutStepData}
                    scheduleRuleData={scheduleStepData}
                  />
                </EuiResizablePanel>
              </>
            );
          }}
        </EuiResizableContainer>
      </SecuritySolutionPageWrapper>

      <SpyRoute pageName={SecurityPageName.rulesCreate} />
    </>
  );
};

export const CreateRulePage = React.memo(CreateRulePageComponent);

const MemoEuiAccordion = memo(EuiAccordion);
