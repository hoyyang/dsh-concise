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
		//#region src/client/index.ts
		/**
		* dsh-concise client：
		* 在 composer 工具行「模型选择按钮」右侧注入 Concise 输出风格开关按钮。
		*
		* 落位实现：right 槽（conversation.input.right）条目被官方渲染在模型按钮【左侧】，
		* 与直觉相反；因此本插件以 right 槽条目为自定位锚点——组件挂载后从自身 DOM 出发
		* 找到同一工具行内的模型 seat 容器，把一个自有 portal 容器 insert 到它的紧右侧
		* （模型按钮与发送按钮之间），并用 MutationObserver 保持相对位置。
		* 找不到模型 seat 时（理论边缘态）退化为 right 槽原位渲染，功能不丢。
		*
		* 数据面：GET/POST /dsh-concise/api（host 插件提供），全局开关，跨重启持久。
		*/
		const name = "dsh-concise";
		const inject = ["slots", "locale"];
		const NS = "dsh-concise";
		const STATE_URL = "/dsh-concise/api/state";
		const TOGGLE_URL = "/dsh-concise/api/toggle";
		const CHANGE_EVENT = "dsh-concise:change";
		const zh = {
			toggleAria: "切换 Concise 输出风格",
			tooltip: "Concise 输出风格：结果先行、少废话，工作深浅不变（全局生效，影响新回复）",
			on: "开",
			off: "关",
			unknown: "…"
		};
		const en = {
			toggleAria: "Toggle concise output style",
			tooltip: "Concise output style: results first, no filler — same work depth (global, affects new replies)",
			on: "ON",
			off: "OFF",
			unknown: "…"
		};
		const FALLBACK = { ...en };
		const css = [
			"[data-dsh-concise-anchor]{display:inline-flex;align-items:center;flex:none}",
			".dsh-concise-root{position:relative;flex:none;display:inline-flex}",
			".dsh-concise-trigger{min-width:0;height:28px;cursor:pointer;background:0 0;border:1px solid var(--dsw-alias-border-l2);border-radius:24px;outline:none;align-items:center;gap:6px;padding:0 10px;font-size:12px;font-weight:500;line-height:20px;display:inline-flex;color:var(--dsw-alias-label-secondary);transition:background-color .12s ease,border-color .12s ease,color .12s ease}",
			".dsh-concise-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".dsh-concise-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
			".dsh-concise-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;opacity:.7}",
			".dsh-concise-dot{width:7px;height:7px;border-radius:100%;flex:none;background:var(--dsw-alias-label-dimmed);border:1px solid var(--dsw-alias-border-l2);transition:background-color .12s ease,border-color .12s ease,box-shadow .12s ease}",
			".dsh-concise-label{text-overflow:ellipsis;white-space:nowrap;overflow:hidden}",
			".dsh-concise-state{font-size:11px;line-height:16px;flex:none;color:var(--dsw-alias-label-caption)}",
			".dsh-concise-trigger[data-on=\"true\"]{color:var(--dsw-alias-label-primary);border-color:rgba(217,119,87,.72)}",
			".dsh-concise-trigger[data-on=\"true\"] .dsh-concise-dot{background:rgba(217,119,87,.9);border-color:rgba(217,119,87,.9);box-shadow:0 0 6px rgba(217,119,87,.55)}",
			".dsh-concise-trigger[data-on=\"true\"] .dsh-concise-state{color:rgb(193,95,60)}"
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
		async function fetchState() {
			try {
				const response = await fetch(STATE_URL, { cache: "no-store" });
				if (!response.ok) return null;
				return (await response.json()).enabled === true;
			} catch {
				return null;
			}
		}
		const ConciseButton = ({ t }) => {
			const [enabled, setEnabled] = react.default.useState(null);
			const [busy, setBusy] = react.default.useState(false);
			react.default.useEffect(() => {
				let disposed = false;
				fetchState().then((value) => {
					if (!disposed && value !== null) setEnabled(value);
				});
				const refetch = () => {
					fetchState().then((value) => {
						if (value !== null) setEnabled(value);
					});
				};
				const onChange = (event) => {
					const detail = event.detail;
					if (detail && typeof detail.enabled === "boolean") setEnabled(detail.enabled);
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
			}, []);
			const toggle = async () => {
				if (busy) return;
				setBusy(true);
				try {
					const response = await fetch(TOGGLE_URL, { method: "POST" });
					if (response.ok) {
						const next = (await response.json()).enabled === true;
						setEnabled(next);
						window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { enabled: next } }));
					}
				} catch (error) {
					console.warn("[dsh-concise] toggle failed:", error);
				} finally {
					setBusy(false);
				}
			};
			const on = enabled === true;
			const stateLabel = enabled === null ? t("unknown") : on ? t("on") : t("off");
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
			}, react.default.createElement("span", {
				className: "dsh-concise-dot",
				"aria-hidden": true
			}), react.default.createElement("span", { className: "dsh-concise-label" }, "Concise"), react.default.createElement("span", { className: "dsh-concise-state" }, stateLabel)));
		};
		/**
		* right 槽条目：自身仅渲染一个不可见的锚根（display:contents），
		* 真正的按钮 portal 到模型 seat 紧右侧；模型 seat 缺失时退化为原位渲染。
		*/
		const ConciseSeat = ({ t }) => {
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
					if (anchor.parentElement !== found.row || anchor.previousElementSibling !== found.seat) found.seat.after(anchor);
					if (!portalRoot) {
						portalRoot = (0, react_dom_client.createRoot)(anchor);
						portalRoot.render(react.default.createElement(ConciseButton, { t }));
					}
					if (observedRow !== found.row) {
						observer.disconnect();
						observer.observe(found.row, { childList: true });
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
			}, [t]);
			if (fallback) return react.default.createElement(ConciseButton, { t });
			return react.default.createElement("div", {
				ref: rootRef,
				style: { display: "contents" },
				"data-dsh-concise-seat": ""
			});
		};
		/**
		* Client plugin body：注册字典、样式与 right 槽条目（按钮随后 portal 到模型按钮右侧）。
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
				try {
					return ctx.slots.inject("conversation.input.right", function* () {
						yield ctx.slots.register({
							name: "conversation.input.right",
							id: "dsh-concise-toggle",
							order: 50,
							locale: NS
						}, () => react.default.createElement(ConciseSeat, { t }));
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