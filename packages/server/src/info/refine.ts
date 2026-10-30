/**
 * Pocket Legends (口袋传奇) 强化 / 精炼 / 祝福油 系统 — L2 plugin layer.
 *
 * Reverse-engineered rules from the original 易语言 game:
 * - 强化 +1 ~ +9 (and beyond): each level consumes 强化石 (untradeable).
 * - +9 以上 requires a 保护符 (protection charm), otherwise failure
 *   downgrades or destroys the item.
 * - 幸运符 (luck charm) adds a flat success-rate bonus.
 * - 祝福油 (blessing oil) rolls one of three outcomes: 成功 (blessed),
 *   诅咒 (cursed), or 无变化 (no change) — confirmed by in-game strings.
 *
 * Kaetram integration: refinement lives on the item instance as `refine`,
 * and is folded into the bonus pool in `equipments.ts` — the same place
 * affixes are aggregated. No engine formula rewrites.
 */

import type { RefineData } from '@kaetram/common/types/item';

/** Highest refinement level reachable without a 保护符. */
export const MAX_REFINE_SAFE = 9;
/** Absolute refinement cap (护栏 — prevents stat inflation). */
export const MAX_REFINE = 12;
/** 祝福油 blessing range. */
export const MAX_BLESSING = 10;

/** Base success rate per target level, indexed by the level being attempted. */
const BASE_RATES: { [level: number]: number } = {
        1: 0.95,
        2: 0.9,
        3: 0.85,
        4: 0.8,
        5: 0.72,
        6: 0.64,
        7: 0.55,
        8: 0.45,
        9: 0.35,
        10: 0.28,
        11: 0.22,
        12: 0.18
    },
    /** 强化石 cost per attempt, indexed by target level. */
    STONE_COST: { [level: number]: number } = {
        1: 1,
        2: 2,
        3: 3,
        4: 5,
        5: 8,
        6: 12,
        7: 18,
        8: 26,
        9: 40,
        10: 60,
        11: 90,
        12: 140
    };

export interface RefineAttempt {
    /** Target level after a successful refine. */
    level: number;
    chance: number;
    /** 强化石 consumed. */
    stones: number;
    /** Whether a 保护符 is mandatory for this attempt. */
    needsProtection: boolean;
}

/**
 * Describes the next refinement step for an item.
 * @param current Current refinement level (0 = unrefined).
 * @param luckyWhether a 幸运符 is being used.
 */
export function getRefineAttempt(current: number, lucky = false): RefineAttempt | undefined {
    let level = current + 1;

    if (level > MAX_REFINE) return undefined;

    let chance = BASE_RATES[level] ?? 0.15,
        stones = STONE_COST[level] ?? 200;

    // 幸运符 adds a flat 15% bonus, capped at 95%.
    if (lucky) chance = Math.min(0.95, chance + 0.15);

    return {
        level,
        chance,
        stones,
        needsProtection: current >= MAX_REFINE_SAFE
    };
}

/** Stat multiplier contributed by a refinement level (linear +8% per level). */
export function refineMultiplier(level: number): number {
    return 1 + level * 0.08;
}

/** Accuracy/crit bonus granted by a positive blessing (幸运). */
export function blessingBonus(blessing = 0): number {
    return Math.max(-MAX_BLESSING, Math.min(MAX_BLESSING, blessing)) * 0.01;
}

/**
 * Blessed items hit their damage ceiling more often; cursed ones hit the floor.
 * @returns 0~1 weight used to skew the damage roll in formulas.
 */
export function blessingWeight(refine?: RefineData): number {
    if (!refine?.blessing) return 0.5;

    return Math.max(0, Math.min(1, 0.5 + refine.blessing * 0.05));
}

/**
 * Rolls a 祝福油 application. Three outcomes, matching the original game:
 * 成功 (blessed) / 诅咒 (cursed) / 无变化 (no change).
 */
export function rollBlessingOil(current = 0): {
    result: 'blessed' | 'cursed' | 'none';
    value: number;
} {
    let roll = Math.random();

    if (roll < 0.4) {
        let value = Math.min(
            MAX_BLESSING,
            Math.max(1, current + 1 + Math.floor(Math.random() * 3))
        );
        return { result: 'blessed', value };
    }

    if (roll < 0.7) {
        let value = Math.max(
            -MAX_BLESSING,
            Math.min(-1, current - 1 - Math.floor(Math.random() * 3))
        );
        return { result: 'cursed', value };
    }

    return { result: 'none', value: current };
}

/** Chinese display name for a refinement level, e.g. `+7`. */
export function refineName(refine?: RefineData): string {
    if (!refine?.level) return '';

    return `+${refine.level}`;
}
