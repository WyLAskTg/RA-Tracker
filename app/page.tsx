import Script from "next/script";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return <>
    <header className="topbar">
      <a className="brand" href="#" aria-label="Research application tracker home"><span className="brand-mark">R</span><span>Research<br />Tracker</span></a>
      <div className="header-actions account-actions">
        <span className="account-email" title={user.email}>{user.displayName}</span>
        <a className="button ghost outline-action account-button" href={chatGPTSignOutPath("/")} target="_top">Sign out</a>
        <button id="addSemesterBtn" className="button ghost outline-action positive-outline" type="button"><span aria-hidden="true">＋</span> New term</button>
      </div>
    </header>
    <main><section className="workspace" aria-labelledby="semesterHeading">
      <div className="semester-bar"><div><p className="section-label">ACTIVE TERM</p><div className="semester-title-row"><select id="semesterSelect" aria-label="Select semester"></select><button id="renameSemesterBtn" className="icon-button" type="button" title="Rename semester" aria-label="Rename semester">✎</button></div></div>
        <div className="semester-actions"><button id="addApplicationBtn" className="button ghost outline-action positive-outline term-action" type="button"><span aria-hidden="true">＋</span> Add application</button><label id="importExcelLabel" className="button ghost outline-action import-label term-action" title="Import applications into the active term">Import Excel<input id="importExcelInput" type="file" accept=".xlsx,.xls,.xlsb,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" /></label><button id="deleteSemesterBtn" className="button ghost outline-action danger-button term-action" type="button">Delete term</button></div>
      </div>
      <div id="syncStatus" className="sync-status" aria-live="polite">Loading your account…</div>
      <div id="stats" className="stats" aria-label="Application summary"></div>
      <div className="toolbar"><label className="search-wrap"><span aria-hidden="true">⌕</span><input id="searchInput" type="search" placeholder="Search professor, email, school, or field…" aria-label="Search applications" /></label><select id="statusFilter" aria-label="Filter by status"><option value="all">All statuses</option></select><select id="sortSelect" aria-label="Sort applications"><option value="updated-desc">Recently updated</option><option value="updated-asc">Oldest updated</option><option value="professor">Professor A–Z</option><option value="school">School A–Z</option></select></div>
      <div className="table-shell"><table><thead><tr><th>Professor</th><th>Email</th><th>Institution</th><th>Status</th><th>Last updated</th><th>Research field</th><th>Notes</th><th aria-label="Actions"></th></tr></thead><tbody id="applicationRows"></tbody></table><div id="emptyState" className="empty-state" hidden><div className="empty-icon">✦</div><h2>No applications yet</h2><p>Start this semester by adding your first professor.</p><button className="button primary add-from-empty" type="button">Add your first application</button></div></div>
    </section></main>

    <dialog id="applicationDialog" className="modal"><form id="applicationForm" method="dialog">
      <div className="modal-head"><div><p className="section-label">APPLICATION DETAILS</p><h2 id="applicationDialogTitle">Add application</h2></div></div><input id="applicationId" type="hidden" />
      <div className="form-grid"><label>Professor name<input id="professorInput" required maxLength={100} placeholder="e.g. Dr. Jane Smith" /></label><label>School<input id="schoolInput" required maxLength={120} placeholder="e.g. University of Toronto" /></label><label className="full">Professor email<input id="emailInput" type="email" maxLength={160} placeholder="e.g. professor@university.edu" /></label><label className="full">Current status<select id="applicationStatus" required></select></label><label>Last updated<input id="dateInput" type="date" required /></label><label>Research field<input id="fieldInput" required maxLength={120} placeholder="e.g. Human–computer interaction" /></label><label className="full">Notes<textarea id="notesInput" rows={4} maxLength={1200} placeholder="Add context, next steps, or email details…"></textarea></label>
        <section className="history-section full" aria-labelledby="historyTitle"><div className="history-head"><div><p className="section-label">CONTACT HISTORY</p><h3 id="historyTitle">Interactions</h3></div><button id="showContactComposerBtn" className="button ghost compact-button" type="button">＋ Add contact</button></div><div id="contactComposer" className="contact-composer" hidden><label>Date<input id="contactDateInput" type="date" /></label><label>Type<select id="contactTypeInput"><option>Initial email</option><option>Follow-up</option><option>Reply received</option><option>Meeting</option><option>Other</option></select></label><label className="contact-summary">Summary<input id="contactSummaryInput" maxLength={300} placeholder="What happened?" /></label><div className="composer-actions"><button id="cancelContactBtn" className="text-button" type="button">Cancel</button><button id="addContactBtn" className="button primary compact-button" type="button">Add to history</button></div></div><div id="contactHistoryList" className="history-list"></div></section>
      </div><div className="modal-actions"><button type="button" className="button ghost dialog-close">Cancel</button><button type="submit" id="saveApplicationBtn" className="button primary" value="default">Save application</button></div>
    </form></dialog>

    <dialog id="semesterDialog" className="modal small-modal"><form id="semesterForm" method="dialog"><div className="modal-head"><div><p className="section-label">TERM</p><h2 id="semesterDialogTitle">New term</h2></div></div><label>Semester name<input id="semesterNameInput" required maxLength={60} placeholder="e.g. Fall 2026" /></label><div className="modal-actions"><button type="button" className="button ghost dialog-close">Cancel</button><button type="submit" className="button primary" value="default">Save semester</button></div></form></dialog>

    <aside id="reminderPanel" className="reminder-panel" aria-live="polite" hidden><button id="closeReminderBtn" className="reminder-close" type="button" aria-label="Close follow-up reminders">×</button><p className="section-label">FOLLOW-UP REMINDER</p><h2 id="reminderTitle">Applications need attention</h2><div id="reminderList" className="reminder-list"></div></aside>
    <div id="toast" className="toast" role="status" aria-live="polite"></div>
    <Script src="/xlsx.full.min.js" strategy="beforeInteractive" /><Script src="/app.js" strategy="afterInteractive" />
  </>;
}
