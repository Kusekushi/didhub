import React, { useRef } from 'react';
import { Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

interface FamilyNode {
  id: number;
  name?: string;
  partners: number[];
  children: FamilyNode[];
  duplicated?: boolean;
}

interface NodeViewProps {
  node: FamilyNode;
  all: Record<string, any>;
  toggle: (id: number) => void;
  isCollapsed: (id: number) => boolean;
}

export default function NodeView({ node, all, toggle, isCollapsed }: NodeViewProps) {
  const hasKids = !node.duplicated && node.children.length > 0;
  const coll = isCollapsed(node.id);
  const listRef = useRef<HTMLUListElement | null>(null);
  return (
    <li style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hasKids && (
          <button
            onClick={() => toggle(node.id)}
            style={{
              cursor: 'pointer',
              border: '1px solid #666',
              background: '#222',
              color: '#eee',
              fontSize: 10,
              width: 20,
              height: 20,
              lineHeight: '18px',
              borderRadius: 4,
              padding: 0,
            }}
          >
            {coll ? '+' : '-'}
          </button>
        )}
        {!hasKids && <span style={{ width: 20 }} />}
        <RouterLink to={`/detail/${node.id}`}>{node.name || `#${node.id}`}</RouterLink>
        {node.duplicated && <Chip size="small" label="(ref)" />}
        {node.partners.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Partners: {node.partners.map((pid) => all[pid]?.name || `#${pid}`).join(', ')}
          </span>
        )}
      </div>
      {!node.duplicated && hasKids && (
        <div
          style={{
            marginLeft: 16,
            paddingLeft: 12,
            borderLeft: '1px solid #8884',
            overflow: 'hidden',
            transition: 'max-height 0.35s ease, opacity 0.35s',
            maxHeight: coll ? 0 : listRef.current ? listRef.current.scrollHeight : 'auto',
            opacity: coll ? 0 : 1,
          }}
        >
          <ul ref={listRef} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {!coll &&
              node.children.map((c) => (
                <NodeView key={`${node.id}-${c.id}`} node={c} all={all} toggle={toggle} isCollapsed={isCollapsed} />
              ))}
          </ul>
        </div>
      )}
    </li>
  );
}
