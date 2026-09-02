/**
 * dsh-concise host：
 * 1) 注册系统提示词 section（dsh-concise:style）——text 为函数，每次模型组装时按开关状态求值；
 *    关闭时返回空串，渲染层自动丢弃该 section（对 prompt 的增删即时生效）。
 * 2) 本地 HTTP API（/dsh-concise/api）：GET /state、POST /toggle、POST /set，供 client 开关按钮消费。
 * 3) host 命令 `/concise [on|off|status]`：slash 菜单与 CLI 会话均可切换/查询。
 * 4) 状态持久化：$DSH_HOME（缺省 ~/.dsh）/dsh-concise/state.json，原子写（tmp + rename），跨重启保留。
 * 5) 自定义风格：$DSH_HOME/dsh-concise/style.md 存在时覆盖内置文本（按 mtime 缓存，改完下轮生效）。
 *
 * 风格定义对齐 Claude Code 内置 "Concise" output style：
 * 「Claude leads with results and skips preamble and narration, while doing the work just as thoroughly.」
 */
import { mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export const name = 'dsh-concise';
/** Required services: the system prompt registry, the web server route table, and the host command registry. */
export const inject = ['systemPrompt', 'webServer', 'commands'];
/** Runtime schema（预留扩展位；当前无必填配置）。 */
export const Config = z.object({
    /** 新装默认是否开启 Concise（默认关闭，与 Claude Code 默认输出风格一致）。 */
    defaultEnabled: z.boolean().default(false),
});
/** Concise 输出风格正文：注入 system prompt 的实际内容（无 style.md 覆盖时使用）。 */
export const CONCISE_STYLE_TEXT = [
    'Concise output style (active): lead with the result. Put the answer, the decision, or the finished artifact in the first sentence or two; explanation follows only as needed.',
    '- Skip preamble and narration: no "Sure", "Great question", "Let me...", "I\'ll now..." — never announce what you are about to do; just do it and report what changed.',
    '- Skip filler closers: no recap of what you just did, no "In summary" restating the response, no boilerplate apologies or hedges.',
    '- Keep every load-bearing detail: constraints, risks, exact commands, file paths, and next actions are content, not filler — compress wording, never omit substance.',
    '- Prefer structure over prose when it shortens reading: short paragraphs, tight lists, verbatim code and paths.',
    '- Thoroughness of the work is unchanged: investigate, verify, and double-check exactly as you otherwise would; only the reporting is compressed.',
    '- When you made a choice, state it with a one-line reason; surface alternatives only when they are viable and materially different.',
].join('\n');
/** Prompt section 名（同层重名会冲突，带插件前缀）。 */
const SECTION_NAME = 'dsh-concise:style';
/** Persona=0 之后、越靠前模型越早读到；40 安全避开 harness(-100)/persona(0)。 */
const SECTION_ORDER = 40;
function pluginDir() {
    const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh');
    return join(dshHome, 'dsh-concise');
}
function stateFile() {
    return join(pluginDir(), 'state.json');
}
/** 自定义风格文件：存在且非空时覆盖内置文本（对齐 Claude Code /output-style:new 的自定义能力）。 */
function styleFile() {
    return join(pluginDir(), 'style.md');
}
function loadState(defaultEnabled) {
    try {
        const raw = JSON.parse(readFileSync(stateFile(), 'utf8'));
        return { enabled: raw.enabled === true };
    }
    catch {
        return { enabled: defaultEnabled === true };
    }
}
function saveState(state) {
    const file = stateFile();
    mkdirSync(dirname(file), { recursive: true });
    const tmp = file + '.tmp-' + process.pid;
    writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n', 'utf8');
    renameSync(tmp, file);
}
/** style.md 的 mtime 缓存：文件未变时不重复读盘，改完保存即在下一次组装生效。 */
let styleCache = { mtimeMs: 0, text: null };
function customStyleText() {
    try {
        const mtimeMs = statSync(styleFile()).mtimeMs;
        if (mtimeMs === styleCache.mtimeMs)
            return styleCache.text;
        const raw = readFileSync(styleFile(), 'utf8').trim();
        styleCache = { mtimeMs, text: raw.length > 0 ? raw : null };
        return styleCache.text;
    }
    catch {
        if (styleCache.text !== null)
            styleCache = { mtimeMs: 0, text: null };
        return null;
    }
}
/** 当前生效的风格正文与来源（built-in = 内置；custom = style.md 覆盖）。 */
function activeStyle() {
    const custom = customStyleText();
    return custom === null
        ? { text: CONCISE_STYLE_TEXT, source: 'built-in' }
        : { text: custom, source: 'custom' };
}
async function readJsonBody(req) {
    const chunks = [];
    await new Promise((resolve, reject) => {
        req.on('data', (chunk) => chunks.push(chunk));
        req.on('end', () => resolve());
        req.on('error', (error) => reject(error));
    });
    try {
        const text = chunks.map((c) => String(c)).join('');
        return text.length > 0 ? JSON.parse(text) : {};
    }
    catch {
        return {};
    }
}
const USAGE = 'Usage: /concise [on|off|status]';
/**
 * 挂载 Concise 输出风格：提示词 section + 开关 API + host 命令 + 持久化。
 * @param ctx - host 根上下文（全局层，作用于所有会话的后续模型组装）。
 * @param config - 插件配置（defaultEnabled）。
 */
export function apply(ctx, config = {}) {
    const state = loadState(config.defaultEnabled ?? false);
    const log = ctx.logger ?? {};
    const persist = () => {
        try {
            saveState(state);
        }
        catch (error) {
            log.warn?.('[dsh-concise] persist state failed: ' + String(error));
        }
    };
    // 1) 系统提示词 section：text 每次组装求值，关闭时空串被渲染层丢弃
    if (ctx.systemPrompt) {
        ctx.effect(() => ctx.systemPrompt.section({
            name: SECTION_NAME,
            order: SECTION_ORDER,
            text: () => (state.enabled ? activeStyle().text : ''),
        }), 'dsh-concise: prompt section');
    }
    else {
        log.warn?.('[dsh-concise] systemPrompt service missing — style injection disabled');
    }
    // 2) host 命令 /concise：slash 菜单与 CLI 会话的切换入口（对齐 Claude Code /output-style）
    if (ctx.commands) {
        ctx.effect(() => ctx.commands.register({
            name: 'concise',
            description: 'toggle the Concise output style (results first, no filler)',
            input: { hint: '[on|off|status]', images: false },
            handler: (invocation) => {
                const arg = invocation.rawInput.trim().toLowerCase();
                if (arg === '' || arg === 'toggle') {
                    state.enabled = !state.enabled;
                    persist();
                    log.info?.('[dsh-concise] concise style ' + (state.enabled ? 'enabled' : 'disabled') + ' (via /concise)');
                    return {
                        kind: 'success',
                        text: state.enabled
                            ? 'Concise output style ENABLED — replies lead with results and skip preamble/narration. Effective on the next turn.'
                            : 'Concise output style DISABLED — replies return to the model\'s natural style. Effective on the next turn.',
                    };
                }
                if (arg === 'on' || arg === 'off') {
                    state.enabled = arg === 'on';
                    persist();
                    log.info?.('[dsh-concise] concise style ' + (state.enabled ? 'enabled' : 'disabled') + ' (via /concise)');
                    return {
                        kind: 'success',
                        text: state.enabled
                            ? 'Concise output style ENABLED — replies lead with results and skip preamble/narration. Effective on the next turn.'
                            : 'Concise output style DISABLED — replies return to the model\'s natural style. Effective on the next turn.',
                    };
                }
                if (arg === 'status') {
                    const style = activeStyle();
                    return {
                        kind: 'success',
                        text: [
                            'Concise output style: ' + (state.enabled ? 'ON' : 'OFF'),
                            'Style source: ' + style.source + (style.source === 'custom' ? ' (' + styleFile() + ')' : ''),
                            '',
                            'Toggle: /concise, /concise on, /concise off',
                        ].join('\n'),
                    };
                }
                return { kind: 'error', text: 'Unknown argument: ' + arg + '\n' + USAGE };
            },
        }), 'dsh-concise: /concise command');
    }
    else {
        log.warn?.('[dsh-concise] commands service missing — /concise command disabled');
    }
    // 3) 本地 HTTP API（client 按钮消费；仅本机回环）
    if (ctx.webServer) {
        ctx.effect(() => ctx.webServer.register({
            kind: 'prefix',
            path: '/dsh-concise/api',
            handler: async (req, res) => {
                const path = new URL(req.url ?? '/', 'http://localhost').pathname.replace(/^\/dsh-concise\/api/, '') || '/';
                const method = (req.method ?? 'GET').toUpperCase();
                if ((path === '/state' || path.startsWith('/state?')) && method === 'GET') {
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ enabled: state.enabled }));
                    return;
                }
                if ((path === '/toggle' || path === '/set') && method === 'POST') {
                    const body = path === '/set' ? await readJsonBody(req) : {};
                    if (path === '/set') {
                        const wanted = body.enabled;
                        if (typeof wanted === 'boolean')
                            state.enabled = wanted;
                    }
                    else {
                        state.enabled = !state.enabled;
                    }
                    persist();
                    log.info?.('[dsh-concise] concise style ' + (state.enabled ? 'enabled' : 'disabled'));
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ enabled: state.enabled }));
                    return;
                }
                res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'not found' }));
            },
        }), 'dsh-concise: http api');
    }
    else {
        log.warn?.('[dsh-concise] webServer service missing — toggle API disabled');
    }
}
//# sourceMappingURL=index.js.map