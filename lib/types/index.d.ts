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
interface HostContext {
    systemPrompt?: SystemPromptLike;
    commands?: CommandsLike;
    logger?: {
        info?: (...args: unknown[]) => void;
        warn?: (...args: unknown[]) => void;
        error?: (...args: unknown[]) => void;
    };
    effect: (fn: () => unknown | (() => void), label?: string) => void;
    /** cordis 事件订阅（可选）： miss 检测闭环用；环境无此能力时静默降级为纯措辞。 */
    on?: (event: string, listener: (payload: unknown) => void) => (() => void) | void;
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
