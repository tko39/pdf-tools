/* eslint-disable @typescript-eslint/no-explicit-any */

import { getDocument } from "pdfjs-dist"
export const fileToBytes = async (file: File): Promise<Uint8Array> => {
  const buf = await file.arrayBuffer()
  return new Uint8Array(buf)
}

export const makeThumb = async (bytes: Uint8Array): Promise<string | undefined> => {
  try {
    const pdf = await getDocument({ data: bytes }).promise
    const page = await pdf.getPage(1)
    const viewport = page.getViewport({ scale: 0.5 })
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return undefined
    canvas.width = viewport.width
    canvas.height = viewport.height
    const renderContext = { canvasContext: ctx, viewport } as any
    await page.render(renderContext).promise
    const url = canvas.toDataURL("image/png")
    await pdf.cleanup()
    await pdf.destroy()
    return url
  } catch (e) {
    console.error("Error!", e)
    return undefined
  }
}

export const prettyBytes = (n: number): string => {
  const units = ["B", "KB", "MB", "GB"]
  let i = 0
  let val = n
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024
    i++
  }
  return `${val.toFixed(val < 10 && i > 0 ? 1 : 0)} ${units[i]}`
}
