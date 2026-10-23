import type { Category } from '../types'

/**
 * 内置卡通衣服素材库。
 *
 * 全部用 SVG 代码现场画出来，不依赖任何图片文件：
 * 体积小、任意尺寸都不模糊，也方便以后继续加款式。
 */

export interface CartoonColor {
  id: string
  name: string
  hex: string
}

export const CARTOON_COLORS: CartoonColor[] = [
  { id: 'cream', name: '米白', hex: '#EFE3CE' },
  { id: 'sky', name: '天蓝', hex: '#A9C8E8' },
  { id: 'mint', name: '薄荷绿', hex: '#A9D5B8' },
  { id: 'sakura', name: '樱花粉', hex: '#EDB3C0' },
  { id: 'mustard', name: '姜黄', hex: '#E7C56A' },
  { id: 'lilac', name: '灰紫', hex: '#AFA9C9' }
]

interface CartoonTemplate {
  id: string
  name: string
  category: Category
  draw: (fill: string, shade: string) => string
}

function shadeHex(hex: string, factor = 0.8): string {
  const n = hex.replace('#', '')
  const r = Math.round(parseInt(n.slice(0, 2), 16) * factor)
  const g = Math.round(parseInt(n.slice(2, 4), 16) * factor)
  const b = Math.round(parseInt(n.slice(4, 6), 16) * factor)
  const to = (v: number) => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

const neck = (shade: string) =>
  `<path d="M35 24 Q50 33 65 24" fill="none" stroke="${shade}" stroke-width="2.6" stroke-linecap="round"/>`

export const CARTOON_TEMPLATES: CartoonTemplate[] = [
  // ---------------- 上衣 ----------------
  {
    id: 'tee',
    name: '短袖T恤',
    category: 'top',
    draw: (f, s) =>
      `<path d="M35 24 Q50 33 65 24 L85 33 L79 46 L68 39 L68 81 L32 81 L32 39 L21 46 L15 33 Z" fill="${f}"/>${neck(s)}`
  },
  {
    id: 'longsleeve',
    name: '长袖T恤',
    category: 'top',
    draw: (f, s) =>
      `<path d="M35 24 Q50 33 65 24 L89 32 L95 67 L84 71 L74 43 L68 39 L68 81 L32 81 L32 39 L26 43 L16 71 L5 67 L11 32 Z" fill="${f}"/>${neck(s)}`
  },
  {
    id: 'shirt',
    name: '衬衫',
    category: 'top',
    draw: (f, s) =>
      `<path d="M37 23 L46 18 L50 27 L54 18 L63 23 L87 31 L93 65 L83 69 L74 41 L68 37 L68 81 L32 81 L32 37 L26 41 L17 69 L7 65 L13 31 Z" fill="${f}"/>` +
      `<path d="M46 18 L50 27 L54 18 L58 22 L50 31 L42 22 Z" fill="${s}"/>` +
      `<path d="M50 31 L50 79" stroke="${s}" stroke-width="2"/>` +
      `<circle cx="50" cy="39" r="1.9" fill="${s}"/><circle cx="50" cy="50" r="1.9" fill="${s}"/><circle cx="50" cy="61" r="1.9" fill="${s}"/>`
  },
  {
    id: 'hoodie',
    name: '卫衣',
    category: 'top',
    draw: (f, s) =>
      `<path d="M33 31 L41 25 L59 25 L67 31 L88 38 L94 68 L84 72 L75 44 L68 40 L68 82 L32 82 L32 40 L25 44 L16 72 L6 68 L12 38 Z" fill="${f}"/>` +
      `<path d="M41 25 Q50 11 59 25 Q50 33 41 25 Z" fill="${s}"/>` +
      `<rect x="38" y="55" width="24" height="16" rx="3" fill="${s}" opacity="0.35"/>` +
      `<path d="M35 30 Q50 40 65 30" fill="none" stroke="${s}" stroke-width="2.2"/>`
  },
  {
    id: 'sweater',
    name: '毛衣',
    category: 'top',
    draw: (f, s) =>
      `<path d="M35 24 Q50 32 65 24 L89 31 L94 66 L84 70 L75 42 L68 38 L68 78 L32 78 L32 38 L25 42 L16 70 L6 66 L11 31 Z" fill="${f}"/>` +
      `<path d="M32 71 L68 71 M32 65 L68 65" stroke="${s}" stroke-width="2.2"/>` +
      `<path d="M35 24 Q50 32 65 24" fill="none" stroke="${s}" stroke-width="2.6" stroke-linecap="round"/>`
  },
  {
    id: 'tank',
    name: '背心',
    category: 'top',
    draw: (f, s) =>
      `<path d="M41 21 L46 18 L54 18 L59 21 L63 29 L63 79 L37 79 L37 29 Z" fill="${f}"/>` +
      `<path d="M41 21 Q50 30 59 21" fill="none" stroke="${s}" stroke-width="2.6" stroke-linecap="round"/>`
  },
  {
    id: 'polo',
    name: 'Polo衫',
    category: 'top',
    draw: (f, s) =>
      `<path d="M35 24 Q50 33 65 24 L85 33 L79 46 L68 39 L68 81 L32 81 L32 39 L21 46 L15 33 Z" fill="${f}"/>` +
      `<path d="M39 25 L50 34 L61 25 L64 28 L50 39 L36 28 Z" fill="${s}"/>` +
      `<circle cx="50" cy="41" r="1.7" fill="${s}"/><circle cx="50" cy="48" r="1.7" fill="${s}"/>`
  },

  // ---------------- 外套 ----------------
  {
    id: 'jacket',
    name: '夹克',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M36 21 L46 17 L50 30 L54 17 L64 21 L86 28 L80 42 L68 36 L68 79 L32 79 L32 36 L20 42 L14 28 Z" fill="${f}"/>` +
      `<path d="M46 17 L50 30 L54 17 L58 20 L50 34 L42 20 Z" fill="${s}"/>` +
      `<path d="M50 34 L50 78" stroke="${s}" stroke-width="2.4"/>` +
      `<circle cx="50" cy="45" r="1.8" fill="${s}"/>`
  },
  {
    id: 'coat',
    name: '大衣',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M36 19 L46 15 L50 28 L54 15 L64 19 L88 27 L94 62 L84 66 L75 39 L68 35 L68 87 L32 87 L32 35 L25 39 L16 66 L6 62 L12 27 Z" fill="${f}"/>` +
      `<path d="M46 15 L50 28 L54 15 L58 18 L50 32 L42 18 Z" fill="${s}"/>` +
      `<rect x="30" y="53" width="40" height="6" rx="2" fill="${s}"/>` +
      `<rect x="46" y="52" width="8" height="8" rx="2" fill="${s}" opacity="0.6"/>`
  },
  {
    id: 'trench',
    name: '风衣',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M34 20 L45 14 L50 27 L55 14 L66 20 L88 28 L94 63 L84 67 L75 40 L68 36 L68 88 L32 88 L32 36 L25 40 L16 67 L6 63 L12 28 Z" fill="${f}"/>` +
      `<path d="M45 14 L50 27 L55 14 L60 18 L50 33 L40 18 Z" fill="${s}"/>` +
      `<rect x="28" y="54" width="44" height="7" rx="2.5" fill="${s}"/>` +
      `<rect x="46" y="53" width="8" height="9" rx="2" fill="${s}" opacity="0.55"/>`
  },
  {
    id: 'puffer',
    name: '羽绒服',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M34 26 L42 20 L58 20 L66 26 L87 33 L93 64 L83 68 L74 42 L68 38 L68 79 L32 79 L32 38 L26 42 L17 68 L7 64 L13 33 Z" fill="${f}"/>` +
      `<rect x="41" y="18" width="18" height="9" rx="3" fill="${s}"/>` +
      `<path d="M32 46 L68 46 M32 57 L68 57 M32 68 L68 68" stroke="${s}" stroke-width="2" opacity="0.5"/>`
  },
  {
    id: 'suit',
    name: '西装',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M36 19 L50 33 L64 19 L86 27 L93 63 L83 67 L74 39 L68 35 L68 81 L32 81 L32 35 L26 39 L17 67 L7 63 L14 27 Z" fill="${f}"/>` +
      `<path d="M44 21 L50 33 L56 21 L53 18 L47 18 Z" fill="#FFFFFF"/>` +
      `<path d="M36 19 L44 21 L50 33 L46 41 L36 27 Z" fill="${s}"/>` +
      `<path d="M64 19 L56 21 L50 33 L54 41 L64 27 Z" fill="${s}"/>`
  },
  {
    id: 'leather',
    name: '皮衣',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M34 24 L44 18 L50 26 L56 18 L66 24 L87 31 L81 45 L68 39 L68 78 L32 78 L32 39 L19 45 L13 31 Z" fill="${f}"/>` +
      `<path d="M44 18 L50 26 L56 18 L60 22 L50 31 L40 22 Z" fill="${s}"/>` +
      `<path d="M50 31 L50 77" stroke="${s}" stroke-width="2.4"/>` +
      `<path d="M44 42 L44 72" stroke="${s}" stroke-width="1.4" opacity="0.45"/>`
  },
  {
    id: 'cardigan',
    name: '开衫',
    category: 'outerwear',
    draw: (f, s) =>
      `<path d="M35 23 Q50 31 65 23 L89 30 L94 66 L84 70 L75 42 L68 38 L68 80 L32 80 L32 38 L25 42 L16 70 L6 66 L11 30 Z" fill="${f}"/>` +
      `<rect x="47" y="30" width="6" height="50" rx="3" fill="#FFFFFF" opacity="0.75"/>` +
      `<circle cx="55" cy="42" r="1.8" fill="${s}"/><circle cx="55" cy="53" r="1.8" fill="${s}"/><circle cx="55" cy="64" r="1.8" fill="${s}"/>`
  },

  // ---------------- 裤子 ----------------
  {
    id: 'trousers',
    name: '长裤',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="33" y="19" width="34" height="10" rx="3" fill="${s}"/>` +
      `<path d="M33 29 L67 29 L65 82 L56 82 L50 48 L44 82 L35 82 Z" fill="${f}"/>`
  },
  {
    id: 'shorts',
    name: '短裤',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="33" y="21" width="34" height="10" rx="3" fill="${s}"/>` +
      `<path d="M33 31 L67 31 L65 58 L56 58 L50 44 L44 58 L35 58 Z" fill="${f}"/>`
  },
  {
    id: 'jeans',
    name: '牛仔裤',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="33" y="19" width="34" height="10" rx="3" fill="${s}"/>` +
      `<path d="M33 29 L67 29 L65 82 L56 82 L50 48 L44 82 L35 82 Z" fill="${f}"/>` +
      `<path d="M36 33 q5 9 11 6 M64 33 q-5 9 -11 6" fill="none" stroke="${s}" stroke-width="2"/>` +
      `<path d="M50 42 L50 80" stroke="${s}" stroke-width="1.4" opacity="0.55"/>`
  },
  {
    id: 'sweatpants',
    name: '运动裤',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="31" y="19" width="38" height="11" rx="4" fill="${s}"/>` +
      `<path d="M31 30 L69 30 L70 82 L56 82 L50 46 L44 82 L30 82 Z" fill="${f}"/>` +
      `<path d="M43 34 q7 7 14 0" fill="none" stroke="${s}" stroke-width="2"/>`
  },
  {
    id: 'skirt',
    name: '半身裙',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="36" y="21" width="28" height="10" rx="3" fill="${s}"/>` +
      `<path d="M36 31 L64 31 L74 78 L26 78 Z" fill="${f}"/>`
  },
  {
    id: 'wideleg',
    name: '阔腿裤',
    category: 'pants',
    draw: (f, s) =>
      `<rect x="31" y="19" width="38" height="11" rx="4" fill="${s}"/>` +
      `<path d="M31 30 L69 30 L73 82 L56 82 L50 48 L44 82 L27 82 Z" fill="${f}"/>`
  }
]

export interface CartoonAsset {
  id: string
  name: string
  category: Category
  templateId: string
  colorId: string
}

const ASSETS: CartoonAsset[] = CARTOON_TEMPLATES.flatMap((tpl) =>
  CARTOON_COLORS.map((color) => ({
    id: `${tpl.id}-${color.id}`,
    name: `${tpl.name} · ${color.name}`,
    category: tpl.category,
    templateId: tpl.id,
    colorId: color.id
  }))
)

const ASSET_BY_ID = new Map(ASSETS.map((asset) => [asset.id, asset]))

export function listCartoonAssets(category?: Category): CartoonAsset[] {
  return category ? ASSETS.filter((asset) => asset.category === category) : ASSETS
}

export function cartoonAssetById(id: string | null | undefined): CartoonAsset | null {
  if (!id) return null
  return ASSET_BY_ID.get(id) ?? null
}

function wrap(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${body}</svg>`
}

/** 生成卡通图的 SVG 源码 */
export function cartoonSvg(assetId: string | null | undefined): string | null {
  const asset = cartoonAssetById(assetId)
  if (!asset) return null
  const tpl = CARTOON_TEMPLATES.find((t) => t.id === asset.templateId)
  const color = CARTOON_COLORS.find((c) => c.id === asset.colorId)
  if (!tpl || !color) return null
  return wrap(tpl.draw(color.hex, shadeHex(color.hex)))
}

/** 生成可以直接放进 <img src> 的 data URI */
export function cartoonDataUri(assetId: string | null | undefined): string | null {
  const svg = cartoonSvg(assetId)
  if (!svg) return null
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}
