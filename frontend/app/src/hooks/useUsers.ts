import { useState, useCallback } from 'react'
import { User, PaginatedUsersResponse } from '@didhub/api'
import { useApi } from '@/context/ApiContext'
import { useToast } from '@/context/ToastContext'

export function useUsers() {
  const api = useApi()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(false)
  const { show: showToast } = useToast()

  const loadUsers = useCallback(async (showErrorToast = true) => {
    try {
      setLoading(true)
      const response = await api.getUsers<PaginatedUsersResponse>()
      setUsers(response.data.items || [])
    } catch (error) {
      if (showErrorToast) {
        showToast({
          title: 'Error',
          description: 'Failed to load users',
          variant: 'error',
        })
      } else {
        console.error('Failed to load users:', error)
      }
    } finally {
      setLoading(false)
    }
  }, [api, showToast])

  return {
    users,
    loading,
    loadUsers,
    setUsers
  }
}