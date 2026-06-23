/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import React, { memo, useMemo, useCallback } from 'react';
import styled from '@emotion/styled';
import {
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';

import { FormattedMessage } from '@kbn/i18n-react';
import { useTestIdGenerator } from '../../../../hooks/use_test_id_generator';
import { CommandList } from '../command_list';
import { useWithCommandList } from '../../hooks/state_selectors/use_with_command_list';
import { SidePanelContentLayout } from './side_panel_content_layout';
import { useWithSidePanel } from '../../hooks/state_selectors/use_with_side_panel';
import { useConsoleStateDispatch } from '../../hooks/state_selectors/use_console_state_dispatch';
import { useDataTestSubj } from '../../hooks/state_selectors/use_data_test_subj';

const StyledEuiFlexGroup = styled(EuiFlexGroup)`
  padding-top: ${({ theme }) => theme.euiTheme.size.s};
  padding-right: ${({ theme }) => theme.euiTheme.size.s};
`;

export const SidePanelContentManager = memo(() => {
  const dispatch = useConsoleStateDispatch();
  const commands = useWithCommandList();
  const getTestId = useTestIdGenerator(useDataTestSubj('sidePanel'));
  const show = useWithSidePanel().show;

  const closeHelpPanel = useCallback(() => {
    dispatch({
      type: 'showSidePanel',
      payload: { show: null },
    });
  }, [dispatch]);

  const panelHeader: ReactNode = useMemo(() => {
    if (show === 'help') {
      return (
        <>
          <StyledEuiFlexGroup>
            <EuiFlexItem>
              <EuiTitle size="s" data-test-subj={getTestId('headerTitle')}>
                <h3>
                  <FormattedMessage
                    id="xpack.securitySolution.console.sidePanel.helpTitle"
                    defaultMessage="Help"
                  />
                </h3>
              </EuiTitle>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip content="closeSidePanelIcon" disableScreenReaderOutput>
                <EuiButtonIcon
                  aria-label="closeSidePanelIcon"
                  iconType="cross"
                  color="text"
                  onClick={closeHelpPanel}
                  data-test-subj={getTestId('headerCloseButton')}
                />
              </EuiToolTip>
            </EuiFlexItem>
          </StyledEuiFlexGroup>
          <EuiSpacer size="m" />
          <EuiText size="s">
            <FormattedMessage
              id="xpack.securitySolution.console.sidePanel.helpDescription"
              defaultMessage="Use the add ({icon}) button to populate a response action to the text bar. Add additional parameters or comments as necessary."
              values={{
                icon: <EuiIcon type="plusCircle" aria-hidden={true} />,
              }}
            />
          </EuiText>
        </>
      );
    }
    return null;
  }, [show, getTestId, closeHelpPanel]);

  const panelBody: ReactNode = useMemo(() => {
    if (show === 'help') {
      return (
        <div data-test-subj={getTestId('helpContent')}>
          <CommandList commands={commands} display="table" />
        </div>
      );
    }

    return null;
  }, [commands, getTestId, show]);

  if (!show) {
    return null;
  }

  return <SidePanelContentLayout headerContent={panelHeader}>{panelBody}</SidePanelContentLayout>;
});
SidePanelContentManager.displayName = 'RightPanelContentManager';
