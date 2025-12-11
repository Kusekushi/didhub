import { useState, useEffect, useMemo } from 'react'
import { User as UserIcon, Search } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { User } from '@didhub/api'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useUsers } from '@/hooks/useUsers'

export default function UsersPage() {
  const navigate = useNavigate()
  const { users: systems, loading, loadUsers } = useUsers()
  const [searchTerm, setSearchTerm] = useState('')

  const filteredSystems = useMemo(() => {
    if (!searchTerm) return systems
    return systems.filter(system =>
      system.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (system.displayName && system.displayName.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  }, [systems, searchTerm])

  useEffect(() => {
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleUserClick = (user: User) => {
    if (user.isSystem) {
      navigate(`/system/${user.id}`)
    } else {
      navigate(`/users/${user.id}`)
    }
  }

  if (loading) {
    return <div className="p-6">Loading systems...</div>
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">All Users</h1>
          <p className="text-muted-foreground">Click on a user to view their details</p>
        </div>
      </div>

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Display Name</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredSystems.map((system) => (
            <TableRow
              key={system.id}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => handleUserClick(system)}
            >
              <TableCell>{system.username}</TableCell>
              <TableCell>{system.displayName || '-'}</TableCell>
              <TableCell>
                {system.isSystem && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs border border-gray-300">
                    <UserIcon className="h-3 w-3 mr-1" />
                    System
                  </span>
                )}
                {!system.isSystem && 'User'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {filteredSystems.length === 0 && systems.length > 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No users match your search.</p>
        </div>
      )}

      {systems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No systems found.</p>
        </div>
      )}
    </div>
  )
}