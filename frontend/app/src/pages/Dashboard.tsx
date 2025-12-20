import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useApi } from '@/context/ApiContext'
import { useNavigate } from 'react-router-dom'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Users, Settings, Shield, Calendar, ArrowRight } from 'lucide-react'
import type { Profile, User } from '@didhub/api'

export default function DashboardPage() {
  const { user } = useAuth()
  const client = useApi()
  const navigate = useNavigate()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalUsers: 0,
    systemAccounts: 0,
  })

  useEffect(() => {
    loadDashboardData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadDashboardData() {
    try {
      setLoading(true)
      // Load user profile
      const profileRes = await client.getOwnProfile()
      if (profileRes.status === 200) {
        setProfile(profileRes.data)
      }

      // Load stats - users
      const usersRes = await client.getUsers()
      if (usersRes.status === 200) {
        const users = usersRes.data.items || []
        setStats({
          totalUsers: users.length,
          systemAccounts: users.filter((u: User) => u.isSystem).length,
        })
      }
    } catch (e) {
      console.warn('Failed to load dashboard data:', e)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">Loading dashboard...</div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Welcome Section */}
      <div>
        <h1 className="text-3xl font-bold">Welcome back, {profile?.display_name || user?.username}</h1>
        <p className="text-muted-foreground mt-1">
          {profile?.about_me || 'Manage your profile and explore your network'}
        </p>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Users Card */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold">{stats.totalUsers}</div>
                <p className="text-xs text-muted-foreground mt-1">Across the network</p>
              </div>
              <Users className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* System Accounts Card */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">System Accounts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold">{stats.systemAccounts}</div>
                <p className="text-xs text-muted-foreground mt-1">Active systems</p>
              </div>
              <Shield className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>

        {/* Your Alters Card (future feature) */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Your Alters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-3xl font-bold">-</div>
                <p className="text-xs text-muted-foreground mt-1">Coming soon</p>
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Navigation Card - Users */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Users Directory
            </CardTitle>
            <CardDescription>Browse and connect with other users in the network</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/users')}
              variant="outline"
              className="w-full"
            >
              View All Users
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>

        {/* Navigation Card - Settings */}
        <Card className="hover:shadow-lg transition-shadow">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Settings & Profile
            </CardTitle>
            <CardDescription>Manage your account settings and profile information</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              onClick={() => navigate('/settings')}
              variant="outline"
              className="w-full"
            >
              Go to Settings
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity Section */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Access</CardTitle>
          <CardDescription>Frequently used features</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <button
              onClick={() => navigate('/profile')}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>View Your Profile</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate('/users')}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>Browse Users</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="w-full text-left px-4 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between"
            >
              <span>Account Settings</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
