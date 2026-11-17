import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAttributeRow, parseMethodRow, formatAttributeRow, formatMethodRow, newAttributeRow, newMethodRow, newParameterRow } from '../src/uml/member-editor.ts'

test('structured attributes and methods preserve untouched source', () => {
  const attribute = parseAttributeRow('-  name : String')
  assert.equal(attribute.editable, true)
  assert.equal(attribute.visibility, '-')
  assert.equal(attribute.name, 'name')
  assert.equal(formatAttributeRow(attribute), '-  name : String')
  const method = parseMethodRow('+ study(id: String, count: Integer): Boolean')
  assert.equal(method.editable, true)
  assert.deepEqual(method.parameters.map(({ name, type }) => ({ name, type })), [{ name: 'id', type: 'String' }, { name: 'count', type: 'Integer' }])
  assert.equal(formatMethodRow(method), '+ study(id: String, count: Integer): Boolean')
})

test('adding structured members validates and formats declarations', () => {
  const a = newAttributeRow(); a.name = 'title'; a.type = 'String'
  assert.equal(formatAttributeRow(a), '- title: String')
  const method = newMethodRow(); method.name = 'find'; method.returnType = 'Boolean'
  const param = newParameterRow(); param.name = 'id'; param.type = 'String'; method.parameters.push(param)
  assert.equal(formatMethodRow(method), '+ find(id: String): Boolean')
  param.name = ''
  assert.throws(() => formatMethodRow(method), /参数名称/)
  a.type = 'List<String>'
  assert.throws(() => formatAttributeRow(a), /简单类型/)
})

test('unsupported member declarations stay untouched', () => {
  for (const [row, format] of [[parseAttributeRow('- items: List<String>'), formatAttributeRow], [parseMethodRow('+ run(String value): void'), formatMethodRow]]) {
    assert.equal(row.editable, false)
    assert.equal(format(row), row.original)
  }
})
