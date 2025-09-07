import { PDFDocument, rgb } from "pdf-lib"
import fontkit from "@pdf-lib/fontkit"

export type TextAnno = {
  id: string
  type: "text"
  text: string
  xPt: number
  yPt: number // baseline Y in PDF points
  sizePt: number
  colorHex: string // "#RRGGBB"
}

export type StampAnno = {
  id: string
  type: "stamp"
  pngDataUrl: string // cached dataURL of signature image
  xPt: number
  yPt: number // bottom-left in PDF points
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
export async function renderAnnotationsToPdf(srcBytes: Uint8Array, pageIndex: number, annos: AnyAnno[]) {
  const pdf = await PDFDocument.load(srcBytes)
  pdf.registerFontkit(fontkit)

  const page = pdf.getPage(pageIndex)

  const font = await pdf.embedFont(await loadFontBytes(FONT_URL_HEBREW), { subset: true })
  // const font = await pdf.embedFont(StandardFonts.Helvetica)

  for (const a of annos) {
    if (a.type !== "stamp") continue
    const pngBytes = await dataUrlToUint8(a.pngDataUrl)
    const png = await pdf.embedPng(pngBytes)
    const scale = a.widthPt / png.width
    const w = png.width * scale
    const h = png.height * scale
    page.drawImage(png, { x: a.xPt, y: a.yPt, width: w, height: h })
  }

  for (const a of annos) {
    if (a.type !== "text") continue
    page.drawText(a.text ?? "", {
      x: a.xPt,
      y: a.yPt,
      size: a.sizePt,
      font: font,
      color: hexToRgb01(a.colorHex || "#111111"),
    })
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
