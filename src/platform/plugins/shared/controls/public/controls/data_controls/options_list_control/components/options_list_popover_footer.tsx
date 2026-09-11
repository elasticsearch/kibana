/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';

import {
  EuiButtonGroup,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIconTip,
  EuiPopoverFooter,
  EuiProgress,
  useEuiBackgroundColor,
  useEuiPaddingSize,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useBatchedPublishingSubjects, type ViewMode } from '@kbn/presentation-publishing';

import { isDSLOptionsListApi } from '../../../utils';
import { useOptionsListContext } from '../options_list_context_provider';
import { OptionsListStrings } from '../options_list_strings';

const aggregationToggleButtons = [
  {
    id: 'optionsList__includeResults',
    key: 'optionsList__includeResults',
    label: OptionsListStrings.popover.getIncludeLabel(),
  },
  {
    id: 'optionsList__excludeResults',
    key: 'optionsList__excludeResults',
    label: OptionsListStrings.popover.getExcludeLabel(),
  },
];

export const OptionsListPopoverFooter = () => {
  const { componentApi, displaySettings } = useOptionsListContext();

  const [exclude, viewMode, isPartial, loading] = useBatchedPublishingSubjects(
    isDSLOptionsListApi(componentApi) ? componentApi.exclude$ : new BehaviorSubject(false),
    isDSLOptionsListApi(componentApi)
      ? componentApi.viewMode$
      : new BehaviorSubject('view' as ViewMode),
    isDSLOptionsListApi(componentApi) ? componentApi.isPartial$ : new BehaviorSubject(false),
    componentApi.dataLoading$
  );

  return (
    <>
      <EuiPopoverFooter
        paddingSize="none"
        css={css`
          background-color: ${useEuiBackgroundColor('subdued')};
        `}
      >
        {loading && (
          <div css={{ position: 'absolute', width: '100%' }}>
            <EuiProgress
              data-test-subj="optionsList-control-popover-loading"
              size="xs"
              color="accent"
            />
          </div>
        )}

        <EuiFlexGroup
          gutterSize="xs"
          responsive={false}
          alignItems="center"
          css={css`
            padding: ${useEuiPaddingSize('s')};
          `}
          justifyContent={'spaceBetween'}
        >
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              isDisabled={displaySettings.previewMode}
              legend={OptionsListStrings.popover.getIncludeExcludeLegend()}
              options={aggregationToggleButtons}
              idSelected={exclude ? 'optionsList__excludeResults' : 'optionsList__includeResults'}
              onChange={(optionId) => {
                if (!isDSLOptionsListApi(componentApi)) return;
                componentApi.setExclude?.(optionId === 'optionsList__excludeResults');
              }}
              buttonSize="compressed"
              data-test-subj="optionsList__includeExcludeButtonGroup"
            />
          </EuiFlexItem>
          {isPartial && (
            <EuiFlexItem grow={false}>
              <EuiIconTip
                size="m"
                type="partial"
                title={OptionsListStrings.popover.getPartialResultsTitle()}
                aria-label={OptionsListStrings.popover.getPartialResultsTitle()}
                content={OptionsListStrings.popover.getPartialResultsTooltip(viewMode)}
              />
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiPopoverFooter>
    </>
  );
};
