import { PDFDocument, StandardFonts, rgb } from "pdf-lib"

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
export async function renderAnnotationsToPdf(
  srcBytes: Uint8Array,
  pageIndex: number,
  annos: AnyAnno[],
  opts?: { textPadXPt?: number; textPadYPt?: number },
) {
  const pdf = await PDFDocument.load(srcBytes)
  const page = pdf.getPage(pageIndex)
  const helv = await pdf.embedFont(StandardFonts.Helvetica)

  // stamp images first (so text can overlay if desired)
  for (const a of annos) {
    if (a.type !== "stamp") continue
    const pngBytes = await dataUrlToUint8(a.pngDataUrl)
    const png = await pdf.embedPng(pngBytes)
    const scale = a.widthPt / png.width
    const w = png.width * scale
    const h = png.height * scale
    page.drawImage(png, { x: a.xPt, y: a.yPt, width: w, height: h })
  }

  const padX = opts?.textPadXPt ?? 0
  const padY = opts?.textPadYPt ?? 0

  // then text
  for (const a of annos) {
    if (a.type !== "text") continue
    page.drawText(a.text ?? "", {
      x: a.xPt + 0 * 8 + padX,
      y: a.yPt + 0 * 4 + padY,
      size: a.sizePt,
      font: helv,
      color: hexToRgb01(a.colorHex || "#111111"),
    })
  }

  const out = await pdf.save()
  return new Uint8Array(out)
}
