/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback } from 'react';
import {
  EuiCheckableCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FULL_HEIGHT_CSS } from '../../../components/schedule_section/checkable_card_styles';

interface PackTypeSelectableProps {
  packType: string;
  setPackType: (type: 'global' | 'policy') => void;
  resetFormFields?: () => void;
}

const PackTypeSelectableComponent = ({
  packType,
  setPackType,
  resetFormFields,
}: PackTypeSelectableProps) => {
  const idPrefix = useGeneratedHtmlId({ prefix: 'osqueryPackType' });

  const handleChange = useCallback(
    (type: 'global' | 'policy') => {
      setPackType(type);
      resetFormFields?.();
    },
    [resetFormFields, setPackType]
  );

  const handleSelectPolicy = useCallback(() => handleChange('policy'), [handleChange]);
  const handleSelectGlobal = useCallback(() => handleChange('global'), [handleChange]);

  return (
    <EuiFlexItem>
      <EuiFormRow
        label={i18n.translate('xpack.osquery.pack.form.typeLabel', {
          defaultMessage: 'Type',
        })}
        fullWidth
      >
        <EuiFlexGroup gutterSize="m">
          <EuiFlexItem>
            <EuiCheckableCard
              id={`${idPrefix}-policy`}
              name={idPrefix}
              css={FULL_HEIGHT_CSS}
              label={
                <strong>
                  {i18n.translate('xpack.osquery.pack.form.policyLabel', {
                    defaultMessage: 'Policy',
                  })}
                </strong>
              }
              checked={packType === 'policy'}
              onChange={handleSelectPolicy}
              data-test-subj="osqueryPackTypePolicy"
            >
              {i18n.translate('xpack.osquery.pack.form.policyDescription', {
                defaultMessage: 'Schedule pack for specific policy.',
              })}
            </EuiCheckableCard>
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiCheckableCard
              id={`${idPrefix}-global`}
              name={idPrefix}
              css={FULL_HEIGHT_CSS}
              label={
                <strong>
                  {i18n.translate('xpack.osquery.pack.form.globalLabel', {
                    defaultMessage: 'Global',
                  })}
                </strong>
              }
              checked={packType === 'global'}
              onChange={handleSelectGlobal}
              data-test-subj="osqueryPackTypeGlobal"
            >
              {i18n.translate('xpack.osquery.pack.form.globalDescription', {
                defaultMessage: 'Use pack across all policies',
              })}
            </EuiCheckableCard>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFormRow>
    </EuiFlexItem>
  );
};

export const PackTypeSelectable = React.memo(PackTypeSelectableComponent);
