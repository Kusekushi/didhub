"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Link, useNavigate } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"
import { useApi } from "@/context/ApiContext"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"

type UserMenuProps = {
  compact?: boolean
}

export default function UserMenu({ compact = false }: UserMenuProps) {
  const { user, logout } = useAuth()
  const apiClient = useApi()
  const [open, setOpen] = useState(false)
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)
  const navigate = useNavigate()

  const loadAvatarDataUrl = useCallback(async (avatarId: string) => {
    try {
      const response = await apiClient.serveStoredFile({ path: { fileId: avatarId } })
      // API now returns a metadata object with a `url` pointing to the raw content endpoint.
      // Use that `url` as the image src so the browser can request the bytes directly.
      setAvatarDataUrl(response.data.url)
    } catch (e) {
      console.warn('Failed to load avatar:', e)
      setAvatarDataUrl(null)
    }
  }, [apiClient])

  useEffect(() => {
    if (user?.avatar) {
      loadAvatarDataUrl(user.avatar)
    } else {
      setAvatarDataUrl(null)
    }
  }, [user?.avatar, loadAvatarDataUrl])

  async function onLogout() {
    try {
      await logout()
    } finally {
      navigate("/login", { replace: true })
    }
  }

  const displayName = user?.username ?? "User"

  return (
    <div className="relative" ref={ref}>
      {compact ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setOpen((s) => !s)}
              className="inline-flex items-center justify-center rounded-md p-2 hover:bg-muted"
              aria-haspopup
              aria-expanded={open}
            >
          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium overflow-hidden">
            {user?.avatar && avatarDataUrl ? (
              <img src={avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              (displayName[0] || "U").toUpperCase()
            )}
          </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{displayName}</TooltipContent>
        </Tooltip>
      ) : (
        <button
          onClick={() => setOpen((s) => !s)}
          className="inline-flex items-center gap-2 px-3 py-1 rounded-md hover:bg-muted"
          aria-haspopup
          aria-expanded={open}
        >
          <span className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-medium overflow-hidden">
            {/* Avatar image */}
            {user?.avatar && avatarDataUrl ? (
              <img src={avatarDataUrl} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              (displayName[0] || "U").toUpperCase()
            )}
          </span>
          <span className="hidden sm:inline">{displayName}</span>
        </button>
      )}

      {open && (
        <div
          // When compact, use an explicit inline bottom style to reliably position
          // the menu above the avatar even if utility classes or layout change.
          className={compact ? "absolute right-0 w-44 rounded-md border bg-popover shadow-md z-50" : "absolute right-0 mt-2 w-44 rounded-md border bg-popover shadow-md z-50"}
          style={compact ? { bottom: "calc(100% + 0.5rem)" } : undefined}
        >
          <div className="flex flex-col py-1">
            <Link to="/profile" className="px-3 py-2 text-sm hover:bg-muted">Profile</Link>
            <button onClick={onLogout} className="text-left px-3 py-2 text-sm hover:bg-muted">Logout</button>
          </div>
        </div>
      )}
    </div>
  )
}
