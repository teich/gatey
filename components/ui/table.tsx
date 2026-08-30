"use client"

import * as React from "react"
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { compareTableValues, type TableSortValue } from "@/lib/table-sort"

type SortDirection = "ascending" | "descending"
type SortState = { key: string; direction: SortDirection } | undefined

const TableSortContext = React.createContext<{
  sort: SortState
  toggleSort: (key: string) => void
} | null>(null)

function Table({ className, ...props }: React.ComponentProps<"table">) {
  const [sort, setSort] = React.useState<SortState>()

  function toggleSort(key: string) {
    setSort((current) => current?.key === key
      ? { key, direction: current.direction === "ascending" ? "descending" : "ascending" }
      : { key, direction: "ascending" })
  }

  return (
    <TableSortContext value={{ sort, toggleSort }}>
      <div
        data-slot="table-container"
        className="relative w-full overflow-x-auto"
      >
        <table
          data-slot="table"
          className={cn("w-full caption-bottom text-sm", className)}
          {...props}
        />
      </div>
    </TableSortContext>
  )
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b", className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const sorting = React.useContext(TableSortContext)
  const children = React.useMemo(() => {
    if (!sorting?.sort) return props.children

    const { direction, key } = sorting.sort
    return React.Children.toArray(props.children)
      .map((child, index) => ({ child, index }))
      .sort((left, right) => {
        const leftValue = React.isValidElement<SortableTableRowProps>(left.child) ? left.child.props.sortValues?.[key] : undefined
        const rightValue = React.isValidElement<SortableTableRowProps>(right.child) ? right.child.props.sortValues?.[key] : undefined
        const comparison = compareTableValues(leftValue, rightValue)
        const missingValue = leftValue == null || rightValue == null
        return (missingValue || direction === "ascending" ? comparison : -comparison) || left.index - right.index
      })
      .map(({ child }) => child)
  }, [props.children, sorting?.sort])

  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    >
      {children}
    </tbody>
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )
}

type SortableTableRowProps = React.ComponentProps<"tr"> & {
  sortValues?: Record<string, TableSortValue>
}

function TableRow({ className, sortValues: _sortValues, ...props }: SortableTableRowProps) {
  void _sortValues
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )
}

type SortableTableHeadProps = React.ComponentProps<"th"> & {
  sortKey?: string
}

function TableHead({ className, sortKey, children, ...props }: SortableTableHeadProps) {
  const sorting = React.useContext(TableSortContext)
  const currentSort = sorting?.sort
  const activeDirection = currentSort && currentSort.key === sortKey ? currentSort.direction : undefined
  const SortIcon = activeDirection === "ascending" ? ArrowUp : activeDirection === "descending" ? ArrowDown : ArrowUpDown

  return (
    <th
      data-slot="table-head"
      aria-sort={sortKey ? activeDirection || "none" : undefined}
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    >
      {sortKey ? <button type="button" className="table-sort-button" onClick={() => sorting?.toggleSort(sortKey)}>
        <span>{children}</span><SortIcon aria-hidden="true" />
      </button> : children}
    </th>
  )
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
