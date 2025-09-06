// src/components/Tabs/FillSignTab.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type AnyAnno, type StampAnno, type TextAnno, renderAnnotationsToPdf } from "@/lib/fillSignHelpers"
import { renderAllPageThumbs } from "@/lib/helpers" // for quick page count (we won't show thumbs)
import type { PdfItem } from "@/lib/types"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import * as pdfjs from "pdfjs-dist"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TabsContent } from "../ui/tabs"

// If you don't have Textarea installed yet:  npx shadcn@latest add textarea
import { Textarea } from "../ui/textarea"

export const TAB_NAME_FILL_SIGN = "fillSign"

type Tool = "select" | "text" | "stamp"

export function FillSignTab({ items, setError }: { items: PdfItem[]; setError: (e: string | null) => void }) {
  // ------------ Source & page selection ------------
  const [sourceId, setSourceId] = useState<string | null>(null)
  const srcItem = useMemo(() => items.find((i) => i.id === sourceId) ?? items[0], [items, sourceId])

  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)

  // PDF page size in points (used to map <-> screen)
  const [pageWPt, setPageWPt] = useState(612) // default A4-ish
  const [pageHPt, setPageHPt] = useState(792)

  // ------------ Canvas render & zoom ------------
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const measureRef = useRef<HTMLTextAreaElement | null>(null)
  const [padPx, setPadPx] = useState({ left: 8, top: 4 })

  const [zoom, setZoom] = useState(1) // CSS zoom factor on top of "fit width"
  const [baseCss, setBaseCss] = useState<{ w: number; h: number }>({ w: 0, h: 0 }) // fit-to-width size, in CSS px
  const cssPixelsPerPoint = useMemo(() => (baseCss.w ? baseCss.w / pageWPt : 1) * zoom, [baseCss.w, pageWPt, zoom])

  // ------------ Tools & annotations ------------
  const [tool, setTool] = useState<Tool>("text")
  const [annos, setAnnos] = useState<AnyAnno[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // New text defaults
  const [textColor, setTextColor] = useState("#111111")
  const [textSizePt, setTextSizePt] = useState(14)

  // Signature state
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [sigIsDrawing, setSigIsDrawing] = useState(false)
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null)
  const [sigWidthPt, setSigWidthPt] = useState(180)

  // Filename
  const [fileName, setFileName] = useState("filled-signed.pdf")

  // ------------ Load page (size + count) ------------
  const loadPageMeta = useCallback(async () => {
    if (!srcItem) return
    try {
      setError(null)
      // use pdfjs just to get numPages quickly / consistently; also sets up page pixels later
      const thumbs = await renderAllPageThumbs(srcItem.bytes.slice(0), 8) // tiny thumbs; we only need count
      setPageCount(thumbs.length)

      // get page size in points using pdf-lib (reliable for mapping)
      const { PDFDocument } = await import("pdf-lib")
      const doc = await PDFDocument.load(srcItem.bytes)
      const pg = doc.getPage(pageIndex)
      setPageWPt(pg.getWidth())
      setPageHPt(pg.getHeight())
    } catch (e: any) {
      setError(e?.message ?? "Failed to read PDF")
    }
  }, [srcItem, pageIndex, setError])

  useEffect(() => {
    if (items.length > 0) void loadPageMeta()
    else {
      setPageCount(1)
      setPageWPt(612)
      setPageHPt(792)
    }
  }, [items, sourceId, pageIndex, loadPageMeta])

  useEffect(() => {
    if (!measureRef.current) return
    const cs = getComputedStyle(measureRef.current)
    setPadPx({
      left: parseFloat(cs.paddingLeft) || 0,
      top: parseFloat(cs.paddingTop) || 0,
    })
  }, [])

  // ------------ Render page into canvas ------------
  const renderPage = useCallback(async () => {
    if (!srcItem || !canvasRef.current || !wrapperRef.current) return
    const canvas = canvasRef.current
    const wrapperW = Math.max(320, wrapperRef.current.clientWidth)

    // pdfjs render at fit-width * zoom * dpr
    // 1) get page viewport @ scale=1 for base width
    const loadingTask = pdfjs.getDocument({ data: srcItem.bytes.slice(0) })
    const doc = await loadingTask.promise
    const page = await doc.getPage(pageIndex + 1)

    const base = page.getViewport({ scale: 1 })
    const fitWidthScale = wrapperW / base.width
    const cssW = Math.round(base.width * fitWidthScale)
    const cssH = Math.round(base.height * fitWidthScale)
    setBaseCss({ w: cssW, h: cssH })

    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const renderScale = fitWidthScale * zoom * dpr

    const viewport = page.getViewport({ scale: renderScale })
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    canvas.style.width = `${Math.round(viewport.width / dpr)}px`
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`

    const ctx = canvas.getContext("2d")!
    await page.render({ canvas, canvasContext: ctx, viewport }).promise
    // size overlay to CSS size
    if (overlayRef.current) {
      overlayRef.current.style.width = canvas.style.width
      overlayRef.current.style.height = canvas.style.height
    }
  }, [srcItem, pageIndex, zoom])

  // re-render on source/page/zoom or container resize
  useEffect(() => {
    void renderPage()
  }, [renderPage])

  useEffect(() => {
    const ro = new ResizeObserver(() => void renderPage())
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [renderPage])

  // ------------ Overlay interaction ------------
  // Convert CSS px (overlay coords) -> PDF points
  const cssToPdf = useCallback(
    (xCss: number, yCss: number) => {
      const xPt = xCss / cssPixelsPerPoint
      const yPt = pageHPt - yCss / cssPixelsPerPoint
      return { xPt, yPt }
    },
    [cssPixelsPerPoint, pageHPt],
  )

  // Convert PDF points -> CSS px
  const pdfToCss = useCallback(
    (xPt: number, yPt: number) => {
      const xCss = xPt * cssPixelsPerPoint
      const yCss = (pageHPt - yPt) * cssPixelsPerPoint
      return { xCss, yCss }
    },
    [cssPixelsPerPoint, pageHPt],
  )

  // Place new objects by clicking empty space
  const onOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Ignore clicks that started on an annotation (we’ll stopPropagation on its handlers)
    if (tool === "select") return
    if (!overlayRef.current) return

    const rect = overlayRef.current.getBoundingClientRect()
    const xCss = e.clientX - rect.left
    const yCss = e.clientY - rect.top
    const { xPt, yPt } = cssToPdf(xCss, yCss)
    console.log("click at", { xCss, yCss, xPt, yPt })

    if (tool === "text") {
      const id = crypto.randomUUID()
      setAnnos((prev) => [
        ...prev,
        {
          id,
          type: "text",
          text: "Text",
          xPt,
          yPt,
          sizePt: textSizePt,
          colorHex: textColor,
        } as TextAnno,
      ])
      setActiveId(id)
    } else if (tool === "stamp" && sigDataUrl) {
      const id = crypto.randomUUID()
      setAnnos((prev) => [
        ...prev,
        {
          id,
          type: "stamp",
          pngDataUrl: sigDataUrl,
          xPt,
          yPt,
          widthPt: sigWidthPt,
        } as StampAnno,
      ])
      setActiveId(id)
    }
  }

  // Dragging annotations
  const dragState = useRef<{
    id: string | null
    startX: number
    startY: number
    startPt: { x: number; y: number } | null
  }>({
    id: null,
    startX: 0,
    startY: 0,
    startPt: null,
  })

  const onAnnoPointerDown = (id: string, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveId(id)
    if (!overlayRef.current) return
    const rect = overlayRef.current.getBoundingClientRect()
    const xCss = e.clientX - rect.left
    const yCss = e.clientY - rect.top
    const a = annos.find((a) => a.id === id)!
    dragState.current = { id, startX: xCss, startY: yCss, startPt: { x: a.xPt, y: a.yPt } }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onAnnoPointerMove = (e: React.PointerEvent) => {
    const st = dragState.current
    if (!st.id || !overlayRef.current || !st.startPt) return
    const rect = overlayRef.current.getBoundingClientRect()
    const xCss = e.clientX - rect.left
    const yCss = e.clientY - rect.top
    const dxCss = xCss - st.startX
    const dyCss = yCss - st.startY
    const dxPt = dxCss / cssPixelsPerPoint
    const dyPt = -dyCss / cssPixelsPerPoint // invert Y

    setAnnos((prev) =>
      prev.map((a) => (a.id === st.id ? { ...a, xPt: st.startPt!.x + dxPt, yPt: st.startPt!.y + dyPt } : a)),
    )
  }

  const onAnnoPointerUp = (e: React.PointerEvent) => {
    if (dragState.current.id) {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    }
    dragState.current = { id: null, startX: 0, startY: 0, startPt: null }
  }

  const removeActive = () => {
    if (!activeId) return
    setAnnos((prev) => prev.filter((a) => a.id !== activeId))
    setActiveId(null)
  }

  // ------------ Signature pad ------------
  const startSig = (e: React.PointerEvent) => {
    if (!sigCanvasRef.current) return
    const ctx = sigCanvasRef.current.getContext("2d")!
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = "#111"
    ctx.beginPath()
    const r = sigCanvasRef.current.getBoundingClientRect()
    ctx.moveTo(e.clientX - r.left, e.clientY - r.top)
    setSigIsDrawing(true)
  }
  const moveSig = (e: React.PointerEvent) => {
    if (!sigIsDrawing || !sigCanvasRef.current) return
    const ctx = sigCanvasRef.current.getContext("2d")!
    const r = sigCanvasRef.current.getBoundingClientRect()
    ctx.lineTo(e.clientX - r.left, e.clientY - r.top)
    ctx.stroke()
  }
  const endSig = () => setSigIsDrawing(false)
  const clearSig = () => {
    if (!sigCanvasRef.current) return
    const ctx = sigCanvasRef.current.getContext("2d")!
    ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height)
    setSigDataUrl(null)
  }
  const saveSig = () => {
    if (!sigCanvasRef.current) return
    setSigDataUrl(sigCanvasRef.current.toDataURL("image/png"))
  }
  const uploadSig = async (file: File | null) => {
    if (!file) return
    const buf = await file.arrayBuffer()
    const blob = new Blob([buf], { type: "image/png" })
    setSigDataUrl(URL.createObjectURL(blob))
  }

  // ------------ Export ------------
  const onDownload = useCallback(async () => {
    try {
      setError(null)
      if (!srcItem) return

      // CSS px -> PDF points using your current mapping
      const padXPt = padPx.left / cssPixelsPerPoint
      const padYPt = padPx.top / cssPixelsPerPoint

      const out = await renderAnnotationsToPdf(srcItem.bytes, pageIndex, annos, {
        textPadXPt: padXPt,
        textPadYPt: padYPt,
      })

      const url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }))
      const a = document.createElement("a")
      a.href = url
      a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message ?? "Failed to save PDF")
    }
  }, [srcItem, pageIndex, annos, fileName, setError, padPx.left, padPx.top, cssPixelsPerPoint])

  // ------------ UI ------------
  return (
    <TabsContent value={TAB_NAME_FILL_SIGN} className="space-y-6">
      {/* Top bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:items-end">
        <div className="flex flex-col gap-2">
          <Label>Source PDF</Label>
          {items.length === 0 ? (
            <div className="text-sm text-gray-500">Add a PDF above.</div>
          ) : (
            <Select
              value={sourceId ?? items[0]?.id ?? ""}
              onValueChange={(v) => {
                setSourceId(v)
                setAnnos([])
              }}
            >
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

        <div className="flex items-center gap-2">
          <div className="flex flex-col gap-2">
            <Label>Page</Label>
            <Input
              type="number"
              min={1}
              max={pageCount || 1}
              value={pageIndex + 1}
              onChange={(e) => {
                setPageIndex(Math.min(Math.max(1, Number(e.target.value)), pageCount) - 1)
                setAnnos([])
              }}
              className="w-28"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Zoom</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.max(0.5, +(z - 0.1).toFixed(2)))}>
                -
              </Button>
              <div className="w-12 text-center text-sm">{Math.round(zoom * 100)}%</div>
              <Button variant="outline" size="sm" onClick={() => setZoom((z) => Math.min(3, +(z + 0.1).toFixed(2)))}>
                +
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>
                Fit
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-end gap-2">
          <Input value={fileName} onChange={(e) => setFileName(e.target.value)} className="w-56" />
          <Button onClick={onDownload} disabled={!srcItem}>
            Save & Download
          </Button>
        </div>
      </div>

      {/* Tools */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Label className="text-xs">Tool</Label>
          <div className="flex rounded-xl border bg-white overflow-hidden">
            <Button variant={tool === "select" ? "default" : "ghost"} size="sm" onClick={() => setTool("select")}>
              Select
            </Button>
            <Button variant={tool === "text" ? "default" : "ghost"} size="sm" onClick={() => setTool("text")}>
              Text
            </Button>
            <Button
              variant={tool === "stamp" ? "default" : "ghost"}
              size="sm"
              onClick={() => setTool("stamp")}
              disabled={!sigDataUrl}
            >
              Signature
            </Button>
          </div>
        </div>

        {tool !== "stamp" && (
          <>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Text size</Label>
              <Input
                type="number"
                className="w-20 h-8"
                value={textSizePt}
                min={8}
                max={48}
                onChange={(e) => setTextSizePt(Number(e.target.value))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs">Color</Label>
              <input
                type="color"
                className="h-8 w-8 rounded"
                value={textColor}
                onChange={(e) => setTextColor(e.target.value)}
              />
            </div>
          </>
        )}

        {tool === "stamp" && (
          <div className="flex items-center gap-2">
            <Label className="text-xs">Signature width (pt)</Label>
            <Input
              type="number"
              className="w-24 h-8"
              value={sigWidthPt}
              min={60}
              max={600}
              onChange={(e) => setSigWidthPt(Number(e.target.value))}
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAnnos([])
              setActiveId(null)
            }}
            disabled={annos.length === 0}
          >
            Clear annotations
          </Button>
          <Button variant="outline" size="sm" onClick={removeActive} disabled={!activeId}>
            Delete selected
          </Button>
        </div>
      </div>

      {/* Signature pad */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>Signature (draw or upload once, then place anywhere)</Label>
          <div className="rounded-xl border bg-white p-3">
            <canvas
              ref={sigCanvasRef}
              width={400}
              height={140}
              className="w-full h-[140px] touch-none bg-white"
              onPointerDown={startSig}
              onPointerMove={moveSig}
              onPointerUp={endSig}
              onPointerCancel={endSig}
              onPointerLeave={endSig}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={clearSig}>
                Clear
              </Button>
              <Button size="sm" onClick={saveSig}>
                Save Signature
              </Button>
              <label className="inline-flex items-center gap-2 text-xs">
                <span className="text-gray-600">or Upload PNG</span>
                <input
                  type="file"
                  accept="image/png"
                  className="hidden"
                  onChange={(e) => uploadSig(e.target.files?.[0] ?? null)}
                />
                <Button asChild variant="outline" size="sm">
                  <span>Choose file</span>
                </Button>
              </label>
            </div>
            {sigDataUrl && (
              <div className="text-xs text-gray-500 mt-1">
                Signature ready. Switch to the “Signature” tool and click the page to place.
              </div>
            )}
          </div>
        </div>

        {/* Editor: canvas + overlay */}
        <div className="md:col-span-2">
          <Label>Edit Page {pageIndex + 1}</Label>
          <div ref={wrapperRef} className="relative w-full rounded-xl border bg-white p-2 overflow-auto max-h-[75vh]">
            <div className="relative inline-block">
              <canvas ref={canvasRef} className="block select-none" />
              <div
                ref={overlayRef}
                className="absolute left-0 top-0"
                onClick={onOverlayClick}
                // prevent selecting images/text while dragging children
                style={{ userSelect: "none" }}
              >
                {annos.map((a) => {
                  if (a.type === "text") {
                    const { xCss, yCss } = pdfToCss(a.xPt, a.yPt)
                    return (
                      <div
                        key={a.id}
                        className={`absolute group`}
                        style={{ left: xCss, top: yCss, transform: "translateY(-100%)" }} // baseline -> top-left
                        onPointerDown={(e) => onAnnoPointerDown(a.id, e)}
                        onPointerMove={onAnnoPointerMove}
                        onPointerUp={onAnnoPointerUp}
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveId(a.id)
                        }}
                      >
                        <Textarea
                          ref={measureRef}
                          value={a.text}
                          onChange={(e) =>
                            setAnnos((prev) => prev.map((p) => (p.id === a.id ? { ...p, text: e.target.value } : p)))
                          }
                          className={`min-w-[120px] min-h-[28px] bg-white/80 border rounded-md px-2 py-1 resize-none shadow-sm ${
                            activeId === a.id ? "ring-2 ring-blue-300" : ""
                          }`}
                          style={{
                            fontSize: `${a.sizePt * cssPixelsPerPoint}px`,
                            lineHeight: 1.2,
                            color: a.colorHex,
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        />
                        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAnnos((prev) => prev.filter((p) => p.id !== a.id))
                            }}
                            onPointerDownCapture={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )
                  } else {
                    const { xCss, yCss } = pdfToCss(a.xPt, a.yPt)
                    const wCss = a.widthPt * cssPixelsPerPoint
                    return (
                      <div
                        key={a.id}
                        className={`absolute group`}
                        style={{ left: xCss, top: yCss, width: wCss, transform: "translateY(-100%)" }}
                        onPointerDown={(e) => onAnnoPointerDown(a.id, e)}
                        onPointerMove={onAnnoPointerMove}
                        onPointerUp={onAnnoPointerUp}
                        onClick={(e) => {
                          e.stopPropagation()
                          setActiveId(a.id)
                        }}
                      >
                        {sigDataUrl && (
                          <img
                            src={a.pngDataUrl}
                            alt="Signature"
                            className={`block select-none ${activeId === a.id ? "ring-2 ring-blue-300" : ""}`}
                            style={{ width: "100%", height: "auto", pointerEvents: "none" }}
                            draggable={false}
                          />
                        )}
                        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition">
                          <Button
                            variant="destructive"
                            size="icon"
                            className="h-6 w-6 rounded-full"
                            onClick={(e) => {
                              e.stopPropagation()
                              setAnnos((prev) => prev.filter((p) => p.id !== a.id))
                            }}
                            onPointerDownCapture={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                            }}
                          >
                            ×
                          </Button>
                        </div>
                      </div>
                    )
                  }
                })}
              </div>
            </div>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            Tip: choose a tool, click the page to add; drag to move; use Delete selected to remove.
          </div>
        </div>
      </div>
    </TabsContent>
  )
}
