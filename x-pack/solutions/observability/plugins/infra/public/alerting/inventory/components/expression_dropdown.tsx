/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiSelectOption } from '@elastic/eui';
import {
  EuiExpression,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPopover,
  EuiSelect,
  EuiToolTip,
} from '@elastic/eui';
import { EuiPopoverTitle, EuiButtonIcon, useGeneratedHtmlId } from '@elastic/eui';
import { useBoolean } from '@kbn/react-hooks';

interface WhenExpressionProps<TDropDownType extends string> {
  value: TDropDownType;
  options: Record<TDropDownType, EuiSelectOption>;
  onChange: (value: TDropDownType) => void;
  popupPosition?:
    | 'upCenter'
    | 'upLeft'
    | 'upRight'
    | 'downCenter'
    | 'downLeft'
    | 'downRight'
    | 'leftCenter'
    | 'leftUp'
    | 'leftDown'
    | 'rightCenter'
    | 'rightUp'
    | 'rightDown';

  description: string;
  popoverTitle: string;

  'aria-label'?: string;
  'data-test-subj'?: string;
}

export const ExpressionDropDown = <TDropDownType extends string>({
  value,
  options,
  onChange,
  popupPosition,
  description,
  popoverTitle,
  ...props
}: WhenExpressionProps<TDropDownType>) => {
  const [popoverOpen, { toggle: togglePopover, off: closePopover }] = useBoolean(false);
  const popoverTitleId = useGeneratedHtmlId();

  return (
    <EuiPopover
      aria-labelledby={popoverTitleId}
      button={
        <EuiExpression
          data-test-subj="nodeTypeExpression"
          description={description}
          value={options[value].text}
          isActive={popoverOpen}
          onClick={togglePopover}
        />
      }
      isOpen={popoverOpen}
      closePopover={closePopover}
      ownFocus
      anchorPosition={popupPosition ?? 'downLeft'}
    >
      <div onBlur={closePopover}>
        <ClosablePopoverTitle onClose={closePopover} titleId={popoverTitleId}>
          <>{popoverTitle}</>
        </ClosablePopoverTitle>
        <EuiSelect
          aria-label={props['aria-label']}
          data-test-subj={props['data-test-subj']}
          value={value}
          fullWidth
          onChange={(e) => {
            onChange(e.target.value as TDropDownType);
            closePopover();
          }}
          options={Object.values(options).map((o) => o) as EuiSelectOption[]}
        />
      </div>
    </EuiPopover>
  );
};

interface ClosablePopoverTitleProps {
  children: JSX.Element;
  onClose: () => void;
  titleId?: string;
}

export const ClosablePopoverTitle = ({ children, onClose, titleId }: ClosablePopoverTitleProps) => {
  return (
    <EuiPopoverTitle>
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem id={titleId}>{children}</EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate(
              'xpack.infra.metrics.expressionItems.components.closablePopoverTitle.closeLabel',
              {
                defaultMessage: 'Close',
              }
            )}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="infraClosablePopoverTitleButton"
              iconType="cross"
              color="danger"
              aria-label={i18n.translate(
                'xpack.infra.metrics.expressionItems.components.closablePopoverTitle.closeLabel',
                {
                  defaultMessage: 'Close',
                }
              )}
              onClick={() => onClose()}
            />
          </EuiToolTip>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPopoverTitle>
  );
};
