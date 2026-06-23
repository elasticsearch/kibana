/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState, Fragment } from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { omit } from 'lodash';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiDescriptionList,
  EuiDescriptionListDescription,
  EuiDescriptionListTitle,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiIconTip,
  EuiLink,
  EuiTextColor,
  EuiTitle,
  EuiIcon,
  EuiToolTip,
  EuiPopover,
  EuiContextMenu,
  EuiCallOut,
  EuiSpacer,
} from '@elastic/eui';

import type { IndexManagementLocatorParams } from '@kbn/index-management-shared-types';
import { indexModeLabels } from '../../../../lib/index_mode_labels';
import { DiscoverLink } from '../../../../lib/discover_link';
import { getLifecycleValue, getRetentionPeriod } from '../../../../lib/data_streams';
import { SectionLoading } from '../../../../../shared_imports';
import type { Error } from '../../../../components';
import { SectionError, DataHealth } from '../../../../components';
import { useLoadDataStream } from '../../../../services/api';
import { DeleteDataStreamConfirmationModal } from '../delete_data_stream_confirmation_modal';
import { EditDataRetentionModal } from '../edit_data_retention_modal';
import { ConfigureFailureStoreModal } from '../configure_failure_store_modal';
import { humanizeTimeStamp } from '../humanize_time_stamp';
import { ILM_PAGES_POLICY_EDIT } from '../../../../constants';
import { isNextGenIlm, isNextGenDsl } from '../../../../lib/data_streams';
import { useAppContext } from '../../../../app_context';
import { DataStreamsBadges } from '../data_stream_badges';
import { useIlmLocator } from '../../../../services/use_ilm_locator';
import { StreamsPromotion } from './streams_promotion';
import { INDEX_MANAGEMENT_LOCATOR_ID } from '../../../../..';
import { DataRetentionValue } from '../data_retention_value';
import { formatByteSizeString } from '../../../../lib/format_bytes';

interface Detail {
  name: string;
  toolTip: string;
  content: any;
  dataTestSubj: string;
}
interface DetailsListProps {
  details: Detail[];
}

const DetailsList: React.FunctionComponent<DetailsListProps> = ({ details }) => {
  const descriptionListItems = details.map((detail, index) => {
    const { name, toolTip, content, dataTestSubj } = detail;

    return (
      <Fragment key={`${name}-${index}`}>
        <EuiDescriptionListTitle>
          <EuiFlexGroup alignItems="center" gutterSize="s">
            <EuiFlexItem grow={false}>{name}</EuiFlexItem>

            <EuiFlexItem grow={false}>
              {toolTip && <EuiIconTip content={toolTip} position="top" />}
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiDescriptionListTitle>

        <EuiDescriptionListDescription data-test-subj={dataTestSubj}>
          {content}
        </EuiDescriptionListDescription>
      </Fragment>
    );
  });

  const midpoint = Math.ceil(descriptionListItems.length / 2);
  const descriptionListColumnOne = descriptionListItems.slice(0, midpoint);
  const descriptionListColumnTwo = descriptionListItems.slice(
    midpoint,
    descriptionListItems.length
  );

  return (
    <EuiFlexGroup>
      <EuiFlexItem>
        <EuiDescriptionList textStyle="reverse">{descriptionListColumnOne}</EuiDescriptionList>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiDescriptionList textStyle="reverse">{descriptionListColumnTwo}</EuiDescriptionList>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

interface Props {
  dataStreamName: string;
  onClose: (shouldReload?: boolean) => void;
}

export const ConditionalWrap = ({
  condition,
  wrap,
  children,
}: {
  condition: boolean;
  wrap: (wrappedChildren: React.ReactNode) => JSX.Element;
  children: JSX.Element;
}): JSX.Element => (condition ? wrap(children) : children);

export const DataStreamDetailPanel: React.FunctionComponent<Props> = ({
  dataStreamName,
  onClose,
}) => {
  const [isManagePopOverOpen, setManagePopOver] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isEditingDataRetention, setIsEditingDataRetention] = useState<boolean>(false);
  const [isConfiguringFailureStore, setIsConfiguringFailureStore] = useState<boolean>(false);

  const { error, data: dataStream, isLoading } = useLoadDataStream(dataStreamName);

  const { url } = useAppContext();
  const locator = url.locators.get<IndexManagementLocatorParams>(INDEX_MANAGEMENT_LOCATOR_ID);
  const ilmPolicyLink = useIlmLocator(ILM_PAGES_POLICY_EDIT, dataStream?.ilmPolicyName);
  const { config, core } = useAppContext();
  let indicesLink;

  let content;

  if (isLoading) {
    content = (
      <SectionLoading>
        {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.loadingDataStreamDescription', {
          defaultMessage: 'Loading data stream',
        })}
      </SectionLoading>
    );
  } else if (error) {
    content = (
      <SectionError
        title={i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.loadingDataStreamErrorMessage', {
          defaultMessage: 'Error loading data stream',
        })}
        error={error as Error}
        data-test-subj="sectionError"
      />
    );
  } else if (dataStream) {
    const {
      health,
      indices,
      timeStampField,
      generation,
      indexTemplateName,
      ilmPolicyName,
      storageSize,
      maxTimeStamp,
      meteringStorageSize,
      meteringDocsCount,
      lifecycle,
      indexMode,
      hidden,
    } = dataStream;

    const getManagementDetails = () => {
      const managementDetails = [];

      if (ilmPolicyName) {
        managementDetails.push({
          name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.ilmPolicyTitle', {
            defaultMessage: 'Index lifecycle policy',
          }),
          toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.ilmPolicyToolTip', {
            defaultMessage: `The index lifecycle policy that manages the data in the data stream. `,
          }),
          content: isNextGenDsl(dataStream) ? (
            <EuiToolTip
              position="top"
              content={i18n.translate(
                'xpack.idxMgmt.dataStreamDetailPanel.ilmPolicyToolTipWarning',
                {
                  defaultMessage: `This data stream is not currently being managed by the ILM policy.`,
                }
              )}
            >
              <>
                {ilmPolicyLink ? (
                  <EuiLink
                    data-test-subj={'ilmPolicyLink'}
                    data-href={ilmPolicyLink}
                    onClick={() => core.application.navigateToUrl(ilmPolicyLink)}
                  >
                    <EuiTextColor color="subdued">{ilmPolicyName}</EuiTextColor>
                  </EuiLink>
                ) : (
                  ilmPolicyName
                )}
              </>
            </EuiToolTip>
          ) : (
            <>
              {ilmPolicyLink ? (
                <EuiLink
                  data-test-subj={'ilmPolicyLink'}
                  data-href={ilmPolicyLink}
                  onClick={() => core.application.navigateToUrl(ilmPolicyLink)}
                >
                  {ilmPolicyName}
                </EuiLink>
              ) : (
                ilmPolicyName
              )}
            </>
          ),
          dataTestSubj: 'ilmPolicyDetail',
        });
      }

      return managementDetails;
    };

    indicesLink = (
      <EuiLink
        href={
          locator?.getRedirectUrl({
            page: 'data_stream_index_list',
            dataStreamName,
          }) || ''
        }
      >
        {indices.length}
      </EuiLink>
    );

    const defaultDetails: Detail[] = [
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.healthTitle', {
          defaultMessage: 'Health',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.healthToolTip', {
          defaultMessage: `The health of the data stream's current backing indices.`,
        }),
        content: <DataHealth health={health} />,
        dataTestSubj: 'healthDetail',
      },
    ];

    // add either documents count and size or last updated and size
    if (config.enableSizeAndDocCount) {
      defaultDetails.push(
        {
          name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.meteringDocsCountTitle', {
            defaultMessage: 'Documents count',
          }),
          toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.meteringDocsCountToolTip', {
            defaultMessage: 'The number of documents in this data stream.',
          }),
          content: meteringDocsCount,
          dataTestSubj: 'docsCountDetail',
        },
        {
          name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeTitle', {
            defaultMessage: 'Storage size',
          }),
          toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeToolTip', {
            defaultMessage: `The total size of all shards in the data stream’s backing indices.`,
          }),
          content: formatByteSizeString(meteringStorageSize),
          dataTestSubj: 'meteringStorageSizeDetail',
        }
      );
    }
    if (config.enableDataStreamStats) {
      defaultDetails.push(
        {
          name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampTitle', {
            defaultMessage: 'Last updated',
          }),
          toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampToolTip', {
            defaultMessage: 'The most recent document to be added to the data stream.',
          }),
          content: maxTimeStamp ? (
            humanizeTimeStamp(maxTimeStamp)
          ) : (
            <em>
              {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.maxTimeStampNoneMessage', {
                defaultMessage: `Never`,
              })}
            </em>
          ),
          dataTestSubj: 'lastUpdatedDetail',
        },
        {
          name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeTitle', {
            defaultMessage: 'Storage size',
          }),
          toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.storageSizeToolTip', {
            defaultMessage: `The total size of all shards in the data stream’s backing indices.`,
          }),
          content: formatByteSizeString(storageSize),
          dataTestSubj: 'storageSizeDetail',
        }
      );
    }

    defaultDetails.push(
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indicesTitle', {
          defaultMessage: 'Indices',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indicesToolTip', {
          defaultMessage: `The data stream's current backing indices.`,
        }),
        content: indicesLink,
        dataTestSubj: 'indicesDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.timestampFieldTitle', {
          defaultMessage: 'Timestamp field',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.timestampFieldToolTip', {
          defaultMessage: 'The timestamp field shared by all documents in the data stream.',
        }),
        content: timeStampField.name,
        dataTestSubj: 'timestampDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.generationTitle', {
          defaultMessage: 'Generation',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.generationToolTip', {
          defaultMessage: 'The number of backing indices generated for the data stream.',
        }),
        content: generation,
        dataTestSubj: 'generationDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexTemplateTitle', {
          defaultMessage: 'Index template',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexTemplateToolTip', {
          defaultMessage:
            'The index template that configured the data stream and configures its backing indices.',
        }),
        content: (
          <EuiLink
            data-test-subj={'indexTemplateLink'}
            href={
              locator?.getRedirectUrl({
                page: 'index_template',
                indexTemplate: indexTemplateName,
              }) || ''
            }
          >
            {indexTemplateName}
          </EuiLink>
        ),
        dataTestSubj: 'indexTemplateDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexModeTitle', {
          defaultMessage: 'Index mode',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.indexModeToolTip', {
          defaultMessage:
            "The index mode applied to the data stream's backing indices, as defined in its associated index template.",
        }),
        content: indexModeLabels[indexMode],
        dataTestSubj: 'indexModeDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.dataRetentionTitle', {
          defaultMessage: 'Effective data retention',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.dataRetentionToolTip', {
          defaultMessage: `Data is kept at least this long before being automatically deleted. The data retention value only applies to the data managed directly by the data stream. {canEnableDataRetention, plural, one {If some data is subject to an index lifecycle management policy, then the data retention value set for the data stream doesn't apply to that data.} other {}}`,
          values: {
            canEnableDataRetention: config.enableTogglingDataRetention ? 1 : 0,
          },
        }),
        content: (
          <ConditionalWrap
            condition={isNextGenIlm(dataStream)}
            wrap={(children) => <EuiTextColor color="subdued">{children}</EuiTextColor>}
          >
            <>
              <DataRetentionValue dataStream={dataStream} />
            </>
          </ConditionalWrap>
        ),
        dataTestSubj: 'dataRetentionDetail',
      },
      {
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failureStoreTitle', {
          defaultMessage: 'Failure store',
        }),
        toolTip: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failureStoreToolTip', {
          defaultMessage:
            'The failure store provides a mechanism to store documents that fail to be indexed.',
        }),
        content: dataStream.failureStoreEnabled
          ? i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failureStoreEnabledText', {
              defaultMessage: 'Enabled',
            })
          : i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failureStoreDisabledText', {
              defaultMessage: 'Disabled',
            }),
        dataTestSubj: 'failureStoreDetail',
      }
    );

    // If both rentention types are available, we wanna surface to the user both
    if (lifecycle?.effective_retention && lifecycle?.data_retention) {
      defaultDetails.push({
        name: i18n.translate(
          'xpack.idxMgmt.dataStreamDetailPanel.customerDefinedDataRetentionTitle',
          {
            defaultMessage: 'Data retention',
          }
        ),
        toolTip: i18n.translate(
          'xpack.idxMgmt.dataStreamDetailPanel.customerDefinedDataRetentionTooltip',
          {
            defaultMessage:
              "This is the data retention that you defined. Because of other system constraints or settings, the data retention that is effectively applied may be different from the value you set. You can find the value retained and applied by the system under 'Effective data retention'.",
          }
        ),
        content: (
          <ConditionalWrap
            condition={isNextGenIlm(dataStream)}
            wrap={(children) => <EuiTextColor color="subdued">{children}</EuiTextColor>}
          >
            <>{getLifecycleValue(omit(lifecycle, ['effective_retention']))}</>
          </ConditionalWrap>
        ),
        dataTestSubj: 'dataRetentionDetail',
      });
    }
    if (
      dataStream.failureStoreEnabled &&
      (dataStream.failureStoreRetention?.retentionDisabled ||
        dataStream.failureStoreRetention?.customRetentionPeriod ||
        dataStream.failureStoreRetention?.defaultRetentionPeriod)
    ) {
      defaultDetails.push({
        name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.failureStoreRetentionTitle', {
          defaultMessage: 'Failure store retention',
        }),
        toolTip: i18n.translate(
          'xpack.idxMgmt.dataStreamDetailPanel.failureStoreRetentionTooltip',
          {
            defaultMessage:
              'How long failed documents are stored before being automatically deleted. {retentionType}',
            values: {
              retentionType: dataStream.failureStoreRetention?.retentionDisabled
                ? ''
                : dataStream.failureStoreRetention?.customRetentionPeriod
                ? i18n.translate(
                    'xpack.idxMgmt.dataStreamDetailPanel.failureStoreRetentionCustomTooltipLabel',
                    {
                      defaultMessage: 'This is a custom retention period for this data stream.',
                    }
                  )
                : i18n.translate(
                    'xpack.idxMgmt.dataStreamDetailPanel.failureStoreRetentionDefaultTooltipLabel',
                    {
                      defaultMessage: 'This is using the cluster default retention period.',
                    }
                  ),
            },
          }
        ),
        content: (
          <>
            {dataStream.failureStoreRetention?.retentionDisabled
              ? i18n.translate(
                  'xpack.idxMgmt.dataStreamDetailPanel.failureStoreRetentionDisabledText',
                  {
                    defaultMessage: 'Disabled',
                  }
                )
              : getRetentionPeriod(
                  dataStream.failureStoreRetention?.customRetentionPeriod ||
                    dataStream.failureStoreRetention?.defaultRetentionPeriod ||
                    ''
                )}
          </>
        ),
        dataTestSubj: 'failureStoreRetentionDetail',
      });
    }
    const managementDetails = getManagementDetails();
    const details = [...defaultDetails, ...managementDetails];

    content = (
      <>
        {isNextGenIlm(dataStream) && (
          <>
            <EuiCallOut
              announceOnMount
              title={i18n.translate(
                'xpack.idxMgmt.dataStreamsDetailsPanel.editDataRetentionModal.fullyManagedByILMTitle',
                { defaultMessage: 'This data stream and its associated indices are managed by ILM' }
              )}
              iconType="pin"
              data-test-subj="dsIsFullyManagedByILM"
            >
              <p>
                <FormattedMessage
                  id="xpack.idxMgmt.dataStreamsDetailsPanel.editDataRetentionModal.fullyManagedByILMDescription"
                  defaultMessage="To edit data retention for this data stream, you must edit its associated {link}."
                  values={{
                    link: (
                      <EuiLink onClick={() => core.application.navigateToUrl(ilmPolicyLink)}>
                        <FormattedMessage
                          id="xpack.idxMgmt.dataStreamsDetailsPanel.editDataRetentionModal.fullyManagedByILMButtonLabel"
                          defaultMessage="ILM policy"
                        />
                      </EuiLink>
                    ),
                  }}
                />
              </p>
            </EuiCallOut>

            <EuiSpacer />
          </>
        )}

        <DetailsList details={details} />
        {!hidden && <StreamsPromotion dataStreamName={dataStreamName} />}
      </>
    );
  }

  const closePopover = () => {
    setManagePopOver(false);
  };

  const button = (
    <EuiButton
      fill
      iconType="chevronSingleDown"
      iconSide="right"
      data-test-subj="manageDataStreamButton"
      onClick={() => setManagePopOver(!isManagePopOverOpen)}
    >
      <FormattedMessage
        id="xpack.idxMgmt.dataStreamsDetailsPanel.manageButtonLabel"
        defaultMessage="Manage"
      />
    </EuiButton>
  );

  const panels: EuiContextMenuPanelDescriptor[] = [
    {
      id: 0,
      title: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.managePanelTitle', {
        defaultMessage: 'Data stream options',
      }),
      items: [
        ...(!isNextGenIlm(dataStream) && dataStream?.privileges?.manage_data_stream_lifecycle
          ? [
              {
                key: 'editDataRetention',
                name: i18n.translate(
                  'xpack.idxMgmt.dataStreamDetailPanel.managePanelEditDataRetention',
                  {
                    defaultMessage: 'Edit data retention',
                  }
                ),
                'data-test-subj': 'editDataRetentionButton',
                icon: <EuiIcon type="pencil" size="m" aria-hidden={true} />,
                onClick: () => {
                  closePopover();
                  setIsEditingDataRetention(true);
                },
              },
            ]
          : []),
        ...(dataStream?.privileges?.read_failure_store
          ? [
              {
                key: 'configureFailureStore',
                name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.configureFailureStore', {
                  defaultMessage: 'Configure failure store',
                }),
                'data-test-subj': 'configureFailureStoreButton',
                icon: <EuiIcon type="gear" size="m" aria-hidden={true} />,
                onClick: () => {
                  closePopover();
                  setIsConfiguringFailureStore(true);
                },
              },
            ]
          : []),
        ...(dataStream?.privileges?.delete_index
          ? [
              {
                key: 'deleteDataStream',
                name: i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.managePanelDelete', {
                  defaultMessage: 'Delete',
                }),
                'data-test-subj': 'deleteDataStreamButton',
                icon: <EuiIcon type="trash" size="m" color="danger" aria-hidden={true} />,
                onClick: () => {
                  closePopover();
                  setIsDeleting(true);
                },
              },
            ]
          : []),
      ],
    },
  ];

  return (
    <>
      {isDeleting && (
        <DeleteDataStreamConfirmationModal
          onClose={(data) => {
            if (data && data.hasDeletedDataStreams) {
              onClose(true);
            } else {
              setIsDeleting(false);
            }
          }}
          dataStreams={[dataStreamName]}
        />
      )}

      {isEditingDataRetention && dataStream && (
        <EditDataRetentionModal
          onClose={(data) => {
            if (data && data?.hasUpdatedDataRetention) {
              onClose(true);
            } else {
              setIsEditingDataRetention(false);
            }
          }}
          ilmPolicyName={dataStream?.ilmPolicyName}
          ilmPolicyLink={ilmPolicyLink}
          dataStreams={[dataStream]}
          isBulkEdit={false}
        />
      )}

      {isConfiguringFailureStore && dataStream && (
        <ConfigureFailureStoreModal
          onClose={(data) => {
            if (data && data?.hasUpdatedFailureStore) {
              onClose(true);
            } else {
              setIsConfiguringFailureStore(false);
            }
          }}
          dataStreams={[dataStream]}
        />
      )}

      <EuiFlyout
        onClose={() => onClose()}
        data-test-subj="dataStreamDetailPanel"
        aria-labelledby="dataStreamDetailPanelTitle"
        size="m"
        maxWidth={500}
      >
        <EuiFlyoutHeader>
          <EuiTitle size="m">
            <h2 id="dataStreamDetailPanelTitle" data-test-subj="dataStreamDetailPanelTitle">
              {dataStreamName}
              <DiscoverLink indexName={dataStreamName} />
              {dataStream && <DataStreamsBadges dataStream={dataStream} />}
            </h2>
          </EuiTitle>
        </EuiFlyoutHeader>

        <EuiFlyoutBody data-test-subj="content">{content}</EuiFlyoutBody>

        <EuiFlyoutFooter>
          <EuiFlexGroup justifyContent="spaceBetween" alignItems="center">
            <EuiFlexItem grow={false}>
              <EuiButtonEmpty
                iconType="cross"
                flush="left"
                onClick={() => onClose()}
                data-test-subj="closeDetailsButton"
                aria-label={i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.closeButtonLabel', {
                  defaultMessage: 'Close',
                })}
              >
                {i18n.translate('xpack.idxMgmt.dataStreamDetailPanel.closeButtonLabel', {
                  defaultMessage: 'Close',
                })}
              </EuiButtonEmpty>
            </EuiFlexItem>

            {!isLoading && !error && !!panels[0].items?.length && (
              <EuiFlexItem grow={false}>
                <EuiPopover
                  button={button}
                  isOpen={isManagePopOverOpen}
                  closePopover={closePopover}
                  panelPaddingSize="none"
                  anchorPosition="downLeft"
                  aria-label={i18n.translate(
                    'xpack.idxMgmt.dataStreamDetailPanel.managePopoverAriaLabel',
                    { defaultMessage: 'Manage data stream' }
                  )}
                >
                  <EuiContextMenu initialPanelId={0} panels={panels} />
                </EuiPopover>
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlyoutFooter>
      </EuiFlyout>
    </>
  );
};
