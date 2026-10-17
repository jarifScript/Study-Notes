import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { createFlowchart, directionLabels, flowchartConnectionPath, flowchartDirections, flowchartEdgePath, flowchartImageSource, layoutFlowchart, nodeShapes, parseFlowchart, shapeLabels, wrapLabel } from '../lib/flowchart'
import type { FlowchartConnectionData, FlowchartData, FlowchartDirection, FlowchartNodeData, FlowchartShape } from '../lib/flowchart'

interface FlowchartExtensionOptions {
  onEdit?: (chart: FlowchartData, position: number) => void
}


function FlowchartDiagram({ chart }: { chart: FlowchartData }) {
  const layout = layoutFlowchart(chart)
  const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]))

  return <svg className="flowchart-diagram" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Flowchart">
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
    {chart.connections.map((connection, index) => {
      const source = positioned.get(connection.fromId)
      const target = positioned.get(connection.toId)
      if (!source || !target) return null
      const edge = flowchartConnectionPath(source, target, layout.width - 24 - index * 20)
      return <g key={connection.id} className="flowchart-edge">
        <path d={edge.path} markerEnd="url(#flowchart-arrow)" />
        {connection.branchLabel && <text x={edge.labelX} y={edge.labelY}>{connection.branchLabel}</text>}
      </g>
    })}
    {layout.nodes.map(({ node, x, y, width, height }) => {
      const x0 = x - width / 2
      const y0 = y - height / 2
      const lines = wrapLabel(node.label, Math.floor(width / 8))
      return <g className="flowchart-node" key={node.id}>
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
    const connection: FlowchartConnectionData = {
      id: crypto.randomUUID(),
      fromId: source.id,
      toId: target.id,
      branchLabel: '',
    }
    setChart((current) => ({ ...current, connections: [...current.connections, connection] }))
  }

  function updateConnection(id: string, update: Partial<FlowchartConnectionData>) {
    setChart((current) => ({
      ...current,
      connections: current.connections.map((connection) => connection.id === id ? { ...connection, ...update } : connection),
    }))
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
              <label>Branch label<input maxLength={100} value={connection.branchLabel} onChange={(event) => updateConnection(connection.id, { branchLabel: event.target.value })} placeholder="Optional" /></label>
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
            {previewChart
              ? <FlowchartDiagram chart={previewChart} />
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
