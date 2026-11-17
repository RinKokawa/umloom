// Structured editing for the common member subset. Unrecognised declarations
// stay as raw, read-only rows so unrelated changes never discard their text.
export type Visibility = '' | '+' | '-' | '#' | '~'
export type ParameterRow = { id: string; name: string; type: string }
export type AttributeRow = { id: string; editable: boolean; original: string | null; modified: boolean; visibility: Visibility; name: string; type: string }
export type MethodRow = { id: string; editable: boolean; original: string | null; modified: boolean; visibility: Visibility; name: string; parameters: ParameterRow[]; returnType: string }

const identifier = '[A-Za-z_][A-Za-z0-9_]*'
const type = `${identifier}(?:\\[\\])?`
const identifierPattern = new RegExp(`^${identifier}$`)
const typePattern = new RegExp(`^${type}$`)
const attrPattern = new RegExp(`^([+\\-#~])?\\s*(${identifier})(?:\\s*:\\s*(${type}))?$`)
const methodPattern = new RegExp(`^([+\\-#~])?\\s*(${identifier})\\(([^()]*)\\)(?:\\s*:\\s*(${type}))?$`)
const parameterPattern = new RegExp(`^(${identifier})(?:\\s*:\\s*(${type}))?$`)
// IDs are only Vue keys, not security tokens; randomUUID can be unavailable on HTTP.
let nextId = 0
const id = () => globalThis.crypto?.randomUUID?.() ?? `member-${Date.now().toString(36)}-${(nextId++).toString(36)}-${Math.random().toString(36).slice(2)}`
const visibility = (value: string | undefined) => (value ?? '') as Visibility

export function parseAttributeRow(original: string): AttributeRow {
  const match = attrPattern.exec(original.trim())
  return { id: id(), editable: !!match, original, modified: false, visibility: visibility(match?.[1]), name: match?.[2] ?? '', type: match?.[3] ?? '' }
}
export function parseMethodRow(original: string): MethodRow {
  const match = methodPattern.exec(original.trim())
  const parts = match?.[3].trim() ? match[3].split(',').map(s => parameterPattern.exec(s.trim())) : []
  const editable = !!match && parts.every(Boolean)
  return { id: id(), editable, original, modified: false, visibility: visibility(match?.[1]), name: match?.[2] ?? '', parameters: editable ? parts.map(p => ({ id: id(), name: p![1], type: p![2] ?? '' })) : [], returnType: match?.[4] ?? '' }
}
export function newAttributeRow(): AttributeRow { return { id: id(), editable: true, original: null, modified: true, visibility: '-', name: '', type: '' } }
export function newMethodRow(): MethodRow { return { id: id(), editable: true, original: null, modified: true, visibility: '+', name: '', parameters: [], returnType: '' } }
export function newParameterRow(): ParameterRow { return { id: id(), name: '', type: '' } }

function checkName(value: string, label: string): string {
  const result = value.trim()
  if (!identifierPattern.test(result)) throw new Error(`${label}请输入英文标识符，例如 name。`)
  return result
}
function checkType(value: string, label: string): string {
  const result = value.trim()
  if (result && !typePattern.test(result)) throw new Error(`${label}仅支持简单类型，例如 String 或 String[]。`)
  return result
}
function prefix(value: Visibility): string {
  if (!['', '+', '-', '#', '~'].includes(value)) throw new Error('可见性无效。')
  return value ? `${value} ` : ''
}
export function formatAttributeRow(row: AttributeRow): string {
  if (!row.modified && row.original !== null) return row.original
  if (!row.editable) throw new Error('无法结构化编辑此属性，原文已保留。')
  const name = checkName(row.name, '属性名称')
  const type = checkType(row.type, '属性类型')
  return `${prefix(row.visibility)}${name}${type ? `: ${type}` : ''}`
}
export function formatMethodRow(row: MethodRow): string {
  if (!row.modified && row.original !== null) return row.original
  if (!row.editable) throw new Error('无法结构化编辑此方法，原文已保留。')
  const name = checkName(row.name, '方法名称')
  const result = checkType(row.returnType, '返回类型')
  const parameters = row.parameters.map(p => {
    const name = checkName(p.name, '参数名称')
    const type = checkType(p.type, '参数类型')
    return `${name}${type ? `: ${type}` : ''}`
  })
  return `${prefix(row.visibility)}${name}(${parameters.join(', ')})${result ? `: ${result}` : ''}`
}
