/* eslint-disable @typescript-eslint/no-explicit-any */
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy } from "@dnd-kit/sortable"
import { PDFDocument } from "pdf-lib"
import { GlobalWorkerOptions } from "pdfjs-dist"
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker"
import React, { useCallback, useMemo, useRef, useState } from "react"
import { fileToBytes, makeThumb } from "./lib/pdfFile"
import type { PdfItem } from "./lib/types"
import { SortableCard } from "./components/SortableCard"

GlobalWorkerOptions.workerPort = new PdfWorker()

// --- Main Component ---
export default function App() {
  const [items, setItems] = useState<PdfItem[]>([])
  const [isDraggingOver, setDraggingOver] = useState(false)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filename, setFilename] = useState("merged.pdf")

  const sensors = useSensors(useSensor(PointerSensor))

  const onDropFiles = useCallback(async (files: FileList | File[]) => {
    setError(null)
    const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
    if (pdfs.length === 0) {
      setError("No PDFs detected. Please drop one or more .pdf files.")
      return
    }

    // Load bytes + thumbs
    const loaded: PdfItem[] = []
    for (const f of pdfs) {
      const bytes = await fileToBytes(f)
      const thumb = await makeThumb(bytes.slice())
      loaded.push({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        bytes,
        thumb,
      })
    }
    setItems((prev) => [...prev, ...loaded])
    if (inputRef.current) inputRef.current.value = ""
  }, [])

  // Native input (fallback)
  const inputRef = useRef<HTMLInputElement | null>(null)

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
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      const blob = new Blob([ab], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)

      const name = filename.toLowerCase().endsWith(".pdf") ? filename : `${filename}.pdf`
      const a = document.createElement("a")
      a.href = url
      a.download = name
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message || "Failed to merge PDFs")
    } finally {
      setMerging(false)
    }
  }, [items, filename])

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDraggingOver(true)
  }
  const onDragLeave = () => setDraggingOver(false)
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDraggingOver(false)
    if (e.dataTransfer?.files) onDropFiles(e.dataTransfer.files)
  }

  const ids = useMemo(() => items.map((i) => i.id), [items])

  const handleDragEnd = (event: any) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = items.findIndex((i) => i.id === active.id)
    const newIndex = items.findIndex((i) => i.id === over.id)
    setItems(arrayMove(items, oldIndex, newIndex))
  }

  const removeItem = (id: string) => setItems(items.filter((i) => i.id !== id))
  const clearAll = () => {
    setItems([])
    if (inputRef.current) inputRef.current.value = ""
  }

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">PDF Merger (Frontend‑only)</h1>
          <p className="text-sm text-gray-600">Drop PDFs, reorder, and merge — all in your browser. No uploads.</p>
        </header>

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`mb-6 rounded-2xl border-2 border-dashed p-10 text-center transition ${
            isDraggingOver ? "border-blue-400 bg-blue-50" : "border-gray-300 bg-white"
          }`}
        >
          <p className="mb-3">Drag & drop your PDFs here</p>
          <p className="text-xs text-gray-500 mb-4">or</p>
          <button className="rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={() => inputRef.current?.click()}>
            Choose files
          </button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && onDropFiles(e.target.files)} />
        </div>

        {items.length > 0 && (
          <>
            <div className="mb-4 flex flex-col md:flex-row gap-3 md:items-center">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-700">Output filename</label>
                <input
                  value={filename}
                  onChange={(e) => setFilename(e.target.value)}
                  className="rounded-xl border px-3 py-2 text-sm bg-white"
                  placeholder="merged.pdf"
                />
              </div>
              <div className="md:ml-auto flex gap-2">
                <button className="rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={clearAll}>
                  Clear all
                </button>
                <button className="rounded-2xl px-4 py-2 text-sm text-white bg-black hover:opacity-90 disabled:opacity-50" onClick={onMerge} disabled={merging}>
                  {merging ? "Merging…" : `Merge ${items.length} PDF${items.length > 1 ? "s" : ""}`}
                </button>
              </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={ids} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map((it) => (
                    <SortableCard key={it.id} item={it} onRemove={removeItem} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}

        {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <footer className="mt-10 text-xs text-gray-500">
          <p>
            All processing happens locally in your browser using <code>pdf-lib</code> and <code>pdfjs-dist</code>. No server required.
          </p>
        </footer>
      </div>
    </div>
  )
}
