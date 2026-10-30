import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { GarmentPhoto } from '../components/GarmentPhoto'
import { WardrobeSwitcher } from '../components/WardrobeSwitcher'
import { outfitName, outfitSlots, outfitUsesMember } from '../lib/outfits'
import { wardrobeTitle } from '../lib/members'
import { useWardrobe } from '../store/wardrobe'
import type { Garment } from '../types'

function OutfitThumb({ garment }: { garment: Garment }) {
  return (
    <div className="outfit-thumb" title={garment.code}>
      <GarmentPhoto
        path={garment.photoPath}
        alt={garment.name || garment.code}
        mode={garment.displayMode}
        cartoonId={garment.cartoonId}
        customAssetId={garment.customAssetId}
      />
    </div>
  )
}

export function OutfitsPage() {
  const { outfits, garments, activeMember, members } = useWardrobe()
  const navigate = useNavigate()

  const title = useMemo(() => {
    if (activeMember === '__all__') return '全部搭配'
    if (activeMember === '__none__') return '未分类搭配'
    const name = members.find((member) => member.id === activeMember)?.name
    return name ? `${wardrobeTitle(name).replace(/的衣柜$/, '')}的搭配` : '搭配'
  }, [activeMember, members])

  const visible = useMemo(
    () => outfits.filter((outfit) => outfitUsesMember(outfit, garments, activeMember)),
    [outfits, garments, activeMember]
  )

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          <p className="sub">共 {visible.length} 套搭配</p>
        </div>
        <button className="btn small primary" onClick={() => navigate('/outfits/new')}>
          ＋ 新建
        </button>
      </header>

      <div style={{ marginBottom: 14 }}>
        <WardrobeSwitcher />
      </div>

      {visible.length === 0 ? (
        <div className="panel empty-state">
          <div className="empty-emoji" aria-hidden>
            🧩
          </div>
          <h2>还没有搭配</h2>
          <p className="desc">把上衣、裤子，和可选的外套、鞋子选在一起，保存成一套。</p>
          <button className="btn primary" onClick={() => navigate('/outfits/new')}>
            ＋ 新建第一套搭配
          </button>
        </div>
      ) : (
        <div className="outfit-list">
          {visible.map((outfit) => {
            const slots = outfitSlots(outfit, garments)
            const pieces = [slots.top, slots.outerwear, slots.pants, slots.shoes].filter(
              (piece): piece is Garment => Boolean(piece)
            )
            return (
              <button
                type="button"
                className="outfit-card"
                key={outfit.id}
                onClick={() => navigate(`/outfits/${outfit.id}/edit`)}
              >
                <div className="outfit-thumbs">
                  {pieces.map((piece) => (
                    <OutfitThumb key={piece.id} garment={piece} />
                  ))}
                </div>
                <div className="outfit-info">
                  <h3>{outfitName(outfit, garments)}</h3>
                  <p className="outfit-codes">{pieces.map((piece) => piece.code).join(' + ')}</p>
                  {outfit.notes.trim() ? <p className="outfit-notes">{outfit.notes}</p> : null}
                </div>
                <span className="outfit-arrow" aria-hidden>
                  ›
                </span>
              </button>
            )
          })}
        </div>
      )}
    </>
  )
}
