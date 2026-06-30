/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiFieldText,
  EuiFormRow,
  EuiButton,
  EuiButtonIcon,
  EuiToolTip,
  EuiSpacer,
  EuiBasicTable,
  EuiCallOut,
  EuiBadge,
  EuiText,
} from '@elastic/eui';
import type { EuiBasicTableColumn } from '@elastic/eui';
import type {
  RuleTypeModel,
  RuleTypeParamsExpressionProps,
} from '@kbn/triggers-actions-ui-plugin/public';
import type { RuleTypeParams } from '@kbn/alerting-plugin/common';

interface PatternParams extends RuleTypeParams {
  patterns?: Record<string, string>;
}

export function getAlertType(): RuleTypeModel {
  return {
    id: 'example.pattern',
    description: 'Creates alerts on a configurable pattern for testing alert lifecycle states',
    iconClass: 'visBarVerticalStacked',
    documentationUrl: null,
    ruleParamsExpression: PatternExpression,
    validate: (params: PatternParams) => {
      const validationResult = {
        errors: {
          patterns: new Array<string>(),
        },
      };

      const { patterns } = params;
      if (!patterns || Object.keys(patterns).length === 0) {
        validationResult.errors.patterns.push('At least one alert instance pattern is required.');
        return validationResult;
      }

      for (const [instance, pattern] of Object.entries(patterns)) {
        if (!instance.trim()) {
          validationResult.errors.patterns.push('Instance names cannot be empty.');
          break;
        }
        const tokens = pattern.trim().split(/\s+/g);
        const invalid = tokens.filter((t) => t !== 'a' && t !== '-');
        if (invalid.length > 0) {
          validationResult.errors.patterns.push(
            `Pattern for "${instance}" contains invalid tokens: ${invalid.join(
              ', '
            )}. Use "a" (active) or "-" (inactive).`
          );
        }
      }

      return validationResult;
    },
    requiresAppContext: false,
  };
}

interface PreviewRow {
  instance: string;
  [key: string]: string;
}

const PatternExpression: React.FunctionComponent<RuleTypeParamsExpressionProps<PatternParams>> = ({
  ruleParams,
  setRuleParams,
}) => {
  const patterns = useMemo(() => ruleParams.patterns ?? {}, [ruleParams.patterns]);
  const entries = Object.entries(patterns);

  const updatePattern = (oldName: string, newName: string, value: string) => {
    const updated: Record<string, string> = {};
    for (const [key, val] of Object.entries(patterns)) {
      if (key === oldName) {
        updated[newName] = value;
      } else {
        updated[key] = val;
      }
    }
    setRuleParams('patterns', updated);
  };

  const removeInstance = (name: string) => {
    const updated = { ...patterns };
    delete updated[name];
    setRuleParams('patterns', updated);
  };

  const addInstance = () => {
    const existingKeys = new Set(Object.keys(patterns));
    let index = entries.length + 1;
    let name = `alert-${index}`;
    while (existingKeys.has(name)) {
      index++;
      name = `alert-${index}`;
    }
    setRuleParams('patterns', { ...patterns, [name]: 'a' });
  };

  const maxSteps = useMemo(() => {
    let max = 0;
    for (const pattern of Object.values(patterns)) {
      const count = pattern.trim().split(/\s+/g).length;
      if (count > max) max = count;
    }
    return max;
  }, [patterns]);

  const previewRows: PreviewRow[] = useMemo(() => {
    return entries.map(([instance, pattern]) => {
      const tokens = pattern.trim().split(/\s+/g);
      const row: PreviewRow = { instance };
      for (let i = 0; i < maxSteps; i++) {
        const token = tokens[i % tokens.length];
        row[`run_${i + 1}`] = token === 'a' ? 'active' : '-';
      }
      return row;
    });
  }, [entries, maxSteps]);

  const previewColumns: Array<EuiBasicTableColumn<PreviewRow>> = useMemo(() => {
    const cols: Array<EuiBasicTableColumn<PreviewRow>> = [
      {
        field: 'instance',
        name: 'Instance',
        width: '120px',
        render: (value: string) => <strong>{value}</strong>,
      },
    ];
    for (let i = 1; i <= maxSteps; i++) {
      cols.push({
        field: `run_${i}`,
        name: `Run ${i}`,
        width: '70px',
        align: 'center',
        render: (value: string) =>
          value === 'active' ? (
            <EuiBadge color="success">active</EuiBadge>
          ) : (
            <EuiText size="s" color="subdued">
              -
            </EuiText>
          ),
      });
    }
    return cols;
  }, [maxSteps]);

  return (
    <Fragment>
      <EuiCallOut
        title="Pattern rule for alert lifecycle testing"
        iconType="beaker"
        size="s"
        color="primary"
      >
        <p>
          Define alert instances and their activation pattern across executions. Use{' '}
          <strong>a</strong> for active and <strong>-</strong> for inactive (space-separated). The
          pattern cycles after the last step.
        </p>
      </EuiCallOut>

      <EuiSpacer size="m" />

      {entries.map(([instanceName, pattern]) => (
        <Fragment key={instanceName}>
          <EuiFlexGroup gutterSize="s" alignItems="flexEnd">
            <EuiFlexItem grow={false} style={{ width: 180 }}>
              <EuiFormRow label="Instance name" display="rowCompressed">
                <EuiFieldText
                  compressed
                  value={instanceName}
                  onChange={(e) => updatePattern(instanceName, e.target.value, pattern)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={true}>
              <EuiFormRow label="Pattern (a = active, - = inactive)" display="rowCompressed">
                <EuiFieldText
                  compressed
                  value={pattern}
                  placeholder="a a - a -"
                  onChange={(e) => updatePattern(instanceName, instanceName, e.target.value)}
                />
              </EuiFormRow>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFormRow hasEmptyLabelSpace display="rowCompressed">
                <EuiToolTip content={`Remove ${instanceName}`} disableScreenReaderOutput>
                  <EuiButtonIcon
                    iconType="trash"
                    color="danger"
                    aria-label={`Remove ${instanceName}`}
                    onClick={() => removeInstance(instanceName)}
                  />
                </EuiToolTip>
              </EuiFormRow>
            </EuiFlexItem>
          </EuiFlexGroup>
          <EuiSpacer size="xs" />
        </Fragment>
      ))}

      <EuiSpacer size="s" />

      <EuiButton size="s" iconType="plusInCircle" onClick={addInstance}>
        Add alert instance
      </EuiButton>

      {entries.length > 0 && maxSteps > 0 && (
        <>
          <EuiSpacer size="l" />
          <EuiFormRow label="Execution preview" fullWidth>
            <EuiBasicTable<PreviewRow>
              tableCaption="Execution preview showing alert states per run"
              items={previewRows}
              columns={previewColumns}
              tableLayout="auto"
              compressed
            />
          </EuiFormRow>
        </>
      )}
    </Fragment>
  );
};
