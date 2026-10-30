export const CATEGORIES = ['top', 'outerwear', 'pants', 'shoes'] as const
export type Category = (typeof CATEGORIES)[number]

export const CATEGORY_META: Record<Category, { label: string; prefix: string; emoji: string }> = {
  top: { label: '上衣', prefix: '上衣', emoji: '👕' },
  outerwear: { label: '外套', prefix: '外套', emoji: '🧥' },
  pants: { label: '裤子', prefix: '裤子', emoji: '👖' },
  shoes: { label: '鞋子', prefix: '鞋子', emoji: '👟' }
}

export const WASH_STATUSES = ['clean', 'to_wash', 'washing', 'drying', 'stored'] as const
export type WashStatus = (typeof WASH_STATUSES)[number]

export const WASH_STATUS_META: Record<
  WashStatus,
  { label: string; short: string; color: string; bg: string; emoji: string }
> = {
  clean: { label: '干净', short: '干净', color: '#2E5B47', bg: '#DCEAE0', emoji: '✨' },
  to_wash: { label: '待洗', short: '待洗', color: '#9A4B2E', bg: '#F7E2D6', emoji: '🧺' },
  washing: { label: '洗涤中', short: '洗涤中', color: '#2C5C7A', bg: '#DCEAF2', emoji: '🫧' },
  drying: { label: '已晾晒', short: '已晾晒', color: '#7A5B12', bg: '#F6E9C8', emoji: '☀️' },
  stored: { label: '已收纳', short: '已收纳', color: '#5B5470', bg: '#E7E3EF', emoji: '📦' }
}

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const
export type Season = (typeof SEASONS)[number]

export const SEASON_META: Record<Season, string> = {
  spring: '春',
  summer: '夏',
  autumn: '秋',
  winter: '冬'
}

export const THICKNESSES = ['thin', 'medium', 'thick'] as const
export type Thickness = (typeof THICKNESSES)[number]

export const THICKNESS_META: Record<Thickness, string> = {
  thin: '薄',
  medium: '适中',
  thick: '厚'
}

/** 衣服图片的显示方式，可以为每件衣服单独设置 */
export const IMAGE_MODES = ['photo', 'cartoon', 'hidden'] as const
export type ImageMode = (typeof IMAGE_MODES)[number]

export const IMAGE_MODE_META: Record<ImageMode, { label: string; emoji: string; hint: string }> = {
  photo: { label: '真实照片', emoji: '📷', hint: '显示你自己拍的照片' },
  cartoon: { label: '卡通图片', emoji: '🎨', hint: '显示内置卡通图或自定义图片' },
  hidden: { label: '隐藏图片', emoji: '🚫', hint: '不显示图片，只看编号和状态' }
}

/** 一个衣柜（爸爸/妈妈/我…），id 永远不会变，改名只改 name */
export interface Member {
  id: string
  name: string
  sortOrder?: number
}

export interface Garment {
  id: string
  code: string
  category: Category
  /** 归属衣柜的显示名（缓存，改名时会同步更新） */
  member: string
  /** 归属衣柜的内部编号，改名不变 */
  memberId: string | null
  name: string
  color: string
  seasons: Season[]
  thickness: Thickness
  notes: string
  /** 真实照片，图片数据存在 photo:<id> */
  photoPath: string | null
  /** 显示方式：真实照片 / 卡通图片 / 隐藏 */
  displayMode: ImageMode
  /** 选中的内置卡通素材 id */
  cartoonId: string | null
  /** 选中的自定义图片素材 id（优先于内置卡通图） */
  customAssetId: string | null
  washStatus: WashStatus
  statusChangedAt: number
  lastWashedAt: number | null
  wearCount: number
  createdAt: number
  updatedAt: number
}

/** 用户自己上传的展示图片（与真实照片分开存放，互不覆盖） */
export interface CustomAsset {
  id: string
  name: string
  /** 图片数据存在 custom:<id> */
  photoPath: string
  createdAt: number
}

export interface WashLog {
  id: string
  itemId: string
  itemCode: string
  itemName: string
  category: Category
  fromStatus: WashStatus | null
  toStatus: WashStatus
  at: number
}

export type NewGarmentInput = {
  category: Category
  /** 归属衣柜的内部编号 */
  memberId?: string | null
  /** 归属衣柜的显示名（可选；老数据/测试里可能没有） */
  member?: string
  name: string
  color: string
  seasons: Season[]
  thickness: Thickness
  notes: string
  photo: Blob | null
  displayMode: ImageMode
  cartoonId: string | null
  customAssetId: string | null
}

export type GarmentPatch = Partial<
  Pick<
    Garment,
    | 'name'
    | 'color'
    | 'category'
    | 'member'
    | 'memberId'
    | 'seasons'
    | 'thickness'
    | 'notes'
    | 'washStatus'
    | 'photoPath'
    | 'displayMode'
    | 'cartoonId'
    | 'customAssetId'
  >
>

export interface ExportBundle {
  app: 'my-ai-wardrobe'
  version: 1
  exportedAt: string
  garments: Garment[]
  logs: WashLog[]
  photos: { path: string; dataUrl: string }[]
  customAssets?: CustomAsset[]
}

export const CATEGORY_ORDER: Record<Category, number> = { top: 1, outerwear: 2, pants: 3, shoes: 4 }

export const ALL_CATEGORY_LABEL = '全部'
