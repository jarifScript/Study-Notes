import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { arrowLabels, createFlowchart, directionLabels, flowchartArrows, flowchartConnectionPath, flowchartDirections, flowchartEdgePath, flowchartImageSource, layoutFlowchart, nodeShapes, parseFlowchart, shapeLabels, wrapLabel } from '../lib/flowchart'
import type { FlowchartArrow, FlowchartConnectionData, FlowchartData, FlowchartDirection, FlowchartNodeData, FlowchartShape } from '../lib/flowchart'

interface FlowchartExtensionOptions {
  onEdit?: (chart: FlowchartData, position: number) => void
}


function FlowchartDiagram({
  chart,
  onNodeMove,
  onConnectionWaypointsChange,
}: {
  chart: FlowchartData
  onNodeMove?: (id: string, position: { x: number; y: number }) => void
  onConnectionWaypointsChange?: (id: string, waypoints: { x: number; y: number }[]) => void
}) {
  const layout = layoutFlowchart(chart)
  const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]))
  const dragging = useRef<{ id: string; offsetX: number; offsetY: number } | null>(null)
  const draggingWaypoint = useRef<{ id: string; index: number; waypoints: { x: number; y: number }[] } | null>(null)

  function pointerPosition(svg: SVGSVGElement, clientX: number, clientY: number) {
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const matrix = svg.getScreenCTM()
    return matrix ? point.matrixTransform(matrix.inverse()) : null
  }

  function startDragging(event: ReactPointerEvent<SVGGElement>, nodeId: string, x: number, y: number) {
    if (!onNodeMove) return
    const svg = event.currentTarget.ownerSVGElement
    const point = svg && pointerPosition(svg, event.clientX, event.clientY)
    if (!svg || !point) return
    event.preventDefault()
    event.stopPropagation()
    dragging.current = { id: nodeId, offsetX: point.x - x, offsetY: point.y - y }
    svg.setPointerCapture(event.pointerId)
  }

  function moveDragging(event: ReactPointerEvent<SVGSVGElement>) {
    const activeWaypoint = draggingWaypoint.current
    if (activeWaypoint && onConnectionWaypointsChange) {
      const point = pointerPosition(event.currentTarget, event.clientX, event.clientY)
      if (!point) return
      const waypoints = activeWaypoint.waypoints.map((waypoint, index) => index === activeWaypoint.index
        ? { x: point.x - layout.originX, y: point.y - layout.originY }
        : waypoint)
      activeWaypoint.waypoints = waypoints
      onConnectionWaypointsChange(activeWaypoint.id, waypoints)
      return
    }
    const active = dragging.current
    if (!active || !onNodeMove) return
    const point = pointerPosition(event.currentTarget, event.clientX, event.clientY)
    if (!point) return
    onNodeMove(active.id, {
      x: point.x - active.offsetX - layout.originX,
      y: point.y - active.offsetY - layout.originY,
    })
  }

  function stopDragging(event: ReactPointerEvent<SVGSVGElement>) {
    dragging.current = null
    draggingWaypoint.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return <svg
    className="flowchart-diagram"
    viewBox={`0 0 ${layout.width} ${layout.height}`}
    role={onNodeMove ? 'group' : 'img'}
    aria-label={onNodeMove ? 'Flowchart preview. Drag nodes to arrange them.' : 'Flowchart'}
    onPointerMove={onNodeMove || onConnectionWaypointsChange ? moveDragging : undefined}
    onPointerUp={onNodeMove || onConnectionWaypointsChange ? stopDragging : undefined}
    onPointerCancel={onNodeMove || onConnectionWaypointsChange ? stopDragging : undefined}
  >
    <defs><marker id="flowchart-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
    {layout.nodes.flatMap((child) => {
      const { node } = child
      if (!node.parentId) return []
      const parent = positioned.get(node.parentId)
      if (!parent) return []
      const edge = flowchartEdgePath(parent, child)
      return [<g key={`edge-${node.id}`} className="flowchart-edge">
        <path d={edge.path} markerEnd="url(#flowchart-arrow)" />
        {node.branchLabel && <text x={edge.labelX} y={edge.labelY}>{node.branchLabel}</text>}
      </g>]
    })}
    {chart.connections.map((connection) => {
      const source = positioned.get(connection.fromId)
      const target = positioned.get(connection.toId)
      if (!source || !target) return null
      const edge = flowchartConnectionPath(source, target, layout.nodes, connection.fromSide, connection.toSide, connection.waypoints, layout.originX, layout.originY)
      const waypoints = connection.waypoints ?? edge.points.slice(1, -1).map(([x, y]) => ({ x: x - layout.originX, y: y - layout.originY }))
      const handlePoints = connection.waypoints
        ? connection.waypoints.map((point) => [point.x + layout.originX, point.y + layout.originY] as [number, number])
        : edge.points.slice(1, -1)
      return <g key={connection.id} className="flowchart-edge">
        <path
          d={edge.path}
          markerStart={connection.arrow === 'reverse' || connection.arrow === 'both' ? 'url(#flowchart-arrow)' : undefined}
          markerEnd={connection.arrow === 'forward' || connection.arrow === 'both' ? 'url(#flowchart-arrow)' : undefined}
        />
        {connection.branchLabel && <text x={edge.labelX} y={edge.labelY}>{connection.branchLabel}</text>}
        {onConnectionWaypointsChange && handlePoints.map(([x, y], index) => <circle
          className="flowchart-waypoint"
          key={`${connection.id}-waypoint-${index}`}
          cx={x}
          cy={y}
          r="7"
          aria-label="Drag to reroute arrow"
          onPointerDown={(event) => {
            const svg = event.currentTarget.ownerSVGElement
            if (!svg) return
            event.preventDefault()
            event.stopPropagation()
            draggingWaypoint.current = { id: connection.id, index, waypoints: waypoints.map((point) => ({ ...point })) }
            svg.setPointerCapture(event.pointerId)
          }}
        />)}
      </g>
    })}
    {layout.nodes.map((item) => {
      const { node, x, y, width, height } = item
      const x0 = x - width / 2
      const y0 = y - height / 2
      const lines = wrapLabel(node.label, Math.floor(width / 8))
      return <g
        className="flowchart-node"
        key={node.id}
        tabIndex={onNodeMove ? 0 : undefined}
        aria-label={onNodeMove ? `${node.label}. Drag to move, or use arrow keys to nudge.` : undefined}
        onPointerDown={onNodeMove ? (event) => startDragging(event, node.id, x, y) : undefined}
        onKeyDown={onNodeMove ? (event) => {
          const delta = event.shiftKey ? 40 : 20
          const offsets: Partial<Record<string, { x: number; y: number }>> = {
            ArrowUp: { x: 0, y: -delta },
            ArrowDown: { x: 0, y: delta },
            ArrowLeft: { x: -delta, y: 0 },
            ArrowRight: { x: delta, y: 0 },
          }
          const offset = offsets[event.key]
          if (!offset) return
          event.preventDefault()
          onNodeMove(node.id, {
            x: x - layout.originX + offset.x,
            y: y - layout.originY + offset.y,
          })
        } : undefined}
      >
        {node.shape === 'decision'
          ? <polygon points={`${x},${y0} ${x0 + width},${y} ${x},${y0 + height} ${x0},${y}`} />
          : node.shape === 'connector'
            ? <circle cx={x} cy={y} r={width / 2} />
            : <rect x={x0} y={y0} width={width} height={height} rx={node.shape === 'start' || node.shape === 'end' ? height / 2 : 3} />}
        <text x={x} y={y} textAnchor="middle" dominantBaseline="middle">
          {lines.map((line, index) => <tspan key={index} x={x} dy={index === 0 ? `${-(lines.length - 1) * 8}px` : '16px'}>{line}</tspan>)}
        </text>
      </g>
    })}
  </svg>
}

function FlowchartNodeView({ node, extension, getPos }: ReactNodeViewProps) {
  const chart = parseFlowchart(JSON.stringify(node.attrs.chart)) ?? createFlowchart()
  const editFlowchart = extension.options.onEdit as FlowchartExtensionOptions['onEdit']
  return <NodeViewWrapper className="flowchart-node-view" data-study-flowchart={JSON.stringify(chart)}>
    <FlowchartDiagram chart={chart} />
    <button type="button" className="flowchart-edit-button" onClick={() => {
      const position = getPos()
      if (position !== undefined) editFlowchart?.(chart, position)
    }}>Edit flowchart</button>
  </NodeViewWrapper>
}

export const FlowchartExtension = Node.create<FlowchartExtensionOptions>({
  name: 'studyFlowchart',
  group: 'block',
  atom: true,
  addOptions() {
    return {}
  },
  addAttributes() {
    return {
      chart: {
        default: null,
        parseHTML: (element) => parseFlowchart(element.getAttribute('data-study-flowchart')),
        renderHTML: ({ chart }) => chart ? { 'data-study-flowchart': JSON.stringify(chart) } : {},
      },
    }
  },
  parseHTML() {
    return [{ tag: 'div[data-study-flowchart]' }]
  },
  renderHTML({ HTMLAttributes, node }) {
    const chart = parseFlowchart(JSON.stringify(node.attrs.chart)) ?? createFlowchart()
    return ['div', mergeAttributes(HTMLAttributes, { class: 'flowchart-content' }),
      ['img', { src: flowchartImageSource(chart), alt: 'Flowchart', class: 'flowchart-image' }]]
  },
  addNodeView() {
    return ReactNodeViewRenderer(FlowchartNodeView)
  },
})

interface FlowchartDialogProps {
  initial?: FlowchartData
  onClose: () => void
  onSave: (chart: FlowchartData) => void
}

export function FlowchartDialog({ initial, onClose, onSave }: FlowchartDialogProps) {
  const [chart, setChart] = useState(() => initial ?? createFlowchart())
  const [error, setError] = useState('')
  const previewChart = parseFlowchart(JSON.stringify(chart))

  useEffect(() => {
    function preventBrowserBackspace(event: KeyboardEvent) {
      if (event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof HTMLElement &&
        (target.isContentEditable || target.closest('input, textarea, [contenteditable="true"], [role="textbox"]'))) return
      event.preventDefault()
    }
    window.addEventListener('keydown', preventBrowserBackspace)
    return () => window.removeEventListener('keydown', preventBrowserBackspace)
  }, [])

  function updateNode(id: string, update: Partial<FlowchartNodeData>) {
    setChart((current) => ({
      ...current,
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...update } : node),
    }))
  }

  function addNode(direction: FlowchartDirection = 'down') {
    const parentId = chart.nodes.at(-1)?.id ?? null
    setChart((current) => ({
      ...current,
      nodes: [...current.nodes, {
        id: crypto.randomUUID(),
        label: 'Process step',
        shape: 'process',
        parentId,
        branchLabel: '',
        direction,
      }],
    }))
  }

  function removeNode(id: string) {
    const parentId = chart.nodes.find((node) => node.id === id)?.parentId ?? null
    setChart((current) => ({
      nodes: current.nodes.filter((node) => node.id !== id)
        .map((node) => node.parentId === id ? { ...node, parentId } : node),
      connections: current.connections.filter((connection) => connection.fromId !== id && connection.toId !== id),
    }))
  }

  function addConnection() {
    const source = chart.nodes.at(-1)
    const target = chart.nodes.find((node) => node.id !== source?.id)
    if (!source || !target) return
    const positioned = layoutFlowchart(chart).nodes
    const sourcePosition = positioned.find((item) => item.node.id === source.id)
    const targetPosition = positioned.find((item) => item.node.id === target.id)
    const dx = (targetPosition?.x ?? 0) - (sourcePosition?.x ?? 0)
    const dy = (targetPosition?.y ?? 0) - (sourcePosition?.y ?? 0)
    const connection: FlowchartConnectionData = {
      id: crypto.randomUUID(),
      fromId: source.id,
      toId: target.id,
      branchLabel: '',
      fromSide: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'),
      toSide: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : (dy > 0 ? 'up' : 'down'),
      arrow: 'forward',
    }
    setChart((current) => ({ ...current, connections: [...current.connections, connection] }))
  }

  function updateConnection(id: string, update: Partial<FlowchartConnectionData>) {
    setChart((current) => ({
      ...current,
      connections: current.connections.map((connection) => connection.id === id ? { ...connection, ...update } : connection),
    }))
  }

  function updateConnectionWaypoints(id: string, waypoints: { x: number; y: number }[]) {
    updateConnection(id, { waypoints })
  }

  function save() {
    const validChart = parseFlowchart(JSON.stringify(chart))
    if (!validChart || validChart.nodes.some((node) => !node.label.trim())) {
      setError('Enter a label for each node and make sure the parent connections do not form a loop.')
      return
    }
    onSave(validChart)
  }

  return <div className="dialog-backdrop flowchart-backdrop">
    <section className="dialog-card flowchart-dialog" role="dialog" aria-modal="true" aria-labelledby="flowchart-dialog-title">
      <header className="dialog-header">
        <div><span className="eyebrow">ANSWER DIAGRAM</span><h2 id="flowchart-dialog-title">{initial ? 'Edit flowchart' : 'Create flowchart'}</h2></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close">×</button>
      </header>
      <div className="flowchart-dialog-body">
        <div className="flowchart-node-list">
          {chart.nodes.map((node) => <div className="flowchart-node-row" key={node.id}>
            <div className="flowchart-node-fields">
              <label>Node text<input maxLength={200} value={node.label} onChange={(event) => updateNode(node.id, { label: event.target.value })} /></label>
              <label>Shape<select value={node.shape} onChange={(event) => updateNode(node.id, { shape: event.target.value as FlowchartShape })}>
                {nodeShapes.map((shape) => <option key={shape} value={shape}>{shapeLabels[shape]}</option>)}
              </select></label>
              <label>Connect from<select value={node.parentId ?? ''} onChange={(event) => updateNode(node.id, { parentId: event.target.value || null })}>
                <option value="">No parent (start a separate branch)</option>
                {chart.nodes.filter((item) => item.id !== node.id).map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.label || shapeLabels[item.shape]}</option>)}
              </select></label>
              <label>Arrow direction<select value={node.direction ?? 'down'} onChange={(event) => updateNode(node.id, { direction: event.target.value as FlowchartDirection })}>
                {flowchartDirections.map((direction) => <option key={direction} value={direction}>{directionLabels[direction]}</option>)}
              </select></label>
              <label>Branch label<input maxLength={100} value={node.branchLabel} onChange={(event) => updateNode(node.id, { branchLabel: event.target.value })} placeholder="e.g. Yes, No, Choice 1" /></label>
            </div>
            <button type="button" className="button subtle flowchart-remove-button" onClick={() => removeNode(node.id)} aria-label={`Remove ${node.label || 'node'}`}>Remove</button>
          </div>)}
          <div className="flowchart-add-actions">
            <button type="button" className="button outline-button" onClick={() => addNode('down')}>+ Add node below</button>
            <button type="button" className="button outline-button" onClick={() => addNode('right')}>+ Add node to right</button>
          </div>
          <section className="flowchart-connections" aria-label="Additional connections">
            <strong>Connect existing nodes</strong>
            <p className="muted">Add arrows between nodes without changing their existing connections. Loop-backs are allowed.</p>
            {chart.connections.map((connection) => <div className="flowchart-connection-row" key={connection.id}>
              <label>From<select value={connection.fromId} onChange={(event) => updateConnection(connection.id, { fromId: event.target.value })}>
                {chart.nodes.filter((node) => node.id !== connection.toId).map((node, index) => <option key={node.id} value={node.id}>{index + 1}. {node.label || shapeLabels[node.shape]}</option>)}
              </select></label>
              <label>To<select value={connection.toId} onChange={(event) => updateConnection(connection.id, { toId: event.target.value })}>
                {chart.nodes.filter((node) => node.id !== connection.fromId).map((node, index) => <option key={node.id} value={node.id}>{index + 1}. {node.label || shapeLabels[node.shape]}</option>)}
              </select></label>
              <label>Leave from<select value={connection.fromSide} onChange={(event) => updateConnection(connection.id, { fromSide: event.target.value as FlowchartDirection })}>
                {flowchartDirections.map((direction) => <option key={direction} value={direction}>{directionLabels[direction]}</option>)}
              </select></label>
              <label>Enter at<select value={connection.toSide} onChange={(event) => updateConnection(connection.id, { toSide: event.target.value as FlowchartDirection })}>
                {flowchartDirections.map((direction) => <option key={direction} value={direction}>{directionLabels[direction]}</option>)}
              </select></label>
              <label>Arrow<select value={connection.arrow} onChange={(event) => updateConnection(connection.id, { arrow: event.target.value as FlowchartArrow })}>
                {flowchartArrows.map((arrow) => <option key={arrow} value={arrow}>{arrowLabels[arrow]}</option>)}
              </select></label>
              <label>Branch label<input maxLength={100} value={connection.branchLabel} onChange={(event) => updateConnection(connection.id, { branchLabel: event.target.value })} placeholder="Optional" /></label>
              {connection.waypoints && <button type="button" className="button subtle flowchart-remove-button" onClick={() => updateConnection(connection.id, { waypoints: undefined })}>Reset route</button>}
              <button type="button" className="button subtle flowchart-remove-button" onClick={() => setChart((current) => ({
                ...current,
                connections: current.connections.filter((item) => item.id !== connection.id),
              }))}>Remove</button>
            </div>)}
            <button type="button" className="button outline-button" onClick={addConnection} disabled={chart.nodes.length < 2}>+ Add connection</button>
          </section>
        </div>
        <div className="flowchart-preview">
          <strong>Preview</strong>
            <p className="muted flowchart-preview-hint">Drag nodes to arrange them; drag the circles on an arrow to edit its route. Use arrow keys to nudge nodes.</p>
            {previewChart
                ? <FlowchartDiagram
                  chart={previewChart}
                  onNodeMove={(id, position) => updateNode(id, { position })}
                  onConnectionWaypointsChange={updateConnectionWaypoints}
                />
              : <p className="muted">Parent connections must form a tree without loops to preview the flowchart.</p>}
          </div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </div>
      <footer className="dialog-footer">
        <button type="button" className="button subtle" onClick={onClose}>Cancel</button>
        <button type="button" className="button primary" onClick={save}>{initial ? 'Save changes' : 'Insert flowchart'}</button>
      </footer>
    </section>
  </div>
}
