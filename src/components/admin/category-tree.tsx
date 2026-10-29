"use client"

import { ChoiceSelect } from "@/components/ui/choice-select"
import Link from "next/link"
import { useCallback, useId, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, GripVertical } from "lucide-react"
import { cn } from "cn"
import { reorderCategoriesAction } from "@/features/admin/actions"
import { findParent, moveItem, ROOT, type Layout } from "@/lib/tree-order"

export type CategoryInfo = { id: string; name: string; hidden: boolean; products: number }

const zoneId = (parent: string) => `zone:${parent}`

function Handle({
  label,
  attributes,
  listeners,
}: {
  label: string
  attributes: object
  listeners?: object
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
      {...attributes}
      {...listeners}
    >
      <GripVertical aria-hidden="true" className="size-5" />
    </button>
  )
}

function Row({
  info,
  parentName,
  isChild,
  options,
  current,
  onMove,
  onNudge,
  canNudge,
}: {
  info: CategoryInfo
  parentName?: string
  isChild: boolean
  options: { id: string; name: string }[]
  current: string
  onMove: (to: string) => void
  onNudge: (delta: -1 | 1) => void
  canNudge: { up: boolean; down: boolean }
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: info.id,
    data: { type: isChild ? "child" : "top" },
  })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border bg-background px-2 py-1.5",
        isChild && "ml-6",
        isDragging && "opacity-40"
      )}
    >
      <Handle label={`Drag ${info.name}`} attributes={attributes} listeners={listeners} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/categories/${info.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {info.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          {info.products} {info.products === 1 ? "product" : "products"}
          {info.hidden ? ", hidden from the shop" : ""}
          {parentName ? `, inside ${parentName}` : ""}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={`Move ${info.name} up`}
          disabled={!canNudge.up}
          onClick={() => onNudge(-1)}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
        >
          <ArrowUp aria-hidden="true" className="size-4" />
        </button>
        <button
          type="button"
          aria-label={`Move ${info.name} down`}
          disabled={!canNudge.down}
          onClick={() => onNudge(1)}
          className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
        >
          <ArrowDown aria-hidden="true" className="size-4" />
        </button>
        <label className="sr-only" htmlFor={`under-${info.id}`}>
          Where {info.name} sits
        </label>
        <ChoiceSelect
          id={`under-${info.id}`}
          value={current}
          onChange={(value) => onMove(value)}
          className="h-8 w-40 text-xs"
        >
          <option value={ROOT}>Top level</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              Inside {o.name}
            </option>
          ))}
        </ChoiceSelect>
      </div>
    </div>
  )
}

function Zone({ id, children, empty }: { id: string; children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: zoneId(id) })
  return (
    <div
      ref={setNodeRef}
      className={cn("flex min-h-3 flex-col gap-2 rounded-xl", isOver && "bg-primary/5")}
    >
      {children}
      {empty ? (
        <p className="ml-6 rounded-xl border border-dashed px-3 py-2 text-xs text-muted-foreground">
          Drop a sub-category here
        </p>
      ) : null}
    </div>
  )
}

/**
 * The category menu as a list you can rearrange: drag the handle to reorder, or drop a category inside another to
 * make it a sub-category (and out again to make it top-level). Buttons and a menu do the same, for keyboards and
 * touch screens. Every change is saved at once; if the server refuses, the list goes back and says why.
 */
export function CategoryTree({
  initial,
  info,
}: {
  initial: Layout
  info: Record<string, CategoryInfo>
}) {
  const [layout, setLayout] = useState<Layout>(initial)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const saved = useRef<Layout>(initial)
  const dragStart = useRef<Layout>(initial)
  const uid = useId()
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const persist = useCallback(async (next: Layout) => {
    if (JSON.stringify(next) === JSON.stringify(saved.current)) return
    setSaving(true)
    setMessage("")
    const result = await reorderCategoriesAction(next)
    setSaving(false)
    if (result.ok) {
      saved.current = next
      setMessage("Order saved.")
    } else {
      setLayout(saved.current)
      setMessage(result.message)
    }
  }, [])

  const apply = (id: string, to: string, index: number) => {
    const next = moveItem(layout, id, to, index)
    if (!next) {
      setMessage("A category with sub-categories cannot go inside another one.")
      return
    }
    setLayout(next)
    void persist(next)
  }

  const nudge = (id: string, delta: -1 | 1) => {
    const parent = findParent(layout, id)
    if (parent === null) return
    const siblings =
      parent === ROOT ? layout.map((l) => l.id) : layout.find((l) => l.id === parent)!.children
    const at = siblings.indexOf(id)
    const target = at + delta
    if (target < 0 || target >= siblings.length) return
    apply(id, parent, target)
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
    dragStart.current = layout
    setMessage("")
  }

  /** While dragging a sub-category over another list, move it there so the list opens a gap. */
  function onDragOver(e: DragOverEvent) {
    const id = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    if (!overId || overId === id) return
    const isTop = layout.some((l) => l.id === id)
    if (isTop) return // top-level rows are sorted among themselves when dropped
    const overZone = overId.startsWith("zone:") ? overId.slice(5) : null
    const overParent = overZone ?? findParent(layout, overId)
    if (overParent === null || overParent === findParent(layout, id)) return
    const index =
      overZone || overParent === ROOT
        ? overParent === ROOT
          ? layout.length
          : layout.find((l) => l.id === overParent)!.children.length
        : layout.find((l) => l.id === overParent)!.children.indexOf(overId)
    const next = moveItem(layout, id, overParent, Math.max(0, index))
    if (next) setLayout(next)
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const id = String(e.active.id)
    const overId = e.over ? String(e.over.id) : null
    let next = layout
    if (overId && overId !== id) {
      const parent = findParent(layout, id)
      const overParent = findParent(layout, overId)
      if (parent === ROOT && overParent === ROOT) {
        const ids = layout.map((l) => l.id)
        const reordered = arrayMove(ids, ids.indexOf(id), ids.indexOf(overId))
        next = reordered.map((rid) => layout.find((l) => l.id === rid)!)
      } else if (parent !== ROOT && parent !== null && parent === overParent) {
        const p = layout.find((l) => l.id === parent)!
        next = layout.map((l) =>
          l.id === parent
            ? {
                ...l,
                children: arrayMove(p.children, p.children.indexOf(id), p.children.indexOf(overId)),
              }
            : l
        )
      }
    }
    if (JSON.stringify(next) === JSON.stringify(dragStart.current)) {
      setLayout(dragStart.current)
      return
    }
    setLayout(next)
    void persist(next)
  }

  const tops = layout.map((l) => l.id)
  const parentChoices = (id: string) =>
    layout
      .filter((l) => l.id !== id && info[l.id])
      .map((l) => ({ id: l.id, name: info[l.id]!.name }))

  return (
    <div className="flex flex-col gap-3">
      <p id={`${uid}-help`} className="text-sm text-muted-foreground">
        Drag the handle to reorder. Drop a category inside another to make it a sub-category, or use
        the menu on each row. Changes are saved as you go.
      </p>
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-5 text-sm",
          message && message !== "Order saved." ? "text-destructive" : "text-primary"
        )}
      >
        {saving ? "Saving..." : message}
      </p>
      <DndContext
        id={uid}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          setActiveId(null)
          setLayout(dragStart.current)
        }}
      >
        <SortableContext items={tops} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-3" aria-describedby={`${uid}-help`}>
            {layout.map((top, i) => (
              <li key={top.id} className="flex flex-col gap-2">
                <Row
                  info={info[top.id]!}
                  isChild={false}
                  options={parentChoices(top.id)}
                  current={ROOT}
                  onMove={(to) =>
                    apply(
                      top.id,
                      to,
                      to === ROOT ? i : layout.find((l) => l.id === to)!.children.length
                    )
                  }
                  onNudge={(d) => nudge(top.id, d)}
                  canNudge={{ up: i > 0, down: i < layout.length - 1 }}
                />
                <SortableContext items={top.children} strategy={verticalListSortingStrategy}>
                  <Zone
                    id={top.id}
                    empty={
                      top.children.length === 0 &&
                      activeId !== null &&
                      !layout.some((l) => l.id === activeId)
                    }
                  >
                    {top.children.map((child, j) => (
                      <Row
                        key={child}
                        info={info[child]!}
                        parentName={info[top.id]?.name}
                        isChild
                        options={parentChoices(child)}
                        current={top.id}
                        onMove={(to) =>
                          apply(
                            child,
                            to,
                            to === ROOT
                              ? layout.length
                              : layout.find((l) => l.id === to)!.children.length
                          )
                        }
                        onNudge={(d) => nudge(child, d)}
                        canNudge={{ up: j > 0, down: j < top.children.length - 1 }}
                      />
                    ))}
                  </Zone>
                </SortableContext>
              </li>
            ))}
          </ul>
        </SortableContext>
        <DragOverlay>
          {activeId && info[activeId] ? (
            <div className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2 shadow-lg">
              <GripVertical aria-hidden="true" className="size-5 text-muted-foreground" />
              <span className="font-medium">{info[activeId]!.name}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
