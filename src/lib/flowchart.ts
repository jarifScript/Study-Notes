export type FlowchartShape = 'start' | 'process' | 'decision' | 'connector' | 'end'

export interface FlowchartNodeData {
  id: string
  label: string
  shape: FlowchartShape
  parentId: string | null
  branchLabel: string
}

export interface FlowchartData {
  nodes: FlowchartNodeData[]
}

interface PositionedNode {
  node: FlowchartNodeData
  x: number
  y: number
  width: number
  height: number
}

export const nodeShapes: FlowchartShape[] = ['start', 'process', 'decision', 'connector', 'end']
export const shapeLabels: Record<FlowchartShape, string> = {
  start: 'Start',
  process: 'Process',
  decision: 'Decision',
  connector: 'Connector',
  end: 'End',
}

export function createFlowchart(): FlowchartData {
  const startId = crypto.randomUUID()
  const processId = crypto.randomUUID()
  return {
    nodes: [
      { id: startId, label: 'Start', shape: 'start', parentId: null, branchLabel: '' },
      { id: processId, label: 'Process step', shape: 'process', parentId: startId, branchLabel: '' },
      { id: crypto.randomUUID(), label: 'End', shape: 'end', parentId: processId, branchLabel: '' },
    ],
  }
}

export function parseFlowchart(value: string | null): FlowchartData | null {
  if (!value) return null
  try {
    const parsed: unknown = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object' || !('nodes' in parsed) || !Array.isArray(parsed.nodes)) return null
    const nodes = parsed.nodes as unknown[]
    if (!nodes.length || nodes.length > 100) return null
    const validNodes = nodes.every((node): node is FlowchartNodeData =>
      !!node && typeof node === 'object' &&
      'id' in node && typeof node.id === 'string' &&
      'label' in node && typeof node.label === 'string' && node.label.length <= 200 &&
      'shape' in node && typeof node.shape === 'string' && nodeShapes.includes(node.shape as FlowchartShape) &&
      'parentId' in node && (node.parentId === null || typeof node.parentId === 'string') &&
      'branchLabel' in node && typeof node.branchLabel === 'string' && node.branchLabel.length <= 100)
    if (!validNodes || new Set(nodes.map((node) => node.id)).size !== nodes.length) return null
    const ids = new Set(nodes.map((node) => node.id))
    if (nodes.some((node) => node.parentId !== null && !ids.has(node.parentId))) return null
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const byId = new Map(nodes.map((node) => [node.id, node]))
    function visit(id: string): boolean {
      if (visiting.has(id)) return false
      if (visited.has(id)) return true
      visiting.add(id)
      const parentId = byId.get(id)?.parentId
      if (parentId && !visit(parentId)) return false
      visiting.delete(id)
      visited.add(id)
      return true
    }
    if (nodes.some((node) => !visit(node.id))) return null
    return { nodes }
  } catch {
    return null
  }
}

function dimensions(shape: FlowchartShape) {
  if (shape === 'decision') return { width: 178, height: 96 }
  if (shape === 'connector') return { width: 74, height: 74 }
  if (shape === 'start' || shape === 'end') return { width: 170, height: 58 }
  return { width: 190, height: 68 }
}

export function wrapLabel(label: string, maxLength: number): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of label.trim().split(/\s+/)) {
    if (line && `${line} ${word}`.length > maxLength) {
      lines.push(line)
      line = word
    } else {
      line = line ? `${line} ${word}` : word
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : ['']
}

export function layoutFlowchart(chart: FlowchartData): { nodes: PositionedNode[]; width: number; height: number } {
  const children = new Map<string | null, FlowchartNodeData[]>()
  for (const node of chart.nodes) {
    children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  }
  const subtreeSize = new Map<string, number>()
  function measure(node: FlowchartNodeData): number {
    const descendants = children.get(node.id) ?? []
    const size = Math.max(1, descendants.reduce((total, child) => total + measure(child), 0))
    subtreeSize.set(node.id, size)
    return size
  }
  const roots = children.get(null) ?? chart.nodes
  const totalLeaves = roots.reduce((total, root) => total + measure(root), 0)
  const nodeHeights = new Map(chart.nodes.map((node) => {
    const { width, height } = dimensions(node.shape)
    const lineCount = wrapLabel(node.label, Math.floor(width / 8)).length
    return [node.id, height + Math.max(0, lineCount - 2) * 16]
  }))
  const positions: PositionedNode[] = []
  function place(node: FlowchartNodeData, left: number, centerY: number) {
    const size = subtreeSize.get(node.id) ?? 1
    const { width } = dimensions(node.shape)
    const height = nodeHeights.get(node.id) ?? dimensions(node.shape).height
    positions.push({
      node,
      x: 35 + (left + size / 2) * 220,
      y: centerY,
      width,
      height,
    })
    let childLeft = left
    for (const child of children.get(node.id) ?? []) {
      const childHeight = nodeHeights.get(child.id) ?? dimensions(child.shape).height
      place(child, childLeft, centerY + height / 2 + 80 + childHeight / 2)
      childLeft += subtreeSize.get(child.id) ?? 1
    }
  }
  let left = 0
  for (const root of roots) {
    const rootHeight = nodeHeights.get(root.id) ?? dimensions(root.shape).height
    place(root, left, 23 + rootHeight / 2)
    left += subtreeSize.get(root.id) ?? 1
  }
  const width = Math.max(620, 70 + totalLeaves * 220)
  const height = Math.max(170, ...positions.map(({ y, height: nodeHeight }) => y + nodeHeight + 50))
  return { nodes: positions, width, height }
}

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] ?? character)
}

export function flowchartImageSource(chart: FlowchartData): string {
  const layout = layoutFlowchart(chart)
  const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]))
  const edges = layout.nodes.flatMap(({ node, x: childX, y: childY, height: childHeight }) => {
    if (!node.parentId) return []
    const parent = positioned.get(node.parentId)
    if (!parent) return []
    const startY = parent.y + parent.height / 2
    const endY = childY - childHeight / 2
    const middleY = (startY + endY) / 2
    const label = node.branchLabel
      ? `<text x="${(parent.x + childX) / 2}" y="${middleY - 5}" text-anchor="middle" font-size="12" fill="#45465a" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(node.branchLabel)}</text>`
      : ''
    return [`<g><path d="M ${parent.x} ${startY} V ${middleY} H ${childX} V ${endY}" fill="none" stroke="#77798b" stroke-width="2.5" marker-end="url(#flowchart-arrow)"/>${label}</g>`]
  })
  const nodes = layout.nodes.map(({ node, x, y, width, height }) => {
    const x0 = x - width / 2
    const y0 = y - height / 2
    const lines = wrapLabel(node.label, Math.floor(width / 8))
    const shape = node.shape === 'decision'
      ? `<polygon points="${x},${y0} ${x0 + width},${y} ${x},${y0 + height} ${x0},${y}" fill="#fff" stroke="#55566a" stroke-width="1.5"/>`
      : node.shape === 'connector'
        ? `<circle cx="${x}" cy="${y}" r="${width / 2}" fill="#fff" stroke="#55566a" stroke-width="1.5"/>`
        : `<rect x="${x0}" y="${y0}" width="${width}" height="${height}" rx="${node.shape === 'start' || node.shape === 'end' ? height / 2 : 3}" fill="#fff" stroke="#55566a" stroke-width="1.5"/>`
    const label = lines.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? -(lines.length - 1) * 8 : 16}">${escapeXml(line)}</tspan>`).join('')
    return `<g>${shape}<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Arial,sans-serif" font-size="14" fill="#45465a">${label}</text></g>`
  })
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><defs><marker id="flowchart-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#77798b"/></marker></defs>${edges.join('')}${nodes.join('')}</svg>`
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}
