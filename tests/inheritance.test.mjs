import test from 'node:test'
import assert from 'node:assert/strict'
import { parsePlantUml, toPlantUml } from '../src/uml/adapters/plantuml.ts'
import { parseMermaid, toMermaid } from '../src/uml/adapters/mermaid.ts'

test('inheritance and realization round-trip between PlantUML and Mermaid', () => {
  const input = '@startuml\nclass Person\nclass Student\ninterface Printable\nPerson <|-- Student\nPrintable <|.. Student\n@enduml'
  const diagram = parsePlantUml(input)
  assert.deepEqual(diagram.relations.map(r => [r.source, r.target, r.type]), [
    ['Student', 'Person', 'ClassInheritance'], ['Student', 'Printable', 'ClassRealization'],
  ])
  assert.deepEqual(parsePlantUml(toPlantUml(diagram)), diagram)
  assert.deepEqual(parseMermaid(toMermaid(diagram)), diagram)
  const reverse = parseMermaid('classDiagram\nclass Person\nclass Student\nclass Printable {\n<<interface>>\n}\nPerson <|-- Student\nPrintable <|.. Student')
  assert.deepEqual(reverse, diagram)
})
