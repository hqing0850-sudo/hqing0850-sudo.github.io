import { useMemo, useState } from 'react'
import { useWardrobe } from '../store/wardrobe'

const ALL = '__all__'
const NONE = '__none__'

/** 衣柜切换器：首页点绿色「衣」图标、衣服页点胶囊按钮都会打开 */
export function WardrobeSwitcher({ variant = 'pill' }: { variant?: 'pill' | 'hero' }) {
  const { garments, members, activeMember, setActiveMember, addMember } = useWardrobe()
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')

  const counts = useMemo(() => {
    const map: Record<string, number> = { [ALL]: garments.length, [NONE]: 0 }
    for (const g of garments) {
      if (g.member) map[g.member] = (map[g.member] ?? 0) + 1
      else map[NONE] += 1
    }
    return map
  }, [garments])

  const shortLabel = activeMember === ALL ? '全部' : activeMember === NONE ? '未分类' : activeMember
  const fullLabel = activeMember === ALL ? '全部衣柜' : activeMember === NONE ? '未分类' : `${activeMember}的衣柜`

  function choose(name: string) {
    setActiveMember(name)
    setOpen(false)
  }

  return (
    <>
      {variant === 'hero' ? (
        <div className="hero-switch">
          <button className="hero-mark" onClick={() => setOpen(true)} aria-label="切换衣柜">
            衣
          </button>
          <span className="hero-switch-label">{shortLabel} ▾</span>
        </div>
      ) : (
        <button className="btn small ghost wardrobe-switch" onClick={() => setOpen(true)}>
          🗄️ {fullLabel} ▾
        </button>
      )}

      {open ? (
        <div className="share-overlay" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
          <div className="share-sheet switcher-sheet" onClick={(e) => e.stopPropagation()}>
            <button className="share-close" onClick={() => setOpen(false)} aria-label="关闭">
              ✕
            </button>
            <div className="switcher-body">
              <h2>切换衣柜</h2>
              <p className="note">切换后，新增和修改都会作用在这个衣柜里，别人也能看到。</p>

              <button className={`switch-option ${activeMember === ALL ? 'on' : ''}`} onClick={() => choose(ALL)}>
                <span>👨‍👩‍👧 全部衣柜</span>
                <span className="switch-count">{counts[ALL]}</span>
              </button>

              {members.map((name) => (
                <button
                  key={name}
                  className={`switch-option ${activeMember === name ? 'on' : ''}`}
                  onClick={() => choose(name)}
                >
                  <span>{name}的衣柜</span>
                  <span className="switch-count">{counts[name] ?? 0}</span>
                </button>
              ))}

              {counts[NONE] ? (
                <button
                  className={`switch-option ${activeMember === NONE ? 'on' : ''}`}
                  onClick={() => choose(NONE)}
                >
                  <span>未分类</span>
                  <span className="switch-count">{counts[NONE]}</span>
                </button>
              ) : null}

              <div className="switcher-new">
                <input
                  className="input"
                  value={newName}
                  maxLength={12}
                  placeholder="新建衣柜，例如：宝宝"
                  onChange={(e) => setNewName(e.target.value)}
                />
                <button
                  className="btn small primary"
                  disabled={!newName.trim()}
                  onClick={() => {
                    addMember(newName)
                    setNewName('')
                    setOpen(false)
                  }}
                >
                  新建
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
