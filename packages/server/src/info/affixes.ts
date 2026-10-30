/**
 * Pocket Legends (口袋传奇) affix generator + aggregation.
 * Generates random affixes server-side when a kd_* item drops, and
 * aggregates affixes into the bonus pool used by formulas.
 *
 * Rules (from static reverse-engineering of the original game):
 * - Max 3 affixes per item.
 * - Each affix has strength level +1 ~ +7 (+7 = 小极品上限).
 * - Affix pool unlocks progressively with the item tier.
 * - Items with an affix level >= 3 are auto-pickup eligible.
 */

import type { Affix } from '@kaetram/common/types/item';

export interface AffixDef {
    key: string;
    /** Display name (zh). */
    name: string;
    /** Base value at level 1, multiplied by level. */
    base: number;
    /** Whether higher value is a penalty-style stat (unused for now). */
    percent?: boolean;
    /** Minimum tier required for this affix to appear. */
    minTier: number;
}

export const TIER_ORDER = [
    '新手',
    '沃玛',
    '祖玛',
    '高级',
    '赤月',
    '魔龙',
    '雷炎',
    '火龙',
    '狐月',
    '主宰'
];

export const MAX_AFFIXES = 3;
export const MAX_AFFIX_LEVEL = 7;
/** Affix level at which loot is auto-picked up. */
export const AUTOPICK_LEVEL = 3;

const POOL: AffixDef[] = [
    { key: 'attack', name: '攻击', base: 1, minTier: 0 },
    { key: 'magic', name: '魔法', base: 1, minTier: 0 },
    { key: 'tao', name: '道术', base: 1, minTier: 0 },
    { key: 'attackSpeed', name: '攻速', base: 1, percent: true, minTier: 1 },
    { key: 'castingSpeed', name: '施法', base: 1, percent: true, minTier: 1 },
    { key: 'damagePercent', name: '攻击伤害', base: 2, percent: true, minTier: 2 },
    { key: 'accuracy', name: '准确', base: 1, minTier: 0 },
    { key: 'lucky', name: '幸运', base: 1, minTier: 2 },
    { key: 'critical', name: '致命一击', base: 1, percent: true, minTier: 3 },
    { key: 'magicDodge', name: '魔法躲避', base: 2, percent: true, minTier: 2 },
    { key: 'poisonDodge', name: '毒物躲避', base: 2, percent: true, minTier: 2 },
    { key: 'agility', name: '敏捷', base: 1, minTier: 1 },
    { key: 'hpRegen', name: '回血', base: 1, minTier: 1 },
    { key: 'mpRegen', name: '回蓝', base: 1, minTier: 1 },
    { key: 'damageAbsorb', name: '伤害吸收', base: 1, percent: true, minTier: 3 },
    { key: 'damageReduce', name: '减免', base: 1, percent: true, minTier: 3 },
    { key: 'block', name: '格挡', base: 1, minTier: 2 },
    { key: 'sunder', name: '切割', base: 2, minTier: 3 },
    { key: 'lifesteal', name: '吸血', base: 1, percent: true, minTier: 4 },
    { key: 'paralyze', name: '造成麻痹', base: 1, percent: true, minTier: 4 },
    { key: 'paralyzeImmune', name: '防止麻痹', base: 1, percent: true, minTier: 4 },
    { key: 'revive', name: '复活', base: 1, percent: true, minTier: 6 },
    { key: 'guard', name: '护身', base: 1, percent: true, minTier: 4 },
    { key: 'burn', name: '灼烧', base: 1, minTier: 5 }
];

/**
 * Generates between 0-3 random affixes for an item of the given tier.
 * `qualityBonus` (0~1) shifts probability upward (极品加成).
 */
export function generateAffixes(tier: string, qualityBonus = 0): Affix[] {
    let tierIndex = Math.max(0, TIER_ORDER.indexOf(tier)),
        maxCount = Math.min(
            MAX_AFFIXES,
            1 + Math.floor(tierIndex / 2) + (Math.random() < qualityBonus ? 1 : 0)
        );

    if (maxCount <= 0) return [];

    let pool = POOL.filter((def) => def.minTier <= tierIndex),
        count = Math.max(1, Math.round(maxCount * (0.35 + Math.random() * 0.65))),
        affixes: Affix[] = [],
        used = new Set<string>();

    while (affixes.length < Math.min(count, MAX_AFFIXES) && used.size < pool.length) {
        let def = pool[Math.floor(Math.random() * pool.length)];
        if (used.has(def.key)) continue;
        used.add(def.key);

        // Level distribution skews low; qualityBonus pushes toward +7.
        let roll = Math.random() - qualityBonus * 0.5,
            level =
                roll < 0.55 ? 1 + Math.floor(Math.random() * 3) : 4 + Math.floor(Math.random() * 4);
        level = Math.min(MAX_AFFIX_LEVEL, Math.max(1, level));

        affixes.push({ key: def.key, level, value: Math.round(def.base * level * 100) / 100 });
    }

    return affixes;
}

/** Lowest affix level on the item (or 0 if plain) — used for auto-pickup rules. */
export function affixQuality(affixes: Affix[] | undefined): number {
    if (!affixes || affixes.length === 0) return 0;
    return Math.max(...affixes.map((a) => a.level));
}

export function isAutoPickup(affixes: Affix[] | undefined): boolean {
    return affixQuality(affixes) >= AUTOPICK_LEVEL;
}
