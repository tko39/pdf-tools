import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"

type BaseAnno = {
  id: string
  pageIndex: number
  type: "text" | "stamp"
  xPt: number
  yPt: number
}

export type TextAnno = BaseAnno & {
  type: "text"
  text: string
  sizePt: number
  colorHex: string // "#RRGGBB"
}

export type StampAnno = BaseAnno & {
  type: "stamp"
  pngDataUrl: string // cached dataURL of signature image
  widthPt: number
}

export type AnyAnno = TextAnno | StampAnno

export async function dataUrlToUint8(dataUrl: string): Promise<Uint8Array> {
  const res = await fetch(dataUrl)
  const ab = await res.arrayBuffer()
  return new Uint8Array(ab)
}

export function hexToRgb01(hex: string) {
  const h = hex.replace("#", "")
  const v =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h
  const r = parseInt(v.slice(0, 2), 16) / 255
  const g = parseInt(v.slice(2, 4), 16) / 255
  const b = parseInt(v.slice(4, 6), 16) / 255
  return rgb(r, g, b)
}

/** Draw annotations onto the given PDF bytes and return new bytes */
export async function renderAnnotationsToPdf(srcBytes: Uint8Array, annos: AnyAnno[]) {
  const pdf = await PDFDocument.load(srcBytes)
  pdf.registerFontkit(fontkit)

  const pages = pdf.getPages()
  const font = await pdf.embedFont(await loadFontBytes(FONT_URL_HEBREW), { subset: true })
  // const font = await pdf.embedFont(StandardFonts.Helvetica)

  for (const page of pages) {
    const currentPageIndex = pages.indexOf(page)
    const currentPageAnnos = annos.filter((a) => a.pageIndex === currentPageIndex)
    if (currentPageAnnos.length === 0) continue

    for (const a of currentPageAnnos) {
      if (a.type !== "stamp") continue
      const pngBytes = await dataUrlToUint8(a.pngDataUrl)
      const png = await pdf.embedPng(pngBytes)
      const scale = a.widthPt / png.width
      const w = png.width * scale
      const h = png.height * scale
      page.drawImage(png, { x: a.xPt, y: a.yPt, width: w, height: h })
    }

    for (const a of currentPageAnnos) {
      if (a.type !== "text") continue
      page.drawText(a.text ?? "", {
        x: a.xPt,
        y: a.yPt,
        size: a.sizePt,
        font: font,
        color: hexToRgb01(a.colorHex || "#111111"),
      })
    }
  }

  return new Uint8Array(await pdf.save())
}

async function loadFontBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url)
  return new Uint8Array(await res.arrayBuffer())
}

// Preload both fonts (Latin + Hebrew)
const FONT_URL_HEBREW = "fonts/NotoSansHebrew-Regular.ttf"

const HEBREW_RE = /[\u0590-\u05FF\uFB1D-\uFB4F]/

export function containsHebrew(s: string) {
  return HEBREW_RE.test(s)
}
