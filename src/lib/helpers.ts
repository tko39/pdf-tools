import * as pdfjs from "pdfjs-dist"
import { PDFDocument } from "pdf-lib"

export const download = (bytes: Uint8Array, filename: string, mime = "application/pdf") => {
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export const normalizePdfName = (name: string) => {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`
}

export const parseRanges = (input: string, totalPages: number): number[] => {
  const clean = input.replace(/\s+/g, "")
  if (!clean) return []
  const parts = clean.split(",")
  const out = new Set<number>()
  for (const p of parts) {
    // single
    if (/^\d+$/.test(p)) {
      const n = Number(p)
      if (n >= 1 && n <= totalPages) out.add(n - 1)
      continue
    }
    // range
    const m = /^(\d+)-(\d+)$/.exec(p)
    if (m) {
      let a = Number(m[1])
      let b = Number(m[2])
      if (a > b) [a, b] = [b, a]
      a = Math.max(1, a)
      b = Math.min(totalPages, b)
      for (let i = a; i <= b; i++) out.add(i - 1)
    }
  }
  return Array.from(out.values()).sort((x, y) => x - y)
}

export type PageItem = {
  id: string // unique per page item (uuid)
  pageIndex: number // 0-based index within the source PDF
  thumb: string // data URL for display
  w: number // natural width of the rendered thumb (optional)
  h: number // natural height of the rendered thumb (optional)
}

// --- Thumbnail rendering with pdfjs-dist ---
export const renderAllPageThumbs = async (originalBytes: Uint8Array, maxDim = 180): Promise<PageItem[]> => {
  const bytes = originalBytes.slice(0)
  const loadingTask = pdfjs.getDocument({ data: bytes })
  const doc = await loadingTask.promise
  const pages: PageItem[] = []

  // Render each page to a canvas and get a data URL
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1 })

    const scale = viewport.width > viewport.height ? maxDim / viewport.width : maxDim / viewport.height

    const scaled = page.getViewport({ scale })
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")!
    canvas.width = Math.ceil(scaled.width)
    canvas.height = Math.ceil(scaled.height)

    await page.render({ canvas, canvasContext: ctx, viewport: scaled }).promise
    const dataUrl = canvas.toDataURL("image/png")
    pages.push({
      id: crypto.randomUUID(),
      pageIndex: p - 1,
      thumb: dataUrl,
      w: canvas.width,
      h: canvas.height,
    })
  }
  return pages
}

// --- Build a new PDF from a specific page order (using pdf-lib) ---
export const exportReorderedPdf = async (srcBytes: Uint8Array, orderedPageIndices: number[], outName: string) => {
  const src = await PDFDocument.load(srcBytes)
  const out = await PDFDocument.create()
  const copied = await out.copyPages(src, orderedPageIndices)
  copied.forEach((p) => out.addPage(p))
  const bytes = await out.save()

  // small util mirroring your existing download approach
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
  const blob = new Blob([ab], { type: "application/pdf" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = outName.toLowerCase().endsWith(".pdf") ? outName : `${outName}.pdf`
  a.click()
  URL.revokeObjectURL(url)
}
