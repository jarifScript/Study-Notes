export type FlowchartShape = 'start' | 'process' | 'decision' | 'connector' | 'end'
export type FlowchartDirection = 'up' | 'down' | 'left' | 'right'
export type FlowchartArrow = 'forward' | 'reverse' | 'both' | 'none'

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
  fromSide: FlowchartDirection
  toSide: FlowchartDirection
  arrow: FlowchartArrow
  waypoints?: { x: number; y: number }[]
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
export const arrowLabels: Record<FlowchartArrow, string> = {
  forward: 'Arrow to target',
  reverse: 'Arrow to source',
  both: 'Arrows both ways',
  none: 'No arrowhead',
}
export const flowchartArrows: FlowchartArrow[] = ['forward', 'reverse', 'both', 'none']
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
        (connection.direction === undefined || (typeof connection.direction === 'string' && flowchartDirections.includes(connection.direction as FlowchartDirection))) &&
        (connection.fromSide === undefined || (typeof connection.fromSide === 'string' && flowchartDirections.includes(connection.fromSide as FlowchartDirection))) &&
        (connection.toSide === undefined || (typeof connection.toSide === 'string' && flowchartDirections.includes(connection.toSide as FlowchartDirection))) &&
        (connection.arrow === undefined || (typeof connection.arrow === 'string' && flowchartArrows.includes(connection.arrow as FlowchartArrow))) &&
        (connection.waypoints === undefined || (Array.isArray(connection.waypoints) && connection.waypoints.length <= 100 &&
          connection.waypoints.every((point) => !!point && typeof point === 'object' &&
            typeof point.x === 'number' && Number.isFinite(point.x) && Math.abs(point.x) <= 100000 &&
            typeof point.y === 'number' && Number.isFinite(point.y) && Math.abs(point.y) <= 100000)))
    })
    if (!validConnections) return null
    const validFlowchartConnections = rawConnections.map((value) => {
      const connection = value as FlowchartConnectionData & { direction?: FlowchartDirection }
      const direction = connection.direction ?? 'up'
      const fromSide = connection.fromSide ?? ({
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left',
      } as const)[direction]
      const toSide = connection.toSide ?? ({
        up: 'down',
        down: 'up',
        left: 'right',
        right: 'left',
      } as const)[direction]
      return { ...connection, fromSide, toSide, arrow: connection.arrow ?? 'forward' }
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

export function flowchartConnectionPath(
  source: PositionedNode,
  target: PositionedNode,
  nodes: PositionedNode[],
  fromSide: FlowchartDirection,
  toSide: FlowchartDirection,
  waypoints: { x: number; y: number }[] = [],
  originX = 0,
  originY = 0,
): { path: string; labelX: number; labelY: number; points: [number, number][] } {
  const pointOnSide = (node: PositionedNode, side: FlowchartDirection): [number, number] => [
    node.x + (side === 'right' ? node.width / 2 : side === 'left' ? -node.width / 2 : 0),
    node.y + (side === 'down' ? node.height / 2 : side === 'up' ? -node.height / 2 : 0),
  ]
  const normal = (side: FlowchartDirection): [number, number] =>
    side === 'left' ? [-1, 0] : side === 'right' ? [1, 0] : side === 'up' ? [0, -1] : [0, 1]
  const start = pointOnSide(source, fromSide)
  const end = pointOnSide(target, toSide)
  const startNormal = normal(fromSide)
  const endNormal = normal(toSide)
  const stubLength = 20
  const startStub: [number, number] = [start[0] + startNormal[0] * stubLength, start[1] + startNormal[1] * stubLength]
  const endStub: [number, number] = [end[0] + endNormal[0] * stubLength, end[1] + endNormal[1] * stubLength]
  const obstacles = nodes.map((node) => ({
    left: node.x - node.width / 2 - 8,
    right: node.x + node.width / 2 + 8,
    top: node.y - node.height / 2 - 8,
    bottom: node.y + node.height / 2 + 8,
  }))
  const manualPoints = waypoints.map((point): [number, number] => [point.x + originX, point.y + originY])
  if (manualPoints.length) {
    const anchors: [number, number][] = [start, startStub, ...manualPoints, endStub, end]
    const routed: [number, number][] = [anchors[0]]
    for (let index = 1; index < anchors.length; index++) {
      const [x1, y1] = anchors[index - 1]
      const [x2, y2] = anchors[index]
      const horizontalFirst: [number, number][] = [[x2, y1]]
      const verticalFirst: [number, number][] = [[x1, y2]]
      const score = (corners: [number, number][]) => {
        let collisions = 0
        for (const [cornerX, cornerY] of corners) {
          if (obstacles.some((box) => cornerX > box.left && cornerX < box.right && cornerY > box.top && cornerY < box.bottom)) collisions++
        }
        return collisions
      }
      if (x1 !== x2 && y1 !== y2) routed.push(...(score(horizontalFirst) <= score(verticalFirst) ? horizontalFirst : verticalFirst))
      routed.push([x2, y2])
    }
    const points = routed.filter((point, index) => {
      if (index === 0 || index === routed.length - 1) return true
      const previous = routed[index - 1]
      const next = routed[index + 1]
      return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0])
    })
    return {
      path: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' '),
      labelX: (start[0] + end[0]) / 2,
      labelY: (start[1] + end[1]) / 2 - 5,
      points,
    }
  }
  const xSet = new Set<number>([startStub[0], endStub[0]])
  const ySet = new Set<number>([startStub[1], endStub[1]])
  for (const node of nodes) {
    xSet.add(node.x - node.width / 2 - stubLength)
    xSet.add(node.x + node.width / 2 + stubLength)
    ySet.add(node.y - node.height / 2 - stubLength)
    ySet.add(node.y + node.height / 2 + stubLength)
  }
  const xs = [...xSet].sort((a, b) => a - b)
  const ys = [...ySet].sort((a, b) => a - b)
  const startXIndex = xs.indexOf(startStub[0])
  const startYIndex = ys.indexOf(startStub[1])
  const endXIndex = xs.indexOf(endStub[0])
  const endYIndex = ys.indexOf(endStub[1])
  interface RouteState { x: number; y: number; axis: number; cost: number; score: number; previous?: RouteState }
  const queue: RouteState[] = []
  function enqueue(state: RouteState) {
    queue.push(state)
    let index = queue.length - 1
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2)
      if (queue[parentIndex].score <= state.score) break
      queue[index] = queue[parentIndex]
      index = parentIndex
    }
    queue[index] = state
  }
  function dequeue(): RouteState | undefined {
    const first = queue[0]
    const last = queue.pop()
    if (!first || !last || !queue.length) return first
    let index = 0
    while (index * 2 + 1 < queue.length) {
      let child = index * 2 + 1
      if (child + 1 < queue.length && queue[child + 1].score < queue[child].score) child++
      if (queue[child].score >= last.score) break
      queue[index] = queue[child]
      index = child
    }
    queue[index] = last
    return first
  }
  const stateKey = (x: number, y: number, axis: number) => `${x}:${y}:${axis}`
  const initial: RouteState = {
    x: startXIndex,
    y: startYIndex,
    axis: 0,
    cost: 0,
    score: Math.abs(startStub[0] - endStub[0]) + Math.abs(startStub[1] - endStub[1]),
  }
  enqueue(initial)
  const best = new Map([[stateKey(initial.x, initial.y, 0), 0]])
  let finish: RouteState | undefined
  while (queue.length) {
    const current = dequeue()
    if (!current) break
    if (current.x === endXIndex && current.y === endYIndex) {
      finish = current
      break
    }
    const neighbors = [
      [current.x - 1, current.y, 1],
      [current.x + 1, current.y, 1],
      [current.x, current.y - 1, 2],
      [current.x, current.y + 1, 2],
    ] as const
    for (const [nextX, nextY, axis] of neighbors) {
      if (nextX < 0 || nextY < 0 || nextX >= xs.length || nextY >= ys.length) continue
      const x1 = xs[current.x]
      const y1 = ys[current.y]
      const x2 = xs[nextX]
      const y2 = ys[nextY]
      const blocked = obstacles.some((box) => {
        if (axis === 1) return y1 > box.top && y1 < box.bottom && Math.max(Math.min(x1, x2), box.left) < Math.min(Math.max(x1, x2), box.right)
        return x1 > box.left && x1 < box.right && Math.max(Math.min(y1, y2), box.top) < Math.min(Math.max(y1, y2), box.bottom)
      })
      if (blocked) continue
      const cost = current.cost + Math.abs(x2 - x1) + Math.abs(y2 - y1) + (current.axis !== 0 && current.axis !== axis ? 24 : 0)
      const nextKey = stateKey(nextX, nextY, axis)
      if (cost >= (best.get(nextKey) ?? Infinity)) continue
      best.set(nextKey, cost)
      enqueue({
        x: nextX,
        y: nextY,
        axis,
        cost,
        score: cost + Math.abs(x2 - endStub[0]) + Math.abs(y2 - endStub[1]),
        previous: current,
      })
    }
  }
  const routed: [number, number][] = []
  for (let state = finish; state; state = state.previous) routed.push([xs[state.x], ys[state.y]])
  routed.reverse()
  const pathPoints: [number, number][] = finish
    ? [start, ...routed, end]
    : [start, startStub, [startStub[0], endStub[1]], endStub, end]
  const points = pathPoints.filter((point, index) => {
    if (index === 0 || index === pathPoints.length - 1) return true
    const previous = pathPoints[index - 1]
    const next = pathPoints[index + 1]
    return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0])
  })
  return {
    path: points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' '),
    labelX: (start[0] + end[0]) / 2,
    labelY: (start[1] + end[1]) / 2 - 5,
    points,
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
    const edge = flowchartConnectionPath(source, target, layout.nodes, connection.fromSide, connection.toSide, connection.waypoints, layout.originX, layout.originY)
    const label = connection.branchLabel
      ? `<text x="${edge.labelX}" y="${edge.labelY}" text-anchor="middle" font-size="12" fill="#45465a" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(connection.branchLabel)}</text>`
      : ''
    const markerStart = connection.arrow === 'reverse' || connection.arrow === 'both' ? ' marker-start="url(#flowchart-arrow)"' : ''
    const markerEnd = connection.arrow === 'forward' || connection.arrow === 'both' ? ' marker-end="url(#flowchart-arrow)"' : ''
    return `<g><path d="${edge.path}" fill="none" stroke="#77798b" stroke-width="2.5"${markerStart}${markerEnd}/>${label}</g>`
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
