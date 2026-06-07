// Inbox (bell + dropdown) + Approvals queue + entry detail modal
const { useState: iState, useEffect: iEffect, useMemo: iMemo, useRef: iRef } = React;

// ===================================================================
// INBOX BELL + DROPDOWN (lives in topbar)
// ===================================================================
function InboxBell({ data, onOpenEntry, onNavigate, refreshKey }) {
  const { currentUser, ROLES } = useAuth();
  const [open, setOpen] = iState(false);
  const [tab, setTab] = iState('all');
  const wrapRef = iRef(null);

  const items = iMemo(() => buildInbox(currentUser, ROLES, data), [currentUser.id, refreshKey, data.months.length]);
  const unreadCount = items.filter(i => i.unread).length;

  // Close on outside click
  iEffect(() => {
    const handle = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const filtered = items.filter(it => {
    if (tab === 'all') return true;
    if (tab === 'approval')   return it.type === 'approval';
    if (tab === 'outlier')    return it.type === 'outlier';
    if (tab === 'performance') return it.type === 'performance';
    if (tab === 'system')     return it.type === 'system';
  });

  const tabs = [
    { id: 'all',         label: 'All',          count: items.length },
    { id: 'approval',    label: 'Approvals',    count: items.filter(i => i.type === 'approval').length },
    { id: 'outlier',     label: 'Outliers',     count: items.filter(i => i.type === 'outlier').length },
    { id: 'performance', label: 'Performance',  count: items.filter(i => i.type === 'performance').length },
    { id: 'system',      label: 'System',       count: items.filter(i => i.type === 'system').length },
  ];

  return (
    <div className="bell-wrap" ref={wrapRef}>
      <button className="bell-btn" onClick={() => setOpen(!open)} aria-label="Inbox">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9z"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        {unreadCount > 0 && <span className="bell-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {open && (
        <div className="inbox-drop">
          <div className="inbox-head">
            <div>
              <div className="inbox-title">Inbox</div>
              <div className="inbox-sub">{unreadCount} unread · {items.length} total</div>
            </div>
            <button className="btn-link" onClick={() => { markAllRead(currentUser, items); setOpen(false); setTimeout(() => setOpen(true), 0); }}>Mark all read</button>
          </div>

          <div className="inbox-tabs">
            {tabs.map(t => (
              <button key={t.id} className={"itab " + (tab === t.id ? 'on' : '')} onClick={() => setTab(t.id)}>
                {t.label}{t.count > 0 && <span className="itab-count">{t.count}</span>}
              </button>
            ))}
          </div>

          <div className="inbox-list">
            {filtered.length === 0 && <div className="inbox-empty">No {tab === 'all' ? '' : tab} notifications</div>}
            {filtered.map(it => (
              <InboxItem key={it.id} item={it} onClick={() => {
                markRead(currentUser, [it.id]);
                if (it.type === 'approval' || it.type === 'outlier' || it.type === 'system') {
                  if (onOpenEntry && it.entryId) { setOpen(false); onOpenEntry(it.entryId); }
                } else if (it.type === 'performance') {
                  setOpen(false);
                  if (onNavigate) onNavigate(it.metric === 'NRW' ? 'nrw' : it.metric === 'Arrears' ? 'arrears' : 'billing');
                }
              }} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function InboxItem({ item, onClick }) {
  const iconMap = {
    approval: '✓', outlier: '⚠', performance: '◐', system: '◧'
  };
  const sevColor = {
    critical: 'oklch(58% 0.18 25)',
    high:     'oklch(70% 0.14 70)',
    medium:   'oklch(60% 0.10 70)',
    low:      'oklch(58% 0.13 150)',
    info:     'oklch(55% 0.10 235)',
  };
  return (
    <button className={"inbox-item " + (item.unread ? 'unread' : '')} onClick={onClick}>
      <div className="ii-icon" style={{ background: sevColor[item.severity] || sevColor.info }}>{iconMap[item.type] || '·'}</div>
      <div className="ii-body">
        <div className="ii-title">{item.title}</div>
        <div className="ii-sub">{item.summary}</div>
        {item.recommendation && <div className="ii-rec">{item.recommendation}</div>}
        <div className="ii-time">{relTime(item.createdAt)}</div>
      </div>
      {item.unread && <div className="ii-dot"/>}
    </button>
  );
}

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return Math.floor(diff/60) + 'm ago';
  if (diff < 86400) return Math.floor(diff/3600) + 'h ago';
  if (diff < 86400*7) return Math.floor(diff/86400) + 'd ago';
  return new Date(iso).toLocaleDateString();
}

// ===================================================================
// APPROVALS QUEUE VIEW
// ===================================================================
function ApprovalsView({ baseData, onChanged, initialOpenId, onConsumeOpen }) {
  const { currentUser, ROLES } = useAuth();
  const role = ROLES[currentUser.role];
  const [all, setAll] = iState(() => window.loadAllEntries());
  const [openId, setOpenId] = iState(initialOpenId || null);
  const [filter, setFilter] = iState('pending');

  iEffect(() => {
    if (initialOpenId) {
      setOpenId(initialOpenId);
      setFilter('all');
      onConsumeOpen && onConsumeOpen();
    }
  }, [initialOpenId]);

  const refresh = () => { setAll(window.loadAllEntries()); onChanged && onChanged(); };

  // Filter to this approver's scope
  const visible = all.filter(e => {
    if (role.districts === 'assigned' && e.district !== currentUser.district) return false;
    if (filter === 'pending')  return e.status === 'pending';
    if (filter === 'approved') return e.status === 'approved';
    if (filter === 'rejected') return e.status === 'rejected';
    return true;
  }).sort((a,b) => (b.submittedAt||'').localeCompare(a.submittedAt||''));

  const counts = {
    pending:  all.filter(e => e.status === 'pending'  && (role.districts !== 'assigned' || e.district === currentUser.district)).length,
    approved: all.filter(e => e.status === 'approved' && (role.districts !== 'assigned' || e.district === currentUser.district)).length,
    rejected: all.filter(e => e.status === 'rejected' && (role.districts !== 'assigned' || e.district === currentUser.district)).length,
  };

  return (
    <div className="view-body">
      <div className="section-head">
        <div>
          <div className="sh-eyebrow">APPROVALS QUEUE</div>
          <h2 className="sh-title">Review monthly submissions</h2>
          <p className="sh-desc">Pending entries from Commercial Officers (and other Managers) wait here for your review. Approve to publish to dashboards, or reject with a reason to send back for correction.</p>
        </div>
        <div className="filter-pill" style={{minWidth:200}}>
          <label>Show</label>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="pending">Pending ({counts.pending})</option>
            <option value="approved">Approved ({counts.approved})</option>
            <option value="rejected">Rejected ({counts.rejected})</option>
            <option value="all">All</option>
          </select>
        </div>
      </div>

      <div className="kpi-grid">
        <KpiCard label="Pending review" value={counts.pending} sub="awaiting your decision" tone={counts.pending > 0 ? 'warn' : 'good'} />
        <KpiCard label="Approved (lifetime)" value={counts.approved} sub="live on dashboards" tone="good" />
        <KpiCard label="Rejected (lifetime)" value={counts.rejected} sub="returned for correction" tone="bad" />
        <KpiCard label="Your scope" value={role.districts === 'assigned' ? currentUser.district : 'All districts'} sub={role.label} />
      </div>

      <div className="chart-card">
        <div className="cc-head"><div><div className="cc-title">{filter.toUpperCase()} entries ({visible.length})</div></div></div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>District</th><th>Month</th><th>Submitted</th><th>By</th>
                <th>Status</th><th>Flags</th><th></th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan="7" className="empty">Nothing to review · the queue is clear.</td></tr>}
              {visible.map(e => (
                <tr key={e.id} className={e.outlierFlags?.length ? 'has-flags' : ''}>
                  <td><span className="dist-dot" style={{background: CHART_COLORS.districts[e.district]}}/>{e.district}</td>
                  <td><b>{e.monthLabel}</b></td>
                  <td>{new Date(e.submittedAt).toLocaleString()}</td>
                  <td>{e.submittedBy}</td>
                  <td><StatusPill status={e.status} /></td>
                  <td>{e.outlierFlags?.length ? <span className="flag-chip">⚠ {e.outlierFlags.length}</span> : <span className="muted">—</span>}</td>
                  <td><button className="btn-primary" style={{padding:'5px 12px',fontSize:12}} onClick={() => setOpenId(e.id)}>Review →</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {openId && <EntryDetailModal entry={all.find(e => e.id === openId)} baseData={baseData} onClose={() => setOpenId(null)} onActed={refresh} />}
    </div>
  );
}

// ===================================================================
// ENTRY DETAIL MODAL — approve / reject with audit
// ===================================================================
function EntryDetailModal({ entry, baseData, onClose, onActed }) {
  const { currentUser, ROLES } = useAuth();
  const role = ROLES[currentUser.role];
  const canAct = role.privileges.approveEntries
                 && entry.status === 'pending'
                 && (role.districts !== 'assigned' || entry.district === currentUser.district);
  const [note, setNote] = iState('');

  const decide = (action) => {
    const now = new Date().toISOString();
    const all = window.loadAllEntries();
    const idx = all.findIndex(e => e.id === entry.id);
    if (idx < 0) return;
    if (action === 'approve') {
      all[idx] = {
        ...all[idx],
        status: 'approved',
        approvedBy: currentUser.name,
        approvedAt: now,
        approvalNote: note,
        history: [...all[idx].history, { action: 'approved', by: currentUser.name, at: now, note }],
      };
    } else {
      if (!note.trim()) { alert('Please provide a rejection reason.'); return; }
      all[idx] = {
        ...all[idx],
        status: 'rejected',
        rejectedBy: currentUser.name,
        rejectedAt: now,
        rejectionReason: note,
        history: [...all[idx].history, { action: 'rejected', by: currentUser.name, at: now, note }],
      };
    }
    window.saveAllEntries(all);
    onActed && onActed();
    onClose();
  };

  // Compare entry values against baseline
  const districtData = baseData[entry.district];
  const rows = [
    ['Customers',   entry.customers, baseData.customers[entry.district]],
    ['Unbilled',    entry.unbilled,  baseData.unbilled[entry.district]],
    ['SIV (m³)',    entry.siv,       baseData.siv[entry.district]],
    ['Sales (m³)',  entry.sales,     baseData.totalSales[entry.district]],
    ['Billing',     entry.billing,   baseData.billing[entry.district]],
    ['Collection',  entry.collection,baseData.collection[entry.district]],
  ];

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h3>{entry.district} · {entry.monthLabel}</h3>
            <div className="modal-sub">Submitted by {entry.submittedBy} · {new Date(entry.submittedAt).toLocaleString()}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:12}}>
            <StatusPill status={entry.status} />
            <button onClick={onClose} className="btn-link">close ✕</button>
          </div>
        </div>

        <div className="modal-body">
          <div className="entry-detail-grid">
            <div className="ed-section">
              <div className="ed-title">Submitted values vs 12-month baseline</div>
              <table className="data-table compact">
                <thead><tr><th>Metric</th><th className="num">Submitted</th><th className="num">12-mo mean</th><th className="num">Deviation</th></tr></thead>
                <tbody>
                  {rows.map(([label, val, series]) => {
                    const v = parseFloat(val);
                    if (isNaN(v) || !series) return <tr key={label}><td>{label}</td><td className="num muted">—</td><td className="num muted">—</td><td className="num muted">—</td></tr>;
                    const recent = series.slice(-12).filter(x => x != null);
                    const mean = recent.reduce((a,x) => a+x, 0) / (recent.length || 1);
                    const dev = ((v - mean) / mean) * 100;
                    const isOut = Math.abs(dev) > 25;
                    return (
                      <tr key={label}>
                        <td>{label}</td>
                        <td className="num"><b>{fmtNum(v, label.includes('m³') ? 0 : 0)}</b></td>
                        <td className="num muted">{fmtNum(mean, 0)}</td>
                        <td className={"num " + (isOut ? (dev > 0 ? 'neg' : 'neg') : '')}>{dev>=0?'+':''}{dev.toFixed(1)}%{isOut && ' ⚠'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {entry.outlierFlags?.length > 0 && (
              <div className="ed-section">
                <div className="ed-title">Outlier flags ({entry.outlierFlags.length})</div>
                <div className="op-list">
                  {entry.outlierFlags.map((f,i) => (
                    <div key={i} className={"op-item op-" + f.severity}>
                      <b>{f.label}</b> · {f.direction} baseline by <b>{Math.abs(f.deviation).toFixed(1)}%</b> · z-score {f.zScore.toFixed(2)} · severity <em>{f.severity}</em>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="ed-section">
              <div className="ed-title">Audit trail</div>
              <div className="audit-trail">
                {entry.history.map((h, i) => (
                  <div key={i} className="audit-row">
                    <div className="audit-dot" />
                    <div className="audit-body">
                      <div className="audit-line"><b>{h.action}</b> by {h.by}</div>
                      <div className="audit-meta">{new Date(h.at).toLocaleString()}{h.note ? ' · "' + h.note + '"' : ''}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {canAct && (
              <div className="ed-section">
                <div className="ed-title">Your decision</div>
                <label className="field"><span>Note (required for rejection)</span>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. 'Sales figure looks 30% off — please verify with meter readers'" rows="3"/>
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="modal-foot">
          {canAct ? (
            <>
              <button className="btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn-reject" onClick={() => decide('reject')}>Reject &amp; return</button>
              <button className="btn-primary" onClick={() => decide('approve')}>✓ Approve &amp; publish</button>
            </>
          ) : (
            <>
              <span className="muted" style={{flex:1}}>
                {entry.status !== 'pending' ? 'This entry has already been ' + entry.status + '.' : "You don't have approval rights for this district."}
              </span>
              <button className="btn-ghost" onClick={onClose}>Close</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { InboxBell, ApprovalsView, EntryDetailModal });
