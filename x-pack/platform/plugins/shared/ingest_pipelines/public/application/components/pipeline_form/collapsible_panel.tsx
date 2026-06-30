/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useState, useEffect } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiAccordionProps, EuiSwitchEvent, EuiSwitchProps } from '@elastic/eui';
import { EuiSpacer, EuiSwitch, EuiPanel, EuiAccordion, useGeneratedHtmlId } from '@elastic/eui';
import { useFormContext, useFormData } from '../../../shared_imports';

export interface CollapsiblePanelRenderProps {
  isEnabled: boolean;
}

interface Props {
  title: ReactNode | string;
  fieldName: string;
  initialToggleState: boolean;
  toggleProps?: Partial<EuiSwitchProps>;
  accordionProps?: Partial<EuiAccordionProps>;
  children: (options: CollapsiblePanelRenderProps) => ReactNode;
}

type AccordionStatus = 'open' | 'closed';

export const CollapsiblePanel: React.FunctionComponent<Props> = ({
  title,
  children,
  fieldName,
  toggleProps,
  accordionProps,
  initialToggleState,
}) => {
  const form = useFormContext();
  const [formData] = useFormData({ form });

  const accordionId = useGeneratedHtmlId({ prefix: 'collapsiblerPanel' });
  const [isEnabled, setIsEnabled] = useState<boolean>(initialToggleState);
  const [trigger, setTrigger] = useState<AccordionStatus>(isEnabled ? 'open' : 'closed');

  // We need to keep track of the initial field value for when the user
  // disable the enabled toggle (set field value to null) and then re-enable it.
  // In this scenario we want to show the initial value of the form.
  const [initialValue, setInitialValue] = useState();
  useEffect(() => {
    if (initialValue === undefined && formData[fieldName]) {
      setInitialValue(formData[fieldName]);
    }
  }, [formData, initialValue, fieldName]);

  const onToggleChange = (e: EuiSwitchEvent) => {
    const isChecked = !!e.target.checked;

    setIsEnabled(isChecked);
    setTrigger(isChecked ? 'open' : 'closed');

    if (isChecked) {
      form.setFieldValue(fieldName, initialValue || '');
    } else {
      form.setFieldValue(fieldName, '');
    }
  };

  const onAccordionToggle = (isOpen: boolean) => {
    const newState = isOpen ? 'open' : 'closed';
    setTrigger(newState);
  };

  return (
    <EuiPanel hasShadow={false} hasBorder grow={false}>
      <EuiAccordion
        {...accordionProps}
        id={accordionId}
        onToggle={onAccordionToggle}
        forceState={trigger}
        buttonContent={title}
        extraAction={
          <EuiSwitch
            {...toggleProps}
            showLabel={false}
            label={i18n.translate('xpack.ingestPipelines.collapsiblePanelToggle', {
              defaultMessage: 'Enabled',
            })}
            checked={isEnabled}
            onChange={onToggleChange}
          />
        }
      >
        <EuiSpacer size="l" />
        {children({ isEnabled })}
      </EuiAccordion>
    </EuiPanel>
  );
};
