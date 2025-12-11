import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { User, Profile } from '@didhub/api'
import { useApi } from '@/context/ApiContext'
import { useToast } from '@/context/ToastContext'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, User as UserIcon, Calendar, Shield, CheckCircle, Clock, Globe, User2, FileText } from 'lucide-react'

export default function UserIntro() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const api = useApi()
  const { show: showToast } = useToast()
  const { user: currentUser } = useAuth()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadUserData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const loadUserData = async () => {
    try {
      setLoading(true)
      
      // Fetch user basic info
      const userResponse = await api.getUserById<User>({
        path: { userId: id }
      })
      setUser(userResponse.data)

      // If this is a system user, redirect to the system view
      if (userResponse.data.isSystem) {
        navigate(`/system/${id}`)
        return
      }

      // Try to fetch profile info if the user has one
      try {
        // For now, we only show profile for current user since we don't have
        // a public profile endpoint for other users
        if (currentUser?.id === id) {
          const res = await api.getOwnProfile()
          if (res.status === 200) {
            setProfile(res.data)
            
            // Load avatar if available
            if (res.data.avatar) {
              loadAvatarUrl(res.data.avatar)
            }
          }
        }
      } catch (error) {
        // Profile might not exist or might not be accessible
        console.log('Could not load profile:', error)
      }
    } catch {
      showToast({
        title: 'Error',
        description: 'Failed to load user information',
        variant: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const loadAvatarUrl = async (avatarId: string) => {
    try {
      const res = await api.serveStoredFile({ path: { fileId: avatarId } })
      if (res.status === 200) {
        setAvatarUrl(res.data.url)
      }
    } catch (error) {
      console.warn('Failed to load avatar:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="mt-6">Loading user information...</div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
        <div className="mt-6 text-center">
          <p className="text-lg text-muted-foreground">User not found</p>
        </div>
      </div>
    )
  }

  const isOwnProfile = currentUser?.id === id

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>

      {/* Profile Header with Avatar */}
      <div className="flex items-start gap-6 mb-6">
        {/* Avatar */}
        <div className="shrink-0">
          {avatarUrl ? (
            <img 
              src={avatarUrl} 
              alt={user.displayName || user.username}
              className="w-32 h-32 rounded-full object-cover border-4 border-border"
            />
          ) : (
            <div className="w-32 h-32 rounded-full bg-muted flex items-center justify-center border-4 border-border">
              <UserIcon className="w-16 h-16 text-muted-foreground" />
            </div>
          )}
        </div>

        {/* User Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-3xl font-bold truncate">
                {user.displayName || user.username}
              </h1>
              {user.displayName && (
                <p className="text-muted-foreground text-lg">@{user.username}</p>
              )}
              
              {/* Status Badges */}
              <div className="flex flex-wrap gap-2 mt-3">
                {user.isAdmin && (
                  <Badge variant="default" className="flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Administrator
                  </Badge>
                )}
                {user.isApproved ? (
                  <Badge variant="default" className="bg-green-500 hover:bg-green-600 flex items-center gap-1">
                    <CheckCircle className="w-3 h-3" />
                    Approved
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Pending Approval
                  </Badge>
                )}
              </div>
            </div>

            {isOwnProfile && (
              <Link to="/profile">
                <Button variant="outline">Edit Profile</Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      <Separator className="mb-6" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* About Section */}
        {profile?.about_me && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5" />
                About
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-base whitespace-pre-wrap">{profile.about_me}</p>
            </CardContent>
          </Card>
        )}

        {/* Basic Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User2 className="w-5 h-5" />
              Basic Information
            </CardTitle>
            <CardDescription>User account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Username</p>
              <p className="text-base mt-1">@{user.username}</p>
            </div>
            
            {user.displayName && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Display Name</p>
                <p className="text-base mt-1">{user.displayName}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Member Since
              </p>
              <p className="text-base mt-1">{formatDate(user.createdAt)}</p>
            </div>

            {user.updatedAt && user.createdAt !== user.updatedAt && (
              <div>
                <p className="text-sm font-medium text-muted-foreground">Last Updated</p>
                <p className="text-base mt-1">{formatDate(user.updatedAt)}</p>
              </div>
            )}

            <div>
              <p className="text-sm font-medium text-muted-foreground">Account ID</p>
              <p className="text-xs font-mono mt-1 text-muted-foreground">{user.id}</p>
            </div>
          </CardContent>
        </Card>

        {/* Profile Information Card */}
        {profile && (profile.pronouns || profile.timezone || profile.bio) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User2 className="w-5 h-5" />
                Profile
              </CardTitle>
              <CardDescription>Personal information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {profile.pronouns && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pronouns</p>
                  <p className="text-base mt-1">{profile.pronouns}</p>
                </div>
              )}

              {profile.timezone && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                    <Globe className="w-4 h-4" />
                    Timezone
                  </p>
                  <p className="text-base mt-1">{profile.timezone}</p>
                </div>
              )}

              {profile.bio && (
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Bio</p>
                  <p className="text-base mt-1 whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Additional Information */}
        {!profile && isOwnProfile && (
          <Card>
            <CardHeader>
              <CardTitle>Complete Your Profile</CardTitle>
              <CardDescription>Add more information to your profile</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                You haven't set up your profile yet. Add a bio, pronouns, and timezone to help others get to know you better.
              </p>
              <Link to="/profile">
                <Button variant="outline" className="w-full">
                  Go to Profile Settings
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
