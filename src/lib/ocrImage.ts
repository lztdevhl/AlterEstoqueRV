// Normaliza fundos escuros e amplia a tabela antes de ler texto pequeno.
export function improveOcrContrast(context: CanvasRenderingContext2D, width: number, height: number) {
  const image = context.getImageData(0, 0, width, height)
  const pixels = image.data
  for (let y = 0; y < height; y++) {
    let dark = 0
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] < 330) dark++
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const light = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3
      const value = (dark > width / 2 ? 255 - light : light) > 150 ? 255 : 0
      pixels[i] = pixels[i + 1] = pixels[i + 2] = value
    }
  }
  context.putImageData(image, 0, 0)
}

export async function prepareOcrImage(blob: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(2, 3000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const context = canvas.getContext('2d')!
    context.fillStyle = 'white'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    improveOcrContrast(context, canvas.width, canvas.height)
    return canvas
  } finally { bitmap.close() }
}
