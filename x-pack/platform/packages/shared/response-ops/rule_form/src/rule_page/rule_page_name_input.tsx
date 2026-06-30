/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, useCallback, useMemo } from 'react';
import {
  EuiTitle,
  EuiFieldText,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  useEuiTheme,
  EuiFormRow,
  EuiToolTip,
} from '@elastic/eui';
import {
  RULE_NAME_ARIA_LABEL_TEXT,
  RULE_NAME_INPUT_TITLE,
  RULE_NAME_INPUT_BUTTON_ARIA_LABEL,
} from '../translations';
import { useRuleFormState, useRuleFormDispatch } from '../hooks';

export const RulePageNameInput = () => {
  const [isEditing, setIsEditing] = useState<boolean>(false);

  const { formData, baseErrors } = useRuleFormState();

  const { name } = formData;

  const dispatch = useRuleFormDispatch();

  const { euiTheme } = useEuiTheme();

  const isNameInvalid = useMemo(() => {
    return !!baseErrors?.name?.length;
  }, [baseErrors]);

  const inputStyles: React.CSSProperties = useMemo(() => {
    return {
      fontSize: 'inherit',
      fontWeight: 'inherit',
      lineHeight: 'inherit',
      padding: 'inherit',
      boxShadow: 'none',
      backgroundColor: euiTheme.colors.lightestShade,
    };
  }, [euiTheme]);

  const buttonStyles: React.CSSProperties = useMemo(() => {
    return {
      padding: 'inherit',
    };
  }, []);

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      dispatch({
        type: 'setName',
        payload: e.target.value,
      });
    },
    [dispatch]
  );

  const onEdit = useCallback(() => {
    setIsEditing(true);
  }, []);

  const onCancelEdit = useCallback(() => {
    if (isNameInvalid) {
      return;
    }
    setIsEditing(false);
  }, [isNameInvalid]);

  const onkeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (isNameInvalid) {
        return;
      }
      if (e.key === 'Enter' || e.key === 'Escape') {
        setIsEditing(false);
      }
    },
    [isNameInvalid]
  );

  if (isEditing) {
    return (
      <EuiFlexGroup data-test-subj="rulePageNameInput" gutterSize="s" responsive={false}>
        <EuiFlexItem className="eui-fullWidth">
          <EuiFormRow fullWidth isInvalid={isNameInvalid} error={baseErrors?.name}>
            <EuiTitle size="l">
              <h1>
                <EuiFieldText
                  autoFocus
                  fullWidth
                  data-test-subj="rulePageNameInputField"
                  placeholder={RULE_NAME_INPUT_TITLE}
                  style={inputStyles}
                  value={name}
                  isInvalid={isNameInvalid}
                  onChange={onInputChange}
                  onBlur={onCancelEdit}
                  onKeyDown={onkeyDown}
                />
              </h1>
            </EuiTitle>
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip content={RULE_NAME_INPUT_BUTTON_ARIA_LABEL} disableScreenReaderOutput>
            <EuiButtonIcon
              color="primary"
              iconType="check"
              size="m"
              onClick={onCancelEdit}
              aria-label={RULE_NAME_INPUT_BUTTON_ARIA_LABEL}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }

  return (
    <EuiButtonEmpty
      iconSide="right"
      iconType="pencil"
      color="text"
      style={buttonStyles}
      onClick={onEdit}
      data-test-subj="rulePageNameInputButton"
      aria-label={RULE_NAME_ARIA_LABEL_TEXT}
    >
      <EuiTitle size="l" className="eui-textTruncate">
        <h1>{name}</h1>
      </EuiTitle>
    </EuiButtonEmpty>
  );
};
