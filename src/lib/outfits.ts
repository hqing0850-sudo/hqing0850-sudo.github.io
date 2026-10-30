import type { Garment, Outfit } from '../types'

export interface OutfitSlots {
  top: Garment | null
  outerwear: Garment | null
  pants: Garment | null
  shoes: Garment | null
}

export function outfitSlots(outfit: Outfit, garments: Garment[]): OutfitSlots {
  const byId = new Map(garments.map((garment) => [garment.id, garment]))
  return {
    top: byId.get(outfit.topId) ?? null,
    outerwear: outfit.outerwearId ? byId.get(outfit.outerwearId) ?? null : null,
    pants: byId.get(outfit.pantsId) ?? null,
    shoes: outfit.shoesId ? byId.get(outfit.shoesId) ?? null : null
  }
}

export function outfitGarmentIds(outfit: Outfit): string[] {
  return [outfit.topId, outfit.outerwearId, outfit.pantsId, outfit.shoesId].filter(
    (id): id is string => Boolean(id)
  )
}

export function outfitGarmentList(outfit: Outfit, garments: Garment[]): Garment[] {
  const slots = outfitSlots(outfit, garments)
  return [slots.top, slots.outerwear, slots.pants, slots.shoes].filter(
    (garment): garment is Garment => Boolean(garment)
  )
}

/** 名称留空时自动用编号组合，例如“上衣001 + 外套001 + 裤子001” */
export function outfitName(outfit: Outfit, garments: Garment[]): string {
  const custom = outfit.name.trim()
  if (custom) return custom
  const codes = outfitGarmentList(outfit, garments).map((garment) => garment.code)
  return codes.length ? codes.join(' + ') : '未命名搭配'
}

/** 搭配里只要有一件衣服属于这个衣柜，就认为这套搭配属于这个衣柜 */
export function outfitUsesMember(outfit: Outfit, garments: Garment[], memberId: string): boolean {
  if (memberId === '__all__') return true
  const list = outfitGarmentList(outfit, garments)
  if (memberId === '__none__') return list.some((garment) => !garment.memberId)
  return list.some((garment) => garment.memberId === memberId)
}

/** 这套搭配里被占用的衣服 id，用于删除衣服前检查 */
export function outfitsUsingGarment(outfits: Outfit[], garmentId: string): Outfit[] {
  return outfits.filter((outfit) => outfitGarmentIds(outfit).includes(garmentId))
}
