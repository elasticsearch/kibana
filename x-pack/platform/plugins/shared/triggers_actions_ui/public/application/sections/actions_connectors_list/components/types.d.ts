import type { ActionConnector, EditConnectorTabs } from '../../../../types';
export interface EditConnectorProps {
    initialConnector?: ActionConnector;
    tab?: EditConnectorTabs;
    isFix?: boolean;
}
