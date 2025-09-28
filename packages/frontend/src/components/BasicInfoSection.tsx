import React from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Alter, parseRoles, UserAlterRelationship } from '@didhub/api-client';

interface BasicInfoSectionProps {
  alter: Alter;
  partnerLinks: Array<{ name: string; id?: number | string }>;
  parentLinks: Array<{ name: string; id?: number | string }>;
  childLinks: Array<{ name: string; id?: number | string }>;
  userRelationships: UserAlterRelationship[];
}

export default function BasicInfoSection({ alter: a, partnerLinks, parentLinks, childLinks, userRelationships }: BasicInfoSectionProps) {
  // Group user relationships by type
  const userPartners = userRelationships.filter(rel => rel.relationship_type === 'partner');
  const userParents = userRelationships.filter(rel => rel.relationship_type === 'parent');
  const userChildren = userRelationships.filter(rel => rel.relationship_type === 'child');

  const renderRelationshipChips = (links: Array<{ name: string; id?: number | string }>, userRels: UserAlterRelationship[], keyPrefix: string) => {
    return links.length || userRels.length ? (
      <>
        {links.map((p, idx) =>
          p.id ? (
            <Chip
              key={`${keyPrefix}-alter-${idx}`}
              component={RouterLink}
              to={`/detail/${p.id}`}
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
    ) : '-';
  };

  return (
    <Paper sx={{ p: 2 }}>
      <Typography variant="subtitle2">Basic</Typography>
      <div>
        <strong>Age:</strong> {a.age || '-'}
      </div>
      <div>
        <strong>Gender:</strong> {a.gender || '-'}
      </div>
      <div>
        <strong>Pronouns:</strong> {a.pronouns || '-'}
      </div>
      <div>
        <strong>Birthday:</strong> {a.birthday || '-'}
      </div>
      <div>
        <strong>Sexuality:</strong> {a.sexuality || '-'}
      </div>
      <div>
        <strong>Partners:</strong>{' '}
        {renderRelationshipChips(partnerLinks, userPartners, 'partner')}
      </div>
      <div>
        <strong>Parents:</strong>{' '}
        {renderRelationshipChips(parentLinks, userParents, 'parent')}
      </div>
      <div>
        <strong>Children:</strong>{' '}
        {renderRelationshipChips(childLinks, userChildren, 'child')}
      </div>
      <div>
        <strong>Species:</strong> {a.species || '-'}
      </div>
      <div>
        <strong>Type:</strong> {a.alter_type || '-'}
      </div>
      <div>
        <strong>Roles:</strong> {parseRoles(a.system_roles).length ? parseRoles(a.system_roles).join(', ') : '-'}
      </div>
      <div>
        <strong>System host:</strong> {a.is_system_host ? 'Yes' : 'No'}
      </div>
      <div>
        <strong>Dormant/Dead:</strong> {(a as any).is_dormant ? 'Yes' : 'No'}
      </div>
      <div>
        <strong>Merged:</strong> {(a as any).is_merged ? 'Yes' : 'No'}
      </div>
    </Paper>
  );
}
