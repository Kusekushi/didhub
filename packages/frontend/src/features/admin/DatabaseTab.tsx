import React, { useState } from 'react';
import {
  Typography,
  Paper,
  Stack,
  Button,
  TextField,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Alert,
} from '@mui/material';
import { apiClient } from '@didhub/api-client';
import NotificationSnackbar, { SnackbarMessage } from '../../components/ui/NotificationSnackbar';

export default function DatabaseTab() {
  const [sql, setSql] = useState('SELECT * FROM users LIMIT 10');
  const [limit, setLimit] = useState(100);
  const [loading, setLoading] = useState(false);
  const [snack, setSnack] = useState<SnackbarMessage>({ open: false, message: '', severity: 'success' });
  const [results, setResults] = useState<{
    success: boolean;
    columns: string[];
    rows: Record<string, unknown>[];
    row_count: number;
    message?: string;
  } | null>(null);

  async function runQuery() {
    if (!sql.trim()) {
      setSnack({ open: true, message: 'Please enter a SQL query', severity: 'warning' });
      return;
    }

    try {
      setLoading(true);
      const response = await apiClient.admin.post_admin_db_query({ sql: sql.trim(), limit });
      const data = response.data as {
        success: boolean;
        columns: string[];
        rows: Record<string, unknown>[];
        row_count: number;
        message?: string;
      };
      setResults(data);
      if (!data.success && data.message) {
        setSnack({ open: true, message: data.message, severity: 'error' });
      }
    } catch (e) {
      setSnack({ open: true, message: `Query failed: ${String(e)}`, severity: 'error' });
      setResults(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Typography variant="h5" gutterBottom>
        Database Query
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Execute read-only SELECT queries against the database. Only SELECT statements are allowed.
      </Typography>
      <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
        <TextField
          label="Row limit"
          type="number"
          size="small"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value) || 100)}
          sx={{ width: 120 }}
        />
        <Button variant="contained" onClick={runQuery} disabled={loading}>
          {loading ? 'Running...' : 'Run Query'}
        </Button>
      </Stack>
      <TextField
        label="SQL Query"
        multiline
        rows={4}
        fullWidth
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        sx={{ mb: 2 }}
        placeholder="SELECT * FROM users LIMIT 10"
      />
      {results && (
        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="h6" gutterBottom>
            Results ({results.row_count} rows)
          </Typography>
          {results.message && (
            <Alert severity="info" sx={{ mb: 2 }}>
              {results.message}
            </Alert>
          )}
          {results.columns.length > 0 ? (
            <TableContainer sx={{ maxHeight: 400 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    {results.columns.map((col) => (
                      <TableCell key={col} sx={{ fontWeight: 'bold' }}>
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {results.rows.map((row, i) => (
                    <TableRow key={i}>
                      {results.columns.map((col) => (
                        <TableCell key={col}>{String(row[col] ?? '')}</TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <Typography>No results</Typography>
          )}
        </Paper>
      )}
      <NotificationSnackbar
        open={snack.open}
        message={snack.message}
        severity={snack.severity}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
