window.__ModuleLoader__.load({
	id: "dsh-concise",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom_client = require("react-dom/client");
		//#region src/client/normalize.ts
		/**
		* dsh-concise digest 链接规范化（v0.8.2）——纯函数，供 client 渲染增强与单测共用。
		*
		* 背景：宿主前端对 blockquote 内容走「纯文本 + 自定义 linkify」路径，其 URL 字符类
		* 包含 * 与 pct 编码段，会把紧贴 URL 的 markdown 粗体标记与中文句读一并吞进链接
		* （实测 href 形态：https://…/xxx**%E3%80%82），产出坏链接；标准 markdown 链接
		* [label](url) 不经该路径、不受影响。此函数在 digest 卡内做确定性兜底修复。
		*/
		/** href 尾部需要剥离的垃圾段：markdown 星号（字面与 pct 编码）+ 常用中文句读（字面与 pct 编码）。 */
		const TRAILING_HREF_JUNK = /(?:\*|%2A|。|，|、|：|；|？|！|（|）|%E3%80%82|%E3%80%81|%EF%BC%8C|%EF%BC%9A|%EF%BC%9B|%EF%BC%9F|%EF%BC%81|%EF%BC%88|%EF%BC%89)+$/i;
		/** 链接显示文字尾部需要剥离的垃圾段（字面形式）。 */
		const TRAILING_TEXT_JUNK = /(?:\*|。|，|、|：|；|？|！|（|）)+$/;
		/**
		* 修复 digest 卡内被宿主 linkify 污染的 href：循环剥离尾部的
		* markdown 星号与中文句读（字面/pct 编码），直到稳定。
		* 空结果与无 scheme 的结果一律回退原值（fail-safe，不制造新坏链）。
		*/
		function normalizeDigestHref(href) {
			if (!href) return href;
			let out = href;
			while (TRAILING_HREF_JUNK.test(out)) out = out.replace(TRAILING_HREF_JUNK, "");
			if (out.length === 0 || !/^[a-z][a-z0-9+.-]*:/i.test(out)) return href;
			return out;
		}
		/**
		* 修复 digest 卡内链接显示文字：剥离尾部的 markdown 星号与中文句读（字面），
		* 链接词与数字间的星号不受影响（只处理尾部）。
		*/
		function normalizeDigestText(text) {
			if (!text) return text;
			let out = text;
			while (TRAILING_TEXT_JUNK.test(out)) out = out.replace(TRAILING_TEXT_JUNK, "");
			return out;
		}
		//#endregion
		//#region src/client/chips.ts
		/** 扩展名 → 类型映射（小写、无点）。 */
		const EXT_KIND = {
			png: "image",
			jpg: "image",
			jpeg: "image",
			gif: "image",
			webp: "image",
			svg: "image",
			bmp: "image",
			ico: "image",
			pdf: "pdf",
			doc: "word",
			docx: "word",
			rtf: "word",
			xls: "excel",
			xlsx: "excel",
			csv: "excel",
			java: "code",
			kt: "code",
			ts: "code",
			tsx: "code",
			js: "code",
			jsx: "code",
			py: "code",
			go: "code",
			rs: "code",
			c: "code",
			cpp: "code",
			h: "code",
			hpp: "code",
			sh: "code",
			bash: "code",
			sql: "code",
			swift: "code",
			m: "code",
			md: "markdown",
			markdown: "markdown",
			zip: "archive",
			tar: "archive",
			gz: "archive",
			rar: "archive",
			"7z": "archive"
		};
		/** 类型 → 展示信息（低饱和类型色，与摘要卡暖黑底 + Claude 橙体系协调）。 */
		const KIND_INFO = {
			link: {
				color: "#D97757",
				label: "网页链接"
			},
			image: {
				color: "#A78BFA",
				label: "图片"
			},
			pdf: {
				color: "#EF4444",
				label: "PDF 文档"
			},
			word: {
				color: "#3B82F6",
				label: "Word 文档"
			},
			excel: {
				color: "#22C55E",
				label: "表格"
			},
			code: {
				color: "#F59E0B",
				label: "代码文件"
			},
			markdown: {
				color: "#94A3B8",
				label: "Markdown"
			},
			archive: {
				color: "#C084FC",
				label: "压缩包"
			},
			folder: {
				color: "#EAB308",
				label: "文件夹"
			},
			file: {
				color: "#9CA3AF",
				label: "文件"
			}
		};
		/** 判定路径/链接的类型与展示信息。 */
		function detectPathKind(path) {
			if (path.startsWith("http://") || path.startsWith("https://")) return {
				kind: "link",
				...KIND_INFO.link
			};
			const extMatch = /\.([A-Za-z0-9]{1,8})(?:[?#].*)?$/.exec(path);
			const ext = (extMatch ? extMatch[1] : "").toLowerCase();
			const kind = EXT_KIND[ext] ?? (ext ? "file" : "folder");
			return {
				kind,
				...KIND_INFO[kind]
			};
		}
		/**
		* 从摘要文本中切出 URL / 本地路径片段（保守边界：排除中文句读与全角括号，
		* 与宿主 linkify 的贪婪行为相反——宁可漏识别不可错切断）。
		*/
		function splitPathSegments(text) {
			const PATTERN = /* @__PURE__ */ new RegExp("(https?:\\/\\/[^\\s，。；）】”'\"<>]+|(?:(?:~/)|(?:/(?:Users|home|tmp|var|opt|etc|private|data|System)))[^\\s，。；）】”'\"<>]*|[A-Za-z0-9_\\-./]+\\.(?:png|jpeg|jpg|gif|webp|svg|bmp|ico|pdf|docx|doc|rtf|xlsx|xls|csv|css|java|kt|tsx|ts|json|jsx|js|py|go|rs|swift|bash|sh|sql|hpp|html|htm|markdown|md|txt|ya?ml|xml|zip|tar|gz|rar|7z|cpp|c))", "g");
			const out = [];
			let last = 0;
			for (const m of text.matchAll(PATTERN)) {
				const idx = m.index ?? 0;
				if (idx > last) out.push({
					type: "text",
					value: text.slice(last, idx)
				});
				const value = m[0];
				const trimmed = value.replace(/[.,;:)]+$/, "");
				const trailing = value.slice(trimmed.length);
				out.push({
					type: /^https?:/i.test(trimmed) ? "url" : "file",
					value: trimmed
				});
				if (trailing) out.push({
					type: "text",
					value: trailing
				});
				last = idx + value.length;
			}
			if (last < text.length) out.push({
				type: "text",
				value: text.slice(last)
			});
			return out.filter((seg) => seg.value.length > 0);
		}
		/** 极简内联 SVG 图标（24 viewBox，currentColor 继承类型色；路径文本一律 textContent 注入防注入）。 */
		const CHIP_ICONS = {
			link: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M3 12h18M12 3c2.5 2.6 3.8 5.7 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z\"/></svg>",
			image: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"2\"/><circle cx=\"9\" cy=\"10\" r=\"1.6\"/><path d=\"M5 19l5.5-6 4 4.2L18 14l3 5\"/></svg>",
			pdf: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z\"/><path d=\"M14 2v6h6\"/></svg>",
			word: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z\"/><path d=\"M14 2v6h6\"/><path d=\"M7.5 12l1.3 5.5 2-4.5 2 4.5L15 12\" stroke-width=\"1.6\"/></svg>",
			excel: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"3\" width=\"18\" height=\"18\" rx=\"2\"/><path d=\"M3 9h18M3 15h18M9 3v18M15 3v18\" stroke-width=\"1.4\"/></svg>",
			code: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M8.5 7L4 12l4.5 5M15.5 7L20 12l-4.5 5\"/><path d=\"M13 5l-2.5 14\" stroke-width=\"1.6\"/></svg>",
			markdown: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"2.5\" y=\"5\" width=\"19\" height=\"14\" rx=\"2\"/><path d=\"M6 15V9l2.5 3L11 9v6M16.5 9v5M14.5 12l2 2 2-2\" stroke-width=\"1.6\"/></svg>",
			archive: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"3\" y=\"4\" width=\"18\" height=\"5\" rx=\"1\"/><path d=\"M5 9v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4\"/></svg>",
			folder: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M3 6a2 2 0 0 1 2-2h4l2.5 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6z\"/></svg>",
			file: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M6 2h8l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z\"/><path d=\"M14 2v6h6\"/></svg>",
			copy: "<svg viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><rect x=\"9\" y=\"9\" width=\"12\" height=\"12\" rx=\"2\"/><path d=\"M5 15V5a2 2 0 0 1 2-2h10\"/></svg>"
		};
		/**
		* 交付物聚合（v0.10.0）：从整条回复文本中提取「值得列出的文件」，供摘要卡底部聚合区展示。
		* - replyText：同一条回复的全文（_markdown 容器）；cardText：摘要卡自身文本。
		* - 排除：URL（kind=link）、目录（kind=folder）、卡内文本已出现的（不重复列）。
		* - 保留出现顺序、去重、上限 limit（默认 8）。
		* 纯函数，供 client 渲染与单测共用。
		*/
		function collectDeliverables(replyText, cardText, limit = 8) {
			const card = cardText ?? "";
			const seen = /* @__PURE__ */ new Set();
			const out = [];
			for (const seg of splitPathSegments(replyText ?? "")) {
				if (seg.type !== "url" && seg.type !== "file") continue;
				const value = seg.value;
				if (seen.has(value) || card.includes(value)) continue;
				const kind = detectPathKind(value);
				if (kind.kind === "link" || kind.kind === "folder") continue;
				seen.add(value);
				out.push(value);
				if (out.length >= limit) break;
			}
			return out;
		}
		/** 判断节点是否已在 chip 或链接内（避免重复处理）。 */
		function insideChip(node) {
			let cur = node;
			while (cur) {
				if (cur instanceof Element && (cur.classList.contains("dsh-concise-chip") || cur.tagName === "A")) return true;
				cur = cur.parentNode;
			}
			return false;
		}
		/** 短时状态标：加类并定时移除。 */
		function mark(el, cls) {
			el.classList.add(cls);
			window.setTimeout(() => el.classList.remove(cls), 1500);
		}
		/** 构造单个 chip 元素（路径用 textContent 注入，防 HTML 注入；本地文件点击复制路径）。 */
		function buildChip(value, isUrl) {
			const info = detectPathKind(value);
			const el = document.createElement(isUrl ? "a" : "span");
			el.className = "dsh-concise-chip dsh-concise-chip-" + info.kind;
			el.style.setProperty("--dcc-c", info.color);
			if (isUrl) {
				const a = el;
				a.href = value;
				a.target = "_blank";
				a.rel = "noopener noreferrer";
				el.addEventListener("click", (ev) => {
					ev.preventDefault();
					ev.stopPropagation();
					try {
						window.open(value, "_blank", "noopener");
					} catch {}
				});
			} else {
				const path = value;
				el.title = info.label + " · 点击用系统默认应用打开";
				el.addEventListener("click", (ev) => {
					ev.stopPropagation();
					(async () => {
						let candidates = [];
						try {
							const res = await fetch("/dsh-concise/api/cwd");
							if (res.ok) {
								const j = await res.json();
								const list = Array.isArray(j.candidates) ? j.candidates : [];
								candidates = [j.cwd ?? "", ...list.filter((c) => typeof c === "string")].filter((c, i, arr) => c.length > 0 && arr.indexOf(c) === i);
							}
						} catch {}
						if (candidates.length === 0) candidates = [""];
						for (const cwd of candidates) {
							const abs = resolveAbsolute(path, cwd, "");
							try {
								if ((await fetch("/dsh-concise/api/open", {
									method: "POST",
									headers: { "content-type": "application/json" },
									body: JSON.stringify({ path: abs })
								})).ok) {
									mark(el, "dcc-opened");
									return;
								}
							} catch {}
						}
						try {
							await navigator.clipboard?.writeText(path);
						} catch {}
						mark(el, "dcc-copied");
					})();
				});
			}
			const iconHost = document.createElement("span");
			iconHost.className = "dcc-i";
			iconHost.innerHTML = CHIP_ICONS[info.kind] ?? CHIP_ICONS.file;
			const label = document.createElement("span");
			label.className = "dcc-p";
			label.textContent = value;
			el.appendChild(iconHost);
			el.appendChild(label);
			const act = document.createElement("span");
			act.className = "dcc-a";
			act.innerHTML = isUrl ? CHIP_ICONS.link : CHIP_ICONS.copy;
			el.appendChild(act);
			return el;
		}
		/** 摘要卡内路径 chip 化：遍历文本节点切分注入；已在链接/chip 内的文本跳过（幂等）。 */
		function applyChipEnhancement(root) {
			const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
			const targets = [];
			let node = walker.nextNode();
			while (node) {
				targets.push(node);
				node = walker.nextNode();
			}
			for (const textNode of targets) {
				if (insideChip(textNode.parentNode)) continue;
				const text = textNode.textContent ?? "";
				if (text.trim().length === 0) continue;
				const segments = splitPathSegments(text);
				if (segments.length === 1 && segments[0].type === "text") continue;
				const frag = document.createDocumentFragment();
				for (const seg of segments) {
					if (seg.type === "text") {
						frag.appendChild(document.createTextNode(seg.value));
						continue;
					}
					frag.appendChild(buildChip(seg.value, seg.type === "url"));
				}
				textNode.parentNode?.replaceChild(frag, textNode);
			}
		}
		/** 相对路径 → 绝对路径：~ 开头按 home（= cwd 前 3 段）代；相对按 cwd 拼接；绝对原样。 */
		function resolveAbsolute(path, cwd, home) {
			if (path.startsWith("/")) return path;
			if (path.startsWith("~/")) {
				const base = home || (cwd ? cwd.split("/").slice(0, 3).join("/") : "");
				return base ? base + path.slice(1) : path;
			}
			return cwd ? cwd.replace(/\/?$/, "/") + path : path;
		}
		//#endregion
		//#region src/client/index.ts
		/**
		* dsh-concise client：
		* 在 composer 工具行注入 Concise 输出风格开关按钮——紧贴「增强提示词」按钮
		* （dsh-improve-prompt，sparkle「标准/轻量」pill）的【左侧】（行序：Concise →
		* 增强提示词 → 模型选择按钮，官方模型按钮与 kiro 模型选择器均在右）。
		*
		* 落位实现：right 槽（conversation.input.right）条目被官方渲染在模型按钮【左侧】，
		* 与直觉相反；因此本插件以 right 槽条目为自定位锚点——组件挂载后从自身 DOM 出发
		* 找到同一工具行内的 dsh-improve-prompt 条目（div.dip-root），把一个自有 portal
		* 容器 insert 到它的紧右侧，并用 MutationObserver 保持相对位置。
		* 降级链：improve-prompt 未装/未渲染 → 模型 seat 紧左侧（同区域）；
		* 模型 seat 也不可寻（理论边缘态）→ 退化为 right 槽原位渲染，功能不丢。
		*
		* 收起式交互（v0.5.0/v0.6.0）：按钮默认收起只显示滑轨（占位壳固定收起宽度）；
		* Switch 部分紧贴 improve-prompt 左侧固定不动，Concise 文字在按钮内位于滑轨
		* 左侧，悬停/键盘聚焦时向左平滑展开——右缘固定，绝不推动相邻控件。
		*
		* 数据面：GET/POST /dsh-concise/api（host 插件提供），**按会话独立开关**（新会话取 default），
		* 跨重启持久。按钮通过槽位 inject 拿到当前会话 id，所有状态读写都带 sessionId。
		*/
		const name = "dsh-concise";
		const inject = ["slots", "locale"];
		const NS = "dsh-concise";
		const STATE_URL = "/dsh-concise/api/state";
		const TOGGLE_URL = "/dsh-concise/api/toggle";
		const CHANGE_EVENT = "dsh-concise:change";
		const zh = {
			toggleAria: "切换 Concise 输出风格",
			tooltip: "Concise 输出风格：结果先行、少废话，工作深浅不变（仅影响当前会话的新回复）",
			on: "开",
			off: "关",
			unknown: "…"
		};
		const en = {
			toggleAria: "Toggle concise output style",
			tooltip: "Concise output style: results first, no filler — same work depth (this session only, affects new replies)",
			on: "ON",
			off: "OFF",
			unknown: "…"
		};
		const FALLBACK = { ...en };
		const css = [
			"[data-dsh-concise-anchor]{display:inline-flex;align-items:center;flex:none}",
			".dsh-concise-root{position:relative;flex:none;width:42px;height:28px;display:inline-block}",
			".dsh-concise-trigger{position:absolute;right:0;top:0;height:28px;cursor:pointer;border-radius:24px;outline:none;display:inline-flex;align-items:center;white-space:nowrap;gap:0;padding:0 5px;font-size:12px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-secondary);background-image:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,0));border:1px solid var(--dsw-alias-border-l2);z-index:2;transition:gap .28s cubic-bezier(.34,1.3,.5,1),padding .28s cubic-bezier(.34,1.3,.5,1),border-color .2s ease,color .2s ease,background-color .2s ease,transform .12s ease}",
			".dsh-concise-trigger:hover{color:var(--dsw-alias-label-primary);background-color:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}",
			".dsh-concise-trigger:active{transform:scale(.96)}",
			".dsh-concise-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;opacity:.7}",
			".dsh-concise-trigger:hover,.dsh-concise-trigger:focus-visible{gap:6px;padding:0 9px}",
			".dsh-concise-label{max-width:0;opacity:0;transform:translateX(-4px);overflow:hidden;text-overflow:clip;white-space:nowrap;transition:max-width .3s cubic-bezier(.4,0,.2,1),opacity .22s ease,transform .3s cubic-bezier(.4,0,.2,1)}",
			".dsh-concise-trigger:hover .dsh-concise-label,.dsh-concise-trigger:focus-visible .dsh-concise-label{max-width:72px;opacity:1;transform:none}",
			".dsh-concise-trigger::after{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:linear-gradient(115deg,transparent 32%,rgba(255,255,255,.26) 48%,transparent 62%);transform:translateX(-130%);transition:transform .65s ease}",
			".dsh-concise-trigger:hover::after{transform:translateX(130%)}",
			".dsh-concise-switch{position:relative;width:30px;height:16px;border-radius:999px;flex:none;background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);transition:background-color .25s ease,border-color .25s ease,box-shadow .25s ease}",
			".dsh-concise-knob{position:absolute;top:50%;left:2px;width:10px;height:10px;border-radius:999px;background:linear-gradient(180deg,#fff,#f1f1f1);box-shadow:0 1px 2.5px rgba(0,0,0,.28),0 0 0 .5px rgba(0,0,0,.04);transform:translateY(-50%);transition:transform .3s cubic-bezier(.34,1.56,.64,1),width .18s ease}",
			".dsh-concise-trigger:active .dsh-concise-knob{width:11px}",
			".dsh-concise-trigger[data-on=\"true\"]{color:var(--dsw-alias-label-primary);border-color:rgba(217,119,87,.72);background-color:rgba(217,119,87,.08);box-shadow:0 0 9px rgba(217,119,87,.25)}",
			".dsh-concise-trigger[data-on=\"true\"]:hover{border-color:rgba(230,148,112,.9)}",
			".dsh-concise-trigger[data-on=\"true\"] .dsh-concise-switch{background:linear-gradient(135deg,#F0B08F,#D97757 55%,#C25E3F);border-color:rgba(217,119,87,.85);animation:dsh-concise-breathe 2.8s ease-in-out infinite}",
			".dsh-concise-trigger[data-on=\"true\"] .dsh-concise-knob{transform:translate(14px,-50%)}",
			"@keyframes dsh-concise-breathe{0%,100%{box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 0 7px rgba(217,119,87,.35)}50%{box-shadow:inset 0 1px 1px rgba(255,255,255,.35),0 0 15px rgba(217,119,87,.6)}}",
			".dsh-concise-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
			"@media (prefers-reduced-motion:reduce){.dsh-concise-trigger,.dsh-concise-trigger::after,.dsh-concise-label,.dsh-concise-switch,.dsh-concise-knob{transition:none!important;animation:none!important}}",
			".dsh-concise-digest{position:relative!important;font-family:ui-monospace,\"SF Mono\",Menlo,Consolas,\"Liberation Mono\",\"PingFang SC\",\"Microsoft YaHei\",monospace!important;font-size:1.18em!important;line-height:1.8!important;border:1px solid rgba(150,110,90,.16)!important;border-radius:16px!important;background:linear-gradient(180deg,#FEFDFC,#FBF7F3)!important;box-shadow:0 1px 4px rgba(60,40,30,.06)!important;padding:14px 18px!important;margin:10px 0!important;color:#2B211B!important;cursor:text;transition:box-shadow .25s ease,border-color .25s ease,transform .25s ease;animation:bp-in .4s ease backwards}",
			".dsh-concise-digest::before{content:\"\";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(150,110,90,.055) 0,rgba(150,110,90,.055) 1px,transparent 1px,transparent 26px),repeating-linear-gradient(90deg,rgba(150,110,90,.055) 0,rgba(150,110,90,.055) 1px,transparent 1px,transparent 26px);opacity:.55;transition:opacity .3s ease}",
			".dsh-concise-digest::after{content:\"\";position:absolute;inset:7px;pointer-events:none;background:linear-gradient(#E8926B,#E8926B) 0 0/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 0 0/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 0/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 0/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 0 100%/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 0 100%/2px 12px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 100%/13px 2px no-repeat,linear-gradient(#E8926B,#E8926B) 100% 100%/2px 12px no-repeat;opacity:.85;animation:bp-brackets .5s ease .12s backwards}",
			".dsh-concise-digest:hover{border-color:rgba(201,87,59,.35)!important;box-shadow:0 4px 16px rgba(217,119,87,.12)!important;transform:translateY(-1px)}",
			".dsh-concise-digest:hover::before{opacity:.85}",
			".dsh-concise-digest{animation:bp-in .4s ease backwards}",
			"@keyframes bp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}",
			"@keyframes bp-brackets{from{opacity:0}to{opacity:.9}}",
			".dsh-concise-digest p>strong:first-child{display:block!important;font-weight:700!important;color:#2B211B!important;letter-spacing:.08em!important;margin-bottom:6px!important}",
			".dsh-concise-digest p>strong:first-child::before{content:\"DIGEST // \";color:#E8926B!important;letter-spacing:.06em!important}",
			".dsh-concise-digest[data-copied=\"1\"] p>strong:first-child::before{content:\"COPIED ✓ \";color:#2E9E5B!important}",
			".dsh-concise-digest p strong:not(:first-child){font-weight:700!important;color:#17100D!important}",
			".dsh-concise-digest .dsh-concise-chip{display:inline-flex;align-items:center;gap:.3em;padding:.05em .5em;margin:0 .1em;vertical-align:baseline;border-radius:6px;border:1px solid color-mix(in srgb,var(--dcc-c) 42%,transparent);background:color-mix(in srgb,var(--dcc-c) 10%,transparent);color:var(--dcc-c);font-size:.92em;line-height:1.55;text-decoration:none!important;cursor:pointer;transition:transform .12s ease,box-shadow .12s ease,border-color .12s ease;animation:dcc-in .18s ease backwards}",
			".dsh-concise-digest .dsh-concise-chip:hover{transform:translateY(-1px);border-color:var(--dcc-c);box-shadow:0 2px 12px color-mix(in srgb,var(--dcc-c) 32%,transparent);background:color-mix(in srgb,var(--dcc-c) 16%,transparent)}",
			".dsh-concise-digest .dsh-concise-chip:active{transform:translateY(0) scale(.98)}",
			".dsh-concise-digest .dsh-concise-chip .dcc-i{display:inline-flex;width:1.05em;height:1.05em;flex:none}",
			".dsh-concise-digest .dsh-concise-chip .dcc-i svg{width:100%;height:100%}",
			".dsh-concise-digest .dsh-concise-chip .dcc-a{display:inline-flex;width:.85em;height:.85em;flex:none;opacity:.55}",
			".dsh-concise-digest .dsh-concise-chip .dcc-a svg{width:100%;height:100%}",
			".dsh-concise-digest .dsh-concise-chip .dcc-p{color:inherit;max-width:36em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}",
			".dsh-concise-digest .dsh-concise-chip.dcc-copied .dcc-a{color:#2E9E5B;opacity:1}",
			".dsh-concise-digest .dsh-concise-chip.dcc-copied::after{content:\"已复制 ✓\";color:#2E9E5B;font-size:.85em;font-weight:700;margin-left:.2em}",
			".dsh-concise-files{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-top:12px;padding-top:10px;border-top:1px dashed rgba(150,110,90,.28)}",
			".dsh-concise-files-label{font-size:.7em;letter-spacing:.14em;color:#B98263;font-weight:700;flex:none;user-select:none}",
			".dsh-concise-files .dsh-concise-chip{max-width:100%}",
			"@keyframes dcc-in{from{opacity:0;transform:scale(.95)}to{opacity:1;transform:scale(1)}}",
			"@media (prefers-reduced-motion:reduce){.dsh-concise-digest .dsh-concise-chip{animation:none;transition:none}}",
			"@media (prefers-reduced-motion:reduce){.dsh-concise-digest,.dsh-concise-digest::after{animation:none!important}.dsh-concise-digest::after{opacity:.9}}"
		].join("\n");
		/**
		* 从自身渲染位置出发，找到「自己所在工具行」里的模型 seat 容器。
		* 页面可能同时挂载多个 composer 实例（hero / 会话视图 / 折叠面板），绝不能用
		* 「祖先 contains 我的根」这类宽松判断——那会顺着别的 composer 的模型按钮爬到
		* 公共祖先。正确做法：从自己的 wrapper 逐层向上，在每层检查兄弟子树中的模型
		* 按钮；最低命中层即本工具行（模型 seat 与本插件条目是同层兄弟）。
		*/
		function findModelSeat(myRoot) {
			const isModelButton = (element) => element.tagName === "BUTTON" && /模型|model/i.test(element.getAttribute("aria-label") ?? "");
			let wrapper = myRoot.parentElement;
			while (wrapper && wrapper !== document.body) {
				const row = wrapper.parentElement;
				if (row === null) break;
				for (const child of Array.from(row.children)) {
					if (child === wrapper || child.contains(myRoot)) continue;
					if (Array.from(child.querySelectorAll("button[aria-label]")).find(isModelButton) !== void 0) return {
						row,
						seat: child
					};
				}
				wrapper = row;
			}
			return null;
		}
		/**
		* 在工具行里找 dsh-improve-prompt 条目的顶层包裹（返回元素满足 parentElement === row）。
		* 官方 right 槽会把多个插件条目渲染进同一个共享容器（本插件的隐形锚根也在其中），
		* 因此不能按 row 子代逐个探测——包含自身的容器会被误跳过；必须从 dip 元素本身
		* 向上爬到 row 的直接子代。
		* 三重识别，防该插件独立改造导致类名漂移：
		* ① 精确类名 .dip-root；② dip- 类名前缀容忍；③ aria-label 文本匹配。
		* 全部未命中返回 null（落位降级为模型 seat 紧左侧）。
		*/
		function findImproveEntry(row) {
			const labelMatch = (element) => element.tagName === "BUTTON" && /增强提示词|enhance prompt/i.test(element.getAttribute("aria-label") ?? "");
			const probes = [
				(scope) => scope.querySelector(".dip-root"),
				(scope) => scope.querySelector("[class*=\"dip-\"]"),
				(scope) => Array.from(scope.querySelectorAll("button[aria-label]")).find(labelMatch) ?? null
			];
			for (const probe of probes) {
				const dip = probe(row);
				if (dip === null) continue;
				let wrapper = dip;
				while (wrapper.parentElement !== null && wrapper.parentElement !== row) wrapper = wrapper.parentElement;
				if (wrapper.parentElement === row) return wrapper;
			}
			return null;
		}
		/** 会话级状态缓存：切会话时按钮先用缓存即时渲染（stale-while-revalidate），不闪加载态。 */
		const stateCache = /* @__PURE__ */ new Map();
		function cacheKey(sessionId) {
			return sessionId ?? "";
		}
		async function fetchState(sessionId) {
			try {
				const qs = sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : "";
				const response = await fetch(STATE_URL + qs, { cache: "no-store" });
				if (!response.ok) return null;
				const data = await response.json();
				const enabled = data.enabled === true;
				stateCache.set(cacheKey(sessionId), enabled);
				if (typeof data.default === "boolean") stateCache.set("", data.default);
				return enabled;
			} catch {
				return null;
			}
		}
		const ConciseButton = ({ t, sessionId }) => {
			const [enabled, setEnabled] = react.default.useState(() => {
				const cached = stateCache.get(cacheKey(sessionId)) ?? stateCache.get("");
				return cached === void 0 ? null : cached;
			});
			const [busy, setBusy] = react.default.useState(false);
			const applyEnabled = (value) => {
				setEnabled(value);
				stateCache.set(cacheKey(sessionId), value);
			};
			react.default.useEffect(() => {
				let disposed = false;
				fetchState(sessionId).then((value) => {
					if (!disposed && value !== null) setEnabled(value);
				});
				const refetch = () => {
					fetchState(sessionId).then((value) => {
						if (value !== null) applyEnabled(value);
					});
				};
				const onChange = (event) => {
					const detail = event.detail;
					if (detail && typeof detail.enabled === "boolean" && detail.sessionId === sessionId) applyEnabled(detail.enabled);
					else refetch();
				};
				const onVisible = () => {
					if (document.visibilityState === "visible") refetch();
				};
				const timer = window.setInterval(() => {
					if (document.visibilityState === "visible") refetch();
				}, 15e3);
				window.addEventListener("focus", refetch);
				document.addEventListener("visibilitychange", onVisible);
				window.addEventListener(CHANGE_EVENT, onChange);
				return () => {
					disposed = true;
					window.clearInterval(timer);
					window.removeEventListener("focus", refetch);
					document.removeEventListener("visibilitychange", onVisible);
					window.removeEventListener(CHANGE_EVENT, onChange);
				};
			}, [sessionId]);
			const toggle = async () => {
				if (busy) return;
				setBusy(true);
				try {
					const response = await fetch(TOGGLE_URL, {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(sessionId ? { sessionId } : {})
					});
					if (response.ok) {
						const next = (await response.json()).enabled === true;
						applyEnabled(next);
						window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: {
							enabled: next,
							sessionId
						} }));
					}
				} catch (error) {
					console.warn("[dsh-concise] toggle failed:", error);
				} finally {
					setBusy(false);
				}
			};
			const on = enabled === true;
			return react.default.createElement("div", { className: "dsh-concise-root" }, react.default.createElement("button", {
				type: "button",
				className: "dsh-concise-trigger",
				"data-on": on ? "true" : "false",
				"aria-pressed": on,
				"aria-label": t("toggleAria"),
				title: t("tooltip"),
				disabled: busy || enabled === null,
				onClick: () => {
					toggle();
				}
			}, react.default.createElement("span", { className: "dsh-concise-label" }, "Concise"), react.default.createElement("span", {
				className: "dsh-concise-switch",
				"aria-hidden": true
			}, react.default.createElement("span", { className: "dsh-concise-knob" }))));
		};
		/**
		* right 槽条目：自身仅渲染一个不可见的锚根（display:contents），
		* 真正的按钮 portal 到「增强提示词」条目紧左侧（未装时模型 seat 紧左侧，
		* 异常形态再退化为原位渲染）。
		*/
		const ConciseSeat = ({ t, sessionId }) => {
			const rootRef = react.default.useRef(null);
			const [fallback, setFallback] = react.default.useState(false);
			react.default.useEffect(() => {
				if (!rootRef.current) return;
				let disposed = false;
				let anchor = null;
				let portalRoot = null;
				let observedRow = null;
				let frames = 0;
				let frame = 0;
				const place = () => {
					if (disposed) return true;
					const current = rootRef.current;
					if (!current || !current.isConnected) return false;
					const found = findModelSeat(current);
					if (!found) return false;
					if (!anchor) {
						anchor = document.createElement("div");
						anchor.setAttribute("data-dsh-concise-anchor", "");
					}
					const improve = findImproveEntry(found.row);
					const target = improve !== null && improve !== found.seat ? improve : null;
					if (target !== null ? anchor.parentElement !== found.row || anchor.nextElementSibling !== target : anchor.parentElement !== found.row || anchor.nextElementSibling !== found.seat) {
						if (target !== null) target.before(anchor);
						else found.seat.before(anchor);
					}
					if (!portalRoot) {
						portalRoot = (0, react_dom_client.createRoot)(anchor);
						portalRoot.render(react.default.createElement(ConciseButton, {
							t,
							sessionId
						}));
					}
					if (observedRow !== found.row) {
						observer.disconnect();
						observer.observe(found.row, {
							childList: true,
							subtree: true
						});
						observedRow = found.row;
					}
					setFallback(false);
					return true;
				};
				const observer = new MutationObserver(() => {
					if (disposed) return;
					if (!place() && anchor) anchor.style.display = "none";
					else if (anchor) anchor.style.display = "";
				});
				const tick = () => {
					if (disposed) return;
					if (place()) return;
					frames += 1;
					if (frames > 40) {
						setFallback(true);
						return;
					}
					frame = requestAnimationFrame(tick);
				};
				frame = requestAnimationFrame(tick);
				return () => {
					disposed = true;
					cancelAnimationFrame(frame);
					observer.disconnect();
					if (portalRoot) {
						try {
							portalRoot.unmount();
						} catch {}
						portalRoot = null;
					}
					if (anchor) {
						anchor.remove();
						anchor = null;
					}
				};
			}, [t, sessionId]);
			if (fallback) return react.default.createElement(ConciseButton, {
				t,
				sessionId
			});
			return react.default.createElement("div", {
				ref: rootRef,
				style: { display: "contents" },
				"data-dsh-concise-seat": ""
			});
		};
		/**
		* Client plugin body：注册字典、样式、right 槽条目（按钮 portal 到「增强提示词」左侧）
		* 与精华摘要卡渲染增强（以「摘要：」开头的 blockquote → 圆角高亮卡）。
		* @param ctx - client 根上下文。
		*/
		function apply(ctx) {
			try {
				if (ctx.locale) ctx.effect(() => ctx.locale.register(NS, {
					zh,
					en
				}), "dsh-concise: dictionaries");
			} catch (error) {
				console.warn("[dsh-concise] locale register failed; using built-in labels", error);
			}
			const bind = ctx.locale?.bind(NS);
			const t = (key) => {
				if (bind) try {
					return bind(key);
				} catch {}
				return FALLBACK[key] ?? key;
			};
			ctx.effect(() => {
				if (typeof document === "undefined") return;
				document.querySelectorAll("style[data-plugin=\"dsh-concise\"]").forEach((node) => node.remove());
				const style = document.createElement("style");
				style.dataset.plugin = "dsh-concise";
				style.textContent = css;
				document.head.appendChild(style);
				return () => {
					style.remove();
				};
			}, "dsh-concise: client styles");
			ctx.effect(() => {
				if (typeof document === "undefined") return;
				const MARK_RE = /^(摘要：|说人话：)/;
				const STABLE_MS = 1200;
				const cards = /* @__PURE__ */ new Map();
				let queued = 0;
				const contentSig = (bq) => {
					const clone = bq.cloneNode(true);
					clone.querySelectorAll(".dsh-concise-files").forEach((n) => n.remove());
					const text = clone.textContent ?? "";
					return text.length + "|" + text.slice(0, 24) + "|" + text.slice(-48);
				};
				const replyContainerOf = (bq) => {
					const md = bq.closest("[class*=\"_markdown\"]");
					if (md) return md;
					let el = bq.parentElement;
					const cardLen = (bq.textContent ?? "").length;
					for (let i = 0; el && el !== document.body && i < 8; i++) {
						if (el.querySelector("table, pre, h1, h2, h3, ul, ol") !== null && (el.textContent ?? "").length > cardLen + 200) return el;
						el = el.parentElement;
					}
					return null;
				};
				const blockAwareText = (root) => {
					const BLOCK = "td,th,li,p,h1,h2,h3,h4,h5,h6,pre,blockquote";
					return Array.from(root.querySelectorAll(BLOCK)).filter((b) => !b.querySelector(BLOCK)).map((b) => b.textContent ?? "").join("\n") + "\n";
				};
				const renderDeliverables = (bq) => {
					bq.querySelectorAll(":scope > .dsh-concise-files").forEach((n) => n.remove());
					const container = replyContainerOf(bq);
					const files = collectDeliverables(container ? blockAwareText(container) : bq.textContent ?? "", bq.textContent ?? "", 8);
					if (files.length === 0) return;
					const zone = document.createElement("div");
					zone.className = "dsh-concise-files";
					const label = document.createElement("span");
					label.className = "dsh-concise-files-label";
					label.textContent = "交付物 · FILES";
					zone.appendChild(label);
					for (const f of files) zone.appendChild(buildChip(f, false));
					bq.appendChild(zone);
				};
				const enhanceCard = (bq) => {
					for (const a of Array.from(bq.querySelectorAll("a[href]"))) {
						const href = a.getAttribute("href") ?? "";
						const fixedHref = normalizeDigestHref(href);
						if (fixedHref !== href) a.setAttribute("href", fixedHref);
						const text = a.textContent ?? "";
						const fixedText = normalizeDigestText(text);
						if (fixedText !== text) a.textContent = fixedText;
					}
					applyChipEnhancement(bq);
					if (bq instanceof HTMLElement) renderDeliverables(bq);
				};
				const scan = () => {
					queued = 0;
					for (const bq of Array.from(document.querySelectorAll("blockquote"))) {
						const hit = MARK_RE.test((bq.textContent ?? "").trimStart());
						bq.classList.toggle("dsh-concise-digest", hit);
						if (hit && !bq.title) bq.title = "划选卡内文字，松开即复制";
						if (!hit) {
							cards.delete(bq);
							continue;
						}
						let st = cards.get(bq);
						if (!st) {
							st = {
								sig: "",
								enhanced: false,
								timer: void 0
							};
							cards.set(bq, st);
						}
						const sig = contentSig(bq);
						if (sig !== st.sig) {
							st.sig = sig;
							st.enhanced = false;
							if (st.timer !== void 0) window.clearTimeout(st.timer);
							const card = bq;
							const state = st;
							state.timer = window.setTimeout(() => {
								state.timer = void 0;
								if (!card.isConnected) {
									cards.delete(card);
									return;
								}
								enhanceCard(card);
								state.enhanced = true;
							}, STABLE_MS);
						} else if (st.enhanced && st.timer === void 0 && bq.querySelector(".dsh-concise-chip") === null) enhanceCard(bq);
					}
					for (const [el, st] of cards) if (!el.isConnected) {
						if (st.timer !== void 0) window.clearTimeout(st.timer);
						cards.delete(el);
					}
				};
				const schedule = () => {
					if (queued) return;
					queued = requestAnimationFrame(() => {
						queued = 0;
						scan();
					});
				};
				const observer = new MutationObserver(schedule);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					characterData: true
				});
				let lastCopied = "";
				const copySelection = () => {
					const sel = window.getSelection();
					if (!sel || sel.isCollapsed) return;
					const node = sel.anchorNode;
					const card = (node && node.nodeType === 1 ? node : node?.parentElement)?.closest(".dsh-concise-digest");
					if (!card) return;
					const text = sel.toString().trim();
					if (!text || text === lastCopied) return;
					lastCopied = text;
					try {
						navigator.clipboard?.writeText(text).then(() => {
							card.dataset.copied = "1";
							window.setTimeout(() => {
								delete card.dataset.copied;
							}, 1400);
						}).catch(() => {});
					} catch {}
				};
				const onMouseUp = () => {
					copySelection();
				};
				document.addEventListener("mouseup", onMouseUp);
				schedule();
				return () => {
					observer.disconnect();
					document.removeEventListener("mouseup", onMouseUp);
					if (queued) {
						cancelAnimationFrame(queued);
						queued = 0;
					}
					for (const [, st] of cards) if (st.timer !== void 0) window.clearTimeout(st.timer);
					cards.clear();
					document.querySelectorAll(".dsh-concise-digest").forEach((node) => {
						node.classList.remove("dsh-concise-digest");
						delete node.dataset.copied;
					});
				};
			}, "dsh-concise: digest card renderer");
			ctx.effect(() => {
				try {
					return ctx.slots.inject("conversation.input.right", function* () {
						yield ctx.slots.register({
							name: "conversation.input.right",
							id: "dsh-concise-toggle",
							order: 50,
							locale: NS,
							inject: (sessionId) => ({ sessionId })
						}, (props) => react.default.createElement(ConciseSeat, {
							t,
							sessionId: props?.sessionId
						}));
					});
				} catch (error) {
					console.error("[dsh-concise] right slot register failed", error);
					return () => {};
				}
			}, "dsh-concise: composer toggle entry");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		exports.name = name;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map