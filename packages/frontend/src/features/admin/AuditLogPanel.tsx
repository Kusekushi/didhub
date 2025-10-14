import React, { useState, useEffect } from 'react';
import {
  Typography,
  Paper,
  Stack,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Box,
} from '@mui/material';
import * as adminService from '../../services/adminService';

export interface AuditLogEntry {
  id: string;
  created_at: string;
  action: string;
  user_id?: number;
  entity_type?: string;
  entity_id?: string;
  ip?: string;
  metadata?: any;
}

export interface AuditLogPanelProps {
  reload?: number;
}

export default function AuditLogPanel(props: AuditLogPanelProps) {
  const { reload = 0 } = props;
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedMetadata, setExpandedMetadata] = useState(new Set<string>());

  // Filter state
  const [filters, setFilters] = useState({
    action: '',
    user_id: '',
    from: '',
    to: '',
  });
  const [showFilters, setShowFilters] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const parsedUserId = filters.user_id ? parseInt(filters.user_id, 10) : undefined;
      const r = await adminService.getAudit({
        action: filters.action || undefined,
        user_id: parsedUserId,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: 500,
        offset: 0,
      });
      const items = (r && (r.data ?? r)) ?? [];
      const normalized: AuditLogEntry[] = Array.isArray(items)
        ? items.map((item: any, idx: number) => ({
            id: String(item.id ?? `entry-${idx}`),
            created_at: String(item.created_at ?? ''),
            action: String(item.action ?? ''),
            user_id: item.user_id,
            entity_type: item.entity_type,
            entity_id: item.entity_id,
            ip: item.ip,
            metadata: item.metadata ?? {},
          }))
        : [];
      setRows(normalized);
    } catch (e) {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [reload]);

  const toggleMetadata = (id: string) => {
    setExpandedMetadata((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const formatMetadata = (metadata: any) => {
    if (!metadata) return 'None';
    try {
      return JSON.stringify(metadata, null, 2);
    } catch (e) {
      return String(metadata);
    }
  };

  const clearFilters = () => {
    setFilters({
      action: '',
      user_id: '',
      from: '',
      to: '',
    });
  };

  const applyFilters = () => {
    load();
  };

  return (
    <div>
      <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
        <Button onClick={load} variant="contained">
          Refresh
        </Button>
        <Button onClick={() => setShowFilters(!showFilters)} variant="outlined">
          {showFilters ? 'Hide Filters' : 'Show Filters'}
        </Button>
      </Stack>

      {showFilters && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Filter Audit Logs
          </Typography>
          <Stack direction="row" spacing={2} flexWrap="wrap" sx={{ mb: 2 }}>
            <TextField
              label="Action"
              value={filters.action}
              onChange={(e) => setFilters((prev) => ({ ...prev, action: e.target.value }))}
              size="small"
              placeholder="e.g., user.create"
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="User ID"
              value={filters.user_id}
              onChange={(e) => setFilters((prev) => ({ ...prev, user_id: e.target.value }))}
              size="small"
              type="number"
              placeholder="e.g., 123"
              sx={{ minWidth: 100 }}
            />
            <TextField
              label="From Date"
              value={filters.from}
              onChange={(e) => setFilters((prev) => ({ ...prev, from: e.target.value }))}
              size="small"
              type="datetime-local"
              sx={{ minWidth: 200 }}
              InputLabelProps={{
                shrink: true,
              }}
            />
            <TextField
              label="To Date"
              value={filters.to}
              onChange={(e) => setFilters((prev) => ({ ...prev, to: e.target.value }))}
              size="small"
              type="datetime-local"
              sx={{ minWidth: 200 }}
              InputLabelProps={{
                shrink: true,
              }}
            />
          </Stack>
          <Stack direction="row" spacing={2}>
            <Button onClick={applyFilters} variant="contained" size="small">
              Apply Filters
            </Button>
            <Button onClick={clearFilters} variant="outlined" size="small">
              Clear Filters
            </Button>
          </Stack>
        </Paper>
      )}

      {loading && <Typography>Loading...</Typography>}

      <Table size="small" sx={{ mt: 2 }}>
        <TableHead>
          <TableRow>
            <TableCell>ID</TableCell>
            <TableCell>Timestamp</TableCell>
            <TableCell>Action</TableCell>
            <TableCell>User ID</TableCell>
            <TableCell>Entity Type</TableCell>
            <TableCell>Entity ID</TableCell>
            <TableCell>IP Address</TableCell>
            <TableCell>Metadata</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} sx={{ '&:nth-of-type(odd)': { backgroundColor: 'action.hover' } }}>
              <TableCell>
                <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                  {r.id}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="caption">
                  {r.created_at ? new Date(r.created_at).toLocaleString() : 'N/A'}
                </Typography>
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ fontWeight: 'medium', color: 'primary.main' }}>
                  {r.action}
                </Typography>
              </TableCell>
              <TableCell>
                {r.user_id ? (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                    {r.user_id}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.secondary" fontStyle="italic">
                    system
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {r.entity_type ? (
                  <Typography variant="body2" sx={{ color: 'secondary.main' }}>
                    {r.entity_type}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    -
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {r.entity_id ? (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {r.entity_id}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    -
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {r.ip ? (
                  <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                    {r.ip}
                  </Typography>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    -
                  </Typography>
                )}
              </TableCell>
              <TableCell>
                {r.metadata ? (
                  <div>
                    <Button
                      size="small"
                      variant="text"
                      onClick={() => toggleMetadata(r.id)}
                      sx={{ minWidth: 'auto', px: 1, py: 0.5 }}
                    >
                      {expandedMetadata.has(r.id) ? 'Hide' : 'Show'}
                    </Button>
                    {expandedMetadata.has(r.id) && (
                      <Box
                        sx={{
                          mt: 1,
                          p: 1,
                          backgroundColor: 'grey.100',
                          borderRadius: 1,
                          border: '1px solid',
                          borderColor: 'grey.300',
                        }}
                      >
                        <pre
                          style={{
                            fontSize: '0.75rem',
                            margin: 0,
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all',
                            maxHeight: '200px',
                            overflow: 'auto',
                          }}
                        >
                          {formatMetadata(r.metadata)}
                        </pre>
                      </Box>
                    )}
                  </div>
                ) : (
                  <Typography variant="body2" color="text.disabled">
                    None
                  </Typography>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rows.length === 0 && !loading && (
        <Typography color="text.secondary" sx={{ mt: 2, textAlign: 'center' }}>
          No audit log entries found
        </Typography>
      )}

      <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
        Showing {rows.length} audit log entries
      </Typography>
    </div>
  );
}
