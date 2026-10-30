import { Modules } from '@kaetram/common/network';

import type { Plugin } from '.';
import type Player from '@kaetram/server/src/game/entity/character/player/player';

export default class Knife implements Plugin {
    public onUse(player: Player): boolean {
        if (player.inCombat()) {
            player.notify(`战斗中无法打开制弓菜单。`);
            return false;
        }

        player.world.crafting.open(player, Modules.Skills.Fletching);

        return true;
    }
}
