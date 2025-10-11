import React from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { parseRoles, type ApiAlter, type UserAlterRelationship } from '@didhub/api-client';
import { useAlterLinks } from '../../shared/hooks/useAlterLinks';

type AlterWithRelationships = ApiAlter & {
  user_relationships?: UserAlterRelationship[];
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
  const userPartners = userRelationships.filter((rel) => rel.relationship_type === 'partner');
  const userParents = userRelationships.filter((rel) => rel.relationship_type === 'parent');
  const userChildren = userRelationships.filter((rel) => rel.relationship_type === 'child');

  const renderRelationshipChips = (
    links: Array<{ name: string; id?: number | string }>,
    userRels: UserAlterRelationship[],
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
          <Chip
            key={`${keyPrefix}-user-${idx}`}
            label={rel.username || `User ${rel.user_id}`}
            size="small"
            sx={{ mr: 1, mb: 1, backgroundColor: 'action.selected' }}
          />
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
