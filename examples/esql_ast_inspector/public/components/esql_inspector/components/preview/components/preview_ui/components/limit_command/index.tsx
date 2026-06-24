/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import * as React from 'react';
import {
  EuiButton,
  EuiButtonIcon,
  EuiFieldText,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { Builder } from '@elastic/esql';
import { useEsqlInspector } from '../../../../../../context';
import { useBehaviorSubject } from '../../../../../../../../hooks/use_behavior_subject';

export const LimitCommand: React.FC = () => {
  const state = useEsqlInspector();
  const limit = useBehaviorSubject(state.limit$);
  const focusedNode = useBehaviorSubject(state.focusedNode$);

  if (!limit) {
    return (
      <EuiPanel hasShadow={false} hasBorder style={{ maxWidth: 360 }}>
        <EuiFormRow fullWidth>
          <EuiButton
            fullWidth
            size={'s'}
            color="text"
            onClick={() => {
              const query = state.query$.getValue();
              if (!query) return;
              const literal = Builder.expression.literal.numeric({
                value: 10,
                literalType: 'integer',
              });
              const command = Builder.command({
                name: 'limit',
                args: [literal],
              });
              query.ast.commands.push(command);
              state.reprint();
            }}
          >
            Add limit
          </EuiButton>
        </EuiFormRow>
      </EuiPanel>
    );
  }

  const value = +(limit.args[0] as any)?.value;

  if (typeof value !== 'number') {
    return null;
  }

  return (
    <EuiPanel hasShadow={false} hasBorder style={{ maxWidth: 360 }}>
      <div
        onMouseEnter={() => {
          state.focusedNode$.next(limit);
        }}
        style={{
          background: focusedNode === limit ? 'rgb(190, 237, 224)' : 'transparent',
          padding: 8,
          margin: -8,
          borderRadius: 8,
          position: 'relative',
        }}
      >
        <EuiTitle size="xxs" css={{ color: focusedNode === limit ? 'rgb(7, 16, 31)' : 'inherit' }}>
          <h3>Limit</h3>
        </EuiTitle>
        <div
          css={{
            paddingTop: 16,
          }}
        >
          <EuiFormRow fullWidth>
            <EuiFieldText
              fullWidth
              value={value}
              onChange={(e) => {
                const newValue = +e.target.value;

                if (newValue !== newValue) {
                  return;
                }

                const literal = Builder.expression.literal.numeric({
                  value: newValue,
                  literalType: 'integer',
                });

                limit.args[0] = literal;
                state.reprint();
              }}
            />
          </EuiFormRow>
        </div>
        <div style={{ position: 'absolute', right: 0, top: 0 }}>
          <EuiFlexItem grow={false}>
            <EuiToolTip content="Remove" disableScreenReaderOutput>
              <EuiButtonIcon
                iconType="cross"
                aria-label="Remove"
                onClick={() => {
                  const query = state.query$.getValue();
                  if (!query) return;
                  query.ast.commands = query.ast.commands.filter((c) => c !== limit);
                  state.reprint();
                }}
              />
            </EuiToolTip>
          </EuiFlexItem>
        </div>
      </div>
    </EuiPanel>
  );
};
