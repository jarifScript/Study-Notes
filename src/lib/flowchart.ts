export type FlowchartShape = 'start' | 'process' | 'decision' | 'connector' | 'end'
export type FlowchartDirection = 'up' | 'down' | 'left' | 'right'

export interface FlowchartNodeData {
  id: string
  label: string
  shape: FlowchartShape
  parentId: string | null
  branchLabel: string
  direction: FlowchartDirection
  position?: { x: number; y: number }
}

export interface FlowchartData {
  nodes: FlowchartNodeData[]
  connections: FlowchartConnectionData[]
}

export interface FlowchartConnectionData {
  id: string
  fromId: string
  toId: string
  branchLabel: string
  direction: FlowchartDirection
}

interface PositionedNode {
  node: FlowchartNodeData
  x: number
  y: number
  width: number
  height: number
}

export const nodeShapes: FlowchartShape[] = ['start', 'process', 'decision', 'connector', 'end']
export const flowchartDirections: FlowchartDirection[] = ['down', 'up', 'left', 'right']
export const directionLabels: Record<FlowchartDirection, string> = {
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
}
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
    connections: [],
    nodes: [
      { id: startId, label: 'Start', shape: 'start', parentId: null, branchLabel: '', direction: 'down' },
      { id: processId, label: 'Process step', shape: 'process', parentId: startId, branchLabel: '', direction: 'down' },
      { id: crypto.randomUUID(), label: 'End', shape: 'end', parentId: processId, branchLabel: '', direction: 'down' },
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
    const validNodes = nodes.every((value) => {
      if (!value || typeof value !== 'object') return false
      const node = value as Record<string, unknown>
      return typeof node.id === 'string' &&
        typeof node.label === 'string' && node.label.length <= 200 &&
        typeof node.shape === 'string' && nodeShapes.includes(node.shape as FlowchartShape) &&
        (node.parentId === null || typeof node.parentId === 'string') &&
        typeof node.branchLabel === 'string' && node.branchLabel.length <= 100 &&
        (node.direction === undefined || (typeof node.direction === 'string' && flowchartDirections.includes(node.direction as FlowchartDirection))) &&
        (node.position === undefined || (
          !!node.position && typeof node.position === 'object' &&
          'x' in node.position && typeof node.position.x === 'number' && Number.isFinite(node.position.x) && Math.abs(node.position.x) <= 100000 &&
          'y' in node.position && typeof node.position.y === 'number' && Number.isFinite(node.position.y) && Math.abs(node.position.y) <= 100000
        ))
    })
    if (!validNodes) return null
    const validFlowchartNodes: FlowchartNodeData[] = nodes.map((value) => {
      const node = value as Record<string, unknown>
      return {
        id: node.id as string,
        label: node.label as string,
        shape: node.shape as FlowchartShape,
        parentId: node.parentId as string | null,
        branchLabel: node.branchLabel as string,
        direction: (node.direction ?? 'down') as FlowchartDirection,
        ...(node.position ? { position: node.position as { x: number; y: number } } : {}),
      }
    })
    if (new Set(validFlowchartNodes.map((node) => node.id)).size !== validFlowchartNodes.length) return null
    const ids = new Set(validFlowchartNodes.map((node) => node.id))
    if (validFlowchartNodes.some((node) => node.parentId !== null && !ids.has(node.parentId))) return null
    const rawConnections = 'connections' in parsed ? parsed.connections : []
    if (!Array.isArray(rawConnections) || rawConnections.length > 200) return null
    const validConnections = rawConnections.every((value) => {
      if (!value || typeof value !== 'object') return false
      const connection = value as Record<string, unknown>
      return typeof connection.id === 'string' &&
        typeof connection.fromId === 'string' && ids.has(connection.fromId) &&
        typeof connection.toId === 'string' && ids.has(connection.toId) &&
        connection.fromId !== connection.toId &&
        typeof connection.branchLabel === 'string' && connection.branchLabel.length <= 100 &&
        (connection.direction === undefined || (typeof connection.direction === 'string' && flowchartDirections.includes(connection.direction as FlowchartDirection)))
    })
    if (!validConnections) return null
    const validFlowchartConnections = rawConnections.map((value) => {
      const connection = value as FlowchartConnectionData
      return { ...connection, direction: connection.direction ?? 'up' }
    })
    if (new Set(validFlowchartConnections.map((connection) => connection.id)).size !== validFlowchartConnections.length) return null
    const visited = new Set<string>()
    const visiting = new Set<string>()
    const byId = new Map(validFlowchartNodes.map((node) => [node.id, node]))
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
    if (validFlowchartNodes.some((node) => !visit(node.id))) return null
    return { nodes: validFlowchartNodes, connections: validFlowchartConnections }
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

export function layoutFlowchart(chart: FlowchartData): { nodes: PositionedNode[]; width: number; height: number; originX: number; originY: number } {
  const nodeHeights = new Map(chart.nodes.map((node) => {
    const { width, height } = dimensions(node.shape)
    const lineCount = wrapLabel(node.label, Math.floor(width / 8)).length
    return [node.id, height + Math.max(0, lineCount - 2) * 16]
  }))
  const children = new Map<string | null, FlowchartNodeData[]>()
  for (const node of chart.nodes) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const gridPositions = new Map<string, { column: number; row: number }>()
  const occupied = new Set<string>()
  const roots = children.get(null) ?? []
  let nextRootColumn = 0

  function place(node: FlowchartNodeData, column: number, row: number) {
    gridPositions.set(node.id, { column, row })
    occupied.add(`${column},${row}`)
    for (const child of children.get(node.id) ?? []) {
      const direction = child.direction ?? 'down'
      const [columnStep, rowStep] = direction === 'left' ? [-1, 0]
        : direction === 'right' ? [1, 0]
          : direction === 'up' ? [0, -1] : [0, 1]
      const [offsetColumn, offsetRow] = columnStep === 0 ? [1, 0] : [0, 1]
      for (let offset = 0; ; offset++) {
        const signedOffset = offset === 0 ? 0 : Math.ceil(offset / 2) * (offset % 2 ? 1 : -1)
        const childColumn = column + columnStep + offsetColumn * signedOffset
        const childRow = row + rowStep + offsetRow * signedOffset
        if (occupied.has(`${childColumn},${childRow}`)) continue
        place(child, childColumn, childRow)
        break
      }
    }
  }

  for (const root of roots) {
    while (occupied.has(`${nextRootColumn},0`)) nextRootColumn++
    place(root, nextRootColumn, 0)
    nextRootColumn += 2
  }
  const columns = [...gridPositions.values()].map(({ column }) => column)
  const rows = [...gridPositions.values()].map(({ row }) => row)
  const minColumn = Math.min(0, ...columns)
  const minRow = Math.min(0, ...rows)
  const rawPositions = chart.nodes.map((node) => {
    const grid = gridPositions.get(node.id) ?? { column: 0, row: 0 }
    const { width } = dimensions(node.shape)
    const height = nodeHeights.get(node.id) ?? dimensions(node.shape).height
    return {
      node,
      x: node.position?.x ?? 120 + (grid.column - minColumn) * 260,
      y: node.position?.y ?? 70 + (grid.row - minRow) * 240,
      width,
      height,
    }
  })
  const originX = Math.max(0, 100 - Math.min(...rawPositions.map((item) => item.x - item.width / 2)))
  const originY = Math.max(0, 80 - Math.min(...rawPositions.map((item) => item.y - item.height / 2)))
  const positions = rawPositions.map((item) => ({ ...item, x: item.x + originX, y: item.y + originY }))
  const right = Math.max(...positions.map((item) => item.x + item.width / 2))
  const bottom = Math.max(...positions.map((item) => item.y + item.height / 2))
  const connectionMargin = 40 + chart.connections.length * 16
  return {
    nodes: positions,
    width: Math.max(620, right + 100 + connectionMargin),
    height: Math.max(170, bottom + 80 + connectionMargin),
    originX,
    originY,
  }
}

export function flowchartEdgePath(parent: PositionedNode, child: PositionedNode): { path: string; labelX: number; labelY: number } {
  const direction = child.node.direction ?? 'down'
  if (direction === 'left' || direction === 'right') {
    const startX = parent.x + (direction === 'right' ? parent.width : -parent.width) / 2
    const endX = child.x + (direction === 'right' ? -child.width : child.width) / 2
    const middleX = (startX + endX) / 2
    return {
      path: `M ${startX} ${parent.y} H ${middleX} V ${child.y} H ${endX}`,
      labelX: middleX,
      labelY: (parent.y + child.y) / 2 - 5,
    }
  }
  const startY = parent.y + (direction === 'down' ? parent.height : -parent.height) / 2
  const endY = child.y + (direction === 'down' ? -child.height : child.height) / 2
  const middleY = (startY + endY) / 2
  return {
    path: `M ${parent.x} ${startY} V ${middleY} H ${child.x} V ${endY}`,
    labelX: (parent.x + child.x) / 2,
    labelY: middleY - 5,
  }
}

function segmentIntersectsNode(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  node: PositionedNode,
): boolean {
  const left = node.x - node.width / 2
  const right = node.x + node.width / 2
  const top = node.y - node.height / 2
  const bottom = node.y + node.height / 2
  if (y1 === y2) return y1 > top && y1 < bottom && Math.max(Math.min(x1, x2), left) < Math.min(Math.max(x1, x2), right)
  if (x1 === x2) return x1 > left && x1 < right && Math.max(Math.min(y1, y2), top) < Math.min(Math.max(y1, y2), bottom)
  return false
}

export function flowchartConnectionPath(
  source: PositionedNode,
  target: PositionedNode,
  nodes: PositionedNode[],
  direction: FlowchartDirection,
): { path: string; labelX: number; labelY: number } {
  const vertical = direction === 'up' || direction === 'down'
  const forward = direction === 'down' || direction === 'right'
  const startX = source.x + (!vertical ? (forward ? source.width : -source.width) / 2 : 0)
  const startY = source.y + (vertical ? (forward ? source.height : -source.height) / 2 : 0)
  const endX = target.x + (!vertical ? (forward ? -target.width : target.width) / 2 : 0)
  const endY = target.y + (vertical ? (forward ? -target.height : target.height) / 2 : 0)
  const startAxis = vertical ? startY : startX
  const endAxis = vertical ? endY : endX
  const axisDistance = endAxis - startAxis
  const minAxis = Math.min(startAxis, endAxis)
  const maxAxis = Math.max(startAxis, endAxis)
  const midpoint = (startAxis + endAxis) / 2
  const offsets = [0, ...Array.from({ length: 12 }, (_, index) => (index + 1) * 16).flatMap((offset) => [offset, -offset])]
  const candidates = axisDistance === 0 ? [midpoint] : offsets
    .map((offset) => midpoint + offset)
    .filter((axis) => axis > minAxis + 2 && axis < maxAxis - 2)
  const ranked = candidates.map((axis) => {
    const points: [number, number][] = vertical
      ? [[startX, startY], [startX, axis], [endX, axis], [endX, endY]]
      : [[startX, startY], [axis, startY], [axis, endY], [endX, endY]]
    let collisions = 0
    let length = 0
    for (let index = 1; index < points.length; index++) {
      const [x1, y1] = points[index - 1]
      const [x2, y2] = points[index]
      length += Math.abs(x1 - x2) + Math.abs(y1 - y2)
      collisions += nodes.filter((node) => node !== source && node !== target)
        .filter((node) => segmentIntersectsNode(x1, y1, x2, y2, node)).length
    }
    return { points, axis, collisions, length }
  }).sort((a, b) => a.collisions - b.collisions || a.length - b.length || Math.abs(a.axis - midpoint) - Math.abs(b.axis - midpoint))
  const route = ranked[0]
  const points = route?.points ?? [[startX, startY], [endX, endY]]
  return {
    path: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' '),
    labelX: vertical ? (startX + endX) / 2 : route?.axis ?? midpoint,
    labelY: vertical ? route?.axis ?? midpoint : (startY + endY) / 2 - 5,
  }
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
  const parentEdges = layout.nodes.flatMap((child) => {
    const { node } = child
    if (!node.parentId) return []
    const parent = positioned.get(node.parentId)
    if (!parent) return []
    const edge = flowchartEdgePath(parent, child)
    const label = node.branchLabel
      ? `<text x="${edge.labelX}" y="${edge.labelY}" text-anchor="middle" font-size="12" fill="#45465a" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(node.branchLabel)}</text>`
      : ''
    return [`<g><path d="${edge.path}" fill="none" stroke="#77798b" stroke-width="2.5" marker-end="url(#flowchart-arrow)"/>${label}</g>`]
  })
  const connectionEdges = chart.connections.map((connection) => {
    const source = positioned.get(connection.fromId)
    const target = positioned.get(connection.toId)
    if (!source || !target) return ''
    const edge = flowchartConnectionPath(source, target, layout.nodes, connection.direction)
    const label = connection.branchLabel
      ? `<text x="${edge.labelX}" y="${edge.labelY}" text-anchor="middle" font-size="12" fill="#45465a" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(connection.branchLabel)}</text>`
      : ''
    return `<g><path d="${edge.path}" fill="none" stroke="#77798b" stroke-width="2.5" marker-end="url(#flowchart-arrow)"/>${label}</g>`
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><defs><marker id="flowchart-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#77798b"/></marker></defs>${parentEdges.join('')}${connectionEdges.join('')}${nodes.join('')}</svg>`
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
}
