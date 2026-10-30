/**
 * Pocket Legends autocruise controller (挂机巡航控制).
 *
 * Per-player state machine driven by the world tick. Behaves like the
 * original game's cruise system:
 *   1. If HP drops below the route's potion threshold, drink the first
 *      edible item found in the inventory.
 *   2. If a mob is within `aggroRadius` of the current waypoint, attack it.
 *   3. Otherwise patrol between waypoints (server-side positional jumps
 *      through `teleport`, the same mechanism the original cruise used).
 *   4. On death, respawn (home) or stop depending on the route config.
 */

import { Modules } from '@kaetram/common/network';
import log from '@kaetram/common/util/log';
import Utils from '@kaetram/common/util/utils';

import { getAutocruiseRoute, type AutocruiseConfig } from '../info/autocruise';

import type Mob from '../game/entity/character/mob/mob';
import type Player from '../game/entity/character/player/player';
import type Entities from './entities';

/** Seconds between autocruise ticks per player. */
const TICK_INTERVAL = 750;

interface CruiseState {
    config: AutocruiseConfig;
    /** Index of the active waypoint. */
    waypoint: number;
    /** Current combat target instance, if any. */
    target?: string;
    lastTick: number;
}

export default class Autocruise {
    private states: { [instance: string]: CruiseState } = {};

    public constructor(private entities: Entities) {}

    /**
     * Toggles cruising for a player. If a route exists for the player's
     * current map, cruising starts (or stops if already active).
     * @returns A status message for the player.
     */

    public toggle(player: Player): string {
        if (this.states[player.instance]) {
            delete this.states[player.instance];
            return '挂机巡航已停止。';
        }

        let config = getAutocruiseRoute('world');

        if (!config) return '当前地图不支持挂机巡航（缺少路线配置）。';

        this.states[player.instance] = {
            config,
            waypoint: 0,
            lastTick: 0
        };

        return `挂机巡航已启动：${config.name}（${config.waypoints.length} 个巡航点）。`;
    }

    public isActive(player: Player): boolean {
        return !!this.states[player.instance];
    }

    /**
     * Main pump, called from the world tick. Iterates through all cruising
     * players and advances their state machine when their interval elapsed.
     */

    public update(): void {
        let now = Date.now();

        for (let instance of Object.keys(this.states)) {
            let player = this.entities.get(instance) as Player | undefined;

            // Player logged off — remove the state.
            if (!player || player.dead && this.states[instance].config.respawnStrategy === 'stop') {
                delete this.states[instance];
                continue;
            }

            let state = this.states[instance];

            if (player.dead) {
                // 'home' strategy: respawn and continue cruising.
                player.respawn();
                state.waypoint = 0;
                state.target = undefined;
                continue;
            }

            if (now - state.lastTick < TICK_INTERVAL) continue;

            state.lastTick = now;

            try {
                this.tick(player, state);
            } catch (error) {
                log.error(`Autocruise error for ${player.username}: ${(error as Error).message}`);
                delete this.states[instance];
            }
        }
    }

    /**
     * Single state-machine step for a cruising player.
     */

    private tick(player: Player, state: CruiseState): void {
        let { config } = state;

        // 1. Potion logic — drink the first edible when HP ratio is low.
        let hpRatio = player.hitPoints.getHitPoints() / player.hitPoints.getMaxHitPoints();

        if (hpRatio < (config.potionThreshold ?? 0.5)) {
            let index = -1;

            player.inventory.forEachSlot((slot) => {
                if (index === -1 && slot.edible) index = slot.index;
            });

            if (index !== -1)
                player.handleContainerSelect(
                    Modules.ContainerType.Inventory,
                    Modules.ContainerType.Inventory,
                    index,
                    Modules.ContainerType.Inventory
                );
        }

        // 2. Combat — find a nearby mob around the active waypoint.
        let waypoint = config.waypoints[state.waypoint],
            mob = this.findMob(waypoint.x, waypoint.y, config.aggroRadius ?? 6);

        // Attack a nearby mob we haven't already engaged.
        if ((Date.now() % 8000) < 750) log.info(`Autocruise findMob: ${mob ? mob.key+'@'+mob.x+','+mob.y+' inst='+mob.instance : 'none'} hasTarget=${player.hasTarget()}`);
        // Within striking distance of the target — engage.
        if (mob && state.target === mob.instance && player.hasTarget()) return;

        if (mob && !player.hasTarget()) {
            state.target = mob.instance;
            // Teleport adjacent to the mob first, then engage (server-authoritative).
            player.teleport(mob.x + 1, mob.y, false, false, true);
            player.handleTargetAttack(mob.instance);
            return;
        }

        // Mob died or vanished — clear and patrol on.
        if (!mob || !player.hasTarget()) {
            state.target = undefined;
            state.waypoint = (state.waypoint + 1) % config.waypoints.length;

            let next = config.waypoints[state.waypoint];

            player.teleport(next.x, next.y, false, false, true);
        }
    }

    /**
     * Finds a living, attackable mob within `radius` tiles of a position.
     */

    private findMob(x: number, y: number, radius: number): Mob | undefined {
        let found: Mob | undefined;

        this.entities.forEachMob((mob: Mob) => {
            if (found || mob.dead) return;

            let distance = Math.abs(mob.x - x) + Math.abs(mob.y - y);

            if (distance <= radius) found = mob;
        });

        return found;
    }
}
