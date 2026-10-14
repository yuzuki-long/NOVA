import { useEffect, useRef, useState, useCallback } from 'react'

/* ========================================================================
 * がぞう しょり の じゅんびかん すう（ピュアかんすう・コンポーネントの そと）
 * ==================================================================== */

// HEIC / HEIF もふくめて どんな がぞう も <img> として よみこむ
async function fileToImage(file) {
  let blob = file
  const name = (file.name || '').toLowerCase()
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    name.endsWith('.heic') ||
    name.endsWith('.heif')

  if (isHeic) {
    const heic2any = (await import('heic2any')).default
    const converted = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 })
    blob = Array.isArray(converted) ? converted[0] : converted
  }

  const url = URL.createObjectURL(blob)
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = url
  })
  return { url, img }
}

function toGrayscale(data, w, h) {
  const out = new Float32Array(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    out[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }
  return out
}

function boxBlur3(gray, w, h) {
  const out = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0
      let count = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx
          if (nx < 0 || nx >= w) continue
          sum += gray[ny * w + nx]
          count++
        }
      }
      out[y * w + x] = sum / count
    }
  }
  return out
}

function sobelMagnitude(gray, w, h) {
  const out = new Float32Array(w * h)
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sx = 0
      let sy = 0
      let k = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const v = gray[(y + dy) * w + (x + dx)]
          sx += v * gx[k]
          sy += v * gy[k]
          k++
        }
      }
      out[y * w + x] = Math.sqrt(sx * sx + sy * sy)
    }
  }
  return out
}

function thresholdMag(mag, w, h, t) {
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) out[i] = mag[i] > t ? 1 : 0
  return out
}

// せいほうけい カーネル による ぼうちょう（dilate）／しゅうしゅく（erode）
function dilateBinary(bin, w, h, r) {
  if (r <= 0) return bin.slice()
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0
      for (let dx = -r; dx <= r && !v; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= w) continue
        if (bin[y * w + nx]) v = 1
      }
      tmp[y * w + x] = v
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 0
      for (let dy = -r; dy <= r && !v; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) continue
        if (tmp[ny * w + x]) v = 1
      }
      out[y * w + x] = v
    }
  }
  return out
}

function erodeBinary(bin, w, h, r) {
  if (r <= 0) return bin.slice()
  const tmp = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 1
      for (let dx = -r; dx <= r && v; dx++) {
        const nx = x + dx
        if (nx < 0 || nx >= w) {
          v = 0
          break
        }
        if (!bin[y * w + nx]) v = 0
      }
      tmp[y * w + x] = v
    }
  }
  const out = new Uint8Array(w * h)
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = 1
      for (let dy = -r; dy <= r && v; dy++) {
        const ny = y + dy
        if (ny < 0 || ny >= h) {
          v = 0
          break
        }
        if (!tmp[ny * w + x]) v = 0
      }
      out[y * w + x] = v
    }
  }
  return out
}

// closing = dilate → erode。ちかくに ある せんの きれめや こまかい でこぼこ を くっつけて ならす
function closingBinary(bin, w, h, r) {
  return erodeBinary(dilateBinary(bin, w, h, r), w, h, r)
}

// Zhang–Suen さいかくアルゴリズム：ふとい きょうかいせん を はば1pxの「ひとつの せん」に する
function zhangSuenThin(bin, w, h, maxIter = 40) {
  const img = Uint8Array.from(bin)
  const idx = (x, y) => y * w + x
  let changed = true
  let iter = 0
  while (changed && iter < maxIter) {
    changed = false
    iter++
    for (const step of [1, 2]) {
      const toRemove = []
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          if (!img[idx(x, y)]) continue
          const p2 = img[idx(x, y - 1)]
          const p3 = img[idx(x + 1, y - 1)]
          const p4 = img[idx(x + 1, y)]
          const p5 = img[idx(x + 1, y + 1)]
          const p6 = img[idx(x, y + 1)]
          const p7 = img[idx(x - 1, y + 1)]
          const p8 = img[idx(x - 1, y)]
          const p9 = img[idx(x - 1, y - 1)]
          const n = [p2, p3, p4, p5, p6, p7, p8, p9]
          const B = n.reduce((a, b) => a + b, 0)
          if (B < 2 || B > 6) continue
          let A = 0
          for (let i = 0; i < 8; i++) {
            if (n[i] === 0 && n[(i + 1) % 8] === 1) A++
          }
          if (A !== 1) continue
          if (step === 1) {
            if (p2 * p4 * p6 !== 0) continue
            if (p4 * p6 * p8 !== 0) continue
          } else {
            if (p2 * p4 * p8 !== 0) continue
            if (p2 * p6 * p8 !== 0) continue
          }
          toRemove.push(idx(x, y))
        }
      }
      if (toRemove.length) {
        changed = true
        for (const i of toRemove) img[i] = 0
      }
    }
  }
  return img
}

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 }
}

// スタック式の ぬりつぶし（バケツ）。wallMask=1 の ところは こえられない かべ
function floodFillBuffer(data, w, h, sx, sy, color, wallMask) {
  const startIdx = sy * w + sx
  if (wallMask[startIdx]) return false
  const visited = new Uint8Array(w * h)
  const stack = new Int32Array(w * h)
  let sp = 0
  stack[sp++] = startIdx
  visited[startIdx] = 1
  while (sp > 0) {
    const i = stack[--sp]
    const px = i % w
    const py = (i - px) / w
    const o = i * 4
    data[o] = color[0]
    data[o + 1] = color[1]
    data[o + 2] = color[2]
    data[o + 3] = color[3]
    if (px > 0) {
      const n = i - 1
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1
        stack[sp++] = n
      }
    }
    if (px < w - 1) {
      const n = i + 1
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1
        stack[sp++] = n
      }
    }
    if (py > 0) {
      const n = i - w
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1
        stack[sp++] = n
      }
    }
    if (py < h - 1) {
      const n = i + w
      if (!visited[n] && !wallMask[n]) {
        visited[n] = 1
        stack[sp++] = n
      }
    }
  }
  return true
}

const MAX_PROCESS_DIM = 1100 // しょり かいぞうど の じょうげん（スマホでも さくさく うごく ように）
const PX_PER_MM = 96 / 25.4 // がめん の 96dpi そうてい での 1mm あたり ピクセルすう（めやす）
const PALETTE = ['#FF6B5B', '#FF8A65', '#FFC857', '#FFE08A', '#8ED1B3', '#6FB8E0', '#B79CED', '#F4A6C6', '#8D6E52', '#FFFFFF']

/* ========================================================================
 * コンポーネント
 * ==================================================================== */

function NurieApp() {
  const [imageSrc, setImageSrc] = useState(null)
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [hasResult, setHasResult] = useState(false)
  const [viewMode, setViewMode] = useState('original')
  const [threshold, setThreshold] = useState(60)
  const [simplifyMm, setSimplifyMm] = useState(0.6)
  const [selectedColor, setSelectedColor] = useState(PALETTE[0])
  const [resultSize, setResultSize] = useState({ w: 0, h: 0 })
  const [errorMsg, setErrorMsg] = useState('')
  const [canUndo, setCanUndo] = useState(false)

  const originalImgElRef = useRef(null)
  const lineLayerRef = useRef(null)
  const paintLayerRef = useRef(null)
  const wallMaskRef = useRef(null)
  const historyRef = useRef([])
  const resultCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  /* ------------------------- がぞう の よみこみ ------------------------- */

  const loadFromFile = useCallback(async (file) => {
    if (!file) return
    setErrorMsg('')
    setIsProcessing(true)
    try {
      const { url, img } = await fileToImage(file)
      if (imageSrc) URL.revokeObjectURL(imageSrc)
      originalImgElRef.current = img
      setImageSrc(url)
      setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
      setHasResult(false)
      setViewMode('original')
      historyRef.current = []
      setCanUndo(false)
    } catch (e) {
      setErrorMsg('がぞうを よみこめませんでした。べつの しゃしんで ためしてください。')
    } finally {
      setIsProcessing(false)
    }
  }, [imageSrc])

  const onPickFile = (e) => {
    const file = e.target.files && e.target.files[0]
    loadFromFile(file)
    e.target.value = ''
  }

  /* ------------------------------ カメラ ------------------------------ */

  const openCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      })
      streamRef.current = stream
      setShowCamera(true)
    } catch (e) {
      setCameraError('かめらを つかえませんでした。「しゃしんを えらぶ」から とった しゃしんを えらんでください。')
    }
  }

  useEffect(() => {
    if (showCamera && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
      videoRef.current.play().catch(() => {})
    }
  }, [showCamera])

  const closeCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    setShowCamera(false)
  }

  const captureShot = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob)
      const img = new Image()
      img.onload = () => {
        originalImgElRef.current = img
        setImageSrc(url)
        setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight })
        setHasResult(false)
        setViewMode('original')
        historyRef.current = []
        setCanUndo(false)
      }
      img.src = url
    }, 'image/jpeg', 0.92)
    closeCamera()
  }

  /* --------------------------- ぬりえ に する --------------------------- */

  const redrawComposite = useCallback(() => {
    const canvas = resultCanvasRef.current
    const info = wallMaskRef.current
    if (!canvas || !info) return
    canvas.width = info.w
    canvas.height = info.h
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, info.w, info.h)
    if (paintLayerRef.current) ctx.drawImage(paintLayerRef.current, 0, 0)
    if (lineLayerRef.current) ctx.drawImage(lineLayerRef.current, 0, 0)
  }, [])

  useEffect(() => {
    if (hasResult && viewMode === 'nurie') redrawComposite()
  }, [hasResult, viewMode, resultSize, redrawComposite])

  const runProcessing = useCallback(async () => {
    const img = originalImgElRef.current
    if (!img) return
    setIsProcessing(true)
    setErrorMsg('')
    await new Promise((r) => setTimeout(r, 20))
    try {
      const w0 = img.naturalWidth
      const h0 = img.naturalHeight
      const scale = Math.min(1, MAX_PROCESS_DIM / Math.max(w0, h0))
      const w = Math.max(1, Math.round(w0 * scale))
      const h = Math.max(1, Math.round(h0 * scale))

      const srcCanvas = document.createElement('canvas')
      srcCanvas.width = w
      srcCanvas.height = h
      const sctx = srcCanvas.getContext('2d')
      sctx.drawImage(img, 0, 0, w, h)
      const imageData = sctx.getImageData(0, 0, w, h)

      const gray = toGrayscale(imageData.data, w, h)
      const blurred = boxBlur3(gray, w, h)
      const mag = sobelMagnitude(blurred, w, h)
      let bin = thresholdMag(mag, w, h, threshold)

      const r = Math.max(0, Math.round(simplifyMm * PX_PER_MM))
      if (r > 0) bin = closingBinary(bin, w, h, r)

      const thinned = zhangSuenThin(bin, w, h, 40)
      const wallMask = dilateBinary(thinned, w, h, 1)

      const lineCanvas = document.createElement('canvas')
      lineCanvas.width = w
      lineCanvas.height = h
      const lctx = lineCanvas.getContext('2d')
      const lineImgData = lctx.createImageData(w, h)
      for (let i = 0; i < w * h; i++) {
        const o = i * 4
        if (thinned[i]) {
          lineImgData.data[o] = 45
          lineImgData.data[o + 1] = 35
          lineImgData.data[o + 2] = 30
          lineImgData.data[o + 3] = 255
        } else {
          lineImgData.data[o + 3] = 0
        }
      }
      lctx.putImageData(lineImgData, 0, 0)

      const paintCanvas = document.createElement('canvas')
      paintCanvas.width = w
      paintCanvas.height = h

      lineLayerRef.current = lineCanvas
      paintLayerRef.current = paintCanvas
      wallMaskRef.current = { mask: wallMask, w, h }
      historyRef.current = []
      setCanUndo(false)
      setResultSize({ w, h })
      setHasResult(true)
      setViewMode('nurie')
    } catch (e) {
      console.error(e)
      setErrorMsg('ぬりえへの へんかんに しっぱいしました。もういちど ためしてください。')
    } finally {
      setIsProcessing(false)
    }
  }, [threshold, simplifyMm])

  /* -------------------------------- ぬる -------------------------------- */

  const handleCanvasClick = (e) => {
    const canvas = resultCanvasRef.current
    const info = wallMaskRef.current
    if (!canvas || !info) return
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const x = Math.floor((e.clientX - rect.left) * scaleX)
    const y = Math.floor((e.clientY - rect.top) * scaleY)
    if (x < 0 || y < 0 || x >= info.w || y >= info.h) return
    const idx = y * info.w + x
    if (info.mask[idx]) return

    const pctx = paintLayerRef.current.getContext('2d')
    const before = pctx.getImageData(0, 0, info.w, info.h)
    historyRef.current.push(before)
    if (historyRef.current.length > 15) historyRef.current.shift()
    setCanUndo(true)

    const paintData = pctx.getImageData(0, 0, info.w, info.h)
    const rgb = hexToRgb(selectedColor)
    floodFillBuffer(paintData.data, info.w, info.h, x, y, [rgb.r, rgb.g, rgb.b, 255], info.mask)
    pctx.putImageData(paintData, 0, 0)
    redrawComposite()
  }

  const handleUndo = () => {
    const info = wallMaskRef.current
    if (!info || historyRef.current.length === 0) return
    const prev = historyRef.current.pop()
    paintLayerRef.current.getContext('2d').putImageData(prev, 0, 0)
    setCanUndo(historyRef.current.length > 0)
    redrawComposite()
  }

  const handleClearPaint = () => {
    const info = wallMaskRef.current
    if (!info) return
    paintLayerRef.current.getContext('2d').clearRect(0, 0, info.w, info.h)
    historyRef.current = []
    setCanUndo(false)
    redrawComposite()
  }

  /* ------------------------------- ほぞん ------------------------------- */

  const handleSave = () => {
    const canvas = resultCanvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'nurie.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }

  /* -------------------------------- びょうが -------------------------------- */

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo-dot" />
        <h1>ぬりえめーかー</h1>
      </header>

      {/* 1. がぞうを えらぶ */}
      <section className="card">
        <p className="section-title">
          <span className="step-badge">1</span>
          がぞうを えらぶ
        </p>
        <p className="hint-text">すきな しゃしんや えを、ぬりえに できます。png・jpg・HEICに たいおうしています。</p>
        <div className="button-row">
          <button className="btn-primary" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
            しゃしんを えらぶ
          </button>
          <button className="btn-secondary" onClick={openCamera} disabled={isProcessing}>
            さつえいする
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/heic,image/heif,.heic,.heif"
          style={{ display: 'none' }}
          onChange={onPickFile}
        />
        {cameraError && <p className="hint-text">{cameraError}</p>}
        {errorMsg && <p className="hint-text">{errorMsg}</p>}
      </section>

      {/* 2. げんが かくにん */}
      {imageSrc && (
        <section className="card">
          <p className="section-title">
            <span className="step-badge">2</span>
            えらんだ がぞうを かくにんする
          </p>
          <p className="hint-text">
            もとの おおきさ（{naturalSize.w}×{naturalSize.h}）の まま ひょうじしています。ゆびで うごかして すみずみまで かくにんできます。
          </p>
          <div className="image-viewport">
            <img src={imageSrc} width={naturalSize.w} height={naturalSize.h} alt="えらんだ がぞう" />
          </div>
          <div className="button-row">
            <button className="btn-primary" onClick={runProcessing} disabled={isProcessing}>
              {isProcessing ? 'つくっています…' : 'ぬりえに する'}
            </button>
          </div>
        </section>
      )}

      {/* 3. ぬりえ の ちょうせい と ひょうじ */}
      {hasResult && (
        <section className="card">
          <p className="section-title">
            <span className="step-badge">3</span>
            ぬりえを かくにんする
          </p>

          <div className="toggle-row">
            <button className={viewMode === 'original' ? 'active' : ''} onClick={() => setViewMode('original')}>
              もとの え
            </button>
            <button className={viewMode === 'nurie' ? 'active' : ''} onClick={() => setViewMode('nurie')}>
              ぬりえ
            </button>
          </div>

          <div className="image-viewport">
            {viewMode === 'original' ? (
              <img src={imageSrc} width={naturalSize.w} height={naturalSize.h} alt="もとの がぞう" />
            ) : (
              <canvas ref={resultCanvasRef} onClick={handleCanvasClick} />
            )}
            <div className="thumb-preview">
              <img src={imageSrc} alt="もとの がぞう の ちいさい ひょうじ" />
            </div>
          </div>

          <div className="slider-block">
            <label>
              <span>せんの こさ</span>
              <span>{threshold}</span>
            </label>
            <input type="range" min="10" max="150" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
          </div>

          <div className="slider-block">
            <label>
              <span>こまかい せんを ひとつに まとめる ふとさ</span>
              <span>{simplifyMm.toFixed(1)}mm</span>
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={simplifyMm}
              onChange={(e) => setSimplifyMm(Number(e.target.value))}
            />
          </div>

          <div className="button-row">
            <button className="btn-yellow" onClick={runProcessing} disabled={isProcessing}>
              {isProcessing ? 'つくっています…' : 'この せっていで つくりなおす'}
            </button>
          </div>
          <p className="hint-text">
            がぞうは よみこみが はやくなる ように さいだいで やく{MAX_PROCESS_DIM}pxに ちいさく してから ぬりえに しています（げんの しゃしんは 1のところで そのまま かくにんできます）。「ふとさ」は がめんの
            かいぞうどを 96dpiと みなした めやすの ながさです。
          </p>
        </section>
      )}

      {/* 4. いろを ぬる */}
      {hasResult && viewMode === 'nurie' && (
        <section className="card">
          <p className="section-title">
            <span className="step-badge">4</span>
            いろを ぬる
          </p>
          <p className="hint-text">すきな いろを えらんで、ぬりえの なかを さわると いろが つきます。</p>
          <div className="palette-row">
            {PALETTE.map((c) => (
              <button
                key={c}
                className={`swatch${selectedColor === c ? ' active' : ''}`}
                style={{ background: c, border: c === '#FFFFFF' ? '2px solid #eee' : undefined }}
                onClick={() => setSelectedColor(c)}
                aria-label={`いろ ${c}`}
              />
            ))}
          </div>
          <div className="button-row">
            <button className="btn-secondary" onClick={handleUndo} disabled={!canUndo}>
              ひとつ もどす
            </button>
            <button className="btn-secondary" onClick={handleClearPaint} disabled={!canUndo}>
              いろを ぜんぶ けす
            </button>
          </div>
        </section>
      )}

      {/* 5. ほぞん */}
      {hasResult && (
        <section className="card">
          <p className="section-title">
            <span className="step-badge">5</span>
            ほぞんする
          </p>
          <p className="hint-text">いまの ぬりえを がぞうとして たんまつに ほぞんします。</p>
          <div className="button-row">
            <button className="btn-primary" onClick={handleSave}>
              がぞうを ほぞんする
            </button>
          </div>
        </section>
      )}

      {/* カメラ オーバーレイ */}
      {showCamera && (
        <div className="camera-overlay">
          <video ref={videoRef} playsInline muted />
          <div className="button-row" style={{ maxWidth: 320, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
            <button className="btn-secondary" onClick={closeCamera}>
              やめる
            </button>
            <button
              className="camera-shutter"
              onClick={captureShot}
              aria-label="しゃしんを とる"
              style={{ flex: '0 0 auto' }}
            />
            <div style={{ flex: 1, minWidth: 0 }} />
          </div>
        </div>
      )}
    </div>
  )
}

/* ========================================================================
 * えいご（キャラクターが はなす／こたえる れんしゅう）
 * きょうざい：Lesson 1〜3 の たんごと フレーズ
 * ==================================================================== */

// れっすん ごとの たんご・しつもん・こたえの ぶん（きょうざいの ページに あわせて ふやせます）
const LESSONS = [
  {
    id: 'l1',
    title: 'れっすん 1',
    intro: { en: "Let's meet my friends!", ja: 'ともだちを しょうかいするよ！' },
    q: "What's he?",
    qJa: 'このこは なにかな？',
    a: (w) => `He's a ${w.en}.`,
    aJa: (w) => `「${w.ja}」だよ！`,
    blank: "He's a ＿＿＿.",
    words: [
      { id: 'dinosaur', en: 'dinosaur', ja: 'きょうりゅう', emoji: '🦖', mood: 'happy' },
      { id: 'rabbit', en: 'rabbit', ja: 'うさぎ', emoji: '🐰', mood: 'happy' },
      { id: 'superhero', en: 'superhero', ja: 'すーぱーひーろー', emoji: '🦸', mood: 'happy' },
      { id: 'unicorn', en: 'unicorn', ja: 'ゆにこーん', emoji: '🦄', mood: 'happy' },
    ],
  },
  {
    id: 'l2',
    title: 'れっすん 2',
    intro: { en: "Let's get some snacks!", ja: 'おやつを もらおう！' },
    q: 'What do you want?',
    qJa: 'なにが ほしい？',
    a: (w) => `I want some ${w.en}.`,
    aJa: (w) => `「${w.ja}」が ほしいな！`,
    blank: 'I want some ＿＿＿.',
    words: [
      { id: 'fries', en: 'French fries', ja: 'ふらいどぽてと', emoji: '🍟', mood: 'happy' },
      { id: 'gummy', en: 'gummy bears', ja: 'ぐみ', emoji: '🍬', mood: 'happy' },
      { id: 'kale', en: 'kale chips', ja: 'けーるの ちっぷす', emoji: '🥬', mood: 'happy' },
      { id: 'pickles', en: 'pickles', ja: 'ぴくるす', emoji: '🥒', mood: 'happy' },
    ],
  },
  {
    id: 'l3',
    title: 'れっすん 3',
    intro: { en: "Let's try snacks!", ja: 'おやつを たべて みよう！' },
    q: 'How are they?',
    qJa: 'どうかな？',
    a: (w) => `They're ${w.en}.`,
    aJa: (w) => `「${w.ja}」！`,
    blank: "They're ＿＿＿.",
    words: [
      { id: 'bitter', en: 'bitter', ja: 'にがい', emoji: '🍫', mood: 'bitter' },
      { id: 'salty', en: 'salty', ja: 'しょっぱい', emoji: '🥨', mood: 'salty' },
      { id: 'sour', en: 'sour', ja: 'すっぱい', emoji: '🍋', mood: 'sour' },
      { id: 'sweet', en: 'sweet', ja: 'あまい', emoji: '🍪', mood: 'sweet' },
    ],
  },
]
const ALL_WORD_IDS = LESSONS.flatMap((l) => l.words.map((w) => w.id))

// こどもの はつおんが すこし ずれても よみとれるように、ききまちがいやすい ことばも ゆるす
const HOMOPHONES = {
  dinosaur: ['dinosaur', 'dinosaurs', 'dino', 'dinosour', 'dinosaw'],
  rabbit: ['rabbit', 'rabbits', 'rabbet', 'rabbi it'],
  superhero: ['superhero', 'super hero', 'superheroes', 'super heroes', 'superheros'],
  unicorn: ['unicorn', 'unicorns', 'uni corn', 'you need corn'],
  fries: ['french fries', 'french fry', 'french fried', 'fries', 'french freeze'],
  gummy: ['gummy bears', 'gummy bear', 'gummy', 'gummies', 'gummi bears', 'gummy bares'],
  kale: ['kale chips', 'kale chip', 'kale', 'kail', 'kayle', 'cale chips', 'kale ships'],
  pickles: ['pickles', 'pickle', 'pickled', 'pickels'],
  bitter: ['bitter', 'better', 'bidder', 'biter'],
  salty: ['salty', 'salt', 'saltie', 'salti', 'sultry', 'solty'],
  sour: ['sour', 'sower', 'sauer', 'saw', 'sawyer', 'power'],
  sweet: ['sweet', 'suite', 'sweat', 'sweetie'],
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shuffle = (arr) => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function speakEn(text, opts = {}) {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) {
      setTimeout(resolve, Math.max(1200, text.length * 90))
      return
    }
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = opts.rate ?? 0.8
    u.pitch = opts.pitch ?? 1.3
    const voices = synth.getVoices()
    const v =
      voices.find((x) => /^en[-_]US/i.test(x.lang) && /samantha|ava|allison|google us/i.test(x.name)) ||
      voices.find((x) => /^en[-_]US/i.test(x.lang)) ||
      voices.find((x) => /^en/i.test(x.lang))
    if (v) u.voice = v
    let done = false
    let timer = null
    const finish = () => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve()
    }
    timer = setTimeout(finish, text.length * 150 + 2500)
    u.onstart = () => opts.onStart && opts.onStart()
    u.onend = finish
    u.onerror = finish
    synth.speak(u)
  })
}

function matchesWord(alts, w) {
  const targets = HOMOPHONES[w.id] || [w.en.toLowerCase()]
  return alts.some((alt) => {
    const text = ` ${alt.toLowerCase().replace(/[^a-z\s']/g, ' ').replace(/\s+/g, ' ').trim()} `
    return targets.some((t) => text.includes(` ${t} `))
  })
}

function buildStory(lesson, words) {
  return [
    { en: "Hello! I'm Dino!", ja: 'こんにちは！ ぼく でぃのだよ', mood: 'happy' },
    { ...lesson.intro, mood: 'normal' },
    ...words.flatMap((w) => [
      { en: lesson.q, ja: lesson.qJa, mood: 'ask', emoji: w.emoji },
      { en: lesson.a(w), ja: lesson.aJa(w), mood: w.mood, emoji: w.emoji },
      { en: w.en, ja: `「${w.ja}」の ことだよ`, mood: w.mood, emoji: w.emoji },
    ]),
    { en: "Great! Now it's your turn!", ja: 'じょうずだね！ こんどは きみの ばんだよ', mood: 'cheer' },
  ]
}

// かわいい きょうりゅう キャラクター（SVG・オリジナル）
function Dino({ mood = 'normal', talking = false }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!talking) {
      setOpen(false)
      return undefined
    }
    const id = setInterval(() => setOpen((o) => !o), 150)
    return () => clearInterval(id)
  }, [talking])

  const happyEyes = mood === 'happy' || mood === 'sweet' || mood === 'cheer'
  const squeezeEyes = mood === 'sour' || mood === 'salty'
  const sadEyes = mood === 'bitter'

  let mouth
  if (open) {
    mouth = (
      <g>
        <ellipse cx="120" cy="128" rx="16" ry="11" fill="#5A2A2A" />
        <ellipse cx="120" cy="134" rx="9" ry="5" fill="#FF8A8A" />
      </g>
    )
  } else if (mood === 'sour') {
    mouth = <circle cx="120" cy="127" r="6" fill="#5A2A2A" />
  } else if (mood === 'bitter') {
    mouth = <path d="M104 134 Q120 118 136 134" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
  } else if (mood === 'salty') {
    mouth = (
      <g>
        <path d="M114 126 Q114 146 124 146 Q131 146 131 126 Z" fill="#FF8A8A" />
        <path d="M104 124 Q120 132 136 124" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
      </g>
    )
  } else {
    mouth = <path d="M104 120 Q120 138 136 120" stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" />
  }

  const eye = (cx) => (
    <g>
      <circle cx={cx} cy="92" r="11" fill="#fff" />
      <circle cx={cx} cy="93" r="6" fill="#000" />
      <circle cx={cx + 2} cy="90" r="2" fill="#fff" />
    </g>
  )

  return (
    <div className={`dino${talking ? ' dino-talk' : ''}${mood === 'cheer' ? ' dino-cheer' : ''}`}>
      <svg viewBox="0 0 240 240" role="img" aria-label="でぃの">
        <path d="M168 170 Q222 178 228 138 Q200 152 166 146 Z" fill="#6DBE63" />
        <ellipse cx="120" cy="178" rx="60" ry="50" fill="#7BC96F" />
        <ellipse cx="120" cy="188" rx="36" ry="34" fill="#E3F6CF" />
        <ellipse cx="92" cy="224" rx="20" ry="11" fill="#6DBE63" />
        <ellipse cx="148" cy="224" rx="20" ry="11" fill="#6DBE63" />
        <ellipse cx="66" cy="172" rx="11" ry="17" fill="#6DBE63" transform="rotate(20 66 172)" />
        <ellipse cx="174" cy="172" rx="11" ry="17" fill="#6DBE63" transform="rotate(-20 174 172)" />
        <polygon points="80,52 96,22 110,50" fill="#FFC857" />
        <polygon points="106,44 124,12 142,44" fill="#FF8A65" />
        <polygon points="136,50 152,22 166,54" fill="#FFC857" />
        <circle cx="120" cy="100" r="58" fill="#7BC96F" />
        <circle cx="86" cy="70" r="6" fill="#6DBE63" />
        <circle cx="150" cy="66" r="5" fill="#6DBE63" />
        <circle cx="120" cy="62" r="4" fill="#6DBE63" />
        <circle cx="78" cy="118" r="10" fill="#FF9E9E" opacity="0.75" />
        <circle cx="162" cy="118" r="10" fill="#FF9E9E" opacity="0.75" />
        {happyEyes && (
          <g stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round">
            <path d="M88 96 Q98 82 108 96" />
            <path d="M132 96 Q142 82 152 96" />
          </g>
        )}
        {squeezeEyes && (
          <g stroke="#000" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <path d="M88 84 L106 92 L88 100" />
            <path d="M152 84 L134 92 L152 100" />
          </g>
        )}
        {!happyEyes && !squeezeEyes && (
          <g>
            {eye(98)}
            {eye(142)}
          </g>
        )}
        {sadEyes && (
          <g stroke="#000" strokeWidth="4" strokeLinecap="round">
            <path d="M86 78 L108 84" />
            <path d="M154 78 L132 84" />
          </g>
        )}
        {mouth}
        {mood === 'sour' && <path d="M184 62 Q192 78 184 84 Q176 78 184 62 Z" fill="#8FD3F4" />}
        {mood === 'bitter' && (
          <path d="M176 64 q6 -6 12 0 t12 0" stroke="#8D6E52" strokeWidth="3" fill="none" strokeLinecap="round" />
        )}
        {mood === 'sweet' && (
          <text x="172" y="78" fontSize="28">
            💗
          </text>
        )}
        {mood === 'cheer' && (
          <text x="28" y="70" fontSize="28">
            ⭐
          </text>
        )}
      </svg>
    </div>
  )
}

function EigoApp() {
  const [lessonId, setLessonId] = useState('l1')
  const [selected, setSelected] = useState(ALL_WORD_IDS)
  const [sub, setSub] = useState('story')
  const [mood, setMood] = useState('happy')
  const [talking, setTalking] = useState(false)
  const [bubble, setBubble] = useState({ en: '', ja: '「はじめる」を おしてね' })
  const [emoji, setEmoji] = useState('')
  const [playing, setPlaying] = useState(false)
  const [stepInfo, setStepInfo] = useState({ k: -1, n: 0 })

  const [answerStyle, setAnswerStyle] = useState('word')
  const [qOrder, setQOrder] = useState([])
  const [qIdx, setQIdx] = useState(0)
  const [qPhase, setQPhase] = useState('idle') // idle | asking | ready | listening | right | wrong | done
  const [score, setScore] = useState(0)
  const [heard, setHeard] = useState('')
  const [hintOn, setHintOn] = useState(false)
  const [note, setNote] = useState('')

  const runRef = useRef(0)
  const recRef = useRef(null)
  const triesRef = useRef(0)
  const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

  const lesson = LESSONS.find((l) => l.id === lessonId)
  const selectedWords = lesson.words.filter((w) => selected.includes(w.id))

  const stopAll = useCallback(() => {
    runRef.current += 1
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    if (recRef.current) {
      try {
        recRef.current.abort()
      } catch (e) {
        /* ignore */
      }
      recRef.current = null
    }
    setTalking(false)
    setPlaying(false)
  }, [])

  useEffect(() => () => stopAll(), [stopAll])

  const say = async (text, { ja = '', mood: m, emoji: em, rate } = {}) => {
    setBubble({ en: text, ja })
    if (m) setMood(m)
    if (em !== undefined) setEmoji(em)
    await speakEn(text, { rate, onStart: () => setTalking(true) })
    setTalking(false)
  }

  const toggleWord = (id) => {
    setSelected((cur) => {
      if (cur.includes(id)) {
        const remain = cur.filter((x) => x !== id)
        return lesson.words.some((w) => remain.includes(w.id)) ? remain : cur
      }
      return [...cur, id]
    })
  }

  const switchLesson = (id) => {
    stopAll()
    setLessonId(id)
    setMood('happy')
    setEmoji('')
    setQPhase('idle')
    setStepInfo({ k: -1, n: 0 })
    setNote('')
    setBubble({ en: '', ja: '「はじめる」を おしてね' })
  }

  const switchSub = (s) => {
    stopAll()
    setSub(s)
    setMood('happy')
    setEmoji('')
    setQPhase('idle')
    setNote('')
    setBubble({ en: '', ja: '「はじめる」を おしてね' })
  }

  /* ---------------------------- おはなし ---------------------------- */

  const playStory = async () => {
    stopAll()
    const id = runRef.current
    const steps = buildStory(lesson, selectedWords)
    setPlaying(true)
    for (let k = 0; k < steps.length; k++) {
      if (runRef.current !== id) return
      setStepInfo({ k, n: steps.length })
      const s = steps[k]
      await say(s.en, { ja: s.ja, mood: s.mood, emoji: s.emoji })
      if (runRef.current !== id) return
      await sleep(350)
    }
    if (runRef.current === id) setPlaying(false)
  }

  /* ---------------------------- もんだい ---------------------------- */

  const currentWord = qOrder[qIdx]

  const askAt = async (order, i) => {
    stopAll()
    const id = runRef.current
    triesRef.current = 0
    setQIdx(i)
    setHeard('')
    setHintOn(false)
    setNote('')
    setQPhase('asking')
    const w = order[i]
    await say(lesson.q, { ja: `${lesson.qJa} こたえて みてね`, mood: 'ask', emoji: w.emoji })
    if (runRef.current === id) setQPhase('ready')
  }

  const startQuiz = () => {
    const order = shuffle(selectedWords)
    setQOrder(order)
    setScore(0)
    askAt(order, 0)
  }

  const judge = async (alts, forced = false) => {
    const w = qOrder[qIdx]
    if (!w) return
    const ok = forced || matchesWord(alts, w)
    const id = runRef.current
    if (ok) {
      setQPhase('right')
      setScore((s) => s + 1)
      await say(`That's right! ${lesson.a(w)}`, { ja: 'せいかい！ すごいね！', mood: 'cheer' })
      return
    }
    triesRef.current += 1
    setQPhase('wrong')
    if (triesRef.current >= 2) {
      setHintOn(true)
      await say(`${lesson.a(w)} Say ${w.en}!`, {
        ja: `こたえは「${w.ja}」だよ。いっしょに いってみよう`,
        mood: w.mood,
      })
    } else {
      await say('Try again!', { ja: 'もういちど いってみよう', mood: 'ask' })
    }
    if (runRef.current === id) setQPhase('ready')
  }

  const listen = () => {
    if (!SR) return
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setTalking(false)
    setNote('')
    const rec = new SR()
    rec.lang = 'en-US'
    rec.interimResults = false
    rec.maxAlternatives = 5
    recRef.current = rec
    setQPhase('listening')
    rec.onresult = (e) => {
      const alts = []
      for (const r of e.results) for (let a = 0; a < r.length; a++) alts.push(r[a].transcript)
      setHeard(alts[0] || '')
      judge(alts)
    }
    rec.onerror = () => {
      setQPhase('ready')
      setNote('きこえなかったよ。もういちど おはなししてね')
    }
    rec.onend = () => {
      setQPhase((p) => (p === 'listening' ? 'ready' : p))
    }
    try {
      rec.start()
    } catch (e) {
      setQPhase('ready')
    }
  }

  const modelVoice = () => {
    const w = currentWord
    if (!w) return
    stopAll()
    if (qPhase === 'wrong') setQPhase('ready')
    const text = answerStyle === 'phrase' ? lesson.a(w) : w.en
    say(text, { ja: `「${w.ja}」だよ`, mood: w.mood, rate: 0.65 })
  }

  const nextQuestion = async () => {
    if (qIdx + 1 < qOrder.length) {
      askAt(qOrder, qIdx + 1)
    } else {
      stopAll()
      setQPhase('done')
      setEmoji('')
      await say('Great job!', { ja: 'よく できました！', mood: 'cheer' })
    }
  }

  const isBusy = qPhase === 'asking'

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="logo-dot" />
        <h1>えいごで あそぼう</h1>
      </header>

      <div className="toggle-row">
        {LESSONS.map((l) => (
          <button
            key={l.id}
            className={lessonId === l.id ? 'active' : ''}
            onClick={() => switchLesson(l.id)}
            disabled={playing || isBusy || qPhase === 'listening'}
          >
            {l.title}
          </button>
        ))}
      </div>

      <div className="toggle-row">
        <button className={sub === 'story' ? 'active' : ''} onClick={() => switchSub('story')}>
          おはなし
        </button>
        <button className={sub === 'quiz' ? 'active' : ''} onClick={() => switchSub('quiz')}>
          もんだい
        </button>
      </div>

      {/* ステージ：キャラクターと ふきだし */}
      <section className="stage">
        <div className="bubble">
          {bubble.en && <div className="bubble-en">{bubble.en}</div>}
          {sub === 'quiz' && answerStyle === 'phrase' && qPhase !== 'idle' && qPhase !== 'done' && (
            <div className="bubble-en bubble-blank">{lesson.blank}</div>
          )}
          {bubble.ja && <div className="bubble-ja">{bubble.ja}</div>}
        </div>
        <div className="stage-row">
          <Dino mood={mood} talking={talking} />
          {emoji && (
            <div className="food" key={emoji}>
              {emoji}
            </div>
          )}
        </div>
      </section>

      {sub === 'story' && (
        <section className="card">
          <p className="section-title">でぃのと おはなし</p>
          <p className="hint-text">でぃのが たべものを みて はなします。きいて まねしてみよう。</p>
          {playing && (
            <div className="dots">
              {Array.from({ length: stepInfo.n }).map((_, i) => (
                <span key={i} className={`dot${i <= stepInfo.k ? ' on' : ''}`} />
              ))}
            </div>
          )}
          <div className="button-row">
            <button className="btn-primary" onClick={playStory} disabled={playing}>
              {stepInfo.k >= 0 && !playing ? 'もういちど' : 'はじめる'}
            </button>
            <button className="btn-secondary" onClick={() => { stopAll(); setMood('happy') }} disabled={!playing}>
              とめる
            </button>
          </div>
        </section>
      )}

      {sub === 'quiz' && (
        <section className="card">
          <p className="section-title">でぃのの しつもん</p>
          <div className="toggle-row">
            <button
              className={answerStyle === 'word' ? 'active' : ''}
              onClick={() => setAnswerStyle('word')}
              disabled={isBusy || qPhase === 'listening'}
            >
              たんごで こたえる
            </button>
            <button
              className={answerStyle === 'phrase' ? 'active' : ''}
              onClick={() => setAnswerStyle('phrase')}
              disabled={isBusy || qPhase === 'listening'}
            >
              ぶんで こたえる
            </button>
          </div>

          {(qPhase === 'idle' || qPhase === 'done') && (
            <div className="button-row">
              {qPhase === 'done' && <p className="score-line">⭐ {score} / {qOrder.length}　ぜんぶ できたね！</p>}
              <button className="btn-primary" onClick={startQuiz}>
                {qPhase === 'done' ? 'もういちど' : 'はじめる'}
              </button>
            </div>
          )}

          {qPhase !== 'idle' && qPhase !== 'done' && (
            <>
              <p className="hint-text">
                {qIdx + 1} / {qOrder.length} もんめ　⭐ {score}
                {hintOn && currentWord ? `　ヒント：${currentWord.ja}` : ''}
              </p>

              {qPhase !== 'right' && (
                <div className="mic-area">
                  {SR ? (
                    <button
                      className={`mic-btn${qPhase === 'listening' ? ' listening' : ''}`}
                      onClick={listen}
                      disabled={qPhase !== 'ready'}
                      aria-label="おはなしする"
                    >
                      🎤
                    </button>
                  ) : null}
                  <span className="mic-label">
                    {qPhase === 'listening' ? 'きいているよ…' : qPhase === 'asking' ? 'しつもんを きいてね' : SR ? 'おして おはなしする' : ''}
                  </span>
                </div>
              )}

              {heard && qPhase !== 'right' && <p className="hint-text">きこえた ことば：{heard}</p>}
              {note && <p className="hint-text">{note}</p>}
              {!SR && (
                <p className="hint-text">
                  この たんまつでは こえの はんてい が つかえません。いえたら「いえたよ！」を おしてね。
                </p>
              )}

              <div className="button-row">
                {qPhase === 'right' ? (
                  <button className="btn-primary" onClick={nextQuestion}>
                    つぎへ
                  </button>
                ) : (
                  <>
                    <button className="btn-secondary" onClick={modelVoice} disabled={isBusy || qPhase === 'listening'}>
                      おてほんを きく
                    </button>
                    <button className="btn-yellow" onClick={() => judge([], true)} disabled={qPhase !== 'ready'}>
                      いえたよ！
                    </button>
                  </>
                )}
                {hintOn && qPhase !== 'right' && (
                  <button className="btn-ghost" onClick={nextQuestion}>
                    つぎへ とばす
                  </button>
                )}
              </div>
            </>
          )}
        </section>
      )}

      {/* たんご えらび */}
      <section className="card">
        <p className="section-title">たんごを えらぶ</p>
        <p className="hint-text">あそびたい たんごを さわって えらんでね（ひとつは のこります）。</p>
        <div className="word-grid">
          {lesson.words.map((w) => (
            <button
              key={w.id}
              className={`word-card${selected.includes(w.id) ? ' selected' : ''}`}
              onClick={() => toggleWord(w.id)}
              disabled={playing || isBusy || qPhase === 'listening'}
            >
              <span className="word-emoji">{w.emoji}</span>
              <span className="word-en">{w.en}</span>
              <span className="word-ja">{w.ja}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

/* ========================================================================
 * アプリ ぜんたい（したの タブで ぬりえ／えいご を きりかえ）
 * ==================================================================== */

export default function App() {
  const [tab, setTab] = useState('nurie')
  return (
    <>
      {/* ぬりえは きりかえても がぞうが きえない ように、かくすだけ にする */}
      <div style={{ display: tab === 'nurie' ? 'contents' : 'none' }}>
        <NurieApp />
      </div>
      {tab === 'eigo' && <EigoApp />}
      <nav className="tab-bar">
        <button className={tab === 'nurie' ? 'active' : ''} onClick={() => setTab('nurie')}>
          ぬりえ
        </button>
        <button className={tab === 'eigo' ? 'active' : ''} onClick={() => setTab('eigo')}>
          えいご
        </button>
      </nav>
    </>
  )
}
