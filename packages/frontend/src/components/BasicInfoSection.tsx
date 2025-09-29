import React from 'react';
import { Paper, Typography, Chip } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import { Alter, parseRoles, UserAlterRelationship } from '@didhub/api-client';

export interface BasicInfoSectionProps {
  alter: Alter;
  partnerLinks: Array<{ name: string; id?: number | string }>;
  parentLinks: Array<{ name: string; id?: number | string }>;
  childLinks: Array<{ name: string; id?: number | string }>;
  userRelationships: UserAlterRelationship[];
}

export default function BasicInfoSection(props: BasicInfoSectionProps) {
  // Group user relationships by type
  const userPartners = props.userRelationships.filter(rel => rel.relationship_type === 'partner');
  const userParents = props.userRelationships.filter(rel => rel.relationship_type === 'parent');
  const userChildren = props.userRelationships.filter(rel => rel.relationship_type === 'child');

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
        <strong>Partners:</strong>{' '}
        {renderRelationshipChips(props.partnerLinks, userPartners, 'partner')}
      </div>
      <div>
        <strong>Parents:</strong>{' '}
        {renderRelationshipChips(props.parentLinks, userParents, 'parent')}
      </div>
      <div>
        <strong>Children:</strong>{' '}
        {renderRelationshipChips(props.childLinks, userChildren, 'child')}
      </div>
      <div>
        <strong>Species:</strong> {props.alter.species || '-'}
      </div>
      <div>
        <strong>Type:</strong> {props.alter.alter_type || '-'}
      </div>
      <div>
        <strong>Roles:</strong> {parseRoles(props.alter.system_roles).length ? parseRoles(props.alter.system_roles).join(', ') : '-'}
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
