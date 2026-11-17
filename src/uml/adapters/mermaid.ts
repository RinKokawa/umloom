import { assertOjDiagram } from '../model.ts'
import type { ClassModel, Diagram } from '../model.ts'

function fail(message: string): never { throw new Error(`${message} 原内容已保留。`) }
const name = '[A-Za-z_][A-Za-z0-9_]*'
const typeName = '[A-Za-z_][A-Za-z0-9_]*(?:\\[\\])?'
const identifier = new RegExp(`^${name}$`)

/** Convert the supported Mermaid spelling into the shared PlantUML-style member. */
function readMember(input: string): { value: string; method: boolean } {
  const text = input.trim()
  if (!text || /[{}";'$*]/.test(text) || text.startsWith('<<')) fail(`暂不支持 Mermaid 成员：${text}`)
  const visibility = /^[+#~-]/.test(text) ? text[0] : ''
  const body = text.slice(visibility.length).trim()
  const prefix = visibility ? `${visibility} ` : ''
  if (body.includes('(') || body.includes(')')) {
    const method = new RegExp(`^(${name})\\(([^()]*)\\)(?:\\s*:\\s*(${typeName})|\\s+(${typeName}))?$`).exec(body)
    if (!method) fail(`暂不支持 Mermaid 方法：${text}`)
    const result = method[3] ?? method[4]
    return { value: `${prefix}${method[1]}(${method[2]})${result ? `: ${result}` : ''}`, method: true }
  }
  const typed = new RegExp(`^(${typeName})\\s+(${name})$`).exec(body)
  const colon = new RegExp(`^(${name})(?:\\s*:\\s*(${typeName}))?$`).exec(body)
  if (typed) return { value: `${prefix}${typed[2]}: ${typed[1]}`, method: false }
  if (colon) return { value: `${prefix}${colon[1]}${colon[2] ? `: ${colon[2]}` : ''}`, method: false }
  fail(`暂不支持 Mermaid 属性：${text}`)
}
function writeMember(input: string, method: boolean): string {
  const text = input.trim()
  const visibility = /^[+#~-]/.test(text) ? text[0] : ''
  const body = text.slice(visibility.length).trim()
  const prefix = visibility
  if (method) {
    const match = new RegExp(`^(${name}\\([^()]*\\))(?:\\s*:\\s*(${typeName}))?$`).exec(body)
    if (!match) fail(`暂不能将方法转为 Mermaid：${input}`)
    return `${prefix}${match[1]}${match[2] ? ` ${match[2]}` : ''}`
  }
  const match = new RegExp(`^(${name})(?:\\s*:\\s*(${typeName}))?$`).exec(body)
  if (!match) fail(`暂不能将属性转为 Mermaid：${input}`)
  return `${prefix}${match[2] ? `${match[2]} ` : ''}${match[1]}`
}

export function parseMermaid(text: string): Diagram {
  const lines = text.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('%%'))
  if (lines.shift() !== 'classDiagram') fail('Mermaid 类图必须以 classDiagram 开始。')
  const diagram: Diagram = { classes: [], relations: [] }
  const classes = new Map<string, ClassModel>()
  let current: ClassModel | null = null
  const getClass = (className: string) => {
    let result = classes.get(className)
    if (!result) {
      result = { name: className, abstract: false, attributes: [], methods: [] }
      classes.set(className, result)
      diagram.classes.push(result)
    }
    return result
  }
  const addMember = (c: ClassModel, value: string) => {
    const member = readMember(value)
    ;(member.method ? c.methods : c.attributes).push(member.value)
  }
  for (const line of lines) {
    if (current) {
      if (line === '}') { current = null; continue }
      if (/^<<interface>>$/i.test(line)) {
        if (current.kind === 'interface') fail(`接口 ${current.name} 的标记重复。`)
        current.kind = 'interface'; continue
      }
      addMember(current, line)
      continue
    }
    const annotation = new RegExp(`^<<interface>>\\s+(${name})$`, 'i').exec(line)
    if (annotation) {
      const c = getClass(annotation[1])
      if (c.kind === 'interface') fail(`接口 ${c.name} 的标记重复。`)
      c.kind = 'interface'; continue
    }
    const declaration = new RegExp(`^class\\s+(${name})\\s*(\\{)?$`).exec(line)
    if (declaration) {
      const c = getClass(declaration[1])
      if (declaration[2]) current = c
      continue
    }
    const member = new RegExp(`^(${name})\\s*:\\s*(.+)$`).exec(line)
    if (member) { addMember(getClass(member[1]), member[2]); continue }
    const relation = new RegExp(`^(${name})\\s*(?:"([^"\\n]*)"\\s*)?(<--|-->|--)\\s*(?:"([^"\\n]*)"\\s*)?(${name})(?:\\s*:\\s*(.*))?$`).exec(line)
    if (relation) {
      const [, left, leftMultiplicity = '', arrow, rightMultiplicity = '', right, label = ''] = relation
      getClass(left); getClass(right)
      const reverse = arrow === '<--'
      diagram.relations.push({ source: reverse ? right : left, target: reverse ? left : right,
        type: arrow === '--' ? 'ClassBidirectional' : 'ClassUnidirectional', label,
        sourceMultiplicity: reverse ? rightMultiplicity : leftMultiplicity,
        targetMultiplicity: reverse ? leftMultiplicity : rightMultiplicity })
      continue
    }
    fail(`暂不支持 Mermaid 语句：${line}`)
  }
  if (current) fail(`类 ${current.name} 缺少右花括号。`)
  assertOjDiagram(diagram)
  return diagram
}

export function toMermaid(diagram: Diagram): string {
  assertOjDiagram(diagram)
  const classes = diagram.classes.map(c => {
    if (!identifier.test(c.name)) fail(`暂不支持 Mermaid 类名：${c.name}`)
    const members = [...(c.kind === 'interface' ? ['<<interface>>'] : []), ...c.attributes.map(m => writeMember(m, false)), ...c.methods.map(m => writeMember(m, true))]
    return members.length ? `class ${c.name} {\n${members.map(m => `  ${m}`).join('\n')}\n}` : `class ${c.name}`
  })
  const relations = diagram.relations.map(e => `${e.source}${e.sourceMultiplicity ? ` "${e.sourceMultiplicity}"` : ''} ${e.type === 'ClassBidirectional' ? '--' : '-->'} ${e.targetMultiplicity ? `"${e.targetMultiplicity}" ` : ''}${e.target}${e.label ? ` : ${e.label}` : ''}`)
  return ['classDiagram', ...classes, ...relations].join('\n')
}
