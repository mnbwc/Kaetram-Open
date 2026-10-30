import log from '@kaetram/common/util/log';
import Utils from '@kaetram/common/util/utils';
import config from '@kaetram/common/config';

import type { SqliteStore } from './store';
import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { Modules } from '@kaetram/common/network';
import type { GuildData } from '@kaetram/common/network/impl/guild';
import type { SerializedEffects } from '@kaetram/common/types/status';

// Used for password reset
export interface ResetToken {
    token: string;
    expiration: number;
}

export interface PoisonInfo {
    type: number; // Type of poison.
    remaining: number; // How much of the poison is left.
}

export interface PlayerInfo {
    username: string;
    password: string;
    email: string;
    x: number;
    y: number;
    userAgent: string;
    rank: Modules.Ranks;
    poison: PoisonInfo;
    effects: SerializedEffects;
    hitPoints: number;
    mana: number;
    orientation: Modules.Orientation;
    ban: number;
    jail: number;
    mute: number;
    lastWarp: number;
    mapVersion: number;
    regionsLoaded: number[];
    friends: string[];
    lastServerId: number;
    lastAddress: string;
    lastGlobalChat: number;
    guild: string;
    pet: string;
    resetToken?: ResetToken;
}

/**
 * SQLite variant of the MongoDB creator. Serializes player data and stores
 * it into the document store, one document per player per collection.
 */

export default class Creator {
    public constructor(private store: SqliteStore) {}

    /**
     * Takes every information about the player and saves it. Individual
     * objects such as equipment, inventory, bank, etc. are stored in
     * separate collections for organization purposes.
     */

    public save(player: Player): void {
        try {
            log.debug(`Saving player information for ${player.username}.`);

            this.saveInfo(player);
            this.saveEquipment(player);
            this.saveInventory(player);
            this.saveBank(player);
            this.saveQuests(player);
            this.saveAchievements(player);
            this.saveSkills(player);
            this.saveStatistics(player);
            this.saveAbilities(player);
        } catch (error: unknown) {
            log.error(`Could not save data for ${player.username}.`);
            log.error(error);
        }
    }

    /**
     * Saves the basic variable information about the player.
     */

    private saveInfo(player: Player): void {
        this.getPlayerWithHash(player, (playerInfo: PlayerInfo) => {
            this.store.put('player_info', player.username, playerInfo);
        });
    }

    /**
     * Saves the equipment data of a player.
     */

    private saveEquipment(player: Player): void {
        this.store.put('player_equipment', player.username, player.equipment.serialize());
    }

    /**
     * Saves the inventory data of a player.
     */

    private saveInventory(player: Player): void {
        this.store.put('player_inventory', player.username, player.inventory.serialize());
    }

    /**
     * Saves the bank data of a player.
     */

    private saveBank(player: Player): void {
        this.store.put('player_bank', player.username, player.bank.serialize());
    }

    /**
     * Saves the quest data of a player.
     */

    private saveQuests(player: Player): void {
        this.store.put('player_quests', player.username, player.quests.serialize());
    }

    /**
     * Saves the achievement data of a player.
     */

    private saveAchievements(player: Player): void {
        this.store.put('player_achievements', player.username, player.achievements.serialize());
    }

    /**
     * Saves the skill data of a player.
     */

    private saveSkills(player: Player): void {
        this.store.put('player_skills', player.username, player.skills.serialize());
    }

    /**
     * Saves the statistics data of a player.
     */

    private saveStatistics(player: Player): void {
        this.store.put('player_statistics', player.username, player.statistics.serialize());
    }

    /**
     * Saves the ability data of a player.
     */

    private saveAbilities(player: Player): void {
        this.store.put('player_abilities', player.username, player.abilities.serialize());
    }

    /**
     * Saves the guild to the guild collection.
     */

    public saveGuild(guild: GuildData, callback?: () => void): void {
        try {
            this.store.put('guilds', guild.identifier, guild);

            callback?.();
        } catch (error: unknown) {
            log.error(`An error occurred while saving guild ${guild.name}.`);
            log.error(error);
        }
    }

    /**
     * Serializes a player object and uses the bcrypt hashing to replace
     * the plaintext password with the hashed one.
     */

    public getPlayerWithHash(player: Player, callback: (playerInfo: PlayerInfo) => void): void {
        let info = Creator.serialize(player);

        Utils.hash(player.password, (hash: string) => {
            info.password = hash;

            callback(info);
        });
    }

    /**
     * Verifies the user's username, password, and email server-sided
     * to make sure the registration process does not encounter issues.
     */

    public static verifyPlayer(player: Player): boolean {
        if (!Utils.isValidUsername(player.username)) return false;
        if (!player.username || player.username.length === 0) return false;
        if (!player.password || player.password.length < 3 || player.password.length > 64)
            return false;
        if (!Utils.isEmail(player.email)) return false;

        return true;
    }

    /**
     * Serializes a player object and extracts all the basic information
     * that will be saved in the database.
     */

    public static serialize(player: Player): PlayerInfo {
        return {
            username: player.username,
            password: player.password,
            email: player.email,
            x: player.x,
            y: player.y,
            userAgent: player.userAgent,
            rank: player.rank,
            poison: {
                type: player.poison ? player.poison.type : -1,
                remaining: player.poison ? player.poison.getRemainingTime() : -1
            },
            effects: player.status.serialize(),
            hitPoints: player.hitPoints.getHitPoints(),
            mana: player.mana.getMana(),
            orientation: player.orientation,
            ban: player.ban,
            mute: player.mute,
            jail: player.jail,
            lastWarp: player.lastWarp,
            mapVersion: player.mapVersion,
            regionsLoaded: player.regionsLoaded,
            friends: player.friends.serialize(),
            lastServerId: config.serverId,
            lastAddress: player.connection.address,
            lastGlobalChat: player.lastGlobalChat,
            guild: player.guild,
            pet: player.pet ? player.pet.key : '',
            resetToken: undefined // Save token as undefined to prevent it from being saved.
        };
    }
}
