/* eslint-disable @typescript-eslint/no-explicit-any */
import { download, normalizePdfName } from "@/lib/helpers"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { TabsContent } from "../ui/tabs"

import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable"

import type { PdfItem } from "@/lib/types"
import { PDFDocument } from "pdf-lib"
import { useCallback, useMemo, useState } from "react"
import { SortableCard } from "../SortableCard"

export const TAB_NAME_MERGE = "merge"

export const MergeTab = ({
  items,
  setItems,
  setError,
}: {
  items: PdfItem[]
  setItems: (items: PdfItem[]) => void
  setError: (error: string | null) => void
}) => {
  const [merging, setMerging] = useState(false)
  const [mergeFilename, setMergeFilename] = useState("merged.pdf")

  const sensors = useSensors(useSensor(PointerSensor))
  const ids = useMemo(() => items.map((i) => i.id), [items])
  console.log(items)

  const onMerge = useCallback(async () => {
    setError(null)
    if (items.length === 0) {
      setError("Add at least one PDF to merge.")
      return
    }
    setMerging(true)
    try {
      const out = await PDFDocument.create()
      for (const it of items) {
        const src = await PDFDocument.load(it.bytes)
        const pages = await out.copyPages(src, src.getPageIndices())
        pages.forEach((p) => out.addPage(p))
      }
      out.setTitle("Merged PDF")
      const bytes = await out.save()
      download(bytes, normalizePdfName(mergeFilename))
    } catch (e: any) {
      setError(e?.message || "Failed to merge PDFs")
    } finally {
      setMerging(false)
    }
  }, [items, mergeFilename, setError])

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    setItems(arrayMove(items, oldIndex, newIndex))
  }

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id))

  return (
    <TabsContent value={TAB_NAME_MERGE} className="space-y-4">
      <div className="flex flex-col md:flex-row gap-3 md:items-center">
        <div className="flex items-center gap-2">
          <Label htmlFor="merge-name" className="text-sm text-gray-700">
            Output filename
          </Label>
          <Input
            id="merge-name"
            value={mergeFilename}
            onChange={(e) => setMergeFilename(e.target.value)}
            className="rounded-xl w-56"
            placeholder="merged.pdf"
          />
        </div>
        <Button className="rounded-2xl" onClick={onMerge} disabled={merging || items.length === 0}>
          {merging ? "Merging…" : `Merge ${items.length || ""} ${items.length ? (items.length > 1 ? "PDFs" : "PDF") : ""}`}
        </Button>
      </div>

      {items.length > 0 ? (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={ids} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((it) => (
                <SortableCard key={it.id} item={it} onRemove={removeItem} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      ) : (
        <div className="text-sm text-gray-500">No PDFs yet. Add some above to merge and reorder.</div>
      )}
    </TabsContent>
  )
}
