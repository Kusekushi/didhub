import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@mui/material';
import * as d3 from 'd3';
import { FamilyTreeResponse, FamilyTreeNodeData, FamilyTreeOwner } from '@didhub/api-client';

interface GraphLink {
  source: number;
  target: number;
  type: string;
}

interface GraphNode {
  id: number;
  name: string;
  meta: FamilyTreeNodeData | FamilyTreeOwner;
  type: 'alter' | 'user';
  isUser: boolean;
  x?: number;
  y?: number;
  fx?: number | undefined;
  fy?: number | undefined;
}

interface D3GraphLink {
  source: GraphNode | number;
  target: GraphNode | number;
  type: string;
}

export interface GraphProps {
  data: FamilyTreeResponse;
  forceLayout: boolean;
  highlight: string;
  roleColors: Record<string, string>;
  ownerColors: Record<number, string>;
  colorMode: 'role' | 'owner';
}

export default function GraphD3(props: GraphProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; text: string } | null>(null);
  const [svgHeight, setSvgHeight] = useState(600);

  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Debug logging
    console.log('Family tree data:', props.data);
    console.log(
      'User relationships in nodes:',
      Object.values(props.data.nodes).map((n) => ({
        id: n.id,
        name: n.name,
        user_partners: n.user_partners,
        user_parents: n.user_parents,
        user_children: n.user_children,
      })),
    );
    console.log('Owners:', props.data.owners);

    const width = (wrapperRef.current?.clientWidth || 900) - 16;
    const height = Math.max(600, Object.keys(props.data.nodes).length * 20); // Make height dynamic based on node count
    setSvgHeight(height);
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    // Add zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Create a group for all graph elements that will be zoomed
    const g = svg.append('g');

    // Helper function to check if user is non-system
    const isNonSystemUser = (userId: number) => {
      const user = props.data.owners?.[userId.toString()];
      return user && !user.is_system;
    };

    // Build nodes array
    const alterNodes: GraphNode[] = Object.values(props.data.nodes).map((n) => ({
      id: n.id,
      name: n.name || `#${n.id}`,
      meta: n,
      type: 'alter' as const,
      isUser: false,
    }));
    const userNodes: GraphNode[] = props.data.owners
      ? Object.values(props.data.owners)
          .filter((u) => !u.is_system) // Exclude system users
          .map((u) => ({
            id: u.id,
            name: u.username || `User ${u.id}`,
            meta: u,
            type: 'user' as const,
            isUser: true,
          }))
      : [];

    console.log('User nodes created:', userNodes);
    const nodeMeta: GraphNode[] = [...alterNodes, ...userNodes];

    const parentLinks = props.data.edges.parent.map(([p, c]) => ({ source: p, target: c, type: 'parent' }));
    const partnerLinks = props.data.edges.partner.map(([a, b]) => ({ source: a, target: b, type: 'partner' }));

    // Add user relationship links
    const userRelationshipLinks: GraphLink[] = [];
    Object.values(props.data.nodes).forEach((alter) => {
      // User partners
      (alter.user_partners || []).forEach((userId) => {
        if (isNonSystemUser(userId)) {
          userRelationshipLinks.push({ source: alter.id, target: userId, type: 'user-partner' });
        }
      });
      // User parents
      (alter.user_parents || []).forEach((userId) => {
        if (isNonSystemUser(userId)) {
          userRelationshipLinks.push({ source: userId, target: alter.id, type: 'user-parent' });
        }
      });
      // User children
      (alter.user_children || []).forEach((userId) => {
        if (isNonSystemUser(userId)) {
          userRelationshipLinks.push({ source: alter.id, target: userId, type: 'user-child' });
        }
      });
    });

    console.log('User relationship links created:', userRelationshipLinks);

    // Hierarchical layering for initial positions
    const parentsCount = new Map<number, number>();
    nodeMeta.forEach((n) => parentsCount.set(n.id, 0));

    // Count alter-to-alter parent relationships
    props.data.edges.parent.forEach(([, childId]) => {
      parentsCount.set(childId, (parentsCount.get(childId) || 0) + 1);
    });

    // Count user-parent relationships (user is parent of alter)
    Object.values(props.data.nodes).forEach((alter) => {
      (alter.user_parents || []).forEach((userId) => {
        if (isNonSystemUser(userId)) {
          parentsCount.set(alter.id, (parentsCount.get(alter.id) || 0) + 1);
        }
      });
    });

    const roots = nodeMeta.filter((n) => (parentsCount.get(n.id) || 0) === 0);

    // BFS layering
    const layers: number[][] = [];
    const visited = new Set<number>();
    const queue: Array<{ id: number; depth: number }> = roots.map((r) => ({ id: r.id, depth: 0 }));

    while (queue.length) {
      const { id, depth } = queue.shift()!;
      if (!layers[depth]) layers[depth] = [];
      if (!layers[depth].includes(id)) layers[depth].push(id);
      if (visited.has(id)) continue;
      visited.add(id);

      // Add alter children
      const alterChildren = props.data.nodes[id]?.children || [];
      alterChildren.forEach((c) => queue.push({ id: c, depth: depth + 1 }));

      // Add user children (alter is parent of user)
      const userChildren = props.data.nodes[id]?.user_children || [];
      userChildren.forEach((c) => {
        if (isNonSystemUser(c)) {
          queue.push({ id: c, depth: depth + 1 });
        }
      });
    }
    const positions = new Map<number, { x: number; y: number }>();
    layers.forEach((layer, depth) => {
      const y = 80 + depth * 140;
      layer.forEach((id, idx) => {
        const x = ((idx + 1) / (layer.length + 1)) * (width - 160) + 80;
        positions.set(id, { x, y });
      });
    });

    const nodes: GraphNode[] = nodeMeta.map((n) => ({
      ...n,
      fx: props.forceLayout ? undefined : positions.get(n.id)?.x,
      fy: props.forceLayout ? undefined : positions.get(n.id)?.y,
    }));
    const links: D3GraphLink[] = [...parentLinks, ...partnerLinks, ...userRelationshipLinks];

    let simulation: d3.Simulation<GraphNode, D3GraphLink> | null = null;
    if (props.forceLayout) {
      simulation = d3
        .forceSimulation(nodes)
        .force(
          'link',
          d3
            .forceLink<GraphNode, D3GraphLink>(links)
            .id((d) => d.id)
            .distance((l) => {
              if (l.type === 'partner') return 120;
              if (l.type.startsWith('user-')) return 100;
              return 80;
            }),
        )
        .force('charge', d3.forceManyBody().strength(-300))
        .force('center', d3.forceCenter(width / 2, height / 2))
        .force('collision', d3.forceCollide(40));
    } else {
      nodes.forEach((n) => {
        const pos = positions.get(n.id);
        if (pos) {
          n.x = pos.x;
          n.y = pos.y;
        }
      });
      // Manually resolve link endpoints to node objects so tick function can access x/y
      const idMap = new Map(nodes.map((n) => [n.id, n]));
      links.forEach((l) => {
        l.source = idMap.get(l.source as number) || l.source;
        l.target = idMap.get(l.target as number) || l.target;
      });
    }

    // Draw links
    const link = g
      .append('g')
      .attr('stroke', '#888')
      .attr('stroke-width', 1.2)
      .selectAll('line')
      .data(links)
      .enter()
      .append('line')
      .attr('stroke-dasharray', (d) => {
        if (d.type === 'partner') return '4,4';
        if (d.type.startsWith('user-')) return '2,2';
        return null;
      })
      .attr('stroke', (d) => {
        if (d.type === 'partner') return '#c050c0';
        if (d.type.startsWith('user-')) return '#50c050';
        return '#888';
      });

    // Draw nodes group
    const nodeGroup = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .enter()
      .append('g')
      .attr('cursor', 'pointer')
      .on('mousemove', function (event, d) {
        let text = `${d.name}\n`;

        if (d.isUser) {
          // User node hover info
          const userMeta = d.meta as FamilyTreeOwner;
          const userType = userMeta.is_system ? 'System' : 'User';
          text += `${userType}\n`;
        } else {
          // Alter node hover info
          const meta = d.meta as FamilyTreeNodeData;
          const rolesRaw = meta.system_roles;
          const roles = Array.isArray(rolesRaw) ? rolesRaw.join(', ') : rolesRaw || '';
          const age = meta.age || '';
          let ownerLine = '';
          if (meta.owner_user_id) {
            let labelType = 'User';
            if (
              props.data.owners &&
              props.data.owners[meta.owner_user_id] &&
              props.data.owners[meta.owner_user_id].is_system
            )
              labelType = 'System';
            const o = props.data.owners && props.data.owners[meta.owner_user_id];
            ownerLine = `${labelType}: ${o?.username || '#' + meta.owner_user_id}\n`;
          }
          text += `${ownerLine}${age ? 'Age: ' + age + '\n' : ''}${roles ? 'Roles: ' + roles : ''}`;
        }

        setHoverInfo({ x: event.offsetX + 12, y: event.offsetY + 12, text });
      })
      .on('mouseleave', () => setHoverInfo(null))
      .on('click', (_, d) => {
        if (!d.isUser) {
          window.location.href = `/detail/${d.id}`;
        }
        // User nodes don't have detail pages, so no navigation
      });

    // Determine highlight set
    const hl = props.highlight.trim().toLowerCase();
    const matchedIds = new Set<number>();
    if (hl) {
      nodes.forEach((n) => {
        if (String(n.id) === hl || n.name.toLowerCase().includes(hl)) matchedIds.add(n.id);
      });
    }

    nodeGroup
      .append('circle')
      .attr('r', (d) => (hl && matchedIds.has(d.id) ? 28 : 22))
      .attr('fill', (d) => {
        if (d.isUser) return '#ffeb3b'; // Yellow for user nodes
        const meta = d.meta as FamilyTreeNodeData;
        if (props.colorMode === 'owner') {
          const oid = meta.owner_user_id;
          return (oid && props.ownerColors[oid]) || '#888';
        } else {
          const rolesRaw = meta.system_roles;
          let role: string | undefined;
          if (Array.isArray(rolesRaw)) role = rolesRaw[0];
          else role = rolesRaw;
          if (!role) role = 'Unassigned';
          return props.roleColors[role] || '#1976d2';
        }
      })
      .attr('stroke', (d) => {
        if (d.isUser) return '#f57c00'; // Orange stroke for user nodes
        return roots.some((r) => r.id === d.id) ? '#fff' : '#104a80';
      })
      .attr('stroke-width', (d) => (hl && matchedIds.has(d.id) ? 3 : 2))
      .attr('opacity', (d) => (hl ? (matchedIds.has(d.id) ? 1 : 0.15) : 1));

    nodeGroup
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', 5)
      .attr('fill', '#fff')
      .style('font-size', '11px')
      .style('pointer-events', 'none')
      .text((d) => d.name.slice(0, 12))
      .attr('opacity', (d) => (hl ? (matchedIds.has(d.id) ? 1 : 0.3) : 1));

    function ticked() {
      link
        .attr('x1', (d) => (d.source as GraphNode).x)
        .attr('y1', (d) => (d.source as GraphNode).y)
        .attr('x2', (d) => (d.target as GraphNode).x)
        .attr('y2', (d) => (d.target as GraphNode).y);
      nodeGroup.attr('transform', (d) => `translate(${d.x},${d.y})`);
    }

    if (simulation) simulation.on('tick', ticked);
    else ticked();

    return () => {
      simulation?.stop();
    };
  }, [props.data, props.forceLayout, props.highlight, props.roleColors, props.ownerColors, props.colorMode]);

  // Export functions
  function buildLegendGroup() {
    if (!svgRef.current) return null;
    const svgEl = d3.select(svgRef.current);
    svgEl.selectAll('g.__legendExport').remove();
    const legendGroup = svgEl.select('g').append('g').attr('class', '__legendExport');
    const padding = 8;
    const lineHeight = 16;
    let items: Array<{ label: string; color: string }>;
    if (props.colorMode === 'owner') {
      items = Object.entries(props.ownerColors).map(([oidStr, color]) => {
        const o = props.data.owners && props.data.owners[oidStr];
        const kind = o?.is_system ? 'System' : 'User';
        const label = o?.username ? `${kind}: ${o.username}` : `${kind} #${oidStr}`;
        return { label, color };
      });
    } else {
      items = Object.entries(props.roleColors).map(([role, color]) => ({ label: role, color }));
    }
    items.sort((a, b) => a.label.localeCompare(b.label));
    const boxWidth = 220;
    const x = 10;
    const y = 10;
    legendGroup
      .append('rect')
      .attr('x', x)
      .attr('y', y)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('width', boxWidth)
      .attr('height', padding * 2 + items.length * lineHeight)
      .attr('fill', '#222')
      .attr('stroke', '#555');
    items.forEach((it, idx) => {
      const iy = y + padding + idx * lineHeight + 12;
      legendGroup
        .append('circle')
        .attr('cx', x + 12)
        .attr('cy', iy - 4)
        .attr('r', 6)
        .attr('fill', it.color)
        .attr('stroke', '#111');
      legendGroup
        .append('text')
        .attr('x', x + 24)
        .attr('y', iy - 2)
        .attr('fill', '#eee')
        .style('font-size', '11px')
        .text(it.label);
    });
    return legendGroup;
  }

  const exportPNG = () => {
    if (!svgRef.current) return;
    const legend = buildLegendGroup();
    const svgEl = svgRef.current;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgEl);
    const img = new Image();
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = svgEl.viewBox.baseVal.width || svgEl.clientWidth;
      canvas.height = svgEl.viewBox.baseVal.height || svgEl.clientHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((b) => {
          if (!b) return;
          const a = document.createElement('a');
          a.href = URL.createObjectURL(b);
          a.download = 'family-tree.png';
          a.click();
        });
      }
      URL.revokeObjectURL(url);
      if (legend) legend.remove();
    };
    img.src = url;
  };
  const exportSVG = () => {
    if (!svgRef.current) return;
    const legend = buildLegendGroup();
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svgRef.current);
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'family-tree.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    if (legend) legend.remove();
  };

  return (
    <div ref={wrapperRef} style={{ width: '100%', position: 'relative' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Button size="small" variant="outlined" onClick={exportPNG}>
          Download PNG
        </Button>
        <Button size="small" variant="outlined" onClick={exportSVG}>
          Download SVG
        </Button>
      </div>
      <svg
        ref={svgRef}
        style={{ width: '100%', height: svgHeight, background: '#111', border: '1px solid #444', borderRadius: 4 }}
      />
      {hoverInfo && (
        <div
          style={{
            position: 'absolute',
            left: hoverInfo.x,
            top: hoverInfo.y,
            background: '#222',
            color: '#fff',
            padding: '6px 8px',
            border: '1px solid #555',
            borderRadius: 4,
            fontSize: 12,
            pointerEvents: 'none',
            maxWidth: 220,
            whiteSpace: 'pre-line',
            fontWeight: 'normal',
          }}
        >
          {hoverInfo.text}
        </div>
      )}
    </div>
  );
}
