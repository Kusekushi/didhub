"use client"

import * as React from "react"
import { ColumnDef, RowSelectionState } from "@tanstack/react-table"
import { Alter } from "@didhub/api"
import { DataTable } from "@/components/ui/data-table"
import { Checkbox } from "@/components/ui/checkbox"

interface AlterSelectionTableProps {
  alters: Alter[]
  selectedAlterIds: string[]
  onSelectionChange: (ids: string[]) => void
  title?: string
}

export function AlterSelectionTable({
  alters,
  selectedAlterIds,
  onSelectionChange,
  title,
}: AlterSelectionTableProps) {
  // Convert selectedAlterIds to RowSelectionState (indexed by alter id)
  const rowSelection: RowSelectionState = React.useMemo(() => {
    const selection: RowSelectionState = {}
    for (const id of selectedAlterIds) {
      selection[id] = true
    }
    return selection
  }, [selectedAlterIds])

  const handleRowSelectionChange = React.useCallback((newSelection: RowSelectionState) => {
    const selectedIds = Object.entries(newSelection)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => id)
    onSelectionChange(selectedIds)
  }, [onSelectionChange])

  const columns: ColumnDef<Alter>[] = React.useMemo(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("name")}</div>
      ),
    },
    {
      accessorKey: "pronouns",
      header: "Pronouns",
      cell: ({ row }) => (
        <div className="text-muted-foreground">{row.getValue("pronouns") || "—"}</div>
      ),
    },
  ], [])

  return (
    <div className="space-y-2">
      {title && (
        <h4 className="text-sm font-medium">{title}</h4>
      )}
      <DataTable
        columns={columns}
        data={alters}
        searchColumn="name"
        searchPlaceholder="Search alters..."
        rowSelection={rowSelection}
        onRowSelectionChange={handleRowSelectionChange}
        getRowId={(row) => row.id}
        enablePagination={alters.length > 5}
        pageSize={5}
      />
    </div>
  )
}
