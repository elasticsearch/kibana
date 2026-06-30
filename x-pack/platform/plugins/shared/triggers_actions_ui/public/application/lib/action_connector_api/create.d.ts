import type { HttpSetup } from '@kbn/core/public';
import type { ActionConnector, ActionConnectorWithoutId } from '../../../types';
export declare function createActionConnector({ http, connector, id, }: {
    http: HttpSetup;
    connector: Pick<ActionConnectorWithoutId, 'actionTypeId' | 'name' | 'config' | 'secrets'>;
    id?: string;
}): Promise<ActionConnector>;
