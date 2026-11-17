import { validateDiagram } from './uml/model.ts'
import type { ClassModel, Diagram } from './uml/model.ts'
export type { ClassModel, RelationModel, Diagram } from './uml/model.ts'

// Loss-checked interchange subset. Every source statement is consumed; unlike
// the permissive upstream parser, unsupported syntax cannot disappear silently.
const arrows: Record<string, [string, boolean]> = {
  '--': ['ClassBidirectional', false], '-->': ['ClassUnidirectional', false], '<--': ['ClassUnidirectional', true],
  '--|>': ['ClassInheritance', false], '<|--': ['ClassInheritance', true],
  '..>': ['ClassDependency', false], '<..': ['ClassDependency', true],
  '..|>': ['ClassRealization', false], '<|..': ['ClassRealization', true],
  '--o': ['ClassAggregation', false], 'o--': ['ClassAggregation', true],
  '--*': ['ClassComposition', false], '*--': ['ClassComposition', true],
}
const outputArrows: Record<string, string> = Object.fromEntries(Object.entries(arrows).filter(([, [, reverse]]) => !reverse).map(([arrow, [type]]) => [type, arrow]))
function fail(message: string): never { throw new Error(`${message} 原内容已保留，请修正后再切换。`) }
const validate = validateDiagram

// Break braces into statements while leaving quoted multiplicities untouched.
function statements(text: string): string[] {
  const result: string[] = []
  let current = '', quoted = false, comment = false
  for (const char of text) {
    if (char === '\n') { if (current.trim()) result.push(current.trim()); current = ''; comment = false; continue }
    if (comment || char === '\r') continue
    if (char === '"') quoted = !quoted
    if (char === "'" && !quoted) { comment = true; continue }
    if (!quoted && (char === '{' || char === '}')) {
      if (current.trim()) result.push(current.trim())
      result.push(char); current = ''
    } else current += char
  }
  if (quoted) fail('双引号没有配对。')
  if (current.trim()) result.push(current.trim())
  return result
}

export function parseSource(text: string): Diagram {
  const tokens = statements(text)
  if (tokens[0] !== '@startuml' || tokens[tokens.length - 1] !== '@enduml') fail('转换需要一个以 @startuml 开始、@enduml 结束的类图。')
  const diagram: Diagram = { classes: [], relations: [] }
  let body: ClassModel | null = null
  const lines = tokens.slice(1, -1)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (body) {
      if (line === '}') { body = null; continue }
      if (line === '{' || /^(class|interface|enum|abstract|@)\b/.test(line)) fail(`无法转换类中的内容：${line}`)
      if ((line.match(/\(/g)?.length ?? 0) !== (line.match(/\)/g)?.length ?? 0)) fail(`方法括号未配对：${line}`)
      ;(line.includes('(') ? body.methods : body.attributes).push(line)
      continue
    }
    const declaration = /^(?:(abstract)\s+)?(class|interface)\s+([A-Za-z_][A-Za-z0-9_]*)$/.exec(line)
    if (declaration) {
      if (declaration[1] && declaration[2] === 'interface') fail('暂不支持 abstract interface。')
      const c: ClassModel = { name: declaration[3], abstract: !!declaration[1], attributes: [], methods: [] }
      if (declaration[2] === 'interface') c.kind = 'interface'
      diagram.classes.push(c)
      if (lines[i + 1] === '{') { body = c; i++ }
      continue
    }
    const relation = /^([A-Za-z_][A-Za-z0-9_]*)\s*(?:"([^"\n]*)"\s*)?(<\|--|--\|>|<\|\.\.|\.\.\|>|<--|-->|<\.\.|\.\.>|o--|--o|\*--|--\*|--)\s*(?:"([^"\n]*)"\s*)?([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*(.*))?$/.exec(line)
    if (!relation) fail(`暂不支持这行语法：${line}。可转换普通类、接口、属性、方法及基础关系；暂不支持别名、枚举、包、注解或样式指令。`)
    const [, left, leftMultiplicity = '', arrow, rightMultiplicity = '', right, label = ''] = relation
    const [type, reverse] = arrows[arrow]
    diagram.relations.push({ source: reverse ? right : left, target: reverse ? left : right, type, label,
      sourceMultiplicity: reverse ? rightMultiplicity : leftMultiplicity, targetMultiplicity: reverse ? leftMultiplicity : rightMultiplicity })
  }
  if (body) fail(`类 ${body.name} 缺少右花括号。`)
  validate(diagram)
  return diagram
}

export function serializeSource(diagram: Diagram): string {
  validate(diagram)
  const classes = diagram.classes.map(c => {
    const header = `${c.abstract ? 'abstract ' : ''}${c.kind === 'interface' ? 'interface' : 'class'} ${c.name}`
    const members = [...c.attributes, ...c.methods]
    return members.length ? `${header} {\n${members.map(m => `  ${m}`).join('\n')}\n}` : header
  })
  const relations = diagram.relations.map(e => `${e.source}${e.sourceMultiplicity ? ` "${e.sourceMultiplicity}"` : ''} ${outputArrows[e.type]} ${e.targetMultiplicity ? `"${e.targetMultiplicity}" ` : ''}${e.target}${e.label ? ` : ${e.label}` : ''}`)
  return ['@startuml', ...classes, ...relations, '@enduml'].join('\n')
}
