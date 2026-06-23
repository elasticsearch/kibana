/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { EuiLoadingChart, EuiSpacer } from '@elastic/eui';
import styled from '@emotion/styled';
import moment from 'moment';
import { LongRunningCommandHint } from './long_running_command_hint';
import { CommandExecutionResult } from './command_execution_result';
import type { CommandExecutionComponentProps } from '../types';
import type { CommandExecutionState, CommandHistoryItem } from './console_state/types';
import { UserCommandInput } from './user_command_input';
import { useConsoleStateDispatch } from '../hooks/state_selectors/use_console_state_dispatch';

const CommandOutputContainer = styled.div`
  position: relative;

  .busy-indicator {
    margin-left: 0.5em;
  }
`;

export interface CommandExecutionOutputProps {
  item: CommandHistoryItem;
}
export const CommandExecutionOutput = memo<CommandExecutionOutputProps>(
  ({ item: { command, state, id, enteredAt, isValid } }) => {
    const dispatch = useConsoleStateDispatch();
    const RenderComponent = command.commandDefinition.RenderComponent;
    const [isLongRunningCommand, setIsLongRunningCommand] = useState(false);

    const isRunning = useMemo(() => {
      return state.status === 'pending';
    }, [state.status]);

    /** Updates the Command's status */
    const setCommandStatus = useCallback(
      (status: CommandExecutionState['status']) => {
        dispatch({
          type: 'updateCommandStatusState',
          payload: {
            id,
            value: status,
          },
        });
      },
      [dispatch, id]
    );

    /** Updates the Command's execution store */
    const setCommandStore: CommandExecutionComponentProps['setStore'] = useCallback(
      (updateStoreFn) => {
        dispatch({
          type: 'updateCommandStoreState',
          payload: {
            id,
            value: updateStoreFn,
          },
        });
      },
      [dispatch, id]
    );

    // keep track if this becomes a long running command
    useEffect(() => {
      let timeoutId: ReturnType<typeof setTimeout>;

      if (isRunning && !isLongRunningCommand) {
        const elapsedSeconds = moment().diff(moment(enteredAt), 'seconds');

        if (elapsedSeconds >= 15) {
          setIsLongRunningCommand(true);
          return;
        }

        timeoutId = setTimeout(() => {
          setIsLongRunningCommand(true);
        }, (15 - elapsedSeconds) * 1000);
      }

      return () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      };
    }, [enteredAt, isLongRunningCommand, isRunning]);

    return (
      <CommandOutputContainer>
        <div>
          <UserCommandInput input={command.inputDisplay} isValid={isValid} />
        </div>
        <div className="noThemeOverrides">
          {/* UX desire for 12px (current theme): achieved with EuiSpace sizes - s (8px) + xs (4px) */}
          <EuiSpacer size="s" />
          <EuiSpacer size="xs" />

          <RenderComponent
            command={command}
            store={state.store}
            status={state.status}
            setStore={setCommandStore}
            setStatus={setCommandStatus}
            ResultComponent={CommandExecutionResult}
          />

          {isRunning && <EuiLoadingChart className="busy-indicator" />}

          {isRunning && isLongRunningCommand && (
            <>
              <EuiSpacer size="s" />
              <LongRunningCommandHint />
            </>
          )}
        </div>
      </CommandOutputContainer>
    );
  }
);
CommandExecutionOutput.displayName = 'CommandExecutionOutput';
