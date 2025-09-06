/* eslint-disable @typescript-eslint/no-explicit-any */
import { GlobalWorkerOptions } from "pdfjs-dist"
import PdfWorker from "pdfjs-dist/build/pdf.worker.mjs?worker"
import React, { useCallback, useRef, useState } from "react"
import { ExtractTab, TAB_NAME_EXTRACT } from "./components/Tabs/ExtractTab"
import { MergeTab, TAB_NAME_MERGE } from "./components/Tabs/MergeTab"
import { ReorderTab, TAB_NAME_REORDER } from "./components/Tabs/ReorderTab"
import { SplitTab, TAB_NAME_SPLIT } from "./components/Tabs/SplitTab"
import { Button } from "./components/ui/button"
import { Tabs, TabsList, TabsTrigger } from "./components/ui/tabs"
import { fileToBytes, makeThumb } from "./lib/pdfFile"
import type { PdfItem } from "./lib/types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog"

GlobalWorkerOptions.workerPort = new PdfWorker()

export default function App() {
  const [items, setItems] = useState<PdfItem[]>([])
  const [isDraggingOver, setDraggingOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inputRef = useRef<HTMLInputElement | null>(null)

  const setItemsWrapper = useCallback((newItems: any) => {
    setItems(newItems)
  }, [])

  // ---------- file loading ----------
  const onDropFiles = useCallback(
    async (files: FileList | File[]) => {
      setError(null)
      const pdfs = Array.from(files).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"))
      if (pdfs.length === 0) {
        setError("No PDFs detected. Please drop one or more .pdf files.")
        return
      }
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
      setItemsWrapper((prev: any) => [...prev, ...loaded])
      if (inputRef.current) inputRef.current.value = ""
    },
    [setItemsWrapper, setError],
  )

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

  const clearAll = () => {
    setItemsWrapper([])
    if (inputRef.current) inputRef.current.value = ""
  }

  // ---------- UI ----------
  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-5xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold">PDF Tools (Frontend-only)</h1>
          <p className="text-sm text-gray-600">All processing happens locally in your browser. No uploads.</p>
        </header>

        {/* Global dropzone */}
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
          <Button variant="outline" className="rounded-2xl" onClick={() => inputRef.current?.click()}>
            Choose files
          </Button>
          <input ref={inputRef} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(e) => e.target.files && onDropFiles(e.target.files)} />
        </div>

        <Tabs defaultValue={TAB_NAME_MERGE} className="w-full">
          <div className="mb-4 flex items-center justify-between gap-3">
            <TabsList className="shrink-0">
              <TabsTrigger value={TAB_NAME_MERGE}>Merge</TabsTrigger>
              <TabsTrigger value={TAB_NAME_SPLIT}>Split (ranges)</TabsTrigger>
              <TabsTrigger value={TAB_NAME_REORDER}>Reorder</TabsTrigger>
              <TabsTrigger value={TAB_NAME_EXTRACT}>Extract Text</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-500">
                {items.length} file{items.length === 1 ? "" : "s"}
              </span>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="rounded-2xl 
                    bg-red-50 text-red-900 border-red-200
                    hover:bg-red-100 hover:border-red-300 hover:text-red-700
                    "
                    disabled={items.length === 0}
                  >
                    Remove all files
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove all files?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will remove {items.length} file{items.length === 1 ? "" : "s"} from the workspace. You can add them again from the dropzone above.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={clearAll}>Clear</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>

          <MergeTab items={items} setError={setError} setItems={setItemsWrapper} />
          <SplitTab items={items} setError={setError} />
          <ReorderTab items={items} setError={setError} />
          <ExtractTab items={items} setError={setError} />
        </Tabs>

        {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

        <footer className="mt-10 text-xs text-gray-500">
          <p>
            Built with <code>pdf-lib</code> & <code>pdfjs-dist</code>. All processing is local. Go offline after loading the page if you want.
          </p>
          <p className="mt-2">
            <a href="https://github.com/tko39/pdf-tools" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-700">
              Don't believe me? View source on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  )
}
