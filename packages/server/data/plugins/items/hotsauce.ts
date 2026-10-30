import { Modules } from '@kaetram/common/network';

import type { Plugin } from '.';
import type Player from '@kaetram/server/src/game/entity/character/player/player';

export default class HotSauce implements Plugin {
    public onUse(player: Player): boolean {
        if (player.status.has(Modules.Effects.HotSauce)) {
            player.notify(`我真的不该一下子喝这么多……`);
            return false;
        }

        player.notify(`你感到一股强烈的肾上腺素涌上，感觉自己可以一直跑下去。`);

        // Update the hot sauce effect.
        player.setRunning(false, true);

        setTimeout(() => {
            player.setRunning(false, false);
            player.notify('辣椒酱的效果已消退。');
        }, 15_000);

        return true;
    }
}
