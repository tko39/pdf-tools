/* eslint-disable @typescript-eslint/no-explicit-any */
import { type AnyAnno, type StampAnno, type TextAnno, renderAnnotationsToPdf } from "@/lib/fillSignHelpers"
import { renderAllPageThumbs } from "@/lib/helpers"
import type { PdfItem } from "@/lib/types"
import * as pdfjs from "pdfjs-dist"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { PDFDocument } from "pdf-lib"

import { Button } from "../ui/button"
import { Input } from "../ui/input"
import { Label } from "../ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select"
import { TabsContent } from "../ui/tabs"
import { Textarea } from "../ui/textarea"
import { Features } from "@/lib/features"

export const TAB_NAME_FILL_SIGN = "fillSign"

type Tool = "select" | "text" | "stamp"

export function FillSignTab({ items, setError }: { items: PdfItem[]; setError: (e: string | null) => void }) {
  // ------------ Source & page selection ------------
  const [sourceId, setSourceId] = useState<string | null>(null)
  const srcItem = useMemo(() => items.find((i) => i.id === sourceId) ?? items[0], [items, sourceId])

  const [pageIndex, setPageIndex] = useState(0)
  const [pageCount, setPageCount] = useState(1)

  // PDF page size in points (used to map <-> screen)
  const [pageWPt, setPageWPt] = useState(612)
  const [pageHPt, setPageHPt] = useState(792)

  // ------------ Canvas render & zoom ------------
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)

  // hidden measurers (MUST mirror the same classes used by the visible editor box)
  const wrapMeasureRef = useRef<HTMLDivElement | null>(null)
  const textMeasureRef = useRef<HTMLTextAreaElement | null>(null)

  // track the current pdf.js render task + a token to ignore stale renders
  const renderTaskRef = useRef<any>(null)
  const paintIdRef = useRef(0)

  // structural padding (wrapper p-1 + textarea px-2/py-1 + textarea border)
  const [structPadPx, setStructPadPx] = useState({ left: 12, top: 8 })

  // font metrics (ratios of ascent/descent) + line-height ratio
  const [fontRatios, setFontRatios] = useState({ asc: 0.8, desc: 0.2 })
  const [lineHeightRatio, setLineHeightRatio] = useState(1.2)

  const [zoom, setZoom] = useState(1) // extra CSS zoom
  const [baseCss, setBaseCss] = useState<{ w: number; h: number }>({ w: 0, h: 0 }) // fit-to-width size (CSS px)
  const cssPixelsPerPoint = useMemo(() => (baseCss.w ? baseCss.w / pageWPt : 1) * zoom, [baseCss.w, pageWPt, zoom])

  // ------------ Tools & annotations ------------
  const [tool, setTool] = useState<Tool>("text")
  const [annos, setAnnos] = useState<AnyAnno[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)

  // New text defaults
  const [textColor, setTextColor] = useState("#1111FF")
  const [textSizePt, setTextSizePt] = useState(14)

  // Signature state
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [sigIsDrawing, setSigIsDrawing] = useState(false)
  const [sigDataUrl, setSigDataUrl] = useState<string | null>(null)
  const [sigWidthPt, setSigWidthPt] = useState(180)

  // Typed signature
  const [typedSigText, setTypedSigText] = useState("")
  const [typedSigFont, setTypedSigFont] = useState("SignatureFont")
  const [typedSigSizePx, setTypedSigSizePx] = useState(72)
  const [typedSigSlantDeg, setTypedSigSlantDeg] = useState(0) // italic-like shear in degrees
  const [typedSigColor, setTypedSigColor] = useState("#1111FF") // default to your textColor
  useEffect(() => setTypedSigColor(textColor), [textColor]) // keep in sync with the color picker

  // Filename
  const [fileName, setFileName] = useState("filled-signed.pdf")

  // ------------ Load page (size + count) ------------
  const loadPageMeta = useCallback(async () => {
    if (!srcItem) return
    try {
      setError(null)
      const thumbs = await renderAllPageThumbs(srcItem.bytes.slice(0), 8) // tiny thumbs; only to get num pages
      setPageCount(thumbs.length)

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

  // ------------ Measure structure + font metrics (reliable) ------------
  const measureStructure = useCallback(() => {
    const wrap = wrapMeasureRef.current
    const ta = textMeasureRef.current
    if (!wrap || !ta) return

    const ws = getComputedStyle(wrap)
    const ts = getComputedStyle(ta)

    const left =
      (parseFloat(ws.paddingLeft) || 0) + (parseFloat(ts.paddingLeft) || 0) + (parseFloat(ts.borderLeftWidth) || 0)

    const top =
      (parseFloat(ws.paddingTop) || 0) + (parseFloat(ts.paddingTop) || 0) + (parseFloat(ts.borderTopWidth) || 0)

    setStructPadPx({ left, top })
  }, [])

  const measureFont = useCallback(() => {
    const ta = textMeasureRef.current
    if (!ta) return
    const cs = getComputedStyle(ta)

    // line-height ratio (lineHeight / fontSize)
    const fs = parseFloat(cs.fontSize) || 16
    const lhVal = cs.lineHeight
    const lhPx = lhVal === "normal" ? 1.2 * fs : parseFloat(lhVal) || 1.2 * fs
    setLineHeightRatio(lhPx / fs)

    // ascent/descent ratios using canvas
    const testPx = 100
    const font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${testPx}px ${cs.fontFamily}`
    const c = document.createElement("canvas")
    const ctx = c.getContext("2d")!
    ctx.font = font
    const m = ctx.measureText("Mg")
    const asc = (m.actualBoundingBoxAscent ?? testPx * 0.8) / testPx
    const desc = (m.actualBoundingBoxDescent ?? testPx * 0.2) / testPx
    setFontRatios({ asc, desc })
  }, [])

  // callback refs: measure as soon as elements mount
  const setWrapRef = useCallback(
    (el: HTMLDivElement | null) => {
      wrapMeasureRef.current = el
      if (el && textMeasureRef.current) {
        measureStructure()
        measureFont()
      }
    },
    [measureStructure, measureFont],
  )

  const setTextRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      textMeasureRef.current = el
      if (el && wrapMeasureRef.current) {
        measureStructure()
        measureFont()
        ;(document as any).fonts?.ready?.then(() => {
          requestAnimationFrame(() => {
            measureStructure()
            measureFont()
          })
        })
      }
    },
    [measureStructure, measureFont],
  )

  useLayoutEffect(() => {
    // run after commit, then once more next frame
    measureStructure()
    measureFont()
    const id = requestAnimationFrame(() => {
      measureStructure()
      measureFont()
    })
    return () => cancelAnimationFrame(id)
  }, [measureStructure, measureFont])

  // ------------ Render page into canvas ------------
  const renderPage = useCallback(async () => {
    if (!srcItem || !canvasRef.current || !wrapperRef.current) return

    // bump paint token so older renders know they’re stale
    const myPaintId = ++paintIdRef.current

    const canvas = canvasRef.current
    const wrapperW = Math.max(320, wrapperRef.current.clientWidth)

    // load doc + page
    const loadingTask = pdfjs.getDocument({ data: srcItem.bytes.slice(0) })
    const doc = await loadingTask.promise
    const page = await doc.getPage(pageIndex + 1)

    // compute fit-width CSS size
    const base = page.getViewport({ scale: 1 })
    const fitWidthScale = wrapperW / base.width
    const cssW = Math.round(base.width * fitWidthScale)
    const cssH = Math.round(base.height * fitWidthScale)
    setBaseCss({ w: cssW, h: cssH })

    // device-pixel rendering scale
    const dpr = Math.max(1, window.devicePixelRatio || 1)
    const renderScale = fitWidthScale * zoom * dpr
    const viewport = page.getViewport({ scale: renderScale })

    // size canvas (buffer) and CSS size
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    canvas.style.width = `${Math.round(viewport.width / dpr)}px`
    canvas.style.height = `${Math.round(viewport.height / dpr)}px`

    const ctx = canvas.getContext("2d")!
    let task

    try {
      // cancel any in-flight render on this canvas before starting a new one
      try {
        renderTaskRef.current?.cancel?.()
      } catch {
        /* empty */
      }

      task = page.render({ canvas, canvasContext: ctx, viewport })
      renderTaskRef.current = task
      await task.promise
      // if another render started since we kicked off, ignore this completion
      if (paintIdRef.current !== myPaintId) return

      if (overlayRef.current) {
        overlayRef.current.style.width = canvas.style.width
        overlayRef.current.style.height = canvas.style.height
      }
    } catch (err: any) {
      // ignore cancellations; rethrow real errors
      if (err?.name !== "RenderingCancelledException") throw err
    } finally {
      // clear the ref if we’re the last render
      if (renderTaskRef.current === task) renderTaskRef.current = null
      // optional: free page operator list memory
      try {
        page.cleanup?.()
      } catch {
        /* empty */
      }
    }
  }, [srcItem, pageIndex, zoom])

  useEffect(() => {
    void renderPage()
  }, [renderPage])

  useEffect(() => {
    const ro = new ResizeObserver(() => void renderPage())
    if (wrapperRef.current) ro.observe(wrapperRef.current)
    return () => ro.disconnect()
  }, [renderPage])

  useEffect(() => {
    return () => {
      try {
        renderTaskRef.current?.cancel?.()
      } catch {
        /* empty */
      }
    }
  }, [])

  // ------------ Overlay interaction ------------
  const cssToPdf = useCallback(
    (xCss: number, yCss: number) => {
      const xPt = xCss / cssPixelsPerPoint
      const yPt = pageHPt - yCss / cssPixelsPerPoint
      return { xPt, yPt }
    },
    [cssPixelsPerPoint, pageHPt],
  )

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
    if (tool === "select") return
    if (!overlayRef.current) return

    const rect = overlayRef.current.getBoundingClientRect()
    const xCss = e.clientX - rect.left
    const yCss = e.clientY - rect.top
    const { xPt, yPt } = cssToPdf(xCss, yCss)

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
          pageIndex,
        } as TextAnno,
      ])
      setActiveId(id)
      setTool("select")
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
          pageIndex,
        } as StampAnno,
      ])
      setActiveId(id)
      setTool("select")
    }
  }

  // Dragging annotations (custom)
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
    const dyPt = -dyCss / cssPixelsPerPoint
    setAnnos((prev) =>
      prev.map((a) => (a.id === st.id ? { ...a, xPt: st.startPt!.x + dxPt, yPt: st.startPt!.y + dyPt } : a)),
    )
  }

  const onAnnoPointerUp = (e: React.PointerEvent) => {
    if (dragState.current.id) (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    dragState.current = { id: null, startX: 0, startY: 0, startPt: null }
  }

  const removeActive = () => {
    if (!activeId) return
    setAnnos((prev) => prev.filter((a) => a.id !== activeId))
    setActiveId(null)
  }

  // start drag only when clicking the border/handle (not the textarea)
  const onTextBorderPointerDown = (id: string, e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return
    if (tool !== "select") return
    onAnnoPointerDown(id, e)
  }

  // ------------ Signature pad ------------
  const startSig = (e: React.PointerEvent) => {
    if (!sigCanvasRef.current) return
    const ctx = sigCanvasRef.current.getContext("2d")!
    ctx.lineWidth = 2
    ctx.lineCap = "round"
    ctx.strokeStyle = textColor
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

  const ensureFontLoaded = useCallback(async (family: string, sizePx = 72) => {
    try {
      await document.fonts?.load(`${sizePx}px "${family}"`)
      await document.fonts?.ready
    } catch {
      /* ignore if unsupported; browser will fallback */
    }
  }, [])

  const makeTypedSigPng = useCallback(async () => {
    const raw = typedSigText.trim()
    if (!raw) return

    await ensureFontLoaded(typedSigFont, typedSigSizePx)

    // Prepare lines
    const lines = raw.split(/\r?\n/)
    const pad = 12 // transparent padding
    const lineHeight = Math.round(typedSigSizePx * 1.2)

    // Measure with a scratch canvas
    const mc = document.createElement("canvas")
    const mctx = mc.getContext("2d")!
    mctx.font = `${typedSigSizePx}px "${typedSigFont}", Helvetica, Arial, sans-serif`
    mctx.textBaseline = "alphabetic"

    let maxW = 0
    let maxAsc = 0
    let maxDesc = 0

    const metrics = lines.map((txt) => {
      const m = mctx.measureText(txt || " ")
      const asc = m.actualBoundingBoxAscent ?? typedSigSizePx * 0.8
      const desc = m.actualBoundingBoxDescent ?? typedSigSizePx * 0.2
      const w = (m.actualBoundingBoxRight ?? m.width) - (m.actualBoundingBoxLeft ?? 0)

      maxW = Math.max(maxW, Math.ceil(w))
      maxAsc = Math.max(maxAsc, Math.ceil(asc))
      maxDesc = Math.max(maxDesc, Math.ceil(desc))

      return { txt, asc, desc, w }
    })

    // Canvas size: tallest baseline box + line spacing between lines
    const width = Math.max(1, maxW + pad * 2)
    const height = Math.max(
      1,
      pad * 2 + (metrics.length > 0 ? maxAsc + maxDesc + (metrics.length - 1) * lineHeight : lineHeight),
    )

    // Draw into the real canvas
    const c = document.createElement("canvas")
    c.width = width
    c.height = height

    const ctx = c.getContext("2d")!
    ctx.clearRect(0, 0, width, height)
    ctx.font = `${typedSigSizePx}px "${typedSigFont}", Helvetica, Arial, sans-serif`
    ctx.textBaseline = "alphabetic"
    ctx.fillStyle = typedSigColor

    // Optional shear for slant
    const shear = Math.tan((typedSigSlantDeg * Math.PI) / 180)
    ctx.save()
    if (typedSigSlantDeg !== 0) ctx.setTransform(1, 0, shear, 1, 0, 0)

    // Draw lines (baseline starts at top padding + ascent)
    let y = pad + maxAsc
    for (const m of metrics) {
      const x = pad
      ctx.fillText(m.txt, x, y)
      y += lineHeight
    }
    ctx.restore()

    setSigDataUrl(c.toDataURL("image/png"))
    setTool("stamp")
  }, [typedSigText, typedSigFont, typedSigSizePx, typedSigSlantDeg, typedSigColor, ensureFontLoaded, setTool])

  const drawImageToSigCanvas = useCallback(
    async (dataUrl: string) => {
      if (!sigCanvasRef.current || !dataUrl) return

      const img = new Image()
      img.decoding = "async"
      // For data: URLs and same-origin blob: URLs this is fine
      img.src = dataUrl

      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("Failed to load signature image"))
      })

      const canvas = sigCanvasRef.current
      const ctx = canvas.getContext("2d")!
      const cw = canvas.width
      const ch = canvas.height

      // Clear previous strokes/preview
      ctx.clearRect(0, 0, cw, ch)

      // Contain-fit while preserving aspect ratio
      const iw = img.naturalWidth || img.width
      const ih = img.naturalHeight || img.height
      const scale = Math.min(cw / iw, ch / ih)
      const dw = Math.max(1, Math.floor(iw * scale))
      const dh = Math.max(1, Math.floor(ih * scale))
      const dx = Math.floor((cw - dw) / 2)
      const dy = Math.floor((ch - dh) / 2)

      ctx.drawImage(img, dx, dy, dw, dh)
    },
    [sigCanvasRef],
  )

  // Keep the canvas preview in sync anytime sigDataUrl changes
  useEffect(() => {
    if (sigDataUrl) {
      // show typed or uploaded PNG inside the signature canvas
      void drawImageToSigCanvas(sigDataUrl)
    } else {
      // if cleared, wipe the preview
      if (sigCanvasRef.current) {
        const ctx = sigCanvasRef.current.getContext("2d")!
        ctx.clearRect(0, 0, sigCanvasRef.current.width, sigCanvasRef.current.height)
      }
    }
  }, [sigDataUrl, drawImageToSigCanvas])

  // ------------ Export (adjust per-annotation for exact baseline) ------------
  const onDownload = useCallback(async () => {
    try {
      setError(null)
      if (!srcItem) return

      // convert struct padding from CSS px -> PDF pt
      const padXPt = structPadPx.left / cssPixelsPerPoint

      // build adjusted annos: text gets baseline offset derived from font metrics & current size
      const adjusted: AnyAnno[] = annos.map((a) => {
        if (a.type !== "text") return a
        const fontPx = a.sizePt * cssPixelsPerPoint
        const ascPx = fontRatios.asc * fontPx
        const descPx = fontRatios.desc * fontPx
        const linePx = lineHeightRatio * fontPx
        const baselineWithin = (linePx - (ascPx + descPx)) / 2 + ascPx // top->baseline
        const padYPt = (structPadPx.top + baselineWithin) / cssPixelsPerPoint

        // This is still buggy, working on it... Added `/2` to reduce impact for now
        return { ...a, xPt: a.xPt + padXPt, yPt: a.yPt + padYPt / 2 } as TextAnno
      })

      const out = await renderAnnotationsToPdf(srcItem.bytes, adjusted)
      const url = URL.createObjectURL(new Blob([out], { type: "application/pdf" }))
      const a = document.createElement("a")
      a.href = url
      a.download = fileName.toLowerCase().endsWith(".pdf") ? fileName : `${fileName}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      setError(e?.message ?? "Failed to save PDF")
    }
  }, [
    setError,
    srcItem,
    annos,
    fileName,
    structPadPx.left,
    structPadPx.top,
    cssPixelsPerPoint,
    fontRatios.asc,
    fontRatios.desc,
    lineHeightRatio,
  ])

  // ------------ UI ------------
  return (
    <TabsContent value={TAB_NAME_FILL_SIGN} className="space-y-6">
      <div className="mb-2 px-4 py-2 rounded-md bg-yellow-50 border border-yellow-300 text-yellow-900 text-sm flex items-center gap-2">
        <svg
          className="w-4 h-4 text-yellow-500 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
          <line x1="12" y1="8" x2="12" y2="12" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="16" r="1" fill="currentColor" />
        </svg>
        <span>
          <strong>Disclaimer:</strong> Signing is NOT a digital signature. It is only a visual representation of a
          signature.
        </span>
      </div>
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
              width={290}
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
                Signature ready. Switch to “Signature” tool and click the page to place.
              </div>
            )}
          </div>

          {/* Typed signature */}
          <div className="mt-4 space-y-2 border-t pt-3">
            <Label>Typed signature</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="col-span-1 sm:col-span-2">
                <Input
                  placeholder="Type your name…"
                  value={typedSigText}
                  onChange={(e) => setTypedSigText(e.target.value)}
                />
              </div>

              {Features.FillSign.signatureFontModifiersEnabled && (
                <>
                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Font</Label>
                    <Select value={typedSigFont} onValueChange={setTypedSigFont}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Choose font" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SignatureFont">SignatureFont</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Size (px)</Label>
                    <Input
                      type="number"
                      className="w-24 h-8"
                      value={typedSigSizePx}
                      min={24}
                      max={200}
                      onChange={(e) => setTypedSigSizePx(Number(e.target.value))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Slant (°)</Label>
                    <Input
                      type="number"
                      className="w-24 h-8"
                      value={typedSigSlantDeg}
                      min={-25}
                      max={25}
                      step={1}
                      onChange={(e) => setTypedSigSlantDeg(Number(e.target.value))}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label className="text-xs">Color</Label>
                    <input
                      type="color"
                      className="h-8 w-8 rounded"
                      value={typedSigColor}
                      onChange={(e) => setTypedSigColor(e.target.value)}
                    />
                  </div>
                </>
              )}

              <div className="col-span-1 sm:col-span-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={makeTypedSigPng} disabled={!typedSigText.trim()}>
                  Create typed signature
                </Button>
                {sigDataUrl && (
                  <div className="text-xs text-gray-500">
                    Typed signature ready. Switch to “Signature” tool and click the page to place.
                  </div>
                )}
              </div>
            </div>
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
                style={{ userSelect: "none" }}
              >
                {annos
                  .filter((a) => a.pageIndex === pageIndex)
                  .map((a) => {
                    if (a.type === "text") {
                      const { xCss, yCss } = pdfToCss(a.xPt, a.yPt)
                      return (
                        <div
                          key={a.id}
                          className="absolute"
                          style={{ left: xCss, top: yCss, transform: "translateY(-100%)" }}
                          onPointerMove={onAnnoPointerMove}
                          onPointerUp={onAnnoPointerUp}
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveId(a.id)
                          }}
                        >
                          {/* DRAG BORDER / HANDLE */}
                          <div
                            className={[
                              "relative inline-block rounded-md p-1 group",
                              activeId === a.id ? "ring-2 ring-blue-300" : "ring-1 ring-transparent",
                              tool === "select" ? "cursor-move" : "cursor-text",
                            ].join(" ")}
                            onPointerDown={(e) => onTextBorderPointerDown(a.id, e)}
                            ref={setWrapRef}
                          >
                            {/* EDITABLE TEXT */}
                            <Textarea
                              value={a.text}
                              onChange={(e) =>
                                setAnnos((prev) =>
                                  prev.map((p) => (p.id === a.id ? { ...p, text: e.target.value } : p)),
                                )
                              }
                              className="min-w-[120px] min-h-[28px] bg-white/80 border rounded-md px-2 py-1 resize-none shadow-sm"
                              style={{
                                fontSize: `${a.sizePt * cssPixelsPerPoint}px`,
                                lineHeight: 1.2,
                                color: a.colorHex,
                              }}
                              onPointerDownCapture={(e) => e.stopPropagation()}
                              onMouseDownCapture={(e) => e.stopPropagation()}
                              onTouchStartCapture={(e) => e.stopPropagation()}
                              ref={setTextRef}
                            />
                            {/* REMOVE BUTTON */}
                            <Button
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition"
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
                          className="absolute group cursor-move"
                          style={{ left: xCss, top: yCss, width: wCss, transform: "translateY(-100%)" }}
                          onPointerDown={(e) => onAnnoPointerDown(a.id, e)}
                          onPointerMove={onAnnoPointerMove}
                          onPointerUp={onAnnoPointerUp}
                          onClick={(e) => {
                            e.stopPropagation()
                            setActiveId(a.id)
                          }}
                        >
                          {a.pngDataUrl && (
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

      {/* HIDDEN MEASURERS (must mirror editor classes exactly) */}
      <div className="absolute -z-50 opacity-0 pointer-events-none">
        <div ref={setWrapRef} className="inline-block rounded-md p-1">
          <Textarea
            ref={setTextRef}
            className="min-w-[120px] min-h-[28px] bg-white/80 border rounded-md px-2 py-1 resize-none shadow-sm"
            readOnly
            aria-hidden
            style={{ lineHeight: 1.2, fontFamily: "Helvetica, Arial, sans-serif" }}
          />
        </div>
      </div>
    </TabsContent>
  )
}
