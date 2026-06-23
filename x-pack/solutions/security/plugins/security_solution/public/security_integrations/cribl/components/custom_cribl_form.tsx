/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React, { memo, useEffect, useState } from 'react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import {
  EuiButton,
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { INVALID_NAMESPACE_CHARACTERS, isValidNamespace } from '@kbn/fleet-plugin/common';
import type {
  NewPackagePolicy,
  PackagePolicyReplaceDefineStepExtensionComponentProps,
} from '@kbn/fleet-plugin/public/types';
import { getFleetManagedIndexTemplates } from '../api/api';
import type { RouteEntry } from '../../../../common/security_integrations/cribl/types';
import {
  getPolicyConfigValueFromRouteEntries,
  getRouteEntriesFromPolicyConfig,
} from '../../../../common/security_integrations/cribl/translator';
import { allRouteEntriesArePaired, hasAtLeastOneValidRouteEntry } from './util/validator';

const getDefaultRouteEntry = () => {
  return {
    dataId: '',
    datastream: '',
  };
};

const NAMESPACE_MAX_LENGTH = 100;

const sanitizeNamespaceInput = (value: string): string =>
  value.toLowerCase().replace(INVALID_NAMESPACE_CHARACTERS, '').slice(0, NAMESPACE_MAX_LENGTH);

interface RouteEntryComponentProps {
  index: number;
  routeEntries: RouteEntry[];
  datastreamOpts: string[];
  onChangeCriblDataId(index: number, value: string): void;
  onChangeDatastream(index: number, value: string): void;
  onChangeNamespace(index: number, value: string | undefined): void;
  onDeleteEntry(index: number): void;
}

const RouteEntryComponent = React.memo<RouteEntryComponentProps>(
  ({
    index,
    routeEntries,
    datastreamOpts,
    onChangeCriblDataId,
    onChangeDatastream,
    onChangeNamespace,
    onDeleteEntry,
  }) => {
    const { euiTheme } = useEuiTheme();
    const routeEntry = routeEntries[index]; // the route entry for this row
    const namespaceValidation = routeEntry.namespace
      ? isValidNamespace(routeEntry.namespace, false)
      : undefined;
    const isNamespaceInvalid = !!(namespaceValidation && !namespaceValidation.valid);

    const options = datastreamOpts.map((o) => ({
      label: o,
    }));

    const selectedOption = options.filter((o) => o.label === routeEntry.datastream);

    const removeEntryLabel = i18n.translate(
      'xpack.securitySolution.securityIntegration.cribl.removeEntry',
      { defaultMessage: 'Remove entry' }
    );

    return (
      <>
        <EuiFlexGroup>
          <EuiFlexItem>
            <EuiFormRow label="Cribl _dataId field">
              <EuiFieldText
                value={routeEntry.dataId}
                onChange={(e) => onChangeCriblDataId(index, e.currentTarget.value)}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFormRow hasEmptyLabelSpace>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', blockSize: euiTheme.size.xxl }}
            >
              {i18n.translate('xpack.securitySolution.securityIntegration.cribl.mapsTo', {
                defaultMessage: 'MAPS TO',
              })}
            </span>
          </EuiFormRow>
          {/* minWidth: 0 overrides flex default (min-width: auto) to prevent
             the combo box selection pill from resizing the column */}
          <EuiFlexItem style={{ minWidth: 0 }}>
            <EuiFormRow label="Datastream" fullWidth>
              <EuiComboBox
                placeholder="Select"
                singleSelection
                fullWidth
                options={options}
                selectedOptions={selectedOption}
                onChange={(o) => {
                  if (o.length > 0) {
                    onChangeDatastream(index, o[0].label);
                  } else {
                    onChangeDatastream(index, '');
                  }
                }}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFormRow
              label="Namespace"
              isInvalid={isNamespaceInvalid}
              error={namespaceValidation?.error}
            >
              <EuiFieldText
                placeholder="default"
                value={routeEntry.namespace ?? ''}
                isInvalid={isNamespaceInvalid}
                onChange={(e) => {
                  const sanitized = sanitizeNamespaceInput(e.currentTarget.value);
                  onChangeNamespace(index, sanitized === '' ? undefined : sanitized);
                }}
              />
            </EuiFormRow>
          </EuiFlexItem>
          <EuiFormRow hasEmptyLabelSpace>
            <span
              style={{ display: 'inline-flex', alignItems: 'center', blockSize: euiTheme.size.xxl }}
            >
              <EuiToolTip content={removeEntryLabel} disableScreenReaderOutput>
                <EuiButtonIcon
                  color="danger"
                  iconType="trash"
                  onClick={() => onDeleteEntry(index)}
                  isDisabled={routeEntries.length === 1}
                  aria-label={removeEntryLabel}
                  className="itemEntryDeleteButton"
                  data-test-subj="itemEntryDeleteButton"
                />
              </EuiToolTip>
            </span>
          </EuiFormRow>
        </EuiFlexGroup>
      </>
    );
  }
);

export const CustomCriblForm = memo<PackagePolicyReplaceDefineStepExtensionComponentProps>(
  ({ newPolicy, onChange, isEditPage }) => {
    const { http } = useKibana().services;

    const [missingReqPermissions, setMissingReqPermissions] = useState<boolean>();
    const [datastreamOpts, setDatastreamOpts] = useState<string[]>([]);

    const [initialPackagePolicy] = useState<NewPackagePolicy>(newPolicy);

    useEffect(() => {
      const fetchData = async () => {
        if (!http) return;
        const { indexTemplates, permissionsError } = await getFleetManagedIndexTemplates(http);
        setDatastreamOpts(indexTemplates);

        if (permissionsError) {
          setMissingReqPermissions(true);
        }
      };
      fetchData();
    }, [http]);

    const [routeEntries, setRouteEntries] = useState<RouteEntry[]>([]);

    // Set route entries from initial state
    useEffect(() => {
      if (isEditPage) {
        if (initialPackagePolicy) {
          const fromConfig = getRouteEntriesFromPolicyConfig(initialPackagePolicy.vars);
          if (fromConfig.length > 0) {
            setRouteEntries(fromConfig);
            return;
          }
        }
      }
      const defaultRouteEntries = [getDefaultRouteEntry()];
      setRouteEntries(defaultRouteEntries);
    }, [isEditPage, initialPackagePolicy]);

    const onChangeCriblDataId = (index: number, value: string) => {
      const newValues = [...routeEntries];
      newValues[index] = {
        ...routeEntries[index],
        dataId: value,
      };
      setRouteEntries(newValues);
      updateCriblPolicy(newValues);
    };

    const onChangeDatastream = (index: number, value: string) => {
      const newValues = [...routeEntries];
      newValues[index] = {
        ...routeEntries[index],
        datastream: value,
      };
      setRouteEntries(newValues);
      updateCriblPolicy(newValues);
    };

    const onChangeNamespace = (index: number, value: string | undefined) => {
      const newValues = [...routeEntries];
      newValues[index] = {
        ...routeEntries[index],
        namespace: value || undefined,
      };
      setRouteEntries(newValues);
      updateCriblPolicy(newValues);
    };

    const onAddEntry = () => {
      const newValues = [...routeEntries, getDefaultRouteEntry()];
      setRouteEntries(newValues);
      updateCriblPolicy(newValues);
    };

    const onDeleteEntry = (index: number) => {
      const newValues = routeEntries.filter((_, idx) => idx !== index);
      setRouteEntries(newValues);
      updateCriblPolicy(newValues);
    };

    const updateCriblPolicy = (updatedRouteEntries: RouteEntry[]) => {
      const updatedPolicy = {
        ...newPolicy,
        vars: {
          route_entries: {
            value: getPolicyConfigValueFromRouteEntries(updatedRouteEntries),
          },
        },
      };

      const allNamespacesValid = updatedRouteEntries.every(
        (entry) => !entry.namespace || isValidNamespace(entry.namespace, false).valid
      );

      // must have at least one filled in and all entries must have both filled in or neither
      const isValid =
        hasAtLeastOneValidRouteEntry(updatedRouteEntries) &&
        allRouteEntriesArePaired(updatedRouteEntries) &&
        allNamespacesValid;

      onChange({
        isValid,
        updatedPolicy,
      });
    };

    return (
      <>
        {missingReqPermissions && (
          <>
            <EuiCallOut
              announceOnMount={false}
              size="s"
              title={i18n.translate(
                'xpack.securitySolution.securityIntegration.cribl.missingPermissionsCalloutTitle',
                {
                  defaultMessage: 'Be sure you have the necessary privileges',
                }
              )}
              iconType="question"
            >
              <p>
                <FormattedMessage
                  id="xpack.securitySolution.securityIntegration.cribl.missingPermissionsCalloutDescription"
                  defaultMessage="To configure this integration, you must have `manage_index_templates` privileges and `manage_pipeline` or `manage_ingest_pipelines` privileges."
                />
              </p>
            </EuiCallOut>
            <EuiSpacer size="l" />
          </>
        )}
        <EuiFlexGroup>
          <EuiFlexItem>
            <FormattedMessage
              id="xpack.securitySolution.securityIntegration.cribl.mappingInstruction"
              defaultMessage="Add mappings for your Cribl sources to a corresponding Elastic Fleet Integration datastream."
            />
          </EuiFlexItem>
        </EuiFlexGroup>
        <EuiSpacer />
        <EuiFlexGroup gutterSize="s" data-test-subj="entriesContainer">
          <EuiFlexGroup gutterSize="s" direction="column">
            {routeEntries.map((_, idx) => (
              <RouteEntryComponent
                key={idx}
                index={idx}
                routeEntries={routeEntries}
                datastreamOpts={datastreamOpts}
                onChangeCriblDataId={onChangeCriblDataId}
                onChangeDatastream={onChangeDatastream}
                onChangeNamespace={onChangeNamespace}
                onDeleteEntry={onDeleteEntry}
              />
            ))}
            <EuiSpacer size="s" />
            <EuiFlexGroup>
              <EuiFlexItem grow={false}>
                <EuiButton fill size="s" iconType="plusInCircle" onClick={onAddEntry}>
                  <FormattedMessage
                    id="xpack.securitySolution.securityIntegration.cribl.addButton"
                    defaultMessage="Add"
                  />
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
            <EuiSpacer size="m" />
          </EuiFlexGroup>
        </EuiFlexGroup>
      </>
    );
  }
);

RouteEntryComponent.displayName = 'CriblRouteEntry';
CustomCriblForm.displayName = 'CriblForm';
