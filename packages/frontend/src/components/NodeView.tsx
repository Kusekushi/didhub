import React, { useRef } from 'react';
import { Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

export interface FamilyNode {
  id: number;
  name?: string;
  partners: number[];
  children: FamilyNode[];
  duplicated?: boolean;
}

export interface NodeViewProps {
  node: FamilyNode;
  all: Record<string, any>;
  toggle: (id: number) => void;
  isCollapsed: (id: number) => boolean;
}

export default function NodeView(props: NodeViewProps) {
  const hasKids = !props.node.duplicated && props.node.children.length > 0;
  const coll = props.isCollapsed(props.node.id);
  const listRef = useRef<HTMLUListElement | null>(null);
  return (
    <li style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {hasKids && (
          <button
            onClick={() => props.toggle(props.node.id)}
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
        <RouterLink to={`/detail/${props.node.id}`}>{props.node.name || `#${props.node.id}`}</RouterLink>
        {props.node.duplicated && <Chip size="small" label="(ref)" />}
        {props.node.partners.length > 0 && (
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            Partners: {props.node.partners.map((pid) => props.all[pid]?.name || `#${pid}`).join(', ')}
          </span>
        )}
      </div>
      {!props.node.duplicated && hasKids && (
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
              props.node.children.map((c) => (
                <NodeView
                  key={`${props.node.id}-${c.id}`}
                  node={c}
                  all={props.all}
                  toggle={props.toggle}
                  isCollapsed={props.isCollapsed}
                />
              ))}
          </ul>
        </div>
      )}
    </li>
  );
}
