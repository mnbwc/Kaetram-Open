import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';

import type { SqliteStore } from './store';
import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { GuildData } from '@kaetram/common/network/impl/guild';
import type { SerializedAbility } from '@kaetram/common/network/impl/ability';
import type { StatisticsData } from '@kaetram/common/types/statistics';
import type {
    AchievementData,
    SerializedAchievement
} from '@kaetram/common/network/impl/achievement';
import type { QuestData, SerializedQuest } from '@kaetram/common/network/impl/quest';
import type { SerializedSkills, SkillData } from '@kaetram/common/network/impl/skill';
import type { SerializedContainer, SlotData } from '@kaetram/common/types/slot';
import type { EquipmentData, SerializedEquipment } from '@kaetram/common/network/impl/equipment';

/**
 * SQLite variant of the MongoDB loader. Loads serialized player data from
 * the document store and hands it back to the caller via callbacks. All
 * operations are synchronous under the hood but keep the callback interface
 * of the MongoDB version.
 */

export default class Loader {
    public constructor(private store?: SqliteStore) {}

    /**
     * Generalized function for loading raw document data for a username.
     * Passes an empty array when no data is found (matching the MongoDB
     * backend's behaviour).
     */

    public load(username: string, collection: string, callback: (data?: never) => void): void {
        if (!this.store || config.skipDatabase) return callback();

        let data = this.store.get(collection, username);

        callback((data ?? []) as never);
    }

    /**
     * GM panel: reads a raw player document (e.g. `player_info`) for
     * offline moderation, returning undefined when the player doesn't exist.
     */

    public getDocument<T = { [key: string]: unknown }>(
        collection: string,
        key: string
    ): T | undefined {
        return this.store?.get<T>(collection, key);
    }

    /**
     * GM panel: writes a raw player document (e.g. setting `ban` on an
     * offline player's `player_info` entry).
     */

    public putDocument(collection: string, key: string, data: unknown): void {
        this.store?.put(collection, key, data);
    }

    /**
     * Loads the equipment data of a player.
     */

    public loadEquipment(
        player: Player,
        callback: (info: EquipmentData[]) => void
    ): Promise<EquipmentData[]> {
        this.load(player.username, 'player_equipment', (info: unknown) => {
            if (!info) {
                log.debug(`[player_equipment] No equipment found for ${player.username}.`);
                return callback([]);
            }

            let doc = (Array.isArray(info) ? info[0] : info) as SerializedEquipment | undefined;

            callback(doc?.equipments ?? []);
        });

        return Promise.resolve([]);
    }

    /**
     * Loads the inventory data of a player.
     */

    public loadInventory(
        player: Player,
        callback: (inventoryData: SlotData[]) => void
    ): Promise<SlotData[]> {
        this.load(player.username, 'player_inventory', (info: unknown) => {
            if (!info) {
                log.debug(`[player_inventory] No inventory found for ${player.username}.`);
                return callback([]);
            }

            let doc = (Array.isArray(info) ? info[0] : info) as SerializedContainer | undefined;

            callback(doc?.slots ?? []);
        });

        return Promise.resolve([]);
    }

    /**
     * Loads the bank data of a player.
     */

    public loadBank(player: Player, callback: (bankData: SlotData[]) => void): Promise<SlotData[]> {
        this.load(player.username, 'player_bank', (info: unknown) => {
            if (!info) {
                log.debug(`[player_bank] No bank found for ${player.username}.`);
                return callback([]);
            }

            let doc = (Array.isArray(info) ? info[0] : info) as SerializedContainer | undefined;

            callback(doc?.slots ?? []);
        });

        return Promise.resolve([]);
    }

    /**
     * Loads the quest data of a player.
     */

    public loadQuests(player: Player): Promise<QuestData[]> {
        if (!this.store || config.skipDatabase) return Promise.resolve([]);

        let info = this.store.get<{ quests: QuestData[] }>('player_quests', player.username);

        if (!info) {
            log.debug(`[player_quests] No data found for ${player.username}.`);
            return Promise.resolve([]);
        }

        return Promise.resolve(info.quests ?? []);
    }

    /**
     * Loads the achievement data of a player.
     */

    public loadAchievements(player: Player): Promise<AchievementData[]> {
        if (!this.store || config.skipDatabase) return Promise.resolve([]);

        let info = this.store.get<{ achievements: AchievementData[] }>(
            'player_achievements',
            player.username
        );

        if (!info) {
            log.debug(`[player_achievements] No data found for ${player.username}.`);
            return Promise.resolve([]);
        }

        return Promise.resolve(info.achievements ?? []);
    }

    /**
     * Loads the skill data of a player.
     */

    public loadSkills(player: Player, callback: (skills: SkillData[]) => void): void {
        this.load(player.username, 'player_skills', (info: unknown) => {
            let doc = (Array.isArray(info) ? info[0] : info) as SerializedSkills | undefined;

            if (!doc) {
                log.debug(`[player_skills] No skills found for ${player.username}.`);
                return callback([]);
            }

            callback(doc.skills ?? []);
        });
    }

    /**
     * Loads the statistics data of a player.
     */

    public loadStatistics(player: Player, callback: (statistics: StatisticsData) => void): void {
        this.load(player.username, 'player_statistics', (info: unknown) => {
            if (!info) {
                log.debug(`[player_statistics] No statistics found for ${player.username}.`);
                return callback({} as StatisticsData);
            }

            let doc = (Array.isArray(info) ? info[0] : info) as
                | { statistics: StatisticsData }
                | undefined;

            callback(doc?.statistics ?? ({} as StatisticsData));
        });
    }

    /**
     * Loads the ability data of a player.
     */

    public loadAbilities(player: Player, callback: (abilities: SerializedAbility) => void): void {
        this.load(player.username, 'player_abilities', (info: unknown) => {
            // New players have no ability data — pass an empty container so
            // `abilities.load()` doesn't crash on a missing document.
            if (!info) {
                log.debug(`[player_abilities] No abilities found for ${player.username}.`);
                return callback({ abilities: [] });
            }

            let doc = (Array.isArray(info) ? info[0] : info) as SerializedAbility | undefined;

            callback(doc ?? { abilities: [] });
        });
    }

    /**
     * Searches for a guild in the database and returns it.
     */

    public async loadGuild(identifier: string): Promise<GuildData | undefined> {
        if (!this.store || config.skipDatabase) return;

        return this.store.get<GuildData>('guilds', identifier);
    }

    /**
     * Loads all guilds (pagination is applied client-side).
     */

    public loadGuilds(
        from: number,
        to: number,
        callback: (guilds: GuildData[], total: number) => void
    ): void {
        if (!this.store || config.skipDatabase) return callback([], 0);

        let info = this.store.all<GuildData>('guilds');

        callback(info.slice(from, to), info.length);
    }

    /**
     * Finds a guild based on the owner's username.
     */

    public findGuildByOwner(owner: string, callback: (guild?: GuildData) => void): void {
        if (!this.store || config.skipDatabase) return callback();

        let guilds = this.store.all<GuildData>('guilds').filter((guild) => guild.owner === owner);

        if (guilds.length > 1) log.warning(`[Guilds] Duplicate entry for ${owner}.`);

        if (guilds.length === 0) return callback();

        callback(guilds[0]);
    }
}
