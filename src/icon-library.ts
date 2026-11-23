import { BookOpen, Box, Boxes, Building2, CircleUserRound, Clapperboard, FileText, Film, GraduationCap, Hospital, LibraryBig, Plane, PlaneLanding, PlaneTakeoff, Stethoscope, Ticket, UserRound, Users, Wallet, Warehouse } from '@lucide/vue'
import type { Component } from 'vue'

export type LocalIcon = { id: string; label: string; component: Component }
export type DrawnIcon = { id: string; label: string; body: string; width: number; height: number }
export type IconChoice =
  | { kind: 'lucide'; id: string }
  | { kind: 'umloom'; id: string }
  | { kind: 'iconify'; id: string; body: string; width: number; height: number }
  | { kind: 'none' }

// Lucide icons are ISC licensed. Explicit imports keep the bundle tree-shakable.
export const lucideIcons: LocalIcon[] = [
  { id: 'box', label: '通用类', component: Box },
  { id: 'user-round', label: '人物', component: UserRound },
  { id: 'users', label: '多人', component: Users },
  { id: 'circle-user-round', label: '用户', component: CircleUserRound },
  { id: 'graduation-cap', label: '教育', component: GraduationCap },
  { id: 'building-2', label: '建筑', component: Building2 },
  { id: 'book-open', label: '书籍', component: BookOpen },
  { id: 'library-big', label: '图书馆', component: LibraryBig },
  { id: 'plane', label: '飞机', component: Plane },
  { id: 'plane-takeoff', label: '出发', component: PlaneTakeoff },
  { id: 'plane-landing', label: '到达', component: PlaneLanding },
  { id: 'hospital', label: '医院', component: Hospital },
  { id: 'stethoscope', label: '医疗', component: Stethoscope },
  { id: 'film', label: '影片', component: Film },
  { id: 'clapperboard', label: '电影', component: Clapperboard },
  { id: 'wallet', label: '钱包', component: Wallet },
  { id: 'file-text', label: '文档', component: FileText },
  { id: 'ticket', label: '票券', component: Ticket },
  { id: 'warehouse', label: '仓库', component: Warehouse },
  { id: 'boxes', label: '集合', component: Boxes },
]
// Original UMLoom drawings, distributed under the repository MIT license.
export const umloomIcons: DrawnIcon[] = [
  { id: 'aircraft-model', label: '飞机型号', width: 24, height: 24, body: '<path d="M2 12h6l4-8h3l-2 8h5l2-2h2l-1 3 1 3h-2l-2-2h-5l2 6h-3l-4-6H2z"/>' },
  { id: 'surgery-room', label: '手术室', width: 24, height: 24, body: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M12 7v7M8.5 10.5h7M7 18h10"/>' },
]
const lucideAliases: Record<string, string> = {
  person: 'user-round', user: 'circle-user-round', subscriber: 'circle-user-round', customer: 'circle-user-round',
  student: 'graduation-cap', professor: 'graduation-cap', teacher: 'graduation-cap', employee: 'user-round', worker: 'user-round',
  doctor: 'stethoscope', nurse: 'stethoscope', pilot: 'user-round', captain: 'user-round', copilot: 'user-round', navigator: 'user-round',
  department: 'building-2', office: 'building-2', classroom: 'building-2', airline: 'building-2', airport: 'building-2',
  hospital: 'hospital', library: 'library-big', book: 'book-open', author: 'user-round', editor: 'user-round',
  manuscript: 'file-text', publication: 'file-text', loan: 'file-text', order: 'file-text', stockorder: 'file-text',
  flight: 'plane', aircraft: 'plane', departure: 'plane-takeoff', arrival: 'plane-landing',
  movie: 'film', film: 'film', catalogue: 'clapperboard', catalog: 'clapperboard',
  card: 'wallet', account: 'wallet', savingsaccount: 'wallet', investmentaccount: 'wallet',
  stock: 'boxes', restockorder: 'warehouse', rental: 'ticket',
}
const umloomAliases: Record<string, string> = { aircrafttype: 'aircraft-model', surgeryroom: 'surgery-room' }
const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
export function autoIcon(className: string): IconChoice | null {
  const key = normalize(className)
  if (Object.hasOwn(lucideAliases, key)) return { kind: 'lucide', id: lucideAliases[key] }
  if (Object.hasOwn(umloomAliases, key)) return { kind: 'umloom', id: umloomAliases[key] }
  return null
}
export function localIcon(choice: IconChoice | null) {
  if (choice?.kind === 'lucide') return lucideIcons.find(icon => icon.id === choice.id) ?? null
  if (choice?.kind === 'umloom') return umloomIcons.find(icon => icon.id === choice.id) ?? null
  return null
}
