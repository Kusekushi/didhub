"use client"

import { useEffect, useRef, useState } from "react"
import { Outlet, Link } from "react-router-dom"
import { useAuth } from "@/context/AuthContext"

import {
    SidebarProvider,
    Sidebar,
    SidebarContent,
    SidebarHeader,
    SidebarFooter,
    SidebarInset,
    SidebarMenu,
    SidebarMenuItem,
    SidebarMenuButton,
    SidebarTrigger,
    useSidebar,
} from "@/components/ui/sidebar"
import { NavigationMenu } from "@/components/ui/navigation-menu"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"
import UserMenu from "@/components/ui/user-menu"
import { Home, Settings, ChevronLeft, Users, Network, Shield, Trees, Calendar } from "lucide-react"

export default function AppLayout() {
    const auth = useAuth()
    const draggingRef = useRef(false)

    // Read persisted collapsed state from localStorage synchronously (client-only)
    let defaultOpen = true
    try {
        const saved = localStorage.getItem("sidebar_collapsed")
        if (saved === "true") defaultOpen = false
    } catch { /* ignore localStorage errors */ }

    // Persist sidebar open/collapsed state
    function SidebarStatePersistor() {
        const { open } = useSidebar()
        useEffect(() => {
            try {
                localStorage.setItem("sidebar_collapsed", (!open).toString())
            } catch { /* ignore localStorage errors */ }
        }, [open])
        return null
    }

    function SidebarToggleButton() {
        const { open, toggleSidebar } = useSidebar()
        const [leftPx, setLeftPx] = useState<number | null>(null)

        useEffect(() => {
            function updateLeft() {
                // Defer measurement to the next paint frames so layout transitions
                // (collapse/expand) have applied their transforms/widths.
                const measure = () => {
                    // Use the current open state to pick which CSS token represents the
                    // visible rail width. Prefer the sidebar wrapper since the provider
                    // sets the CSS variables there.
                    const wrapper = document.querySelector('[data-slot="sidebar-wrapper"]') as HTMLElement | null
                    const varName = open ? "--sidebar-width" : "--sidebar-width-icon"
                    const computed = wrapper
                        ? getComputedStyle(wrapper).getPropertyValue(varName)
                        : getComputedStyle(document.documentElement).getPropertyValue(varName)

                    let px: number | null = null
                    if (computed && computed.endsWith("px")) {
                        px = parseInt(computed.replace("px", ""), 10)
                    } else if (computed && computed.endsWith("rem")) {
                        const rem = parseFloat(computed.replace("rem", ""))
                        const rootFont = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
                        px = Math.round(rem * rootFont)
                    } else if (computed) {
                        const n = parseFloat(computed)
                        if (!Number.isNaN(n)) px = Math.round(n)
                    }

                    // If CSS variable wasn't set/resolvable, fallback to measuring DOM
                    // elements (container or gap). Measuring after RAF ensures we see
                    // the post-transition geometry.
                    if (px === null) {
                        const el = document.querySelector('[data-slot="sidebar-container"]') as HTMLElement | null
                        const gap = document.querySelector('[data-slot="sidebar-gap"]') as HTMLElement | null
                        let rect: DOMRect | null = null
                        if (el) rect = el.getBoundingClientRect()
                        if ((!rect || rect.width === 0) && gap) rect = gap.getBoundingClientRect()
                        if (rect) px = Math.round(rect.right)
                    }

                    if (px !== null) {
                        // Position the button slightly inside the sidebar's right edge.
                        setLeftPx(px - 12)
                    }
                }

                // run measurement on the next two animation frames to allow transitions
                // and layout updates to complete.
                requestAnimationFrame(() => requestAnimationFrame(measure))
            }

            updateLeft()
            // update when window resizes or when sidebar toggles
            window.addEventListener("resize", updateLeft)
            return () => window.removeEventListener("resize", updateLeft)
        }, [open])

        // Use fixed positioning so left is relative to the viewport and animates reliably
        return (
            <div
                className="hidden md:flex items-center justify-center fixed z-40 top-4 transition-[left] duration-200 ease-in-out"
                style={leftPx ? { left: `${leftPx}px` } : undefined}
            >
                <button
                    aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
                    onClick={() => toggleSidebar()}
                    className="p-1 rounded-full bg-popover border hover:bg-muted"
                >
                    {/* single icon that rotates when toggled to animate smoothly */}
                    <ChevronLeft className={`size-4 transform transition-transform duration-200 ease-in-out ${open ? "rotate-0" : "-rotate-180"}`} />
                </button>
            </div>
        )
    }

    function FooterUser() {
        const { open } = useSidebar()
        return open ? <UserMenu /> : <UserMenu compact />
    }

    function FooterActions() {
        const { open } = useSidebar()
        // When open: keep theme toggler on left and user on right.
        // When collapsed: show compact user avatar and overlay the theme toggler on top of it.
        if (open) {
            return (
                <div className="flex items-center justify-between">
                    <AnimatedThemeToggler className="p-2 rounded-md hover:bg-muted" />
                    <div className="hidden md:block">
                        <FooterUser />
                    </div>
                </div>
            )
        }

        return (
            <div className="flex items-center justify-center">
                <div className="relative">
                    {/* overlay toggler (smaller) positioned over avatar */}
                    <AnimatedThemeToggler className="p-1 rounded-full bg-popover shadow-sm" />
                    {/* compact avatar */}
                    <FooterUser />
                </div>
            </div>
        )
    }

    function SidebarBrand() {
        const { open } = useSidebar()
        return (
            <Link to="/" className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-md bg-linear-to-br from-primary to-accent flex items-center justify-center text-primary-foreground font-bold">
                    D
                </div>
                {open ? (
                    // show text when sidebar is expanded; keep the md:hidden/md:inline behavior for small screens
                    <span className="hidden md:inline-block font-semibold">DIDHub</span>
                ) : (
                    // when collapsed only render a screen-reader-only label so the logo remains accessible
                    <span className="sr-only">DIDHub</span>
                )}
            </Link>
        )
    }

    useEffect(() => {
        // Apply saved width (in px) from localStorage if present
        const saved = localStorage.getItem("sidebar_width_px")
        if (saved) {
            try {
                const px = parseInt(saved, 10)
                if (!Number.isNaN(px)) {
                    document.documentElement.style.setProperty("--sidebar-width", px + "px")
                }
            } catch { /* ignore localStorage/parsing errors */ }
        }

        function onMove(e: MouseEvent) {
            if (!draggingRef.current) return
            const x = e.clientX
            // compute clamped width
            const min = 180
            const max = 520
            const newWidth = Math.max(min, Math.min(max, x))
            document.documentElement.style.setProperty("--sidebar-width", newWidth + "px")
        }

        function onUp() {
            if (!draggingRef.current) return
            draggingRef.current = false
            // persist
            const computed = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width") || "16rem"
            // try to extract px value
            if (computed.endsWith("px")) {
                localStorage.setItem("sidebar_width_px", computed.replace("px", ""))
            }
            window.removeEventListener("mousemove", onMove)
            window.removeEventListener("mouseup", onUp)
        }

        window.addEventListener("mouseup", onUp)
        return () => {
            window.removeEventListener("mouseup", onUp)
        }
    }, [])

    return (
        <SidebarProvider defaultOpen={defaultOpen}>
            <div className="min-h-screen flex bg-background text-foreground">
                {/* Sidebar (left) */}
                <Sidebar side="left" variant="sidebar" collapsible="icon" className="max-w-(--sidebar-width)">
                    <SidebarContent>
                        <SidebarHeader className="flex items-center justify-between px-3">
                            <SidebarBrand />
                            <div className="md:hidden">
                                <SidebarTrigger />
                            </div>
                        </SidebarHeader>

                        <nav className="px-2">
                            <SidebarMenu>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/" className="flex items-center gap-2">
                                            <Home className="size-4 text-sidebar-foreground/80" />
                                            <span>Dashboard</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/users" className="flex items-center gap-2">
                                            <Users className="size-4 text-sidebar-foreground/80" />
                                            <span>Users</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/system" className="flex items-center gap-2">
                                            <Network className="size-4 text-sidebar-foreground/80" />
                                            <span>DID System</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/family-tree" className="flex items-center gap-2">
                                            <Trees className="size-4 text-sidebar-foreground/80" />
                                            <span>Family Tree</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/birthdays" className="flex items-center gap-2">
                                            <Calendar className="size-4 text-sidebar-foreground/80" />
                                            <span>Birthdays</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                <SidebarMenuItem>
                                    <SidebarMenuButton asChild>
                                        <Link to="/settings" className="flex items-center gap-2">
                                            <Settings className="size-4 text-sidebar-foreground/80" />
                                            <span>Settings</span>
                                        </Link>
                                    </SidebarMenuButton>
                                </SidebarMenuItem>
                                {auth.isAdmin && (
                                    <SidebarMenuItem>
                                        <SidebarMenuButton asChild>
                                            <Link to="/admin" className="flex items-center gap-2">
                                                <Shield className="size-4 text-sidebar-foreground/80" />
                                                <span>Admin</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )}
                            </SidebarMenu>
                        </nav>

                        <div className="flex-1" />

                        <SidebarFooter className="px-3">
                            <FooterActions />
                        </SidebarFooter>
                    </SidebarContent>
                </Sidebar>

                {/* Persist sidebar open state and render toggle button */}
                <SidebarStatePersistor />
                <SidebarToggleButton />

                {/* Resizer handle for desktop: very small vertical bar positioned at sidebar edge */}
                <div
                    className="hidden md:block absolute left-(--sidebar-width) top-0 z-20 h-full w-1 cursor-col-resize"
                    onMouseDown={() => {
                        draggingRef.current = true
                        // attach move listener
                        const onMove = (ev: MouseEvent) => {
                            if (!draggingRef.current) return
                            const x = ev.clientX
                            const min = 180
                            const max = 520
                            const newWidth = Math.max(min, Math.min(max, x))
                            document.documentElement.style.setProperty("--sidebar-width", newWidth + "px")
                        }

                        const onUp = () => {
                            draggingRef.current = false
                            const computed = getComputedStyle(document.documentElement).getPropertyValue("--sidebar-width") || "16rem"
                            if (computed.endsWith("px")) {
                                localStorage.setItem("sidebar_width_px", computed.replace("px", ""))
                            }
                            window.removeEventListener("mousemove", onMove)
                            window.removeEventListener("mouseup", onUp)
                        }

                        window.addEventListener("mousemove", onMove)
                        window.addEventListener("mouseup", onUp)
                    }}
                />

                {/* Main content */}
                <div className="flex flex-1 flex-col">
                    {/* Mobile top bar */}
                    <header className="sticky top-0 z-30 w-full bg-background border-b md:hidden">
                        <div className="flex items-center gap-3 px-3 py-2">
                            <SidebarTrigger />
                            <Link to="/" className="font-medium">DIDHub</Link>
                            <div className="flex-1">
                                <NavigationMenu />
                            </div>
                            <AnimatedThemeToggler className="p-2 rounded-md hover:bg-muted" />
                            <UserMenu />
                        </div>
                    </header>

                    <main className="flex-1 relative">
                        <SidebarInset className="p-4">
                            {/* Center the main content and constrain its width so it's not left-bound */}
                            <div className="w-full mx-auto max-w-7xl px-4">
                                <Outlet />
                            </div>
                        </SidebarInset>
                    </main>
                </div>
            </div>
        </SidebarProvider>
    )
}
