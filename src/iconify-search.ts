import type { IconChoice } from './icon-library'

export const TABLER_LICENSE = `MIT License

Copyright (c) 2020-2026 Paweł Kuna

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`
export type SafeSvgNode = { tag: string; attrs: Record<string, string>; children: SafeSvgNode[] }
const tags = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'g'])
const numeric = new Set(['x', 'y', 'x1', 'x2', 'y1', 'y2', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'stroke-width', 'opacity', 'fill-opacity', 'stroke-opacity'])
const numberPattern = /^-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i
const idPattern = /^[a-z0-9][a-z0-9-]{0,79}$/

/** Parse a bounded SVG fragment into a strict element/attribute tree. Never use v-html. */
export function safeSvg(body: string): SafeSvgNode[] {
  if (typeof body !== 'string' || body.length > 16_384 || /<!|<\?/.test(body)) throw new Error('不支持此 SVG 内容')
  const document = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`, 'image/svg+xml')
  if (document.querySelector('parsererror')) throw new Error('SVG 格式无效')
  let count = 0
  const parse = (element: Element, depth: number): SafeSvgNode => {
    if (++count > 128 || depth > 8 || element.namespaceURI !== 'http://www.w3.org/2000/svg' || !tags.has(element.localName)) throw new Error('SVG 包含不支持的元素')
    const attrs: Record<string, string> = Object.create(null)
    for (const attr of [...element.attributes]) {
      const key = attr.name, value = attr.value.trim()
      if (attr.namespaceURI || value.length > 8192) throw new Error('SVG 包含不支持的属性')
      let valid = false
      if (numeric.has(key)) valid = numberPattern.test(value) && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= 100000
      else if (key === 'd') valid = !!value && /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]+$/.test(value)
      else if (key === 'points' || key === 'stroke-dasharray') valid = !!value && /^[0-9eE.,+\-\s]+$/.test(value)
      else if (key === 'fill' || key === 'stroke') valid = value === 'none' || value === 'currentColor'
      else if (key === 'stroke-linecap') valid = ['round', 'square', 'butt'].includes(value)
      else if (key === 'stroke-linejoin') valid = ['round', 'bevel', 'miter'].includes(value)
      else if (key === 'fill-rule' || key === 'clip-rule') valid = ['nonzero', 'evenodd'].includes(value)
      else if (key === 'transform') valid = /^(?:\s*(?:matrix|translate|scale|rotate|skewX|skewY)\s*\([0-9eE+.,\s-]+\)\s*)+$/.test(value)
      if (!valid) throw new Error('SVG 包含不支持的属性')
      attrs[key] = value
    }
    for (const child of [...element.childNodes]) if (child.nodeType !== Node.ELEMENT_NODE && (child.nodeType !== Node.TEXT_NODE || child.textContent?.trim())) throw new Error('SVG 包含不支持的内容')
    return { tag: element.localName, attrs, children: [...element.children].map(child => parse(child, depth + 1)) }
  }
  const root = document.documentElement
  for (const child of [...root.childNodes]) if (child.nodeType !== Node.ELEMENT_NODE && (child.nodeType !== Node.TEXT_NODE || child.textContent?.trim())) throw new Error('SVG 包含不支持的内容')
  const nodes = [...root.children].map(child => parse(child, 0))
  if (!nodes.length) throw new Error('SVG 为空')
  return nodes
}

const maxResponse = 200_000
async function boundedJson(response: Response): Promise<any> {
  if (!response.ok) throw new Error(`图标服务返回 ${response.status}`)
  if (Number(response.headers.get('content-length') || 0) > maxResponse) throw new Error('图标服务响应过大')
  if (!response.body) throw new Error('图标服务没有返回内容')
  const reader = response.body.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxResponse) { await reader.cancel(); throw new Error('图标服务响应过大') }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(new TextDecoder().decode(bytes))
}
export type OnlineIcon = Extract<IconChoice, { kind: 'iconify' }>
export function validOnlineIcon(value: any): value is OnlineIcon {
  if (!value || value.kind !== 'iconify' || typeof value.id !== 'string' || !idPattern.test(value.id) || typeof value.body !== 'string' || !Number.isFinite(value.width) || !Number.isFinite(value.height) || value.width < 1 || value.height < 1 || value.width > 512 || value.height > 512) return false
  try { safeSvg(value.body); return true } catch { return false }
}
/** Opt-in only: exactly the submitted keyword goes to Iconify; only Tabler MIT icons are accepted. */
export async function searchIconify(query: string, signal?: AbortSignal): Promise<OnlineIcon[]> {
  const keyword = query.trim()
  if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]{0,63}$/.test(keyword)) throw new Error('请输入 1–64 个英文字母、数字、空格或连字符。')
  const params = new URLSearchParams({ query: keyword, prefix: 'tabler', limit: '12' })
  const search = await boundedJson(await fetch(`https://api.iconify.design/search?${params}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }))
  if (!Array.isArray(search.icons)) throw new Error('图标搜索结果格式无效')
  const names = [...new Set(search.icons.filter((id: unknown): id is string => typeof id === 'string' && id.startsWith('tabler:') && idPattern.test(id.slice(7))).map((id: string) => id.slice(7)))].slice(0, 12) as string[]
  if (!names.length) return []
  const icons = await boundedJson(await fetch(`https://api.iconify.design/tabler.json?${new URLSearchParams({ icons: names.join(',') })}`, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' }))
  if (icons.prefix !== 'tabler' || !icons.icons || typeof icons.icons !== 'object') throw new Error('图标数据格式无效')
  const result: OnlineIcon[] = []
  for (const id of names) {
    if (!Object.hasOwn(icons.icons, id)) continue
    const data = icons.icons[id]
    // Do not silently omit Iconify transforms or non-zero viewBox origins.
    if (data?.rotate || data?.hFlip || data?.vFlip || data?.left || data?.top || icons.left || icons.top) continue
    const icon = { kind: 'iconify' as const, id, body: data?.body, width: data?.width ?? icons.width, height: data?.height ?? icons.height }
    if (validOnlineIcon(icon)) result.push(icon)
  }
  return result
}
