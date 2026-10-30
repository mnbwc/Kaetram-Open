import type { Affix } from './item';

/**
 * Pocket Legends affix definitions shared between client (tooltip display)
 * and server (generation/aggregation). Keep in sync with
 * packages/server/src/info/affixes.ts POOL entries.
 */

export interface AffixDef {
    key: string;
    /** Display name (zh). */
    name: string;
    /** Whether the value is a percentage bonus. */
    percent?: boolean;
}

export const AFFIX_LABELS: Record<string, AffixDef> = {
    attack: { key: 'attack', name: '攻击' },
    magic: { key: 'magic', name: '魔法' },
    tao: { key: 'tao', name: '道术' },
    attackSpeed: { key: 'attackSpeed', name: '攻速', percent: true },
    castingSpeed: { key: 'castingSpeed', name: '施法', percent: true },
    damagePercent: { key: 'damagePercent', name: '攻击伤害', percent: true },
    accuracy: { key: 'accuracy', name: '准确' },
    lucky: { key: 'lucky', name: '幸运' },
    critical: { key: 'critical', name: '致命一击', percent: true },
    magicDodge: { key: 'magicDodge', name: '魔法躲避', percent: true },
    poisonDodge: { key: 'poisonDodge', name: '毒物躲避', percent: true },
    agility: { key: 'agility', name: '敏捷' },
    hpRegen: { key: 'hpRegen', name: '回血' },
    mpRegen: { key: 'mpRegen', name: '回蓝' },
    damageAbsorb: { key: 'damageAbsorb', name: '伤害吸收', percent: true },
    damageReduce: { key: 'damageReduce', name: '减免', percent: true },
    block: { key: 'block', name: '格挡' },
    sunder: { key: 'sunder', name: '切割' },
    lifesteal: { key: 'lifesteal', name: '吸血', percent: true },
    paralyze: { key: 'paralyze', name: '造成麻痹', percent: true },
    paralyzeImmune: { key: 'paralyzeImmune', name: '防止麻痹', percent: true },
    revive: { key: 'revive', name: '复活', percent: true },
    guard: { key: 'guard', name: '护身', percent: true },
    burn: { key: 'burn', name: '灼烧' }
};

/** Formats an affix as `名称 +N` (or `名称 +N%` for percentage affixes). */
export function formatAffix(affix: Affix): string {
    let def = AFFIX_LABELS[affix.key];

    if (!def) return `${affix.key} +${affix.value}`;

    return def.percent
        ? `${def.name} +${affix.value}%`
        : `${def.name} +${affix.value}`;
}
