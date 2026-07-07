import { useState } from 'react'

interface MenuItem {
  key: string
  title: string
  description: string
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const menuGroups: MenuGroup[] = [
  {
    title: 'Calculators',
    items: [
      {
        key: 'corrugated-box-price',
        title: 'Corrugated Box Price Calculator',
        description:
          'Estimate the cost of corrugated boxes based on size, material, and quantity for your packaging needs.',
      },
    ],
  },
  {
    title: 'Documents',
    items: [
      {
        key: 'coc',
        title: 'COC (Certificate of Compliance)',
        description:
          'View or generate a Certificate of Compliance for corrugated packaging materials and manufacturing standards.',
      },
      {
        key: 'coa',
        title: 'COA (Certificate of Analysis)',
        description:
          'Access the Certificate of Analysis for quality assurance and material test results.',
      },
      {
        key: 'packing-slip',
        title: 'Packing Slip',
        description:
          'Create packing slips for shipments and documentation required during order fulfillment.',
      },
    ],
  },
]

export default function Dashboard({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [selectedKey, setSelectedKey] = useState(menuGroups[0].items[0].key)

  const selectedItem = menuGroups
    .flatMap((group) => group.items)
    .find((item) => item.key === selectedKey) ?? menuGroups[0].items[0]

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-brand">
          <img
            className="site-logo"
            src="/assets/logo.png"
            alt="PolarCanvas logo"
          />
        </div>
        <div className="dashboard-header-actions">
          <span className="dashboard-welcome">Welcome, {username}</span>
          <button className="logout-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="dashboard-grid">
        <aside className="dashboard-menu">
          {menuGroups.map((group) => (
            <div key={group.title} className="menu-group">
              <h3>{group.title}</h3>
              <ul className="menu-list">
                {group.items.map((item) => (
                  <li
                    key={item.key}
                    className={`menu-item ${item.key === selectedKey ? 'active' : ''}`}
                    onClick={() => setSelectedKey(item.key)}
                  >
                    <span>{item.title}</span>
                    {item.key === selectedKey && <span>✓</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </aside>

        <section className="dashboard-content">
          <div className="dashboard-card">
            <h2>{selectedItem.title}</h2>
            <p>{selectedItem.description}</p>
            <div className="dashboard-details">
              {selectedItem.key === 'corrugated-box-price' && (
                <div>
                  <p>
                    Use the corrugated box calculator to check pricing on boxes of different dimensions and quantities.
                  </p>
                </div>
              )}
              {selectedItem.key === 'coc' && (
                <div>
                  <p>
                    The Certificate of Compliance confirms your packaging meets the required manufacturing and material standards.
                  </p>
                </div>
              )}
              {selectedItem.key === 'coa' && (
                <div>
                  <p>
                    The Certificate of Analysis provides the quality and testing information for the packaging material.
                  </p>
                </div>
              )}
              {selectedItem.key === 'packing-slip' && (
                <div>
                  <p>
                    Generate and print packing slips to accompany your shipments and help with order tracking.
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
