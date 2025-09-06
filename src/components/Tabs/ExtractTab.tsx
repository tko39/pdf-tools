/* eslint-disable @typescript-eslint/no-explicit-any */
import * as pdfjs from "pdfjs-dist"
import { useCallback, useState } from "react"
import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TabsContent } from "../ui/tabs"
import type { PdfItem } from "@/lib/types"
import { download } from "@/lib/helpers"

export const TAB_NAME_EXTRACT = "extract"

export const ExtractTab = ({ items, setError }: { items: PdfItem[]; setError: (error: string | null) => void }) => {
  const [extracting, setExtracting] = useState(false)
  const [textSourceId, setTextSourceId] = useState<string | null>(null)
  const [textFilename, setTextFilename] = useState("extracted.txt")

  const onExtractText = useCallback(async () => {
    setError(null)
    const srcItem = items.find((i) => i.id === textSourceId) || items[0]
    if (!srcItem) {
      setError("Add a PDF and select it to extract text.")
      return
    }
    setExtracting(true)
    try {
      const doc = await pdfjs.getDocument({ data: srcItem.bytes }).promise
      const n = doc.numPages
      let all = ""
      for (let p = 1; p <= n; p++) {
        const page = await doc.getPage(p)
        const tc = await page.getTextContent()
        const text = tc.items.map((it: any) => ("str" in it ? it.str : "")).join("")
        all += `\n\n--- Page ${p} ---\n${text}`
      }
      const enc = new TextEncoder()
      const bytes = enc.encode(all.trimStart())
      download(bytes, textFilename, "text/plain")
    } catch (e: unknown) {
      setError((e as Error)?.message || "Failed to extract text")
    } finally {
      setExtracting(false)
    }
  }, [setError, items, textSourceId, textFilename])

  return (
    <TabsContent value="extract" className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex flex-col gap-2">
          <Label>Source PDF</Label>
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add a PDF above to extract text.</div>
          ) : (
            <Select value={textSourceId ?? items[0]?.id ?? ""} onValueChange={(v) => setTextSourceId(v)}>
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
          <Label htmlFor="txt-name">Output filename</Label>
          <Input id="txt-name" value={textFilename} onChange={(e) => setTextFilename(e.target.value)} placeholder="extracted.txt" />
        </div>
      </div>

      <div>
        <Button onClick={onExtractText} disabled={extracting || items.length === 0} className="rounded-2xl">
          {extracting ? "Extracting…" : "Extract Text"}
        </Button>
      </div>
    </TabsContent>
  )
}
