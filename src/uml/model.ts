// Shared semantic model; layout, formatting and raw drafts stay outside the IR.
// Omitted kind means a regular class, preserving existing saved diagrams.
export type ClassModel = { name: string; abstract: boolean; attributes: string[]; methods: string[]; kind?: 'interface' }
export type RelationModel = {
  source: string; target: string; type: string; label: string
  sourceMultiplicity: string; targetMultiplicity: string
}
export type Diagram = { classes: ClassModel[]; relations: RelationModel[] }

/** Validate the semantic model without depending on an editor or language. */
export function validateDiagram(diagram: Diagram): void {
  const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/
  const names = new Set<string>()
  for (const c of diagram.classes) {
    if (c.kind !== undefined && c.kind !== 'interface') throw new Error(`暂不支持元素类型“${c.kind}”。原内容已保留。`)
    if (!identifier.test(c.name)) throw new Error(`暂不能转换类名“${c.name}”：请使用英文标识符。原内容已保留。`)
    if (names.has(c.name.toLowerCase())) throw new Error(`类名 ${c.name} 重复，无法确定关系端点。原内容已保留。`)
    names.add(c.name.toLowerCase())
    if (c.attributes.some(m => /[()]/.test(m)) || c.methods.some(m => !m.includes('(') || !m.includes(')'))) throw new Error(`类 ${c.name} 的属性或方法格式有误。原内容已保留。`)
    for (const member of [...c.attributes, ...c.methods]) {
      if (!member.trim() || /[{}\r\n"';]/.test(member) || member.trim().startsWith('@')) throw new Error(`暂不能转换成员“${member}”。原内容已保留。`)
    }
  }
  const exactNames = new Set(diagram.classes.map(c => c.name))
  const types = new Set(['ClassBidirectional', 'ClassUnidirectional', 'ClassInheritance', 'ClassDependency', 'ClassRealization', 'ClassAggregation', 'ClassComposition'])
  for (const e of diagram.relations) {
    if (!exactNames.has(e.source) || !exactNames.has(e.target)) throw new Error(`关系 ${e.source} → ${e.target} 的端点未声明为类。原内容已保留。`)
    if (!types.has(e.type)) throw new Error(`暂不支持关系类型 ${e.type}。原内容已保留。`)
    if (/["\r\n]/.test(e.sourceMultiplicity + e.targetMultiplicity) || /[\r\n'{}]/.test(e.label)) throw new Error('多重性或关系名称包含暂不支持的字符。原内容已保留。')
  }
}

/** The first OJ interchange subset. Reject, never silently discard, extras. */
export function assertOjDiagram(diagram: Diagram): void {
  validateDiagram(diagram)
  for (const c of diagram.classes) {
    if (c.abstract) throw new Error(`暂不支持转换抽象类 ${c.name}，原内容已保留。`)
  }
  for (const relation of diagram.relations) {
    if (!['ClassBidirectional', 'ClassUnidirectional'].includes(relation.type)) {
      throw new Error(`暂不支持转换关系类型 ${relation.type}，原内容已保留。`)
    }
  }
}

/** Semantic comparison excludes editor-specific layout and source formatting. */
export function diagramKey(diagram: Diagram): string {
  assertOjDiagram(diagram)
  return JSON.stringify(diagram)
}
