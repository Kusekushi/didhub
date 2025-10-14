import React, { useEffect, useState } from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import type { ApiAlter } from '../../types/ui';

function parseRoles(raw: unknown): string[] {
  if (!raw) return [];
  try {
    if (Array.isArray(raw)) return raw.map((r) => String(r));
    if (typeof raw === 'string') {
      const s = raw.trim();
      if (!s) return [];
      if (s.startsWith('[') && s.endsWith(']')) {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.map((r) => String(r));
      }
      return s.split(',').map((p) => p.trim()).filter(Boolean);
    }
    return [String(raw)];
  } catch (e) {
    return [];
  }
}
import { useAlterLinks } from '../../shared/hooks/useAlterLinks';
import { getUsersById } from '../../services/adminService';
import { ApiPersonRelationship } from '@didhub/api-client';

type AlterWithRelationships = ApiAlter & {
  user_relationships?: ApiPersonRelationship[];
  system_roles?: unknown;
  is_dormant?: boolean | null;
  is_merged?: boolean | null;
};

export interface BasicInfoSectionProps {
  alter: AlterWithRelationships;
}

export default function BasicInfoSection(props: BasicInfoSectionProps) {
  const { partnerLinks, parentLinks, childLinks } = useAlterLinks(props.alter);

  // Group user relationships by type
  const userRelationships = props.alter.user_relationships || [];
  const userPartners = userRelationships.filter((rel) => rel.type_ === 'partner');
  const userParents = userRelationships.filter((rel) => rel.type_ === 'parent');
  const userChildren = userRelationships.filter((rel) => rel.type_ === 'child');

  const UserChip: React.FC<{ rel: ApiPersonRelationship; idx: number; keyPrefix: string }> = ({ rel, idx, keyPrefix }) => {
    const userId = (rel as any).user_id;
    const initialName = (rel as any).username ?? null;
    const [username, setUsername] = useState<string | null>(initialName);

    useEffect(() => {
      if (username || !userId) return;
      let cancelled = false;

      const fetchName = async () => {
        try {
          const resp = await getUsersById(String(userId));
          if (cancelled) return;
          const name = resp?.username ?? null;
          if (name) {
            setUsername(String(name));
            return;
          }
          if (!cancelled) setUsername(`User ${userId}`);
        } catch {
          if (!cancelled) setUsername(`User ${userId}`);
        }
      };

      fetchName();

      return () => {
        cancelled = true;
      };
    }, [userId, username]);

    const label = username ?? `User ${userId ?? idx}`;
    return userId ? (
      <Chip
        key={`${keyPrefix}-user-${idx}`}
        component={RouterLink as any}
        to={`/detail/user/${userId}`}
        label={label}
        clickable
        size="small"
        sx={{ mr: 1, mb: 1, backgroundColor: 'action.selected' }}
      />
    ) : (
      <Chip
        key={`${keyPrefix}-user-${idx}`}
        label={label}
        size="small"
        sx={{ mr: 1, mb: 1, backgroundColor: 'action.selected' }}
      />
    );
  };

  const renderRelationshipChips = (
    links: Array<{ name: string; id?: number | string }>,
    userRels: ApiPersonRelationship[],
    keyPrefix: string,
  ) => {
    return links.length || userRels.length ? (
      <>
        {links.map((p, idx) =>
          p.id ? (
            <Chip
              key={`${keyPrefix}-alter-${idx}`}
              component={RouterLink}
              to={`/detail/alter/${p.id}`}
              label={p.name}
              clickable
              size="small"
              sx={{ mr: 1, mb: 1 }}
            />
          ) : (
            <Chip key={`${keyPrefix}-alter-${idx}`} label={p.name} size="small" sx={{ mr: 1, mb: 1 }} />
          ),
        )}
        {userRels.map((rel, idx) => (
          <UserChip key={`${keyPrefix}-user-${idx}`} rel={rel} idx={idx} keyPrefix={keyPrefix} />
        ))}
      </>
    ) : (
      '-'
    );
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2">Basic</Typography>
      <div>
        <strong>Age:</strong> {props.alter.age || '-'}
      </div>
      <div>
        <strong>Gender:</strong> {props.alter.gender || '-'}
      </div>
      <div>
        <strong>Pronouns:</strong> {props.alter.pronouns || '-'}
      </div>
      <div>
        <strong>Birthday:</strong> {props.alter.birthday || '-'}
      </div>
      <div>
        <strong>Sexuality:</strong> {props.alter.sexuality || '-'}
      </div>
      <div>
        <strong>Partners:</strong> {renderRelationshipChips(partnerLinks, userPartners, 'partner')}
      </div>
      <div>
        <strong>Parents:</strong> {renderRelationshipChips(parentLinks, userParents, 'parent')}
      </div>
      <div>
        <strong>Children:</strong> {renderRelationshipChips(childLinks, userChildren, 'child')}
      </div>
      <div>
        <strong>Species:</strong> {props.alter.species || '-'}
      </div>
      <div>
        <strong>Type:</strong> {props.alter.alter_type || '-'}
      </div>
      <div>
        <strong>Roles:</strong>{' '}
        {parseRoles(props.alter.system_roles).length ? parseRoles(props.alter.system_roles).join(', ') : '-'}
      </div>
      <div>
        <strong>System host:</strong> {props.alter.is_system_host ? 'Yes' : 'No'}
      </div>
      <div>
        <strong>Dormant/Dead:</strong> {(props.alter as any).is_dormant ? 'Yes' : 'No'}
      </div>
      <div>
        <strong>Merged:</strong> {(props.alter as any).is_merged ? 'Yes' : 'No'}
      </div>
    </Paper>
  );
}
