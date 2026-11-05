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

// A page position of a pixel in the rectangle that is close to the colour: the middle one of the matches in reading
// order, so it lies on the body of a line and not at its end. Null when nothing matches.
export async function findColour(page: Page, rect: { x: number; y: number; width: number; height: number }, rgb: Rgb, tolerance: number): Promise<{ x: number; y: number } | null> {
  const png = await page.screenshot({ clip: rect })
  const scratch = await page.context().newPage()
  try {
    const found = await scratch.evaluate(
      async ({ data, rgb, tolerance }) => {
        const image = new Image()
        image.src = `data:image/png;base64,${data}`
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        const hits: number[] = []
        for (let i = 0; i < pixels.length; i += 4) {
          if (Math.abs(pixels[i]! - rgb[0]) <= tolerance && Math.abs(pixels[i + 1]! - rgb[1]) <= tolerance && Math.abs(pixels[i + 2]! - rgb[2]) <= tolerance) hits.push(i / 4)
        }
        if (hits.length === 0) return null
        const at = hits[Math.floor(hits.length / 2)]!
        return { x: at % canvas.width, y: Math.floor(at / canvas.width) }
      },
      { data: png.toString('base64'), rgb, tolerance },
    )
    return found ? { x: rect.x + found.x, y: rect.y + found.y } : null
  } finally {
    await scratch.close()
  }
}

// The mean of the red, green and blue values (0 to 255) of the pixels in a page rectangle.
export async function meanBrightness(page: Page, rect: { x: number; y: number; width: number; height: number }): Promise<number> {
  const png = await page.screenshot({ clip: rect })
  const scratch = await page.context().newPage()
  try {
    return await scratch.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.width
      canvas.height = image.height
      const context = canvas.getContext('2d')!
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      let sum = 0
      for (let i = 0; i < pixels.length; i += 4) sum += (pixels[i]! + pixels[i + 1]! + pixels[i + 2]!) / 3
      return sum / (pixels.length / 4)
    }, png.toString('base64'))
  } finally {
    await scratch.close()
  }
}

// How many pixels differ between two screenshots of the same size by more than `tolerance` in any channel.
export async function countChanged(page: Page, before: Buffer, after: Buffer, tolerance: number): Promise<number> {
  const scratch = await page.context().newPage()
  try {
    return await scratch.evaluate(
      async ({ a, b, tolerance }) => {
        const read = async (data: string) => {
          const image = new Image()
          image.src = `data:image/png;base64,${data}`
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.width
          canvas.height = image.height
          const context = canvas.getContext('2d')!
          context.drawImage(image, 0, 0)
          return context.getImageData(0, 0, canvas.width, canvas.height).data
        }
        const [first, second] = [await read(a), await read(b)]
        let count = 0
        for (let i = 0; i < first.length; i += 4) {
          if (Math.abs(first[i]! - second[i]!) > tolerance || Math.abs(first[i + 1]! - second[i + 1]!) > tolerance || Math.abs(first[i + 2]! - second[i + 2]!) > tolerance) count++
        }
        return count
      },
      { a: before.toString('base64'), b: after.toString('base64'), tolerance },
    )
  } finally {
    await scratch.close()
  }
}
