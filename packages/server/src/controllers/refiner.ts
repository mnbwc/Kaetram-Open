/**
 * Pocket Legends (口袋传奇) 强化控制器 — L2 plugin layer.
 *
 * Chat-command driven refine system (强化 / 祝福油), mirroring the original
 * game's enchanter NPC flow:
 *   /强化 <itemIndex>          — attempt a refinement (consumes 强化石).
 *   /强化 <itemIndex> 幸运     — use a 幸运符 for +15% success rate.
 *   /祝福油 <itemIndex>        — roll 祝福油 (blessed/cursed/no change).
 *
 * 强化石 / 幸运符 / 保护符 / 祝福油 are inventory items keyed:
 *   kd_stone (强化石), kd_luckycharm (幸运符), kd_protection (保护符),
 *   kd_blessingoil (祝福油).
 */

import { getRefineAttempt, rollBlessingOil, MAX_REFINE_SAFE } from '../info/refine';

import Utils from '@kaetram/common/util/utils';
import log from '@kaetram/common/util/log';

import type Item from '../game/entity/objects/item';
import type Player from '../game/entity/character/player/player';

const KEYS = {
    stone: 'kd_stone',
    lucky: 'kd_luckycharm',
    protection: 'kd_protection',
    oil: 'kd_blessingoil'
};

export default class Refiner {
    /**
     * Attempts to refine (强化) the item at `index` in the player's inventory.
     * @param player The refining player.
     * @param index Inventory index of the equippable item.
     * @param lucky Whether a 幸运符 is being used.
     */
    public refine(player: Player, index = -1, lucky = false): void {
        if (index === -1 || isNaN(index)) return player.notify('强化：请指定要强化的装备。');

        let slot = player.inventory.get(index);

        if (!slot?.key || !slot.equippable) return player.notify('强化：该物品无法强化。');

        let current = slot.refine?.level ?? 0,
            attempt = getRefineAttempt(current, lucky);

        if (!attempt) return player.notify('强化：该装备已达到强化上限。');

        // Consume 强化石.
        if (!this.consume(player, KEYS.stone, attempt.stones))
            return player.notify(`强化：需要 ${attempt.stones} 个强化石。`);

        // +9 以上必须消耗保护符，否则失败会降级。
        let usedProtection = false;

        if (attempt.needsProtection) {
            if (!this.consume(player, KEYS.protection, 1))
                return player.notify(`强化：+${attempt.level} 及以上需要 1 个保护符。`);

            usedProtection = true;
        }

        if (lucky && !this.consume(player, KEYS.lucky, 1))
            return player.notify('强化：背包里没有幸运符。');

        // Roll for success.
        if (Math.random() >= attempt.chance) {
            if (usedProtection)
                // 保护符 protects the level but the attempt is lost.
                player.notify(`强化失败：保护符生效，强化等级保持 +${current}。`);
            else if (current > 0 && current >= MAX_REFINE_SAFE) {
                // Above safe threshold without protection: downgrade.
                slot.refine = { level: current - 1, blessing: slot.refine?.blessing };
                player.notify(`强化失败：装备降级至 +${current - 1}。`);
            } else player.notify('强化失败：材料已消耗。');

            player.inventory.loadCallback?.();
            return;
        }

        // Success. Write directly onto the slot (getItem() returns a throwaway copy).
        slot.refine = { level: attempt.level, blessing: slot.refine?.blessing };
        player.notify(`强化成功：${slot.name ?? slot.key} → +${attempt.level}！`);
        player.inventory.loadCallback?.();

        log.debug(`[refiner] ${player.username} refined ${slot.key} to +${attempt.level}.`);
    }

    /**
     * Applies 祝福油 to the item at `index`: 成功 / 诅咒 / 无变化.
     */
    public blessingOil(player: Player, index = -1): void {
        if (index === -1 || isNaN(index)) return player.notify('祝福油：请指定装备。');

        let slot = player.inventory.get(index);

        if (!slot?.key || !slot.equippable) return player.notify('祝福油：该物品无法祝福。');

        if (!this.consume(player, KEYS.oil, 1)) return player.notify('祝福油：背包里没有祝福油。');

        let current = slot.refine?.blessing ?? 0,
            outcome = rollBlessingOil(current);

        switch (outcome.result) {
            case 'blessed': {
                slot.refine = { level: slot.refine?.level ?? 0, blessing: outcome.value };
                player.notify(`祝福成功：装备获得 +${outcome.value} 幸运祝福！`);
                break;
            }

            case 'cursed': {
                slot.refine = { level: slot.refine?.level ?? 0, blessing: outcome.value };
                player.notify(`祝福失败：装备被诅咒（${outcome.value}）。`);
                break;
            }

            default: {
                player.notify('祝福无变化。');
                break;
            }
        }

        player.inventory.loadCallback?.();
    }

    /**
     * Removes `count` of `key` from the player's inventory.
     * @returns Whether the full amount was found and removed.
     */
    private consume(player: Player, key: string, count: number): boolean {
        if (!player.inventory.hasItem(key, count)) return false;

        player.inventory.removeItem(key, count);

        return true;
    }
}

// Keep Utils import alive for future packet work.
void Utils;
