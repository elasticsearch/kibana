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
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styled from 'styled-components';

import type { Threats, ThreatSubtechnique } from '@kbn/securitysolution-io-ts-alerting-types';
import * as Rulei18n from '../../../common/translations';
import type { FieldHook } from '../../../../shared_imports';
import { MyAddItemButton } from '../add_item_form';
import * as i18n from './translations';
import type { MitreSubTechnique } from '../../../../../common/detection_engine/mitre/types';

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

const SubtechniqueContainer = styled.div`
  margin-left: 48px;
`;

interface AddSubtechniqueProps {
  field: FieldHook;
  threatIndex: number;
  techniqueIndex: number;
  idAria: string;
  isDisabled: boolean;
  onFieldChange: (threats: Threats) => void;
}

export const MitreAttackSubtechniqueFields: React.FC<AddSubtechniqueProps> = ({
  field,
  idAria,
  isDisabled,
  threatIndex,
  techniqueIndex,
  onFieldChange,
}): JSX.Element => {
  const values = field.value as Threats;
  const [subtechniquesOptions, setSubtechniquesOptions] = useState<MitreSubTechnique[]>([]);

  useEffect(() => {
    async function getMitre() {
      const mitreConfig = await lazyMitreConfiguration();
      setSubtechniquesOptions(mitreConfig.subtechniques);
    }

    getMitre();
  }, []);

  const technique = useMemo(() => {
    return [...(values[threatIndex].technique ?? [])];
  }, [values, threatIndex]);

  const removeSubtechnique = useCallback(
    (index: number) => {
      const threats = [...(field.value as Threats)];
      const subtechniques = technique[techniqueIndex].subtechnique ?? [];
      if (subtechniques != null) {
        subtechniques.splice(index, 1);

        technique[techniqueIndex] = {
          ...technique[techniqueIndex],
          subtechnique: subtechniques,
        };
        threats[threatIndex].technique = technique;
        onFieldChange(threats);
      }
    },
    [field, onFieldChange, techniqueIndex, technique, threatIndex]
  );

  const addMitreAttackSubtechnique = useCallback(() => {
    const threats = [...(field.value as Threats)];

    const subtechniques = technique[techniqueIndex].subtechnique;

    if (subtechniques != null) {
      technique[techniqueIndex] = {
        ...technique[techniqueIndex],
        subtechnique: [...subtechniques, { id: 'none', name: 'none', reference: 'none' }],
      };
    } else {
      technique[techniqueIndex] = {
        ...technique[techniqueIndex],
        subtechnique: [{ id: 'none', name: 'none', reference: 'none' }],
      };
    }
    threats[threatIndex].technique = technique;
    onFieldChange(threats);
  }, [field, onFieldChange, techniqueIndex, technique, threatIndex]);

  const updateSubtechnique = useCallback(
    (index: number, optionId: string) => {
      const threats = [...(field.value as Threats)];
      const { id, reference, name } = subtechniquesOptions.find((t) => t.id === optionId) ?? {
        id: '',
        name: '',
        reference: '',
      };
      const subtechniques = technique[techniqueIndex].subtechnique;

      if (subtechniques != null) {
        onFieldChange([
          ...threats.slice(0, threatIndex),
          {
            ...threats[threatIndex],
            technique: [
              ...technique.slice(0, techniqueIndex),
              {
                ...technique[techniqueIndex],
                subtechnique: [
                  ...subtechniques.slice(0, index),
                  {
                    id,
                    reference,
                    name,
                  },
                  ...subtechniques.slice(index + 1),
                ],
              },
              ...technique.slice(techniqueIndex + 1),
            ],
          },
          ...threats.slice(threatIndex + 1),
        ]);
      }
    },
    [field.value, subtechniquesOptions, technique, techniqueIndex, onFieldChange, threatIndex]
  );

  const getSelectSubtechnique = useCallback(
    (index: number, disabled: boolean, subtechnique: ThreatSubtechnique) => {
      const options = subtechniquesOptions.filter(
        (t) => t.techniqueId === technique[techniqueIndex]?.id
      );

      return (
        <>
          <EuiSuperSelect
            id="mitreAttackSubtechnique"
            options={[
              ...(subtechnique.name === 'none'
                ? [
                    {
                      inputDisplay: <>{i18n.SUBTECHNIQUE_PLACEHOLDER}</>,
                      value: 'none',
                      disabled,
                    },
                  ]
                : []),
              ...options.map((option) => ({
                inputDisplay: <>{option.label}</>,
                value: option.id,
                disabled,
              })),
            ]}
            prepend={`${field.label} ${i18n.SUBTECHNIQUE}`}
            aria-label=""
            onChange={updateSubtechnique.bind(null, index)}
            fullWidth={true}
            valueOfSelected={subtechnique.id}
            data-test-subj="mitreAttackSubtechnique"
            disabled={disabled}
            placeholder={i18n.SUBTECHNIQUE_PLACEHOLDER}
          />
        </>
      );
    },
    [subtechniquesOptions, field.label, updateSubtechnique, technique, techniqueIndex]
  );

  const subtechniques = useMemo(() => {
    return technique[techniqueIndex].subtechnique;
  }, [technique, techniqueIndex]);

  return (
    <SubtechniqueContainer>
      {subtechniques != null &&
        subtechniques.map((subtechnique, index) => (
          <div key={index}>
            <EuiSpacer size="s" />
            <EuiFormRow
              fullWidth
              describedByIds={idAria ? [`${idAria} ${i18n.SUBTECHNIQUE}`] : undefined}
            >
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem grow>
                  {getSelectSubtechnique(index, isDisabled, subtechnique)}
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiToolTip content={Rulei18n.DELETE} disableScreenReaderOutput>
                    <EuiButtonIcon
                      color="danger"
                      iconType="trash"
                      isDisabled={isDisabled}
                      onClick={() => removeSubtechnique(index)}
                      aria-label={Rulei18n.DELETE}
                    />
                  </EuiToolTip>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFormRow>
          </div>
        ))}
      <MyAddItemButton
        data-test-subj="addMitreAttackSubtechnique"
        onClick={addMitreAttackSubtechnique}
        isDisabled={isDisabled}
      >
        {i18n.ADD_MITRE_SUBTECHNIQUE}
      </MyAddItemButton>
    </SubtechniqueContainer>
  );
};
