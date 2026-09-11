/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { isEqual } from 'lodash';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { isValidNamespace } from '@kbn/fleet-plugin/common';
import type {
  EuiComboBoxOptionOption,
  EuiSelectProps,
  EuiFieldTextProps,
  EuiSwitchProps,
  EuiComboBoxProps,
  EuiFieldNumberProps,
  EuiFieldPasswordProps,
  EuiCheckboxProps,
  EuiTextAreaProps,
  EuiButtonGroupProps,
} from '@elastic/eui';
import {
  EuiIcon,
  EuiCode,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiHighlight,
  EuiBadge,
  EuiToolTip,
} from '@elastic/eui';
import { MaintenanceWindowsLink } from '../fields/maintenance_windows/create_maintenance_windows_btn';
import type { MaintenanceWindowsFieldProps } from '../fields/maintenance_windows/maintenance_windows';
import type { MonitorSpacesProps } from '../fields/monitor_spaces';
import { kibanaService } from '../../../../../utils/kibana_service';
import type { ThrottlingConfigFieldProps } from '../fields/throttling/throttling_config_field';
import { PROFILE_OPTIONS } from '../fields/throttling/throttling_config_field';
import type {
  FormattedComboBoxProps,
  JSONCodeEditorProps,
  HeaderFieldProps,
  RequestBodyFieldProps,
  ResponseBodyIndexFieldProps,
  ControlledFieldProp,
} from './field_wrappers';
import {
  FieldText,
  FieldNumber,
  FieldPassword,
  Checkbox,
  ComboBox,
  LocationsComboBox,
  Select,
  Switch,
  Source,
  ButtonGroup,
  FormattedComboBox,
  JSONEditor,
  MonitorTypeRadioGroup,
  HeaderField,
  RequestBodyField,
  ResponseBodyIndexField,
  KeyValuePairsField,
  TextArea,
  ThrottlingWrapper,
  MaintenanceWindowsFieldWrapper,
  KibanaSpacesWrapper,
} from './field_wrappers';
import { useMonitorName } from '../../../hooks/use_monitor_name';
import type {
  MonitorFields,
  FieldMap,
  FormLocation,
  ResponseCheckJSON,
  ThrottlingConfig,
  RequestBodyCheck,
} from '../types';
import {
  ConfigKey,
  MonitorTypeEnum,
  FormMonitorType,
  HTTPMethod,
  ScreenshotOption,
  Mode,
  TLSVersion,
  VerificationMode,
  ResponseBodyIndexPolicy,
  SourceType,
} from '../types';
import {
  AlertConfigKey,
  ALLOWED_SCHEDULES_IN_MINUTES,
  ALLOWED_SCHEDULES_IN_SECONDS,
} from '../constants';
import { monitorTypeRequiresPrivateLocations } from '../../../../../../common/utils/monitor_location_support';
import { getDefaultFormFields } from './defaults';
import { parsePemCertificateEntries } from './parse_pem_certificate_entries';
import { validate, validateHeaders, WHOLE_NUMBERS_ONLY, FLOATS_ONLY } from './validation';
import type { KeyValuePairsFieldProps } from '../fields/key_value_field';

export const API_PRIVATE_LOCATIONS_ONLY = i18n.translate(
  'xpack.synthetics.monitorConfig.locations.apiPrivateOnlyErrorMessage',
  {
    defaultMessage: 'API Journey monitors can only run on private locations.',
  }
);

const API_PRIVATE_LOCATION_REQUIRED = i18n.translate(
  'xpack.synthetics.monitorConfig.monitorType.api.privateLocationRequiredTooltip',
  {
    defaultMessage: 'API Journey requires a private location.',
  }
);

const API_NOT_SUPPORTED_ON_SERVERLESS = i18n.translate(
  'xpack.synthetics.monitorConfig.monitorType.api.notSupportedOnServerlessTooltip',
  {
    defaultMessage: 'API Journey monitors are not yet supported on Serverless.',
  }
);

const getScheduleContent = (value: number, seconds?: boolean) => {
  if (seconds) {
    return i18n.translate('xpack.synthetics.monitorConfig.schedule.seconds.label', {
      defaultMessage: 'Every {value, number} {value, plural, one {second} other {seconds}}',
      values: {
        value,
      },
    });
  }
  if (value > 60) {
    return i18n.translate('xpack.synthetics.monitorConfig.schedule.label', {
      defaultMessage: 'Every {value, number} {value, plural, one {hour} other {hours}}',
      values: {
        value: value / 60,
      },
    });
  } else {
    return i18n.translate('xpack.synthetics.monitorConfig.schedule.minutes.label', {
      defaultMessage: 'Every {value, number} {value, plural, one {minute} other {minutes}}',
      values: {
        value,
      },
    });
  }
};

const getSchedules = (monitorType?: MonitorTypeEnum) => {
  const minutes = ALLOWED_SCHEDULES_IN_MINUTES.map((value) => ({
    value,
    text: getScheduleContent(parseInt(value, 10)),
  }));
  const allowSeconds =
    monitorType === MonitorTypeEnum.HTTP ||
    monitorType === MonitorTypeEnum.TCP ||
    monitorType === MonitorTypeEnum.ICMP;
  if (allowSeconds) {
    const seconds = ALLOWED_SCHEDULES_IN_SECONDS.map((value) => ({
      value,
      text: getScheduleContent(parseInt(value, 10), true),
    }));
    return [...seconds, ...minutes];
  } else {
    return minutes;
  }
};

export const MONITOR_TYPE_CONFIG = {
  [FormMonitorType.API]: {
    id: 'syntheticsMonitorTypeAPI',
    'data-test-subj': 'syntheticsMonitorTypeAPI',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.api.label', {
      defaultMessage: 'API Journey',
    }),
    value: FormMonitorType.API,
    descriptionTitle: i18n.translate('xpack.synthetics.monitorConfig.monitorType.api.title', {
      defaultMessage: 'API Journey',
    }),
    description: i18n.translate('xpack.synthetics.monitorConfig.monitorType.api.description', {
      defaultMessage: 'Run a sequence of HTTP requests without launching a browser.',
    }),
    link: 'https://www.elastic.co/guide/en/observability/current/synthetics-journeys.html',
    icon: 'inputOutput',
    beta: true,
  },
  [FormMonitorType.MULTISTEP]: {
    id: 'syntheticsMonitorTypeMultistep',
    'data-test-subj': 'syntheticsMonitorTypeMultistep',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.multiStep.label', {
      defaultMessage: 'Browser Journey',
    }),
    value: FormMonitorType.MULTISTEP,
    descriptionTitle: i18n.translate('xpack.synthetics.monitorConfig.monitorType.multiStep.title', {
      defaultMessage: 'Browser Journey',
    }),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.monitorType.multiStep.description',
      {
        defaultMessage:
          'Navigate through multiple steps or pages to test key user flows from a real browser.',
      }
    ),
    link: 'https://www.elastic.co/guide/en/observability/current/synthetics-journeys.html',
    icon: 'display',
    beta: false,
  },
  [FormMonitorType.SINGLE]: {
    id: 'syntheticsMonitorTypeSingle',
    'data-test-subj': 'syntheticsMonitorTypeSingle',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.singlePage.label', {
      defaultMessage: 'Single Page',
    }),
    value: FormMonitorType.SINGLE,
    descriptionTitle: i18n.translate(
      'xpack.synthetics.monitorConfig.monitorType.singlePage.title',
      {
        defaultMessage: 'Page load',
      }
    ),
    description: i18n.translate(
      'xpack.synthetics.monitorConfig.monitorType.singlePage.description',
      {
        defaultMessage:
          'Test a single page load including all objects on the page from a real web browser.',
      }
    ),
    link: 'https://www.elastic.co/guide/en/observability/current/synthetics-journeys.html',
    icon: 'inspect',
    beta: false,
  },
  [FormMonitorType.HTTP]: {
    id: 'syntheticsMonitorTypeHTTP',
    'data-test-subj': 'syntheticsMonitorTypeHTTP',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.http.label', {
      defaultMessage: 'HTTP',
    }),
    value: FormMonitorType.HTTP,
    descriptionTitle: i18n.translate('xpack.synthetics.monitorConfig.monitorType.http.title', {
      defaultMessage: 'HTTP Ping',
    }),
    description: i18n.translate('xpack.synthetics.monitorConfig.monitorType.http.description', {
      defaultMessage: 'A lightweight check of a URL without a browser or script.',
    }),
    link: 'https://elastic.co/guide/en/observability/current/synthetics-lightweight.html',
    icon: 'globe',
    beta: false,
  },
  [FormMonitorType.TCP]: {
    id: 'syntheticsMonitorTypeTCP',
    'data-test-subj': 'syntheticsMonitorTypeTCP',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.tcp.label', {
      defaultMessage: 'TCP',
    }),
    value: FormMonitorType.TCP,
    descriptionTitle: i18n.translate('xpack.synthetics.monitorConfig.monitorType.tcp.title', {
      defaultMessage: 'TCP Ping',
    }),
    description: i18n.translate('xpack.synthetics.monitorConfig.monitorType.tcp.description', {
      defaultMessage: 'Check that a host and port accept TCP connections.',
    }),
    link: 'https://www.elastic.co/guide/en/observability/current/synthetics-lightweight.html',
    icon: 'ip',
    beta: false,
  },
  [FormMonitorType.ICMP]: {
    id: 'syntheticsMonitorTypeICMP',
    'data-test-subj': 'syntheticsMonitorTypeICMP',
    label: i18n.translate('xpack.synthetics.monitorConfig.monitorType.icmp.label', {
      defaultMessage: 'ICMP',
    }),
    value: FormMonitorType.ICMP,
    descriptionTitle: i18n.translate('xpack.synthetics.monitorConfig.monitorType.icmp.title', {
      defaultMessage: 'ICMP Ping',
    }),
    description: i18n.translate('xpack.synthetics.monitorConfig.monitorType.icmp.description', {
      defaultMessage: 'Check that a host responds to ICMP ping.',
    }),
    link: 'https://www.elastic.co/guide/en/observability/current/synthetics-lightweight.html',
    icon: 'bolt',
    beta: false,
  },
};

export const FIELD = (readOnly?: boolean): FieldMap => ({
  [ConfigKey.FORM_MONITOR_TYPE]: {
    fieldKey: ConfigKey.FORM_MONITOR_TYPE,
    required: true,
    component: MonitorTypeRadioGroup,
    ariaLabel: i18n.translate('xpack.synthetics.monitorConfig.monitorType.label', {
      defaultMessage: 'Monitor type',
    }),
    controlled: true,
    props: ({ field, reset, space, locations }) => {
      const hasUsableApiJourneyLocation = locations.some(
        (location) => !location.isInvalid && !location.isServiceManaged
      );
      const isExistingApiJourney = field?.value === FormMonitorType.API;
      return {
        onChange: (_: string, monitorType: FormMonitorType) => {
          const defaultFields = getDefaultFormFields(space)[monitorType];
          reset(defaultFields);
        },
        selectedOption: field?.value,
        // API Journey isn't supported on Serverless yet; disable choosing it
        // there until it ships in a stack release, but keep it visible (and
        // selected) when editing a monitor that already has this type, so the
        // selector still reflects its current type. Remove this special-casing
        // once it's enabled on Serverless.
        options: Object.values(MONITOR_TYPE_CONFIG)
          .filter(
            (option) =>
              option.value !== FormMonitorType.API ||
              !kibanaService.isServerless ||
              isExistingApiJourney
          )
          .map((option) => {
            if (option.value !== FormMonitorType.API) {
              return option;
            }
            if (kibanaService.isServerless) {
              return {
                ...option,
                isDisabled: !isExistingApiJourney,
                disabledReason: API_NOT_SUPPORTED_ON_SERVERLESS,
              };
            }
            return {
              ...option,
              isDisabled: !hasUsableApiJourneyLocation,
              disabledReason: API_PRIVATE_LOCATION_REQUIRED,
            };
          }),
      };
    },
    validation: () => ({
      required: true,
    }),
  },
  [`urls__single`]: {
    fieldKey: ConfigKey.URLS,
    required: true,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.urlsSingle.label', {
      defaultMessage: 'Website URL',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.urlsSingle.helpText', {
      defaultMessage: 'For example, https://www.elastic.co.',
    }),
    controlled: true,
    dependencies: [ConfigKey.NAME],
    props: ({ setValue, dependenciesFieldMeta, isEdit, trigger }): EuiFieldTextProps => {
      return {
        'data-test-subj': 'syntheticsMonitorConfigURL',
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
          setValue(ConfigKey.URLS, event.target.value, { shouldTouch: true });
          if (!dependenciesFieldMeta[ConfigKey.NAME].isDirty && !isEdit) {
            setValue(ConfigKey.NAME, event.target.value, {
              shouldTouch: true,
            });
          }
          await trigger();
        },
        readOnly,
      };
    },
  },
  [`urls__http`]: {
    fieldKey: ConfigKey.URLS,
    required: true,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.urls.label', {
      defaultMessage: 'URL',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.urls.helpText', {
      defaultMessage: 'For example, your service endpoint.',
    }),
    controlled: true,
    dependencies: [ConfigKey.NAME],
    props: ({ setValue, trigger, dependenciesFieldMeta, isEdit }): EuiFieldTextProps => {
      return {
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
          setValue(ConfigKey.URLS, event.target.value, { shouldTouch: true });
          if (!dependenciesFieldMeta[ConfigKey.NAME].isDirty && !isEdit) {
            setValue(ConfigKey.NAME, event.target.value, {
              shouldTouch: true,
            });
            await trigger();
          }
        },
        'data-test-subj': 'syntheticsMonitorConfigURL',
        readOnly,
      };
    },
  },
  [`hosts__tcp`]: {
    fieldKey: ConfigKey.HOSTS,
    required: true,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.hostsTCP.label', {
      defaultMessage: 'Host:Port',
    }),
    controlled: true,
    dependencies: [ConfigKey.NAME],
    props: ({ setValue, trigger, dependenciesFieldMeta, isEdit }): EuiFieldTextProps => {
      return {
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
          setValue(ConfigKey.HOSTS, event.target.value, { shouldTouch: true });
          if (!dependenciesFieldMeta[ConfigKey.NAME].isDirty && !isEdit) {
            setValue(ConfigKey.NAME, event.target.value, { shouldTouch: true });
          }
          await trigger();
        },
        'data-test-subj': 'syntheticsMonitorConfigHost',
        readOnly,
      };
    },
  },
  [`hosts__icmp`]: {
    fieldKey: ConfigKey.HOSTS,
    required: true,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.hostsICMP.label', {
      defaultMessage: 'Host',
    }),
    controlled: true,
    dependencies: [ConfigKey.NAME],
    props: ({ setValue, trigger, dependenciesFieldMeta, isEdit }): EuiFieldTextProps => {
      return {
        onChange: async (event: React.ChangeEvent<HTMLInputElement>) => {
          setValue(ConfigKey.HOSTS, event.target.value, { shouldTouch: true });
          if (!dependenciesFieldMeta[ConfigKey.NAME].isDirty && !isEdit) {
            setValue(ConfigKey.NAME, event.target.value, { shouldTouch: true });
          }
          await trigger();
        },
        'data-test-subj': 'syntheticsMonitorConfigHost',
        readOnly,
      };
    },
  },
  [ConfigKey.NAME]: {
    fieldKey: ConfigKey.NAME,
    required: true,
    component: FieldText,
    controlled: true,
    label: i18n.translate('xpack.synthetics.monitorConfig.name.label', {
      defaultMessage: 'Monitor name',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.name.helpText', {
      defaultMessage: 'Choose a name to help identify this monitor in the future.',
    }),
    dependencies: [ConfigKey.URLS, ConfigKey.HOSTS],
    customHook: (value: unknown) => ({
      fieldKey: 'nameAlreadyExists',
      func: useMonitorName,
      params: { search: value as string },
      error: i18n.translate('xpack.synthetics.monitorConfig.name.existsError', {
        defaultMessage: 'Monitor name already exists',
      }),
    }),
    validation: () => ({
      validate: {
        notEmpty: (value) =>
          !Boolean(value.trim())
            ? i18n.translate('xpack.synthetics.monitorConfig.name.error', {
                defaultMessage: 'Monitor name is required',
              })
            : true,
      },
    }),
    error: i18n.translate('xpack.synthetics.monitorConfig.name.error', {
      defaultMessage: 'Monitor name is required',
    }),
    props: (): EuiFieldTextProps => ({
      'data-test-subj': 'syntheticsMonitorConfigName',
      readOnly,
    }),
  },
  ['schedule.number']: {
    fieldKey: `schedule.number`,
    required: true,
    component: Select,
    label: i18n.translate('xpack.synthetics.monitorConfig.frequency.label', {
      defaultMessage: 'Frequency',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.frequency.helpText', {
      defaultMessage:
        'How often do you want to run this test? Higher frequencies will increase your total cost.',
    }),
    props: ({ formState }): EuiSelectProps => ({
      'data-test-subj': 'syntheticsMonitorConfigSchedule',
      options: getSchedules(formState.defaultValues?.[ConfigKey.MONITOR_TYPE]),
      disabled: readOnly,
    }),
  },
  [ConfigKey.LOCATIONS]: {
    fieldKey: ConfigKey.LOCATIONS,
    required: true,
    controlled: true,
    component: LocationsComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.locations.label', {
      defaultMessage: 'Locations',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.locations.helpText', {
      defaultMessage:
        'Where do you want to run this test from? Additional locations will increase your total cost.',
    }),
    dependencies: [ConfigKey.MONITOR_TYPE],
    validation: ([monitorType]) => ({
      validate: {
        privateLocationsOnly: (value: FormLocation[]) => {
          if (!monitorTypeRequiresPrivateLocations(monitorType as string)) {
            return true;
          }
          return value?.some((location) => location.isServiceManaged)
            ? API_PRIVATE_LOCATIONS_ONLY
            : true;
        },
      },
    }),
    props: ({ field, setValue, locations, trigger, formState }) => {
      const isPrivateLocationsOnly = monitorTypeRequiresPrivateLocations(
        formState.defaultValues?.[ConfigKey.MONITOR_TYPE]
      );
      return {
        options: Object.values(locations).map((location) => {
          const isPublic = location.isServiceManaged || false;
          return {
            label: location.label,
            id: location.id,
            isServiceManaged: isPublic,
            isInvalid: location.isInvalid,
            disabled: location.isInvalid || (isPrivateLocationsOnly && isPublic),
          };
        }),
        selectedOptions: Object.values(field?.value || {}).map((location) => ({
          color:
            location.isInvalid ||
            !locations.some((s) => s.id === location.id) ||
            (isPrivateLocationsOnly && location.isServiceManaged)
              ? 'danger'
              : location.isServiceManaged
              ? 'default'
              : 'primary',
          label:
            (location.label || locations?.find((loc) => location.id === loc.id)?.label) ??
            location.id,
          id: location.id || '',
          isServiceManaged: location.isServiceManaged || false,
        })),
        'data-test-subj': 'syntheticsMonitorConfigLocations',
        onChange: async (updatedValues: FormLocation[]) => {
          const valuesToSave = updatedValues.map(({ id, label, isServiceManaged }) => ({
            id,
            label,
            isServiceManaged,
          }));
          setValue(ConfigKey.LOCATIONS, valuesToSave);
          await trigger(ConfigKey.LOCATIONS);
        },
        isDisabled: readOnly,
        renderOption: (option: FormLocation & { disabled?: boolean }, searchValue: string) => {
          const disabledForApi = isPrivateLocationsOnly && option.isServiceManaged;
          return (
            <EuiToolTip
              anchorProps={{
                style: { width: '100%' },
              }}
              content={
                option.isInvalid
                  ? i18n.translate('xpack.synthetics.monitorConfig.locations.attachedPolicy', {
                      defaultMessage:
                        'The attached agent policy for this location has been deleted.',
                    })
                  : disabledForApi
                  ? API_PRIVATE_LOCATIONS_ONLY
                  : ''
              }
            >
              <EuiFlexGroup gutterSize="s" alignItems="center">
                <EuiFlexItem>
                  <EuiHighlight search={searchValue}>{option.label}</EuiHighlight>
                </EuiFlexItem>
                {option.isInvalid && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="danger">
                      {i18n.translate('xpack.synthetics.monitorConfig.locations.invalid', {
                        defaultMessage: 'Invalid',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
                {!option.isServiceManaged && (
                  <EuiFlexItem grow={false}>
                    <EuiBadge color="primary">
                      {i18n.translate('xpack.synthetics.monitorConfig.locations.private', {
                        defaultMessage: 'Private',
                      })}
                    </EuiBadge>
                  </EuiFlexItem>
                )}
              </EuiFlexGroup>
            </EuiToolTip>
          );
        },
      };
    },
  },
  [ConfigKey.ENABLED]: {
    fieldKey: ConfigKey.ENABLED,
    component: Switch,
    controlled: true,
    helpText: i18n.translate('xpack.synthetics.monitorConfig.edit.enabled.label', {
      defaultMessage: `When disabled, the monitor doesn't run any tests. You can enable it at any time.`,
    }),
    props: ({ setValue, field, trigger, formState }): EuiSwitchProps => {
      const isProjectMonitor =
        formState.defaultValues?.[ConfigKey.MONITOR_SOURCE_TYPE] === SourceType.PROJECT;
      return {
        id: 'syntheticsMontiorConfigIsEnabled',
        label: i18n.translate('xpack.synthetics.monitorConfig.enabled.label', {
          defaultMessage: 'Enable Monitor',
        }),
        checked: field?.value || false,
        onChange: async (event) => {
          setValue(ConfigKey.ENABLED, !!event.target.checked);
          await trigger(ConfigKey.ENABLED);
        },
        'data-test-subj': 'syntheticsEnableSwitch',
        // enabled is an allowed field for read only
        disabled: !isProjectMonitor && readOnly,
      };
    },
  },
  [AlertConfigKey.STATUS_ENABLED]: {
    fieldKey: AlertConfigKey.STATUS_ENABLED,
    component: Switch,
    controlled: true,
    props: ({ setValue, field, trigger, formState }): EuiSwitchProps => {
      const isProjectMonitor =
        formState.defaultValues?.[ConfigKey.MONITOR_SOURCE_TYPE] === SourceType.PROJECT;
      return {
        id: 'syntheticsMonitorConfigIsAlertEnabled',
        label: i18n.translate('xpack.synthetics.monitorConfig.disabledAlerting.label', {
          defaultMessage: 'Enable status alerts on this monitor',
        }),
        checked: field?.value || false,
        onChange: async (event) => {
          setValue(AlertConfigKey.STATUS_ENABLED, !!event.target.checked);
          await trigger(AlertConfigKey.STATUS_ENABLED);
        },
        'data-test-subj': 'syntheticsAlertStatusSwitch',
        // alert config is an allowed field for read only
        disabled: !isProjectMonitor && readOnly,
      };
    },
  },
  [AlertConfigKey.TLS_ENABLED]: {
    fieldKey: AlertConfigKey.TLS_ENABLED,
    component: Switch,
    controlled: true,
    props: ({ setValue, field, trigger, formState }): EuiSwitchProps => {
      const isProjectMonitor =
        formState.defaultValues?.[ConfigKey.MONITOR_SOURCE_TYPE] === SourceType.PROJECT;
      return {
        id: 'syntheticsMonitorConfigIsTlsAlertEnabled',
        label: i18n.translate('xpack.synthetics.monitorConfig.create.alertTlsEnabled.label', {
          defaultMessage: 'Enable TLS alerts on this monitor.',
        }),
        checked: field?.value || false,
        onChange: async (event) => {
          setValue(AlertConfigKey.TLS_ENABLED, !!event.target.checked);
          await trigger(AlertConfigKey.TLS_ENABLED);
        },
        'data-test-subj': 'syntheticsAlertStatusSwitch',
        // alert config is an allowed field for read only
        disabled: !isProjectMonitor && readOnly,
      };
    },
  },
  [ConfigKey.TAGS]: {
    fieldKey: ConfigKey.TAGS,
    component: FormattedComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.tags.label', {
      defaultMessage: 'Tags',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.tags.helpText', {
      defaultMessage:
        'A list of tags that will be sent with each monitor event. Useful for searching and segmenting data.',
    }),
    controlled: true,
    props: ({
      field,
    }): Omit<EuiComboBoxProps<string>, 'selectedOptions'> & FormattedComboBoxProps => ({
      selectedOptions: field?.value || [],
      isDisabled: readOnly,
      enableCopy: true,
    }),
  },
  [ConfigKey.TIMEOUT]: {
    fieldKey: ConfigKey.TIMEOUT,
    component: FieldNumber,
    label: i18n.translate('xpack.synthetics.monitorConfig.timeout.label', {
      defaultMessage: 'Timeout in seconds',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.timeout.helpText', {
      defaultMessage: 'The total time allowed for testing the connection and exchanging data.',
    }),
    props: (): EuiFieldNumberProps => ({
      'data-test-subj': 'syntheticsMonitorConfigTimeout',
      min: 1,
      step: 'any',
      readOnly,
    }),
    dependencies: [ConfigKey.SCHEDULE],
    validation: ([schedule]) => ({
      validate: {
        validTimeout: (value) => {
          switch (true) {
            case value < 0:
              return i18n.translate('xpack.synthetics.monitorConfig.timeout.greaterThan0Error', {
                defaultMessage: 'Timeout must be greater than or equal to 0.',
              });
            case value > parseFloat((schedule as MonitorFields[ConfigKey.SCHEDULE]).number) * 60:
              return i18n.translate('xpack.synthetics.monitorConfig.timeout.scheduleError', {
                defaultMessage: 'Timeout must be less than the monitor frequency.',
              });
            case !Boolean(`${value}`.match(FLOATS_ONLY)):
              return i18n.translate('xpack.synthetics.monitorConfig.timeout.formatError', {
                defaultMessage: 'Timeout is invalid.',
              });
            default:
              return true;
          }
        },
      },
    }),
  },
  [ConfigKey.APM_SERVICE_NAME]: {
    fieldKey: ConfigKey.APM_SERVICE_NAME,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.apmServiceName.label', {
      defaultMessage: 'APM service name',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.apmServiceName.helpText', {
      defaultMessage:
        'Corresponds to the service.name ECS field from APM. Set this to enable integrations between APM and Synthetics data.',
    }),
    controlled: true,
    props: (): EuiFieldTextProps => ({
      'data-test-subj': 'syntheticsMonitorConfigAPMServiceName',
      readOnly,
    }),
  },
  [ConfigKey.NAMESPACE]: {
    fieldKey: ConfigKey.NAMESPACE,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.namespace.label', {
      defaultMessage: 'Data stream namespace',
    }),
    helpText: (
      <span>
        {i18n.translate('xpack.synthetics.monitorConfig.namespace.helpText', {
          defaultMessage:
            "Change the default namespace. This setting changes the name of the monitor's data stream. ",
        })}
        <EuiLink
          data-test-subj="syntheticsFIELDLearnMoreLink"
          href="https://www.elastic.co/guide/en/fleet/current/data-streams.html"
          target="_blank"
        >
          {i18n.translate('xpack.synthetics.monitorConfig.namespace.learnMore', {
            defaultMessage: 'Learn more',
          })}
        </EuiLink>
      </span>
    ),
    controlled: true,
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
    validation: () => ({
      validate: {
        validNamespace: (namespace) => isValidNamespace(namespace).error,
      },
    }),
  },
  [ConfigKey.MAX_REDIRECTS]: {
    fieldKey: ConfigKey.MAX_REDIRECTS,
    component: FieldNumber,
    label: i18n.translate('xpack.synthetics.monitorConfig.maxRedirects.label', {
      defaultMessage: 'Max redirects',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.maxRedirects.helpText', {
      defaultMessage: 'The total number of redirects to follow.',
    }),
    props: (): EuiFieldNumberProps => ({
      'data-test-subj': 'syntheticsMonitorConfigMaxRedirects',
      min: 0,
      max: 10,
      step: 1,
      readOnly,
    }),
    validation: () => ({
      min: 0,
      max: 10,
      pattern: WHOLE_NUMBERS_ONLY,
    }),
    error: i18n.translate('xpack.synthetics.monitorConfig.maxRedirects.error', {
      defaultMessage: 'Max redirects is invalid.',
    }),
  },
  [ConfigKey.WAIT]: {
    fieldKey: ConfigKey.WAIT,
    component: FieldNumber,
    label: i18n.translate('xpack.synthetics.monitorConfig.wait.label', {
      defaultMessage: 'Wait',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.wait.helpText', {
      defaultMessage:
        'The duration to wait before emitting another ICMP Echo Request if no response is received.',
    }),
    props: (): EuiFieldNumberProps => ({
      'data-test-subj': 'syntheticsMonitorConfigWait',
      min: 1,
      step: 1,
      readOnly,
    }),
    validation: () => ({
      min: 1,
      pattern: WHOLE_NUMBERS_ONLY,
    }),
    error: i18n.translate('xpack.synthetics.monitorConfig.wait.error', {
      defaultMessage: 'Wait duration is invalid.',
    }),
  },
  [ConfigKey.USERNAME]: {
    fieldKey: ConfigKey.USERNAME,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.username.label', {
      defaultMessage: 'Username',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.username.helpText', {
      defaultMessage: 'Username for authenticating with the server.',
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  [ConfigKey.PASSWORD]: {
    fieldKey: ConfigKey.PASSWORD,
    component: FieldPassword,
    label: i18n.translate('xpack.synthetics.monitorConfig.password.label', {
      defaultMessage: 'Password',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.password.helpText', {
      defaultMessage: 'Password for authenticating with the server.',
    }),
    props: (): EuiFieldPasswordProps => ({
      readOnly,
    }),
  },
  [ConfigKey.PROXY_URL]: {
    fieldKey: ConfigKey.PROXY_URL,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.proxyUrl.label', {
      defaultMessage: 'Proxy URL',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.proxyUrl.helpText', {
      defaultMessage: 'HTTP proxy URL',
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  [ConfigKey.REQUEST_METHOD_CHECK]: {
    fieldKey: ConfigKey.REQUEST_METHOD_CHECK,
    component: Select,
    label: i18n.translate('xpack.synthetics.monitorConfig.requestMethod.label', {
      defaultMessage: 'Request method',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.requestMethod.helpText', {
      defaultMessage: 'The HTTP method to use.',
    }),
    props: (): EuiSelectProps => ({
      options: Object.keys(HTTPMethod).map((method) => ({
        value: method,
        text: method,
      })),
      disabled: readOnly,
    }),
  },
  [ConfigKey.REQUEST_HEADERS_CHECK]: {
    fieldKey: ConfigKey.REQUEST_HEADERS_CHECK,
    component: HeaderField,
    label: i18n.translate('xpack.synthetics.monitorConfig.requestHeaders.label', {
      defaultMessage: 'Request headers',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.requestHeaders.helpText', {
      defaultMessage:
        'A dictionary of additional HTTP headers to send. By default the client will set the User-Agent header to identify itself.',
    }),
    controlled: true,
    validation: () => ({
      validate: {
        validHeaders: (headers) =>
          validateHeaders(headers)
            ? i18n.translate('xpack.synthetics.monitorConfig.requestHeaders.error', {
                defaultMessage: 'Header key must be a valid HTTP token.',
              })
            : true,
      },
    }),
    dependencies: [ConfigKey.REQUEST_BODY_CHECK],
    error: i18n.translate('xpack.synthetics.monitorConfig.requestHeaders.error', {
      defaultMessage: 'Header key must be a valid HTTP token.',
    }),
    // contentMode is optional for other implementations, but required for this implementation of this field
    props: ({
      dependencies,
    }): HeaderFieldProps & { contentMode: HeaderFieldProps['contentMode'] } => {
      const [requestBody] = dependencies;
      return {
        'data-test-subj': 'syntheticsHeaderFieldRequestHeaders',
        readOnly,
        contentMode: !!(requestBody as RequestBodyCheck)?.value
          ? (requestBody as RequestBodyCheck).type
          : undefined,
      };
    },
  },
  [ConfigKey.REQUEST_BODY_CHECK]: {
    fieldKey: ConfigKey.REQUEST_BODY_CHECK,
    component: RequestBodyField,
    label: i18n.translate('xpack.synthetics.monitorConfig.requestBody.label', {
      defaultMessage: 'Request body',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.requestBody.helpText', {
      defaultMessage: 'Request body content.',
    }),
    controlled: true,
    props: (): RequestBodyFieldProps => ({
      readOnly,
    }),
  },
  [ConfigKey.RESPONSE_HEADERS_INDEX]: {
    fieldKey: ConfigKey.RESPONSE_HEADERS_INDEX,
    component: Checkbox,
    helpText: (
      <>
        <FormattedMessage
          id="xpack.synthetics.monitorConfig.indexResponseHeaders.helpText"
          defaultMessage="Controls the indexing of the HTTP response headers to "
        />
        <EuiCode>{'http.response.body.headers'}</EuiCode>
      </>
    ),
    props: (): Omit<EuiCheckboxProps, ControlledFieldProp> => ({
      label: i18n.translate('xpack.synthetics.monitorConfig.indexResponseHeaders.label', {
        defaultMessage: 'Index response headers',
      }),
      id: 'syntheticsMonitorConfigResponseHeadersIndex', // checkbox needs an id or it won't work,
      disabled: readOnly,
    }),
    controlled: true,
  },
  [ConfigKey.RESPONSE_BODY_INDEX]: {
    fieldKey: ConfigKey.RESPONSE_BODY_INDEX,
    component: ResponseBodyIndexField,
    helpText: (
      <>
        <FormattedMessage
          id="xpack.synthetics.monitorConfig.indexResponseBody.helpText"
          defaultMessage="Controls the indexing of the HTTP response body contents to"
        />
        <EuiCode>{'http.response.body.contents'}</EuiCode>
      </>
    ),
    props: (): ResponseBodyIndexFieldProps => ({
      readOnly,
    }),
    controlled: true,
  },
  [ConfigKey.RESPONSE_STATUS_CHECK]: {
    fieldKey: ConfigKey.RESPONSE_STATUS_CHECK,
    component: FormattedComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseStatusCheck.label', {
      defaultMessage: 'Response status equals',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseStatusCheck.helpText', {
      defaultMessage:
        'A list of expected status codes. Press enter to add a new code. 4xx and 5xx codes are considered down by default. Other codes are considered up.',
    }),
    controlled: true,
    props: ({ field }): EuiComboBoxProps<string> => ({
      selectedOptions: field?.value,
      isDisabled: readOnly,
    }),
    validation: () => ({
      validate: {
        validResponseStatusCheck: (value) => {
          const validateFn = validate[MonitorTypeEnum.HTTP][ConfigKey.RESPONSE_STATUS_CHECK];
          if (validateFn) {
            return !validateFn({
              [ConfigKey.RESPONSE_STATUS_CHECK]: value,
            });
          }
        },
      },
    }),
    error: i18n.translate('xpack.synthetics.monitorConfig.responseStatusCheck.error', {
      defaultMessage: 'Status code must contain digits only.',
    }),
  },
  [ConfigKey.RESPONSE_HEADERS_CHECK]: {
    fieldKey: ConfigKey.RESPONSE_HEADERS_CHECK,
    component: HeaderField,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseHeadersCheck.label', {
      defaultMessage: 'Response headers contain',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseHeadersCheck.helpText', {
      defaultMessage: 'A list of expected response headers.',
    }),
    controlled: true,
    validation: () => ({
      validate: {
        validHeaders: (headers) =>
          validateHeaders(headers)
            ? i18n.translate('xpack.synthetics.monitorConfig.responseHeadersCheck.error', {
                defaultMessage: 'Header key must be a valid HTTP token.',
              })
            : true,
      },
    }),
    props: (): HeaderFieldProps => ({
      'data-test-subj': 'syntheticsHeaderFieldResponseHeaders',
      readOnly,
    }),
  },
  [ConfigKey.RESPONSE_BODY_CHECK_POSITIVE]: {
    fieldKey: ConfigKey.RESPONSE_BODY_CHECK_POSITIVE,
    component: FormattedComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseBodyCheck.label', {
      defaultMessage: 'Response body contains',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseBodyCheck.helpText', {
      defaultMessage:
        'A list of regular expressions to match the body output. Press enter to add a new expression. Only a single expression needs to match.',
    }),
    controlled: true,
    props: ({ field }): EuiComboBoxProps<string> => ({
      selectedOptions: field?.value,
      isDisabled: readOnly,
    }),
  },
  [ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE]: {
    fieldKey: ConfigKey.RESPONSE_BODY_CHECK_NEGATIVE,
    component: FormattedComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseBodyCheckNegative.label', {
      defaultMessage: 'Response body does not contain',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseBodyCheckNegative.helpText', {
      defaultMessage:
        'A list of regular expressions to match the the body output negatively. Press enter to add a new expression. Return match failed if single expression matches.',
    }),
    controlled: true,
    props: ({ field }): EuiComboBoxProps<string> => ({
      selectedOptions: field?.value,
      isDisabled: readOnly,
    }),
  },
  [ConfigKey.RESPONSE_RECEIVE_CHECK]: {
    fieldKey: ConfigKey.RESPONSE_RECEIVE_CHECK,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseReceiveCheck.label', {
      defaultMessage: 'Response contains',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseReceiveCheck.helpText', {
      defaultMessage: 'The expected remote host response.',
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  ['proxy_url__tcp']: {
    fieldKey: ConfigKey.PROXY_URL,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.proxyURLTCP.label', {
      defaultMessage: 'Proxy URL',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.proxyURLTCP.helpText', {
      defaultMessage:
        'The URL of the SOCKS5 proxy to use when connecting to the server. The value must be a URL with a scheme of socks5://.',
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  [ConfigKey.REQUEST_SEND_CHECK]: {
    fieldKey: ConfigKey.REQUEST_SEND_CHECK,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.requestSendCheck.label', {
      defaultMessage: 'Request payload',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.requestSendCheck.helpText', {
      defaultMessage: 'A payload string to send to the remote host.',
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  ['source.inline']: {
    fieldKey: 'source.inline',
    required: true,
    component: Source,
    ariaLabel: i18n.translate('xpack.synthetics.monitorConfig.monitorScript.label', {
      defaultMessage: 'Monitor script',
    }),
    controlled: true,
    props: ({ isEdit }) => ({
      isEditFlow: isEdit,
    }),
    validation: () => ({
      validate: {
        validScript: (value) => {
          if (!value.script) {
            return i18n.translate('xpack.synthetics.monitorConfig.monitorScript.error', {
              defaultMessage: 'Monitor script is required',
            });
          }

          // return false if script contains import or require statement
          if (
            value.script?.includes('import ') ||
            value.script?.includes('require(') ||
            value.script?.includes('journey(')
          ) {
            return i18n.translate('xpack.synthetics.monitorConfig.monitorScript.invalid', {
              defaultMessage:
                'Monitor script is invalid. Inline scripts cannot be full journey scripts, they may only contain step definitions.',
            });
          }
          // should contain at least one step
          if (value.script && !value.script?.includes('step(')) {
            return i18n.translate('xpack.synthetics.monitorConfig.monitorScript.invalid.oneStep', {
              defaultMessage:
                'Monitor script is invalid. Inline scripts must contain at least one step definition.',
            });
          }
          return true;
        },
      },
    }),
  },
  [ConfigKey.PARAMS]: {
    fieldKey: ConfigKey.PARAMS,
    label: i18n.translate('xpack.synthetics.monitorConfig.params.label', {
      defaultMessage: 'Parameters',
    }),
    controlled: true,
    component: JSONEditor,
    props: (): JSONCodeEditorProps => ({
      id: 'syntheticsMonitorConfigParams',
      height: '100px',
      ariaLabel: i18n.translate('xpack.synthetics.monitorConfig.paramsAria.label', {
        defaultMessage: 'Monitor params code editor',
      }),
      readOnly,
    }),
    helpText: (
      <FormattedMessage
        id="xpack.synthetics.monitorConfig.params.helpText"
        defaultMessage="Use JSON to define parameters that can be referenced in your script with {paramsValue}"
        values={{
          paramsValue: <EuiCode>{'params.value'}</EuiCode>,
        }}
      />
    ),
    validation: () => ({
      validate: {
        validParams: (value) => {
          const validateFn = validate[MonitorTypeEnum.BROWSER][ConfigKey.PARAMS];
          if (validateFn) {
            return validateFn({
              [ConfigKey.PARAMS]: value,
            })
              ? i18n.translate('xpack.synthetics.monitorConfig.params.error', {
                  defaultMessage: 'Invalid JSON format',
                })
              : true;
          }

          return true;
        },
      },
    }),
  },
  [ConfigKey.LABELS]: {
    fieldKey: ConfigKey.LABELS,
    label: i18n.translate('xpack.synthetics.monitorConfig.meta.label', {
      defaultMessage: 'Label fields',
    }),
    controlled: true,
    component: KeyValuePairsField,
    helpText: i18n.translate('xpack.synthetics.monitorConfig.meta.helpText', {
      defaultMessage:
        'List of key-value pairs that will be sent with each monitor event. Useful for adding custom metadata to your monitor.',
    }),
    props: ({ field, setValue, trigger }): KeyValuePairsFieldProps => ({
      readOnly,
      keyLabel: i18n.translate('xpack.synthetics.monitorConfig.field.key.label', {
        defaultMessage: 'Field',
      }),
      valueLabel: i18n.translate('xpack.synthetics.monitorConfig.field.value.label', {
        defaultMessage: 'Value',
      }),
      addPairControlLabel: i18n.translate('xpack.synthetics.monitorConfig.metaField.label', {
        defaultMessage: 'Add label field',
      }),
      onChange: async (pairs) => {
        const value: Record<string, string> = {};
        pairs.forEach((pair) => {
          const [fieldKey, fieldValue] = pair;
          value[fieldKey] = String(fieldValue);
        });
        if (!isEqual(value, field?.value)) {
          setValue(ConfigKey.LABELS, value);
          await trigger(ConfigKey.LABELS);
        }
      },
      defaultPairs: Object.entries(field?.value || {}),
    }),
    validation: () => ({
      validate: {
        validBodyJSON: (value: Record<string, string>) => {
          if (Object.entries(value).some((check) => !check[0] || !check[1])) {
            return i18n.translate('xpack.synthetics.monitorConfig.metaFields.error', {
              defaultMessage:
                'This meta fields is not valid. Make sure that both the field and value are defined.',
            });
          }
          return true;
        },
      },
    }),
  },
  isTLSEnabled: {
    fieldKey: 'isTLSEnabled',
    component: Switch,
    controlled: true,
    props: ({ setValue, field }): EuiSwitchProps => {
      return {
        id: 'syntheticsMontiorConfigIsTLSEnabledSwitch',
        label: i18n.translate('xpack.synthetics.monitorConfig.customTLS.label', {
          defaultMessage: 'Use custom TLS configuration',
        }),
        checked: field?.value || false,
        onChange: (event) => {
          setValue('isTLSEnabled', event.target.checked);
        },
        disabled: readOnly,
      };
    },
  },
  [ConfigKey.TLS_VERIFICATION_MODE]: {
    fieldKey: ConfigKey.TLS_VERIFICATION_MODE,
    component: Select,
    label: i18n.translate('xpack.synthetics.monitorConfig.verificationMode.label', {
      defaultMessage: 'Verification mode',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.verificationMode.helpText', {
      defaultMessage:
        'Verifies that the provided certificate is signed by a trusted authority (CA) and also verifies that the server’s hostname (or IP address) matches the names identified within the certificate. If the Subject Alternative Name is empty, it returns an error.',
    }),
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: (): EuiSelectProps => ({
      options: Object.values(VerificationMode).map((method) => ({
        value: method,
        text: method.toUpperCase(),
      })),
      disabled: readOnly,
    }),
  },
  [ConfigKey.TLS_VERSION]: {
    fieldKey: ConfigKey.TLS_VERSION,
    component: ComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.tlsVersion.label', {
      defaultMessage: 'Supported TLS protocols',
    }),
    controlled: true,
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: ({ field, setValue, trigger }): EuiComboBoxProps<TLSVersion> => {
      return {
        options: Object.values(TLSVersion).map((version) => ({
          label: version,
        })),
        selectedOptions: Object.values(field?.value || []).map((version) => ({
          label: version as TLSVersion,
        })),
        onChange: async (updatedValues: Array<EuiComboBoxOptionOption<TLSVersion>>) => {
          setValue(
            ConfigKey.TLS_VERSION,
            updatedValues.map((option) => option.label as TLSVersion)
          );
          await trigger(ConfigKey.TLS_VERSION);
        },
        isDisabled: readOnly,
      };
    },
  },
  [ConfigKey.TLS_CERTIFICATE_AUTHORITIES]: {
    fieldKey: ConfigKey.TLS_CERTIFICATE_AUTHORITIES,
    component: TextArea,
    label: i18n.translate('xpack.synthetics.monitorConfig.certificateAuthorities.label', {
      defaultMessage: 'Certificate authorities',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.certificateAuthorities.helpText', {
      defaultMessage: 'PEM-formatted custom certificate authorities.',
    }),
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: (): EuiTextAreaProps => ({
      readOnly,
    }),
  },
  [ConfigKey.TLS_CERTIFICATE]: {
    fieldKey: ConfigKey.TLS_CERTIFICATE,
    component: TextArea,
    label: i18n.translate('xpack.synthetics.monitorConfig.clientCertificate.label', {
      defaultMessage: 'Client certificate',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.clientCertificate.helpText', {
      defaultMessage: 'PEM-formatted certificate for TLS client authentication.',
    }),
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: (): EuiTextAreaProps => ({
      readOnly,
    }),
  },
  [ConfigKey.TLS_KEY]: {
    fieldKey: ConfigKey.TLS_KEY,
    component: TextArea,
    label: i18n.translate('xpack.synthetics.monitorConfig.clientKey.label', {
      defaultMessage: 'Client key',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.clientKey.helpText', {
      defaultMessage: 'PEM-formatted certificate key for TLS client authentication.',
    }),
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: (): EuiTextAreaProps => ({
      readOnly,
    }),
  },
  [ConfigKey.TLS_KEY_PASSPHRASE]: {
    fieldKey: ConfigKey.TLS_KEY_PASSPHRASE,
    component: FieldPassword,
    label: i18n.translate('xpack.synthetics.monitorConfig.clientKeyPassphrase.label', {
      defaultMessage: 'Client key passphrase',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.clientKeyPassphrase.helpText', {
      defaultMessage: 'Certificate key passphrase for TLS client authentication.',
    }),
    hidden: (dependencies) => {
      const [isTLSEnabled] = dependencies;
      return !Boolean(isTLSEnabled);
    },
    dependencies: ['isTLSEnabled'],
    props: (): EuiFieldPasswordProps => ({
      readOnly,
    }),
  },
  [ConfigKey.SCREENSHOTS]: {
    fieldKey: ConfigKey.SCREENSHOTS,
    component: ButtonGroup,
    label: i18n.translate('xpack.synthetics.monitorConfig.screenshotOptions.label', {
      defaultMessage: 'Screenshot options',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.screenshotOptions.helpText', {
      defaultMessage: 'Set this option to manage the screenshots captured by the synthetics agent.',
    }),
    controlled: true,
    props: ({ field, setValue }): Omit<EuiButtonGroupProps, 'type'> => ({
      idSelected: field?.value,
      onChange: (option: string) => setValue(ConfigKey.SCREENSHOTS, option),
      options: Object.values(ScreenshotOption).map((option) => ({
        id: option,
        label: option.replace(/-/g, ' '),
      })),
      legend: i18n.translate('xpack.synthetics.monitorConfig.screenshotOptions.label', {
        defaultMessage: 'Screenshot options',
      }),
      css: {
        textTransform: 'capitalize',
      },
      isDisabled: readOnly,
    }),
  },
  [ConfigKey.TEXT_ASSERTION]: {
    fieldKey: ConfigKey.TEXT_ASSERTION,
    component: FieldText,
    label: i18n.translate('xpack.synthetics.monitorConfig.textAssertion.label', {
      defaultMessage: 'Text assertion',
    }),
    required: false,
    helpText: i18n.translate('xpack.synthetics.monitorConfig.textAssertion.helpText', {
      defaultMessage: 'Consider the page loaded when the specified text is rendered.',
    }),
    validation: () => ({
      required: false,
    }),
    props: (): EuiFieldTextProps => ({
      readOnly,
    }),
  },
  [ConfigKey.THROTTLING_CONFIG]: {
    fieldKey: ConfigKey.THROTTLING_CONFIG,
    component: ThrottlingWrapper,
    label: (
      <FormattedMessage
        id="xpack.synthetics.monitorConfig.throttlingDisabled.label"
        defaultMessage="Connection profile ( {icon} Important information about throttling: {link})"
        values={{
          icon: <EuiIcon type="warning" color="warning" size="s" aria-hidden={true} />,
          link: (
            <EuiLink
              data-test-subj="syntheticsFIELDNoticeLink"
              href={'https://github.com/elastic/synthetics/blob/main/docs/throttling.md'}
              target="_blank"
            >
              {i18n.translate('xpack.synthetics.monitorConfig.throttlingDisabled.link', {
                defaultMessage: 'notice',
              })}
            </EuiLink>
          ),
        }}
      />
    ),
    required: true,
    controlled: true,
    helpText: i18n.translate('xpack.synthetics.monitorConfig.throttling.helpText', {
      defaultMessage: 'Simulate network throttling (download, upload, latency).',
    }),
    props: ({ formState }): Partial<ThrottlingConfigFieldProps> => {
      return {
        options: PROFILE_OPTIONS,
        readOnly,
        disabled: false,
        initialValue: formState.defaultValues?.[ConfigKey.THROTTLING_CONFIG] as ThrottlingConfig,
      };
    },
    validation: () => ({
      required: true,
    }),
  },
  [ConfigKey.PLAYWRIGHT_OPTIONS]: {
    fieldKey: ConfigKey.PLAYWRIGHT_OPTIONS,
    component: JSONEditor,
    label: i18n.translate('xpack.synthetics.monitorConfig.playwrightOptions.label', {
      defaultMessage: 'Playwright options',
    }),
    helpText: (
      <span>
        {i18n.translate('xpack.synthetics.monitorConfig.playwrightOptions.helpText', {
          defaultMessage: 'Configure Playwright agent with custom options. ',
        })}
        <EuiLink
          data-test-subj="syntheticsFIELDLearnMoreLink"
          href={kibanaService.coreStart.docLinks?.links?.observability?.syntheticsCommandReference}
          target="_blank"
        >
          {i18n.translate('xpack.synthetics.monitorConfig.playwrightOptions.learnMore', {
            defaultMessage: 'Learn more',
          })}
        </EuiLink>
      </span>
    ),
    ariaLabel: i18n.translate(
      'xpack.synthetics.monitorConfig.playwrightOptions.codeEditor.json.ariaLabel',
      {
        defaultMessage: 'Playwright options JSON code editor',
      }
    ),
    controlled: true,
    required: false,
    props: (): JSONCodeEditorProps => ({
      ariaLabel: i18n.translate(
        'xpack.synthetics.monitorConfig.playwrightOptions.codeEditor.json.ariaLabel',
        {
          defaultMessage: 'Playwright options JSON code editor',
        }
      ),
      readOnly,
      id: 'syntheticsPlaywrightOptionsJSONCodeEditor',
    }),
    validation: () => ({
      validate: {
        validPlaywrightOptions: (value) => {
          const validateFn = validate[MonitorTypeEnum.BROWSER][ConfigKey.PLAYWRIGHT_OPTIONS];
          if (validateFn) {
            return validateFn({
              [ConfigKey.PLAYWRIGHT_OPTIONS]: value,
            })
              ? i18n.translate('xpack.synthetics.monitorConfig.playwrightOptions.error', {
                  defaultMessage: 'Invalid JSON format',
                })
              : true;
          }

          return true;
        },
      },
    }),
  },
  [ConfigKey.IGNORE_HTTPS_ERRORS]: {
    fieldKey: ConfigKey.IGNORE_HTTPS_ERRORS,
    component: Switch,
    controlled: true,
    helpText: (
      <span>
        {i18n.translate('xpack.synthetics.monitorConfig.ignoreHttpsErrors.helpText', {
          defaultMessage:
            'Turns off TLS/SSL validation in the synthetics browser. This is useful for testing sites that use self-signed certificates.',
        })}
      </span>
    ),
    props: ({ setValue }) => ({
      id: 'syntheticsMontiorConfigIgnoreHttpsErrors',
      label: i18n.translate('xpack.synthetics.monitorConfig.ignoreHttpsErrors.label', {
        defaultMessage: 'Ignore HTTPS errors',
      }),
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        setValue(ConfigKey.IGNORE_HTTPS_ERRORS, !!event.target.checked);
      },
      disabled: readOnly,
    }),
  },
  [ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST]: {
    fieldKey: ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST,
    component: TextArea,
    label: i18n.translate('xpack.synthetics.monitorConfig.certificateErrorSpkiAllowlist.label', {
      defaultMessage: 'Certificate error SPKI allowlist',
    }),
    helpText: i18n.translate(
      'xpack.synthetics.monitorConfig.certificateErrorSpkiAllowlist.helpText',
      {
        defaultMessage:
          'PEM certificates whose public keys (SPKI) are allowlisted so Chromium bypasses certificate errors for matching presented certificates. This does not add a CA to Chromium’s trust store. Enter one PEM certificate per entry; multiple certificates can be provided as separate PEM blocks.',
      }
    ),
    controlled: true,
    props: ({ setValue, field }): EuiTextAreaProps => ({
      id: 'syntheticsMonitorConfigCertificateErrorSpkiAllowlist',
      readOnly,
      value: Array.isArray(field?.value) ? field.value.join('\n\n') : field?.value || '',
      onChange: (event) => {
        setValue(
          ConfigKey.CERTIFICATE_ERROR_SPKI_ALLOWLIST,
          parsePemCertificateEntries(event.target.value)
        );
      },
      placeholder: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
    }),
  },
  [ConfigKey.SYNTHETICS_ARGS]: {
    fieldKey: ConfigKey.SYNTHETICS_ARGS,
    component: ComboBox as React.ComponentType<EuiComboBoxProps<string>>,
    controlled: true,
    label: i18n.translate('xpack.synthetics.monitorConfig.syntheticsArgs.label', {
      defaultMessage: 'Synthetics args',
    }),
    helpText: (
      <span>
        {i18n.translate('xpack.synthetics.monitorConfig.syntheticsArgs.helpText', {
          defaultMessage:
            'Extra arguments to pass to the synthetics agent package. Takes a list of strings. This is useful in rare scenarios, and should not ordinarily need to be set.',
        })}
      </span>
    ),
    props: ({ setValue, field, trigger }): EuiComboBoxProps<string> => ({
      id: 'syntheticsMontiorConfigSyntheticsArgs',
      selectedOptions: Object.values(field?.value || []).map((arg) => ({
        label: arg,
      })),
      onChange: async (updatedValues: Array<EuiComboBoxOptionOption<string>>) => {
        setValue(
          ConfigKey.SYNTHETICS_ARGS,
          updatedValues.map((option) => option.label)
        );
        await trigger(ConfigKey.SYNTHETICS_ARGS);
      },
      onCreateOption: (newValue: string) => {
        setValue(ConfigKey.SYNTHETICS_ARGS, [...(field?.value || []), newValue]);
      },
      isDisabled: readOnly,
    }),
  },
  [ConfigKey.MODE]: {
    fieldKey: ConfigKey.MODE,
    component: Select,
    label: i18n.translate('xpack.synthetics.monitorConfig.mode.label', {
      defaultMessage: 'Mode',
    }),
    helpText: (
      <FormattedMessage
        id="xpack.synthetics.monitorConfig.syntheticsArgs.mode.helpText"
        defaultMessage="If {any}, the monitor pings only one IP address for a hostname. If {all}, the monitor pings all resolvable IPs for a hostname. {all} is useful if you are using a DNS-load balancer and want to ping every IP address for the specified hostname."
        values={{
          all: <EuiCode>{'all'}</EuiCode>,
          any: <EuiCode>{'any'}</EuiCode>,
        }}
      />
    ),
    props: (): EuiSelectProps => ({
      options: Object.values(Mode).map((value) => ({
        value,
        text: value,
      })),
      disabled: readOnly,
    }),
  },
  [ConfigKey.RESPONSE_BODY_MAX_BYTES]: {
    fieldKey: ConfigKey.RESPONSE_BODY_MAX_BYTES,
    component: FieldNumber,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseBodyMaxBytes.label', {
      defaultMessage: 'Response body max bytes',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseBodyMaxBytes.helpText', {
      defaultMessage: 'Controls the maximum size of the stored body contents.',
    }),
    hidden: (dependencies) => {
      const [responseBodyIndex] = dependencies || [];
      return responseBodyIndex === ResponseBodyIndexPolicy.NEVER;
    },
    props: (): EuiFieldNumberProps => ({
      'data-test-subj': 'syntheticsMonitorConfigMaxBytes',
      min: 1,
      step: 'any',
      readOnly,
    }),
    dependencies: [ConfigKey.RESPONSE_BODY_INDEX],
  },
  [ConfigKey.IPV4]: {
    fieldKey: ConfigKey.IPV4, // also controls ipv6
    component: ComboBox,
    label: i18n.translate('xpack.synthetics.monitorConfig.ipv4.label', {
      defaultMessage: 'IP protocols',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.ipv4.helpText', {
      defaultMessage: 'IP protocols to use when pinging the remote host.',
    }),
    controlled: true,
    dependencies: [ConfigKey.IPV6],
    props: ({ field, setValue, trigger, dependencies }): EuiComboBoxProps<string> => {
      const [ipv6] = dependencies;
      const ipv4 = field?.value;
      const values: string[] = [];
      if (ipv4) {
        values.push('IPv4');
      }
      if (ipv6) {
        values.push('IPv6');
      }
      return {
        options: [
          {
            label: 'IPv4',
          },
          {
            label: 'IPv6',
          },
        ],
        selectedOptions: values.map((version) => ({
          label: version,
        })),
        onChange: async (updatedValues: Array<EuiComboBoxOptionOption<string>>) => {
          setValue(
            ConfigKey.IPV4,
            updatedValues.some((value) => value.label === 'IPv4')
          );
          setValue(
            ConfigKey.IPV6,
            updatedValues.some((value) => value.label === 'IPv6')
          );
          await trigger([ConfigKey.IPV4, ConfigKey.IPV4]);
        },
        isDisabled: readOnly,
      };
    },
  },
  [ConfigKey.PROXY_HEADERS]: {
    fieldKey: ConfigKey.PROXY_HEADERS,
    component: HeaderField,
    label: i18n.translate('xpack.synthetics.monitorConfig.proxyHeaders.label', {
      defaultMessage: 'Proxy headers',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.proxyHeaders.helpText', {
      defaultMessage: 'Additional headers to send to proxies for CONNECT requests.',
    }),
    controlled: true,
    validation: () => ({
      validate: {
        validHeaders: (headers) =>
          validateHeaders(headers)
            ? i18n.translate('xpack.synthetics.monitorConfig.proxyHeaders.error', {
                defaultMessage: 'The header key must be a valid HTTP token.',
              })
            : true,
      },
    }),
    props: (): HeaderFieldProps => ({
      'data-test-subj': 'syntheticsHeaderFieldProxyHeaders',
      readOnly,
    }),
  },
  ['check.response.json']: {
    fieldKey: ConfigKey.RESPONSE_JSON_CHECK,
    component: KeyValuePairsField,
    label: i18n.translate('xpack.synthetics.monitorConfig.responseJSON.label', {
      defaultMessage: 'Response body contains JSON',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.responseJSON.helpText', {
      defaultMessage:
        'A list of expressions executed against the body when parsed as JSON. The body size must be less than or equal to 100 MiB.',
    }),
    controlled: true,
    props: ({ field, setValue, trigger }): KeyValuePairsFieldProps => ({
      readOnly,
      keyLabel: i18n.translate('xpack.synthetics.monitorConfig.responseJSON.key.label', {
        defaultMessage: 'Description',
      }),
      valueLabel: i18n.translate('xpack.synthetics.monitorConfig.responseJSON.value.label', {
        defaultMessage: 'Expression',
      }),
      addPairControlLabel: i18n.translate(
        'xpack.synthetics.monitorConfig.responseJSON.addPair.label',
        {
          defaultMessage: 'Add expression',
        }
      ),
      onChange: async (pairs) => {
        const value: ResponseCheckJSON[] = pairs
          .map((pair) => {
            const [description, expression] = pair;
            return {
              description,
              expression,
            };
          })
          .filter((pair) => pair.description || pair.expression);
        if (!isEqual(value, field?.value)) {
          setValue(ConfigKey.RESPONSE_JSON_CHECK, value);
          await trigger(ConfigKey.RESPONSE_JSON_CHECK);
        }
      },
      defaultPairs: field?.value.map((check) => [check.description, check.expression]) || [],
    }),
    validation: () => ({
      validate: {
        validBodyJSON: (value: ResponseCheckJSON[]) => {
          if (value.some((check) => !check.expression || !check.description)) {
            return i18n.translate('xpack.synthetics.monitorConfig.responseJSON.error', {
              defaultMessage:
                "This JSON expression isn't valid. Make sure that both the label and expression are defined.",
            });
          }
          return true;
        },
      },
    }),
  },
  [ConfigKey.MAX_ATTEMPTS]: {
    fieldKey: ConfigKey.MAX_ATTEMPTS,
    component: Switch,
    controlled: true,
    props: ({ setValue, field, trigger }): EuiSwitchProps => ({
      disabled: readOnly,
      id: 'syntheticsMonitorConfigMaxAttempts',
      label: i18n.translate('xpack.synthetics.monitorConfig.retest.label', {
        defaultMessage: 'Enable retest on failure',
      }),
      checked: field?.value === 2,
      onChange: async (event) => {
        const isChecked = !!event.target.checked;
        setValue(ConfigKey.MAX_ATTEMPTS, isChecked ? 2 : 1);
        await trigger(ConfigKey.MAX_ATTEMPTS);
      },
      'data-test-subj': 'syntheticsEnableAttemptSwitch',
    }),
  },
  [ConfigKey.MAINTENANCE_WINDOWS]: {
    fieldKey: ConfigKey.MAINTENANCE_WINDOWS,
    label: i18n.translate('xpack.synthetics.monitorConfig.maintenanceWindows.label', {
      defaultMessage: 'Maintenance windows',
    }),
    controlled: true,
    component: MaintenanceWindowsFieldWrapper,
    helpText: i18n.translate('xpack.synthetics.monitorConfig.maintenanceWindows.helpText', {
      defaultMessage:
        'A list of maintenance windows to apply to this monitor. The monitor will not run during these times.',
    }),
    props: ({ field, setValue, trigger }): MaintenanceWindowsFieldProps => ({
      readOnly,
      onChange: async (value) => {
        setValue(ConfigKey.MAINTENANCE_WINDOWS, value);
        await trigger(ConfigKey.MAINTENANCE_WINDOWS);
      },
      fullWidth: true,
      value: field?.value as string[],
    }),
    labelAppend: <MaintenanceWindowsLink />,
  },
  [ConfigKey.KIBANA_SPACES]: {
    fieldKey: ConfigKey.KIBANA_SPACES,
    component: KibanaSpacesWrapper,
    label: i18n.translate('xpack.synthetics.monitorConfig.kibanaSpaces.label', {
      defaultMessage: 'Kibana spaces',
    }),
    helpText: i18n.translate('xpack.synthetics.monitorConfig.kibanaSpaces.helpText', {
      defaultMessage:
        ' Current space should always be part of list, unless All spaces is selected.',
    }),
    controlled: true,
    props: ({ field, setValue, trigger }): MonitorSpacesProps => ({
      readOnly,
      value: field?.value || [],
      onChange: async (spaces?: string[]) => {
        setValue(ConfigKey.KIBANA_SPACES, spaces);
        await trigger(ConfigKey.KIBANA_SPACES);
      },
    }),
  },
});
