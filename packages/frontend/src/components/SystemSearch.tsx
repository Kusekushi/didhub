import React from 'react';
import {
  Box,
  TextField,
  InputAdornment,
  IconButton,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import ClearIcon from '@mui/icons-material/Clear';

interface SystemSearchProps {
  query: string;
  setQuery: (query: string) => void;
  clearSearch: () => void;
  hasQuery: boolean;
}

/**
 * Search bar component for filtering systems
 */
export default function SystemSearch({
  query,
  setQuery,
  clearSearch,
  hasQuery,
}: SystemSearchProps) {
  return (
    <Box sx={{ mb: 2, maxWidth: 520 }}>
      <TextField
        fullWidth
        label="Filter systems"
        placeholder="Search by username or id"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        variant="outlined"
        size="small"
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
          endAdornment: hasQuery ? (
            <InputAdornment position="end">
              <IconButton
                size="small"
                onClick={clearSearch}
                aria-label="clear search"
              >
                <ClearIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ) : null,
        }}
      />
    </Box>
  );
}