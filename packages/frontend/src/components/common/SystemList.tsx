import React from 'react';
import { Container, Typography, List } from '@mui/material';

import { useSystemList } from '../../shared/hooks/useSystemList';
import SystemSearch from './SystemSearch';
import SystemListItem from './SystemListItem';
import { ApiSystemSummary } from '@didhub/api-client';

export interface SystemListProps {
  title?: string;
  header?: React.ReactNode;
  primary?: (s: ApiSystemSummary) => React.ReactNode;
  secondary?: (s: ApiSystemSummary) => React.ReactNode;
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
          <SystemListItem key={s.user_id} system={s} primary={primary} secondary={secondary} />
        ))}
      </List>
    </>
  );

  if (showContainer) return <Container sx={{ mt: 4 }}>{content}</Container>;
  return content;
}
