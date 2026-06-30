import type { Filter } from '@kbn/es-query';
import type { EuiContextMenuPanelItemDescriptor } from '@elastic/eui/src/components/context_menu/context_menu';
type BaseContextMenuItem = Omit<EuiContextMenuPanelItemDescriptor, 'name' | 'title'>;
export interface QuickFilter extends BaseContextMenuItem {
    name: string;
    filter: Filter;
}
export interface QuickFiltersGroup extends BaseContextMenuItem {
    title: string;
    items: QuickFiltersMenuItem[];
}
export type QuickFiltersMenuItem = QuickFiltersGroup | QuickFilter;
export declare const isQuickFiltersGroup: (quickFiltersMenuItem: QuickFiltersMenuItem) => quickFiltersMenuItem is QuickFiltersGroup;
export {};
