/* eslint-disable @typescript-eslint/no-explicit-any */
import { download, normalizePdfName, parseRanges } from "@/lib/helpers"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TabsContent } from "../ui/tabs"

import type { PdfItem } from "@/lib/types"
import { PDFDocument } from "pdf-lib"
import { useCallback, useState } from "react"

export const TAB_NAME_SPLIT = "split"

export const SplitTab = ({ items, setError }: { items: PdfItem[]; setError: (error: string | null) => void }) => {
  const [splitting, setSplitting] = useState(false)
  const [splitSourceId, setSplitSourceId] = useState<string | null>(null)
  const [splitRanges, setSplitRanges] = useState("1-3,5") // example default
  const [splitFilename, setSplitFilename] = useState("split.pdf")

  const onSplit = useCallback(async () => {
    setError(null)
    const srcItem = items.find((i) => i.id === splitSourceId) || items[0]
    if (!srcItem) {
      setError("Add a PDF and select it to split.")
      return
    }
    setSplitting(true)
    try {
      const src = await PDFDocument.load(srcItem.bytes)
      const total = src.getPageCount()
      const indices = parseRanges(splitRanges, total)
      if (indices.length === 0) {
        setError(`No valid pages from ranges. PDF has ${total} pages.`)
        return
      }
      const out = await PDFDocument.create()
      const copied = await out.copyPages(src, indices)
      copied.forEach((p) => out.addPage(p))
      const bytes = await out.save()
      download(bytes, normalizePdfName(splitFilename))
    } catch (e: any) {
      setError(e?.message || "Failed to split PDF")
    } finally {
      setSplitting(false)
    }
  }, [setError, items, splitSourceId, splitRanges, splitFilename])

  return (
    <TabsContent value={TAB_NAME_SPLIT} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Source PDF</Label>
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add a PDF above to split.</div>
          ) : (
            <Select value={splitSourceId ?? items[0]?.id ?? ""} onValueChange={(v) => setSplitSourceId(v)}>
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
          <Label htmlFor="ranges">Page ranges</Label>
          <Input id="ranges" value={splitRanges} onChange={(e) => setSplitRanges(e.target.value)} placeholder="e.g. 1-3,5,9-12" />
          <div className="text-xs text-gray-500">Use 1-based pages. Separate by commas. Ranges like 3-7 are allowed.</div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="split-name">Output filename</Label>
          <Input id="split-name" value={splitFilename} onChange={(e) => setSplitFilename(e.target.value)} placeholder="split.pdf" />
        </div>
      </div>

      <div>
        <Button onClick={onSplit} disabled={splitting || items.length === 0} className="rounded-2xl">
          {splitting ? "Splitting…" : "Split & Download"}
        </Button>
      </div>
    </TabsContent>
  )
}
