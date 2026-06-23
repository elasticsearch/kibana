/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isEmpty } from 'lodash';
import React, { useMemo, useState } from 'react';
import { BehaviorSubject } from 'rxjs';

import type { UseEuiTheme } from '@elastic/eui';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormControlButton,
  EuiInputPopover,
  EuiNotificationBadge,
  EuiToken,
  EuiToolTip,
  htmlIdGenerator,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { OptionsListSelection } from '@kbn/controls-schemas';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { useBatchedPublishingSubjects, type PublishingSubject } from '@kbn/presentation-publishing';

import { isCompressed } from '../../../../control_group/utils/is_compressed';
import { MIN_POPOVER_WIDTH } from '../../../constants';
import { ConditionalLabelWrapper } from '../../../control_labels';
import { isDSLOptionsListApi } from '../../../utils';
import { useOptionsListContext } from '../options_list_context_provider';
import { OptionsListStrings } from '../options_list_strings';
import type { DSLOptionsListComponentApi } from '../types';
import { OptionsListPopover } from './options_list_popover';
import type { ESQLOptionsListComponentApi } from '../../../esql_control/types';

const optionListControlStyles = {
  selectionWrapper: css({ overflow: 'hidden !important' }),
  excludeSelected: ({ euiTheme }: UseEuiTheme) =>
    css({
      fontSize: euiTheme.size.m,
      fontWeight: euiTheme.font.weight.bold,
      color: euiTheme.colors.danger,
    }),
  validOption: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textParagraph,
      fontWeight: euiTheme.font.weight.regular,
    }),
  invalidOption: ({ euiTheme }: UseEuiTheme) =>
    css({
      color: euiTheme.colors.textWarning,
      fontWeight: euiTheme.font.weight.medium,
    }),
  optionsListExistsFilter: ({ euiTheme }: UseEuiTheme) => css`
    font-style: italic;
    font-weight: ${euiTheme.font.weight.medium};
  `,
  invalidSelectionsToken: css({ verticalAlign: 'text-bottom' }),
  filterButton: ({ euiTheme }: UseEuiTheme) =>
    css({
      fontWeight: `${euiTheme.font.weight.regular} !important` as 'normal',
      color: `${euiTheme.colors.textSubdued} !important`,
      padding: `0 ${euiTheme.size.s}`,
      blockSize: '100% !important',
      boxShadow: 'none !important',
      '&:hover:not(:focus)': {
        outline: `none !important`,
      },
    }),
  filterButtonText: css({
    flexGrow: 1,
    textAlign: 'left',
  }),
  inputButtonOverride: css({
    width: '100%',
    height: '100%',
    maxInlineSize: '100%',
  }),
  filterGroup: css`
    width: 100%;
    height: 100%;
  `,
};

export const OptionsListControl = ({
  isPinned,
  disableMultiValueEmptySelection = false,
}: {
  isPinned: boolean;
  disableMultiValueEmptySelection?: boolean;
}) => {
  const popoverId = useMemo(() => htmlIdGenerator()(), []);
  const { componentApi, displaySettings, customStrings } = useOptionsListContext();

  const [isPopoverOpen, setPopoverOpen] = useState<boolean>(false);

  const conditionalApiSubjects: [
    PublishingSubject<boolean | undefined>,
    PublishingSubject<boolean | undefined>,
    DSLOptionsListComponentApi['field$'] | PublishingSubject<undefined>,
    DSLOptionsListComponentApi['fieldFormatter'] | PublishingSubject<undefined>,
    ESQLOptionsListComponentApi['tooltipLabel$'] | PublishingSubject<undefined>
  ] = useMemo(() => {
    const isDSLControl = isDSLOptionsListApi(componentApi);
    return [
      isDSLControl ? componentApi.exclude$ : new BehaviorSubject<boolean | undefined>(false),
      isDSLControl ? componentApi.existsSelected$ : new BehaviorSubject<boolean | undefined>(false),
      isDSLControl ? componentApi.field$ : new BehaviorSubject(undefined),
      isDSLControl ? componentApi.fieldFormatter : new BehaviorSubject(undefined),
      !isDSLControl ? componentApi.tooltipLabel$ : new BehaviorSubject(undefined),
    ];
  }, [componentApi]);

  const [
    selectedOptions,
    invalidSelections,
    loading,
    label,
    excludeSelected,
    existsSelected,
    field,
    fieldFormatter,
    tooltipLabel,
  ] = useBatchedPublishingSubjects(
    componentApi.selectedOptions$,
    componentApi.invalidSelections$,
    componentApi.dataLoading$,
    componentApi.label$,
    ...conditionalApiSubjects
  );

  const delimiter = useMemo(() => OptionsListStrings.control.getSeparator(field?.type), [field]);
  const styles = useMemoCss(optionListControlStyles);

  const { hasSelections, selectionDisplayNode, selectedOptionsCount } = useMemo(() => {
    return {
      hasSelections: !isEmpty(selectedOptions),
      selectedOptionsCount: selectedOptions?.length,
      selectionDisplayNode: (
        <EuiFlexGroup alignItems="center" responsive={false} gutterSize="xs">
          <EuiFlexItem css={styles.selectionWrapper} data-test-subj="optionsListSelections">
            <div className="eui-textTruncate">
              {excludeSelected && (
                <>
                  <span css={styles.excludeSelected}>
                    {existsSelected
                      ? OptionsListStrings.control.getExcludeExists()
                      : OptionsListStrings.control.getNegate()}
                  </span>{' '}
                </>
              )}
              {existsSelected ? (
                <span css={styles.optionsListExistsFilter}>
                  {OptionsListStrings.controlAndPopover.getExists(+Boolean(excludeSelected))}
                </span>
              ) : (
                <>
                  {selectedOptions?.length
                    ? selectedOptions.map((value: OptionsListSelection, i, { length }) => {
                        const text = `${fieldFormatter ? fieldFormatter(value) : value}${
                          i + 1 === length ? '' : delimiter
                        }`;
                        const isInvalid = invalidSelections?.has(value as string);
                        return (
                          <span
                            key={value}
                            css={isInvalid ? styles.invalidOption : styles.validOption}
                          >
                            {text}
                          </span>
                        );
                      })
                    : null}
                </>
              )}
            </div>
          </EuiFlexItem>
          {invalidSelections && invalidSelections.size > 0 && (
            <EuiFlexItem grow={false}>
              <EuiToolTip
                position="top"
                content={
                  customStrings?.invalidSelectionsLabel ??
                  OptionsListStrings.control.getInvalidSelectionWarningLabel(invalidSelections.size)
                }
              >
                <EuiToken
                  tabIndex={0}
                  iconType="warning"
                  size="s"
                  color="euiColorVis9"
                  shape="square"
                  fill="dark"
                  title={
                    customStrings?.invalidSelectionsLabel ??
                    OptionsListStrings.control.getInvalidSelectionWarningLabel(
                      invalidSelections.size
                    )
                  }
                  data-test-subj={`optionsList__invalidSelectionsToken-${componentApi.uuid}`}
                  css={styles.invalidSelectionsToken} // Align with the notification badge
                />
              </EuiToolTip>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      ),
    };
  }, [
    selectedOptions,
    excludeSelected,
    existsSelected,
    fieldFormatter,
    delimiter,
    invalidSelections,
    componentApi.uuid,
    styles,
    customStrings,
  ]);

  const button = (
    <EuiFormControlButton
      role="combobox"
      isLoading={loading}
      compressed={isCompressed(componentApi)}
      iconType={'chevronSingleDown'}
      iconSide="right"
      value={hasSelections || existsSelected ? selectionDisplayNode : ''}
      placeholder={displaySettings.placeholder ?? OptionsListStrings.control.getPlaceholder()}
      css={styles.filterButton}
      onClick={() => setPopoverOpen(!isPopoverOpen)}
      aria-label={label}
      aria-expanded={isPopoverOpen}
      aria-controls={popoverId}
      data-test-subj={`optionsList-control-${componentApi.uuid}`}
    >
      {Boolean(selectedOptionsCount) && (
        <EuiNotificationBadge color="success">{selectedOptionsCount}</EuiNotificationBadge>
      )}
    </EuiFormControlButton>
  );

  return (
    <ConditionalLabelWrapper
      label={label}
      isPinned={isPinned}
      tooltipLabel={tooltipLabel}
      api={componentApi}
    >
      <div
        className={'kbnGridLayout--hideDragHandle'}
        css={optionListControlStyles.filterGroup}
        data-control-id={componentApi.uuid}
        data-shared-item
      >
        <EuiInputPopover
          id={popoverId}
          ownFocus
          input={button}
          repositionOnScroll
          isOpen={isPopoverOpen}
          panelPaddingSize="none"
          panelMinWidth={MIN_POPOVER_WIDTH}
          className="optionsList__inputButtonOverride"
          css={styles.inputButtonOverride}
          initialFocus={'[data-test-subj=optionsList-control-search-input]'}
          closePopover={() => setPopoverOpen(false)}
          panelClassName="optionsList__popoverOverride"
          panelProps={{
            title: label,
            'aria-label': OptionsListStrings.popover.getAriaLabel(label),
          }}
        >
          <OptionsListPopover disableMultiValueEmptySelection={disableMultiValueEmptySelection} />
        </EuiInputPopover>
      </div>
    </ConditionalLabelWrapper>
  );
};
