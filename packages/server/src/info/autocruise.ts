/**
 * Pocket Legends (口袋传奇) autocruise (挂机巡航) loader.
 *
 * Data-driven cruising: each map gets a JSON file in `data/autocruise/`
 * describing patrol waypoints, potion thresholds and aggro radius.
 * No generic AI — the original game's cruise system was a fixed
 * route + BOSS slot configuration, and we replicate that.
 */

import { readdirSync, readFileSync } from 'node:fs';
import log from '@kaetram/common/util/log';

export interface AutocruiseConfig {
    /** Map key this route belongs to. */
    map: string;
    /** Display name (zh). */
    name: string;
    /** Ordered patrol waypoints (grid positions). */
    waypoints: Position[];
    /** HP ratio (0-1) below which the bot drinks a healing item. */
    potionThreshold?: number;
    /** Mana ratio threshold (optional, mages). */
    manaThreshold?: number;
    /** Radius (tiles) to search for mobs around the active waypoint. */
    aggroRadius?: number;
    /** Respawn strategy: 'home' = respawn+return to first waypoint, 'stop' = end cruising. */
    respawnStrategy?: 'home' | 'stop';
}

const REPO: { [key: string]: AutocruiseConfig } = {};

/**
 * Loads every JSON file in `data/autocruise/` into the route repository.
 */
export function loadAutocruiseRoutes(): void {
    let files: string[];

    try {
        files = readdirSync('data/autocruise');
    } catch {
        log.warning('No autocruise directory found, skipping route loading.');
        return;
    }

    for (let file of files) {
        if (!file.endsWith('.json')) continue;

        try {
            let config = JSON.parse(readFileSync(`data/autocruise/${file}`, 'utf8')) as AutocruiseConfig;

            if (!config.map || !config.waypoints?.length) {
                log.warning(`Autocruise route ${file} is missing map or waypoints.`);
                continue;
            }

            config.potionThreshold ??= 0.5;
            config.manaThreshold ??= 0;
            config.aggroRadius ??= 6;
            config.respawnStrategy ??= 'home';

            REPO[config.map] = config;
        } catch {
            log.error(`Failed to parse autocruise route: ${file}`);
        }
    }

    log.info(`Loaded ${Object.keys(REPO).length} autocruise route(s).`);
}

export function getAutocruiseRoute(map: string): AutocruiseConfig | undefined {
    return REPO[map];
}

export function getAutocruiseRoutes(): AutocruiseConfig[] {
    return Object.values(REPO);
}
