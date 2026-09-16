/**
 * dsh-concise host：
 * 1) 注册系统提示词 section（dsh-concise:style）——text 为函数，每次模型组装时按"当前会话"的开关状态求值；
 *    关闭时返回空串，渲染层自动丢弃该 section（对 prompt 的增删即时生效）。
 * 2) 会话级状态：每个会话独立开关，互不影响；新会话取 default（config defaultEnabled）。
 * 3) 本地 HTTP API（/dsh-concise/api）：GET /state、POST /toggle、POST /set，均支持 sessionId。
 * 4) host 命令 `/concise [on|off|status]`：作用于当前会话。
 * 5) 状态持久化：$DSH_HOME（缺省 ~/.dsh）/dsh-concise/state.json，原子写（tmp + rename），跨重启保留。
 * 6) 自定义风格：$DSH_HOME/dsh-concise/style.md 存在时覆盖内置文本（按 mtime 缓存，改完下轮生效）。
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
/** Required services: the system prompt registry and the host command registry.
 *  webServer 不列入 inject：headless/CLI 等 profile 没有该服务，硬性等待会导致插件永远 pending。
 *  apply() 内对 ctx.webServer 做防御性判空（缺失时仅降级 API，风格注入不受影响）。 */
export const inject = ['systemPrompt', 'commands'];
/** Runtime schema（预留扩展位；当前无必填配置）。 */
export const Config = z.object({
    /** 新会话的默认状态（默认关闭，与 Claude Code 默认输出风格一致）。 */
    defaultEnabled: z.boolean().default(false),
});
/** Concise 输出风格正文：注入 system prompt 的实际内容（无 style.md 覆盖时使用）。 */
export const CONCISE_STYLE_TEXT = [
    'Concise output style (active): lead with the result. Put the answer, the decision, or the finished artifact in the first sentence or two; explanation follows only as needed.',
    '- MANDATORY on every user-facing final reply (the reply that ends the turn and answers the user — intermediate step narration between tool calls is exempt): BEGIN with the digest block in EXACTLY this blockquote format, then continue with the normal answer:\n> **摘要：** <2-3 plain, jargon-free sentences restating this turn\'s conclusion, with the 2-4 key words or numbers bolded via **…**>\nThe digest may ONLY restate conclusions already present in the reply body — never introduce facts, trade-offs, or analogies the body does not contain; give any unavoidable term a short plain-language gloss in parentheses. However short the answer, the digest block is always present (it is not a recap — it precedes the answer).\nLength and structure are NOT exemptions: long explanation replies, step-by-step walkthroughs, and table-heavy documents are where the digest gets skipped most often — such replies must still OPEN with the digest block, before any heading, table, or body text.',
    '- Never open by restating the question or with pleasantries ("Sure", "Great question", "好的", "当然可以") — the first line is already the answer or the key finding.',
    '- Skip filler closers: no recap of what you just did, no "In summary" restating the response, no boilerplate apologies or hedges, no closing offers ("需要我…吗？") unless a decision is genuinely required.',
    '- For enumerable facts prefer a table or a tight list over paragraphs — structure is not verbosity; compact and structured beats long and prosy.',
    '- Keep every load-bearing detail: constraints, risks, exact commands, file paths, and next actions are content, not filler — compress wording, never omit substance.',
    '- No narration between steps: report what changed, not what you are about to do ("Let me check...", "I\'ll now...").',
    '- Thoroughness of the work is unchanged: investigate, verify, and double-check exactly as you otherwise would; only the reporting is compressed.',
    '- When you made a choice, state it with a one-line reason; surface alternatives only when they are viable and materially different.',
].join('\n');
/** Prompt section 名（同层重名会冲突，带插件前缀）。 */
const SECTION_NAME = 'dsh-concise:style';
/** Persona=0 之后、越靠前模型越早读到；40 安全避开 harness(-100)/persona(0)。 */
const SECTION_ORDER = 40;
/** 尾部提醒 section：system prompt 末尾再敲一次「最终回复必附摘要」，对冲长 prompt 下的遵循衰减。 */
const REMINDER_SECTION_NAME = 'dsh-concise:reminder';
const REMINDER_SECTION_ORDER = 900;
const REMINDER_TEXT = 'REMINDER (Concise output style): if this turn ends with a user-facing final reply, its FIRST rendered element must be the 摘要 digest blockquote exactly as defined in the Concise output style section above ("> **摘要：** …") — before any heading, table, or body text, however long or structured the reply is; long explanation replies are where the digest is most often skipped. Intermediate step narration between tool calls is exempt.';
/** 会话条目上限：超出时按最近使用淘汰，防 state.json 无界增长。 */
const MAX_SESSION_ENTRIES = 500;
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
        const sessions = {};
        for (const [sid, value] of Object.entries(raw.sessions ?? {})) {
            if (typeof value === 'boolean') {
                sessions[sid] = { enabled: value, at: 0 };
                continue;
            }
            if (value && typeof value === 'object' && typeof value.enabled === 'boolean') {
                sessions[sid] = { enabled: value.enabled === true, at: Number(value.at) || 0 };
            }
        }
        return {
            // 0.2.0 旧格式的 enabled 字段迁移为 default
            default: raw.default === true || (raw.default === undefined && raw.enabled === true),
            sessions,
        };
    }
    catch {
        return { default: defaultEnabled === true, sessions: {} };
    }
}
function saveState(state) {
    // 淘汰最旧的会话条目，防无界增长；先淘汰与 default 同值的冗余条目，
    // 显式翻转过用户意图的条目（enabled ≠ default）尽量保留，避免静默回退到默认态
    const entries = Object.entries(state.sessions);
    if (entries.length > MAX_SESSION_ENTRIES) {
        const byOldest = (a, b) => (a[1].at || 0) - (b[1].at || 0);
        const meaningful = entries.filter(([, v]) => v.enabled !== state.default).sort(byOldest).slice(0, MAX_SESSION_ENTRIES);
        const room = MAX_SESSION_ENTRIES - meaningful.length;
        const redundant = room > 0 ? entries.filter(([, v]) => v.enabled === state.default).sort(byOldest).slice(0, room) : [];
        state.sessions = Object.fromEntries(meaningful.concat(redundant));
    }
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
/** 从模型组装上下文 / 命令调用里提取会话 id（对齐 dsh-plan-mode 的 context.agent.session 访问路径）。 */
function sessionIdOf(source) {
    const sid = source?.agent?.session?.id;
    return typeof sid === 'string' && sid.length > 0 && sid.length <= 512 ? sid : null;
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
/**
 * 挂载 Concise 输出风格：提示词 section + 会话级开关 + API + host 命令 + 持久化。
 * @param ctx - host 根上下文。
 * @param config - 插件配置（defaultEnabled 决定新会话默认状态）。
 */
export function apply(ctx, config = {}) {
    const state = loadState(config.defaultEnabled ?? false);
    const log = ctx.logger ?? {};
    const isEnabled = (sessionId) => sessionId === null ? state.default : (state.sessions[sessionId]?.enabled ?? state.default);
    const setEnabled = (sessionId, enabled) => {
        if (sessionId === null) {
            state.default = enabled;
        }
        else {
            state.sessions[sessionId] = { enabled, at: Date.now() };
        }
        try {
            saveState(state);
        }
        catch (error) {
            log.warn?.('[dsh-concise] persist state failed: ' + String(error));
        }
    };
    // 1) 系统提示词 section：text 每次组装求值，按"正在组装的会话"取开关；关闭时空串被渲染层丢弃
    if (ctx.systemPrompt) {
        ctx.effect(() => ctx.systemPrompt.section({
            name: SECTION_NAME,
            order: SECTION_ORDER,
            text: (context) => {
                const sid = sessionIdOf(context);
                return isEnabled(sid) ? activeStyle().text : '';
            },
        }), 'dsh-concise: prompt section');
        ctx.effect(() => ctx.systemPrompt.section({
            name: REMINDER_SECTION_NAME,
            order: REMINDER_SECTION_ORDER,
            text: (context) => {
                const sid = sessionIdOf(context);
                return isEnabled(sid) ? REMINDER_TEXT : '';
            },
        }), 'dsh-concise: reminder section');
    }
    else {
        log.warn?.('[dsh-concise] systemPrompt service missing — style injection disabled');
    }
    // 2) host 命令 /concise：作用于当前会话
    if (ctx.commands) {
        ctx.effect(() => ctx.commands.register({
            name: 'concise',
            description: 'toggle the Concise output style for this session (results first, no filler)',
            input: { hint: '[on|off|status]', images: false },
            handler: (invocation) => {
                const sid = sessionIdOf(invocation);
                const arg = invocation.rawInput.trim().toLowerCase();
                const statusText = () => {
                    const style = activeStyle();
                    return 'Concise output style: ' + (isEnabled(sid) ? 'ON' : 'OFF')
                        + '\nScope: this session only'
                        + '\nStyle source: ' + style.source + (style.source === 'custom' ? ' (' + styleFile() + ')' : '')
                        + '\n\nToggle: /concise, /concise on, /concise off';
                };
                const flipText = () => ({
                    kind: 'success',
                    text: isEnabled(sid)
                        ? 'Concise output style ENABLED for THIS session — replies lead with results and skip preamble/narration. Effective on the next turn.'
                        : 'Concise output style DISABLED for THIS session — replies return to the model\'s natural style. Effective on the next turn.',
                });
                if (arg === '' || arg === 'toggle') {
                    setEnabled(sid, !isEnabled(sid));
                    log.info?.('[dsh-concise] session ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'));
                    return flipText();
                }
                if (arg === 'on' || arg === 'off') {
                    setEnabled(sid, arg === 'on');
                    log.info?.('[dsh-concise] session ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'));
                    return flipText();
                }
                if (arg === 'status')
                    return { kind: 'success', text: statusText() };
                return { kind: 'error', text: 'Unknown argument: ' + arg + '\nUsage: /concise [on|off|status]' };
            },
        }), 'dsh-concise: /concise command');
    }
    else {
        log.warn?.('[dsh-concise] commands service missing — /concise command disabled');
    }
    // 3) 本地 HTTP API（client 按钮消费；仅本机回环）。带 sessionId 操作该会话，不带则操作新会话默认值。
    //    webServer 是可选服务（headless/CLI 等 profile 没有它）：用 ctx.inject 回调按需装配——
    //    服务可用才注册，永不 pending；随本插件 fiber 卸载即净。缺失时仅 API 降级（/concise 命令仍可用）。
    ctx.effect(() => ctx.inject(['webServer'], (scoped) => {
        const dispose = scoped.webServer.register({
            kind: 'prefix',
            path: '/dsh-concise/api',
            handler: async (req, res) => {
                const url = new URL(req.url ?? '/', 'http://localhost');
                const path = url.pathname.replace(/^\/dsh-concise\/api/, '') || '/';
                const method = (req.method ?? 'GET').toUpperCase();
                const sidFrom = (body) => {
                    const sid = body.sessionId ?? url.searchParams.get('sessionId');
                    return typeof sid === 'string' && sid.length > 0 && sid.length <= 512 ? sid : null;
                };
                if ((path === '/state' || path.startsWith('/state?')) && method === 'GET') {
                    const sid = sidFrom({});
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ enabled: isEnabled(sid), scoped: sid !== null, sessionId: sid, default: state.default }));
                    return;
                }
                if ((path === '/toggle' || path === '/set') && method === 'POST') {
                    const body = await readJsonBody(req);
                    const sid = sidFrom(body);
                    if (path === '/set') {
                        const wanted = body.enabled;
                        if (typeof wanted !== 'boolean') {
                            res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
                            res.end(JSON.stringify({ error: 'body.enabled must be a boolean' }));
                            return;
                        }
                        setEnabled(sid, wanted);
                    }
                    else {
                        setEnabled(sid, !isEnabled(sid));
                    }
                    log.info?.('[dsh-concise] ' + (sid ?? 'default') + ' concise ' + (isEnabled(sid) ? 'enabled' : 'disabled'));
                    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
                    res.end(JSON.stringify({ enabled: isEnabled(sid), scoped: sid !== null, sessionId: sid }));
                    return;
                }
                res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
                res.end(JSON.stringify({ error: 'not found' }));
            },
        });
        log.info?.('[dsh-concise] http api attached (webServer available)');
        return dispose;
    }), 'dsh-concise: http api');
}
//# sourceMappingURL=index.js.map