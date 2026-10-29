"use client"

import Link from "next/link"
import { useId, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { cn } from "cn"
import { deleteTaxonAction, reorderTaxaAction } from "@/features/admin/actions"

export type TaxonItem = { id: string; name: string; products: number; hidden: boolean }

function Row({
  item,
  kind,
  index,
  last,
  canEdit,
  onNudge,
  onDelete,
}: {
  item: TaxonItem
  kind: "fabric" | "print"
  index: number
  last: boolean
  canEdit: boolean
  onNudge: (id: string, d: -1 | 1) => void
  onDelete: (item: TaxonItem) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: !canEdit,
  })
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-background px-2 py-1.5",
        isDragging && "opacity-40"
      )}
    >
      {canEdit ? (
        <button
          type="button"
          aria-label={`Drag ${item.name}`}
          className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-muted-foreground hover:bg-muted active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical aria-hidden="true" className="size-5" />
        </button>
      ) : null}
      <div className="min-w-0 flex-1">
        <Link
          href={`/admin/${kind}s/${item.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {item.name}
        </Link>
        <p className="text-xs text-muted-foreground">
          Used by {item.products} {item.products === 1 ? "product" : "products"}
          {item.hidden ? ", hidden from the shop" : ""}
        </p>
      </div>
      {canEdit ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label={`Move ${item.name} up`}
            disabled={index === 0}
            onClick={() => onNudge(item.id, -1)}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
          >
            <ArrowUp aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Move ${item.name} down`}
            disabled={last}
            onClick={() => onNudge(item.id, 1)}
            className="flex size-8 items-center justify-center rounded-lg hover:bg-muted disabled:opacity-30"
          >
            <ArrowDown aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.name}`}
            onClick={() => onDelete(item)}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <Trash2 aria-hidden="true" className="size-4" />
          </button>
        </div>
      ) : null}
    </li>
  )
}

/** The master list, in the order shown in the shop. Drag to reorder (or use the arrows); delete only when nothing uses it. */
export function TaxonList({
  kind,
  initial,
  canEdit,
}: {
  kind: "fabric" | "print"
  initial: TaxonItem[]
  canEdit: boolean
}) {
  const router = useRouter()
  const uid = useId()
  const [items, setItems] = useState(initial)
  const [message, setMessage] = useState("")
  const saved = useRef(initial.map((i) => i.id))
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  async function persist(next: TaxonItem[]) {
    setItems(next)
    const ids = next.map((i) => i.id)
    const result = await reorderTaxaAction(kind, ids)
    if (result.ok) {
      saved.current = ids
      setMessage("Order saved.")
    } else {
      setItems(saved.current.map((id) => next.find((i) => i.id === id)!))
      setMessage(result.message)
    }
  }
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const from = items.findIndex((i) => i.id === e.active.id)
    const to = items.findIndex((i) => i.id === e.over!.id)
    void persist(arrayMove(items, from, to))
  }
  const nudge = (id: string, d: -1 | 1) => {
    const at = items.findIndex((i) => i.id === id)
    if (at + d < 0 || at + d >= items.length) return
    void persist(arrayMove(items, at, at + d))
  }
  const remove = async (item: TaxonItem) => {
    const result = await deleteTaxonAction(item.id, kind)
    if (result.ok) {
      setItems(items.filter((i) => i.id !== item.id))
      setMessage(`${item.name} deleted.`)
      router.refresh()
    } else setMessage(result.message)
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit ? (
        <p className="text-sm text-muted-foreground">
          Drag the handle to put them in the order the shop shows them. Changes are saved as you go.
        </p>
      ) : null}
      <p
        role="status"
        aria-live="polite"
        className={cn(
          "min-h-5 text-sm",
          message && !/saved|deleted/.test(message) ? "text-destructive" : "text-primary"
        )}
      >
        {message}
      </p>
      <DndContext
        id={uid}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
          <ul className="flex flex-col gap-2">
            {items.map((item, i) => (
              <Row
                key={item.id}
                item={item}
                kind={kind}
                index={i}
                last={i === items.length - 1}
                canEdit={canEdit}
                onNudge={nudge}
                onDelete={remove}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  )
}
