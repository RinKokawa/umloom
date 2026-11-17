import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlantUml, toPlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'
import { assertOjDiagram } from '../src/uml/model.ts'

const input = '@startuml\nclass Classroom\nclass Student {\n- name: String\n+ study(): void\n}\nClassroom "1" -- "0..*" Student\n@enduml'
test('PlantUML and Mermaid round-trip the class diagram subset', () => {
  const diagram = parsePlantUml(input)
  assert.deepEqual(parsePlantUml(toPlantUml(diagram)), diagram)
  assert.deepEqual(parseMermaid(toMermaid(diagram)), diagram)
})
test('unsupported or incomplete input is rejected', () => {
  assert.throws(() => parsePlantUml('@startuml\nclass Student {\n@enduml'))
  assert.throws(() => parseMermaid('classDiagram\nclass A\nA <|-- B'))
  assert.throws(() => assertOjDiagram({classes: [{name: '', abstract:false, attributes:[], methods:[]}], relations:[]}))
})
