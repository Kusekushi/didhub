import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ArrowLeft, Shield, Eye, Trash2, RefreshCw } from 'lucide-react'
import { AuditLogEntry, PaginatedAuditLogResponse } from '@didhub/api'

export default function AdminSecurity() {
  const client = useApi()
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  // Filter state
  const [categoryFilter, setCategoryFilter] = useState('')
  const [actorFilter, setActorFilter] = useState('')

  const loadAuditLogs = async () => {
    try {
      setLoading(true)
      const response = await client.listAuditLogs() as { data: PaginatedAuditLogResponse }
      setAuditLogs(response.data.items || [])
    } catch (error) {
      console.error('Failed to load audit logs:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearAuditLogs = async () => {
    if (!window.confirm('Are you sure you want to clear all audit logs? This action cannot be undone.')) {
      return
    }

    try {
      setClearing(true)
      await client.clearAuditLogs()
      await loadAuditLogs()
    } catch (error) {
      console.error('Failed to clear audit logs:', error)
    } finally {
      setClearing(false)
    }
  }

  const filteredLogs = auditLogs.filter(log => {
    const matchesCategory = !categoryFilter || log.category.toLowerCase().includes(categoryFilter.toLowerCase())
    const matchesActor = !actorFilter || (log.actor && log.actor.toLowerCase().includes(actorFilter.toLowerCase()))
    return matchesCategory && matchesActor
  })

  // Get unique categories for filter suggestions
  const categories = [...new Set(auditLogs.map(log => log.category))]

  useEffect(() => {
    loadAuditLogs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
            <h1 className="text-3xl font-bold">Security & Audit</h1>
            <p className="text-muted-foreground mt-2">
              Monitor system activity and manage security settings
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Security Overview */}
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Security Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{auditLogs.length}</div>
                <div className="text-sm text-muted-foreground">Total Audit Events</div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Categories:</span>
                  <span className="font-medium">{categories.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Recent Activity:</span>
                  <span className="font-medium">
                    {auditLogs.filter(log => {
                      const logDate = new Date(log.createdAt)
                      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
                      return logDate > oneDayAgo
                    }).length}
                  </span>
                </div>
              </div>

              <Button
                variant="destructive"
                onClick={clearAuditLogs}
                disabled={clearing}
                className="w-full"
              >
                {clearing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Clearing...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear All Logs
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Audit Logs */}
        <div className="lg:col-span-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Audit Logs
              </CardTitle>
              <CardDescription>
                System activity and security events
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-4 mb-4">
                <div className="flex-1">
                  <Label htmlFor="categoryFilter">Filter by Category</Label>
                  <Input
                    id="categoryFilter"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    placeholder="e.g., auth, user, admin"
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="actorFilter">Filter by Actor</Label>
                  <Input
                    id="actorFilter"
                    value={actorFilter}
                    onChange={(e) => setActorFilter(e.target.value)}
                    placeholder="Username or ID"
                  />
                </div>
                <div className="flex items-end">
                  <Button variant="outline" onClick={loadAuditLogs} disabled={loading}>
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                  </Button>
                </div>
              </div>

              {/* Category suggestions */}
              {categories.length > 0 && (
                <div className="mb-4">
                  <Label className="text-sm text-muted-foreground">Available categories:</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {categories.slice(0, 10).map(category => (
                      <button
                        key={category}
                        onClick={() => setCategoryFilter(category)}
                        className="text-xs px-2 py-1 bg-gray-100 hover:bg-gray-200 rounded"
                      >
                        {category}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Logs Table */}
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Actor</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto" />
                          <div className="mt-2 text-muted-foreground">Loading audit logs...</div>
                        </TableCell>
                      </TableRow>
                    ) : filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          {auditLogs.length === 0 ? 'No audit logs found' : 'No logs match the current filters'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-xs">
                            {new Date(log.createdAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {log.category}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">
                            {log.actor || <span className="text-muted-foreground">System</span>}
                          </TableCell>
                          <TableCell className="max-w-md">
                            <div className="truncate" title={log.message}>
                              {log.message}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {filteredLogs.length > 0 && (
                <div className="mt-4 text-sm text-muted-foreground">
                  Showing {filteredLogs.length} of {auditLogs.length} audit log entries
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}