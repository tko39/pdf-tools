/* eslint-disable @typescript-eslint/no-explicit-any */
import type { PageItem } from "@/lib/helpers"
import { exportReorderedPdf, renderAllPageThumbs } from "@/lib/helpers"
import { TabsContent } from "../ui/tabs"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { Input } from "../ui/input"
import { Button } from "../ui/button"

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core"
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

import { useCallback, useEffect, useState } from "react"
import type { PdfItem } from "@/lib/types"

export const TAB_NAME_REORDER = "reorder"

// Pure UI for a page cell
const SortablePage = ({ page, onRemove }: { page: PageItem; onRemove: (id: string) => void }) => {
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-white">
      <img src={page.thumb} alt={`Page ${page.pageIndex + 1}`} className="w-full h-auto block" />
      <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded-full">{page.pageIndex + 1}</div>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2 rounded-full px-2 py-1 text-[11px]
             bg-red-50 text-red-900 border-red-200
             hover:bg-red-100 hover:border-red-300 hover:text-red-700
             focus-visible:ring-2 focus-visible:ring-red-300
             opacity-0 group-hover:opacity-100 transition"
        title="Remove page"
        onPointerDownCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onMouseDownCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onTouchStartCapture={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        // keep click functional
        onClick={(e) => {
          e.stopPropagation()
          onRemove(page.id)
        }}
        draggable={false}
      >
        Remove
      </Button>
    </div>
  )
}

// Makes each page draggable/sortable
const SortablePageItem = ({ page, onRemove }: { page: PageItem; onRemove: (id: string) => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
    cursor: "grab",
  }
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <SortablePage page={page} onRemove={onRemove} />
    </div>
  )
}

export const ReorderTab = ({ items, setError }: { items: PdfItem[]; setError: (error: string | null) => void }) => {
  const [reorderSourceId, setReorderSourceId] = useState<string | null>(null)
  const [reorderPages, setReorderPages] = useState<PageItem[]>([])
  const [reorderLoading, setReorderLoading] = useState(false)
  const [reorderFilename, setReorderFilename] = useState("reordered.pdf")

  const reorderSensors = useSensors(useSensor(PointerSensor))

  const loadReorderSource = useCallback(async () => {
    const srcItem = items.find((i) => i.id === reorderSourceId) || items[0]
    if (!srcItem) {
      setReorderPages([])
      return
    }
    setReorderLoading(true)
    try {
      const pages = await renderAllPageThumbs(srcItem.bytes, 180)
      setReorderPages(pages)
    } finally {
      setReorderLoading(false)
    }
  }, [items, reorderSourceId])

  useEffect(() => {
    if (items.length > 0) void loadReorderSource()
    else setReorderPages([])
  }, [items, reorderSourceId, loadReorderSource])

  const onReorderDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const oldIndex = reorderPages.findIndex((p) => p.id === active.id)
      const newIndex = reorderPages.findIndex((p) => p.id === over.id)
      setReorderPages((prev) => {
        const next = [...prev]
        const [moved] = next.splice(oldIndex, 1)
        next.splice(newIndex, 0, moved)
        return next
      })
    },
    [reorderPages],
  )

  const removeReorderPage = useCallback((id: string) => {
    setReorderPages((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const onExportReordered = useCallback(async () => {
    try {
      setError(null)
      const srcItem = items.find((i) => i.id === reorderSourceId) || items[0]
      if (!srcItem || reorderPages.length === 0) return
      const order = reorderPages.map((p) => p.pageIndex)
      await exportReorderedPdf(srcItem.bytes, order, reorderFilename)
    } catch (e: any) {
      setError(e?.message || "Failed to export reordered PDF")
    }
  }, [setError, items, reorderPages, reorderFilename, reorderSourceId])

  return (
    <TabsContent value={TAB_NAME_REORDER} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
        <div className="flex flex-col gap-2">
          <Label>Source PDF</Label>
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add a PDF above to reorder pages.</div>
          ) : (
            <Select value={reorderSourceId ?? items[0]?.id ?? ""} onValueChange={(v) => setReorderSourceId(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose PDF" />
              </SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="reorder-name">Output filename</Label>
          <Input id="reorder-name" value={reorderFilename} onChange={(e) => setReorderFilename(e.target.value)} placeholder="reordered.pdf" />
        </div>

        <div className="flex gap-2">
          <Button className="rounded-2xl" onClick={onExportReordered} disabled={reorderLoading || reorderPages.length === 0}>
            Export Reordered
          </Button>
          <Button
            variant="outline"
            className="rounded-2xl"
            onClick={() => void loadReorderSource()}
            disabled={items.length === 0 || reorderLoading}
            title="Refresh thumbnails"
          >
            Refresh
          </Button>
        </div>
      </div>

      {reorderLoading ? (
        <div className="text-sm text-gray-500">Rendering page thumbnails…</div>
      ) : reorderPages.length === 0 ? (
        <div className="text-sm text-gray-500">No pages loaded yet.</div>
      ) : (
        <DndContext sensors={reorderSensors} collisionDetection={closestCenter} onDragEnd={onReorderDragEnd}>
          <SortableContext items={reorderPages.map((p) => p.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {reorderPages.map((page) => (
                <SortablePageItem key={page.id} page={page} onRemove={removeReorderPage} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </TabsContent>
  )
}
