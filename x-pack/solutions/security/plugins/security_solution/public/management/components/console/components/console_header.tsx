/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback } from 'react';
import styled from '@emotion/styled';
import { EuiButtonEmpty, EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';
import { useDataTestSubj } from '../hooks/state_selectors/use_data_test_subj';
import { useTestIdGenerator } from '../../../hooks/use_test_id_generator';
import { useConsoleStateDispatch } from '../hooks/state_selectors/use_console_state_dispatch';
import { useWithSidePanel } from '../hooks/state_selectors/use_with_side_panel';
import type { ConsoleProps } from '..';

export const HELP_LABEL = i18n.translate(
  'xpack.securitySolution.console.layoutHeader.helpButtonTitle',
  { defaultMessage: 'Help' }
);

const HELP_TOOLTIP = i18n.translate('xpack.securitySolution.console.layoutHeader.helpButtonLabel', {
  defaultMessage: 'Show help',
});

const StyledEuiButtonEmpty = styled(EuiButtonEmpty)`
  margin-left: auto;
  height: inherit;
`;

export type ConsoleHeaderProps = Pick<ConsoleProps, 'TitleComponent'>;

export const ConsoleHeader = memo<ConsoleHeaderProps>(({ TitleComponent }) => {
  const dispatch = useConsoleStateDispatch();
  const panelCurrentlyShowing = useWithSidePanel().show;
  const getTestId = useTestIdGenerator(useDataTestSubj('header'));
  const isHelpOpen = panelCurrentlyShowing === 'help';

  const handleHelpButtonOnClick = useCallback(() => {
    dispatch({
      type: 'showSidePanel',
      payload: { show: isHelpOpen ? null : 'help' },
    });
  }, [dispatch, isHelpOpen]);

  return (
    <EuiFlexGroup
      gutterSize="none"
      alignItems="center"
      justifyContent="spaceBetween"
      responsive={false}
    >
      <EuiFlexItem
        grow={1}
        className="eui-textTruncate noThemeOverrides"
        css={{ maxWidth: '95%' }}
        data-test-subj={getTestId('titleComponentContainer')}
      >
        {TitleComponent ? <TitleComponent /> : ''}
      </EuiFlexItem>
      {!isHelpOpen && (
        <EuiFlexItem grow={false}>
          <StyledEuiButtonEmpty
            css={{ marginLeft: 'auto' }}
            onClick={handleHelpButtonOnClick}
            iconType="question"
            title={HELP_TOOLTIP}
            aria-label={HELP_TOOLTIP}
            isSelected={isHelpOpen}
            data-test-subj={getTestId('helpButton')}
          >
            <FormattedMessage
              id="xpack.securitySolution.console.layoutHeader.helpButtonTitle"
              defaultMessage="Help"
            />
          </StyledEuiButtonEmpty>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
});
ConsoleHeader.displayName = 'ConsoleHeader';
