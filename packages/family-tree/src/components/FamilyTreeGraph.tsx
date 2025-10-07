import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import * as d3 from 'd3';
import { CenterFocusStrongIcon, ZoomInIcon, ZoomOutIcon } from '../icons';
import type { FamilyTreeNodeData, FamilyTreeOwner } from '../types';
import { ensureHexColor, getReadableTextColor } from '../utils/color';
import { collectBaseGraph, pruneIsolatedNodes } from './graph/buildGraph';
import { layoutGraph } from './graph/layout';
import { DEFAULT_GRAPH_THEME, resolveGraphTheme } from './graph/theme';
import type { FamilyTreeGraphProps, GraphEdge, GraphNode } from './graph/types';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 1.8;
const ZOOM_STEP = 0.2;

interface ZoomControls {
  svgRef: MutableRefObject<SVGSVGElement | null>;
  groupRef: MutableRefObject<SVGGElement | null>;
  zoomLevel: number;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

function useGraphZoom(width: number, height: number): ZoomControls {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const groupRef = useRef<SVGGElement | null>(null);
  const behaviorRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity);
  const [zoomLevel, setZoomLevel] = useState(1);

  useEffect(() => {
    const svgEl = svgRef.current;
    const groupEl = groupRef.current;
    if (!svgEl || !groupEl) return undefined;

    const svgSelection = d3.select(svgEl);
    const groupSelection = d3.select(groupEl);
    transformRef.current = d3.zoomIdentity;
    setZoomLevel(1);
    groupSelection.attr('transform', transformRef.current.toString());

    const behavior = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([ZOOM_MIN, ZOOM_MAX])
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        setZoomLevel(event.transform.k);
        groupSelection.attr('transform', event.transform.toString());
      });

    behaviorRef.current = behavior;
    svgSelection.on('.zoom', null);
    svgSelection.call(behavior);
    svgSelection.call(behavior.transform, transformRef.current);

    return () => {
      svgSelection.on('.zoom', null);
    };
  }, [width, height]);

  const zoomBy = useCallback((scale: number) => {
    const svgEl = svgRef.current;
    const behavior = behaviorRef.current;
    if (!svgEl || !behavior) return;
    d3.select(svgEl).transition().duration(120).call(behavior.scaleBy, scale);
  }, []);

  const zoomIn = useCallback(() => zoomBy(1 + ZOOM_STEP), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(1 / (1 + ZOOM_STEP)), [zoomBy]);

  const reset = useCallback(() => {
    const svgEl = svgRef.current;
    const behavior = behaviorRef.current;
    if (!svgEl || !behavior) return;
    transformRef.current = d3.zoomIdentity;
    d3
      .select(svgEl)
      .transition()
      .duration(160)
      .call(behavior.transform, transformRef.current);
  }, []);

  return { svgRef, groupRef, zoomLevel, zoomIn, zoomOut, reset };
}

function buildHighlightSet(term: string, edges: GraphEdge[], nodes: GraphNode[]): Set<number> {
  const query = term.trim().toLowerCase();
  if (!query) return new Set<number>();

  const matches = new Set<number>();
  nodes.forEach((node) => {
    if (String(node.id) === query || node.label.toLowerCase().includes(query)) {
      matches.add(node.id);
    }
  });

  edges.forEach((edge) => {
    if (matches.has(edge.source) || matches.has(edge.target)) {
      matches.add(edge.source);
      matches.add(edge.target);
    }
  });

  return matches;
}

export default function FamilyTreeGraph({
  data,
  highlight,
  roleColors,
  ownerColors,
  colorMode,
  layoutMode,
  excludeIsolated,
  graphTheme,
  onOpenAlter,
}: FamilyTreeGraphProps) {
  const baseGraph = useMemo(() => {
    const raw = collectBaseGraph(data);
    return excludeIsolated ? pruneIsolatedNodes(raw) : raw;
  }, [data, excludeIsolated]);

  const layout = useMemo(
    () => layoutGraph(baseGraph, layoutMode, colorMode, roleColors, ownerColors),
    [baseGraph, layoutMode, colorMode, roleColors, ownerColors],
  );

  const theme = useMemo(() => resolveGraphTheme(graphTheme), [graphTheme]);
  const zoom = useGraphZoom(layout.width, layout.height);

  const highlightTerm = highlight.trim();
  const highlightedIds = useMemo(
    () => buildHighlightSet(highlightTerm, layout.edges, layout.nodes),
    [highlightTerm, layout.edges, layout.nodes],
  );
  const highlightActive = highlightTerm.length > 0;

  return (
    <Stack spacing={1} sx={{ minWidth: 320 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2" sx={{ opacity: 0.7 }}>
          {layoutMode === 'group' ? 'Grouped by color mode' : 'Hierarchical view'}
        </Typography>
        <Stack direction="row" spacing={1}>
          <Tooltip title="Zoom out">
            <span>
              <IconButton size="small" onClick={zoom.zoomOut} disabled={zoom.zoomLevel <= ZOOM_MIN + 0.05}>
                <ZoomOutIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Reset zoom">
            <IconButton size="small" onClick={zoom.reset}>
              <CenterFocusStrongIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title="Zoom in">
            <span>
              <IconButton size="small" onClick={zoom.zoomIn} disabled={zoom.zoomLevel >= ZOOM_MAX - 0.05}>
                <ZoomInIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>
      </Stack>

      <Box
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          backgroundColor: theme.backgroundColor,
          minHeight: 480,
          maxHeight: '70vh',
          overflow: 'auto',
          p: 2,
        }}
      >
        <svg ref={zoom.svgRef} width={layout.width} height={layout.height}>
          <g ref={zoom.groupRef}>
            {layout.groups?.map((group) => (
              <g key={group.key}>
                <text
                  x={group.x}
                  y={group.y}
                  textAnchor="middle"
                  fill={group.color ? getReadableTextColor(group.color) : '#9fa6b2'}
                  style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.2 }}
                >
                  {group.title}
                </text>
                {group.color && (
                  <rect
                    x={group.x - 28}
                    y={group.y + 4}
                    width={56}
                    height={4}
                    fill={ensureHexColor(group.color)}
                    rx={2}
                    opacity={0.6}
                  />
                )}
              </g>
            ))}

            <g>
              {layout.edges.map((edge) => {
                const highlighted =
                  !highlightActive || highlightedIds.has(edge.source) || highlightedIds.has(edge.target);
                const appearance = theme.edges[edge.kind] ?? DEFAULT_GRAPH_THEME.edges[edge.kind];
                const stroke = ensureHexColor(appearance.color, '#ffffff');
                const baseWidth = appearance.width ?? 2;
                const strokeWidth = highlighted ? baseWidth : Math.max(baseWidth * 0.7, 0.85);
                const baseOpacity = appearance.opacity ?? 0.85;
                const opacity = highlighted ? baseOpacity : Math.max(baseOpacity * 0.25, 0.1);
                const dashArray = appearance.dash && appearance.dash.trim().length ? appearance.dash : undefined;

                if (edge.points && edge.points.length > 1) {
                  const path = edge.points
                    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
                    .join(' ');
                  return (
                    <path
                      key={edge.id}
                      d={path}
                      fill="none"
                      stroke={stroke}
                      strokeWidth={strokeWidth}
                      strokeDasharray={dashArray ?? undefined}
                      strokeLinecap="round"
                      opacity={opacity}
                    />
                  );
                }

                return (
                  <line
                    key={edge.id}
                    x1={edge.sourcePoint.x}
                    y1={edge.sourcePoint.y}
                    x2={edge.targetPoint.x}
                    y2={edge.targetPoint.y}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    strokeDasharray={dashArray ?? undefined}
                    strokeLinecap="round"
                    opacity={opacity}
                  />
                );
              })}
            </g>

            <g>
              {layout.nodes.map((node) => {
                const isHighlighted = highlightedIds.has(node.id);
                const opacity = !highlightActive ? 1 : isHighlighted ? 1 : 0.25;
                const ownerColor = node.ownerId != null ? ownerColors[node.ownerId] : undefined;
                const roleColor = roleColors[node.roles[0] || 'Unassigned'];
                const colorSource = node.type === 'user' ? '#ffe082' : colorMode === 'owner' ? ownerColor : roleColor;
                const fill = ensureHexColor(colorSource, node.type === 'user' ? '#ffd54f' : '#607d8b');
                const textColor = getReadableTextColor(fill);
                const borderColor = isHighlighted
                  ? theme.node.highlightBorder
                  : node.type === 'user'
                  ? theme.node.userBorder
                  : theme.node.alterBorder;
                const displayName = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
                const primaryInfo = (() => {
                  if (node.type === 'user') return 'Linked user';
                  if (colorMode === 'owner') return node.ownerLabel || 'No owner';
                  return node.roles[0] || 'Unassigned';
                })();
                const secondaryInfo = (() => {
                  if (node.type === 'user') {
                    const meta = node.meta as FamilyTreeOwner;
                    return meta.is_system ? 'System account' : `#${node.id}`;
                  }
                  const meta = node.meta as FamilyTreeNodeData;
                  if (meta.age) return `Age ${meta.age}`;
                  return `#${node.id}`;
                })();
                const tooltipLines: string[] = [node.label, `ID #${node.id}`];
                if (node.type === 'user') {
                  const meta = node.meta as FamilyTreeOwner;
                  tooltipLines.push(meta.is_system ? 'System account' : 'Linked account');
                } else {
                  const meta = node.meta as FamilyTreeNodeData;
                  if (meta.age) tooltipLines.push(`Age: ${meta.age}`);
                  if (node.ownerLabel) tooltipLines.push(node.ownerLabel);
                  if (node.roles.length) tooltipLines.push(`Roles: ${node.roles.join(', ')}`);
                }

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x}, ${node.y})`}
                    style={{ cursor: node.type === 'alter' ? 'pointer' : 'default' }}
                    onClick={() => {
                      if (node.type === 'alter' && onOpenAlter) onOpenAlter(node.id);
                    }}
                  >
                    <rect
                      x={-90}
                      y={-36}
                      width={180}
                      height={72}
                      rx={18}
                      fill={fill}
                      stroke={borderColor}
                      strokeWidth={isHighlighted ? 3 : 1.4}
                      opacity={opacity}
                    />
                    <text
                      textAnchor="middle"
                      fill={textColor}
                      style={{ fontSize: 13, fontWeight: 600 }}
                      pointerEvents="none"
                    >
                      <tspan x={0} y={-10} fontWeight={600}>
                        {displayName}
                      </tspan>
                      <tspan x={0} y={6} fontSize={12} opacity={0.85}>
                        {primaryInfo}
                      </tspan>
                      <tspan x={0} y={22} fontSize={11} opacity={0.7}>
                        {secondaryInfo}
                      </tspan>
                    </text>
                    <title>{tooltipLines.join('\n')}</title>
                  </g>
                );
              })}
            </g>
          </g>
        </svg>
      </Box>
    </Stack>
  );
}