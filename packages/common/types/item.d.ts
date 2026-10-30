export interface Enchantment {
    level: number;
}

export interface Enchantments {
    [id: number]: Enchantment;
}

/**
 * Pocket Legends (口袋传奇) 强化系统 refine levels.
 * +1 ~ +9: 强化石消耗递增, +9 以上需要保护符.
 * 祝福油 blessing: -10 (诅咒) ~ +10 (幸运), 0 = 普通.
 */
export interface RefineData {
    /** Refinement level, 0 = unrefined, max 9 (or higher with 保护符). */
    level: number;
    /** 祝福油 roll: negative = 诅咒, positive = 幸运. */
    blessing?: number;
}

/**
 * Pocket Legends (口袋传奇) affix system: random affixes generated
 * server-side on drop. Max 3 affixes per item, each +1~+7 strength.
 */
export interface Affix {
    /** Affix identifier, e.g. 'attackSpeed', 'critical', 'lifesteal'. */
    key: string;
    /** Strength tier 1~7. */
    level: number;
    /** Resolved numeric value for this affix at its level. */
    value: number;
}

export interface Light {
    outer?: LampData;
    inner?: LampData;
}

export interface ContainerItem {
    index: number;
    key: string;
    count: number;
    enchantments: Enchantments;
    /** Pocket Legends random affixes (max 3, +1~+7 each). */
    affixes?: Affix[];
    /** Pocket Legends 强化等级 + 祝福油 (L2 refine system). */
    refine?: RefineData;
}

export interface Stats {
    crush: number;
    slash: number;
    stab: number;
    archery: number;
    magic: number;
}

export interface Bonuses {
    accuracy: number;
    strength: number;
    archery: number;
    magic: number;
}

// This is for items that have a lamp effect.
export interface LampData {
    distance: number;
    colour: string;

    flickerSpeed: number;
    flickerIntensity: number;
}

export interface ItemData {
    type: string;
    name: string;
    stackable?: boolean;
    edible?: boolean;
    interactable?: boolean;
    maxStackSize?: number;
    plugin?: string;
    price?: number;
    storeCount?: number;
    skill?: string; // Skill requirement for the item.
    level?: number; // Requirement level for the item.
    achievement?: string; // Achievement required to use the item.
    quest?: string; // Quest requirement for the item.
    attackRate?: number;
    twoHanded?: boolean;
    poisonous?: boolean;
    freezing?: boolean;
    burning?: boolean;
    light?: Light;
    movementModifier?: number;
    lumberjacking?: number;
    mining?: number;
    fishing?: number;
    healAmount?: number;
    healPercent?: number;
    manaAmount?: number;
    spriteName?: string;
    bonuses?: Bonuses;
    attackStats?: Stats;
    defenseStats?: Stats;
    undroppable?: boolean;
    respawnDelay?: number;
    attackRange?: number;
    projectileName?: string;
    description?: string;
    manaCost?: number;
    weaponType?: string;
    smallBowl?: boolean;
    mediumBowl?: boolean;
    pet?: string;
    effect?: string;
    duration?: number;
}
