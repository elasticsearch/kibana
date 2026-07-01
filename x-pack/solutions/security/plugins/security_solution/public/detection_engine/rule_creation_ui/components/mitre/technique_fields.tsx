/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiSuperSelect,
  EuiToolTip,
} from '@elastic/eui';
import { kebabCase } from 'lodash/fp';
import React, { useCallback, useEffect, useState } from 'react';
import styled, { css } from 'styled-components';

import type { Threat, Threats, ThreatTechnique } from '@kbn/securitysolution-io-ts-alerting-types';
import * as Rulei18n from '../../../common/translations';
import type { FieldHook } from '../../../../shared_imports';
import { MyAddItemButton } from '../add_item_form';
import * as i18n from './translations';
import { MitreAttackSubtechniqueFields } from './subtechnique_fields';
import type {
  MitreSubTechnique,
  MitreTactic,
  MitreTechnique,
} from '../../../../../common/detection_engine/mitre/types';
import { createUnsupportedMitreOption } from './unsupported_mitre_option';
import { useIsExperimentalFeatureEnabled } from '../../../../common/hooks/use_experimental_features';

const lazyMitreConfiguration = () => {
  /**
   * The specially formatted comment in the `import` expression causes the corresponding webpack chunk to be named. This aids us in debugging chunk size issues.
   * See https://webpack.js.org/api/module-methods/#magic-comments
   */
  return import(
    /* webpackChunkName: "lazy_mitre_configuration" */
    '../../../../../common/detection_engine/mitre/mitre_tactics_techniques'
  );
};

const hasSubtechniqueOptions = (
  subtechniquesOptions: MitreSubTechnique[],
  technique: ThreatTechnique
) => subtechniquesOptions.some((subtechnique) => subtechnique.techniqueId === technique.id);

const TechniqueContainer = styled.div`
  ${({ theme }) => css`
    margin-left: 24px;
    padding-left: 24px;
    border-left: 2px solid ${theme.eui.euiColorLightestShade};
  `}
`;

interface AddTechniqueProps {
  field: FieldHook;
  threatIndex: number;
  idAria: string;
  isDisabled: boolean;
  onFieldChange: (threats: Threats) => void;
}

export const MitreAttackTechniqueFields: React.FC<AddTechniqueProps> = ({
  field,
  idAria,
  isDisabled,
  threatIndex,
  onFieldChange,
}): JSX.Element => {
  const isMitreAttackUpdatesUIEnabled = useIsExperimentalFeatureEnabled(
    'mitreAttackUpdatesUIEnabled'
  );

  const values = field.value as Threats;

  const [tacticsOptions, setTacticsOptions] = useState<MitreTactic[]>([]);
  const [techniquesOptions, setTechniquesOptions] = useState<MitreTechnique[]>([]);
  const [subtechniquesOptions, setSubtechniquesOptions] = useState<MitreSubTechnique[]>([]);

  useEffect(() => {
    async function getMitre() {
      const mitreConfig = await lazyMitreConfiguration();
      setTacticsOptions(mitreConfig.tactics);
      setTechniquesOptions(mitreConfig.techniques);
      setSubtechniquesOptions(mitreConfig.subtechniques);
    }

    getMitre();
  }, []);

  const removeTechnique = useCallback(
    (index: number) => {
      const threats = [...(field.value as Threats)];
      const techniques = threats[threatIndex].technique ?? [];
      techniques.splice(index, 1);
      threats[threatIndex] = {
        ...threats[threatIndex],
        technique: techniques,
      };
      onFieldChange(threats);
    },
    [field, threatIndex, onFieldChange]
  );

  const addMitreAttackTechnique = useCallback(() => {
    const threats = [...(field.value as Threats)];
    threats[threatIndex] = {
      ...threats[threatIndex],
      technique: [
        ...(threats[threatIndex].technique ?? []),
        { id: 'none', name: 'none', reference: 'none', subtechnique: [] },
      ],
    };
    onFieldChange(threats);
  }, [field, threatIndex, onFieldChange]);

  const updateTechnique = useCallback(
    (index: number, optionId: string) => {
      const threats = [...(field.value as Threats)];
      const { id, reference, name } = techniquesOptions.find((t) => t.id === optionId) ?? {
        id: '',
        name: '',
        reference: '',
      };
      const technique = threats[threatIndex].technique ?? [];
      onFieldChange([
        ...threats.slice(0, threatIndex),
        {
          ...threats[threatIndex],
          technique: [
            ...technique.slice(0, index),
            {
              id,
              reference,
              name,
              subtechnique: [],
            },
            ...technique.slice(index + 1),
          ],
        },
        ...threats.slice(threatIndex + 1),
      ]);
    },
    [field.value, techniquesOptions, threatIndex, onFieldChange]
  );

  const findCurrentTechniqueOption = useCallback(
    (technique: ThreatTechnique) =>
      technique.name === 'none' || techniquesOptions.length === 0
        ? undefined
        : techniquesOptions.find((t) => t.id === technique.id),
    [techniquesOptions]
  );

  const isUnsupportedTechnique = useCallback(
    (technique: ThreatTechnique) =>
      isMitreAttackUpdatesUIEnabled &&
      techniquesOptions.length > 0 &&
      technique.name !== 'none' &&
      findCurrentTechniqueOption(technique) === undefined,
    [findCurrentTechniqueOption, isMitreAttackUpdatesUIEnabled, techniquesOptions]
  );

  // True when the technique id still exists in the dataset but is no longer
  // assigned to the parent tactic (e.g. MITRE moved it in a version bump).
  // Without this signal, the EuiSuperSelect renders blank because its
  // `valueOfSelected` matches no option in the cascade-filtered list.
  const isTechniqueReassignedFromTactic = useCallback(
    (parentTactic: Threat['tactic'], technique: ThreatTechnique) => {
      if (
        !isMitreAttackUpdatesUIEnabled ||
        techniquesOptions.length === 0 ||
        tacticsOptions.length === 0 ||
        technique.name === 'none'
      ) {
        return false;
      }
      const option = findCurrentTechniqueOption(technique);
      if (!option) {
        return false;
      }
      const currentTactic = tacticsOptions.find((t) => t.id === parentTactic.id);
      const filterTacticName = kebabCase(currentTactic?.name ?? parentTactic.name);
      return !option.tactics.includes(filterTacticName);
    },
    [findCurrentTechniqueOption, isMitreAttackUpdatesUIEnabled, tacticsOptions, techniquesOptions]
  );

  const getTechniqueRenamedFromName = useCallback(
    (technique: ThreatTechnique) => {
      if (!isMitreAttackUpdatesUIEnabled) return undefined;
      const matchedOption = findCurrentTechniqueOption(technique);
      return matchedOption && matchedOption.name !== technique.name ? technique.name : undefined;
    },
    [findCurrentTechniqueOption, isMitreAttackUpdatesUIEnabled]
  );

  const getSelectTechnique = useCallback(
    (
      parentTactic: Threat['tactic'],
      index: number,
      disabled: boolean,
      technique: ThreatTechnique
    ) => {
      // Resolve the cascade filter against the parent tactic's CURRENT name in the
      // dataset (matched by id), so renames in MITRE upgrades don't blank the list.
      const currentTactic = tacticsOptions.find((t) => t.id === parentTactic.id);
      const filterTacticName = kebabCase(currentTactic?.name ?? parentTactic.name);
      const options = techniquesOptions.filter((t) => t.tactics.includes(filterTacticName));
      const isUnsupported = isUnsupportedTechnique(technique);
      const isReassigned = isTechniqueReassignedFromTactic(parentTactic, technique);
      const reassignedOption = isReassigned ? findCurrentTechniqueOption(technique) : undefined;
      return (
        <>
          <EuiSuperSelect
            id="mitreAttackTechnique"
            options={[
              ...(technique.name === 'none'
                ? [
                    {
                      inputDisplay: <>{i18n.TECHNIQUE_PLACEHOLDER}</>,
                      value: 'none',
                      disabled,
                    },
                  ]
                : []),
              ...(isUnsupported
                ? [createUnsupportedMitreOption({ id: technique.id, name: technique.name })]
                : []),
              // Prefer the dataset's current name for reassigned techniques so
              // the user sees the up-to-date label, falling back to stored.
              ...(isReassigned
                ? [
                    createUnsupportedMitreOption({
                      id: technique.id,
                      name: reassignedOption?.name ?? technique.name,
                    }),
                  ]
                : []),
              ...options.map((option) => ({
                inputDisplay: <>{option.label}</>,
                value: option.id,
                disabled,
              })),
            ]}
            prepend={`${field.label} ${i18n.TECHNIQUE}`}
            aria-label=""
            onChange={updateTechnique.bind(null, index)}
            fullWidth={true}
            valueOfSelected={technique.id}
            data-test-subj="mitreAttackTechnique"
            disabled={disabled}
            placeholder={i18n.TECHNIQUE_PLACEHOLDER}
            isInvalid={isUnsupported || isReassigned}
          />
        </>
      );
    },
    [
      field.label,
      findCurrentTechniqueOption,
      isTechniqueReassignedFromTactic,
      isUnsupportedTechnique,
      tacticsOptions,
      techniquesOptions,
      updateTechnique,
    ]
  );

  const techniques = values[threatIndex].technique ?? [];

  return (
    <TechniqueContainer>
      {techniques.map((technique, index) => {
        const techniqueUnsupported = isUnsupportedTechnique(technique);
        const techniqueReassigned = isTechniqueReassignedFromTactic(
          values[threatIndex].tactic,
          technique
        );
        const techniqueRenamedFrom = getTechniqueRenamedFromName(technique);
        const techniqueErrorMessage = techniqueUnsupported
          ? i18n.UNSUPPORTED_MITRE_ID_ERROR(technique.id)
          : techniqueReassigned
          ? i18n.TECHNIQUE_REASSIGNED_FROM_TACTIC_ERROR(technique.id)
          : undefined;
        return (
          <div key={index}>
            <EuiSpacer size="s" />
            <EuiFormRow
              fullWidth
              describedByIds={idAria ? [`${idAria} ${i18n.TECHNIQUE}`] : undefined}
              isInvalid={techniqueUnsupported || techniqueReassigned}
              error={techniqueErrorMessage}
              helpText={
                techniqueRenamedFrom ? i18n.RENAMED_FROM_HINT(techniqueRenamedFrom) : undefined
              }
            >
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow>
                  {getSelectTechnique(values[threatIndex].tactic, index, isDisabled, technique)}
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={Rulei18n.DELETE} disableScreenReaderOutput>
                    <EuiButtonIcon
                      color="danger"
                      iconType="trash"
                      isDisabled={isDisabled}
                      onClick={() => removeTechnique(index)}
                      aria-label={Rulei18n.DELETE}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFormRow>

            <MitreAttackSubtechniqueFields
              field={field}
              idAria={idAria}
              isDisabled={
                isDisabled ||
                technique.name === 'none' ||
                hasSubtechniqueOptions(subtechniquesOptions, technique) === false
              }
              threatIndex={threatIndex}
              techniqueIndex={index}
              onFieldChange={onFieldChange}
            />
          </div>
        );
      })}
      <MyAddItemButton
        data-test-subj="addMitreAttackTechnique"
        onClick={addMitreAttackTechnique}
        isDisabled={isDisabled}
      >
        {i18n.ADD_MITRE_TECHNIQUE}
      </MyAddItemButton>
    </TechniqueContainer>
  );
};
