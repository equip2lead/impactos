import { NextResponse } from 'next/server'

interface NotificationPayload {
  to: string
  type: 'report_due' | 'milestone' | 'attendance_low' | 'welcome' | 'invite'
  data: Record<string, string | number>
  lang?: 'en' | 'fr'
}

const TEMPLATES = {
  en: {
    report_due: (d: Record<string, string | number>) => ({
      subject: `📋 Report due: ${d.reportName} — IMPACTOS`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px; background: #fff;">
          <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 24px;">
            <div style="width: 28px; height: 28px; background: #0A0A0A; border-radius: 7px; display: flex; align-items: center; justify-content: center;">
              <div style="width: 12px; height: 12px; background: #FFBE00; border-radius: 3px;"></div>
            </div>
            <span style="font-size: 15px; font-weight: 700; letter-spacing: -0.3px;">IMPACTOS</span>
          </div>
          <h1 style="font-size: 20px; font-weight: 800; letter-spacing: -0.5px; margin-bottom: 8px; color: #0A0A0A;">Report due soon</h1>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
            The <strong>${d.reportName}</strong> report for <strong>${d.projectName}</strong> is due on <strong>${d.dueDate}</strong>.
          </p>
          <a href="${d.url}" style="display: inline-block; background: #0A0A0A; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">View report →</a>
          <p style="font-size: 11px; color: #bbb; margin-top: 32px;">IMPACTOS · app.useimpactos.com</p>
        </div>`,
    }),
    milestone: (d: Record<string, string | number>) => ({
      subject: `🎯 Milestone reached: ${d.milestoneName} — IMPACTOS`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 20px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">Milestone completed 🎉</h1>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
            <strong>${d.milestoneName}</strong> has been marked complete for <strong>${d.projectName}</strong>.
          </p>
          <a href="${d.url}" style="display: inline-block; background: #059669; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">View project →</a>
          <p style="font-size: 11px; color: #bbb; margin-top: 32px;">IMPACTOS · app.useimpactos.com</p>
        </div>`,
    }),
    attendance_low: (d: Record<string, string | number>) => ({
      subject: `⚠️ Low attendance alert — ${d.projectName} — IMPACTOS`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 20px; font-weight: 800; color: #DC2626; margin-bottom: 8px;">Attendance alert</h1>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
            Attendance for <strong>${d.projectName}</strong> has dropped to <strong>${d.rate}%</strong>, below the 80% target. Review retention measures.
          </p>
          <a href="${d.url}" style="display: inline-block; background: #DC2626; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">View attendance →</a>
          <p style="font-size: 11px; color: #bbb; margin-top: 32px;">IMPACTOS · app.useimpactos.com</p>
        </div>`,
    }),
    welcome: (d: Record<string, string | number>) => ({
      subject: `Welcome to IMPACTOS — ${d.orgName}`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
          <div style="text-align: center; margin-bottom: 28px;">
            <div style="width: 48px; height: 48px; background: #0A0A0A; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px;">
              <div style="width: 20px; height: 20px; background: #FFBE00; border-radius: 5px;"></div>
            </div>
            <h1 style="font-size: 22px; font-weight: 800; letter-spacing: -0.5px; color: #0A0A0A;">Welcome to IMPACTOS</h1>
          </div>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 16px;">Hi ${d.firstName}, your workspace for <strong>${d.orgName}</strong> is ready.</p>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 24px;">Start by creating your first project and inviting your team.</p>
          <a href="https://app.useimpactos.com/dashboard" style="display: block; text-align: center; background: #0A0A0A; color: #fff; text-decoration: none; padding: 13px 24px; border-radius: 9px; font-size: 14px; font-weight: 700;">Go to dashboard →</a>
          <p style="font-size: 11px; color: #bbb; margin-top: 32px; text-align: center;">IMPACTOS · app.useimpactos.com · Built for African organisations</p>
        </div>`,
    }),
    invite: (d: Record<string, string | number>) => ({
      subject: `You've been invited to ${d.orgName} on IMPACTOS`,
      html: `
        <div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;">
          <h1 style="font-size: 20px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">You've been invited</h1>
          <p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">
            <strong>${d.inviterName}</strong> has invited you to join <strong>${d.orgName}</strong> on IMPACTOS as <strong>${d.role}</strong>.
          </p>
          <a href="${d.url}" style="display: inline-block; background: #4338CA; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">Accept invitation →</a>
          <p style="font-size: 11px; color: #bbb; margin-top: 32px;">IMPACTOS · app.useimpactos.com</p>
        </div>`,
    }),
  },
  fr: {
    report_due: (d: Record<string, string | number>) => ({
      subject: `📋 Rapport à rendre : ${d.reportName} — IMPACTOS`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;"><h1 style="font-size: 20px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">Rapport à rendre</h1><p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">Le rapport <strong>${d.reportName}</strong> pour <strong>${d.projectName}</strong> est dû le <strong>${d.dueDate}</strong>.</p><a href="${d.url}" style="display: inline-block; background: #0A0A0A; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">Voir le rapport →</a></div>`,
    }),
    milestone: (d: Record<string, string | number>) => ({
      subject: `🎯 Jalon atteint : ${d.milestoneName} — IMPACTOS`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;"><h1 style="font-size: 20px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">Jalon complété 🎉</h1><p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;"><strong>${d.milestoneName}</strong> a été marqué comme complété pour <strong>${d.projectName}</strong>.</p><a href="${d.url}" style="display: inline-block; background: #059669; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">Voir le projet →</a></div>`,
    }),
    attendance_low: (d: Record<string, string | number>) => ({
      subject: `⚠️ Alerte présence — ${d.projectName} — IMPACTOS`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;"><h1 style="font-size: 20px; font-weight: 800; color: #DC2626; margin-bottom: 8px;">Alerte présence</h1><p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;">Le taux de présence pour <strong>${d.projectName}</strong> est tombé à <strong>${d.rate}%</strong>, en dessous de l'objectif de 80%.</p><a href="${d.url}" style="display: inline-block; background: #DC2626; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">Voir la présence →</a></div>`,
    }),
    welcome: (d: Record<string, string | number>) => ({
      subject: `Bienvenue sur IMPACTOS — ${d.orgName}`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;"><h1 style="font-size: 22px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">Bienvenue sur IMPACTOS</h1><p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 16px;">Bonjour ${d.firstName}, votre espace pour <strong>${d.orgName}</strong> est prêt.</p><a href="https://app.useimpactos.com/dashboard" style="display: block; text-align: center; background: #0A0A0A; color: #fff; text-decoration: none; padding: 13px 24px; border-radius: 9px; font-size: 14px; font-weight: 700;">Accéder au tableau de bord →</a></div>`,
    }),
    invite: (d: Record<string, string | number>) => ({
      subject: `Vous avez été invité(e) à rejoindre ${d.orgName} sur IMPACTOS`,
      html: `<div style="font-family: -apple-system, sans-serif; max-width: 520px; margin: 0 auto; padding: 32px 24px;"><h1 style="font-size: 20px; font-weight: 800; color: #0A0A0A; margin-bottom: 8px;">Invitation reçue</h1><p style="font-size: 14px; color: #555; line-height: 1.6; margin-bottom: 20px;"><strong>${d.inviterName}</strong> vous a invité(e) à rejoindre <strong>${d.orgName}</strong> en tant que <strong>${d.role}</strong>.</p><a href="${d.url}" style="display: inline-block; background: #4338CA; color: #fff; text-decoration: none; padding: 11px 20px; border-radius: 8px; font-size: 13px; font-weight: 700;">Accepter l'invitation →</a></div>`,
    }),
  }
}

export async function POST(req: Request) {
  try {
    const body: NotificationPayload = await req.json()
    const { to, type, data, lang = 'en' } = body

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      // Log only — don't fail silently in production
      console.log('RESEND_API_KEY not set — email not sent:', { to, type })
      return NextResponse.json({ ok: true, sent: false, reason: 'no_api_key' })
    }

    const templates = TEMPLATES[lang] || TEMPLATES.en
    const template = templates[type]
    if (!template) return NextResponse.json({ error: 'Unknown template' }, { status: 400 })

    const { subject, html } = template(data)

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'IMPACTOS <notifications@useimpactos.com>',
        to: [to],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: err }, { status: 500 })
    }

    return NextResponse.json({ ok: true, sent: true })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
