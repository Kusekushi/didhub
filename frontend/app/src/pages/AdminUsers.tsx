import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useApi } from '@/context/ApiContext'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { ArrowLeft, Plus, Edit, Trash2, RefreshCw, Shield, User, CheckCircle, XCircle } from 'lucide-react'
import { User as UserType, CreateUserRequest, UpdateUserRequest, UpdateUserPasswordRequest, PaginatedUsersResponse, createRegistrationPayload, createPasswordChangePayload } from '@didhub/api'

export default function AdminUsers() {
    const client = useApi()
    const [users, setUsers] = useState<UserType[]>([])
    const [loading, setLoading] = useState(true)
    const [creating, setCreating] = useState(false)
    const [updating, setUpdating] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<string | null>(null)

    // Create user dialog state
    const [createDialogOpen, setCreateDialogOpen] = useState(false)
    const [newUser, setNewUser] = useState({
        username: '',
        displayName: '',
        password: '',
        isAdmin: false,
        isApproved: true
    })

    // Edit user dialog state
    const [editDialogOpen, setEditDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<UserType | null>(null)
    const [editForm, setEditForm] = useState({
        displayName: '',
        isAdmin: false,
        isSystem: false,
        isApproved: true
    })

    // Password change dialog state
    const [passwordDialogOpen, setPasswordDialogOpen] = useState(false)
    const [passwordUser, setPasswordUser] = useState<UserType | null>(null)
    const [newPassword, setNewPassword] = useState('')

    const loadUsers = async () => {
        try {
            setLoading(true)
            const response = await client.getUsers() as { data: PaginatedUsersResponse }
            setUsers(response.data.items || [])
        } catch (error) {
            console.error('Failed to load users:', error)
        } finally {
            setLoading(false)
        }
    }

    const createUser = async () => {
        try {
            setCreating(true)
            const payload = await createRegistrationPayload(newUser.username, newUser.password, { displayName: newUser.displayName })
            // add optional backend fields not included by createRegistrationPayload
            const payloadAny = payload as any
            payloadAny.is_admin = newUser.isAdmin
            payloadAny.is_approved = newUser.isApproved

            await client.createUser({ body: payload as CreateUserRequest })

            setCreateDialogOpen(false)
            setNewUser({ username: '', displayName: '', password: '', isAdmin: false, isApproved: true })
            await loadUsers()
        } catch (error) {
            console.error('Failed to create user:', error)
        } finally {
            setCreating(false)
        }
    }

    const updateUser = async () => {
        if (!editingUser) return

        try {
            setUpdating(editingUser.id)
            await client.updateUser({
                path: { userId: editingUser.id },
                body: {
                    display_name: editForm.displayName || undefined,
                    is_admin: editForm.isAdmin,
                    is_system: editForm.isSystem,
                    is_approved: editForm.isApproved
                } as UpdateUserRequest
            })

            setEditDialogOpen(false)
            setEditingUser(null)
            await loadUsers()
        } catch (error) {
            console.error('Failed to update user:', error)
        } finally {
            setUpdating(null)
        }
    }

    const changePassword = async () => {
        if (!passwordUser) return

        try {
            setUpdating(passwordUser.id)
            const payload = await createPasswordChangePayload(newPassword)
            await client.updateUserPassword({
                path: { userId: passwordUser.id },
                body: payload as UpdateUserPasswordRequest
            })

            setPasswordDialogOpen(false)
            setPasswordUser(null)
            setNewPassword('')
        } catch (error) {
            console.error('Failed to change password:', error)
        } finally {
            setUpdating(null)
        }
    }

    const deleteUser = async (userId: string) => {
        try {
            setDeleting(userId)
            await client.deleteUser({ path: { userId } })
            await loadUsers()
        } catch (error) {
            console.error('Failed to delete user:', error)
        } finally {
            setDeleting(null)
        }
    }

    const openEditDialog = (user: UserType) => {
        setEditingUser(user)
        setEditForm({
            displayName: user.displayName || '',
            isAdmin: user.isAdmin,
            isSystem: user.isSystem,
            isApproved: user.isApproved
        })
        setEditDialogOpen(true)
    }

    const openPasswordDialog = (user: UserType) => {
        setPasswordUser(user)
        setNewPassword('')
        setPasswordDialogOpen(true)
    }

    useEffect(() => {
        loadUsers()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    if (loading) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex items-center justify-center h-64">
                    <RefreshCw className="h-8 w-8 animate-spin" />
                </div>
            </div>
        )
    }

    return (
        <div className="container mx-auto p-6">
            <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <Link to="/admin">
                            <Button variant="outline" size="sm">
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Back to Admin Panel
                            </Button>
                        </Link>
                        <div>
                            <h1 className="text-3xl font-bold">User Management</h1>
                            <p className="text-muted-foreground mt-2">
                                Manage user accounts and permissions
                            </p>
                        </div>
                    </div>

                    <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="h-4 w-4 mr-2" />
                                Create User
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Create New User</DialogTitle>
                                <DialogDescription>
                                    Add a new user to the system.
                                </DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                                <div>
                                    <Label htmlFor="username">Username</Label>
                                    <Input
                                        id="username"
                                        value={newUser.username}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, username: e.target.value }))}
                                        placeholder="Enter username"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="displayName">Display Name (Optional)</Label>
                                    <Input
                                        id="displayName"
                                        value={newUser.displayName}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
                                        placeholder="Enter display name"
                                    />
                                </div>
                                <div>
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={newUser.password}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="Enter password"
                                    />
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="isAdmin"
                                        checked={newUser.isAdmin}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, isAdmin: e.target.checked }))}
                                    />
                                    <Label htmlFor="isAdmin">Administrator</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <input
                                        type="checkbox"
                                        id="isApproved"
                                        checked={newUser.isApproved}
                                        onChange={(e) => setNewUser(prev => ({ ...prev, isApproved: e.target.checked }))}
                                    />
                                    <Label htmlFor="isApproved">Approved</Label>
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
                                    Cancel
                                </Button>
                                <Button onClick={createUser} disabled={creating || !newUser.username || !newUser.password}>
                                    {creating ? 'Creating...' : 'Create User'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>
                        A list of all users in the system.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Username</TableHead>
                                <TableHead>Display Name</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.username}</TableCell>
                                    <TableCell>{user.displayName || '-'}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1 flex-wrap">
                                            {user.isApproved ? (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                                    <CheckCircle className="h-3 w-3 mr-1" />
                                                    Approved
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800">
                                                    <XCircle className="h-3 w-3 mr-1" />
                                                    Pending
                                                </span>
                                            )}
                                            {user.isSystem && (
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs border border-gray-300">
                                                    <User className="h-3 w-3 mr-1" />
                                                    System
                                                </span>
                                            )}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {user.isAdmin ? (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-red-100 text-red-800">
                                                <Shield className="h-3 w-3 mr-1" />
                                                Admin
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs border border-gray-300">
                                                User
                                            </span>
                                        )}
                                    </TableCell>
                                    <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEditDialog(user)}
                                                disabled={updating === user.id}
                                            >
                                                <Edit className="h-3 w-3" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openPasswordDialog(user)}
                                                disabled={updating === user.id}
                                            >
                                                Change Password
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => {
                                                    if (window.confirm(`Are you sure you want to delete ${user.username}? This action cannot be undone.`)) {
                                                        deleteUser(user.id)
                                                    }
                                                }}
                                                disabled={deleting === user.id}
                                            >
                                                <Trash2 className="h-3 w-3" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Edit User Dialog */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>
                            Update user information and permissions.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Username</Label>
                            <Input value={editingUser?.username || ''} disabled />
                        </div>
                        <div>
                            <Label htmlFor="editDisplayName">Display Name (Optional)</Label>
                            <Input
                                id="editDisplayName"
                                value={editForm.displayName}
                                onChange={(e) => setEditForm(prev => ({ ...prev, displayName: e.target.value }))}
                                placeholder="Enter display name"
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="editIsAdmin"
                                checked={editForm.isAdmin}
                                onChange={(e) => setEditForm(prev => ({ ...prev, isAdmin: e.target.checked }))}
                            />
                            <Label htmlFor="editIsAdmin">Administrator</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="editIsApproved"
                                checked={editForm.isApproved}
                                onChange={(e) => setEditForm(prev => ({ ...prev, isApproved: e.target.checked }))}
                            />
                            <Label htmlFor="editIsApproved">Approved</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="editIsSystem"
                                checked={editForm.isSystem}
                                onChange={(e) => setEditForm(prev => ({ ...prev, isSystem: e.target.checked }))}
                            />
                            <Label htmlFor="editIsSystem">System User</Label>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={updateUser} disabled={updating === editingUser?.id}>
                            {updating === editingUser?.id ? 'Updating...' : 'Update User'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Change Password Dialog */}
            <Dialog open={passwordDialogOpen} onOpenChange={setPasswordDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Change Password</DialogTitle>
                        <DialogDescription>
                            Set a new password for {passwordUser?.username}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label htmlFor="newPassword">New Password</Label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="Enter new password"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPasswordDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={changePassword} disabled={updating === passwordUser?.id || !newPassword}>
                            {updating === passwordUser?.id ? 'Changing...' : 'Change Password'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}