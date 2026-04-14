'use client'
import { useEffect, useState, useCallback } from 'react'
import { useApp } from '@/hooks/useApp'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, Tabs, Card, ProgressBar } from '@/components/ui'
import { Plus } from 'lucide-react'
import type { InventoryItem, DistributionEvent } from '@/types'

export default function SupplyPage() {
  const { activeProject, isAdmin } = useApp()
  const supabase = createClient()
  const [tab, setTab] = useState('Inventory')
  const [items, setItems] = useState<InventoryItem[]>([])
  const [dists, setDists] = useState<(DistributionEvent & { inventory_items?: InventoryItem })[]>([])
  const [openModal, setOpenModal] = useState<'stock'|'dist'|null>(null)
  const [saving, setSaving] = useState(false)

  const [stockForm, setStockForm] = useState({ name:'', qty:'', unit:'units', date: new Date().toISOString().slice(0,10), donor:'' })
  const [distForm, setDistForm] = useState({ date: new Date().toISOString().slice(0,10), location:'', item_id:'', qty:'', bene:'', notes:'' })

  const load = useCallback(async () => {
    if (!activeProject) return
    const [invR, distR] = await Promise.all([
      supabase.from('inventory_items').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
      supabase.from('distribution_events').select('*, inventory_items(name,unit)').eq('project_id', activeProject.id).order('event_date', { ascending: false }),
    ])
    setItems((invR.data ?? []) as InventoryItem[])
    setDists((distR.data ?? []) as (DistributionEvent & { inventory_items?: InventoryItem })[])
  }, [activeProject]) // eslint-disable-line

  useEffect(() => { load() }, [load])

  const addStock = async () => {
    if (!stockForm.name || !stockForm.qty || !activeProject) return
    setSaving(true)
    const qty = parseFloat(stockForm.qty)
    const existing = items.find(i => i.name.toLowerCase() === stockForm.name.toLowerCase())
    if (existing) {
      await supabase.from('inventory_items').update({ quantity_received: existing.quantity_received + qty }).eq('id', existing.id)
    } else {
      await supabase.from('inventory_items').insert({
        project_id: activeProject.id, name: stockForm.name, unit: stockForm.unit,
        quantity_received: qty, quantity_distributed: 0, donor_source: stockForm.donor || null
      })
    }
    setStockForm({ name:'', qty:'', unit:'units', date: new Date().toISOString().slice(0,10), donor:'' })
    setOpenModal(null); setSaving(false); load()
  }

  const logDist = async () => {
    if (!distForm.item_id || !distForm.qty || !activeProject) return
    const qty = parseFloat(distForm.qty)
    const item = items.find(i => i.id === distForm.item_id)
    if (!item) return
    const balance = item.quantity_received - item.quantity_distributed
    if (qty > balance) return alert(`Insufficient stock. Balance: ${balance} ${item.unit}`)
    setSaving(true)
    await Promise.all([
      supabase.from('inventory_items').update({ quantity_distributed: item.quantity_distributed + qty }).eq('id', item.id),
      supabase.from('distribution_events').insert({
        project_id: activeProject.id, event_date: distForm.date, location: distForm.location || null,
        item_id: distForm.item_id, quantity_out: qty,
        beneficiaries: parseInt(distForm.bene) || null, notes: distForm.notes || null
      })
    ])
    setDistForm({ date: new Date().toISOString().slice(0,10), location:'', item_id:'', qty:'', bene:'', notes:'' })
    setOpenModal(null); setSaving(false); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">Select a project first.</div>

  const totalDist = dists.reduce((a, d) => a + (d.quantity_out ?? 0), 0)
  const totalBene = dists.reduce((a, d) => a + (d.beneficiaries ?? 0), 0)

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">Projects › {activeProject.name} › Supply & Distribution</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Supply & Distribution</h1>
          <div className="text-xs text-gray-400">{items.length} item types · {totalDist.toLocaleString()} units distributed · {totalBene.toLocaleString()} beneficiaries</div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpenModal('stock')}><Plus size={13}/>Add stock</Button>
            <Button variant="primary" size="sm" onClick={() => setOpenModal('dist')}
              disabled={items.length === 0}><Plus size={13}/>Log distribution</Button>
          </div>
        )}
      </div>

      <Tabs tabs={['Inventory', 'Distributions']} active={tab} onChange={setTab} />

      {tab === 'Inventory' && (
        <div className="space-y-4">
          {/* Stock levels visual */}
          {items.length > 0 && (
            <Card>
              <div className="text-sm font-semibold text-gray-900 mb-3">Stock levels</div>
              <div className="space-y-3">
                {items.map(item => {
                  const usedPct = item.quantity_received > 0
                    ? Math.round((item.quantity_distributed / item.quantity_received) * 100)
                    : 0
                  const balance = item.quantity_received - item.quantity_distributed
                  const low = usedPct > 80
                  return (
                    <div key={item.id}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-gray-700">{item.name}</span>
                        <span className={low ? 'text-red-600 font-semibold' : 'text-gray-500'}>
                          Balance: {balance.toLocaleString()} {item.unit}
                        </span>
                      </div>
                      <ProgressBar value={item.quantity_distributed} max={item.quantity_received || 1}
                        color={low ? '#DC2626' : '#0891B2'} height={6} />
                    </div>
                  )
                })}
              </div>
            </Card>
          )}
          <Table headers={['Item','Unit','Received','Distributed','Balance','Donor / Source']} empty={items.length === 0}>
            {items.map(item => {
              const balance = item.quantity_received - item.quantity_distributed
              return (
                <TR key={item.id}>
                  <TD><span className="font-medium">{item.name}</span></TD>
                  <TD>{item.unit}</TD>
                  <TD>{item.quantity_received.toLocaleString()}</TD>
                  <TD>{item.quantity_distributed.toLocaleString()}</TD>
                  <TD>
                    <span className={`font-bold ${balance < 10 ? 'text-red-600' : 'text-gray-900'}`}>
                      {balance.toLocaleString()}
                    </span>
                  </TD>
                  <TD className="text-gray-400 text-xs">{item.donor_source ?? '—'}</TD>
                </TR>
              )
            })}
          </Table>
        </div>
      )}

      {tab === 'Distributions' && (
        <Table headers={['Date','Location','Item','Qty out','Beneficiaries','Notes']} empty={dists.length === 0}>
          {dists.map(d => (
            <TR key={d.id}>
              <TD>{d.event_date}</TD>
              <TD>{d.location ?? '—'}</TD>
              <TD><span className="font-medium">{d.inventory_items?.name ?? '—'}</span></TD>
              <TD>{d.quantity_out.toLocaleString()} {d.inventory_items?.unit}</TD>
              <TD>{d.beneficiaries ? d.beneficiaries.toLocaleString() : '—'}</TD>
              <TD className="text-gray-400 text-xs">{d.notes ?? '—'}</TD>
            </TR>
          ))}
        </Table>
      )}

      {/* Add stock modal */}
      <Modal open={openModal === 'stock'} onClose={() => setOpenModal(null)} title="Add stock receipt"
        footer={<><Button variant="secondary" onClick={() => setOpenModal(null)}>Cancel</Button><Button variant="primary" onClick={addStock} disabled={saving}>{saving?'Saving…':'Add stock'}</Button></>}>
        <div className="space-y-3">
          <Field label="Item name"><Input value={stockForm.name} onChange={e => setStockForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Rice 50kg bags"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity received"><Input type="number" value={stockForm.qty} onChange={e => setStockForm(f=>({...f,qty:e.target.value}))} min="0"/></Field>
            <Field label="Unit"><Input value={stockForm.unit} onChange={e => setStockForm(f=>({...f,unit:e.target.value}))} placeholder="bags, litres, units"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date received"><Input type="date" value={stockForm.date} onChange={e => setStockForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label="Donor / Source"><Input value={stockForm.donor} onChange={e => setStockForm(f=>({...f,donor:e.target.value}))} placeholder="WFP, UNICEF, church…"/></Field>
          </div>
        </div>
      </Modal>

      {/* Log distribution modal */}
      <Modal open={openModal === 'dist'} onClose={() => setOpenModal(null)} title="Log distribution event"
        footer={<><Button variant="secondary" onClick={() => setOpenModal(null)}>Cancel</Button><Button variant="primary" onClick={logDist} disabled={saving}>{saving?'Saving…':'Log distribution'}</Button></>}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date"><Input type="date" value={distForm.date} onChange={e => setDistForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label="Location"><Input value={distForm.location} onChange={e => setDistForm(f=>({...f,location:e.target.value}))} placeholder="Mamfe Camp A"/></Field>
          </div>
          <Field label="Item">
            <Select value={distForm.item_id} onChange={e => setDistForm(f=>({...f,item_id:e.target.value}))}>
              <option value="">— Select item —</option>
              {items.map(i => (
                <option key={i.id} value={i.id}>
                  {i.name} (balance: {(i.quantity_received - i.quantity_distributed).toLocaleString()} {i.unit})
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity out"><Input type="number" value={distForm.qty} onChange={e => setDistForm(f=>({...f,qty:e.target.value}))} min="0"/></Field>
            <Field label="Beneficiaries served"><Input type="number" value={distForm.bene} onChange={e => setDistForm(f=>({...f,bene:e.target.value}))} min="0"/></Field>
          </div>
          <Field label="Notes"><Input value={distForm.notes} onChange={e => setDistForm(f=>({...f,notes:e.target.value}))} placeholder="Optional"/></Field>
        </div>
      </Modal>
    </div>
  )
}
