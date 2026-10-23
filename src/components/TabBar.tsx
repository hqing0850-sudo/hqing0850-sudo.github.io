import { NavLink } from 'react-router-dom'

const TABS = [
  { to: '/', label: '首页', icon: '🏠', end: true },
  { to: '/wardrobe', label: '我的衣服', icon: '👚', end: false },
  { to: '/laundry', label: '洗衣记录', icon: '🧺', end: false },
  { to: '/settings', label: '设置', icon: '⚙️', end: false }
]

export function TabBar() {
  return (
    <nav className="tabbar" aria-label="主导航">
      {TABS.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <span className="ico" aria-hidden>
            {tab.icon}
          </span>
          <span>{tab.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}
