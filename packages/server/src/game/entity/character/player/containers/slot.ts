import Utils from '@kaetram/common/util/utils';
import { Modules } from '@kaetram/common/network';
import log from '@kaetram/common/util/log';

import type Item from '../../../objects/item';
import type { SlotData } from '@kaetram/common/types/slot';
import type { Affix, Bonuses, Enchantments, RefineData, Stats } from '@kaetram/common/types/item';

export default class Slot {
    public edible = false;
    public interactable = false;
    public equippable = false;

    public name = '';
    public description = '';
    public attackStats: Stats = Utils.getEmptyStats();
    public defenseStats: Stats = Utils.getEmptyStats();
    public bonuses: Bonuses = Utils.getEmptyBonuses();

    // Max amount of an item we can put in a slot.
    public maxStackSize = Modules.Constants.MAX_STACK;

    // Pocket Legends random affixes.
    public affixes?: Affix[];

    // Pocket Legends 强化等级 + 祝福油.
    public refine?: RefineData;

    // Sprite override (spriteName in items.json) for client rendering.
    public spriteName = '';

    public constructor(
        public index: number,
        public key = '',
        public count = -1,
        public enchantments: Enchantments = {}
    ) {}

    /**
     * Takes an item as a parameter and places all of that data in
     * the current slot. Once finished, we send a callback to despawn
     * the item from the world.
     * @param item An item object that we extract data from.
     */

    public update(item: Item, stackSize = item.maxStackSize): void {
        if (!item.exists)
            return log.info(`Item doesn't exist: ${item.key}, deleting from existence.`);

        this.key = item.key;
        this.count = Math.min(item.count, stackSize);
        this.enchantments = item.enchantments;
        this.affixes = item.affixes;
        this.refine = item.refine;

        // Sprite override so the client renders the correct icon.
        if (item.spriteName) this.spriteName = item.spriteName;

        this.edible = item.edible;
        this.interactable = item.interactable;
        this.equippable = item.isEquippable();

        this.name = item.name;
        this.description = item.description;
        this.attackStats = item.attackStats;
        this.defenseStats = item.defenseStats;
        this.bonuses = item.bonuses;

        this.maxStackSize = stackSize;

        if (this.count < 1) log.error('Updating slot with count less than 1:', item.key);

        item.despawn(true); // Despawn signal towards the item once we update the slot.
    }

    /**
     * Tries to add an amount to the current count in the slot.
     * @param amount The amount of an item to add.
     * @returns The amount of the item we added.
     */

    public add(amount: number): number {
        this.count = Math.min((this.count > 0 ? this.count : 0) + amount, this.maxStackSize);

        return this.count;
    }

    /**
     * Removes an amount from the count in the slot.
     * @param amount Amount we are removing from the slot.
     * @returns The amount of the item we removed.
     */

    public remove(amount: number): number {
        if (this.isEmpty(this.count - amount)) return this.count;

        this.count -= amount;

        return amount;
    }

    /**
     * Clears all the variables in the slot and returns
     * them back to their default state (if the slot is emptied).
     */

    public clear(): void {
        this.key = '';
        this.count = -1;
        this.enchantments = {};

        this.edible = false;
        this.interactable = false;
        this.equippable = false;
        this.maxStackSize = Modules.Constants.MAX_STACK;

        this.name = '';
        this.description = '';
        this.attackStats = Utils.getEmptyStats();
        this.defenseStats = Utils.getEmptyStats();
        this.bonuses = Utils.getEmptyBonuses();
    }

    /**
     * Checks if there is any room left in the current slot.
     * @param count Optional parameter to check against.
     * @returns If the count in the slot are greater or equal to max stack.
     */

    public isFull(count = this.count): boolean {
        return count > this.maxStackSize;
    }

    /**
     * Checks if the slot is empty. If the `count` parameter is specified
     * it checks if that variable is empty.
     * @param count Optional parameter to check against.
     * @returns If the slot is empty.
     */

    public isEmpty(count = this.count): boolean {
        return count < 1;
    }

    /**
     * @returns Whether or not the item in the slot is a shard.
     */

    public isShard(): boolean {
        return this.key.includes('shardt');
    }

    /**
     * @returns Whether or not the slot contains any enchantments.
     */

    public isEnchanted(): boolean {
        return Object.keys(this.enchantments).length > 0;
    }

    /**
     * Returns the data in the slot in the form of a SlotData object.
     * @param clientInfo Whether or not to send the client information.
     * @returns SlotData interface object.
     */

    public serialize(clientInfo = false): SlotData {
        // Base data that is always sent to the client.
        let data: SlotData = {
            index: this.index,
            key: this.key,
            count: this.count,
            enchantments: this.enchantments
        };

        if (this.affixes) data.affixes = this.affixes;
        if (this.refine) data.refine = this.refine;

        if (clientInfo) {
            data.name = this.name;
            if (this.spriteName) data.spriteName = this.spriteName;
            data.description = this.description;
            data.edible = this.edible;
            data.interactable = this.interactable;
            data.equippable = this.equippable;
            data.attackStats = this.attackStats;
            data.defenseStats = this.defenseStats;
            data.bonuses = this.bonuses;
        }

        return data;
    }
}
