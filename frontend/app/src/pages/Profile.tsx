import { useAuth } from "@/context/AuthContext"
import { useApi } from "@/context/ApiContext"
import { useEffect, useState, ChangeEvent } from "react"
import type { Profile } from "@didhub/api"

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const client = useApi()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [aboutMe, setAboutMe] = useState("")
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)

  // System account request state
  const [systemRequestNote, setSystemRequestNote] = useState("")
  const [requestingSystem, setRequestingSystem] = useState(false)

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile() {
    try {
      const res = await client.getOwnProfile()
      if (res.status === 200) {
        setProfile(res.data)
        setDisplayName(res.data.display_name ?? "")
        setAboutMe(res.data.about_me ?? "")
        setAvatarPreview(null)
        // Load avatar data URL if avatar exists
        if (res.data.avatar) {
          loadAvatarDataUrl(res.data.avatar)
        } else {
          setAvatarDataUrl(null)
        }
      }
    } catch (e) {
      console.warn(e)
    }
  }

  async function loadAvatarDataUrl(avatarId: string) {
    try {
      const res = await client.serveStoredFile({ path: { fileId: avatarId } })
      if (res.status === 200) {
        // API now returns a metadata object with a `url` pointing to the raw content endpoint.
        // Use that `url` so the browser can fetch image bytes directly.
        setAvatarDataUrl(res.data.url)
      } else {
        setAvatarDataUrl(null)
      }
    } catch (e) {
      console.warn('Failed to load avatar:', e)
      setAvatarDataUrl(null)
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    if (!file) {
      setSelectedFile(null)
      setAvatarPreview(null)
      return
    }

    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        setAvatarPreview(result)
        // Clear served avatar URL so the preview from the selected file takes precedence
        setAvatarDataUrl(null)
      } else {
        setAvatarPreview(null)
      }
    }
    reader.onerror = () => {
      console.error('Failed to read selected file')
      setSelectedFile(null)
      setAvatarPreview(null)
    }
    reader.readAsDataURL(file)
  }

  async function uploadAvatar() {
    if (!selectedFile || !avatarPreview) return
    setLoading(true)
    try {
      const body = { filename: selectedFile.name, content: avatarPreview }
      const res = await client.setOwnAvatar({ body })
      if (res.status === 200) {
        await loadProfile()
        setSelectedFile(null)
        setAvatarPreview(null)
      } else {
        console.error('avatar upload failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function removeAvatar() {
    setLoading(true)
    try {
      const res = await client.deleteOwnAvatar()
      if (res.status === 204) {
        await loadProfile()
      } else {
        console.error('delete avatar failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function saveProfile() {
    setLoading(true)
    try {
      const body = { display_name: displayName, about_me: aboutMe }
      const res = await client.updateOwnProfile({ body })
      if (res.status === 200) {
        await loadProfile()
      } else {
        console.error('profile save failed')
      }
    } finally {
      setLoading(false)
    }
  }

  async function requestSystemAccount() {
    setRequestingSystem(true)
    try {
      await client.meRequestSystem({
        body: systemRequestNote.trim() ? { note: systemRequestNote.trim() } : undefined
      })
      alert('System account request submitted successfully!')
      setSystemRequestNote('')
    } catch (e) {
      console.error('system request failed', e)
      alert('Failed to submit system account request')
    } finally {
      setRequestingSystem(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">My Profile</h1>

      <div className="bg-card border rounded-md p-4 space-y-4">
        <div>
          <h2 className="text-sm text-muted-foreground">Username</h2>
          <div className="font-medium">{profile?.username ?? user?.username ?? '—'}</div>
        </div>

        <div>
          <h2 className="text-sm text-muted-foreground">User ID</h2>
          <div className="font-mono text-sm">{profile?.id ?? user?.id ?? '—'}</div>
        </div>

        <div>
          <h2 className="text-sm text-muted-foreground">Display name</h2>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full input" />
        </div>

        <div>
          <h2 className="text-sm text-muted-foreground">About</h2>
          <textarea value={aboutMe} onChange={(e) => setAboutMe(e.target.value)} className="w-full textarea" />
        </div>

        <div>
          <h2 className="text-sm text-muted-foreground">Avatar</h2>
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-muted overflow-hidden flex items-center justify-center">
              {avatarPreview ? (
                // preview from selected file
                <img src={avatarPreview} alt="avatar preview" className="w-full h-full object-cover" />
              ) : profile?.avatar && avatarDataUrl ? (
                <img src={avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="text-xs px-2">No avatar</div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <input type="file" accept="image/*" onChange={onFileChange} />
              <div className="flex gap-2">
                <button onClick={uploadAvatar} disabled={!selectedFile || loading} className="btn">
                  Upload
                </button>
                <button onClick={removeAvatar} disabled={loading} className="btn-ghost">
                  Remove
                </button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-sm text-muted-foreground">Account Type</h2>
          <div className="flex items-center gap-2">
            <span className={`px-2 py-1 rounded text-xs font-medium ${
              user?.isSystem 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              {user?.isSystem ? 'System Account' : 'Regular Account'}
            </span>
            {!user?.isSystem && (
              <div className="flex flex-col gap-2 mt-2">
                <textarea 
                  value={systemRequestNote} 
                  onChange={(e) => setSystemRequestNote(e.target.value)} 
                  placeholder="Optional: Explain why you want system account access..."
                  className="w-full textarea text-sm" 
                  rows={3}
                />
                <button 
                  onClick={requestSystemAccount} 
                  disabled={requestingSystem} 
                  className="px-3 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
                >
                  {requestingSystem ? 'Submitting...' : 'Request System Account'}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="pt-2 border-t flex gap-2">
          <button onClick={saveProfile} disabled={loading} className="px-3 py-2 rounded-md bg-primary text-primary-foreground">
            Save
          </button>
          <button onClick={() => logout()} className="px-3 py-2 rounded-md bg-destructive text-destructive-foreground">
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
