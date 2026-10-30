import { describe, expect, it } from 'vitest'
import { CARTOON_COLORS, CARTOON_TEMPLATES, cartoonDataUri, cartoonSvg, listCartoonAssets } from './cartoon'
import { CATEGORIES } from '../types'

describe('卡通素材库', () => {
  it('上衣、外套、裤子都有多种款式', () => {
    for (const category of CATEGORIES.filter((item) => item !== 'shoes')) {
      const templates = CARTOON_TEMPLATES.filter((t) => t.category === category)
      expect(templates.length).toBeGreaterThanOrEqual(5)
    }
  })

  it('鞋子暂时没有内置卡通图', () => {
    expect(listCartoonAssets('shoes')).toHaveLength(0)
  })

  it('每种款式都有多种颜色', () => {
    expect(CARTOON_COLORS.length).toBeGreaterThanOrEqual(5)
    for (const template of CARTOON_TEMPLATES) {
      const assets = listCartoonAssets(template.category).filter((a) => a.templateId === template.id)
      expect(assets.length).toBe(CARTOON_COLORS.length)
    }
  })

  it('素材编号唯一', () => {
    const ids = listCartoonAssets().map((asset) => asset.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('不同素材画出来的图案不一样', () => {
    const tee = cartoonSvg('tee-mint')
    const jeans = cartoonSvg('jeans-sky')
    const shirt = cartoonSvg('shirt-cream')
    expect(tee).not.toBe(jeans)
    expect(tee).not.toBe(shirt)
    expect(jeans).not.toBe(shirt)
  })

  it('能生成可用的 data URI', () => {
    const uri = cartoonDataUri('tee-mint')
    expect(uri?.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    expect(uri).toContain('%3Csvg')
  })

  it('不存在的素材返回空', () => {
    expect(cartoonSvg('not-exists')).toBeNull()
    expect(cartoonDataUri(null)).toBeNull()
  })

  it('素材名称是中文可读的', () => {
    const asset = listCartoonAssets('top')[0]
    expect(asset.name).toMatch(/[一-龥]/)
  })
})
