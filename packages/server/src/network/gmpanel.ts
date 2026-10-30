import { randomBytes } from 'node:crypto';

import { KD_LEVEL_EXP } from '../info/kdlevelsexp';
import Item from '../game/entity/objects/item';
import rawMobs from '../../data/mobs.json';

import express from 'express';
import config from '@kaetram/common/config';
import log from '@kaetram/common/util/log';
import Utils from '@kaetram/common/util/utils';
import { Modules } from '@kaetram/common/network';

import type { Router, Express, Request, Response, NextFunction, Handler } from 'express';
import type World from '../game/world';
import type SqliteLoader from '@kaetram/common/database/sqlite/loader';
import type Player from '../game/entity/character/player/player';
import type Mob from '../game/entity/character/mob/mob';

/**
 * GM 管理面板 — 独立 HTTP 服务，通过固定密码访问。
 *
 * 功能（针对在线玩家）：
 *  - 查看在线玩家列表 / 全服公告
 *  - 刷物品（可带 +N 强化等级）
 *  - 设置等级 / 加经验
 *  - 治疗回满 / 传送
 *  - 封禁 / 禁言 / 踢下线
 *  - 刷怪 / 全场秒杀
 */

// 简易 session token（登录后发放，进程内存活），带过期时间。
const TOKEN_TTL = 12 * 60 * 60 * 1000; // 12 小时
let tokens = new Map<string, number>(); // token -> expiresAt

// 登录失败限速：滑动窗口内最多 5 次失败，超则锁定 15 分钟。
const LOGIN_WINDOW = 15 * 60 * 1000,
    LOGIN_MAX_FAILURES = 5;
let loginFailures: number[] = [],
    lockedUntil = 0;

function recordLoginFailure(): void {
    let now = Date.now();

    loginFailures = loginFailures.filter((time) => now - time < LOGIN_WINDOW);
    loginFailures.push(now);

    if (loginFailures.length >= LOGIN_MAX_FAILURES) {
        lockedUntil = now + LOGIN_WINDOW;
        loginFailures = [];
    }
}

function isLoginLocked(): boolean {
    return Date.now() < lockedUntil;
}

function pruneTokens(): void {
    let now = Date.now();

    for (let [token, expiresAt] of tokens) if (expiresAt < now) tokens.delete(token);
}

function getToken(request: Request): string {
    let header = request.headers.authorization || '';
    if (header.startsWith('Bearer ')) return header.slice(7);
    return '';
}

const auth: Handler = (request: Request, response: Response, next: NextFunction): void => {
    pruneTokens();

    let token = getToken(request);

    if (!token || !tokens.has(token)) {
        response.status(401).json({ error: '未登录或登录已过期。' });
        return;
    }

    // 滑动续期。
    tokens.set(token, Date.now() + TOKEN_TTL);

    next();
};

export default class GMPanel {
    public constructor(private world: World) {
        if (!config.gmPanelEnabled) return;

        let app: Express = express();

        app.use(express.json());

        let router: Router = express.Router();

        // ---------- 登录 ----------
        router.post('/login', (request, response) => {
            let { password } = request.body || {};

            // dotenv-parse-variables 会把纯数字密码转成 number，统一按字符串比较。
            if (isLoginLocked())
                return response.status(429).json({ error: '失败次数过多，请 15 分钟后再试。' });

            if (String(password) !== String(config.gmPanelPassword)) {
                recordLoginFailure();

                return response.status(403).json({ error: '密码错误。' });
            }

            loginFailures = [];
            lockedUntil = 0;

            let token = randomBytes(16).toString('hex');

            tokens.set(token, Date.now() + TOKEN_TTL);

            response.json({ token });
        });

        // 面板页面本身不需要鉴权（登录框也在上面）；所有数据 API 在 auth 之后。
        router.get('/', (_request, response) => {
            response.type('html').send(getHTML());
        });

        router.use(auth);

        // ---------- 状态 ----------
        router.get('/status', (_request, response) => {
            let players: {
                username: string;
                level: number;
                hp: string;
                mp: string;
                x: number;
                y: number;
            }[] = [];

            this.world.entities.forEachPlayer((player: Player) => {
                players.push({
                    username: player.username,
                    level: player.skills.getCombatLevel(),
                    hp: `${player.hitPoints.getHitPoints()}/${player.hitPoints.getMaxHitPoints()}`,
                    mp: `${player.mana.getMana()}/${player.mana.getMaxMana()}`,
                    x: player.x,
                    y: player.y
                });
            });

            response.json({
                population: this.world.getPopulation(),
                maxPlayers: config.maxPlayers,
                players
            });
        });

        // ---------- 全服公告 ----------
        router.post('/announce', (request, response) => {
            let { message } = request.body || {};

            if (!message) return response.status(400).json({ error: '消息不能为空。' });

            if (String(message).length > 120)
                return response.status(400).json({ error: '公告最长 120 字。' });

            this.world.globalMessage('[公告]', String(message), 'gold');
            response.json({ ok: true });
        });

        // ---------- 刷物品 ----------
        router.post('/item', (request, response) => {
            let { username, key, count, refine } = request.body || {},
                player = this.world.getPlayerByName(String(username || ''));

            if (!player) return response.status(404).json({ error: `玩家 ${username} 不在线。` });
            if (!key) return response.status(400).json({ error: '缺少物品键。' });

            let item = new Item(String(key), -1, -1, true, parseInt(count) || 1);

            if (!item.exists) return response.status(400).json({ error: `不存在物品 ${key}。` });

            let level = parseInt(refine);

            if (level > 0) item.refine = { level };

            player.inventory.add(item);

            player.notify(`[GM] 获得物品 ${key} x${item.count}${level > 0 ? ` (+${level})` : ''}`);
            response.json({ ok: true, key: item.key, count: item.count });
        });

        // ---------- 设置等级 ----------
        router.post('/level', (request, response) => {
            let { username, level } = request.body || {},
                target = parseInt(level),
                player = this.world.getPlayerByName(String(username || ''));

            if (!player) return response.status(404).json({ error: `玩家 ${username} 不在线。` });
            if (!target || target < 1) return response.status(400).json({ error: '无效等级。' });

            target = Math.min(target, KD_LEVEL_EXP.length);

            // 单经验池：所有经验归 Health 技能。
            let health = player.skills.get(Modules.Skills.Health);

            if (!health) return response.status(500).json({ error: '找不到 Health 技能。' });

            health.setExperience(KD_LEVEL_EXP[target - 1] ?? KD_LEVEL_EXP.at(-1));
            player.skills.sync();

            player.notify(`[GM] 等级已设为 ${target}。`);
            response.json({ ok: true, level: player.skills.getCombatLevel() });
        });

        // ---------- 加经验 ----------
        router.post('/exp', (request, response) => {
            let { username, amount } = request.body || {},
                exp = parseInt(amount),
                player = this.world.getPlayerByName(String(username || ''));

            if (!player) return response.status(404).json({ error: `玩家 ${username} 不在线。` });
            if (!exp || exp < 1) return response.status(400).json({ error: '经验值必须为正数。' });

            player.skills.get(Modules.Skills.Health)?.addExperience(exp);

            player.notify(`[GM] 获得 ${exp} 经验。`);
            response.json({ ok: true, level: player.skills.getCombatLevel() });
        });

        // ---------- 治疗 / 传送 ----------
        router.post('/heal', (request, response) => {
            let player = this.world.getPlayerByName(String(request.body?.username || ''));

            if (!player) return response.status(404).json({ error: '玩家不在线。' });

            player.hitPoints.setHitPoints(player.hitPoints.getMaxHitPoints());
            player.mana.setMana(player.mana.getMaxMana());

            player.notify('[GM] 你已被治疗至满状态。');
            response.json({ ok: true });
        });

        router.post('/teleport', (request, response) => {
            let { username, x, y } = request.body || {},
                player = this.world.getPlayerByName(String(username || ''));

            if (!player) return response.status(404).json({ error: '玩家不在线。' });

            player.teleport(parseInt(x) || 0, parseInt(y) || 0, false, false, true);
            response.json({ ok: true });
        });

        // ---------- 封禁 / 禁言 / 踢下线 ----------
        router.post('/moderate', (request, response) => {
            let { username, action, hours } = request.body || {},
                name = String(username || '').trim();

            if (!name) return response.status(400).json({ error: '缺少玩家名。' });

            let duration = (parseInt(hours) || 1) * 60 * 60 * 1000,
                until = Date.now() + duration;

            switch (action) {
                case 'ban': {
                    // 封禁对离线玩家同样生效：直接改库，下次登录被拒。
                    let player = this.world.getPlayerByName(name);

                    if (player) {
                        player.ban = until;
                        player.connection.sendUTF8('ban');
                        player.connection.close(`GM banned ${name}`);
                    } else {
                        // 离线玩家：直接改库（仅 SQLite 后端支持，MongoDB 已弃用）。
                        let loader = this.world.database?.loader as SqliteLoader | undefined,
                            info = loader?.getDocument?.<{ [key: string]: unknown }>(
                                'player_info',
                                name
                            );

                        if (!info)
                            return response.status(404).json({ error: `玩家 ${name} 不存在。` });

                        loader?.putDocument?.('player_info', name, { ...info, ban: until });
                    }

                    break;
                }
                case 'mute': {
                    let player = this.world.getPlayerByName(name);

                    if (!player) return response.status(404).json({ error: '玩家不在线。' });

                    player.mute = until;
                    player.save();

                    break;
                }
                case 'kick': {
                    let player = this.world.getPlayerByName(name);

                    if (!player) return response.status(404).json({ error: '玩家不在线。' });

                    player.connection.close(`GM kicked ${name}`);

                    break;
                }
                default: {
                    return response.status(400).json({ error: '未知操作。' });
                }
            }

            response.json({ ok: true, action });
        });

        // ---------- 刷怪 / 秒杀全场 ----------
        router.post('/mob', (request, response) => {
            let { key, count } = request.body || {},
                mobKey = String(key || 'kd_mob_1'),
                players: Player[] = [];

            if (!(mobKey in rawMobs))
                return response.status(400).json({ error: `不存在怪物 ${mobKey}。` });

            this.world.entities.forEachPlayer((player: Player) => players.push(player));

            if (players.length === 0) return response.status(400).json({ error: '没有在线玩家。' });

            let amount = Math.min(parseInt(count) || 1, 50);

            for (let i = 0; i < amount; i++) {
                let player = players[i % players.length];
                this.world.entities.spawnMob(mobKey, player.x, player.y);
            }

            response.json({ ok: true, count: amount });
        });

        router.post('/nuke', (request, response) => {
            // 二次确认：请求体必须带 { confirm: "nuke" }，防止误点清空地图。
            if (request.body?.confirm !== 'nuke')
                return response.status(400).json({ error: '缺少确认字段 confirm="nuke"。' });

            let killed = 0;

            this.world.entities.forEachMob((mob: Mob) => {
                if (mob.dead) return;

                // BOSS/miniboss 不清除。
                if (mob.boss || mob.miniboss) return;

                // destroy() 会走重生流程（respawnable 怪延迟后自动回来），
                // 不会像 despawn() 那样把地图永久清空。
                mob.destroy();
                killed++;
            });

            response.json({ ok: true, killed });
        });

        app.use('/', router).listen(config.gmPanelPort, () => {
            log.notice(`GM panel is listening on port: ${config.gmPanelPort}.`);
        });
    }
}

function getHTML(): string {
    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="utf-8">
<title>GM 管理面板</title>
<style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; max-width: 860px; margin: 24px auto; padding: 0 16px; }
    h1 { color: #f97316; }
    input, button, select { padding: 8px; border-radius: 6px; border: 1px solid #444; background: #16213e; color: #eee; margin: 2px; }
    button { cursor: pointer; background: #f97316; border: none; font-weight: bold; }
    button:hover { background: #fb923c; }
    .card { background: #16213e; border-radius: 10px; padding: 16px; margin: 12px 0; }
    .row { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #333; }
    #msg { color: #4ade80; min-height: 1.2em; }
    .err { color: #f87171 !important; }
    #login { max-width: 320px; margin: 80px auto; text-align: center; }
</style>
</head>
<body>
<div id="login" class="card">
    <h1>🔒 GM 登录</h1>
    <input id="pwd" type="password" placeholder="密码" style="width: 80%">
    <br><br>
    <button onclick="login()">登录</button>
</div>
<div id="panel" style="display:none">
    <h1>⚔️ GM 管理面板</h1>
    <div id="msg"></div>

    <div class="card">
        <b>全服公告</b>
        <div class="row"><input id="ann" style="flex:1" placeholder="公告内容"><button onclick="announce()">发送</button></div>
    </div>

    <div class="card">
        <b>在线玩家</b>
        <table id="players"><thead><tr><th>玩家</th><th>等级</th><th>HP</th><th>MP</th><th>坐标</th><th>操作</th></tr></thead><tbody></tbody></table>
    </div>

    <div class="card">
        <b>刷物品</b>
        <div class="row">
            <input id="i_user" placeholder="玩家名">
            <input id="i_key" placeholder="物品键 (如 kd_weapon_5)">
            <input id="i_count" type="number" value="1" style="width:64px" title="数量">
            <input id="i_refine" type="number" value="0" style="width:56px" title="+N">
            <button onclick="giveItem()">给予</button>
        </div>
    </div>

    <div class="card">
        <b>刷怪 / 秒杀</b>
        <div class="row">
            <input id="m_key" placeholder="怪物键 (如 kd_mob_1)">
            <input id="m_count" type="number" value="1" style="width:64px">
            <button onclick="spawnMob()">刷怪</button>
            <button onclick="nuke()">全场秒杀</button>
        </div>
    </div>
</div>

<script>
let TOKEN = localStorage.getItem('gmToken') || '';

async function api(path, body) {
    let res = await fetch('/' + path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
        body: JSON.stringify(body || {})
    });
    let data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
}

function show(msg, isErr = false) {
    let el = document.getElementById('msg');
    el.textContent = msg;
    el.className = isErr ? 'err' : '';
}

async function login() {
    try {
        let res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: document.getElementById('pwd').value })
        });
        let data = await res.json();
        if (!res.ok) return show(data.error || '登录失败', true);
        TOKEN = data.token;
        localStorage.setItem('gmToken', TOKEN);
        enter();
    } catch (e) { show(String(e), true); }
}

function enter() {
    document.getElementById('login').style.display = 'none';
    document.getElementById('panel').style.display = 'block';
    refresh();
    setInterval(refresh, 5000);
}

function logout() {
    localStorage.removeItem('gmToken');
    location.reload();
}

function sel(name) {
    let el = document.getElementById('i_user');
    el.value = name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function refresh() {
    try {
        let res = await fetch('/status', { headers: { Authorization: 'Bearer ' + TOKEN } });
        if (res.status === 401) return logout();
        let data = await res.json();
        let tbody = document.querySelector('#players tbody');

        // 全部用 createElement + textContent 构建，避免玩家名注入 HTML/脚本。
        tbody.replaceChildren();

        if (data.players.length === 0) {
            let tr = document.createElement('tr'),
                td = document.createElement('td');
            td.colSpan = 6;
            td.textContent = '无在线玩家';
            tr.appendChild(td);
            tbody.appendChild(tr);
            return;
        }

        for (let p of data.players) {
            let tr = document.createElement('tr');

            for (let value of ['', 'Lv.' + p.level, p.hp, p.mp, p.x + ',' + p.y]) {
                let td = document.createElement('td');
                td.textContent = String(value);
                tr.appendChild(td);
            }

            let nameTd = tr.firstChild;
            nameTd.textContent = p.username;

            let actionTd = document.createElement('td');

            for (let [label, action] of [['治疗', 'heal'], ['等级', 'level'], ['踢', 'kick'], ['封', 'ban']]) {
                let button = document.createElement('button');
                button.textContent = label;
                button.addEventListener('click', () =>
                    action === 'level' ? setlvl(p.username) : act(action, p.username)
                );
                actionTd.appendChild(button);
                actionTd.appendChild(document.createTextNode(' '));
            }

            tr.appendChild(actionTd);
            tbody.appendChild(tr);
        }
    } catch (e) { /* silent */ }
}

async function act(action, username) {
    let hours = action === 'kick' ? 0 : prompt('时长（小时）', '24');
    try { show(JSON.stringify(await api('moderate', { username, action, hours }))); refresh(); }
    catch (e) { show(String(e), true); }
}

async function setlvl(username) {
    let level = prompt('目标等级', '20');
    try { show(await api('level', { username, level }).then(d => '等级已设为 ' + d.level)); refresh(); }
    catch (e) { show(String(e), true); }
}

async function announce() {
    try { await api('announce', { message: document.getElementById('ann').value }); show('公告已发送 ✓'); }
    catch (e) { show(String(e), true); }
}

async function giveItem() {
    try {
        await api('item', {
            username: document.getElementById('i_user').value,
            key: document.getElementById('i_key').value,
            count: document.getElementById('i_count').value,
            refine: document.getElementById('i_refine').value
        });
        show('物品已给予 ✓');
    } catch (e) { show(String(e), true); }
}

async function spawnMob() {
    try {
        await api('mob', { key: document.getElementById('m_key').value, count: document.getElementById('m_count').value });
        show('刷怪完成 ✓');
    } catch (e) { show(String(e), true); }
}

async function nuke() {
    if (!confirm('确定清除当前区域所有普通怪（BOSS 保留）？')) return;
    try { show(await api('nuke', { confirm: 'nuke' }).then(d => '已清除 ' + d.killed + ' 只怪')); }
    catch (e) { show(String(e), true); }
}

if (TOKEN) {
    fetch('/status', { headers: { Authorization: 'Bearer ' + TOKEN } })
        .then(res => { if (res.ok) enter(); });
}
</script>
</body>
</html>`;
}
