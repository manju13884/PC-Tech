import { useEffect, useState } from 'react'

interface PermissionUser { viewDashboardCustomers: number; inheritedDashboardCustomers: number; id: number; fullName: string; email: string; role: string; reassign: number; inherited: number; deleteStock: number; inheritedDelete: number; viewAll: number; inheritedViewAll: number }
export default function UserSpecialPermissions() {
  const [users, setUsers] = useState<PermissionUser[]>([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/special-permissions', { credentials: 'include', signal: controller.signal })
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Unable to load special permissions.')
        if (!controller.signal.aborted) setUsers(payload.users)
      })
      .catch(e => { if (!controller.signal.aborted) setError(e.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const user = users.find(user => String(user.id) === selected)
  async function toggle(granted: boolean, permissionKey = 'lead-management:reassign') {
    if (!user || saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/auth/special-permissions', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, granted, permissionKey }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'Unable to save permission.')
      setUsers(current => current.map(entry => entry.id === user.id ? { ...entry, [permissionKey === 'dashboard:view-customer-names' ? 'viewDashboardCustomers' : permissionKey === 'material-stock:delete' ? 'deleteStock' : permissionKey === 'lead-management:view-all' ? 'viewAll' : 'reassign']: granted ? 1 : 0 } : entry))
      setNotice(`${permissionKey === 'dashboard:view-customer-names' ? 'View dashboard customer names' : permissionKey === 'material-stock:delete' ? 'Delete Material Stock Rows' : permissionKey === 'lead-management:view-all' ? 'View all leads / companies' : 'Reassign'} permission ${granted ? 'granted to' : 'removed from'} ${user.fullName}.`)
    } catch (e) { setError((e as Error).message) }
    finally { setSaving(false) }
  }
  return (
    <section className="user-special-permissions" aria-label="User special permissions">
      <label className="user-special-select">User permissions
        <select value={selected} disabled={loading || saving} onChange={event => { setSelected(event.target.value); setNotice(''); setError('') }}>
          <option value="">{loading ? 'Loading users...' : 'Select a user'}</option>
          {users.map(user => <option key={user.id} value={user.id}>{user.fullName} ({user.role}) - {user.email}</option>)}
        </select>
      </label>
      <div className="admin-users-table-wrap">
        <table className="admin-users-table"><thead><tr><th>Module</th><th>Permission</th><th>Access</th></tr></thead>
          <tbody><tr><td>Sales / Lead Management</td><td><strong>Reassign leads</strong><small className="user-special-note">Reassign leads the selected user can access. Lead Management view and edit access is required.</small></td>
            <td><input type="checkbox" className="admin-access-checkbox" checked={Boolean(user?.reassign)} disabled={!user || !['SUPERADMIN','ADMIN','SALES'].includes(user.role) || Boolean(user.inherited) || saving} onChange={event => void toggle(event.target.checked)} aria-label="Allow selected user to reassign leads" />
              {Boolean(user?.inherited) && <small className="user-special-note">Included with administrator role</small>}
            </td></tr>
            <tr><td>Sales / Lead Management</td><td><strong>View all leads / companies</strong><small className="user-special-note">View all leads and companies, and use all lead actions: Edit, Add Follow-up, Update Status, Convert to Customer and Reassign. Lead Management menu access is required.</small></td>
              <td><input type="checkbox" className="admin-access-checkbox" checked={Boolean(user?.viewAll)} disabled={!user || Boolean(user.inheritedViewAll) || saving} onChange={event => void toggle(event.target.checked, 'lead-management:view-all')} aria-label="Allow selected user to view all leads and companies" />
                {Boolean(user?.inheritedViewAll) && <small className="user-special-note">Included with administrator role</small>}
              </td></tr>
            <tr><td>Inventory / Material Stock</td><td><strong>Delete Material Stock Rows</strong><small className="user-special-note">Delete eligible, unused stock rows. Stock Report or Material Stock view access is required.</small></td>
              <td><input type="checkbox" className="admin-access-checkbox" checked={Boolean(user?.deleteStock)} disabled={!user || Boolean(user.inheritedDelete) || saving} onChange={event => void toggle(event.target.checked, 'material-stock:delete')} aria-label="Allow selected user to delete Material Stock rows" />
                {Boolean(user?.inheritedDelete) && <small className="user-special-note">Included with SUPERADMIN role</small>}
              </td></tr>
            <tr><td>Dashboard</td><td><strong>View dashboard customer names</strong><small className="user-special-note">Allow revealing full customer names on the dashboard. Names are hidden by default.</small></td>
              <td><input type="checkbox" className="admin-access-checkbox" checked={Boolean(user?.viewDashboardCustomers)} disabled={!user || Boolean(user.inheritedDashboardCustomers) || saving} onChange={event => void toggle(event.target.checked, 'dashboard:view-customer-names')} aria-label="Allow selected user to view dashboard customer names" />
                {Boolean(user?.inheritedDashboardCustomers) && <small className="user-special-note">Included with SUPERADMIN role</small>}
              </td></tr></tbody>
        </table>
      </div>
      {saving && <p role="status" className="user-special-note">Saving permission...</p>}
      {notice && <p role="status" className="user-special-note">{notice}</p>}
      {error && <p role="alert" className="user-special-error">{error}</p>}
    </section>
  )
}
