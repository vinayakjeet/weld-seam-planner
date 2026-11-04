import type { Page } from '@playwright/test'

export type Rgb = [number, number, number]

export const hexToRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb

// Counts the pixels of a PNG within `tolerance` (largest per-channel difference) of any of the colours. The image is
// drawn on a canvas in a scratch page of the same browser, so no image library is needed.
async function countInPng(page: Page, png: Buffer, colours: Rgb[], tolerance: number): Promise<{ matching: number; total: number }> {
  const scratch = await page.context().newPage()
  try {
    return await scratch.evaluate(
      async ({ data, colours, tolerance }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        let matching = 0
        for (let i = 0; i < pixels.length; i += 4) {
          if (colours.some((c) => Math.abs(pixels[i]! - c[0]) <= tolerance && Math.abs(pixels[i + 1]! - c[1]) <= tolerance && Math.abs(pixels[i + 2]! - c[2]) <= tolerance)) matching++
        }
        return { matching, total: pixels.length / 4 }
      },
      { data: png.toString('base64'), colours, tolerance },
    )
  } finally {
    await scratch.close()
  }
}

// The share of the picture (0 to 1) covered by the colours.
export async function colourShare(page: Page, png: Buffer, colours: string[], tolerance: number): Promise<number> {
  const { matching, total } = await countInPng(page, png, colours.map(hexToRgb), tolerance)
  return matching / total
}

// How many pixels inside a page rectangle are close to a colour.
export async function countColour(page: Page, rect: { x: number; y: number; width: number; height: number }, rgb: Rgb, tolerance: number): Promise<number> {
  const png = await page.screenshot({ clip: rect })
  return (await countInPng(page, png, [rgb], tolerance)).matching
}
