import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlantUml, toPlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'

test('interface nodes and methods round-trip through PlantUML and Mermaid', () => {
  const model = parsePlantUml('@startuml\ninterface Payable {\n+ pay(amount: Money): Boolean\n}\nclass Order\n@enduml')
  assert.equal(model.classes[0].kind, 'interface')
  assert.equal(model.classes[1].kind, undefined)
  assert.deepEqual(parsePlantUml(toPlantUml(model)), model)
  assert.match(toMermaid(model), /<<interface>>/)
  assert.deepEqual(parseMermaid(toMermaid(model)), model)
})

test('Mermaid standalone annotation is supported and unknown stereotypes fail safely', () => {
  const model = parseMermaid('classDiagram\nclass Payable\n<<interface>> Payable')
  assert.equal(model.classes[0].kind, 'interface')
  assert.match(toPlantUml(model), /interface Payable/)
  assert.throws(() => parseMermaid('classDiagram\nclass Payable {\n<<service>>\n}'))
  assert.throws(() => parseMermaid('classDiagram\nclass Payable {\n<<interface>>\n<<interface>>\n}'))
})
