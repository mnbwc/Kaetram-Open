import log from '@kaetram/common/util/log';
import { Modules } from '@kaetram/common/network';

import type World from './game/world';
import type Player from './game/entity/character/player/player';
import type { DatabaseType } from '@kaetram/common/database/database';

/**
 * The console lives on top of the server. It allows an admin to directly
 * control events within the server from the console instead
 * of logging in. The commands available are listed below in a switch statement.
 */

export default class Console {
    private database: NonNullable<DatabaseType>;

    public constructor(private world: World) {
        this.database = world.database!;

        let stdin = process.stdin;

        stdin.addListener('data', (data: Buffer) => {
            let message = data.toString().replace(/(\r\n|\n|\r)/gm, ''),
                type = message.charAt(0);

            if (type !== '/') return;

            let blocks = message.slice(1).split(' '),
                command = blocks.shift()!;

            if (!command) return;

            let username: string, player: Player;

            switch (command) {
                case 'players': {
                    log.info(
                        `当前共有 ${
                            this.world.entities.getPlayerUsernames().length
                        } 名玩家在线。`
                    );

                    break;
                }

                case 'total': {
                    this.database.registeredCount((count: number) => {
                        log.info(`已注册 ${count} 名用户。`);
                    });

                    break;
                }

                case 'update': {
                    this.world.entities.forEachPlayer((player: Player) => {
                        player.connection.reject('updated');
                    });

                    // No connections allowed for the remaining instance of the server.
                    this.world.allowConnections = false;

                    break;
                }

                case 'kill': {
                    username = blocks.join(' ');

                    if (!this.world.isOnline(username)) return log.info('该玩家不在线。');

                    player = this.world.getPlayerByName(username);

                    if (!player) return log.info('发生了一个错误。');

                    player.hit(player.hitPoints.getHitPoints());

                    break;
                }

                case 'kick':
                case 'timeout': {
                    username = blocks.join(' ');

                    if (!this.world.isOnline(username)) return log.info('该玩家不在线。');

                    player = this.world.getPlayerByName(username);

                    if (!player) return log.info('发生了一个错误。');

                    player.connection.close();

                    break;
                }

                case 'setadmin':
                case 'setmod': {
                    username = blocks.join(' ');

                    if (!this.world.isOnline(username)) return log.info('该玩家不在线。');

                    player = this.world.getPlayerByName(username);

                    if (!player) return log.info('未找到该玩家。');

                    player.setRank(
                        command === 'setadmin' ? Modules.Ranks.Admin : Modules.Ranks.Moderator
                    );

                    player.sync();

                    log.info(
                        `${player.username} 现在是${command === 'setadmin' ? '管理员' : '版主'}！`
                    );

                    break;
                }

                case 'removeadmin':
                case 'removemod': {
                    username = blocks.join(' ');

                    if (!this.world.isOnline(username)) return log.info('该玩家不在线。');

                    player = this.world.getPlayerByName(username);

                    if (!player) return log.info('未找到该玩家。');

                    player.setRank();

                    player.notify('你的权限已被移除。');

                    player.sync();

                    break;
                }

                case 'ipban':
                case 'unbanip': {
                    let ip = blocks.shift();

                    if (!ip) return log.info(`命令格式错误，正确格式：/${command} <ip>`);

                    this.database.setIpBan(ip, command === 'ipban');

                    log.info(`IP ${ip} 已被封禁。`);

                    // Kick all players with the same IP.
                    for (let player of this.world.entities.getPlayersByIp(ip))
                        player.connection.reject('banned');
                }

                case 'save': {
                    log.info('正在保存所有玩家。');
                    return this.world.save();
                }
            }
        });
    }
}
