import crypto from 'node:crypto';
import path from 'node:path';

import SqliteCreator from './creator';
import SqliteLoader from './loader';
import { SqliteStore } from './store';

import Utils from '@kaetram/common/util/utils';
import log from '@kaetram/common/util/log';
import Filter from '@kaetram/common/util/filter';

import type Player from '@kaetram/server/src/game/entity/character/player/player';
import type { Modules } from '@kaetram/common/network';
import type { PlayerInfo, ResetToken } from './creator';
import type {
    MobAggregate,
    PvpAggregate,
    SkillExperience,
    TotalExperience
} from '@kaetram/common/types/leaderboards';

/**
 * SQLite database backend — a lightweight, zero-dependency alternative to
 * MongoDB built on Node.js' built-in `node:sqlite` module. Ideal for small
 * or local game servers (e.g. the Pocket Legends edition).
 *
 * Implements the same public interface as the MongoDB backend so that the
 * rest of the codebase is agnostic of the underlying storage engine.
 */

export default class SQLiteDatabase {
    private store!: SqliteStore;

    public loader!: SqliteLoader;
    public creator!: SqliteCreator;

    public readyCallback?: () => void;
    public failCallback?: (error: Error) => void;

    public constructor(
        host: string,
        port: number,
        username: string,
        password: string,
        private databaseName: string,
        private tls: boolean,
        srv: boolean,
        authSource: string,
        filePath?: string
    ) {
        // Host/port/user params are ignored in the SQLite backend; the
        // database is a single local file. MONGODB_DATABASE is reused as
        // the file name for configuration parity.
        void host;
        void port;
        void username;
        void password;
        void tls;
        void srv;
        void authSource;

        let resolvedPath = filePath
            ? filePath
            : path.resolve('data', 'database', `${this.databaseName || 'kaetram'}.sqlite`);

        try {
            this.store = new SqliteStore({ path: resolvedPath });

            this.loader = new SqliteLoader(this.store);
            this.creator = new SqliteCreator(this.store);

            // SQLite is synchronous — the connection is ready immediately.
            // Defer the callback to the next tick so that `onReady` handlers
            // registered after the constructor still receive it.
            setImmediate(() => this.readyCallback?.());
        } catch (error: unknown) {
            this.loader = new SqliteLoader();

            log.error(`Could not open SQLite database at ${resolvedPath}.`);
            log.error(error instanceof Error ? error : String(error));

            this.failCallback?.(error instanceof Error ? error : new Error(String(error)));
        }
    }

    /**
     * Authenticates a player against the stored (hashed) password and loads
     * their data on success — mirrors `MongoDB.login`.
     */

    public login(player: Player): void {
        if (!this.hasDatabase()) return;

        let info = this.store.get<PlayerInfo>('player_info', player.username);

        if (!info) return player.connection.reject('invalidlogin');

        Utils.compare(player.password, info.password, (result: boolean) => {
            if (!result) return player.connection.reject('invalidlogin');

            player.authenticated = true;

            player.load(info!);
        });
    }

    /**
     * Registers a new player after checking for duplicate usernames/emails —
     * mirrors `MongoDB.register`.
     */

    public register(player: Player): void {
        if (!this.hasDatabase()) return;

        if (!SqliteCreator.verifyPlayer(player) || Filter.isProfane(player.username))
            return player.connection.reject('invalidinput');

        let existing = this.store.get<PlayerInfo>('player_info', player.username);

        if (existing) return player.connection.reject('userexists');

        // Check for email duplicates when an email is specified.
        if (player.email !== '') {
            let emails = this.store.all<PlayerInfo>('player_info');

            if (emails.some((info) => info.email === player.email))
                return player.connection.reject('emailexists');
        }

        player.authenticated = true;

        log.debug(`No player data found for ${player.username}, creating user.`);

        player.statistics.creationTime = Date.now();

        // Hash the password before storing the account.
        this.creator.getPlayerWithHash(player, (info: PlayerInfo) => {
            this.store.put('player_info', player.username, info);
        });

        player.load(SqliteCreator.serialize(player));
    }

    /**
     * Checks whether or not the username exists in the database.
     */

    public exists(username: string, callback: (exists: boolean) => void): void {
        if (!this.hasDatabase()) return callback(false);

        callback(!!this.store.get('player_info', username));
    }

    /**
     * Checks whether or not an IP string is contained within the ipbans.
     */

    public isIpBanned(ip: string, callback: (banned: boolean) => void): void {
        if (!this.hasDatabase()) return callback(false);

        callback(!!this.store.get('ipbans', ip));
    }

    /**
     * Removes a guild from the database.
     */

    public deleteGuild(identifier: string): void {
        if (!this.hasDatabase()) return;

        this.store.remove('guilds', identifier);
    }

    /**
     * Applies (or lifts) an IP ban.
     */

    public setIpBan(ip: string, banned: boolean): void {
        if (!this.hasDatabase()) return;

        if (banned) this.store.put('ipbans', ip, { ip });
        else this.store.remove('ipbans', ip);
    }

    /**
     * Sets the rank of an offline player.
     */

    public setRank(username: string, rankId: number): void {
        if (!this.hasDatabase()) return;

        let info = this.store.get<PlayerInfo>('player_info', username);

        if (!info) return log.warning(`No player found with the username ${username}.`);

        info.rank = rankId as Modules.Ranks;

        this.store.put('player_info', username, info);
    }

    /**
     * Returns the number of registered players.
     */

    public registeredCount(callback: (count: number) => void): void {
        if (!this.hasDatabase()) return callback(0);

        callback(this.store.count('player_info'));
    }

    /**
     * Creates a reset token for the account associated with `email`.
     * SQLite documents do not carry a MongoDB ObjectId — we reuse the
     * username as the account identifier.
     */

    public createResetToken(
        email: string,
        callback: (id?: string, token?: string) => void
    ): void {
        if (!this.hasDatabase()) return callback();

        let players = this.store.all<PlayerInfo>('player_info'),
            playerInfo = players.find((info) => info.email === email);

        if (!playerInfo) return callback();

        let token = crypto.randomBytes(32).toString('hex');

        Utils.hash(token, (hash: string) => {
            let resetToken: ResetToken = {
                token: hash,
                expiration: Date.now() + 60 * 60 * 1000 // 1 hour.
            };

            playerInfo!.resetToken = resetToken;

            this.store.put('player_info', playerInfo!.username, playerInfo!);
        });

        callback(playerInfo.username, token);
    }

    /**
     * Validates a reset token and resets the account password.
     */

    public resetPassword(
        id: string,
        token: string,
        password: string,
        callback: (status: boolean) => void
    ): void {
        if (!this.hasDatabase()) return callback(false);

        let playerInfo = this.store.get<PlayerInfo>('player_info', id);

        if (!playerInfo) return callback(false);

        if (!playerInfo.resetToken) return callback(false);

        if (playerInfo.resetToken.expiration < Date.now()) return callback(false);

        Utils.compare(token, playerInfo.resetToken.token, (result: boolean) => {
            if (!result) {
                log.warning(`Invalid reset token for ${playerInfo!.username}.`);
                return callback(false);
            }

            Utils.hash(password, (hash: string) => {
                playerInfo!.password = hash;
                playerInfo!.resetToken = undefined;

                this.store.put('player_info', id, playerInfo!);
            });

            callback(true);
        });
    }

    /**
     * Total experience leaderboard. The data is sorted in descending order.
     */

    public getTotalExperienceAggregate(
        callback: (totalExperience: TotalExperience[]) => void
    ): void {
        if (!this.hasDatabase()) return;

        let skills = this.store.all<{ username: string; skills: { type: string; experience: number }[]; cheater?: boolean }>('player_skills'),
            totals: { [username: string]: number } = {},
            cheaters: { [username: string]: boolean } = {};

        for (let doc of skills) {
            let experience = (doc.skills ?? []).reduce((sum, skill) => sum + skill.experience, 0);

            totals[doc.username] = experience;
            cheaters[doc.username] = !!doc.cheater;
        }

        let data = Object.entries(totals)
            .map(([username, experience]) => ({ username, totalExperience: experience }))
            .sort((a, b) => b.totalExperience - a.totalExperience)
            .slice(0, 150);

        callback(data as TotalExperience[]);
    }

    /**
     * Leaderboard for a specific skill, sorted in descending order.
     */

    public getSkillAggregate(
        skill: Modules.Skills,
        callback: (experience: SkillExperience[]) => void
    ): void {
        if (!this.hasDatabase()) return;

        let skills = this.store.all<{ username: string; skills: { type: string; experience: number }[]; cheater?: boolean }>('player_skills'),
            data: SkillExperience[] = [];

        for (let doc of skills)
            for (let entry of doc.skills ?? []) {
                if ((entry.type as string) !== (skill as unknown as string)) continue;

                data.push({
                    username: doc.username,
                    experience: entry.experience,
                    cheater: doc.cheater
                } as SkillExperience);
            }

        callback(
            data.sort((a, b) => b.experience - a.experience).slice(0, 150)
        );
    }

    /**
     * Leaderboard for mob kills of the specified mob key.
     */

    public getMobAggregate(key: string, callback: (data: MobAggregate[]) => void): void {
        if (!this.hasDatabase()) return;

        let stats = this.store.all<{ username: string; mobKills: Record<string, number>; cheater?: boolean }>('player_statistics'),
            data: MobAggregate[] = [];

        for (let doc of stats)
            data.push({
                username: doc.username,
                kills: doc.mobKills?.[key] ?? 0,
                cheater: doc.cheater
            } as MobAggregate);

        callback(data.sort((a, b) => b.kills - a.kills).slice(0, 150));
    }

    /**
     * Leaderboard for PvP kills.
     */

    public getPvpAggregate(callback: (data: PvpAggregate[]) => void): void {
        if (!this.hasDatabase()) return;

        let stats = this.store.all<{ username: string; pvpKills?: number; cheater?: boolean }>('player_statistics'),
            data: PvpAggregate[] = [];

        for (let doc of stats)
            data.push({
                username: doc.username,
                pvpKills: doc.pvpKills ?? 0,
                cheater: doc.cheater
            } as PvpAggregate);

        callback(data.sort((a, b) => b.pvpKills - a.pvpKills).slice(0, 150));
    }

    /**
     * Checks whether or not a connection has been established.
     */

    private hasDatabase(): boolean {
        if (!this.store) log.error('No connection established for the database.');

        return !!this.store;
    }

    /**
     * Callback signal if connection is successfully established.
     */

    public onReady(callback: () => void): void {
        this.readyCallback = callback;
    }

    /**
     * Callback for connection failure.
     */

    public onFail(callback: (error: Error) => void): void {
        this.failCallback = callback;
    }
}
