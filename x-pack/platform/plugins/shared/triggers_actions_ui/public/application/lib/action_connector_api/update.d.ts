import type { HttpSetup } from '@kbn/core/public';
import type { ActionConnector, ActionConnectorWithoutId } from '../../../types';
export declare function updateActionConnector({ http, connector, id, }: {
    http: HttpSetup;
    connector: Pick<ActionConnectorWithoutId, 'name' | 'config' | 'secrets'>;
    id: string;
}): Promise<ActionConnector>;
