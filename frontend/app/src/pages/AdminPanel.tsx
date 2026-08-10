import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Settings, Users, Database, Shield, Activity, UserCheck, AlertCircle, RefreshCw, Download } from 'lucide-react'
import { AdminOverviewResponse } from '@didhub/api'

export default function AdminPanel() {
  const client = useApi()
  const [overview, setOverview] = useState<AdminOverviewResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const loadOverview = async () => {
    try {
      setLoading(true)
      const response = await client.getAdminOverview() as { data: AdminOverviewResponse }
      setOverview(response.data)
    } catch (error) {
      console.error('Failed to load admin overview:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadOverview()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="container mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground mt-2">
          Manage system settings and administrative functions
        </p>
      </div>

      {/* Overview Stats */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">System Overview</h2>
          <Button
            onClick={loadOverview}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending System Requests</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '...' : overview?.pendingSystemRequests || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Users requesting system account approval
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unapproved Users</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {loading ? '...' : overview?.unapprovedUsers || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                Users awaiting approval to access the system
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Instance Settings
            </CardTitle>
            <CardDescription>
              Configure global system settings and preferences
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/settings">Manage Settings</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              User Management
            </CardTitle>
            <CardDescription>
              View and manage user accounts and permissions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/users">Manage Users</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              System Requests
            </CardTitle>
            <CardDescription>
              Review and approve system account requests
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/system-requests">Review Requests</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database
            </CardTitle>
            <CardDescription>
              Run database queries and view system information
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/database">Database Tools</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Security
            </CardTitle>
            <CardDescription>
              Security settings and audit logs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/security">Security Panel</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Jobs
            </CardTitle>
            <CardDescription>
              Monitor and manage background jobs and tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/jobs">Job Management</Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              System Updates
            </CardTitle>
            <CardDescription>
              Check for and install system updates
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/admin/updates">Check Updates</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
