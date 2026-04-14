'use client'

import { createContext, useContext, useState, ReactNode } from 'react'

type Lang = 'en' | 'fr'

const T = {
  en: {
    // Nav
    dashboard: 'Dashboard', projects: 'Projects', participants: 'Participants',
    hr: 'HR & Staff', donors: 'Donors & Funders', attendance: 'Attendance',
    supply: 'Supply & Distribution', kpis: 'KPIs & M&E', finance: 'Finance',
    schedule: 'Schedule', reports: 'Reports', workspace: 'Workspace',
    people: 'People', operations: 'Operations', planning: 'Planning',
    // Auth
    signIn: 'Sign in', signOut: 'Sign out', email: 'Email address',
    password: 'Password', signingIn: 'Signing in…', welcomeBack: 'Welcome back',
    signInSub: 'Sign in to IMPACTOS — AFRILEAD Program Management',
    noAccount: "Don't have an account?", contactAdmin: 'Contact your administrator.',
    // Dashboard
    programDashboard: 'Program Dashboard', selectProject: 'Select a project',
    selectProjectSub: 'Choose a project from the selector above to view your dashboard',
    viewProjects: 'View projects',
    participants_: 'Participants', avgAttendance: 'Avg attendance', staff: 'Staff',
    enrolled: 'enrolled', target: 'target', sessions: 'sessions',
    financialOverview: 'Financial overview', financeOnly: 'visible to owner & finance only',
    totalIncome: 'Total income', totalExpenses: 'Total expenses',
    netBalance: 'Net balance', budgetUsed: 'Budget used',
    kpiProgress: 'KPI progress', viewAll: 'View all →',
    upcomingMilestones: 'Upcoming milestones', reportsCalendar: 'Reports calendar',
    enrollment: 'Enrollment', attendanceRate: 'Attendance rate',
    femaleEnrollment: 'Female enrollment',
    // Common
    add: 'Add', save: 'Save', cancel: 'Cancel', delete: 'Delete',
    saving: 'Saving…', loading: 'Loading…', noData: 'No records yet',
    actions: 'Actions', status: 'Status', date: 'Date', name: 'Name',
    notes: 'Notes', amount: 'Amount (USD)', reference: 'Reference',
    // Projects
    newProject: 'New project', createProject: 'Create project',
    allProjects: 'All projects', allPrograms: 'All programs across AFRILEAD',
    projectName: 'Project name', projectType: 'Project type',
    description: 'Description', startDate: 'Start date', endDate: 'End date',
    budget: 'Total budget (USD)', participantTarget: 'Participant target',
    budgetCategories: 'Budget categories', projectColour: 'Project colour',
    // Participants
    addParticipant: 'Add participant', firstName: 'First name', lastName: 'Last name',
    age: 'Age', gender: 'Gender', groupLocation: 'Group / Location',
    baselineLevel: 'Baseline level', namedRoster: 'Named roster', bulkCount: 'Bulk count',
    totalBeneficiaries: 'Total beneficiaries reached', logEntry: 'Log entry',
    // Finance
    logIncome: 'Log income', logExpense: 'Log expense',
    source: 'Source / Donor', type: 'Type', overview: 'Overview',
    income: 'Income', expenses: 'Expenses', budgetVsActuals: 'Budget',
    financeRestricted: 'Finance — restricted access',
    financeRestrictedSub: 'Switch to Owner or Finance Officer role to access this module.',
    // HR
    addStaff: 'Add staff', roleTitle: 'Role title', staffType: 'Staff type',
    salaryPerMonth: 'Salary / mo (USD)', contractEnd: 'Contract end',
    roster: 'Roster', staffAttendance: 'Staff attendance', payroll: 'Payroll',
    leave: 'Leave', signInSheet: 'Staff sign-in sheet', saveSignIn: 'Save sign-in',
    logPayment: 'Log payment', leaveRequest: 'Leave request',
    present: 'Present', absent: 'Absent', notMarked: 'Not marked',
    // Attendance
    markAttendance: 'Mark attendance — tap each participant',
    saveSession: 'Save session', sessionLog: 'Session log', sessionDate: 'Session date',
    // Reports
    addReport: 'Add report', markSubmitted: 'Mark submitted',
    frequency: 'Frequency', dueDate: 'Due date', recipient: 'Recipient',
    overdue: 'overdue',
    // Schedule
    addPhase: 'Add phase', phaseName: 'Phase name', period: 'Period',
    activities: 'Activities (one per line)', milestones: 'Milestones',
    // Supply
    addStock: 'Add stock', logDistribution: 'Log distribution',
    itemName: 'Item name', qtyReceived: 'Quantity received', unit: 'Unit',
    donorSource: 'Donor / Source', inventory: 'Inventory', distributions: 'Distributions',
    stockLevels: 'Stock levels', balance: 'Balance',
    // KPIs
    addKPI: 'Add KPI', targetValue: 'Target value', currentValue: 'Current value',
    noKPIs: 'No KPIs yet', addFirstKPI: 'Add first KPI',
    // Alerts
    attendanceLow: (rate: number) => `Attendance rate (${rate}%) is below the 80% target — review retention measures.`,
    reportsOverdue: (n: number) => `${n} report${n>1?'s are':' is'} past due — check the Reports tab.`,
  },
  fr: {
    // Nav
    dashboard: 'Tableau de bord', projects: 'Projets', participants: 'Participants',
    hr: 'RH & Personnel', donors: 'Bailleurs & Donateurs', attendance: 'Présence',
    supply: 'Approvisionnement', kpis: 'KPIs & S&E', finance: 'Finance',
    schedule: 'Calendrier', reports: 'Rapports', workspace: 'Espace de travail',
    people: 'Personnes', operations: 'Opérations', planning: 'Planification',
    // Auth
    signIn: 'Se connecter', signOut: 'Se déconnecter', email: 'Adresse e-mail',
    password: 'Mot de passe', signingIn: 'Connexion en cours…', welcomeBack: 'Bon retour',
    signInSub: 'Connectez-vous à IMPACTOS — Gestion des programmes AFRILEAD',
    noAccount: 'Pas de compte ?', contactAdmin: "Contactez votre administrateur.",
    // Dashboard
    programDashboard: 'Tableau de bord des programmes', selectProject: 'Sélectionner un projet',
    selectProjectSub: 'Choisissez un projet dans le sélecteur ci-dessus',
    viewProjects: 'Voir les projets',
    participants_: 'Participants', avgAttendance: 'Taux de présence moyen', staff: 'Personnel',
    enrolled: 'inscrits', target: 'objectif', sessions: 'séances',
    financialOverview: 'Vue financière', financeOnly: 'visible au propriétaire et finance uniquement',
    totalIncome: 'Revenus totaux', totalExpenses: 'Dépenses totales',
    netBalance: 'Solde net', budgetUsed: 'Budget utilisé',
    kpiProgress: 'Progrès des KPIs', viewAll: 'Voir tout →',
    upcomingMilestones: 'Jalons à venir', reportsCalendar: 'Calendrier des rapports',
    enrollment: 'Inscription', attendanceRate: 'Taux de présence',
    femaleEnrollment: 'Inscriptions féminines',
    // Common
    add: 'Ajouter', save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer',
    saving: 'Enregistrement…', loading: 'Chargement…', noData: 'Aucun enregistrement',
    actions: 'Actions', status: 'Statut', date: 'Date', name: 'Nom',
    notes: 'Notes', amount: 'Montant (USD)', reference: 'Référence',
    // Projects
    newProject: 'Nouveau projet', createProject: 'Créer le projet',
    allProjects: 'Tous les projets', allPrograms: 'Tous les programmes AFRILEAD',
    projectName: 'Nom du projet', projectType: 'Type de projet',
    description: 'Description', startDate: 'Date de début', endDate: 'Date de fin',
    budget: 'Budget total (USD)', participantTarget: 'Objectif participants',
    budgetCategories: 'Catégories budgétaires', projectColour: 'Couleur du projet',
    // Participants
    addParticipant: 'Ajouter un participant', firstName: 'Prénom', lastName: 'Nom',
    age: 'Âge', gender: 'Genre', groupLocation: 'Groupe / Localisation',
    baselineLevel: 'Niveau de base', namedRoster: 'Liste nominative', bulkCount: 'Comptage groupé',
    totalBeneficiaries: 'Total bénéficiaires atteints', logEntry: 'Enregistrer',
    // Finance
    logIncome: 'Enregistrer un revenu', logExpense: 'Enregistrer une dépense',
    source: 'Source / Bailleur', type: 'Type', overview: 'Vue d\'ensemble',
    income: 'Revenus', expenses: 'Dépenses', budgetVsActuals: 'Budget',
    financeRestricted: 'Finance — accès restreint',
    financeRestrictedSub: 'Passez au rôle Propriétaire ou Responsable financier.',
    // HR
    addStaff: 'Ajouter du personnel', roleTitle: 'Titre du poste', staffType: 'Type',
    salaryPerMonth: 'Salaire / mois (USD)', contractEnd: 'Fin de contrat',
    roster: 'Effectif', staffAttendance: 'Présence du personnel', payroll: 'Paie',
    leave: 'Congés', signInSheet: 'Feuille de présence', saveSignIn: 'Enregistrer la présence',
    logPayment: 'Enregistrer le paiement', leaveRequest: 'Demande de congé',
    present: 'Présent', absent: 'Absent', notMarked: 'Non marqué',
    // Attendance
    markAttendance: 'Marquer la présence — appuyez sur chaque participant',
    saveSession: 'Enregistrer la séance', sessionLog: 'Journal des séances', sessionDate: 'Date de séance',
    // Reports
    addReport: 'Ajouter un rapport', markSubmitted: 'Marquer comme soumis',
    frequency: 'Fréquence', dueDate: 'Date limite', recipient: 'Destinataire',
    overdue: 'en retard',
    // Schedule
    addPhase: 'Ajouter une phase', phaseName: 'Nom de la phase', period: 'Période',
    activities: 'Activités (une par ligne)', milestones: 'Jalons',
    // Supply
    addStock: 'Ajouter du stock', logDistribution: 'Enregistrer une distribution',
    itemName: 'Nom de l\'article', qtyReceived: 'Quantité reçue', unit: 'Unité',
    donorSource: 'Bailleur / Source', inventory: 'Inventaire', distributions: 'Distributions',
    stockLevels: 'Niveaux de stock', balance: 'Solde',
    // KPIs
    addKPI: 'Ajouter un KPI', targetValue: 'Valeur cible', currentValue: 'Valeur actuelle',
    noKPIs: 'Aucun KPI', addFirstKPI: 'Ajouter le premier KPI',
    // Alerts
    attendanceLow: (rate: number) => `Le taux de présence (${rate}%) est en dessous de l'objectif de 80%.`,
    reportsOverdue: (n: number) => `${n} rapport${n>1?'s sont':'  est'} en retard — vérifiez l'onglet Rapports.`,
  }
}

interface LangContextType {
  lang: Lang
  setLang: (l: Lang) => void
  t: typeof T.en
}

const LangContext = createContext<LangContextType | null>(null)

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('impactos_lang') as Lang) || 'en'
    }
    return 'en'
  })

  const setLang = (l: Lang) => {
    setLangState(l)
    if (typeof window !== 'undefined') localStorage.setItem('impactos_lang', l)
  }

  return (
    <LangContext.Provider value={{ lang, setLang, t: T[lang] }}>
      {children}
    </LangContext.Provider>
  )
}

export function useLang() {
  const ctx = useContext(LangContext)
  if (!ctx) throw new Error('useLang must be used within LangProvider')
  return ctx
}
