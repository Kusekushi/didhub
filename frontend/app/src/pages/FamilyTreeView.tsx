import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import * as d3 from 'd3'
import { useApi } from '@/context/ApiContext'
import { useToast } from '@/context/ToastContext'
import { Alter, User, Relationship } from '@didhub/api'
import { Combobox, ComboboxOption } from '@/components/ui/combobox'
import { RELATIONSHIP_TYPES, BIDIRECTIONAL_TYPES } from '@/lib/relationshipTypes'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Filter, Users, Link2 } from 'lucide-react'

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string
  label: string
  type: 'user' | 'alter'
  // For hierarchical layout
  generation?: number
  horizontalPos?: number
}
interface LinkDatum {
  source: string | NodeDatum
  target: string | NodeDatum
  relation?: string
}

export default function FamilyTreeView() {
  const api = useApi()
  const { show } = useToast()

  const svgRef = useRef<SVGSVGElement | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Core state
  const [startId, setStartId] = useState<string>('')
  const [depth, setDepth] = useState<number>(2)
  const [nodes, setNodes] = useState<NodeDatum[]>([])
  const [links, setLinks] = useState<LinkDatum[]>([])

  // Data for filters
  const [alters, setAlters] = useState<Alter[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [relationships, setRelationships] = useState<Relationship[]>([])
  const [loading, setLoading] = useState(false)

  // Filter state
  const [selectedRelationTypes, setSelectedRelationTypes] = useState<Set<string>>(new Set(RELATIONSHIP_TYPES.map(t => t.value)))
  const [showFilters, setShowFilters] = useState(true)

  // Load alters, users (non-system only), and relationships
  const loadFilterData = useCallback(async () => {
    setLoading(true)
    try {
      const [altersRes, usersRes, relationshipsRes] = await Promise.all([
        api.listAlters<Alter[]>({}),
        api.getUsers<{ items: User[] }>({}),
        api.listRelationships<Relationship[]>({})
      ])

      const allAlters = Array.isArray(altersRes.data) ? altersRes.data : []
      const allUsers = usersRes.data?.items || []
      const allRelationships = Array.isArray(relationshipsRes.data) ? relationshipsRes.data : []

      // Filter to only non-system users
      const nonSystemUsers = allUsers.filter(u => !u.isSystem)

      setAlters(allAlters)
      setUsers(nonSystemUsers)
      setRelationships(allRelationships)
    } catch {
      show({ title: 'Error', description: 'Failed to load filter data', variant: 'error' })
    } finally {
      setLoading(false)
    }
  }, [api, show])

  // Initial load
  useEffect(() => {
    loadFilterData()
  }, [loadFilterData])

  // Build start node options - alters and non-system users
  const startNodeOptions: ComboboxOption[] = useMemo(() => {
    const options: ComboboxOption[] = []
    
    // Add alters
    for (const alter of alters) {
      options.push({
        value: `alter:${alter.id}`,
        label: `${alter.name}${alter.pronouns ? ` (${alter.pronouns})` : ''} [Alter]`
      })
    }
    
    // Add non-system users
    for (const user of users) {
      options.push({
        value: `user:${user.id}`,
        label: `${user.displayName || user.username} [User]`
      })
    }
    
    return options.sort((a, b) => a.label.localeCompare(b.label))
  }, [alters, users])

  // Build the graph from relationships (client-side)
  const buildGraphFromRelationships = useCallback(() => {
    // Create node map
    const nodeMap = new Map<string, NodeDatum>()

    // Add all alters as nodes
    for (const alter of alters) {
      const id = `alter:${alter.id}`
      nodeMap.set(id, { id, label: alter.name, type: 'alter' })
    }

    // Add non-system users as nodes
    for (const user of users) {
      const id = `user:${user.id}`
      nodeMap.set(id, { id, label: user.displayName || user.username, type: 'user' })
    }

    // Build adjacency and links from filtered relationships
    const filteredRelationships = relationships.filter(r => selectedRelationTypes.has(r.relationType))
    const adjacency = new Map<string, Set<string>>()
    const linksList: LinkDatum[] = []

    for (const rel of filteredRelationships) {
      let sideA: string | null = null
      let sideB: string | null = null

      if (rel.sideAAlterId) {
        sideA = `alter:${rel.sideAAlterId}`
      } else if (rel.sideAUserId) {
        sideA = `user:${rel.sideAUserId}`
      }

      if (rel.sideBAlterId) {
        sideB = `alter:${rel.sideBAlterId}`
      } else if (rel.sideBUserId) {
        sideB = `user:${rel.sideBUserId}`
      }

      if (sideA && sideB && nodeMap.has(sideA) && nodeMap.has(sideB)) {
        // Add adjacency
        if (!adjacency.has(sideA)) adjacency.set(sideA, new Set())
        if (!adjacency.has(sideB)) adjacency.set(sideB, new Set())
        adjacency.get(sideA)!.add(sideB)
        adjacency.get(sideB)!.add(sideA)

        // Add link with relationship type
        linksList.push({
          source: sideA,
          target: sideB,
          relation: rel.relationType
        })
      }
    }

    // If no start node selected, pick the first one with connections
    let rootId = startId
    if (!rootId && nodeMap.size > 0) {
      // Prefer a node that has connections
      for (const [id] of adjacency) {
        if (adjacency.get(id)?.size) {
          rootId = id
          break
        }
      }
      if (!rootId) {
        rootId = nodeMap.keys().next().value || ''
      }
      if (rootId) setStartId(rootId)
    }

    if (!rootId || !nodeMap.has(rootId)) {
      setNodes([])
      setLinks([])
      return
    }

    // BFS to collect nodes up to depth
    const visited = new Set<string>()
    const queue: { id: string; d: number }[] = [{ id: rootId, d: 0 }]
    visited.add(rootId)

    const resultNodes: NodeDatum[] = []
    const resultLinks: LinkDatum[] = []
    const seenLinks = new Set<string>()

    while (queue.length > 0) {
      const { id, d } = queue.shift()!
      const node = nodeMap.get(id)
      if (node) resultNodes.push(node)

      if (d < depth) {
        const neighbors = adjacency.get(id) || new Set()
        for (const nb of neighbors) {
          // Add the link - preserve original source/target from the relationship
          const linkKey = [id, nb].sort().join('-')
          if (!seenLinks.has(linkKey)) {
            seenLinks.add(linkKey)
            const rel = linksList.find(l => 
              (l.source === id && l.target === nb) || (l.source === nb && l.target === id)
            )
            if (rel) {
              // Use the original direction from the relationship
              resultLinks.push({
                source: rel.source,
                target: rel.target,
                relation: rel.relation
              })
            } else {
              resultLinks.push({
                source: id,
                target: nb,
                relation: undefined
              })
            }
          }

          if (!visited.has(nb)) {
            visited.add(nb)
            queue.push({ id: nb, d: d + 1 })
          }
        }
      }
    }

    setNodes(resultNodes)
    setLinks(resultLinks)
  }, [alters, users, relationships, selectedRelationTypes, startId, depth])

  // Rebuild graph when dependencies change
  useEffect(() => {
    if (alters.length > 0 || users.length > 0) {
      buildGraphFromRelationships()
    }
  }, [buildGraphFromRelationships, alters.length, users.length])

  // Toggle relationship type
  const toggleRelationType = (type: string) => {
    setSelectedRelationTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  // Select all / none relationship types
  const selectAllRelationTypes = () => {
    setSelectedRelationTypes(new Set(RELATIONSHIP_TYPES.map(t => t.value)))
  }

  const selectNoRelationTypes = () => {
    setSelectedRelationTypes(new Set())
  }

  // Get color for relationship type
  const getRelationColor = (relationType?: string): string => {
    const type = RELATIONSHIP_TYPES.find(t => t.value === relationType)
    return type?.color || '#9ca3af'
  }

  // D3 visualization - Hierarchical family tree layout
  useEffect(() => {
    if (!svgRef.current || !wrapperRef.current) return
    const containerWidth = wrapperRef.current.clientWidth || 800
    
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    if (nodes.length === 0) return

    // Node dimensions
    const nodeWidth = 140
    const nodeHeight = 60
    const verticalSpacing = 100
    const horizontalSpacing = 180
    const padding = 60

    // Build adjacency for layout
    const adjacency = new Map<string, Set<string>>()
    const nodeById = new Map<string, NodeDatum>()
    
    for (const node of nodes) {
      nodeById.set(node.id, { ...node })
      adjacency.set(node.id, new Set())
    }
    
    for (const link of links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      adjacency.get(sourceId)?.add(targetId)
      adjacency.get(targetId)?.add(sourceId)
    }

    // Find root node (the startId or first node)
    const rootId = startId && nodeById.has(startId) ? startId : nodes[0]?.id
    if (!rootId) return

    // Relationship type classifications
    // "Parent" relations: source is ABOVE target (source is parent/mentor/etc of target)
    const parentRelations = ['parent', 'source', 'caretaker', 'protector', 'mentor']
    // "Fragment" relations: source is BELOW target (source is fragment of target)  
    const childRelations = ['fragment']
    // "Peer" relations: source and target are on SAME level
    const peerRelations = ['partner', 'friend', 'sibling', 'rival']

    // Build directed relationship info with priority
    // Priority: hierarchical relationships (parent/child) > peer relationships
    const relationshipInfo = new Map<string, { otherId: string; genOffset: number; priority: number }[]>()
    
    for (const node of nodes) {
      relationshipInfo.set(node.id, [])
    }
    
    for (const link of links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      const relType = link.relation || ''
      
      if (parentRelations.includes(relType)) {
        // Source is parent of target: source is above (lower gen number)
        relationshipInfo.get(sourceId)?.push({ otherId: targetId, genOffset: 1, priority: 1 })
        relationshipInfo.get(targetId)?.push({ otherId: sourceId, genOffset: -1, priority: 1 })
      } else if (childRelations.includes(relType)) {
        // Source is child of target: source is below (higher gen number)
        relationshipInfo.get(sourceId)?.push({ otherId: targetId, genOffset: -1, priority: 1 })
        relationshipInfo.get(targetId)?.push({ otherId: sourceId, genOffset: 1, priority: 1 })
      } else if (peerRelations.includes(relType)) {
        // Same generation - lower priority
        relationshipInfo.get(sourceId)?.push({ otherId: targetId, genOffset: 0, priority: 0 })
        relationshipInfo.get(targetId)?.push({ otherId: sourceId, genOffset: 0, priority: 0 })
      } else {
        // Unknown - treat as peers with low priority
        relationshipInfo.get(sourceId)?.push({ otherId: targetId, genOffset: 0, priority: 0 })
        relationshipInfo.get(targetId)?.push({ otherId: sourceId, genOffset: 0, priority: 0 })
      }
    }

    // Sort each node's relationships by priority (hierarchical first)
    for (const [, rels] of relationshipInfo) {
      rels.sort((a, b) => b.priority - a.priority)
    }

    // Assign generations using BFS, respecting relationship semantics
    // First pass: establish hierarchy from hierarchical relationships
    const generations = new Map<string, number>()
    const queue: { id: string; gen: number }[] = [{ id: rootId, gen: 0 }]
    generations.set(rootId, 0)

    while (queue.length > 0) {
      const { id, gen } = queue.shift()!
      const relations = relationshipInfo.get(id) || []
      
      for (const { otherId, genOffset, priority } of relations) {
        if (!generations.has(otherId)) {
          // Only use hierarchical relationships for initial assignment
          if (priority === 1) {
            const neighborGen = gen + genOffset
            generations.set(otherId, neighborGen)
            queue.push({ id: otherId, gen: neighborGen })
          }
        }
      }
    }

    // Second pass: assign remaining nodes (those only connected by peer relationships)
    // Find them through any connected node that has a generation
    for (const node of nodes) {
      if (!generations.has(node.id)) {
        // Find a neighbor that has a generation
        const relations = relationshipInfo.get(node.id) || []
        for (const { otherId, genOffset } of relations) {
          if (generations.has(otherId)) {
            generations.set(node.id, generations.get(otherId)! + genOffset)
            break
          }
        }
        // If still not found, put at gen 0
        if (!generations.has(node.id)) {
          generations.set(node.id, 0)
        }
      }
    }

    // Normalize generations (make minimum generation 0)
    const minGen = Math.min(...generations.values())
    for (const [id, gen] of generations) {
      generations.set(id, gen - minGen)
    }

    // Group nodes by generation
    const generationGroups = new Map<number, string[]>()
    for (const [id, gen] of generations) {
      if (!generationGroups.has(gen)) {
        generationGroups.set(gen, [])
      }
      generationGroups.get(gen)!.push(id)
    }

    // Build family clusters for smarter horizontal positioning
    // A cluster is a group of nodes connected by partner/peer relationships
    const peerAdjacency = new Map<string, Set<string>>()
    const parentChildLinks = new Map<string, Set<string>>() // parent -> children
    
    for (const node of nodes) {
      peerAdjacency.set(node.id, new Set())
      parentChildLinks.set(node.id, new Set())
    }
    
    for (const link of links) {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      const relType = link.relation || ''
      
      if (peerRelations.includes(relType)) {
        peerAdjacency.get(sourceId)?.add(targetId)
        peerAdjacency.get(targetId)?.add(sourceId)
      } else if (parentRelations.includes(relType)) {
        parentChildLinks.get(sourceId)?.add(targetId)
      } else if (childRelations.includes(relType)) {
        parentChildLinks.get(targetId)?.add(sourceId)
      }
    }

    // Calculate horizontal positions with family clustering
    const nodeXPositions = new Map<string, number>()
    const sortedGenerations = Array.from(generationGroups.keys()).sort((a, b) => a - b)
    
    // Start with generation 0 (or the first generation)
    let currentX = 0
    const clusterGap = horizontalSpacing * 0.8 // Extra gap between unrelated nodes
    
    for (const gen of sortedGenerations) {
      const nodesInGen = generationGroups.get(gen) || []
      
      if (gen === sortedGenerations[0]) {
        // First generation: group by peer connections (partners, siblings)
        const visited = new Set<string>()
        const clusters: string[][] = []
        
        for (const nodeId of nodesInGen) {
          if (visited.has(nodeId)) continue
          
          // BFS to find all peers in this cluster
          const cluster: string[] = []
          const queue = [nodeId]
          
          while (queue.length > 0) {
            const current = queue.shift()!
            if (visited.has(current)) continue
            if (!nodesInGen.includes(current)) continue
            
            visited.add(current)
            cluster.push(current)
            
            const peers = peerAdjacency.get(current) || new Set()
            for (const peer of peers) {
              if (!visited.has(peer) && nodesInGen.includes(peer)) {
                queue.push(peer)
              }
            }
          }
          
          if (cluster.length > 0) {
            clusters.push(cluster)
          }
        }
        
        // Position clusters with gaps between them
        currentX = padding + horizontalSpacing / 2
        for (const cluster of clusters) {
          for (const nodeId of cluster) {
            nodeXPositions.set(nodeId, currentX)
            currentX += horizontalSpacing
          }
          currentX += clusterGap // Add gap between clusters
        }
      } else {
        // Subsequent generations: position children under their parents
        const positioned: string[] = []
        const unpositioned = [...nodesInGen]
        
        // First, position nodes that have parents in previous generation
        for (const nodeId of nodesInGen) {
          // Find all parents of this node
          const parents: string[] = []
          for (const [parentId, children] of parentChildLinks) {
            if (children.has(nodeId) && nodeXPositions.has(parentId)) {
              parents.push(parentId)
            }
          }
          
          if (parents.length > 0) {
            // Position under the center of parents
            const parentXSum = parents.reduce((sum, p) => sum + (nodeXPositions.get(p) || 0), 0)
            const avgParentX = parentXSum / parents.length
            nodeXPositions.set(nodeId, avgParentX)
            positioned.push(nodeId)
            unpositioned.splice(unpositioned.indexOf(nodeId), 1)
          }
        }
        
        // Handle nodes with peer connections to already-positioned nodes
        let changed = true
        while (changed && unpositioned.length > 0) {
          changed = false
          for (let i = unpositioned.length - 1; i >= 0; i--) {
            const nodeId = unpositioned[i]
            const peers = peerAdjacency.get(nodeId) || new Set()
            
            // Find a positioned peer in the same generation
            for (const peer of peers) {
              if (nodeXPositions.has(peer) && nodesInGen.includes(peer)) {
                // Position next to the peer
                const peerX = nodeXPositions.get(peer)!
                nodeXPositions.set(nodeId, peerX + horizontalSpacing)
                positioned.push(nodeId)
                unpositioned.splice(i, 1)
                changed = true
                break
              }
            }
          }
        }
        
        // Position any remaining unpositioned nodes at the end
        if (unpositioned.length > 0) {
          const maxX = Math.max(...Array.from(nodeXPositions.values()), padding)
          currentX = maxX + clusterGap + horizontalSpacing
          for (const nodeId of unpositioned) {
            nodeXPositions.set(nodeId, currentX)
            currentX += horizontalSpacing
          }
        }
        
        // Resolve overlaps within this generation
        const genNodesWithX = nodesInGen
          .map(id => ({ id, x: nodeXPositions.get(id) || 0 }))
          .sort((a, b) => a.x - b.x)
        
        for (let i = 1; i < genNodesWithX.length; i++) {
          const prev = genNodesWithX[i - 1]
          const curr = genNodesWithX[i]
          const minGap = horizontalSpacing * 0.9
          
          if (curr.x - prev.x < minGap) {
            curr.x = prev.x + minGap
            nodeXPositions.set(curr.id, curr.x)
          }
        }
      }
    }

    // Calculate dimensions
    const numGenerations = generationGroups.size
    const maxX = Math.max(...Array.from(nodeXPositions.values())) + horizontalSpacing / 2 + padding
    const calculatedWidth = Math.max(containerWidth, maxX)
    const height = numGenerations * verticalSpacing + nodeHeight + padding * 2

    // Position nodes
    const positionedNodes: (NodeDatum & { x: number; y: number })[] = []
    
    for (const [gen, nodeIds] of generationGroups) {
      const y = padding + gen * verticalSpacing + nodeHeight / 2
      
      for (const id of nodeIds) {
        const node = nodeById.get(id)!
        positionedNodes.push({
          ...node,
          x: nodeXPositions.get(id) || padding + horizontalSpacing / 2,
          y,
          generation: gen,
        })
      }
    }

    // Create positioned links
    const positionedLinks = links.map(link => {
      const sourceId = typeof link.source === 'string' ? link.source : link.source.id
      const targetId = typeof link.target === 'string' ? link.target : link.target.id
      return {
        source: positionedNodes.find(n => n.id === sourceId)!,
        target: positionedNodes.find(n => n.id === targetId)!,
        relation: link.relation,
      }
    }).filter(l => l.source && l.target)

    // Set up SVG
    const g = svg
      .attr('viewBox', `0 0 ${calculatedWidth} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', `${Math.max(600, height)}px`)
      .append('g')

    // Build data structures for pedigree-style connections
    // Use CHILD-CENTRIC approach: for each child, find all their parents
    const childToParents = new Map<string, Set<string>>()
    const parentToChildren = new Map<string, Set<string>>()
    const partnerPairsWithSharedChild = new Set<string>() // "id1-id2" pairs that share a child
    
    // Collect all parent-child relationships
    for (const link of positionedLinks) {
      if (parentRelations.includes(link.relation || '')) {
        const parentId = link.source.id
        const childId = link.target.id
        
        if (!childToParents.has(childId)) {
          childToParents.set(childId, new Set())
        }
        childToParents.get(childId)!.add(parentId)
        
        if (!parentToChildren.has(parentId)) {
          parentToChildren.set(parentId, new Set())
        }
        parentToChildren.get(parentId)!.add(childId)
      }
    }
    
    // Find partner pairs that share children
    for (const link of positionedLinks) {
      if (link.relation === 'partner') {
        const id1 = link.source.id
        const id2 = link.target.id
        
        // Check if they share any children
        const children1 = parentToChildren.get(id1) || new Set()
        const children2 = parentToChildren.get(id2) || new Set()
        const sharedChildren = [...children1].filter(c => children2.has(c))
        
        if (sharedChildren.length > 0) {
          const pairKey = [id1, id2].sort().join('-')
          partnerPairsWithSharedChild.add(pairKey)
        }
      }
    }
    
    const isParentFilterOn = selectedRelationTypes.has('parent')
    
    // Track which links we've already drawn via pedigree
    const drawnParentLinks = new Set<string>() // "parentId->childId"
    const drawnPartnerLinks = new Set<string>() // "id1-id2"

    // Draw connection lines (pedigree family tree style)
    const linkGroup = g.append('g').attr('class', 'links')
    
    // Draw pedigree-style connections: for each child with multiple parents, draw proper pedigree
    if (isParentFilterOn) {
      for (const [childId, parentIds] of childToParents) {
        const child = positionedNodes.find(n => n.id === childId)
        if (!child) continue
        
        const parents = [...parentIds]
          .map(id => positionedNodes.find(n => n.id === id))
          .filter(Boolean) as (NodeDatum & { x: number; y: number })[]
        
        if (parents.length === 0) continue
        
        const parentColor = getRelationColor('parent')
        const partnerColor = getRelationColor('partner')
        
        // Sort parents by x position
        parents.sort((a, b) => a.x - b.x)
        
        const leftParent = parents[0]
        const parentY = leftParent.y + nodeHeight / 2
        const childY = child.y - nodeHeight / 2
        const midY = (parentY + childY) / 2
        
        if (parents.length === 1) {
          // Single parent: simple vertical line down
          linkGroup.append('line')
            .attr('x1', leftParent.x)
            .attr('y1', parentY)
            .attr('x2', leftParent.x)
            .attr('y2', midY)
            .attr('stroke', parentColor)
            .attr('stroke-width', 2)
          
          // Horizontal to child if needed
          if (Math.abs(leftParent.x - child.x) > 2) {
            linkGroup.append('line')
              .attr('x1', leftParent.x)
              .attr('y1', midY)
              .attr('x2', child.x)
              .attr('y2', midY)
              .attr('stroke', parentColor)
              .attr('stroke-width', 2)
          }
          
          // Vertical down to child
          linkGroup.append('line')
            .attr('x1', child.x)
            .attr('y1', midY)
            .attr('x2', child.x)
            .attr('y2', childY)
            .attr('stroke', parentColor)
            .attr('stroke-width', 2)
        } else {
          // Multiple parents: draw from each parent individually
          // Find groups of parents who are partners (connected partner groups)
          const partnerGroups: (NodeDatum & { x: number; y: number })[][] = []
          const assignedToGroup = new Set<string>()
          
          for (const parent of parents) {
            if (assignedToGroup.has(parent.id)) continue
            
            // Find all parents who are partners with this one (directly or transitively)
            const group: (NodeDatum & { x: number; y: number })[] = [parent]
            assignedToGroup.add(parent.id)
            
            let changed = true
            while (changed) {
              changed = false
              for (const other of parents) {
                if (assignedToGroup.has(other.id)) continue
                
                // Check if other is a partner with anyone in the group
                for (const member of group) {
                  const pairKey = [member.id, other.id].sort().join('-')
                  if (partnerPairsWithSharedChild.has(pairKey)) {
                    group.push(other)
                    assignedToGroup.add(other.id)
                    changed = true
                    break
                  }
                }
              }
            }
            
            // Sort group by x position
            group.sort((a, b) => a.x - b.x)
            partnerGroups.push(group)
          }
          
          // Draw each partner group and collect drop points
          const dropPoints: number[] = []
          
          for (const group of partnerGroups) {
            const groupLeft = group[0]
            const groupRight = group[group.length - 1]
            const groupCenterX = (groupLeft.x + groupRight.x) / 2
            
            dropPoints.push(groupCenterX)
            
            // If group has multiple members, draw horizontal partner line
            if (group.length > 1) {
              linkGroup.append('line')
                .attr('x1', groupLeft.x)
                .attr('y1', parentY)
                .attr('x2', groupRight.x)
                .attr('y2', parentY)
                .attr('stroke', partnerColor)
                .attr('stroke-width', 2)
              
              // Mark partner connections as drawn
              for (let i = 0; i < group.length - 1; i++) {
                const pairKey = [group[i].id, group[i + 1].id].sort().join('-')
                drawnPartnerLinks.add(pairKey)
              }
            }
            
            // Vertical drop from group center (or single parent) to midY
            linkGroup.append('line')
              .attr('x1', groupCenterX)
              .attr('y1', parentY)
              .attr('x2', groupCenterX)
              .attr('y2', midY)
              .attr('stroke', parentColor)
              .attr('stroke-width', 2)
          }
          
          // Add child's x to the connection points
          dropPoints.push(child.x)
          dropPoints.sort((a, b) => a - b)
          
          // Draw horizontal line at midY connecting all drop points
          const leftmostX = dropPoints[0]
          const rightmostX = dropPoints[dropPoints.length - 1]
          
          linkGroup.append('line')
            .attr('x1', leftmostX)
            .attr('y1', midY)
            .attr('x2', rightmostX)
            .attr('y2', midY)
            .attr('stroke', parentColor)
            .attr('stroke-width', 2)
          
          // Single vertical line down to child (from child's x)
          linkGroup.append('line')
            .attr('x1', child.x)
            .attr('y1', midY)
            .attr('x2', child.x)
            .attr('y2', childY)
            .attr('stroke', parentColor)
            .attr('stroke-width', 2)
        }
        
        // Mark all parent links as drawn
        for (const parent of parents) {
          drawnParentLinks.add(`${parent.id}->${childId}`)
        }
      }
    }
    
    // Draw partner lines for partners who don't share children (simple horizontal connection)
    // These are handled in the remaining links section below
    
    // Draw remaining links that weren't part of pedigree structure
    let arcHeightOffset = 0
    const drawnPeerPairs = new Set<string>()
    
    for (const link of positionedLinks) {
      const sourceId = link.source.id
      const targetId = link.target.id
      const pairKey = [sourceId, targetId].sort().join('-')
      const directedKey = `${sourceId}->${targetId}`
      
      // Skip if already drawn as pedigree
      if (parentRelations.includes(link.relation || '') && drawnParentLinks.has(directedKey)) {
        continue
      }
      if (link.relation === 'partner' && drawnPartnerLinks.has(pairKey)) {
        continue
      }
      
      // Skip redundant partner links (partners who share children, even if not drawn yet)
      if (link.relation === 'partner' && isParentFilterOn && partnerPairsWithSharedChild.has(pairKey)) {
        continue
      }
      
      const color = getRelationColor(link.relation)
      const isBidirectional = link.relation && BIDIRECTIONAL_TYPES.includes(link.relation)
      
      const x1 = link.source.x
      const y1 = link.source.y
      const x2 = link.target.x
      const y2 = link.target.y
      
      const sourceGen = link.source.generation ?? 0
      const targetGen = link.target.generation ?? 0
      
      if (sourceGen === targetGen) {
        // Same generation - for partners use simple horizontal line, others use arc
        if (drawnPeerPairs.has(pairKey)) continue
        drawnPeerPairs.add(pairKey)
        
        if (link.relation === 'partner') {
          // Partner: simple horizontal line at node level
          const leftNode = x1 < x2 ? link.source : link.target
          const rightNode = x1 < x2 ? link.target : link.source
          
          linkGroup.append('line')
            .attr('x1', leftNode.x + nodeWidth / 2)
            .attr('y1', leftNode.y)
            .attr('x2', rightNode.x - nodeWidth / 2)
            .attr('y2', rightNode.y)
            .attr('stroke', color)
            .attr('stroke-width', 2)
          
          // Label above the line
          linkGroup.append('text')
            .attr('x', (x1 + x2) / 2)
            .attr('y', y1 - nodeHeight / 2 - 5)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('font-size', '9px')
            .attr('font-weight', '500')
            .text('Partner')
        } else {
          // Other peer relationships: arc above
          const arcHeight = 25 + arcHeightOffset * 15
          arcHeightOffset++
          
          const midY = y1 - nodeHeight/2 - arcHeight
          
          linkGroup.append('path')
            .attr('d', `M ${x1} ${y1 - nodeHeight/2}
                        L ${x1} ${midY}
                        L ${x2} ${midY}
                        L ${x2} ${y2 - nodeHeight/2}`)
            .attr('fill', 'none')
            .attr('stroke', color)
            .attr('stroke-width', 2)
            .attr('stroke-dasharray', isBidirectional ? '0' : '5,3')
          
          const relLabel = RELATIONSHIP_TYPES.find(t => t.value === link.relation)?.label || link.relation
          linkGroup.append('text')
            .attr('x', (x1 + x2) / 2)
            .attr('y', midY - 4)
            .attr('text-anchor', 'middle')
            .attr('fill', color)
            .attr('font-size', '9px')
            .attr('font-weight', '500')
            .text(relLabel || '')
        }
      } else {
        // Different generations - vertical/elbow connection
        const midY = (y1 + y2) / 2
        
        linkGroup.append('path')
          .attr('d', `M ${x1} ${y1 + (sourceGen < targetGen ? nodeHeight/2 : -nodeHeight/2)}
                      L ${x1} ${midY}
                      L ${x2} ${midY}
                      L ${x2} ${y2 + (sourceGen < targetGen ? -nodeHeight/2 : nodeHeight/2)}`)
          .attr('fill', 'none')
          .attr('stroke', color)
          .attr('stroke-width', 2)
        
        const relLabel = RELATIONSHIP_TYPES.find(t => t.value === link.relation)?.label || link.relation
        linkGroup.append('text')
          .attr('x', x1 + 5)
          .attr('y', y1 + (sourceGen < targetGen ? nodeHeight/2 + 15 : -nodeHeight/2 - 8))
          .attr('text-anchor', 'start')
          .attr('fill', color)
          .attr('font-size', '9px')
          .attr('font-weight', '500')
          .text(relLabel || '')
      }
    }

    // Draw nodes as rectangular cards
    const nodeGroup = g.append('g').attr('class', 'nodes')

    const nodeGs = nodeGroup.selectAll('g')
      .data(positionedNodes)
      .enter()
      .append('g')
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .style('cursor', 'pointer')
      .on('click', (_e: MouseEvent, d: NodeDatum) => {
        setStartId(d.id)
      })

    // Node background rectangle
    nodeGs.append('rect')
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', nodeHeight)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d: NodeDatum) => d.type === 'user' ? '#0d9488' : '#2563eb')
      .attr('stroke', (d: NodeDatum) => d.id === rootId ? '#fbbf24' : '#374151')
      .attr('stroke-width', (d: NodeDatum) => d.id === rootId ? 3 : 1.5)
      .attr('filter', 'drop-shadow(0 2px 4px rgba(0,0,0,0.1))')

    // Type indicator bar at top
    nodeGs.append('rect')
      .attr('x', -nodeWidth / 2)
      .attr('y', -nodeHeight / 2)
      .attr('width', nodeWidth)
      .attr('height', 6)
      .attr('rx', 8)
      .attr('ry', 8)
      .attr('fill', (d: NodeDatum) => d.type === 'user' ? '#14b8a6' : '#3b82f6')
      .attr('clip-path', 'inset(0 0 50% 0)')

    // Node name
    nodeGs.append('text')
      .attr('x', 0)
      .attr('y', 2)
      .attr('text-anchor', 'middle')
      .attr('fill', 'white')
      .attr('font-size', '13px')
      .attr('font-weight', '600')
      .text((d: NodeDatum) => d.label.length > 14 ? d.label.substring(0, 12) + '...' : d.label)

    // Node type label
    nodeGs.append('text')
      .attr('x', 0)
      .attr('y', 18)
      .attr('text-anchor', 'middle')
      .attr('fill', 'rgba(255,255,255,0.7)')
      .attr('font-size', '10px')
      .text((d: NodeDatum) => d.type === 'user' ? 'User' : 'Alter')

    // Tooltip
    nodeGs.append('title')
      .text((d: NodeDatum) => `${d.label}\nType: ${d.type}\nClick to focus`)

    // Enable zoom and pan
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 2])
      .on('zoom', (event: d3.D3ZoomEvent<SVGSVGElement, unknown>) => {
        g.attr('transform', event.transform.toString())
      })
    
    svg.call(zoom)

    // Initial fit to view
    const svgElement = svgRef.current
    setTimeout(() => {
      try {
        const bounds = g.node()!.getBBox()
        const fullWidth = containerWidth
        const fullHeight = Math.max(600, height)
        const dx = bounds.width || 1
        const dy = bounds.height || 1
        const x = bounds.x + dx / 2
        const y = bounds.y + dy / 2
        const scale = Math.max(0.3, Math.min(1.5, 0.85 / Math.max(dx / fullWidth, dy / fullHeight)))
        const translateX = fullWidth / 2 - scale * x
        const translateY = fullHeight / 2 - scale * y
        svg.transition().duration(500).call(
          zoom.transform,
          d3.zoomIdentity.translate(translateX, translateY).scale(scale)
        )
      } catch {
        // ignore
      }
    }, 100)

    return () => {
      d3.select(svgElement).selectAll('*').remove()
    }
  }, [nodes, links, startId, selectedRelationTypes])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Family Tree</h1>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="w-4 h-4 mr-2" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
          <Button 
            variant="outline" 
            size="sm"
            onClick={loadFilterData}
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {showFilters && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Start Node & Depth Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="w-4 h-4" />
                Focus Settings
              </CardTitle>
              <CardDescription>Select the starting node and depth to explore</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="start-node">Start Node (Alter or User)</Label>
                <Combobox
                  options={startNodeOptions}
                  value={startId}
                  onValueChange={setStartId}
                  placeholder="Select starting point..."
                  searchPlaceholder="Search alters or users..."
                  emptyText="No matches found"
                  disabled={loading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="depth">Depth (1-5)</Label>
                <Input
                  id="depth"
                  type="number"
                  value={depth}
                  min={1}
                  max={5}
                  onChange={e => setDepth(Math.max(1, Math.min(5, Number(e.target.value))))}
                  className="w-24"
                />
              </div>
            </CardContent>
          </Card>

          {/* Relationship Types Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Link2 className="w-4 h-4" />
                Relationship Types
              </CardTitle>
              <CardDescription className="flex items-center justify-between">
                <span>Filter by relationship type</span>
                <span className="flex gap-2">
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectAllRelationTypes}>All</Button>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={selectNoRelationTypes}>None</Button>
                </span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {RELATIONSHIP_TYPES.map(type => (
                  <div
                    key={type.value}
                    className="flex items-center space-x-2"
                  >
                    <Checkbox
                      id={`rel-${type.value}`}
                      checked={selectedRelationTypes.has(type.value)}
                      onCheckedChange={() => toggleRelationType(type.value)}
                    />
                    <label
                      htmlFor={`rel-${type.value}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-1.5"
                    >
                      <span 
                        className="w-2.5 h-2.5 rounded-full inline-block" 
                        style={{ backgroundColor: type.color }}
                      />
                      {type.label}
                    </label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary" className="bg-[#3b82f6] text-white">
            {nodes.filter(n => n.type === 'alter').length}
          </Badge>
          Alters
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="secondary" className="bg-[#0ea5a4] text-white">
            {nodes.filter(n => n.type === 'user').length}
          </Badge>
          Users
        </span>
        <span className="flex items-center gap-1.5">
          <Badge variant="outline">
            {links.length}
          </Badge>
          Connections
        </span>
        <span className="ml-auto text-xs">
          Click a node to focus and expand depth by 1
        </span>
      </div>

      {/* Visualization */}
      <div 
        ref={wrapperRef} 
        className="rounded-lg border bg-card"
        style={{ width: '100%', minHeight: '600px' }}
      >
        {nodes.length === 0 && !loading ? (
          <div className="flex items-center justify-center h-96 text-muted-foreground">
            <div className="text-center space-y-2">
              <Users className="w-12 h-12 mx-auto opacity-50" />
              <p>No connections found with current filters</p>
              <p className="text-sm">Try selecting different relationship types or a different starting node</p>
            </div>
          </div>
        ) : (
          <svg ref={svgRef} />
        )}
      </div>

      {/* Legend */}
      {links.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Legend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-4 rounded bg-[#2563eb]" />
                <span className="text-sm">Alter</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-4 rounded bg-[#0d9488]" />
                <span className="text-sm">User</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 h-4 rounded border-2 border-[#fbbf24] bg-transparent" />
                <span className="text-sm">Focused Node</span>
              </div>
              <div className="border-l pl-4 flex flex-wrap gap-3">
                {RELATIONSHIP_TYPES.filter(t => selectedRelationTypes.has(t.value)).map(type => (
                  <div key={type.value} className="flex items-center gap-1.5">
                    <span className="w-6 h-0.5" style={{ backgroundColor: type.color }} />
                    <span className="text-xs text-muted-foreground">{type.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Parents and ancestors are shown above, children and descendants below. Click any node to focus on it.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
