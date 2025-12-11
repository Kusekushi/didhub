import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Database, Play, RefreshCw, AlertCircle } from 'lucide-react'
import { DatabaseQueryRequest, DatabaseQueryResponse } from '@didhub/api'

export default function AdminDatabase() {
  const client = useApi()
  const [loading, setLoading] = useState(false)
  const [queryResult, setQueryResult] = useState<DatabaseQueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Query form state
  const [table, setTable] = useState('')
  const [limit, setLimit] = useState(50)
  const [offset, setOffset] = useState(0)

  // Available tables (we'll populate this with common tables)
  const availableTables = [
    'users',
    'alters',
    'systems',
    'affiliations',
    'subsystems',
    'uploads',
    'audit_logs',
    'job_runs'
  ]

  const runQuery = async () => {
    if (!table.trim()) {
      setError('Please select a table')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const request: DatabaseQueryRequest = {
        table: table.trim(),
        limit: limit > 0 ? limit : undefined,
        offset: offset >= 0 ? offset : undefined
      }

      const response = await client.runDatabaseQuery({
        body: request
      })

      setQueryResult(response.data)
    } catch (error) {
      console.error('Failed to run database query:', error)
      setError(error instanceof Error ? error.message : 'Failed to run query')
    } finally {
      setLoading(false)
    }
  }

  const clearResults = () => {
    setQueryResult(null)
    setError(null)
  }

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <div className="flex items-center gap-4 mb-4">
          <Link to="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin Panel
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Database Tools</h1>
            <p className="text-muted-foreground mt-2">
              Query database tables and view system information
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Query Form */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Query Builder
              </CardTitle>
              <CardDescription>
                Select a table and run queries to view data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="table">Table</Label>
                <select
                  id="table"
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="">Select a table</option>
                  {availableTables.map((tableName) => (
                    <option key={tableName} value={tableName}>
                      {tableName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label htmlFor="limit">Limit</Label>
                <Input
                  id="limit"
                  type="number"
                  value={limit}
                  onChange={(e) => setLimit(parseInt(e.target.value) || 50)}
                  min="1"
                  max="1000"
                />
              </div>

              <div>
                <Label htmlFor="offset">Offset</Label>
                <Input
                  id="offset"
                  type="number"
                  value={offset}
                  onChange={(e) => setOffset(parseInt(e.target.value) || 0)}
                  min="0"
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={runQuery} disabled={loading} className="flex-1">
                  {loading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Running...
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Run Query
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={clearResults}>
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Query Results</CardTitle>
              <CardDescription>
                {queryResult ? `Found ${queryResult.rows.length} rows` : 'Run a query to see results'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="mb-4 p-4 border border-red-200 rounded-md bg-red-50">
                  <div className="flex items-center gap-2 text-red-800">
                    <AlertCircle className="h-4 w-4" />
                    <span className="font-medium">Error</span>
                  </div>
                  <p className="text-red-700 mt-1">{error}</p>
                </div>
              )}

              {queryResult && queryResult.columns.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {queryResult.columns.map((column, index) => (
                          <TableHead key={index} className="font-mono text-xs">
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {queryResult.rows.map((row, rowIndex) => (
                        <TableRow key={rowIndex}>
                        {queryResult.columns.map((column, colIndex) => (
                          <TableCell key={colIndex} className="font-mono text-xs max-w-xs truncate">
                            {String((row as Record<string, string | number | boolean | null>)[column] || '')}
                          </TableCell>
                        ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : queryResult ? (
                <div className="text-center py-8 text-muted-foreground">
                  No data found in the selected table
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  Select a table and run a query to view results
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}