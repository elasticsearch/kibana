/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  EuiPopover,
  EuiSelectable,
  EuiBadge,
  type EuiBadgeProps,
  type UseEuiTheme,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FieldIcon } from '@kbn/react-field';
import { css } from '@emotion/react';
import type { WorkspaceField } from '../../types';
import { gphFieldBadgeSizeStyles } from '../../styles';

export interface FieldPickerProps {
  fieldMap: Record<string, WorkspaceField>;
  selectField: (fieldName: string) => void;
  deselectField: (fieldName: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

export function FieldPicker({
  fieldMap,
  selectField,
  deselectField,
  open,
  setOpen,
}: FieldPickerProps) {
  const euiThemeContext = useEuiTheme();

  const allFields = Object.values(fieldMap);

  const hasFields = allFields.length > 0;

  const [fieldOptions, setFieldOptions] = useState(toOptions(allFields));

  useEffect(() => {
    if (!open) {
      // only update the field options if the popover is not open currently.
      // This is necessary because EuiSelectable assumes options don't change
      // on their own.
      setFieldOptions(toOptions(Object.values(fieldMap)));
    }
  }, [fieldMap, open]);

  const badgeDescription = i18n.translate('xpack.graph.bar.pickFieldsLabel', {
    defaultMessage: 'Add fields',
  });

  const onClickCallback: EuiBadgeProps['onClick'] = useCallback(() => {
    setOpen(!open);
  }, [open, setOpen]);

  const onClickProps = useMemo(
    () =>
      hasFields
        ? {
            onClick: onClickCallback,
            onClickAriaLabel: badgeDescription,
          }
        : {},
    [badgeDescription, hasFields, onClickCallback]
  );

  return (
    <EuiPopover
      aria-label={badgeDescription}
      id="graphFieldPicker"
      anchorPosition="downCenter"
      ownFocus
      panelPaddingSize="none"
      button={
        <EuiBadge
          data-test-subj="graph-add-field-button"
          color="hollow"
          iconType="plusCircle"
          aria-disabled={!hasFields}
          {...onClickProps}
          css={[
            gphFieldBadgeSizeStyles(euiThemeContext),
            css({
              color: euiThemeContext.euiTheme.colors.primary,
              ...(!hasFields && {
                color: euiThemeContext.euiTheme.colors.mediumShade,

                '&, span': {
                  cursor: 'not-allowed !important',
                },

                '&:hover, &:focus': {
                  textDecoration: 'none !important',
                },
              }),
            }),
          ]}
        >
          {badgeDescription}
        </EuiBadge>
      }
      isOpen={open}
      closePopover={() => setOpen(false)}
      panelProps={{ css: styles.popoverPanel }}
    >
      {open && (
        <EuiSelectable
          searchProps={{
            placeholder: i18n.translate('xpack.graph.fieldManager.fieldSearchPlaceholder', {
              defaultMessage: 'Filter by',
            }),
            compressed: true,
            'data-test-subj': 'graph-field-search',
          }}
          listProps={{ css: styles.selectableList }}
          searchable
          options={fieldOptions}
          onChange={(newOptions) => {
            newOptions.forEach((option) => {
              if (option.checked === 'on' && !fieldMap[option.label].selected) {
                selectField(option.label);
              } else if (option.checked !== 'on' && fieldMap[option.label].selected) {
                deselectField(option.label);
              }
            });
            setFieldOptions(newOptions);
          }}
        >
          {(list, search) => (
            <>
              {search}
              {list}
            </>
          )}
        </EuiSelectable>
      )}
    </EuiPopover>
  );
}

function toOptions(fields: WorkspaceField[]): Array<{
  label: string;
  checked?: 'on' | 'off';
  prepend?: ReactNode;
  'data-test-subj': string;
}> {
  return (
    fields
      // don't show non-aggregatable fields, except for the case when they are already selected.
      // this is necessary to ensure backwards compatibility with existing workspaces that might
      // contain non-aggregatable fields.
      .filter((field) => isExplorable(field) || field.selected)
      .map((field) => ({
        label: field.name,
        prepend: <FieldIcon className="eui-alignMiddle" type={field.type} fill="none" />,
        checked: field.selected ? 'on' : undefined,
        'data-test-subj': `graph-field-option-${field.name}`,
      }))
  );
}

const explorableTypes = ['string', 'number', 'date', 'ip', 'boolean'];

function isExplorable(field: WorkspaceField) {
  if (!field.aggregatable) {
    return false;
  }

  return explorableTypes.includes(field.type);
}

const styles = {
  popoverPanel: ({ euiTheme }: UseEuiTheme) =>
    css({
      width: '350px',
      padding: euiTheme.size.xs,
    }),
  selectableList: ({ euiTheme }: UseEuiTheme) =>
    css({
      margin: `0 -${euiTheme.size.xs} -${euiTheme.size.xs}`,
    }),
};
