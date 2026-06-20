// Background blur via MediaPipe Selfie Segmentation. Fully on-device: the model runs
// in the browser (WASM/GPU); no video leaves the machine. The class takes the raw
// camera track and returns a processed track (blurred background, sharp person) from a
// canvas. MediaPipe is dynamically imported so its ~MBs only load when blur is enabled.
const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm'
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'

export class BlurProcessor {
  private segmenter: unknown = null
  private video = document.createElement('video')
  private canvas = document.createElement('canvas')
  private mask = document.createElement('canvas')
  private ctx: CanvasRenderingContext2D | null = null
  private maskCtx: CanvasRenderingContext2D | null = null
  private raf: number | null = null
  private running = false

  constructor() {
    this.video.muted = true
    this.video.playsInline = true
    this.video.autoplay = true
    this.ctx = this.canvas.getContext('2d')
    this.maskCtx = this.mask.getContext('2d')
  }

  async start(inputTrack: MediaStreamTrack): Promise<MediaStreamTrack> {
    const s = inputTrack.getSettings()
    const w = s.width || 640
    const h = s.height || 480
    this.canvas.width = w
    this.canvas.height = h
    this.mask.width = w
    this.mask.height = h

    this.video.srcObject = new MediaStream([inputTrack])
    await this.video.play().catch(() => {})

    const { ImageSegmenter, FilesetResolver } = await import('@mediapipe/tasks-vision')
    const files = await FilesetResolver.forVisionTasks(WASM_BASE)
    this.segmenter = await ImageSegmenter.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputCategoryMask: false,
      outputConfidenceMasks: true,
    })

    this.running = true
    this.loop()
    return this.canvas.captureStream(20).getVideoTracks()[0]
  }

  private loop = () => {
    if (!this.running) return
    const seg = this.segmenter as {
      segmentForVideo: (
        v: HTMLVideoElement,
        ts: number,
        cb: (r: { confidenceMasks?: Array<{ getAsFloat32Array: () => Float32Array; close?: () => void }> }) => void
      ) => void
    } | null
    if (seg && this.video.readyState >= 2) {
      try {
        seg.segmentForVideo(this.video, performance.now(), (r) => {
          const m = r.confidenceMasks?.[0]
          this.composite(m?.getAsFloat32Array())
          m?.close?.()
        })
      } catch {
        // a dropped frame is fine — draw the raw frame as fallback
        this.ctx?.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height)
      }
    }
    this.raf = requestAnimationFrame(this.loop)
  }

  // confidence[i] ~ probability that pixel i is foreground (person). High = person.
  private composite(confidence?: Float32Array) {
    const ctx = this.ctx
    const w = this.canvas.width
    const h = this.canvas.height
    if (!ctx) return
    if (!confidence || !this.maskCtx) {
      ctx.drawImage(this.video, 0, 0, w, h)
      return
    }

    // Build an alpha mask (person = opaque) on the mask canvas.
    const img = this.maskCtx.createImageData(w, h)
    for (let i = 0; i < confidence.length; i++) {
      img.data[i * 4 + 3] = confidence[i] > 0.5 ? 255 : 0
    }
    this.maskCtx.putImageData(img, 0, 0)

    // sharp person → keep only person pixels → blurred background behind.
    ctx.clearRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    ctx.filter = 'none'
    ctx.drawImage(this.video, 0, 0, w, h)
    ctx.globalCompositeOperation = 'destination-in'
    ctx.drawImage(this.mask, 0, 0, w, h)
    ctx.globalCompositeOperation = 'destination-over'
    ctx.filter = 'blur(12px)'
    ctx.drawImage(this.video, 0, 0, w, h)
    ctx.filter = 'none'
    ctx.globalCompositeOperation = 'source-over'
  }

  stop() {
    this.running = false
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = null
    try {
      ;(this.segmenter as { close?: () => void } | null)?.close?.()
    } catch {
      // ignore
    }
    this.segmenter = null
    this.video.srcObject = null
  }
}
