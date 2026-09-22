'use client'
import { useEffect, useState } from 'react'
import { useApp } from '@/hooks/useApp'
import { useLang } from '@/context/LangContext'
import { withTimeout } from '@/lib/withTimeout'
import { createClient } from '../../../../lib/supabase'
import { Button, Modal, Field, Input, Select, Table, TR, TD, Tabs, Card, ProgressBar, Alert } from '@/components/ui'
import { Plus } from 'lucide-react'
import type { InventoryItem, DistributionEvent } from '@/types'

export default function SupplyPage() {
  const { activeProject, isAdmin } = useApp()
  const { t } = useLang()
  const supabase = createClient()
  const [tab, setTab] = useState('Inventory')
  // Minimal error slot: these screens had no way to report a failed or
  // stalled write, so a hang left the button spinning with no explanation.
  const [opError, setOpError] = useState<string | null>(null)
  const [items, setItems] = useState<InventoryItem[]>([])
  const [dists, setDists] = useState<(DistributionEvent & { inventory_items?: InventoryItem })[]>([])
  const [openModal, setOpenModal] = useState<'stock'|'dist'|null>(null)
  const [saving, setSaving] = useState(false)

  const [stockForm, setStockForm] = useState({ name:'', qty:'', unit:'units', date: new Date().toISOString().slice(0,10), donor:'' })
  const [distForm, setDistForm] = useState({ date: new Date().toISOString().slice(0,10), location:'', item_id:'', qty:'', bene:'', notes:'' })

  // Bumped by mutations to re-run the fetch below. The effect owns the query so
  // a project switch mid-flight cannot land stale rows.
  const [reloadKey, setReloadKey] = useState(0)
  const load = () => setReloadKey(k => k + 1)

  useEffect(() => {
    if (!activeProject) return
    let cancelled = false
    ;(async () => {
      const [invR, distR] = await Promise.all([
        supabase.from('inventory_items').select('*').eq('project_id', activeProject.id).order('created_at', { ascending: false }),
        supabase.from('distribution_events').select('*, inventory_items(name,unit)').eq('project_id', activeProject.id).order('event_date', { ascending: false }),
      ])
      if (cancelled) return
      setItems((invR.data ?? []) as InventoryItem[])
      setDists((distR.data ?? []) as (DistributionEvent & { inventory_items?: InventoryItem })[])
    })()
    return () => { cancelled = true }
  }, [activeProject, reloadKey]) // eslint-disable-line

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
    // An alert() blocks the page and says nothing the error slot cannot.
    if (qty > balance) return setOpError(
      t.insufficientStock.replace('{balance}', String(balance)).replace('{unit}', item.unit ?? '')
    )
    setSaving(true); setOpError(null)
    const raced = await withTimeout(Promise.all([
      supabase.from('inventory_items').update({ quantity_distributed: item.quantity_distributed + qty }).eq('id', item.id),
      supabase.from('distribution_events').insert({
        project_id: activeProject.id, event_date: distForm.date, location: distForm.location || null,
        item_id: distForm.item_id, quantity_out: qty,
        beneficiaries: parseInt(distForm.bene) || null, notes: distForm.notes || null
      })
    ]))
    if (raced.timedOut) {
      setSaving(false)
      return setOpError(t.procErrors.timeout)
    }
    setDistForm({ date: new Date().toISOString().slice(0,10), location:'', item_id:'', qty:'', bene:'', notes:'' })
    setOpenModal(null); setSaving(false); load()
  }

  if (!activeProject) return <div className="text-gray-400 text-sm p-4">{t.selectProjectFirst}</div>

  const totalDist = dists.reduce((a, d) => a + (d.quantity_out ?? 0), 0)
  const totalBene = dists.reduce((a, d) => a + (d.beneficiaries ?? 0), 0)

  return (
    <div>
      <div className="text-xs text-gray-400 mb-1">{t.projects} › {activeProject.name} › {t.supplyDistribution}</div>
      <div className="flex items-end justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">{t.supplyDistribution}</h1>
          <div className="text-xs text-gray-400">{items.length} {t.itemTypes} · {totalDist.toLocaleString()} {t.unitsDistributed} · {totalBene.toLocaleString()} {t.beneficiaries}</div>
        </div>
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => setOpenModal('stock')}><Plus size={13}/>{t.addStock}</Button>
            <Button variant="primary" size="sm" onClick={() => setOpenModal('dist')}
              disabled={items.length === 0}><Plus size={13}/>{t.logDistribution}</Button>
          </div>
        )}
      </div>

      <Tabs
        tabs={[{ key: 'Inventory', label: t.inventory }, { key: 'Distributions', label: t.distributions }]}
        active={tab} onChange={setTab} />

      {tab === 'Inventory' && (
        <div className="space-y-4">
          {/* Stock levels visual */}
          {items.length > 0 && (
            <Card>
              <div className="text-sm font-semibold text-gray-900 mb-3">{t.stockLevels}</div>
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
                          {t.balance}: {balance.toLocaleString()} {item.unit}
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
          <Table headers={[t.item, t.unit, t.qtyReceived, t.distributions, t.balance, t.donorSource]} empty={items.length === 0}>
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
        <Table headers={[t.date, t.location, t.item, t.qtyOut, t.beneficiaries, t.notes]} empty={dists.length === 0}>
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
      <Modal open={openModal === 'stock'} onClose={() => setOpenModal(null)} title={t.addStockReceipt}
        footer={<><Button variant="secondary" onClick={() => setOpenModal(null)}>{t.cancel}</Button><Button variant="primary" onClick={addStock} disabled={saving}>{saving ? t.saving : t.addStock}</Button></>}>
        <div className="space-y-3">
          <Alert>{opError}</Alert>
          <Field label={t.itemName}><Input value={stockForm.name} onChange={e => setStockForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Rice 50kg bags"/></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.qtyReceived}><Input type="number" value={stockForm.qty} onChange={e => setStockForm(f=>({...f,qty:e.target.value}))} min="0"/></Field>
            <Field label={t.unit}><Input value={stockForm.unit} onChange={e => setStockForm(f=>({...f,unit:e.target.value}))} placeholder="bags, litres, units"/></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.dateReceived}><Input type="date" value={stockForm.date} onChange={e => setStockForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label={t.donorSource}><Input value={stockForm.donor} onChange={e => setStockForm(f=>({...f,donor:e.target.value}))} placeholder="WFP, UNICEF, church…"/></Field>
          </div>
        </div>
      </Modal>

      {/* Log distribution modal */}
      <Modal open={openModal === 'dist'} onClose={() => setOpenModal(null)} title={t.logDistributionEvent}
        footer={<><Button variant="secondary" onClick={() => setOpenModal(null)}>{t.cancel}</Button><Button variant="primary" onClick={logDist} disabled={saving}>{saving ? t.saving : t.logDistribution}</Button></>}>
        <div className="space-y-3">
          <Alert>{opError}</Alert>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.date}><Input type="date" value={distForm.date} onChange={e => setDistForm(f=>({...f,date:e.target.value}))}/></Field>
            <Field label={t.location}><Input value={distForm.location} onChange={e => setDistForm(f=>({...f,location:e.target.value}))} placeholder="Mamfe Camp A"/></Field>
          </div>
          <Field label={t.item}>
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
            <Field label={t.quantityOut}><Input type="number" value={distForm.qty} onChange={e => setDistForm(f=>({...f,qty:e.target.value}))} min="0"/></Field>
            <Field label={t.beneficiariesServed}><Input type="number" value={distForm.bene} onChange={e => setDistForm(f=>({...f,bene:e.target.value}))} min="0"/></Field>
          </div>
          <Field label={t.notes}><Input value={distForm.notes} onChange={e => setDistForm(f=>({...f,notes:e.target.value}))} placeholder={t.optional}/></Field>
        </div>
      </Modal>
    </div>
  )
}
