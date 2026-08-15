/**
 * dsh-wallpaper-bg — 设置面板 UI 与状态管理（Client）
 *
 * 职责：
 *  1. 通过 `settings.section` Slot 注册「壁纸」设置选项卡；
 *  2. 壁纸来源切换器（内置 / 自定义上传 / WE 壁纸库）、4 列缩略图网格、
 *     上传按钮（自定义模式）、同步桌面开关（WE 模式）、三个调节滑块、
 *     恢复默认按钮；
 *  3. 状态持久化：设置 → localStorage（刷新自动恢复），自定义上传 →
 *     IndexedDB（Blob 持久化）；
 *  4. 选中壁纸后驱动背景层渲染（见 src/ui.ts），并管理 WE 同步轮询。
 *
 * 说明：与运行时部署的纯 JavaScript 闭包一一对应；React 元素一律使用
 * React.createElement（DSH 动态插件不支持 JSX）。
 */

/* eslint-disable react-hooks/rules-of-hooks */

import type { BackgroundLayer } from './ui.ts'
import type { WallpaperItem, WallpaperSettings } from './types.ts'

const React: ReactLike = (globalThis as never as { React: ReactLike }).React

export interface ReactLike {
  createElement(type: unknown, props?: Record<string, unknown> | null, ...children: unknown[]): unknown
  useState<T>(initial: T): [T, (next: T | ((prev: T) => T)) => void]
  useEffect(effect: () => void | (() => void), deps?: unknown[]): void
}

export interface SettingsDeps {
  /** ctx.interval（timer 服务注入） */
  interval: (cb: () => void, ms: number) => () => void
  /** host.call 的 JSON RPC 封装 */
  hostCall: (method: string, args?: unknown) => Promise<Record<string, unknown> | null>
  /** 背景层渲染器 */
  layer: BackgroundLayer
  /** 内置壁纸列表（缩略图 + 全图 URL） */
  builtins: WallpaperItem[]
  /** 默认设置 */
  defaults: WallpaperSettings
}

const SETTINGS_KEY = 'dsh-wallpaper-bg:settings:v1'
const IDB_NAME = 'dsh-wallpaper-bg'
const IDB_STORE = 'uploads'
const SYNC_POLL_MS = 30 * 1000

export interface UploadRecord {
  id: string
  name: string
  mime: string
  blob: Blob
  createdAt: number
}

export interface SettingsController {
  getState(): WallpaperSettings
  setState(patch: Partial<WallpaperSettings>): void
  subscribe(fn: () => void): () => void
  applyNow(): Promise<void>
  idbList(): Promise<UploadRecord[]>
  idbGet(id: string): Promise<UploadRecord | null>
  idbPut(rec: UploadRecord): Promise<void>
  idbRemove(id: string): Promise<void>
  register(slots: SlotLike): void
  dispose(): void
}

export interface SlotLike {
  inject(key: string, callback: () => unknown): () => void
  register(
    options: { name: string; id?: string; order?: number; label?: string },
    component: (props: { close?: () => void }) => unknown,
  ): () => void
}

/** 把 host.call 返回的 WE 列表原样暴露给组件（id/title/kind/thumbnail/filepath/previewUrl） */
export interface WeWallpaperItem {
  id: string
  title: string
  kind: 'image' | 'video' | 'scene' | 'unknown'
  thumbnail: string
  filepath: string
  previewUrl: string
}

export function createSettings(deps: SettingsDeps): SettingsController {
  const { interval, hostCall, layer, builtins, defaults } = deps

  // -------------------------------------------------------------------------
  // 状态（localStorage 持久化）
  // -------------------------------------------------------------------------
  let state: WallpaperSettings = load()
  const listeners = new Set<() => void>()

  function load(): WallpaperSettings {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY)
      const parsed = raw ? (JSON.parse(raw) as Partial<WallpaperSettings>) : {}
      const merged = { ...defaults, ...parsed }
      // 迁移：旧默认端口 8080（被 Jenkins 占用）→ 新默认 8088
      if (merged.weBase === 'http://127.0.0.1:8080') merged.weBase = defaults.weBase
      return merged
    } catch {
      return { ...defaults }
    }
  }
  function save() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(state))
    } catch {
      /* 存储满 / 隐私模式下静默失败 */
    }
  }
  function emit() {
    for (const fn of listeners) fn()
  }

  // -------------------------------------------------------------------------
  // IndexedDB（自定义上传持久化）
  // -------------------------------------------------------------------------
  let dbPromise: Promise<IDBDatabase> | null = null
  function openDb(): Promise<IDBDatabase> {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: 'id' })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error ?? new Error('IndexedDB 打开失败'))
    })
    return dbPromise
  }

  async function idbList(): Promise<UploadRecord[]> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const rq = tx.objectStore(IDB_STORE).getAll()
      rq.onsuccess = () =>
        resolve(
          ((rq.result ?? []) as UploadRecord[]).sort((a, b) => b.createdAt - a.createdAt),
        )
      rq.onerror = () => reject(rq.error)
    })
  }
  async function idbGet(id: string): Promise<UploadRecord | null> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly')
      const rq = tx.objectStore(IDB_STORE).get(id)
      rq.onsuccess = () => resolve((rq.result as UploadRecord) ?? null)
      rq.onerror = () => reject(rq.error)
    })
  }
  async function idbPut(rec: UploadRecord): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).put(rec)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }
  async function idbRemove(id: string): Promise<void> {
    const db = await openDb()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite')
      tx.objectStore(IDB_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  }

  // -------------------------------------------------------------------------
  // 背景应用（解析来源 → 驱动渲染层）
  // -------------------------------------------------------------------------
  const weCache: { list: WeWallpaperItem[] | null } = { list: null }
  let applyToken = 0

  async function applyNow(): Promise<void> {
    const token = ++applyToken
    layer.setOverlay(state.overlayOpacity)
    layer.setFilter(state.blur, state.brightness)
    layer.setZoom(state.safeZoom)

    if (state.source === 'builtin') {
      const w = builtins.find((x) => x.id === state.wallpaperId) ?? builtins[0]
      if (token === applyToken) layer.applyImage(w.url)
      return
    }

    if (state.source === 'custom') {
      const fallback = builtins[0]
      if (!state.wallpaperId) {
        if (token === applyToken) layer.applyImage(fallback.url)
        return
      }
      const rec = await idbGet(state.wallpaperId).catch(() => null)
      if (token !== applyToken) return
      if (!rec) {
        layer.applyImage(fallback.url)
        return
      }
      const objectUrl = URL.createObjectURL(rec.blob)
      if (rec.mime && rec.mime.startsWith('video/')) layer.applyVideo(objectUrl)
      else layer.applyImage(objectUrl)
      return
    }

    // WE 壁纸库
    let item: WeWallpaperItem | null = null
    if (state.syncDesktop) {
      const res = await hostCall('we:api', { endpoint: 'current', base: state.weBase })
      if (token !== applyToken) return
      if (res && res.ok && res.current) item = res.current as WeWallpaperItem
    } else if (state.wallpaperId) {
      let list = weCache.list
      if (!list) {
        const res = await hostCall('we:api', { endpoint: 'wallpapers', base: state.weBase })
        if (token !== applyToken) return
        if (res && res.ok) {
          list = (res.wallpapers ?? []) as WeWallpaperItem[]
          weCache.list = list
        }
      }
      item =
        (list ?? []).find((x) => String(x.id) === String(state.wallpaperId)) ?? null
    }
    if (token !== applyToken) return
    if (!item) {
      layer.applyImage(builtins[0].url)
      return
    }
    if (item.kind === 'video') {
      const fileUrl = assetUrlOf(item.filepath)
      if (fileUrl) layer.applyVideo(fileUrl)
      else layer.applyImage(assetUrlOf(item.thumbnail))
      return
    }
    if (item.kind === 'scene') {
      layer.applyScene({ previewUrl: item.previewUrl, thumbnail: item.thumbnail })
      return
    }
    const imageUrl = assetUrlOf(item.filepath || item.thumbnail)
    if (imageUrl) layer.applyImage(imageUrl)
    else layer.applyImage(builtins[0].url)
  }

  function assetUrlOf(p: string | null | undefined): string {
    if (!p) return ''
    if (/^https?:\/\//i.test(p)) return p
    if (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/')) {
      return '/dsh-wallpaper-bg/asset?path=' + encodeURIComponent(p)
    }
    return p
  }

  function setState(patch: Partial<WallpaperSettings>) {
    state = { ...state, ...patch }
    save()
    emit()
    applyNow().catch(() => {
      /* 应用失败保持当前背景，错误经面板展示 */
    })
  }

  // -------------------------------------------------------------------------
  // 桌面壁纸同步轮询（插件生命周期级，面板关闭时仍生效）
  // -------------------------------------------------------------------------
  const stopSync = interval(async () => {
    if (state.source !== 'we' || !state.syncDesktop) return
    const res = await hostCall('we:api', {
      endpoint: 'current',
      base: state.weBase,
      refresh: true,
    })
    if (!res || !res.ok || !res.current) return
    const id = String((res.current as WeWallpaperItem).id)
    if (String(state.wallpaperId) !== id) {
      state.wallpaperId = id
      save()
      emit()
      applyNow().catch(() => {
        /* 忽略 */
      })
    }
  }, SYNC_POLL_MS)

  // -------------------------------------------------------------------------
  // 设置面板 UI
  // -------------------------------------------------------------------------
  const h = React.createElement

  function Panel(props: { close?: () => void }) {
    const [snap, setSnap] = React.useState(state)
    const [uploads, setUploads] = React.useState<UploadRecord[]>([])
    const [uploadsVersion, setUploadsVersion] = React.useState(0)
    const [weList, setWeList] = React.useState<WeWallpaperItem[] | null>(null)
    const [weError, setWeError] = React.useState<string | null>(null)
    const [weLoading, setWeLoading] = React.useState(false)
    const [weBaseDraft, setWeBaseDraft] = React.useState(state.weBase)
    const [busy, setBusy] = React.useState(false)

    React.useEffect(() => subscribe(() => setSnap({ ...state })), [])

    // 自定义模式：加载上传列表
    React.useEffect(() => {
      if (snap.source !== 'custom') return
      let alive = true
      idbList()
        .then((rows) => {
          if (alive) setUploads(rows)
        })
        .catch(() => {
          if (alive) setUploads([])
        })
      return () => {
        alive = false
      }
    }, [snap.source, uploadsVersion])

    // WE 模式：进入时加载壁纸库
    React.useEffect(() => {
      if (snap.source !== 'we') return
      let alive = true
      refreshWe(snap.weBase)
        .then(() => undefined)
        .catch(() => {
          if (alive) setWeError('WE API 不可达')
        })
      return () => {
        alive = false
      }
    }, [snap.source, snap.weBase])

    async function refreshWe(base: string) {
      setWeLoading(true)
      setWeError(null)
      try {
        const res = await hostCall('we:api', { endpoint: 'wallpapers', base, refresh: true })
        if (!res || !res.ok) {
          setWeError(String((res && res.error) || 'Wallpaper Engine API 不可达'))
          return
        }
        const list = (res.wallpapers ?? []) as WeWallpaperItem[]
        weCache.list = list
        setWeList(list)
      } catch (error) {
        setWeError(String((error as Error)?.message ?? error))
      } finally {
        setWeLoading(false)
      }
    }

    function selectWallpaper(source: WallpaperSettings['source'], id: string) {
      setState({ source, wallpaperId: id, syncDesktop: false })
    }

    function onFiles(event: Event) {
      const input = event.target as HTMLInputElement
      const files = input.files
      if (!files || !files.length) return
      for (const file of Array.from(files)) {
        const rec: UploadRecord = {
          id: 'up-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
          name: file.name,
          mime: file.type || 'application/octet-stream',
          blob: file,
          createdAt: Date.now(),
        }
        idbPut(rec)
          .then(() => setUploadsVersion((v) => v + 1))
          .catch(() => setBusy(false))
      }
      input.value = ''
    }

    function onDeleteUpload(id: string) {
      idbRemove(id)
        .then(() => {
          setUploadsVersion((v) => v + 1)
          if (state.source === 'custom' && state.wallpaperId === id) {
            setState({ wallpaperId: null })
          }
        })
        .catch(() => {
          /* 忽略 */
        })
    }

    function resetAll() {
      setWeBaseDraft(defaults.weBase)
      setState({ ...defaults })
    }

    // ---- 渲染辅助 ----
    function sourceButton(value: WallpaperSettings['source'], label: string) {
      return h(
        'button',
        {
          type: 'button',
          className: 'wbg-seg-btn' + (snap.source === value ? ' wbg-active' : ''),
          onClick: () => setState({ source: value }),
        },
        label,
      )
    }

    function tile(props: {
      key: string
      title: string
      thumb: string
      badge?: string
      selected: boolean
      onSelect: () => void
      onDelete?: () => void
    }) {
      const children = [
        props.thumb
          ? h('img', { src: props.thumb, alt: props.title, draggable: 'false', loading: 'lazy' })
          : h('div', { className: 'wbg-tile-ph' }, props.title.slice(0, 1)),
        h('div', { className: 'wbg-tile-name' }, props.title),
      ]
      if (props.badge) children.push(h('span', { className: 'wbg-tile-badge' }, props.badge))
      if (props.onDelete) {
        children.push(
          h(
            'button',
            {
              type: 'button',
              className: 'wbg-tile-del',
              title: '删除',
              onClick: (e: Event) => {
                e.stopPropagation()
                props.onDelete?.()
              },
            },
            '×',
          ),
        )
      }
      return h(
        'div',
        {
          key: props.key,
          className: 'wbg-tile' + (props.selected ? ' wbg-selected' : ''),
          onClick: props.onSelect,
        },
        ...children,
      )
    }

    function sliderRow(opts: {
      label: string
      value: number
      min: number
      max: number
      unit: string
      onChange: (n: number) => void
    }) {
      return h(
        'div',
        { className: 'wbg-row' },
        h('label', null, opts.label),
        h('input', {
          type: 'range',
          min: opts.min,
          max: opts.max,
          step: 1,
          value: opts.value,
          onChange: (e: Event) => opts.onChange(Number((e.target as HTMLInputElement).value)),
        }),
        h('span', { className: 'wbg-val' }, opts.value + opts.unit),
      )
    }

    // ---- 各来源网格 ----
    function builtinGrid() {
      return h(
        'div',
        { className: 'wbg-grid' },
        ...builtins.map((w) =>
          tile({
            key: w.id,
            title: w.title,
            thumb: w.thumbnail ?? w.url,
            selected: snap.wallpaperId === w.id,
            onSelect: () => selectWallpaper('builtin', w.id),
          }),
        ),
      )
    }

    function customGrid() {
      const items = uploads.map((u) => {
        const isImage = u.mime.startsWith('image/')
        const objectUrl = isImage ? URL.createObjectURL(u.blob) : ''
        return tile({
          key: u.id,
          title: u.name,
          thumb: objectUrl,
          badge: isImage ? undefined : '视频',
          selected: snap.wallpaperId === u.id,
          onSelect: () => selectWallpaper('custom', u.id),
          onDelete: () => onDeleteUpload(u.id),
        })
      })
      if (!items.length) {
        return h('div', { className: 'wbg-hint' }, '还没有自定义壁纸，点击上方「上传自定义壁纸」添加图片或视频。')
      }
      return h('div', { className: 'wbg-grid' }, ...items)
    }

    function weGrid() {
      const list = weList
      if (weLoading && !list) return h('div', { className: 'wbg-hint' }, '正在从 Wallpaper Engine 读取壁纸库…')
      if (weError && !list) {
        return h(
          'div',
          { className: 'wbg-error' },
          weError +
            '。请确认 WE 本地 API 正在运行（默认 http://127.0.0.1:8088），或修改下方基地址后点击「刷新」。',
        )
      }
      if (!list || !list.length) return h('div', { className: 'wbg-hint' }, '壁纸库为空。')
      return h(
        'div',
        { className: 'wbg-grid' },
        ...list.map((item) =>
          tile({
            key: String(item.id),
            title: item.title,
            thumb: assetUrlOf(item.thumbnail),
            badge:
              item.kind === 'video' ? '视频' : item.kind === 'scene' ? '场景' : undefined,
            selected: !snap.syncDesktop && String(snap.wallpaperId) === String(item.id),
            onSelect: () => selectWallpaper('we', String(item.id)),
          }),
        ),
      )
    }

    // ---- 面板整体 ----
    return h(
      'div',
      { className: 'wbg-panel' },
      h(
        'div',
        { className: 'wbg-seg' },
        sourceButton('builtin', '内置壁纸'),
        sourceButton('custom', '自定义上传'),
        sourceButton('we', 'WE 壁纸库'),
      ),

      snap.source === 'custom'
        ? h(
            'div',
            { className: 'wbg-actions' },
            h('label', { className: 'wbg-btn wbg-upload' },
              '上传自定义壁纸',
              h('input', {
                type: 'file',
                accept: 'image/*,video/*',
                multiple: true,
                style: { display: 'none' },
                onChange: onFiles,
              }),
            ),
            h('span', { className: 'wbg-hint' }, '图片 / 视频存入 IndexedDB，刷新后保留'),
          )
        : null,

      snap.source === 'we'
        ? h(
            'div',
            { className: 'wbg-actions' },
            h('input', {
              className: 'wbg-input',
              value: weBaseDraft,
              placeholder: 'http://127.0.0.1:8088',
              onChange: (e: Event) => setWeBaseDraft((e.target as HTMLInputElement).value),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'wbg-btn',
                onClick: () => {
                  setState({ weBase: weBaseDraft || defaults.weBase })
                },
              },
              '应用地址',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'wbg-btn',
                disabled: weLoading,
                onClick: () => refreshWe(weBaseDraft || snap.weBase),
              },
              weLoading ? '刷新中…' : '刷新',
            ),
            h(
              'label',
              { className: 'wbg-switch' },
              h('input', {
                type: 'checkbox',
                checked: snap.syncDesktop,
                onChange: (e: Event) =>
                  setState({ syncDesktop: (e.target as HTMLInputElement).checked }),
              }),
              '同步桌面壁纸',
            ),
            h('span', { className: 'wbg-hint' }, '只读获取 WE 当前壁纸，不修改桌面'),
          )
        : null,

      snap.source === 'builtin' ? builtinGrid() : null,
      snap.source === 'custom' ? customGrid() : null,
      snap.source === 'we' ? weGrid() : null,

      h('div', { className: 'wbg-hint' }, '调节：'),
      sliderRow({
        label: '遮罩透明度',
        value: snap.overlayOpacity,
        min: 0,
        max: 100,
        unit: '%',
        onChange: (n) => setState({ overlayOpacity: n }),
      }),
      sliderRow({
        label: '背景模糊度',
        value: snap.blur,
        min: 0,
        max: 20,
        unit: 'px',
        onChange: (n) => setState({ blur: n }),
      }),
      sliderRow({
        label: '背景亮度',
        value: snap.brightness,
        min: 50,
        max: 150,
        unit: '%',
        onChange: (n) => setState({ brightness: n }),
      }),
      sliderRow({
        label: '安全放大',
        value: snap.safeZoom,
        min: 0,
        max: 10,
        unit: '%',
        onChange: (n) => setState({ safeZoom: n }),
      }),
      h('div', { className: 'wbg-hint' }, '安全放大：在画面四周裁掉 1–10% 边缘，用于去除视频/图片自带的黑边。'),

      h(
        'div',
        { className: 'wbg-actions' },
        h('button', { type: 'button', className: 'wbg-btn', onClick: resetAll }, '恢复默认'),
        h(
          'span',
          { className: 'wbg-hint' },
          '背景层独立于桌面 Wallpaper Engine，切换不会影响桌面壁纸',
        ),
      ),
    )
  }

  // -------------------------------------------------------------------------
  // 注册设置选项卡
  // -------------------------------------------------------------------------
  function register(slots: SlotLike): void {
    slots.inject('settings.section', () =>
      slots.register(
        { name: 'settings.section', id: 'wallpaper', order: 30, label: '壁纸' },
        (props) => h(Panel, { close: props?.close }),
      ),
    )
  }

  return {
    getState: () => state,
    setState,
    subscribe: (fn) => {
      listeners.add(fn)
      return () => {
        listeners.delete(fn)
      }
    },
    applyNow,
    idbList,
    idbGet,
    idbPut,
    idbRemove,
    register,
    dispose: () => {
      stopSync()
    },
  }
}
