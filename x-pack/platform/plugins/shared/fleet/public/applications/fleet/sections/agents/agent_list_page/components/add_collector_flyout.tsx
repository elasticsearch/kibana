/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@kbn/react-query';
import { dump } from 'js-yaml';
import { v4 as uuidv4 } from 'uuid';
import {
  EuiFlyout,
  EuiFlyoutHeader,
  EuiFlyoutBody,
  EuiTitle,
  EuiButton,
  EuiText,
  EuiSteps,
  EuiCode,
  EuiCodeBlock,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiSpacer,
  EuiLoadingSpinner,
  EuiFlyoutFooter,
  EuiCallOut,
  EuiForm,
  EuiFormRow,
  EuiFieldText,
  EuiTextArea,
  EuiLink,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { i18n } from '@kbn/i18n';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';

import {
  sendGetOneAgentPolicy,
  sendCreateAgentPolicyForRq,
  sendGetEnrollmentAPIKeys,
  useGetFleetServerHosts,
  useFleetStatus,
  useDefaultOutput,
  useStartServices,
} from '../../../../hooks';
import { AgentEnrollmentConfirmationStep, usePollingAgentCount } from '../../../../components';
import { useGetCreateApiKey } from '../../../../../../components/agent_enrollment_flyout/hooks';

import { useManagedOtlp } from './use_managed_otlp';

interface AddCollectorFlyoutProps {
  onClose: () => void;
  onClickViewAgents: () => void;
}

const OPAMP_POLICY_ID = 'opamp';
export const OPAMP_POLICY_NAME = 'OpAMP';

function getOpAMPPolicyId(spaceId?: string) {
  return !spaceId || spaceId === '' || spaceId === DEFAULT_SPACE_ID
    ? OPAMP_POLICY_ID
    : `${spaceId}-${OPAMP_POLICY_ID}`;
}

// Converts a human-readable label to a lowercase, hyphen-separated machine key, e.g. "My Group 1" → "my-group-1".
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

async function fetchOpampPolicy(spaceId?: string): Promise<any | null> {
  const res = await sendGetOneAgentPolicy(getOpAMPPolicyId(spaceId));
  if (res?.error?.statusCode === 404) {
    return null;
  }
  if (res?.error?.message) {
    throw new Error(res.error.message);
  }
  return res?.data?.item || null;
}

// OpAMP collectors run as a managed service; default to a 1-day inactivity timeout so
// disconnected collectors flip to inactive promptly even if they don't cleanly report
// AgentDisconnect. The Elastic Agent default of 2 weeks is too long for the collector
// lifecycle. Tracking: https://github.com/elastic/ingest-dev/issues/7567
const OPAMP_INACTIVITY_TIMEOUT_SECONDS = 24 * 60 * 60;

async function createOpampPolicyWithHook(spaceId?: string): Promise<any> {
  return sendCreateAgentPolicyForRq({
    name: OPAMP_POLICY_NAME,
    id: getOpAMPPolicyId(spaceId),
    namespace: 'default',
    description: 'Agent policy for OpAMP collectors',
    is_managed: true,
    inactivity_timeout: OPAMP_INACTIVITY_TIMEOUT_SECONDS,
  });
}

async function fetchEnrollmentTokenWithHook(policyId: string): Promise<any[]> {
  const res = await sendGetEnrollmentAPIKeys({
    page: 1,
    perPage: 1,
    kuery: `policy_id:"${policyId}"`,
  });
  if (res?.error?.message) {
    throw new Error(res.error.message);
  }
  return res?.data?.items || [];
}

async function ensurePolicyAndFetchToken(spaceId?: string): Promise<string | undefined> {
  let opampPolicy = await fetchOpampPolicy(spaceId);
  if (!opampPolicy) {
    const created = await createOpampPolicyWithHook(spaceId);
    opampPolicy = created.item || created;
  }
  const tokens = await fetchEnrollmentTokenWithHook(opampPolicy.id);
  return tokens[0]?.api_key;
}

const REQUIRED_ERROR = i18n.translate('xpack.fleet.addCollectorFlyout.fieldRequired', {
  defaultMessage: 'This field is required.',
});

const SLUG_FORMAT_ERROR = i18n.translate('xpack.fleet.addCollectorFlyout.slugFormatError', {
  defaultMessage:
    'Must contain only lowercase letters, numbers, and hyphens, with no leading or trailing hyphens.',
});

const OTLP_MANAGED_EXPORTER = 'otlp/managed';
const ELASTICSEARCH_OTEL_EXPORTER = 'elasticsearch/otel';

// Validates that a value matches the slug format produced by slugify().
function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+([a-z0-9-]*[a-z0-9])?$/.test(value);
}

const DEFAULT_ES_HOST = 'http://localhost:9200';

export const AddCollectorFlyout: React.FunctionComponent<AddCollectorFlyoutProps> = ({
  onClose,
  onClickViewAgents,
}) => {
  const instanceUid = useRef(uuidv4());
  const { cloud, docLinks } = useStartServices();

  const esApiKey = useGetCreateApiKey();
  const motlp = useManagedOtlp();
  const { available: motlpAvailable, endpoint: motlpEndpoint } = motlp;

  const { apiKeyEncoded, isCreatingApiKey, onCreateApiKey } = motlpAvailable
    ? {
        apiKeyEncoded: motlp.apiKeyEncoded,
        isCreatingApiKey: motlp.isCreatingApiKey,
        onCreateApiKey: motlp.onCreateApiKey,
      }
    : {
        apiKeyEncoded: esApiKey.apiKeyEncoded,
        isCreatingApiKey: esApiKey.isLoading,
        onCreateApiKey: esApiKey.onCreateApiKey,
      };

  const fleetServerHosts = useGetFleetServerHosts();
  const defaultFleetServerHost =
    fleetServerHosts.data?.items?.find((item) => item.is_default)?.host_urls?.[0] || '';
  const { spaceId } = useFleetStatus();
  const { output: defaultOutput } = useDefaultOutput();
  const defaultEsHost = defaultOutput?.hosts?.[0] ?? DEFAULT_ES_HOST;
  // The active space resolves asynchronously (see useFleetStatus), starting as `undefined`.
  // Until it's known we must not resolve the OpAMP policy/token, otherwise getOpAMPPolicyId
  // falls back to the unprefixed default-space id and the collector enrolls into the Default
  // space instead of the current one. See https://github.com/elastic/kibana/issues/275528
  const isSpaceResolved = spaceId !== undefined;
  const { enrolledAgentIds } = usePollingAgentCount(getOpAMPPolicyId(spaceId), {
    noLowerTimeLimit: true,
    pollImmediately: true,
    enabled: isSpaceResolved,
  });

  const {
    data: token,
    isLoading: loading,
    error: queryError,
  } = useQuery<string | undefined, Error>({
    queryKey: ['opampPolicyAndToken', spaceId],
    queryFn: () => ensurePolicyAndFetchToken(spaceId),
    enabled: isSpaceResolved,
  });

  const error = queryError?.message ?? null;

  // Form state
  const [groupDisplayName, setGroupDisplayName] = useState('OTel Collector Group');
  const [collectorGroup, setCollectorGroup] = useState('otel-collector-group');
  const [collectorGroupOverridden, setCollectorGroupOverridden] = useState(false);
  const [serviceName, setServiceName] = useState('otel-collector-group');
  const [serviceNameOverridden, setServiceNameOverridden] = useState(false);
  const [collectorDisplayName, setCollectorDisplayName] = useState('${env:HOSTNAME}');
  const [configName, setConfigName] = useState('');
  const [configDescription, setConfigDescription] = useState('');
  const [tags, setTags] = useState('');
  const [environment, setEnvironment] = useState('');
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const touch = (field: string) => setTouched((prev) => ({ ...prev, [field]: true }));

  type RequiredField =
    | 'groupDisplayName'
    | 'collectorGroup'
    | 'serviceName'
    | 'collectorDisplayName';
  const fieldErrors: Partial<Record<RequiredField, string>> = {};
  if (groupDisplayName.trim() === '') fieldErrors.groupDisplayName = REQUIRED_ERROR;
  if (collectorGroup.trim() === '') fieldErrors.collectorGroup = REQUIRED_ERROR;
  else if (!isValidSlug(collectorGroup)) fieldErrors.collectorGroup = SLUG_FORMAT_ERROR;
  if (serviceName.trim() === '') fieldErrors.serviceName = REQUIRED_ERROR;
  else if (!isValidSlug(serviceName)) fieldErrors.serviceName = SLUG_FORMAT_ERROR;
  if (collectorDisplayName.trim() === '') fieldErrors.collectorDisplayName = REQUIRED_ERROR;

  const isFormValid = Object.keys(fieldErrors).length === 0;
  const isInvalid = (field: RequiredField) => !!(touched[field] && fieldErrors[field]);
  const errorFor = (field: RequiredField) => (touched[field] ? fieldErrors[field] : undefined);

  const handleGroupDisplayNameChange = (value: string) => {
    setGroupDisplayName(value);
    const slug = slugify(value);
    if (!collectorGroupOverridden) setCollectorGroup(slug);
    if (!serviceNameOverridden) setServiceName(slug);
  };

  const opampConfig = useMemo(() => {
    const nonIdentifyingAttrs: Record<string, any> = {
      'elastic.collector.group_name': groupDisplayName,
      'elastic.collector.group': collectorGroup,
      'elastic.display.name': collectorDisplayName,
      ...(configName ? { 'config.name': configName } : {}),
      ...(configDescription ? { 'config.description': configDescription } : {}),
      ...(tags.trim() ? { tags } : {}),
      ...(environment ? { 'deployment.environment.name': environment } : {}),
    };

    const telemetryResource: Record<string, any> = {
      'elastic.collector.group_name': groupDisplayName,
      'elastic.collector.group': collectorGroup,
      'service.namespace': collectorGroup,
      'service.name': serviceName,
      'service.instance.id': collectorDisplayName,
      ...(tags.trim() ? { tags } : {}),
      ...(environment ? { 'deployment.environment.name': environment } : {}),
    };

    const selfTelemetryOtlpExporter: Record<string, any> = {
      exporter: {
        otlp: {
          protocol: 'grpc',
          endpoint: 'http://localhost:4317',
        },
      },
    };

    const primaryExporter = motlpAvailable ? OTLP_MANAGED_EXPORTER : ELASTICSEARCH_OTEL_EXPORTER;

    const config = {
      extensions: {
        opamp: {
          server: {
            http: {
              endpoint: `${defaultFleetServerHost}/v1/opamp`,
              headers: { Authorization: `ApiKey ${token}` },
              ...(!cloud?.isCloudEnabled && {
                tls: { insecure_skip_verify: true },
              }),
            },
          },
          instance_uid: instanceUid.current,
          agent_description: { non_identifying_attributes: nonIdentifyingAttrs },
        },
      },
      receivers: {
        otlp: {
          protocols: {
            grpc: {
              endpoint: '0.0.0.0:4317',
            },
          },
        },
      },
      exporters: {
        ...(motlpAvailable
          ? {
              [OTLP_MANAGED_EXPORTER]: {
                endpoint: motlpEndpoint,
                headers: {
                  Authorization: `ApiKey ${apiKeyEncoded || '${API_KEY}'}`,
                },
              },
            }
          : {
              [ELASTICSEARCH_OTEL_EXPORTER]: {
                endpoints: [defaultEsHost],
                api_key: apiKeyEncoded || '${API_KEY}',
                mapping: { mode: 'otel' },
              },
            }),
        otlp: {
          endpoint: 'http://localhost:4317',
          tls: { insecure: true },
        },
      },
      service: {
        extensions: ['opamp'],
        pipelines: {
          logs: { receivers: ['otlp'], exporters: [primaryExporter] },
          metrics: { receivers: ['otlp'], exporters: [primaryExporter] },
          traces: { receivers: ['otlp'], exporters: [primaryExporter] },
        },
        telemetry: {
          resource: telemetryResource,
          metrics: {
            readers: [{ periodic: selfTelemetryOtlpExporter }],
          },
          logs: {
            processors: [{ batch: selfTelemetryOtlpExporter }],
          },
          traces: {
            processors: [{ batch: selfTelemetryOtlpExporter }],
          },
        },
      },
    };
    return dump(config, { lineWidth: -1, quotingType: '"', forceQuotes: true, noRefs: true });
  }, [
    groupDisplayName,
    collectorGroup,
    serviceName,
    collectorDisplayName,
    configName,
    configDescription,
    tags,
    environment,
    defaultFleetServerHost,
    defaultEsHost,
    token,
    apiKeyEncoded,
    motlpAvailable,
    motlpEndpoint,
    cloud?.isCloudEnabled,
  ]);

  const steps = [
    {
      title: i18n.translate('xpack.fleet.addCollectorFlyout.getOpampConfigStepTitle', {
        defaultMessage: 'Collector configuration',
      }),
      children: (
        <EuiText>
          <p>
            <FormattedMessage
              id="xpack.fleet.addCollectorFlyout.opampConfigInstruction"
              defaultMessage="Fill in the form with metadata and copy or download the generated collector config below:"
            />
          </p>
          <EuiForm component="div" fullWidth>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.groupDisplayNameLabel', {
                defaultMessage: 'Collector group display name',
              })}
              helpText={i18n.translate(
                'xpack.fleet.addCollectorFlyout.form.groupDisplayNameHelpText',
                {
                  defaultMessage:
                    'Human-readable label for this group of collectors, e.g. "Production West".',
                }
              )}
              isInvalid={isInvalid('groupDisplayName')}
              error={errorFor('groupDisplayName')}
            >
              <EuiFieldText
                fullWidth
                isInvalid={isInvalid('groupDisplayName')}
                value={groupDisplayName}
                onChange={(e) => handleGroupDisplayNameChange(e.target.value)}
                onBlur={() => touch('groupDisplayName')}
                data-test-subj="collectorGroupDisplayNameInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.collectorGroupLabel', {
                defaultMessage: 'Collector group',
              })}
              helpText={i18n.translate(
                'xpack.fleet.addCollectorFlyout.form.collectorGroupHelpText',
                {
                  defaultMessage:
                    'Machine-friendly key used for filtering in Fleet UI. Auto-derived from the display name above. If overriding, use only lowercase letters, numbers, and hyphens.',
                }
              )}
              isInvalid={isInvalid('collectorGroup')}
              error={errorFor('collectorGroup')}
            >
              <EuiFieldText
                fullWidth
                isInvalid={isInvalid('collectorGroup')}
                prepend="elastic.collector.group:"
                value={collectorGroup}
                onChange={(e) => {
                  setCollectorGroupOverridden(true);
                  setCollectorGroup(e.target.value);
                }}
                onBlur={() => touch('collectorGroup')}
                data-test-subj="collectorGroupInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.serviceNameLabel', {
                defaultMessage: 'Service name',
              })}
              helpText={i18n.translate('xpack.fleet.addCollectorFlyout.form.serviceNameHelpText', {
                defaultMessage:
                  'Identifies this collector in Elasticsearch as service.name. Auto-derived from the display name above. If overriding, use only lowercase letters, numbers, and hyphens.',
              })}
              isInvalid={isInvalid('serviceName')}
              error={errorFor('serviceName')}
            >
              <EuiFieldText
                fullWidth
                isInvalid={isInvalid('serviceName')}
                value={serviceName}
                onChange={(e) => {
                  setServiceNameOverridden(true);
                  setServiceName(e.target.value);
                }}
                onBlur={() => touch('serviceName')}
                data-test-subj="serviceNameInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate(
                'xpack.fleet.addCollectorFlyout.form.collectorDisplayNameLabel',
                { defaultMessage: 'Collector display name' }
              )}
              helpText={i18n.translate(
                'xpack.fleet.addCollectorFlyout.form.collectorDisplayNameHelpText',
                {
                  defaultMessage:
                    'Per-instance identity that distinguishes this collector within the group, e.g. "prod-collector-01". Defaults to HOSTNAME environment variable.',
                }
              )}
              isInvalid={isInvalid('collectorDisplayName')}
              error={errorFor('collectorDisplayName')}
            >
              <EuiFieldText
                fullWidth
                isInvalid={isInvalid('collectorDisplayName')}
                value={collectorDisplayName}
                onChange={(e) => setCollectorDisplayName(e.target.value)}
                onBlur={() => touch('collectorDisplayName')}
                data-test-subj="collectorDisplayNameInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.configNameLabel', {
                defaultMessage: 'Config name',
              })}
              helpText={i18n.translate('xpack.fleet.addCollectorFlyout.form.configNameHelpText', {
                defaultMessage:
                  'Optional. Short name for this collector configuration, e.g. "webserver-logs". Used as the config label in Fleet.',
              })}
            >
              <EuiFieldText
                fullWidth
                prepend="config.name:"
                value={configName}
                onChange={(e) => setConfigName(e.target.value)}
                data-test-subj="configNameInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.configDescriptionLabel', {
                defaultMessage: 'Config description',
              })}
              helpText={i18n.translate(
                'xpack.fleet.addCollectorFlyout.form.configDescriptionHelpText',
                {
                  defaultMessage:
                    'Optional. A human-readable summary of what this collector does. Appears as a comment header in the effective config view.',
                }
              )}
            >
              <EuiTextArea
                fullWidth
                value={configDescription}
                onChange={(e) => setConfigDescription(e.target.value)}
                data-test-subj="configDescriptionInput"
                resize="vertical"
                rows={3}
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.tagsLabel', {
                defaultMessage: 'Tags',
              })}
              helpText={i18n.translate('xpack.fleet.addCollectorFlyout.form.tagsHelpText', {
                defaultMessage:
                  'Optional. Comma-separated labels, e.g. prod,west-region,k8s. Tags appear in the Fleet view filter and as resource attributes on all self-emitted metrics and logs in Elasticsearch, making them queryable via ES|QL.',
              })}
            >
              <EuiFieldText
                fullWidth
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                data-test-subj="tagsInput"
              />
            </EuiFormRow>
            <EuiFormRow
              fullWidth
              label={i18n.translate('xpack.fleet.addCollectorFlyout.form.environmentLabel', {
                defaultMessage: 'Environment',
              })}
              helpText={i18n.translate('xpack.fleet.addCollectorFlyout.form.environmentHelpText', {
                defaultMessage:
                  'Optional. Deployment tier following OTel semconv (deployment.environment.name). Appears alongside tags in the Fleet view and on self-emitted telemetry.',
              })}
            >
              <EuiFieldText
                fullWidth
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                data-test-subj="environmentInput"
              />
            </EuiFormRow>
          </EuiForm>
          <EuiHorizontalRule />
          {!isFormValid && (
            <EuiText color="danger">
              <p>
                <FormattedMessage
                  id="xpack.fleet.addCollectorFlyout.fixValidationErrors"
                  defaultMessage="The form is invalid. Fill in all required fields above to generate the collector config."
                />
              </p>
            </EuiText>
          )}
          {token && defaultFleetServerHost && isFormValid ? (
            <>
              <EuiText>
                <p>
                  {motlpAvailable ? (
                    <FormattedMessage
                      id="xpack.fleet.addCollectorFlyout.managedOtlpApiKeyDescription"
                      defaultMessage="Either use an existing managed OTLP API key and replace {apiKeyPlaceholder} in the {apiKeyField} header of the config below, or click the button to generate a new one. Refer to the {motlpDocumentation} for more details."
                      values={{
                        apiKeyPlaceholder: <EuiCode>{'${API_KEY}'}</EuiCode>,
                        apiKeyField: <EuiCode>Authorization</EuiCode>,
                        motlpDocumentation: (
                          <EuiLink
                            data-test-subj="addCollectorManagedOtlpDocsLink"
                            target="_blank"
                            href={docLinks.links.fleet.managedOtlp}
                          >
                            <FormattedMessage
                              id="xpack.fleet.addCollectorFlyout.managedOtlpDocsLinkLabel"
                              defaultMessage="Managed OTLP Endpoint (mOTLP) documentation"
                            />
                          </EuiLink>
                        ),
                      }}
                    />
                  ) : (
                    <FormattedMessage
                      id="xpack.fleet.addCollectorFlyout.apiKeyDescription"
                      defaultMessage="Either use an existing API key and replace {apiKeyPlaceholder} in the {apiKeyField} field of the config below, or click the button to generate a new one."
                      values={{
                        apiKeyPlaceholder: <EuiCode>{'${API_KEY}'}</EuiCode>,
                        apiKeyField: <EuiCode>api_key</EuiCode>,
                      }}
                    />
                  )}
                </p>
              </EuiText>
              <EuiSpacer size="s" />
              <EuiFlexGroup gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    onClick={onCreateApiKey}
                    isLoading={isCreatingApiKey}
                    isDisabled={!!apiKeyEncoded}
                    iconType={apiKeyEncoded ? 'check' : undefined}
                    color={apiKeyEncoded ? 'success' : 'primary'}
                  >
                    <FormattedMessage
                      id="xpack.fleet.addCollectorFlyout.createApiKeyButton"
                      defaultMessage="Create API key"
                    />
                  </EuiButton>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    iconType="download"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = `data:text/x-yaml;charset=utf-8,${encodeURIComponent(
                        opampConfig
                      )}`;
                      link.download = 'otel-opamp.yaml';
                      link.click();
                    }}
                  >
                    <FormattedMessage
                      id="xpack.fleet.addCollectorFlyout.downloadConfigButton"
                      defaultMessage="Download config"
                    />
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="m" />
              <EuiCodeBlock
                isCopyable
                language="yaml"
                paddingSize="m"
                data-test-subj="opampConfigYaml"
              >
                {opampConfig}
              </EuiCodeBlock>
            </>
          ) : loading ? (
            <EuiCallOut
              announceOnMount
              size="m"
              color="primary"
              iconType={EuiLoadingSpinner}
              title={
                <FormattedMessage
                  id="xpack.fleet.agentEnrollment.loading.preparingOpAMPConfig"
                  defaultMessage="Preparing OpAMP configuration..."
                />
              }
            />
          ) : null}
        </EuiText>
      ),
    },
    {
      title: i18n.translate('xpack.fleet.addCollectorFlyout.runCollectorStepTitle', {
        defaultMessage: 'Run your collector',
      }),
      children: (
        <EuiText>
          <p>
            <FormattedMessage
              id="xpack.fleet.addCollectorFlyout.runCollectorInstruction"
              defaultMessage="Run your collector. The following command uses the OTel contrib collector:"
            />
          </p>
          <EuiCodeBlock isCopyable language="yaml" paddingSize="m">
            {'./otelcol-contrib --config ./otel-opamp.yaml '}
          </EuiCodeBlock>
        </EuiText>
      ),
    },
    AgentEnrollmentConfirmationStep({
      selectedPolicyId: getOpAMPPolicyId(spaceId),
      onClickViewAgents,
      troubleshootLink: '', // TODO: add troubleshooting guide link
      agentCount: enrolledAgentIds.length,
      isCollector: true,
    }) as any,
  ];

  return (
    <EuiFlyout onClose={onClose} size="m" aria-labelledby="addCollectorFlyoutTitle">
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2 id="addCollectorFlyoutTitle">
            {' '}
            <FormattedMessage
              id="xpack.fleet.addCollectorFlyout.title"
              defaultMessage="Add Collector"
            />
          </h2>
        </EuiTitle>
        <EuiSpacer size="l" />
        <EuiText>
          <FormattedMessage
            id="xpack.fleet.addCollectorFlyout.description"
            defaultMessage="Monitor OpenTelemetry collectors in Fleet with OpAMP."
          />
        </EuiText>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        {error ? (
          <EuiText color="danger">
            <p>{error}</p>
          </EuiText>
        ) : (
          <EuiSteps steps={steps} firstStepNumber={1} />
        )}
        <EuiSpacer size="l" />
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiButton onClick={onClose} style={{ marginTop: 16 }}>
          <FormattedMessage
            id="xpack.fleet.addCollectorFlyout.closeButton"
            defaultMessage="Close"
          />
        </EuiButton>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
};
