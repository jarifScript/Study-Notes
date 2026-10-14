import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import type { ReactNodeViewProps } from '@tiptap/react'
import { useState } from 'react'

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

interface FlowchartExtensionOptions {
  onEdit?: (chart: FlowchartData, position: number) => void
}

const nodeShapes: FlowchartShape[] = ['start', 'process', 'decision', 'connector', 'end']
const shapeLabels: Record<FlowchartShape, string> = {
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

function wrapLabel(label: string, maxLength: number): string[] {
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

function layoutFlowchart(chart: FlowchartData): { nodes: PositionedNode[]; width: number; height: number } {
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

function FlowchartDiagram({ chart }: { chart: FlowchartData }) {
  const layout = layoutFlowchart(chart)
  const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]))

  return <svg className="flowchart-diagram" viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label="Flowchart">
    <defs><marker id="flowchart-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
    {layout.nodes.flatMap(({ node, x: parentX, y: parentY, height: parentHeight }) => {
      if (!node.parentId) return []
      const child = positioned.get(node.id)
      if (!child) return []
      const startY = parentY + parentHeight / 2
      const endY = child.y - child.height / 2
      const middleY = (startY + endY) / 2
      const path = `M ${parentX} ${startY} V ${middleY} H ${child.x} V ${endY}`
      return [<g key={`edge-${node.id}`} className="flowchart-edge">
        <path d={path} markerEnd="url(#flowchart-arrow)" />
        {node.branchLabel && <text x={(parentX + child.x) / 2} y={middleY - 5}>{node.branchLabel}</text>}
      </g>]
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

function escapeXml(value: string): string {
  return value.replace(/[<>&'"]/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    "'": '&apos;',
    '"': '&quot;',
  })[character] ?? character)
}

function flowchartImageSource(chart: FlowchartData): string {
  const layout = layoutFlowchart(chart)
  const positioned = new Map(layout.nodes.map((item) => [item.node.id, item]))
  const edges = layout.nodes.flatMap(({ node, x: parentX, y: parentY, height: parentHeight }) => {
    if (!node.parentId) return []
    const child = positioned.get(node.id)
    if (!child) return []
    const startY = parentY + parentHeight / 2
    const endY = child.y - child.height / 2
    const middleY = (startY + endY) / 2
    const label = node.branchLabel
      ? `<text x="${(parentX + child.x) / 2}" y="${middleY - 5}" text-anchor="middle" font-size="12" fill="#45465a" stroke="#fff" stroke-width="4" paint-order="stroke" stroke-linejoin="round">${escapeXml(node.branchLabel)}</text>`
      : ''
    return [`<g><path d="M ${parentX} ${startY} V ${middleY} H ${child.x} V ${endY}" fill="none" stroke="#55566a" stroke-width="1.6" marker-end="url(#flowchart-arrow)"/>${label}</g>`]
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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><defs><marker id="flowchart-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#55566a"/></marker></defs>${edges.join('')}${nodes.join('')}</svg>`
  const bytes = new TextEncoder().encode(svg)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return `data:image/svg+xml;base64,${btoa(binary)}`
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

  function updateNode(id: string, update: Partial<FlowchartNodeData>) {
    setChart((current) => ({
      nodes: current.nodes.map((node) => node.id === id ? { ...node, ...update } : node),
    }))
  }

  function addNode() {
    const parentId = chart.nodes.at(-1)?.id ?? null
    setChart((current) => ({
      nodes: [...current.nodes, {
        id: crypto.randomUUID(),
        label: 'Process step',
        shape: 'process',
        parentId,
        branchLabel: '',
      }],
    }))
  }

  function removeNode(id: string) {
    const parentId = chart.nodes.find((node) => node.id === id)?.parentId ?? null
    setChart((current) => ({
      nodes: current.nodes.filter((node) => node.id !== id)
        .map((node) => node.parentId === id ? { ...node, parentId } : node),
    }))
  }

  function save() {
    const validChart = parseFlowchart(JSON.stringify(chart))
    if (!validChart || validChart.nodes.some((node) => !node.label.trim())) {
      setError('Enter a label for each node and make sure the connections do not form a loop.')
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
              <label>Branch label<input maxLength={100} value={node.branchLabel} onChange={(event) => updateNode(node.id, { branchLabel: event.target.value })} placeholder="e.g. Yes, No, Choice 1" /></label>
            </div>
            <button type="button" className="button subtle flowchart-remove-button" onClick={() => removeNode(node.id)} aria-label={`Remove ${node.label || 'node'}`}>Remove</button>
          </div>)}
          <button type="button" className="button outline-button" onClick={addNode}>+ Add node</button>
        </div>
        <div className="flowchart-preview">
          <strong>Preview</strong>
            {previewChart
              ? <FlowchartDiagram chart={previewChart} />
              : <p className="muted">Connections must form a tree without loops to preview the flowchart.</p>}
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
