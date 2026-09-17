/**
 * dsh-concise digest 链接规范化（v0.8.2）——纯函数，供 client 渲染增强与单测共用。
 *
 * 背景：宿主前端对 blockquote 内容走「纯文本 + 自定义 linkify」路径，其 URL 字符类
 * 包含 * 与 pct 编码段，会把紧贴 URL 的 markdown 粗体标记与中文句读一并吞进链接
 * （实测 href 形态：https://…/xxx**%E3%80%82），产出坏链接；标准 markdown 链接
 * [label](url) 不经该路径、不受影响。此函数在 digest 卡内做确定性兜底修复。
 */

/** href 尾部需要剥离的垃圾段：markdown 星号（字面与 pct 编码）+ 常用中文句读（字面与 pct 编码）。 */
const TRAILING_HREF_JUNK =
  /(?:\*|%2A|。|，|、|：|；|？|！|（|）|%E3%80%82|%E3%80%81|%EF%BC%8C|%EF%BC%9A|%EF%BC%9B|%EF%BC%9F|%EF%BC%81|%EF%BC%88|%EF%BC%89)+$/i

/** 链接显示文字尾部需要剥离的垃圾段（字面形式）。 */
const TRAILING_TEXT_JUNK = /(?:\*|。|，|、|：|；|？|！|（|）)+$/

/**
 * 修复 digest 卡内被宿主 linkify 污染的 href：循环剥离尾部的
 * markdown 星号与中文句读（字面/pct 编码），直到稳定。
 * 空结果与无 scheme 的结果一律回退原值（fail-safe，不制造新坏链）。
 */
export function normalizeDigestHref(href: string): string {
  if (!href) return href
  let out = href
  while (TRAILING_HREF_JUNK.test(out)) out = out.replace(TRAILING_HREF_JUNK, '')
  if (out.length === 0 || !/^[a-z][a-z0-9+.-]*:/i.test(out)) return href
  return out
}

/**
 * 修复 digest 卡内链接显示文字：剥离尾部的 markdown 星号与中文句读（字面），
 * 链接词与数字间的星号不受影响（只处理尾部）。
 */
export function normalizeDigestText(text: string): string {
  if (!text) return text
  let out = text
  while (TRAILING_TEXT_JUNK.test(out)) out = out.replace(TRAILING_TEXT_JUNK, '')
  return out
}
