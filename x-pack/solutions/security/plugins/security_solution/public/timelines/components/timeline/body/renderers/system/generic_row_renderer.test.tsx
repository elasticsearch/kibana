/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { shallow } from 'enzyme';
import { cloneDeep } from 'lodash/fp';
import React from 'react';

import { removeExternalLinkText } from '@kbn/securitysolution-io-ts-utils';
import type { EcsSecurityExtension as Ecs } from '@kbn/securitysolution-ecs';
import {
  mockDnsEvent,
  mockEndpointLibraryLoadEvent,
  mockEndpointProcessExecutionMalwarePreventionAlert,
  mockEndpointRegistryModificationEvent,
  mockFimFileCreatedEvent,
  mockFimFileDeletedEvent,
  mockSocketClosedEvent,
  mockSocketOpenedEvent,
  mockTimelineData,
  TestProviders,
} from '../../../../../../common/mock';
import {
  mockEndgameAdminLogon,
  mockEndgameCreationEvent,
  mockEndgameDnsRequest,
  mockEndgameExplicitUserLogon,
  mockEndgameFileCreateEvent,
  mockEndgameFileDeleteEvent,
  mockEndgameIpv4ConnectionAcceptEvent,
  mockEndgameIpv4DisconnectReceivedEvent,
  mockEndgameIpv6ConnectionAcceptEvent,
  mockEndgameIpv6DisconnectReceivedEvent,
  mockEndgameTerminationEvent,
  mockEndgameUserLogoff,
  mockEndgameUserLogon,
  mockEndpointDisconnectReceivedEvent,
  mockEndpointFileCreationEvent,
  mockEndpointFileCreationMalwareDetectionAlert,
  mockEndpointFileCreationMalwarePreventionAlert,
  mockEndpointFileDeletionEvent,
  mockEndpointFileModificationEvent,
  mockEndpointFileModificationMalwareDetectionAlert,
  mockEndpointFileModificationMalwarePreventionAlert,
  mockEndpointFileOverwriteEvent,
  mockEndpointFileRenameEvent,
  mockEndpointFileRenameMalwareDetectionAlert,
  mockEndpointFileRenameMalwarePreventionAlert,
  mockEndpointFilesEncryptedRansomwareDetectionAlert,
  mockEndpointFilesEncryptedRansomwarePreventionAlert,
  mockEndpointNetworkConnectionAcceptedEvent,
  mockEndpointNetworkHttpRequestEvent,
  mockEndpointNetworkLookupRequestedEvent,
  mockEndpointNetworkLookupResultEvent,
  mockEndpointProcessEndEvent,
  mockEndpointProcessExecEvent,
  mockEndpointProcessExecutionMalwareDetectionAlert,
  mockEndpointProcessForkEvent,
  mockEndpointProcessStartEvent,
  mockEndpointSecurityLogOffEvent,
  mockEndpointSecurityLogOnFailureEvent,
  mockEndpointSecurityLogOnSuccessEvent,
} from '../../../../../../common/mock/mock_endgame_ecs_data';
import { useMountAppended } from '../../../../../../common/utils/use_mount_appended';
import type { EndpointAlertCriteria } from './generic_row_renderer';
import {
  createDnsRowRenderer,
  createEndgameProcessRowRenderer,
  createEndpointAlertsRowRenderer,
  createEndpointLibraryRowRenderer,
  createEndpointRegistryRowRenderer,
  createFimRowRenderer,
  createGenericFileRowRenderer,
  createGenericSystemRowRenderer,
  createSecurityEventRowRenderer,
  createSocketRowRenderer,
} from './generic_row_renderer';
import * as i18n from './translations';
import type { RowRenderer } from '../../../../../../../common/types';
import { TimelineId } from '../../../../../../../common/types/timeline';

// EuiIcons coming from .testenv render the icon's aria-label as a span
// extractEuiIcon removes the aria-label before checking for equality
const extractEuiIconText = (str: string) => {
  return str.replaceAll('External link', '');
};

jest.mock('../../../../../../common/lib/kibana');

jest.mock('../host_name', () => ({
  HostName: () => null,
}));

jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    EuiScreenReaderOnly: () => <></>,
  };
});

jest.mock('../../../../../../common/components/link_to');
jest.mock('../../../../../../overview/components/events_by_dataset');
jest.mock('../../../../../../flyout/shared/components/flyout_link', () => ({
  FlyoutLink: ({ children, value }: { children?: React.ReactNode; value: string }) => (
    <>{children ?? value}</>
  ),
}));

describe('GenericRowRenderer', () => {
  const mount = useMountAppended();

  describe('#createGenericSystemRowRenderer', () => {
    let nonSystem: Ecs;
    let system: Ecs;
    let connectedToRenderer: RowRenderer;
    beforeEach(() => {
      nonSystem = cloneDeep(mockTimelineData[0].ecs);
      system = cloneDeep(mockTimelineData[29].ecs);
      connectedToRenderer = createGenericSystemRowRenderer({
        actionName: 'process_started',
        text: 'some text',
      });
    });
    test('renders correctly against snapshot', () => {
      const children = connectedToRenderer.renderRow({
        data: system,

        scopeId: TimelineId.test,
      });

      const wrapper = shallow(<span>{children}</span>);
      expect(wrapper).toMatchSnapshot();
    });

    test('should return false if not a system datum', () => {
      expect(connectedToRenderer.isInstance(nonSystem)).toBe(false);
    });

    test('should return true if it is a system datum', () => {
      expect(connectedToRenderer.isInstance(system)).toBe(true);
    });

    test('should return false when action is set to some other value', () => {
      if (system.event != null && system.event.action != null) {
        system.event.action[0] = 'some other value';
        expect(connectedToRenderer.isInstance(system)).toBe(false);
      } else {
        // if system.event or system.event.action is not defined in the mock
        // then we will get an error here
        expect(system.event).toBeDefined();
      }
    });
    test('should render a system row', () => {
      const children = connectedToRenderer.renderRow({
        data: system,

        scopeId: TimelineId.test,
      });
      const wrapper = mount(
        <TestProviders>
          <span>{children}</span>
        </TestProviders>
      );
      expect(wrapper.text()).toContain(
        'Evan@zeek-londonsome text(6278)with resultfailureSource128.199.212.120'
      );
    });
  });

  describe('#createGenericFileRowRenderer', () => {
    let nonSystem: Ecs;
    let systemFile: Ecs;
    let fileToRenderer: RowRenderer;

    beforeEach(() => {
      nonSystem = cloneDeep(mockTimelineData[0].ecs);
      systemFile = cloneDeep(mockTimelineData[28].ecs);
      fileToRenderer = createGenericFileRowRenderer({
        actionName: 'user_login',
        text: 'some text',
      });
    });

    test('renders correctly against snapshot', () => {
      const children = fileToRenderer.renderRow({
        data: systemFile,

        scopeId: TimelineId.test,
      });

      const wrapper = shallow(<span>{children}</span>);
      expect(wrapper).toMatchSnapshot();
    });

    test('should return false if not a auditd datum', () => {
      expect(fileToRenderer.isInstance(nonSystem)).toBe(false);
    });

    test('should return true if it is a auditd datum', () => {
      expect(fileToRenderer.isInstance(systemFile)).toBe(true);
    });

    test('should return false when action is set to some other value', () => {
      if (systemFile.event != null && systemFile.event.action != null) {
        systemFile.event.action[0] = 'some other value';
        expect(fileToRenderer.isInstance(systemFile)).toBe(false);
      } else {
        expect(systemFile.event).toBeDefined();
      }
    });

    test('should render a system row', () => {
      const children = fileToRenderer.renderRow({
        data: systemFile,

        scopeId: TimelineId.test,
      });
      const wrapper = mount(
        <TestProviders>
          <span>{children}</span>
        </TestProviders>
      );
      expect(wrapper.text()).toContain(
        'Braden@zeek-londonsome text(6278)with resultfailureSource128.199.212.120'
      );
    });
  });

  describe('#createEndpointAlertsRowRenderer', () => {
    test('it renders a Malware File Creation Prevented alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'creation',
        eventCategory: 'file',
        eventType: 'denied',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_PREVENTED_FROM_CREATING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(mockEndpointFileCreationMalwarePreventionAlert) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileCreationMalwarePreventionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpoint-1was prevented from creating a malicious file6a5eabd6-1c79-4962-b411-a5e7d9e967d4.tmpinC:\\Users\\sean\\Downloads\\6a5eabd6-1c79-4962-b411-a5e7d9e967d4.tmpviachrome.exe(8944)C:\\Program Files\\Google\\Chrome\\Application\\chrome.exevia parent processexplorer.exe(1008)with resultsuccess7cc42618e580f233fee47e82312cc5c3476cb5de9219ba3f9eb7f99ac0659c30'
      );
    });

    test('it renders a Malware File Creation Detected alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'creation',
        eventCategory: 'file',
        eventType: 'allowed',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_DETECTED_CREATING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(mockEndpointFileCreationMalwareDetectionAlert) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileCreationMalwareDetectionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'DESKTOP-1was detected creating a malicious filemimikatz_write.exeinC:\\temp\\mimikatz_write.exeviapython.exe(4400)C:\\Python27\\python.exemain.py-a,execute-pc:\\tempvia parent processpythonservice.exe(2936)with resultsuccess263f09eeee80e03aa27a2d19530e2451978e18bf733c5f1c64ff2389c5dc17b0'
      );
    });

    test('it renders a Ransomware Files Encrypted Prevented alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'files-encrypted',
        eventCategory: 'file',
        eventType: 'denied',
        skipRedundantFileDetails: true,
        text: i18n.RANSOMWARE_WAS_PREVENTED_FROM_ENCRYPTING_FILES,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointFilesEncryptedRansomwarePreventionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFilesEncryptedRansomwarePreventionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'DESKTOP-1ransomware was prevented from encrypting filesviapowershell.exe(6056)powershell.exe-filemock_ransomware_v3.ps1via parent processcmd.exe(10680)with resultsuccesse9fa973eb5ad446e0be31c7b8ae02d48281319e7f492e1ddaadddfbdd5b480c7'
      );
    });

    test('it renders a Ransomware Files Encrypted Detected alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'files-encrypted',
        eventCategory: 'file',
        eventType: 'allowed',
        skipRedundantFileDetails: true,
        text: i18n.RANSOMWARE_WAS_DETECTED_ENCRYPTING_FILES,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointFilesEncryptedRansomwareDetectionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFilesEncryptedRansomwareDetectionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'DESKTOP-1ransomware was detected encrypting filesviapowershell.exe(4684)powershell.exe-filemock_ransomware_v3.ps1via parent processcmd.exe(8616)e9fa973eb5ad446e0be31c7b8ae02d48281319e7f492e1ddaadddfbdd5b480c7'
      );
    });

    test('it renders a Malware File Modification Prevented alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'modification',
        eventCategory: 'file',
        eventType: 'denied',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_PREVENTED_FROM_MODIFYING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointFileModificationMalwarePreventionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileModificationMalwarePreventionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpoint-1was prevented from modifying a malicious filemimikatz - Copy.exeinC:\\Users\\sean\\Downloads\\mimikatz_trunk (1)\\x64\\mimikatz - Copy.exeviaexplorer.exe(1008)C:\\Windows\\Explorer.EXEvia parent processC:\\Windows\\System32\\userinit.exe(356)with resultsuccess31eb1de7e840a342fd468e558e5ab627bcb4c542a8fe01aec4d5ba01d539a0fc'
      );
    });

    test('it renders a Malware File Modification Detected alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'modification',
        eventCategory: 'file',
        eventType: 'allowed',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_DETECTED_MODIFYING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointFileModificationMalwareDetectionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileModificationMalwareDetectionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'mac-1.localwas detected modifying a malicious fileaircrackin/private/var/root/write_malware/modules/write_malware/aircrackviaPython(5995)/usr/local/Cellar/python/2.7.14/Frameworks/Python.framework/Versions/2.7/Resources/Python.app/Contents/MacOS/Pythonmain.py-amodifyvia parent processPython(97)with resultsuccessf0954d9673878b2223b00b7ec770c7b438d876a9bb44ec78457e5c618f31f52b'
      );
    });

    test('it renders a Malware File Rename Prevented alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'rename',
        eventCategory: 'file',
        eventType: 'denied',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_PREVENTED_FROM_RENAMING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(mockEndpointFileRenameMalwarePreventionAlert) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileRenameMalwarePreventionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpoint-1was prevented from renaming a malicious file23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97.exeinC:\\Users\\sean\\Downloads\\23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97.exeviaexplorer.exe(1008)C:\\Windows\\Explorer.EXEvia parent processC:\\Windows\\System32\\userinit.exe(356)with resultsuccess23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97'
      );
    });

    test('it renders a Malware File Rename Detected alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'rename',
        eventCategory: 'file',
        eventType: 'allowed',
        skipRedundantProcessDetails: true,
        text: i18n.WAS_DETECTED_RENAMING_A_MALICIOUS_FILE,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(mockEndpointFileRenameMalwareDetectionAlert) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointFileRenameMalwareDetectionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpoint-1was detected renaming a malicious file23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97.exeinC:\\Users\\sean\\Downloads\\23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97.exeviaexplorer.exe(1008)C:\\Windows\\Explorer.EXEvia parent processC:\\Windows\\System32\\userinit.exe(356)with resultsuccess23361f8f413dd9258545030e42056a352fe35f66bac376d49954551c9b4bcf97'
      );
    });

    test('it renders a Malware Process Execution Prevented alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'execution',
        eventCategory: 'process',
        eventType: 'denied',
        skipRedundantFileDetails: true,
        text: i18n.WAS_PREVENTED_FROM_EXECUTING_A_MALICIOUS_PROCESS,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointProcessExecutionMalwarePreventionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointProcessExecutionMalwarePreventionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpoint-1was prevented from executing a malicious processC:\\Users\\sean\\Downloads\\3be13acde2f4dcded4fd8d518a513bfc9882407a6e384ffb17d12710db7d76fb.exe(6920)C:\\Users\\sean\\Downloads\\3be13acde2f4dcded4fd8d518a513bfc9882407a6e384ffb17d12710db7d76fb.exewith resultsuccess3be13acde2f4dcded4fd8d518a513bfc9882407a6e384ffb17d12710db7d76fb'
      );
    });

    test('it renders a Malware Process Execution Detected alert', () => {
      const endpointAlertCriteria: EndpointAlertCriteria = {
        eventAction: 'execution',
        eventCategory: 'process',
        eventType: 'allowed',
        skipRedundantFileDetails: true,
        text: i18n.WAS_DETECTED_EXECUTING_A_MALICIOUS_PROCESS,
      };

      const endpointAlertsRowRenderer = createEndpointAlertsRowRenderer(endpointAlertCriteria);

      const wrapper = mount(
        <TestProviders>
          {endpointAlertsRowRenderer.isInstance(
            mockEndpointProcessExecutionMalwareDetectionAlert
          ) &&
            endpointAlertsRowRenderer.renderRow({
              data: mockEndpointProcessExecutionMalwareDetectionAlert,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'DESKTOP-1was detected executing a malicious processmimikatz_write.exe(8668)c:\\temp\\mimikatz_write.exevia parent processpython.exewith resultsuccess263f09eeee80e03aa27a2d19530e2451978e18bf733c5f1c64ff2389c5dc17b0'
      );
    });
  });

  describe('#createEndgameProcessRowRenderer', () => {
    test('it renders an endpoint Process Exec event', () => {
      const actionName = 'exec';
      const text = i18n.EXECUTED_PROCESS;

      const endpointProcessStartRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointProcessStartRowRenderer.isInstance(mockEndpointProcessExecEvent) &&
            endpointProcessStartRowRenderer.renderRow({
              data: mockEndpointProcessExecEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'admin@test-mac.localexecuted processmdworker_shared(4454)/System/Library/Frameworks/CoreServices.framework/Frameworks/Metadata.framework/Versions/A/Support/mdworker_shared-smdworker-cMDSImporterWorker-mcom.apple.mdworker.sharedvia parent processlaunchd(1)4bc018ac461706496302d1faab0a8bb39aad974eb432758665103165f3a2dd2b'
      );
    });

    test('it renders an endpoint Process Fork event', () => {
      const actionName = 'fork';
      const text = i18n.FORKED_PROCESS;

      const endpointProcessStartRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointProcessStartRowRenderer.isInstance(mockEndpointProcessForkEvent) &&
            endpointProcessStartRowRenderer.renderRow({
              data: mockEndpointProcessForkEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'admin@test-mac.localforked processzoom.us(4042)/Applications/zoom.us.app/Contents/MacOS/zoom.usvia parent processzoom.us(3961)cbf3d059cc9f9c0adff5ef15bf331b95ab381837fa0adecd965a41b5846f4bd4'
      );
    });

    test('it renders an endpoint process start event', () => {
      const actionName = 'start';
      const text = i18n.PROCESS_STARTED;

      const endpointProcessStartRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointProcessStartRowRenderer.isInstance(mockEndpointProcessStartEvent) &&
            endpointProcessStartRowRenderer.renderRow({
              data: mockEndpointProcessStartEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpoint-1started processconhost.exe(3636)C:\\Windows\\system32\\conhost.exe,0xffffffff,-ForceV1697334c236cce7d4c9e223146ee683a1219adced9729d4ae771fd6a1502a6b63'
      );
    });

    test('it renders an endgame process creation_event', () => {
      const actionName = 'creation_event';
      const text = i18n.PROCESS_STARTED;
      const endgameCreationEvent = {
        ...mockEndgameCreationEvent,
      };

      const endgameProcessCreationEventRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameProcessCreationEventRowRenderer.isInstance(endgameCreationEvent) &&
            endgameProcessCreationEventRowRenderer.renderRow({
              data: endgameCreationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'Arun\\Anvi-Acer@HD-obe-8bf77f54started processMicrosoft.Photos.exe(441684)C:\\Program Files\\WindowsApps\\Microsoft.Windows.Photos_2018.18091.17210.0_x64__8wekyb3d8bbwe\\Microsoft.Photos.exe-ServerName:App.AppXzst44mncqdg84v7sv6p7yznqwssy6f7f.mcavia parent processsvchost.exe(8)d4c97ed46046893141652e2ec0056a698f6445109949d7fcabbce331146889ee'
      );
    });

    test('it renders an endpoint process end event', () => {
      const actionName = 'end';
      const text = i18n.TERMINATED_PROCESS;

      const endpointProcessEndRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointProcessEndRowRenderer.isInstance(mockEndpointProcessEndEvent) &&
            endpointProcessEndRowRenderer.renderRow({
              data: mockEndpointProcessEndEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointterminated processsvchost.exe(10392)C:\\Windows\\System32\\svchost.exe,-k,netsvcs,-p,-s,NetSetupSvcwith exit code-1via parent processservices.exe7fd065bac18c5278777ae44908101cdfed72d26fa741367f0ad4d02020787ab6'
      );
    });

    test('it renders an endgame process termination_event', () => {
      const actionName = 'termination_event';
      const text = i18n.TERMINATED_PROCESS;
      const endgameTerminationEvent = {
        ...mockEndgameTerminationEvent,
      };

      const endgameProcessTerminationEventRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameProcessTerminationEventRowRenderer.isInstance(endgameTerminationEvent) &&
            endgameProcessTerminationEventRowRenderer.renderRow({
              data: endgameTerminationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'Arun\\Anvi-Acer@HD-obe-8bf77f54terminated processRuntimeBroker.exe(442384)with exit code087976f3430cc99bc939e0694247c0759961a49832b87218f4313d6fc0bc3a776'
      );
    });

    test('it does NOT render the event if the action name does not match', () => {
      const actionName = 'does_not_match';
      const text = i18n.PROCESS_STARTED;
      const endgameCreationEvent = {
        ...mockEndgameCreationEvent,
      };

      const endgameProcessCreationEventRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameProcessCreationEventRowRenderer.isInstance(endgameCreationEvent) &&
            endgameProcessCreationEventRowRenderer.renderRow({
              data: endgameCreationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });

    test('it does NOT render the event when the event category is NOT process', () => {
      const actionName = 'creation_event';
      const text = i18n.PROCESS_STARTED;
      const endgameCreationEvent = {
        ...mockEndgameCreationEvent,
        event: {
          ...mockEndgameCreationEvent.event,
          category: ['something_else'],
        },
      };

      const endgameProcessCreationEventRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameProcessCreationEventRowRenderer.isInstance(endgameCreationEvent) &&
            endgameProcessCreationEventRowRenderer.renderRow({
              data: endgameCreationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });

    test('it does NOT render the event when both the action name and event category do NOT match', () => {
      const actionName = 'does_not_match';
      const text = i18n.PROCESS_STARTED;
      const endgameCreationEvent = {
        ...mockEndgameCreationEvent,
        event: {
          ...mockEndgameCreationEvent.event,
          category: ['something_else'],
        },
      };

      const endgameProcessCreationEventRowRenderer = createEndgameProcessRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameProcessCreationEventRowRenderer.isInstance(endgameCreationEvent) &&
            endgameProcessCreationEventRowRenderer.renderRow({
              data: endgameCreationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });
  });

  describe('#createFimRowRenderer', () => {
    test('it renders an endpoint file creation event', () => {
      const actionName = 'creation';
      const text = i18n.CREATED_FILE;

      const endpointFileCreationRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointFileCreationRowRenderer.isInstance(mockEndpointFileCreationEvent) &&
            endpointFileCreationRowRenderer.renderRow({
              data: mockEndpointFileCreationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointcreated a fileWimProvider.dllinC:\\Windows\\TEMP\\E38FD162-B6E6-4799-B52D-F590BACBAE94\\WimProvider.dllviaMsMpEng.exe(2424)'
      );
    });

    test('it renders an endgame file_create_event', () => {
      const actionName = 'file_create_event';
      const text = i18n.CREATED_FILE;
      const endgameFileCreateEvent = {
        ...mockEndgameFileCreateEvent,
      };

      const endgameFileCreateEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameFileCreateEventRowRenderer.isInstance(endgameFileCreateEvent) &&
            endgameFileCreateEventRowRenderer.renderRow({
              data: endgameFileCreateEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'Arun\\Anvi-Acer@HD-obe-8bf77f54created a fileinC:\\Users\\Arun\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\63d78c21-e593-4484-b7a9-db33cd522ddc.tmpviachrome.exe(11620)'
      );
    });

    test('it renders an endpoint file deletion event', () => {
      const actionName = 'deletion';
      const text = i18n.DELETED_FILE;

      const endpointFileDeletionRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointFileDeletionRowRenderer.isInstance(mockEndpointFileDeletionEvent) &&
            endpointFileDeletionRowRenderer.renderRow({
              data: mockEndpointFileDeletionEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@windows-endpoint-1deleted a fileAM_Delta_Patch_1.329.2793.0.exeinC:\\Windows\\SoftwareDistribution\\Download\\Install\\AM_Delta_Patch_1.329.2793.0.exeviasvchost.exe(1728)'
      );
    });

    test('it renders an endpoint File (FIM) Modification event', () => {
      const actionName = 'modification';
      const text = i18n.MODIFIED_FILE;

      const endpointFileModificationRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointFileModificationRowRenderer.isInstance(mockEndpointFileModificationEvent) &&
            endpointFileModificationRowRenderer.renderRow({
              data: mockEndpointFileModificationEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'admin@test-Mac.localmodified a file.dat.nosync01a5.6hoWv1in/Users/admin/Library/Application Support/CrashReporter/.dat.nosync01a5.6hoWv1viadiagnostics_agent(421)'
      );
    });

    test('it renders an endpoint File (FIM) Overwrite event', () => {
      const actionName = 'overwrite';
      const text = i18n.OVERWROTE_FILE;

      const endpointFileOverwriteRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointFileOverwriteRowRenderer.isInstance(mockEndpointFileOverwriteEvent) &&
            endpointFileOverwriteRowRenderer.renderRow({
              data: mockEndpointFileOverwriteEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'LOCAL SERVICE\\NT AUTHORITY@windows-endpoint-1overwrote a filelastalive0.datinC:\\Windows\\ServiceState\\EventLog\\Data\\lastalive0.datviasvchost.exe(1228)'
      );
    });

    test('it renders an endpoint File (FIM) Rename event', () => {
      const actionName = 'rename';
      const text = i18n.RENAMED_FILE;

      const endpointFileRenameRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointFileRenameRowRenderer.isInstance(mockEndpointFileRenameEvent) &&
            endpointFileRenameRowRenderer.renderRow({
              data: mockEndpointFileRenameEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'LOCAL SERVICE\\NT AUTHORITY@windows-endpoint-1renamed a fileSRU.loginC:\\Windows\\System32\\sru\\SRU.logfrom its original pathC:\\Windows\\System32\\sru\\SRUtmp.logviasvchost.exe(1204)'
      );
    });

    test('it renders an endgame file_delete_event', () => {
      const actionName = 'file_delete_event';
      const text = i18n.DELETED_FILE;
      const endgameFileDeleteEvent = {
        ...mockEndgameFileDeleteEvent,
      };

      const endgameFileDeleteEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameFileDeleteEventRowRenderer.isInstance(endgameFileDeleteEvent) &&
            endgameFileDeleteEventRowRenderer.renderRow({
              data: endgameFileDeleteEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@HD-v1s-d2118419deleted a filetmp000002f6inC:\\Windows\\TEMP\\tmp00000404\\tmp000002f6viaAmSvc.exe(1084)'
      );
    });

    test('it renders a FIM (non-endgame) file created event', () => {
      const actionName = 'created';
      const text = i18n.CREATED_FILE;
      const fimFileCreatedEvent = {
        ...mockFimFileCreatedEvent,
      };

      const fileCreatedEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {fileCreatedEventRowRenderer.isInstance(fimFileCreatedEvent) &&
            fileCreatedEventRowRenderer.renderRow({
              data: fimFileCreatedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('foohostcreated a filein/etc/subgidviaan unknown process');
    });

    test('it renders a FIM (non-endgame) file deleted event', () => {
      const actionName = 'deleted';
      const text = i18n.DELETED_FILE;
      const fimFileDeletedEvent = {
        ...mockFimFileDeletedEvent,
      };

      const fileDeletedEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {fileDeletedEventRowRenderer.isInstance(fimFileDeletedEvent) &&
            fileDeletedEventRowRenderer.renderRow({
              data: fimFileDeletedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'foohostdeleted a filein/etc/gshadow.lockviaan unknown process'
      );
    });

    test('it does NOT render an event if the action name does not match', () => {
      const actionName = 'does_not_match';
      const text = i18n.CREATED_FILE;
      const endgameFileCreateEvent = {
        ...mockEndgameFileCreateEvent,
      };

      const endgameFileCreateEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameFileCreateEventRowRenderer.isInstance(endgameFileCreateEvent) &&
            endgameFileCreateEventRowRenderer.renderRow({
              data: endgameFileCreateEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });

    test('it does NOT render an Endgame file_create_event when category is NOT file', () => {
      const actionName = 'file_create_event';
      const text = i18n.CREATED_FILE;
      const endgameFileCreateEvent = {
        ...mockEndgameFileCreateEvent,
        event: {
          ...mockEndgameFileCreateEvent.event,
          category: ['something_else'],
        },
      };

      const endgameFileCreateEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameFileCreateEventRowRenderer.isInstance(endgameFileCreateEvent) &&
            endgameFileCreateEventRowRenderer.renderRow({
              data: endgameFileCreateEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });

    test('it does NOT render a FIM (non-Endgame) file created event when the event dataset is NOT file', () => {
      const actionName = 'created';
      const text = i18n.CREATED_FILE;
      const fimFileCreatedEvent = {
        ...mockFimFileCreatedEvent,
        event: {
          ...mockEndgameFileCreateEvent.event,
          dataset: ['something_else'],
        },
      };

      const fileCreatedEventRowRenderer = createFimRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {fileCreatedEventRowRenderer.isInstance(fimFileCreatedEvent) &&
            fileCreatedEventRowRenderer.renderRow({
              data: fimFileCreatedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });
  });

  describe('#createSocketRowRenderer', () => {
    test('it renders an Endpoint network connection_accepted event', () => {
      const actionName = 'connection_accepted';
      const text = i18n.ACCEPTED_A_CONNECTION_VIA;

      const endpointConnectionAcceptedRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointConnectionAcceptedRowRenderer.isInstance(
            mockEndpointNetworkConnectionAcceptedEvent
          ) &&
            endpointConnectionAcceptedRowRenderer.renderRow({
              data: mockEndpointNetworkConnectionAcceptedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'NETWORK SERVICE\\NT AUTHORITY@windows-endpoint-1accepted a connection viasvchost.exe(328)with resultsuccessEndpoint network eventincomingtcpSource10.1.2.3:64557North AmericaUnited States🇺🇸USNorth CarolinaConcordDestination10.50.60.70:3389'
      );
    });

    describe('#createEndpointRegistryRowRenderer', () => {
      test('it renders an endpoint Registry Modification event', () => {
        const actionName = 'modification';
        const text = i18n.MODIFIED_REGISTRY_KEY;

        const endpointRegistryModificationRowRenderer = createEndpointRegistryRowRenderer({
          actionName,
          text,
        });

        const wrapper = mount(
          <TestProviders>
            {endpointRegistryModificationRowRenderer.isInstance(
              mockEndpointRegistryModificationEvent
            ) &&
              endpointRegistryModificationRowRenderer.renderRow({
                data: mockEndpointRegistryModificationEvent,
                scopeId: TimelineId.test,
              })}
          </TestProviders>
        );

        expect(wrapper.text()).toEqual(
          'SYSTEM\\NT AUTHORITY@win2019-endpoint-1modified registry keySOFTWARE\\WOW6432Node\\Google\\Update\\ClientState\\{430FD4D0-B729-4F61-AA34-91526481799D}\\CurrentStatewith new valueHKLM\\SOFTWARE\\WOW6432Node\\Google\\Update\\ClientState\\{430FD4D0-B729-4F61-AA34-91526481799D}\\CurrentState\\StateValueviaGoogleUpdate.exe(7408)'
        );
      });
    });

    describe('#createEndpointLibraryRowRenderer', () => {
      test('it renders an endpoint Library Load event', () => {
        const actionName = 'load';
        const text = i18n.LOADED_LIBRARY;

        const endpointLibraryLoadRowRenderer = createEndpointLibraryRowRenderer({
          actionName,
          text,
        });

        const wrapper = mount(
          <TestProviders>
            {endpointLibraryLoadRowRenderer.isInstance(mockEndpointLibraryLoadEvent) &&
              endpointLibraryLoadRowRenderer.renderRow({
                data: mockEndpointLibraryLoadEvent,
                scopeId: TimelineId.test,
              })}
          </TestProviders>
        );

        expect(wrapper.text()).toEqual(
          'SYSTEM\\NT AUTHORITY@win2019-endpoint-1loaded librarybcrypt.dllinC:\\Windows\\System32\\bcrypt.dllviasshd.exe(9644)e70f5d8f87aab14e3160227d38387889befbe37fa4f8f5adc59eff52804b35fd'
        );
      });
    });

    test('it renders an Endpoint network HTTP Request event', () => {
      const actionName = 'http_request';
      const text = i18n.MADE_A_HTTP_REQUEST_VIA;

      const endpointHttpRequestEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointHttpRequestEventRowRenderer.isInstance(mockEndpointNetworkHttpRequestEvent) &&
            endpointHttpRequestEventRowRenderer.renderRow({
              data: mockEndpointNetworkHttpRequestEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'NETWORK SERVICE\\NT AUTHORITY@win2019-endpoint-1made a http request viasvchost.exe(2232)Endpoint network eventoutgoinghttptcpSource10.1.2.3:51570Destination10.11.12.13:80North AmericaUnited States🇺🇸USArizonaPhoenix'
      );
    });

    test('it renders an Endgame ipv4_connection_accept_event', () => {
      const actionName = 'ipv4_connection_accept_event';
      const text = i18n.ACCEPTED_A_CONNECTION_VIA;
      const ipv4ConnectionAcceptEvent = {
        ...mockEndgameIpv4ConnectionAcceptEvent,
      };

      const endgameIpv4ConnectionAcceptEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameIpv4ConnectionAcceptEventRowRenderer.isInstance(ipv4ConnectionAcceptEvent) &&
            endgameIpv4ConnectionAcceptEventRowRenderer.renderRow({
              data: ipv4ConnectionAcceptEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'SYSTEM\\NT AUTHORITY@HD-gqf-0af7b4feaccepted a connection viaAmSvc.exe(1084)tcp1:network-community_idSource127.0.0.1:49306Destination127.0.0.1:49305'
      );
    });

    test('it renders an Endgame ipv6_connection_accept_event', () => {
      const actionName = 'ipv6_connection_accept_event';
      const text = i18n.ACCEPTED_A_CONNECTION_VIA;
      const ipv6ConnectionAcceptEvent = {
        ...mockEndgameIpv6ConnectionAcceptEvent,
      };

      const endgameIpv6ConnectionAcceptEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameIpv6ConnectionAcceptEventRowRenderer.isInstance(ipv6ConnectionAcceptEvent) &&
            endgameIpv6ConnectionAcceptEventRowRenderer.renderRow({
              data: ipv6ConnectionAcceptEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'SYSTEM\\NT AUTHORITY@HD-55b-3ec87f66accepted a connection via(4)tcp1:network-community_idSource::1:51324Destination::1:5357'
      );
    });

    test('it renders an endpoint network disconnect_received event', () => {
      const actionName = 'disconnect_received';
      const text = i18n.DISCONNECTED_VIA;

      const endpointDisconnectReceivedRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endpointDisconnectReceivedRowRenderer.isInstance(mockEndpointDisconnectReceivedEvent) &&
            endpointDisconnectReceivedRowRenderer.renderRow({
              data: mockEndpointDisconnectReceivedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'NETWORK SERVICE\\NT AUTHORITY@windows-endpoint-1disconnected viasvchost.exe(328)Endpoint network eventincomingtcpSource10.20.30.40:64557North AmericaUnited States🇺🇸USNorth CarolinaConcord(42.47%)1.2KB(57.53%)1.6KBDestination10.11.12.13:3389'
      );
    });

    test('it renders an Endgame ipv4_disconnect_received_event', () => {
      const actionName = 'ipv4_disconnect_received_event';
      const text = i18n.DISCONNECTED_VIA;
      const ipv4DisconnectReceivedEvent = {
        ...mockEndgameIpv4DisconnectReceivedEvent,
      };

      const endgameIpv4DisconnectReceivedEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameIpv4DisconnectReceivedEventRowRenderer.isInstance(ipv4DisconnectReceivedEvent) &&
            endgameIpv4DisconnectReceivedEventRowRenderer.renderRow({
              data: ipv4DisconnectReceivedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'Arun\\Anvi-Acer@HD-obe-8bf77f54disconnected viachrome.exe(11620)8.1KBtcp1:LxYHJJv98b2O0fNccXu6HheXmwk=Source192.168.0.6:59356(25.78%)2.1KB(74.22%)6KBDestination10.156.162.53:443'
      );
    });

    test('it renders an Endgame ipv6_disconnect_received_event', () => {
      const actionName = 'ipv6_disconnect_received_event';
      const text = i18n.DISCONNECTED_VIA;
      const ipv6DisconnectReceivedEvent = {
        ...mockEndgameIpv6DisconnectReceivedEvent,
      };

      const endgameIpv6DisconnectReceivedEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameIpv6DisconnectReceivedEventRowRenderer.isInstance(ipv6DisconnectReceivedEvent) &&
            endgameIpv6DisconnectReceivedEventRowRenderer.renderRow({
              data: ipv6DisconnectReceivedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'SYSTEM\\NT AUTHORITY@HD-55b-3ec87f66disconnected via(4)7.9KBtcp1:ZylzQhsB1dcptA2t4DY8S6l9o8E=Source::1:51338(96.92%)7.7KB(3.08%)249BDestination::1:2869'
      );
    });

    test('it renders a (non-Endgame) socket_opened event', () => {
      const actionName = 'socket_opened';
      const text = i18n.SOCKET_OPENED;
      const socketOpenedEvent = {
        ...mockSocketOpenedEvent,
      };

      const socketOpenedEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {socketOpenedEventRowRenderer.isInstance(socketOpenedEvent) &&
            socketOpenedEventRowRenderer.renderRow({
              data: socketOpenedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'root@foohostopened a socket withgoogle_accounts(2166)Outbound socket (10.4.20.1:59554 -> 10.1.2.3:80) Ooutboundtcp1:network-community_idSource10.4.20.1:59554Destination10.1.2.3:80'
      );
    });

    test('it renders a (non-Endgame) socket_closed event', () => {
      const actionName = 'socket_closed';
      const text = i18n.SOCKET_CLOSED;
      const socketClosedEvent = {
        ...mockSocketClosedEvent,
      };

      const socketClosedEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {socketClosedEventRowRenderer.isInstance(socketClosedEvent) &&
            socketClosedEventRowRenderer.renderRow({
              data: socketClosedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'root@foohostclosed a socket withgoogle_accounts(2166)Outbound socket (10.4.20.1:59508 -> 10.1.2.3:80) Coutboundtcp1:network-community_idSource10.4.20.1:59508Destination10.1.2.3:80'
      );
    });

    test('it does NOT render an event if the action name does not match', () => {
      const actionName = 'does_not_match';
      const text = i18n.ACCEPTED_A_CONNECTION_VIA;
      const ipv4ConnectionAcceptEvent = {
        ...mockEndgameIpv4ConnectionAcceptEvent,
      };

      const endgameIpv4ConnectionAcceptEventRowRenderer = createSocketRowRenderer({
        actionName,
        text,
      });

      const wrapper = mount(
        <TestProviders>
          {endgameIpv4ConnectionAcceptEventRowRenderer.isInstance(ipv4ConnectionAcceptEvent) &&
            endgameIpv4ConnectionAcceptEventRowRenderer.renderRow({
              data: ipv4ConnectionAcceptEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });
  });

  describe('#createSecurityEventRowRenderer', () => {
    test('it renders an endpoint security log_on event with event.outcome: success', () => {
      const actionName = 'log_on';

      const securityLogOnRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {securityLogOnRowRenderer.isInstance(mockEndpointSecurityLogOnSuccessEvent) &&
            securityLogOnRowRenderer.renderRow({
              data: mockEndpointSecurityLogOnSuccessEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointsuccessfully logged inviaC:\\Program Files\\OpenSSH-Win64\\sshd.exe(90210)'
      );
    });

    test('it renders an endpoint security log_on event with event.outcome: failure', () => {
      const actionName = 'log_on';

      const securityLogOnRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {securityLogOnRowRenderer.isInstance(mockEndpointSecurityLogOnFailureEvent) &&
            securityLogOnRowRenderer.renderRow({
              data: mockEndpointSecurityLogOnFailureEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'win2019-endpointfailed to log inviaC:\\Program Files\\OpenSSH-Win64\\sshd.exe(90210)'
      );
    });

    test('it renders an Endgame user_logon event', () => {
      const actionName = 'user_logon';
      const userLogonEvent = {
        ...mockEndgameUserLogon,
      };

      const userLogonEventRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {userLogonEventRowRenderer.isInstance(userLogonEvent) &&
            userLogonEventRowRenderer.renderRow({
              data: userLogonEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@HD-v1s-d2118419successfully logged inusing logon type5 - Service(target logon ID0x3e7)viaC:\\Windows\\System32\\services.exe(432)as requested by subjectWIN-Q3DOP1UKA81$(subject logon ID0x3e7)4624'
      );
    });

    test('it renders an Endgame admin_logon event', () => {
      const actionName = 'admin_logon';
      const adminLogonEvent = {
        ...mockEndgameAdminLogon,
      };

      const adminLogonEventRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {adminLogonEventRowRenderer.isInstance(adminLogonEvent) &&
            adminLogonEventRowRenderer.renderRow({
              data: adminLogonEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'With special privileges,SYSTEM\\NT AUTHORITY@HD-obe-8bf77f54successfully logged inviaC:\\Windows\\System32\\lsass.exe(964)as requested by subjectSYSTEM\\NT AUTHORITY4672'
      );
    });

    test('it renders an Endgame explicit_user_logon event', () => {
      const actionName = 'explicit_user_logon';
      const explicitUserLogonEvent = {
        ...mockEndgameExplicitUserLogon,
      };

      const explicitUserLogonEventRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {explicitUserLogonEventRowRenderer.isInstance(explicitUserLogonEvent) &&
            explicitUserLogonEventRowRenderer.renderRow({
              data: explicitUserLogonEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'A login was attempted using explicit credentialsArun\\Anvi-AcertoHD-55b-3ec87f66viaC:\\Windows\\System32\\svchost.exe(1736)as requested by subjectANVI-ACER$\\WORKGROUP(subject logon ID0x3e7)4648'
      );
    });

    test('it renders an endpoint security log_off event', () => {
      const actionName = 'log_off';

      const securityLogOffRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {securityLogOffRowRenderer.isInstance(mockEndpointSecurityLogOffEvent) &&
            securityLogOffRowRenderer.renderRow({
              data: mockEndpointSecurityLogOffEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointlogged offviaC:\\Windows\\System32\\lsass.exe(90210)'
      );
    });

    test('it renders an Endgame user_logoff event', () => {
      const actionName = 'user_logoff';
      const userLogoffEvent = {
        ...mockEndgameUserLogoff,
      };

      const userLogoffEventRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {userLogoffEventRowRenderer.isInstance(userLogoffEvent) &&
            userLogoffEventRowRenderer.renderRow({
              data: userLogoffEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'Arun\\Anvi-Acer@HD-55b-3ec87f66logged offusing logon type2 - Interactive(target logon ID0x16db41e)viaC:\\Windows\\System32\\lsass.exe(964)4634'
      );
    });

    test('it does NOT render an event if the action name does not match', () => {
      const actionName = 'does_not_match';
      const userLogonEvent = {
        ...mockEndgameUserLogon,
      };

      const userLogonEventRowRenderer = createSecurityEventRowRenderer({ actionName });

      const wrapper = mount(
        <TestProviders>
          {userLogonEventRowRenderer.isInstance(userLogonEvent) &&
            userLogonEventRowRenderer.renderRow({
              data: userLogonEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });
  });

  describe('#createDnsRowRenderer', () => {
    test('it renders an endpoint network lookup_requested event', () => {
      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(mockEndpointNetworkLookupRequestedEvent) &&
            dnsRowRenderer.renderRow({
              data: mockEndpointNetworkLookupRequestedEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointasked forlogging.googleapis.comwith question typeAviagoogle_osconfig_agent.exe(3272)dns'
      );
    });

    test('it renders an endpoint network lookup_result event', () => {
      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(mockEndpointNetworkLookupResultEvent) &&
            dnsRowRenderer.renderRow({
              data: mockEndpointNetworkLookupResultEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@win2019-endpointasked forlogging.googleapis.comwith question typeAAAAviagoogle_osconfig_agent.exe(3272)dns'
      );
    });

    test('it renders an Endgame DNS request_event', () => {
      const requestEvent = {
        ...mockEndgameDnsRequest,
      };

      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(requestEvent) &&
            dnsRowRenderer.renderRow({
              data: requestEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual(
        'SYSTEM\\NT AUTHORITY@HD-obe-8bf77f54asked forupdate.googleapis.comwith question typeA, which resolved to10.100.197.67viaGoogleUpdate.exe(443192)3008dns'
      );
    });

    test('it renders a non-Endgame DNS event', () => {
      const dnsEvent = {
        ...mockDnsEvent,
      };

      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(dnsEvent) &&
            dnsRowRenderer.renderRow({
              data: dnsEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(extractEuiIconText(removeExternalLinkText(wrapper.text()))).toBe(
        'iot.example.comasked forlookup.example.comwith question typeA, which resolved to10.1.2.3(response code:NOERROR)viaan unknown process6.937500msOct 8, 2019 @ 10:05:23.241Oct 8, 2019 @ 10:05:23.248outbounddns177Budp1:network-community_idSource10.9.9.9:58732(22.60%)40B(77.40%)137BDestination10.1.1.1:53OceaniaAustralia🇦🇺AU'
      );
    });

    test('it does NOT render an event if dns.question.type is not provided', () => {
      const requestEvent = {
        ...mockEndgameDnsRequest,
        dns: {
          ...mockDnsEvent.dns,
          question: {
            name: ['lookup.example.com'],
          },
        },
      };

      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(requestEvent) &&
            dnsRowRenderer.renderRow({
              data: requestEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });

    test('it does NOT render an event if dns.question.name is not provided', () => {
      const requestEvent = {
        ...mockEndgameDnsRequest,
        dns: {
          ...mockDnsEvent.dns,
          question: {
            type: ['A'],
          },
        },
      };

      const dnsRowRenderer = createDnsRowRenderer();

      const wrapper = mount(
        <TestProviders>
          {dnsRowRenderer.isInstance(requestEvent) &&
            dnsRowRenderer.renderRow({
              data: requestEvent,
              scopeId: TimelineId.test,
            })}
        </TestProviders>
      );

      expect(wrapper.text()).toEqual('');
    });
  });
});
