import React from 'react';
import { Container, Typography, List } from '@mui/material';

import { useSystemList } from '../hooks/useSystemList';
import SystemSearch from './SystemSearch';
import SystemListItem from './SystemListItem';

type System = any;

export interface SystemListProps {
  title?: string;
  header?: React.ReactNode;
  primary?: (s: System) => React.ReactNode;
  secondary?: (s: System) => React.ReactNode;
  showContainer?: boolean;
  showSearch?: boolean;
};

export default function SystemList(props: SystemListProps) {
  if (props.showContainer === undefined) props.showContainer = true;
  if (props.showSearch === undefined) props.showSearch = true;
  const { systems, query, setQuery, clearSearch, hasQuery } = useSystemList();

  const content = (
    <>
      {props.title ? (
        <Typography variant="h4" gutterBottom>
          {props.title}
        </Typography>
      ) : null}
      {props.header}

      {props.showSearch && (
        <SystemSearch
          query={query}
          setQuery={setQuery}
          clearSearch={clearSearch}
          hasQuery={hasQuery}
        />
      )}

      <List>
        {systems.map((s) => (
          <SystemListItem
            key={s.user_id}
            system={s}
            primary={props.primary}
            secondary={props.secondary}
          />
        ))}
      </List>
    </>
  );

  if (props.showContainer) return <Container sx={{ mt: 4 }}>{content}</Container>;
  return content;
}
