/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React from 'react';
import { i18n } from '@kbn/i18n';
import { EuiSpacer } from '@elastic/eui';

import {
  ROLLOVER_RESTRICTION_FIELD_PATH,
  ROLLOVER_RESTRICTION_FIELDS,
  ROLLOVER_TRIGGER_FIELD_PATH,
  ROLLOVER_TRIGGER_FIELDS,
  type RolloverRestrictionField,
  type RolloverTriggerField,
} from '../../../../constants';
import { i18nTexts } from '../../../../i18n_texts';

import { RolloverFieldSection } from './rollover_field_section';
import { RolloverRecommendedDefaultsButton } from './rollover_recommended_defaults_button';

const triggerFirstConditionLabel = i18n.translate(
  'xpack.indexLifecycleMgmt.hotPhase.rolloverTriggerFirstConditionLabel',
  {
    defaultMessage: 'when',
  }
);

const triggerAdditionalConditionLabel = i18n.translate(
  'xpack.indexLifecycleMgmt.hotPhase.rolloverTriggerAdditionalConditionLabel',
  {
    defaultMessage: 'or',
  }
);

const restrictionFirstConditionLabel = i18n.translate(
  'xpack.indexLifecycleMgmt.hotPhase.rolloverRestrictionFirstConditionLabel',
  {
    defaultMessage: 'until',
  }
);

const restrictionAdditionalConditionLabel = i18n.translate(
  'xpack.indexLifecycleMgmt.hotPhase.rolloverRestrictionAdditionalConditionLabel',
  {
    defaultMessage: 'and',
  }
);

export const RolloverTriggerFields: FunctionComponent = () => (
  <RolloverFieldSection<RolloverTriggerField>
    title={i18nTexts.editPolicy.triggerRolloverLabel}
    activeFieldPath={ROLLOVER_TRIGGER_FIELD_PATH}
    allFields={ROLLOVER_TRIGGER_FIELDS}
    addButtonLabel={i18nTexts.editPolicy.addRolloverTriggerLabel}
    addButtonTestSubj="rolloverAddTriggerButton"
    allFieldsInUseMessage={i18nTexts.editPolicy.allRolloverTriggersInUseLabel}
    firstConditionLabel={triggerFirstConditionLabel}
    additionalConditionLabel={triggerAdditionalConditionLabel}
    isTriggerSection
  />
);

export const RolloverRestrictionFields: FunctionComponent = () => (
  <RolloverFieldSection<RolloverRestrictionField>
    title={i18nTexts.editPolicy.restrictRolloverLabel}
    activeFieldPath={ROLLOVER_RESTRICTION_FIELD_PATH}
    allFields={ROLLOVER_RESTRICTION_FIELDS}
    addButtonLabel={i18nTexts.editPolicy.addRolloverRestrictionLabel}
    addButtonTestSubj="rolloverAddRestrictionButton"
    allFieldsInUseMessage={i18nTexts.editPolicy.allRolloverRestrictionsInUseLabel}
    firstConditionLabel={restrictionFirstConditionLabel}
    additionalConditionLabel={restrictionAdditionalConditionLabel}
  />
);

export const RolloverFields: FunctionComponent = () => (
  <>
    <RolloverTriggerFields />
    <EuiSpacer />
    <RolloverRestrictionFields />
    <EuiSpacer />
    <RolloverRecommendedDefaultsButton />
  </>
);
