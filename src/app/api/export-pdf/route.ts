import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../lib/supabase-server'

export async function POST(req: Request) {
  try {
    const { projectId, lang = 'en' } = await req.json()
    const supabase = await createServerSupabaseClient()

    // Fetch all data for the report
    const [
      { data: project },
      { data: participants },
      { data: kpis },
      { data: milestones },
      { data: income },
      { data: expenses },
      { data: reports },
      { data: org },
    ] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('participants').select('*').eq('project_id', projectId),
      supabase.from('kpis').select('*').eq('project_id', projectId),
      supabase.from('milestones').select('*').eq('project_id', projectId).order('due_date'),
      supabase.from('income').select('*').eq('project_id', projectId),
      supabase.from('expenses').select('*').eq('project_id', projectId),
      supabase.from('reports').select('*').eq('project_id', projectId).order('due_date'),
      supabase.from('organisations').select('*').single(),
    ])

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

    const totalIncome = (income || []).reduce((s: number, i: Record<string, number>) => s + (i.amount || 0), 0)
    const totalExpenses = (expenses || []).reduce((s: number, e: Record<string, number>) => s + (e.amount || 0), 0)
    const netBalance = totalIncome - totalExpenses
    const budgetPct = project.budget ? Math.round((totalExpenses / project.budget) * 100) : 0
    const participantCount = (participants || []).length
    const completedMilestones = (milestones || []).filter((m: Record<string, unknown>) => m.completed).length
    const overdueReports = (reports || []).filter((r: Record<string, unknown>) => !r.submitted && r.due_date && new Date(r.due_date as string) < new Date()).length

    const isEn = lang === 'en'
    const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString(isEn ? 'en-US' : 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'
    const fmtAmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    const today = new Date().toLocaleDateString(isEn ? 'en-US' : 'fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })

    const L = {
      en: {
        title: 'Program Impact Report', generatedOn: 'Generated on', preparedBy: 'Prepared by',
        overview: 'Program Overview', financial: 'Financial Summary', kpiSection: 'Key Performance Indicators',
        milestoneSection: 'Milestones', reportsSection: 'Reporting Status',
        participants: 'Participants', budget: 'Total budget', income: 'Total income',
        expenditure: 'Total expenditure', balance: 'Net balance', budgetUsed: 'Budget used',
        target: 'Target', current: 'Current', progress: 'Progress',
        completed: 'Completed', pending: 'Pending', overdue: 'Overdue',
        submitted: 'Submitted', due: 'Due', notSubmitted: 'Not submitted',
        status: 'Status', amount: 'Amount', startDate: 'Start date', endDate: 'End date',
        milestonesCompleted: 'Milestones completed', overdueReports: 'Overdue reports',
        confidential: 'CONFIDENTIAL — For authorised recipients only',
      },
      fr: {
        title: 'Rapport d\'impact du programme', generatedOn: 'Généré le', preparedBy: 'Préparé par',
        overview: 'Vue d\'ensemble', financial: 'Résumé financier', kpiSection: 'Indicateurs clés de performance',
        milestoneSection: 'Jalons', reportsSection: 'État des rapports',
        participants: 'Participants', budget: 'Budget total', income: 'Revenus totaux',
        expenditure: 'Dépenses totales', balance: 'Solde net', budgetUsed: 'Budget utilisé',
        target: 'Objectif', current: 'Actuel', progress: 'Progrès',
        completed: 'Complété', pending: 'En attente', overdue: 'En retard',
        submitted: 'Soumis', due: 'Échéance', notSubmitted: 'Non soumis',
        status: 'Statut', amount: 'Montant', startDate: 'Date de début', endDate: 'Date de fin',
        milestonesCompleted: 'Jalons complétés', overdueReports: 'Rapports en retard',
        confidential: 'CONFIDENTIEL — Pour les destinataires autorisés uniquement',
      }
    }[lang as 'en'|'fr']

    const accentColor = project.color || '#4338CA'

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif; color: #0A0A0A; font-size: 13px; line-height: 1.5; background: #fff; }
  .page { max-width: 794px; margin: 0 auto; padding: 48px 56px; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; padding-bottom: 24px; border-bottom: 2px solid ${accentColor}; }
  .logo { display: flex; align-items: center; gap: 10px; }
  .logo-box { width: 32px; height: 32px; background: #0A0A0A; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
  .logo-dot { width: 14px; height: 14px; background: #FFBE00; border-radius: 3px; }
  .logo-name { font-size: 16px; font-weight: 800; letter-spacing: -0.4px; }
  .header-meta { text-align: right; font-size: 11px; color: #888; }
  .title { font-size: 26px; font-weight: 800; letter-spacing: -1px; margin-bottom: 4px; }
  .project-name { font-size: 15px; color: #555; margin-bottom: 4px; }
  .org-name { font-size: 12px; color: #aaa; }
  .section { margin-bottom: 32px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: ${accentColor}; margin-bottom: 14px; padding-bottom: 6px; border-bottom: 0.5px solid #E4E7EF; }
  .grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .metric { background: #F9FAFB; border-radius: 10px; padding: 14px; border: 0.5px solid #E4E7EF; }
  .metric-label { font-size: 10px; color: #888; font-weight: 500; margin-bottom: 4px; }
  .metric-value { font-size: 22px; font-weight: 800; letter-spacing: -0.8px; color: #0A0A0A; }
  .metric-sub { font-size: 10px; color: #aaa; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #888; text-align: left; padding: 8px 10px; background: #F9FAFB; border-bottom: 0.5px solid #E4E7EF; }
  td { font-size: 12px; padding: 9px 10px; border-bottom: 0.5px solid #F0F0F0; color: #333; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 10px; font-weight: 600; }
  .badge-green { background: #ECFDF5; color: #059669; }
  .badge-red { background: #FEF2F2; color: #DC2626; }
  .badge-yellow { background: #FFF8E7; color: #D97706; }
  .badge-gray { background: #F4F6FA; color: #888; }
  .progress-bar { height: 6px; background: #F0F0F0; border-radius: 3px; overflow: hidden; margin-top: 4px; }
  .progress-fill { height: 100%; border-radius: 3px; }
  .footer { margin-top: 48px; padding-top: 16px; border-top: 0.5px solid #E4E7EF; display: flex; justify-content: space-between; font-size: 10px; color: #bbb; }
  .confidential { text-align: center; font-size: 10px; color: #ccc; margin-top: 8px; }
  @media print { .page { padding: 32px 40px; } }
</style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div>
      <div class="logo" style="margin-bottom: 16px;">
        <div class="logo-box"><div class="logo-dot"></div></div>
        <span class="logo-name">IMPACTOS</span>
      </div>
      <div class="title">${L.title}</div>
      <div class="project-name">${project.name}</div>
      <div class="org-name">${org?.name || 'AFRILEAD'}</div>
    </div>
    <div class="header-meta">
      <div>${L.generatedOn}</div>
      <div style="font-weight: 600; color: #0A0A0A; margin-top: 2px;">${today}</div>
      <div style="margin-top: 8px;">${L.preparedBy}</div>
      <div style="font-weight: 600; color: #0A0A0A; margin-top: 2px;">app.useimpactos.com</div>
    </div>
  </div>

  <!-- OVERVIEW METRICS -->
  <div class="section">
    <div class="section-title">${L.overview}</div>
    <div class="grid-4">
      <div class="metric">
        <div class="metric-label">${L.participants}</div>
        <div class="metric-value">${participantCount}</div>
        <div class="metric-sub">${project.participant_target ? `of ${project.participant_target} target` : ''}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${L.budgetUsed}</div>
        <div class="metric-value">${budgetPct}%</div>
        <div class="metric-sub">${project.budget ? `of ${fmtAmt(project.budget)}` : ''}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${L.milestonesCompleted}</div>
        <div class="metric-value">${completedMilestones}/${(milestones||[]).length}</div>
        <div class="metric-sub">${L.completed}</div>
      </div>
      <div class="metric">
        <div class="metric-label">${L.overdueReports}</div>
        <div class="metric-value" style="color: ${overdueReports > 0 ? '#DC2626' : '#059669'}">${overdueReports}</div>
        <div class="metric-sub">${L.overdue}</div>
      </div>
    </div>
  </div>

  <!-- FINANCIAL SUMMARY -->
  <div class="section">
    <div class="section-title">${L.financial}</div>
    <div class="grid-4">
      ${project.budget ? `<div class="metric"><div class="metric-label">${L.budget}</div><div class="metric-value" style="font-size: 16px;">${fmtAmt(project.budget)}</div></div>` : ''}
      <div class="metric"><div class="metric-label">${L.income}</div><div class="metric-value" style="font-size: 16px; color: #059669;">${fmtAmt(totalIncome)}</div></div>
      <div class="metric"><div class="metric-label">${L.expenditure}</div><div class="metric-value" style="font-size: 16px; color: #DC2626;">${fmtAmt(totalExpenses)}</div></div>
      <div class="metric"><div class="metric-label">${L.balance}</div><div class="metric-value" style="font-size: 16px; color: ${netBalance >= 0 ? '#059669' : '#DC2626'}">${fmtAmt(netBalance)}</div></div>
    </div>
  </div>

  <!-- KPIs -->
  ${(kpis||[]).length > 0 ? `
  <div class="section">
    <div class="section-title">${L.kpiSection}</div>
    <table>
      <thead><tr><th>KPI</th><th>${L.target}</th><th>${L.current}</th><th>${L.progress}</th></tr></thead>
      <tbody>
        ${(kpis||[]).map((k: Record<string, unknown>) => {
          const pct = k.target_value ? Math.min(100, Math.round(((k.current_value as number)||0) / (k.target_value as number) * 100)) : 0
          return `<tr>
            <td style="font-weight: 600;">${k.name}</td>
            <td>${k.target_value}${k.unit ? ` ${k.unit}` : ''}</td>
            <td>${k.current_value || 0}${k.unit ? ` ${k.unit}` : ''}</td>
            <td style="width: 160px;">
              <div style="display: flex; align-items: center; gap: 8px;">
                <div class="progress-bar" style="flex: 1;"><div class="progress-fill" style="width: ${pct}%; background: ${accentColor};"></div></div>
                <span style="font-size: 11px; font-weight: 700; min-width: 32px;">${pct}%</span>
              </div>
            </td>
          </tr>`
        }).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- MILESTONES -->
  ${(milestones||[]).length > 0 ? `
  <div class="section">
    <div class="section-title">${L.milestoneSection}</div>
    <table>
      <thead><tr><th>${L.milestoneSection}</th><th>${L.due}</th><th>${L.status}</th></tr></thead>
      <tbody>
        ${(milestones||[]).map((m: Record<string, unknown>) => `<tr>
          <td style="font-weight: 500;">${m.title}</td>
          <td>${fmtDate(m.due_date as string)}</td>
          <td><span class="badge ${m.completed ? 'badge-green' : new Date(m.due_date as string) < new Date() ? 'badge-red' : 'badge-yellow'}">${m.completed ? L.completed : new Date(m.due_date as string) < new Date() ? L.overdue : L.pending}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- REPORTS -->
  ${(reports||[]).length > 0 ? `
  <div class="section">
    <div class="section-title">${L.reportsSection}</div>
    <table>
      <thead><tr><th>${L.reportsSection}</th><th>${L.due}</th><th>${L.status}</th></tr></thead>
      <tbody>
        ${(reports||[]).map((r: Record<string, unknown>) => `<tr>
          <td style="font-weight: 500;">${r.title}</td>
          <td>${fmtDate(r.due_date as string)}</td>
          <td><span class="badge ${r.submitted ? 'badge-green' : new Date(r.due_date as string) < new Date() ? 'badge-red' : 'badge-gray'}">${r.submitted ? L.submitted : new Date(r.due_date as string) < new Date() ? L.overdue : L.notSubmitted}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>
  </div>` : ''}

  <!-- FOOTER -->
  <div class="footer">
    <span>IMPACTOS · app.useimpactos.com</span>
    <span>${org?.name || 'AFRILEAD'} · ${project.name}</span>
    <span>${today}</span>
  </div>
  <div class="confidential">${L.confidential}</div>

</div>
</body>
</html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'X-Project-Name': project.name,
      }
    })

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
