import React from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { Container, Typography, List, Button, ListItem, ListItemAvatar, ListItemText, Avatar } from '@mui/material';

import { useSystemList } from '../../shared/hooks/useSystemList';
import SystemSearch from './SystemSearch';
import { ApiUser } from '@didhub/api-client';

export interface SystemListProps {
  title?: string;
  header?: React.ReactNode;
  primary?: (s: ApiUser) => React.ReactNode;
  secondary?: (s: ApiUser) => React.ReactNode;
  showContainer?: boolean;
  showSearch?: boolean;
}

export default function SystemList(props: SystemListProps) {
  const { title, header, primary, secondary, showContainer = true, showSearch = true } = props;
  const { systems, query, setQuery, clearSearch, hasQuery } = useSystemList();

  const content = (
    <>
      {title ? (
        <Typography variant="h4" gutterBottom>
          {title}
        </Typography>
      ) : null}
      {header}

      {showSearch && <SystemSearch query={query} setQuery={setQuery} clearSearch={clearSearch} hasQuery={hasQuery} />}

      <List>
        {systems.map((s) => (
          <ListItem
            secondaryAction={
              <Button component={RouterLink} to={`/did-system/${s.id}`}>
                View
              </Button>
            }
          >
            <ListItemAvatar>
              {typeof s.avatar === 'string' && s.avatar ? (
                <Avatar src={`/uploads/${s.avatar}`} />
              ) : (
                <Avatar>
                  {String((s.username || '').toString())
                    .charAt(0)
                    .toUpperCase()}
                </Avatar>
              )}
            </ListItemAvatar>
            <ListItemText
              primary={primary ? primary(s) : s.username}
            // TODO: Secondary
            />
          </ListItem>
        ))}
      </List>
    </>
  );

  if (showContainer) return <Container sx={{ mt: 4 }}>{content}</Container>;
  return content;
}
