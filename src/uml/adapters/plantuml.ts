import { parseSource, serializeSource } from '../../conversion.ts'
import { assertOjDiagram } from '../model.ts'
import type { Diagram } from '../model.ts'

export function parsePlantUml(text: string): Diagram {
  const diagram = parseSource(text)
  assertOjDiagram(diagram)
  return diagram
}
export function toPlantUml(diagram: Diagram): string {
  assertOjDiagram(diagram)
  return serializeSource(diagram)
}
