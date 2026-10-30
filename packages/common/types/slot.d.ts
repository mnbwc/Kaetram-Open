import type { Affix, Bonuses, Enchantments, RefineData, Stats } from './item';

export type SlotType = 'inventory' | 'bank';

export interface SerializedContainer {
    username?: string;
    slots: SlotData[];
}

export interface SlotData {
    index: number;
    key: string;
    count: number;
    enchantments: Enchantments;
    name?: string;
    description?: string;
    edible?: boolean;
    interactable?: boolean;
    equippable?: boolean;
    price?: number;
    attackStats?: Stats;
    defenseStats?: Stats;
    bonuses?: Bonuses;
    /** Pocket Legends random affixes. */
    affixes?: Affix[];
    /** Pocket Legends 强化 + 祝福油. */
    refine?: RefineData;
    /** Sprite override (spriteName in items.json) for rendering. */
    spriteName?: string;
}
