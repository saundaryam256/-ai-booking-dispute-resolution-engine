import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, AlertTriangle, ArrowDownLeft, ArrowLeft, ArrowRight, BadgeCheck,
  Bell, Building2, CalendarDays, Check, CheckCircle2, ChevronDown,
  ChevronRight, CircleHelp, Clock3, FileCheck2, FilePlus2, FileSearch2, LayoutDashboard,
  ListFilter, LoaderCircle, LogOut, Menu, MessageSquareText, Plus, Search,
  ShieldAlert, ShieldCheck, Sparkles, X,
} from "lucide-react";
import { api } from "./services/api.js";

const OUTCOMES = [
  "Full refund",
  "Partial refund",
  "No refund",
  "Manual investigation / insufficient evidence",
];

const NAV_ITEMS = [
  { id: "dashboard", label: "Overview", icon: LayoutDashboard },
  { id: "cases", label: "Disputes", icon: FileSearch2 },
  { id: "create", label: "New dispute", icon: FilePlus2 },
];

function formatMoney(value, currency = "INR") {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency }).format(value);
}

function formatDate(value) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function statusLabel(status) {
  return ({
    pending_review: "Pending review",
    investigated: "Investigated",
    manual_review: "Manual review",
    approved: "Approved",
    modified: "Decision modified",
    rejected: "Rejected",
  })[status] || status;
}

function Badge({ children, tone = "neutral" }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><div className="empty-icon"><FileSearch2 size={22} /></div><h3>{title}</h3><p>{description}</p></div>;
}

function App() {
  const [page, setPage] = useState("dashboard");
  const [caseId, setCaseId] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [stats, setStats] = useState(null);
  const [policies, setPolicies] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [investigating, setInvestigating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileNav, setMobileNav] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).toUpperCase();

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rows, dashboardStats, policyRows, mode] = await Promise.all([
        api.disputes(query, statusFilter),
        api.stats(),
        api.policies(),
        api.health(),
      ]);
      setDisputes(rows);
      setStats(dashboardStats);
      setPolicies(policyRows);
      setHealth(mode);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [query, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const openCase = async (id) => {
    setPage("detail");
    setCaseId(id);
    setDetail(null);
    setError("");
    setDetailLoading(true);
    try {
      setDetail(await api.detail(id));
    } catch (err) {
      setError(err.message);
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshCase = async () => {
    if (!caseId) return;
    const next = await api.detail(caseId);
    setDetail(next);
    await loadData();
  };

  const showNotice = (message) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 4200);
  };

  const navigate = (destination) => {
    setPage(destination);
    setCaseId(null);
    setDetail(null);
    setError("");
    setMobileNav(false);
  };

  const onCreated = (created) => {
    loadData();
    showNotice(`Dispute ${created.case_id} created successfully.`);
    openCase(created.case_id);
  };

  const statsCards = [
    { label: "Total disputes", value: stats?.total_disputes ?? "—", note: "All cases in workspace", icon: FileSearch2, tone: "blue" },
    { label: "Pending review", value: stats?.pending_reviews ?? "—", note: "Awaiting investigation", icon: Clock3, tone: "amber" },
    { label: "Approved decisions", value: stats?.approved_decisions ?? "—", note: "Administrator-approved recommendations", icon: BadgeCheck, tone: "green" },
    { label: "Manual investigation", value: stats?.manual_investigations ?? "—", note: "Evidence needs a closer look", icon: ShieldAlert, tone: "violet" },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Activity size={21} strokeWidth={2.5} /></div>
          <div><strong>resolve<span>.</span></strong><small>DISPUTE OPERATIONS</small></div>
          <button className="icon-button mobile-close" onClick={() => setMobileNav(false)} aria-label="Close navigation"><X size={18} /></button>
        </div>
        <div className="workspace-switch">
          <div className="workspace-avatar"><Building2 size={17} /></div>
          <div className="workspace-copy"><strong>Haven Marketplace</strong><span>Admin workspace</span></div>
          <ChevronDown size={15} className="muted-icon" />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`nav-item ${page === id || (id === "cases" && page === "detail") ? "active" : ""}`} onClick={() => navigate(id)}>
              <Icon size={18} /><span>{label}</span>
              {id === "cases" && stats?.pending_reviews > 0 && <span className="nav-count">{stats.pending_reviews}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-icon"><CircleHelp size={17} /></div>
          <div><strong>Need a hand?</strong><span>Review the evidence guide</span></div>
          <ArrowRight size={15} />
        </div>
        <div className="user-profile">
          <div className="user-avatar">AM</div>
          <div className="user-info"><strong>Saundarya</strong><span>Marketplace admin</span></div>
          <button className="icon-button" title="Account menu" onClick={() => showNotice("You are signed in as Saundarya.")}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" onClick={() => setMobileNav(true)} aria-label="Open navigation"><Menu size={20} /></button>
          <div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14} /><strong>{page === "detail" ? "Case investigation" : page === "create" ? "New dispute" : page === "cases" ? "Disputes" : "Overview"}</strong></div>
          <div className="topbar-actions">
            {health && <span className={`mode-pill ${health.mode === "demo" ? "mode-demo" : "mode-live"}`}><span />{health.mode === "demo" ? "DEMO MODE" : "AI PROVIDER"}</span>}
            <button className="icon-button notification-button" aria-label="Notifications" onClick={() => showNotice("You're all caught up.")}><Bell size={18} /><i /></button>
            <div className="topbar-divider" />
            <span className="topbar-date">{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="alert alert-error"><AlertTriangle size={17} /><span>{error}</span><button className="alert-close" onClick={() => setError("")} aria-label="Dismiss error"><X size={16} /></button></div>}
          {notice && <div className="toast"><CheckCircle2 size={17} />{notice}<button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={15} /></button></div>}
          {page === "dashboard" && <Dashboard
            statsCards={statsCards} disputes={disputes} loading={loading} query={query}
            statusFilter={statusFilter} setQuery={setQuery} setStatusFilter={setStatusFilter}
            openCase={openCase} create={() => navigate("create")} navigate={navigate}
            greeting={greeting} dateLabel={dateLabel}
          />}
          {page === "cases" && <CaseList
            disputes={disputes} loading={loading} query={query} statusFilter={statusFilter}
            setQuery={setQuery} setStatusFilter={setStatusFilter} openCase={openCase} create={() => navigate("create")}
          />}
          {page === "create" && <CreateDispute onCreated={onCreated} onCancel={() => navigate("dashboard")} setError={setError} />}
          {page === "detail" && <CaseDetail
            detail={detail} loading={detailLoading} policies={policies} investigating={investigating}
            setInvestigating={setInvestigating} setError={setError} refreshCase={refreshCase}
            onBack={() => navigate("cases")} showNotice={showNotice} saving={saving} setSaving={setSaving}
          />}
        </div>
        <footer className="app-footer"><span>Resolve <span className="footer-dot">·</span> Marketplace Trust &amp; Safety</span><span>AI-assisted decisions, human-owned outcomes</span></footer>
      </main>
    </div>
  );
}

function PageHeading({ eyebrow, title, subtitle, action }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;
}

function Dashboard({ statsCards, disputes, loading, query, statusFilter, setQuery, setStatusFilter, openCase, create, navigate, greeting, dateLabel }) {
  const recent = disputes.slice(0, 5);
  return <>
    <PageHeading eyebrow={dateLabel} title={`${greeting}, Saundarya`} subtitle="Here's what's happening across your dispute queue today."
      action={<button className="button button-primary" onClick={create}><Plus size={17} />New dispute</button>} />
    <div className="stats-grid">
      {statsCards.map(({ label, value, note, icon: Icon, tone }) => <div className="stat-card" key={label}>
        <div className={`stat-icon stat-${tone}`}><Icon size={19} /></div><div className="stat-value">{value}</div><div className="stat-label">{label}</div><div className="stat-note">{note}</div>
      </div>)}
    </div>
    <div className="section-heading"><div><h2>Dispute queue</h2><p>Review and resolve the latest customer cases.</p></div><button className="text-button" onClick={() => navigate("cases")}>View all disputes <ArrowRight size={15} /></button></div>
    <DisputeTable rows={recent} loading={loading} openCase={openCase} compact />
    <div className="dashboard-bottom">
      <div className="info-card policy-info"><div className="info-icon info-blue"><ShieldCheck size={18} /></div><div><strong>Policy-led, evidence-first</strong><p>Recommendations are grounded in marketplace policy. Missing evidence is flagged instead of assumed.</p></div><span className="info-arrow"><ArrowDownLeft size={15} /></span></div>
      <div className="info-card human-info"><div className="info-icon info-purple"><Sparkles size={18} /></div><div><strong>You're always in control</strong><p>AI suggests a path forward. Only an administrator can save a final decision.</p></div><Badge tone="purple">HUMAN REVIEW</Badge></div>
    </div>
  </>;
}

function CaseList({ disputes, loading, query, statusFilter, setQuery, setStatusFilter, openCase, create }) {
  return <>
    <PageHeading eyebrow="CASE MANAGEMENT" title="Disputes" subtitle="Search, filter, and investigate booking disputes." action={<button className="button button-primary" onClick={create}><Plus size={17} />New dispute</button>} />
    <div className="case-toolbar">
      <label className="search-box"><Search size={17} /><input aria-label="Search disputes" placeholder="Search case, booking, or listing..." value={query} onChange={(e) => setQuery(e.target.value)} /><kbd>⌘ K</kbd></label>
      <label className="filter-control"><ListFilter size={16} /><select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}><option value="">All statuses</option><option value="pending_review">Pending review</option><option value="investigated">Investigated</option><option value="manual_review">Manual review</option><option value="approved">Approved</option><option value="modified">Decision modified</option></select></label>
      <span className="result-count">{disputes.length} cases</span>
    </div>
    <DisputeTable rows={disputes} loading={loading} openCase={openCase} />
  </>;
}

function DisputeTable({ rows, loading, openCase, compact = false }) {
  return <div className="table-card"><div className="table-scroll"><table>
    <thead><tr><th>CASE</th><th>BOOKING</th><th>ISSUE</th><th>AMOUNT</th><th>CREATED</th><th>STATUS</th><th><span className="sr-only">Open case</span></th></tr></thead>
    <tbody>{loading ? <tr><td colSpan="7"><div className="table-loading"><LoaderCircle size={20} className="spin" />Loading disputes...</div></td></tr>
      : rows.length ? rows.map((row) => <tr key={row.case_id} onClick={() => openCase(row.case_id)} className="clickable-row">
        <td><div className="case-cell"><span className="case-symbol"><FileSearch2 size={15} /></span><div><strong>{row.case_id}</strong><span>{row.listing_name}</span></div></div></td>
        <td><span className="booking-id">{row.booking_id}</span></td>
        <td><Badge tone={row.issue_category ? "blue" : "neutral"}>{(row.issue_category || "Unclassified").replaceAll("_", " ")}</Badge></td>
        <td className="amount-cell">{formatMoney(row.booking_amount, row.currency)}</td>
        <td className="date-cell">{formatDate(row.created_at)}</td>
        <td><Badge tone={row.status === "approved" ? "green" : row.status === "manual_review" ? "violet" : row.status === "pending_review" ? "amber" : "blue"}>{statusLabel(row.status)}</Badge></td>
        <td><button className="row-action" aria-label={`Open ${row.case_id}`} onClick={(event) => { event.stopPropagation(); openCase(row.case_id); }}><ChevronRight size={17} /></button></td>
      </tr>) : <tr><td colSpan="7"><EmptyState title="No disputes found" description="Try adjusting your search or status filter." /></td></tr>}
    </tbody>
  </table></div>
  {!compact && rows.length > 0 && <div className="table-foot"><span>Showing <strong>{rows.length}</strong> dispute{rows.length === 1 ? "" : "s"}</span><span>Updated just now</span></div>}
  </div>;
}

const EMPTY_FORM = {
  booking_id: "", booking_amount: "", listing_name: "",
  advertised_amenities: "", customer_complaint: "", owner_statement: "",
  booking_details: "", cancellation_details: "", evidence_references: "",
};

function CreateDispute({ onCreated, onCancel, setError }) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const update = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setFormError("");
    setError("");
    setSubmitting(true);
    const payload = {
      ...form,
      booking_amount: Number(form.booking_amount),
      currency: "INR",
      advertised_amenities: form.advertised_amenities.split("\n").map((item) => item.trim()).filter(Boolean),
      evidence_references: form.evidence_references.split("\n").map((item) => item.trim()).filter(Boolean),
    };
    try {
      const created = await api.create(payload);
      onCreated(created);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return <>
    <PageHeading eyebrow="CASE INTAKE" title="Create a dispute" subtitle="Add booking context and both parties' statements. Evidence references are not assumed to be verified." />
    <form className="form-card" onSubmit={submit}>
      {formError && <div className="alert alert-error form-alert"><AlertTriangle size={17} />{formError}</div>}
      <div className="form-section-heading"><span className="section-number">01</span><div><h2>Booking details</h2><p>Identify the reservation and what was advertised.</p></div></div>
      <div className="form-grid form-grid-three">
        <Field label="Booking ID" required><input required minLength="2" maxLength="100" value={form.booking_id} onChange={update("booking_id")} placeholder="e.g. BK-20942" /></Field>
        <Field label="Booking amount (INR)" required><div className="amount-input"><span className="currency-prefix">₹ INR</span><input required type="number" min="0.01" step="0.01" value={form.booking_amount} onChange={update("booking_amount")} placeholder="0.00" /></div></Field>
        <Field label="Listing or space name" required><input required minLength="2" value={form.listing_name} onChange={update("listing_name")} placeholder="e.g. Beacon Meeting Room" /></Field>
      </div>
      <div className="form-grid form-grid-two">
        <Field label="Advertised amenities" hint="One amenity per line"><textarea rows="3" value={form.advertised_amenities} onChange={update("advertised_amenities")} placeholder={"Projector\nVideo conferencing"} /></Field>
        <Field label="Booking details" required hint="Date, time, duration, and reservation context"><textarea required minLength="2" rows="3" value={form.booking_details} onChange={update("booking_details")} placeholder="Room booked for 2 hours on..." /></Field>
      </div>
      <div className="form-section-heading section-spaced"><span className="section-number">02</span><div><h2>Statements &amp; evidence</h2><p>Record claims as provided; do not treat either party's statement as verified.</p></div></div>
      <div className="form-grid form-grid-two">
        <Field label="Customer complaint" required><textarea required minLength="8" maxLength="5000" rows="4" value={form.customer_complaint} onChange={update("customer_complaint")} placeholder="What happened from the customer's perspective?" /></Field>
        <Field label="Owner statement" required><textarea required minLength="2" maxLength="5000" rows="4" value={form.owner_statement} onChange={update("owner_statement")} placeholder="What does the owner say happened?" /></Field>
        <Field label="Cancellation details" hint="Optional"><textarea rows="3" value={form.cancellation_details} onChange={update("cancellation_details")} placeholder="Cancellation timestamp, terms shown..." /></Field>
        <Field label="Evidence references" hint="One reference per line. No files uploaded."><textarea rows="3" value={form.evidence_references} onChange={update("evidence_references")} placeholder={"Booking confirmation\nCustomer screenshot reference"} /></Field>
      </div>
      <div className="form-actions"><button type="button" className="button button-secondary" onClick={onCancel}>Cancel</button><button className="button button-primary" disabled={submitting}>{submitting ? <><LoaderCircle size={16} className="spin" />Saving...</> : <><Plus size={16} />Create dispute</>}</button></div>
    </form>
  </>;
}

function Field({ label, required, hint, children }) {
  return <label className="form-field"><span className="field-label">{label}{required && <i> *</i>}</span>{children}{hint && <small className="field-hint">{hint}</small>}</label>;
}

function CaseDetail({ detail, loading, policies, investigating, setInvestigating, setError, refreshCase, onBack, showNotice, saving, setSaving }) {
  const [outcome, setOutcome] = useState("");
  const [reason, setReason] = useState("");
  const [reviewer, setReviewer] = useState("Saundarya");
  const [decisionError, setDecisionError] = useState("");
  const investigation = detail?.investigation;

  useEffect(() => {
    if (investigation) {
      setOutcome(investigation.recommended_outcome);
      setReason("");
    }
  }, [investigation?.created_at, investigation?.recommended_outcome]);

  const policyMap = useMemo(() => Object.fromEntries(policies.map((policy) => [policy.id, policy])), [policies]);

  const runInvestigation = async () => {
    setError("");
    setInvestigating(true);
    try {
      await api.investigate(detail.case_id);
      await refreshCase();
      showNotice("Investigation saved. Review the evidence and policy before deciding.");
    } catch (err) {
      setError(err.message);
    } finally {
      setInvestigating(false);
    }
  };

  const saveDecision = async (forcedOutcome, forcedReason) => {
    const selected = forcedOutcome || outcome || investigation?.recommended_outcome;
    const decisionReason = forcedReason ?? reason;
    if (decisionReason.trim().length < 5) {
      setDecisionError("Enter a decision reason of at least 5 characters.");
      return;
    }
    setDecisionError("");
    setSaving(true);
    try {
      await api.decide(detail.case_id, { outcome: selected, reason: decisionReason.trim(), reviewer: reviewer.trim() || "Admin" });
      await refreshCase();
      showNotice("Final administrator decision saved.");
    } catch (err) {
      setDecisionError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const rejectRecommendation = () => {
    const alternative = investigation?.recommended_outcome === "No refund" ? "Manual investigation / insufficient evidence" : "No refund";
    setOutcome(alternative);
    setReason(`I reject the AI recommendation. ${alternative} is appropriate because `);
  };

  if (loading || !detail) return <div className="detail-loading"><LoaderCircle size={24} className="spin" />Loading case investigation...</div>;
  const tone = detail.status === "approved" ? "green" : detail.status === "manual_review" ? "violet" : detail.status === "pending_review" ? "amber" : "blue";

  return <>
    <button className="back-link" onClick={onBack}><ArrowLeft size={16} />Back to disputes</button>
    <div className="detail-header">
      <div><div className="case-id-line"><span className="case-symbol large"><FileSearch2 size={17} /></span><span>{detail.case_id}</span><Badge tone={tone}>{statusLabel(detail.status)}</Badge></div>
        <h1>{detail.listing_name}</h1><p>Booking {detail.booking_id} <span>·</span> Created {formatDate(detail.created_at)}</p>
      </div>
      <div className="detail-heading-actions"><div className="amount-summary"><span>BOOKING AMOUNT</span><strong>{formatMoney(detail.booking_amount, detail.currency)}</strong></div>
        <button className="button button-primary" onClick={runInvestigation} disabled={investigating}>{investigating ? <><LoaderCircle size={16} className="spin" />Investigating...</> : <><Sparkles size={16} />{investigation ? "Run again" : "Investigate with AI"}</>}</button>
      </div>
    </div>

    {investigation && <div className={`provider-banner ${investigation.provider === "demo" ? "provider-demo" : "provider-llm"}`}>
      <div className="provider-icon"><Sparkles size={17} /></div>
      <div><strong>{investigation.provider === "demo" ? "DEMO MODE · Deterministic rules" : "AI-assisted investigation"}</strong><span>{investigation.provider === "demo" ? "No API key configured. This is a rule-based demo, not an LLM-generated result." : "LLM-generated structured response validated against the case and policy set."}</span></div>
      <Badge tone={investigation.requires_human_review ? "violet" : "green"}>{investigation.requires_human_review ? "HUMAN REVIEW REQUIRED" : "REVIEW BEFORE DECISION"}</Badge>
    </div>}

    <div className="detail-layout">
      <div className="detail-main-column">
        <section className="detail-card">
          <div className="card-heading"><div><span className="card-overline">CASE FILE</span><h2>Booking &amp; statements</h2></div><span className="heading-icon"><CalendarDays size={18} /></span></div>
          <div className="fact-grid">
            <div className="fact-item"><span>Booking details <Badge tone="blue">CASE RECORD</Badge></span><p>{detail.booking_details}</p></div>
            <div className="fact-item"><span>Advertised amenities <Badge tone="blue">SUBMITTED LISTING</Badge></span><p>{detail.advertised_amenities.length ? detail.advertised_amenities.join(" · ") : "No amenities recorded."}</p></div>
            {detail.cancellation_details && <div className="fact-item"><span>Cancellation details <Badge tone="blue">CASE RECORD</Badge></span><p>{detail.cancellation_details}</p></div>}
          </div>
          <div className="statement-grid">
            <div className="statement-box customer-statement"><div className="statement-title"><MessageSquareText size={15} />Customer complaint <Badge tone="amber">ALLEGATION</Badge></div><p>{detail.customer_complaint}</p></div>
            <div className="statement-box owner-statement"><div className="statement-title"><Building2 size={15} />Owner response <Badge tone="amber">ALLEGATION</Badge></div><p>{detail.owner_statement}</p></div>
          </div>
        </section>

        <section className="detail-card">
          <div className="card-heading"><div><span className="card-overline">EVIDENCE REVIEW</span><h2>Available evidence</h2></div><span className="heading-icon"><FileCheck2 size={18} /></span></div>
          {detail.evidence_references.length ? <div className="evidence-list">{detail.evidence_references.map((item, index) => <div className="evidence-row" key={`${item}-${index}`}><span className="evidence-dot"><FileCheck2 size={14} /></span><span>{item}</span><Badge tone="amber">REFERENCE ONLY</Badge></div>)}</div> : <div className="inline-empty"><CircleHelp size={17} />No evidence references were supplied with this case.</div>}
          {investigation && <InvestigationBlock investigation={investigation} policyMap={policyMap} />}
        </section>
      </div>

      <aside className="detail-side-column">
        <section className={`recommendation-card ${investigation ? "" : "recommendation-placeholder"}`}>
          <div className="recommendation-top"><span><Sparkles size={16} /> AI RECOMMENDATION</span>{investigation && <Badge tone="blue">{Math.round(investigation.confidence * 100)}% CONFIDENCE</Badge>}</div>
          {investigation ? <>
            <div className="recommendation-outcome">{investigation.recommended_outcome}</div>
            <p className="recommendation-reason">{investigation.reasoning_summary}</p>
            <div className="recommendation-meta"><span>Issue category</span><Badge tone="blue">{investigation.issue_category.replaceAll("_", " ")}</Badge></div>
            <div className="recommendation-meta"><span>Evidence gaps</span><strong>{investigation.evidence_gaps.length}</strong></div>
            <div className="recommendation-actions"><button className="button button-success" disabled={saving} onClick={() => { const approvalReason = "I approve the AI recommendation after reviewing the case evidence and policy."; setOutcome(investigation.recommended_outcome); setReason(approvalReason); saveDecision(investigation.recommended_outcome, approvalReason); }}><Check size={16} />Approve recommendation</button>
              <button className="button button-outline" disabled={saving} onClick={rejectRecommendation}><X size={16} />Reject recommendation</button></div>
          </> : <div className="no-investigation"><div className="no-investigation-icon"><Sparkles size={20} /></div><strong>Investigation not run yet</strong><p>Run the evidence review to see relevant policy, missing information, and a recommendation.</p></div>}
        </section>

        {investigation && <section className="detail-card decision-card">
          <div className="card-heading compact-heading"><div><span className="card-overline">ADMINISTRATOR REVIEW</span><h2>Final decision</h2></div><span className="heading-icon green-icon"><ShieldCheck size={18} /></span></div>
          <div className="human-ownership"><ShieldCheck size={15} />The final decision is yours. AI recommendations are not financial decisions.</div>
          <Field label="Decision outcome" required><select value={outcome || investigation.recommended_outcome} onChange={(event) => setOutcome(event.target.value)}>{OUTCOMES.map((item) => <option key={item}>{item}</option>)}</select></Field>
          <Field label="Decision reason" required hint="At least 5 characters"><textarea rows="4" maxLength="3000" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain the evidence and policy basis for your decision..." /></Field>
          <Field label="Reviewer"><input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></Field>
          {decisionError && <div className="decision-error"><AlertTriangle size={14} />{decisionError}</div>}
          <button className="button button-primary decision-save" onClick={() => saveDecision()} disabled={saving}>{saving ? <><LoaderCircle size={15} className="spin" />Saving...</> : <><Check size={16} />Save final decision</>}</button>
          {detail.decisions?.length > 0 && <div className="decision-history"><div className="history-title">DECISION HISTORY</div>{detail.decisions.slice().reverse().map((decision, index) => <div className="decision-entry" key={`${decision.created_at}-${index}`}><div><strong>{decision.outcome}</strong><span>{decision.reason}</span></div><small>{decision.reviewer} · {formatDate(decision.created_at)}</small></div>)}</div>}
        </section>}
        <div className="uncertainty-note"><ShieldAlert size={16} /><span><strong>Uncertainty matters.</strong> Unsupported statements stay labelled as allegations. Missing or conflicting evidence triggers human review.</span></div>
      </aside>
    </div>
  </>;
}

function InvestigationBlock({ investigation, policyMap }) {
  const claimsToReconcile = [
    ...investigation.customer_claims.map((claim) => `Customer alleges: ${claim}`),
    ...investigation.owner_claims.map((claim) => `Owner states: ${claim}`),
  ];
  if (claimsToReconcile.length) {
    claimsToReconcile.push("These remain party statements, not independently verified facts; assess them alongside the evidence gaps and policy.");
  }
  return <div className="investigation-result">
    <div className="result-title"><div><span className="card-overline">INVESTIGATION OUTPUT</span><h3>Evidence &amp; policy comparison</h3></div><Badge tone="violet">{investigation.provider === "demo" ? "DEMO" : "AI"}</Badge></div>
    <div className="claim-groups">
      <ClaimGroup title="Case-record facts" tone="blue" items={investigation.verified_facts} empty="No case-record facts returned." />
      <ClaimGroup title="Customer claims" tone="amber" items={investigation.customer_claims} empty="No customer claims returned." />
      <ClaimGroup title="Owner claims" tone="amber" items={investigation.owner_claims} empty="No owner claims returned." />
      <ClaimGroup title="Conflicting / unresolved claims" tone="violet" items={claimsToReconcile} empty="No conflicting or unresolved claims identified." />
      <ClaimGroup title="Unknown / missing evidence" tone="violet" items={investigation.evidence_gaps} empty="No evidence gaps identified." />
    </div>
    <div className="policy-section"><div className="policy-section-title"><ShieldCheck size={15} />Relevant marketplace policy</div>
      {investigation.policy_references.map((id) => {
        const policy = policyMap[id];
        return policy ? <div className="policy-reference" key={id}><div><strong>{policy.title}</strong><span>{policy.id}</span></div><p>{policy.text}</p></div> : <div className="policy-reference" key={id}><strong>{id}</strong><p>Policy text unavailable.</p></div>;
      })}
    </div>
  </div>;
}

function ClaimGroup({ title, tone, items, empty }) {
  return <div className="claim-group"><div className="claim-title"><Badge tone={tone}>{title}</Badge><span>{items.length}</span></div>
    {items.length ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p className="claim-empty">{empty}</p>}
  </div>;
}

export default App;
