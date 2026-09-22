import z from '@deepseek-ai/schemastery';
/** Cordis plugin name. */
export declare const name = "dsh-concise";
/** Required services: the system prompt registry and the host command registry.
 *  webServer 不列入 inject：headless/CLI 等 profile 没有该服务，硬性等待会导致插件永远 pending。
 *  apply() 内对 ctx.webServer 做防御性判空（缺失时仅降级 API，风格注入不受影响）。 */
export declare const inject: string[];
/** Runtime schema（预留扩展位；当前无必填配置）。 */
export declare const Config: z<Schemastery.ObjectS<{
    /** 新会话的默认状态（默认关闭，与 Claude Code 默认输出风格一致）。 */
    defaultEnabled: z<boolean, boolean>;
}>, Schemastery.ObjectT<{
    /** 新会话的默认状态（默认关闭，与 Claude Code 默认输出风格一致）。 */
    defaultEnabled: z<boolean, boolean>;
}>>;
export type ConfigType = {
    defaultEnabled?: boolean;
};
/** Concise 输出风格正文：注入 system prompt 的实际内容（无 style.md 覆盖时使用）。 */
export declare const CONCISE_STYLE_TEXT: string;
interface RouteRequest {
    method?: string;
    url?: string;
    headers?: Record<string, string | string[] | undefined>;
    on: (event: string, fn: (chunk: unknown) => void) => void;
}
interface RouteResponse {
    writeHead: (code: number, headers: Record<string, string>) => void;
    end: (body: string) => void;
}
interface WebServerLike {
    register: (spec: {
        kind: 'prefix';
        path: string;
        handler: (req: RouteRequest, res: RouteResponse) => void | Promise<void>;
    }) => () => void;
}
interface SystemPromptLike {
    section: (section: {
        name: string;
        order: number;
        text: string | ((context?: unknown) => string);
    }) => () => void;
}
interface CommandInvocation {
    rawInput: string;
    agent?: {
        session?: {
            id?: unknown;
        };
    };
}
interface CommandsLike {
    register: (command: {
        name: string;
        description: string;
        input?: {
            hint?: string;
            images?: boolean;
        };
        handler: (invocation: CommandInvocation) => {
            kind: 'success' | 'error';
            text: string;
        };
    }) => () => void;
}
/** Minimal duck type of the live session object reachable from assemble context. */
interface SessionLike {
    id: unknown;
    header?: {
        cwd?: string;
    };
    deriveMessages?: () => unknown;
}
/** 摘要块起始标记（生成契约口径：措辞要求模型精确输出的形态）。 */
export declare const DIGEST_MARK = "> **\u6458\u8981\uFF1A**";
/**
 * 摘要块「检测」正则（host 判定口径）——必须与 client MARK_RE（blockquote textContent 前缀
 * /^(摘要：|说人话：)/）渲染口径同源：client 渲染成卡的形态 = blockquote 行以可选粗体的
 * 摘要：/说人话： 开头。0.11.0 及之前 host 只认严格 '> **摘要：**'，会把 client 已渲染成卡的
 * 变体（'> 摘要：…'、'> **说人话：**…'）误判为缺卡 → 误告警（实测「autofill 打点」会话 t0 即说人话卡）。
 */
export declare const DIGEST_DETECT_RE: RegExp;
/** 上一条最终回复的摘要判定结论。indeterminate = 上下文不可判（无 session/deriveMessages/异常/首轮）。 */
export type DigestVerdict = 'ok' | 'misplaced' | 'missing' | 'indeterminate';
export interface DigestFinding {
    verdict: DigestVerdict;
    /** missing/misplaced 时：违规最终回复的首行（截 80 字符），供警告点名引用。 */
    opener?: string;
    /** missing/misplaced 时：整条回复的稳定签名（长度+首行）——miss 连击按签名去重计数。 */
    sig?: string;
}
/**
 * 判定会话派生历史里「最后一条最终回复」的摘要合规性（纯函数，供 section 求值与单测共用）。
 * 向前找「最后一条不含 tool-call 块的 assistant 消息」= 最后一条最终回复（0.10.5 口径：回合中途的
 * 工具环消息不是 user-facing final reply，把它们当最终回复判定会让 miss 警告在 agentic 会话常驻）。
 * ok = 以摘要块开头（含可选粗体/说人话变体，渲染口径见 DIGEST_DETECT_RE）；
 * misplaced = 摘要块存在但不在第一行（卡片有渲染，但契约要求 digest 先于一切）；
 * missing = 没有任何摘要块；indeterminate = 无先前最终回复或上下文不可判（不告警不阻断组装）。
 */
export declare function digestFinding(session: SessionLike | undefined | null): DigestFinding;
/** 兼容口径：缺摘要（missing 或 misplaced 都算违反「digest 必须第一行」契约）。不可判 → false。 */
export declare function isDigestMissing(session: SessionLike | undefined | null): boolean;
/** agent/pre-step waterfall 载荷（dsh-time-context / dsh-agent-instructions 同款；实测出处见 CHANGELOG 0.11.2）。 */
interface PreStepPayload {
    agent?: {
        session?: SessionLike;
    };
    step?: number;
    signal?: {
        aborted?: boolean;
    };
}
interface PreStepDecision {
    kind?: string;
    messages?: unknown[];
}
interface HostContext {
    systemPrompt?: SystemPromptLike;
    commands?: CommandsLike;
    logger?: {
        info?: (...args: unknown[]) => void;
        warn?: (...args: unknown[]) => void;
        error?: (...args: unknown[]) => void;
    };
    effect: (fn: () => unknown | (() => void), label?: string) => void;
    /** cordis 事件总线：注册 agent/pre-step 瀑布中间件用（可选，缺失时降级为仅 system prompt 通道）。 */
    on?: (event: string, handler: (payload: PreStepPayload, next: () => Promise<PreStepDecision>) => Promise<PreStepDecision>, opts?: {
        prepend?: boolean;
    }) => () => void;
    /** cordis registry：服务可用时才执行回调（可选服务装配；headless 下 webServer 永不出现、回调不触发）。 */
    inject: (deps: string[], callback: (scoped: {
        webServer: WebServerLike;
    }) => unknown) => unknown;
}
/**
 * 挂载 Concise 输出风格：提示词 section + 会话级开关 + API + host 命令 + 持久化。
 * @param ctx - host 根上下文。
 * @param config - 插件配置（defaultEnabled 决定新会话默认状态）。
 */
export declare function apply(ctx: HostContext, config?: ConfigType): void;
export {};
