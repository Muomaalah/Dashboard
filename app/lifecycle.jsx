// Entry lifecycle: status, audit trail, outlier detection, performance forecasting
const { useMemo: lMemo } = React;

// ---------- Storage upgrade: ensure all entries have lifecycle fields ----------
function migrateEntries() {
  try {
    const raw = window.__Store.get('entries', []);
    let changed = false;
    for (const e of raw) {
      if (!e.status) { e.status = 'approved'; changed = true; }   // legacy entries auto-approved
      if (!e.history) {
        e.history = [{ action: 'submitted', by: e.submittedBy || 'unknown', at: e.submittedAt || new Date().toISOString(), note: '' }];
        if (e.status === 'approved') e.history.push({ action: 'auto-approved (migration)', by: 'system', at: e.submittedAt || new Date().toISOString() });
        changed = true;
      }
      if (!e.outlierFlags) { e.outlierFlags = []; changed = true; }
    }
    if (changed) window.__Store.set('entries', raw);
    return raw;
  } catch { return []; }
}

// Override the loaders so the rest of the app uses lifecycle-aware data
const __origLoadOverrides = window.loadOverrides;
window.loadOverrides = function () {
  const all = migrateEntries();
  // Only approved entries flow into the dashboard data
  return all.filter(e => e.status === 'approved');
};
window.loadAllEntries = () => migrateEntries();
window.saveAllEntries = (arr) => window.__Store.set('entries', arr);

// ---------- Outlier detection ----------
// Returns array of {metric, label, value, baselineMean, baselineStd, zScore, severity}
function detectOutliers(entry, baseData) {
  const flags = [];
  const d = entry.district;
  if (!baseData.customers?.[d]) return flags;

  const checks = [
    { field: 'customers', series: baseData.customers[d],   label: 'Customers',   threshold: 2.0 },
    { field: 'unbilled',  series: baseData.unbilled[d],    label: 'Unbilled',    threshold: 2.0 },
    { field: 'sales',     series: baseData.totalSales[d],  label: 'Water sales', threshold: 2.0 },
    { field: 'siv',       series: baseData.siv[d],         label: 'SIV',         threshold: 2.0 },
    { field: 'billing',   series: baseData.billing[d],     label: 'Billing',     threshold: 2.0 },
    { field: 'collection',series: baseData.collection[d],  label: 'Collection',  threshold: 2.0 },
  ];

  for (const c of checks) {
    const v = parseFloat(entry[c.field]);
    if (isNaN(v) || !c.series) continue;
    // Use last 12 months of non-null data
    const recent = c.series.slice(-12).filter(x => x != null);
    if (recent.length < 4) continue;
    const mean = recent.reduce((a,x) => a+x, 0) / recent.length;
    const variance = recent.reduce((a,x) => a + (x-mean)**2, 0) / recent.length;
    const std = Math.sqrt(variance);
    if (std === 0) continue;
    const z = (v - mean) / std;
    if (Math.abs(z) >= c.threshold) {
      const severity = Math.abs(z) >= 3 ? 'critical' : Math.abs(z) >= 2.5 ? 'high' : 'medium';
      flags.push({
        metric: c.field, label: c.label, value: v,
        baselineMean: mean, baselineStd: std, zScore: z,
        direction: z > 0 ? 'above' : 'below',
        deviation: ((v - mean) / mean) * 100,
        severity,
      });
    }
  }
  return flags;
}

// ---------- Performance forecasting ----------
// Linear regression on last N months → project to end of year → compute target gap
function linearRegress(values) {
  // values is array; ignore nulls
  const pts = values.map((v,i) => v == null ? null : [i, v]).filter(Boolean);
  if (pts.length < 2) return null;
  const n = pts.length;
  const sumX = pts.reduce((a, [x]) => a+x, 0);
  const sumY = pts.reduce((a, [,y]) => a+y, 0);
  const sumXY = pts.reduce((a, [x,y]) => a + x*y, 0);
  const sumX2 = pts.reduce((a, [x]) => a + x*x, 0);
  const slope = (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX);
  const intercept = (sumY - slope*sumX) / n;
  return { slope, intercept, predict: x => slope*x + intercept };
}

// Build performance forecasts for the latest visible year
function computePerformanceAlerts(data) {
  const alerts = [];
  const months = data.months;
  const last = months.length - 1;
  const currentYear = '20' + months[last].slice(-2);
  const ytdStart = months.findIndex(m => m.endsWith(months[last].slice(-2)));
  const monthsRemaining = 12 - (last - ytdStart + 1);
  const tgt = data.targets[currentYear];
  if (!tgt) return alerts;

  for (const d of data.districts) {
    // ----- Billing forecast -----
    const billYTD = data.billing[d].slice(ytdStart, last+1).reduce((a,v) => a+(v||0), 0);
    const monthlyTarget = tgt.billing[d];
    // Targets are stored as MONTHLY averages — annual = monthly × 12
    const annualTarget = monthlyTarget ? monthlyTarget * 12 : 0;
    if (annualTarget && monthsRemaining >= 0) {
      // Use last 6 months to project monthly pace going forward
      const recent6 = data.billing[d].slice(Math.max(0, last-5), last+1).filter(v => v != null);
      const reg = linearRegress(recent6);
      const projAvgMonthly = reg ? Math.max(0, reg.predict(recent6.length)) : (recent6.reduce((a,v)=>a+v,0) / recent6.length);
      const projectedYearEnd = billYTD + projAvgMonthly * monthsRemaining;
      const gap = annualTarget - projectedYearEnd;
      const gapPct = (gap/annualTarget) * 100;
      if (Math.abs(gapPct) > 5) {
        const requiredMonthly = monthsRemaining > 0 ? ((annualTarget - billYTD) / monthsRemaining) : null;
        alerts.push({
          id: 'perf_' + d + '_billing',
          type: 'performance',
          severity: gapPct > 15 ? 'critical' : gapPct > 5 ? 'high' : 'low',
          district: d, metric: 'Billing',
          title: gap > 0 ? `${d} on track to miss ${currentYear} billing target` : `${d} on track to exceed ${currentYear} billing target`,
          summary: `Projected year-end: ${fmtMoney(projectedYearEnd)} vs annual target ${fmtMoney(annualTarget)} (${gap > 0 ? '−' : '+'}${fmtMoney(Math.abs(gap))}, ${Math.abs(gapPct).toFixed(1)}%). Monthly target ${fmtMoney(monthlyTarget)}; current pace ${fmtMoney(projAvgMonthly)}/mo.`,
          recommendation: gap > 0
            ? `Lift monthly billing to ${fmtMoney(requiredMonthly)} for the remaining ${monthsRemaining} month${monthsRemaining===1?'':'s'} (currently averaging ${fmtMoney(projAvgMonthly)}). Focus on: (a) closing the metering gap on ${fmtNum(data.unbilled[d][last])} unbilled connections, (b) auditing high-consumption commercial accounts for under-billing.`
            : `Current pace ${fmtMoney(projAvgMonthly)}/month is healthy. Maintain operational tempo and capture upside by addressing arrears below.`,
          createdAt: new Date().toISOString(),
        });
      }
    }

    // ----- Collection ratio alert -----
    const recentCR = data.collectionRatio[d].slice(Math.max(0, last-2), last+1).filter(v => v != null);
    const avgCR = recentCR.reduce((a,v) => a+v, 0) / (recentCR.length || 1);
    if (avgCR < 90 && avgCR > 0) {
      const gapPP = 95 - avgCR;
      alerts.push({
        id: 'perf_' + d + '_cratio',
        type: 'performance',
        severity: avgCR < 75 ? 'critical' : avgCR < 85 ? 'high' : 'medium',
        district: d, metric: 'Collection ratio',
        title: `${d} collection ratio below 90%`,
        summary: `3-month average ${avgCR.toFixed(1)}% — recovering less than billed, arrears growing by ~${fmtMoney((100-avgCR)/100 * (data.billing[d][last]||0))}/month.`,
        recommendation: `Target ≥95%. Close the gap (${gapPP.toFixed(1)}pp) via: (1) disconnect-and-reconnect campaign for accounts >90 days past due, (2) MoMo / mobile-money push to high-arrears customers, (3) commercial customer payment plans capped at 60 days.`,
        createdAt: new Date().toISOString(),
      });
    }

    // ----- NRW alert -----
    const recentNRW = data.nrwPct[d].slice(Math.max(0, last-2), last+1).filter(v => v != null);
    const avgNRW = recentNRW.reduce((a,v) => a+v, 0) / (recentNRW.length || 1) * 100;
    const nrwTarget = tgt.nrw[d];
    if (avgNRW > nrwTarget + 3) {
      const gapPP = avgNRW - nrwTarget;
      alerts.push({
        id: 'perf_' + d + '_nrw',
        type: 'performance',
        severity: gapPP > 10 ? 'critical' : gapPP > 5 ? 'high' : 'medium',
        district: d, metric: 'NRW',
        title: `${d} NRW above 2026 target`,
        summary: `3-month average ${avgNRW.toFixed(1)}% vs target ${nrwTarget.toFixed(1)}% (+${gapPP.toFixed(1)}pp). Each 1pp = ~${fmtM3((data.siv[d][last]||0)/100)} of lost water monthly.`,
        recommendation: `Sequence: (1) commission DMA flow loggers on the worst zones, (2) night-line investigation 2–4am for leak detection, (3) bulk-meter every PRV outlet, (4) audit large industrial customers for meter under-reading. Aim for −1pp/quarter.`,
        createdAt: new Date().toISOString(),
      });
    }

    // ----- Arrears trajectory -----
    const recentArr = data.arrears[d].slice(Math.max(0, last-2), last+1);
    if (recentArr.length >= 2) {
      const growth = (recentArr[recentArr.length-1] - recentArr[0]) / recentArr[0] * 100;
      if (growth > 15) {
        alerts.push({
          id: 'perf_' + d + '_arrears',
          type: 'performance',
          severity: growth > 30 ? 'critical' : 'high',
          district: d, metric: 'Arrears',
          title: `${d} arrears growing fast`,
          summary: `Arrears up ${growth.toFixed(1)}% over the last 3 months — currently ${fmtMoney(data.arrears[d][last])}.`,
          recommendation: `Prioritise top-100 debtors for door-to-door visits this quarter. Suspend any new commercial connections in this district until balance reduction is confirmed for 2 consecutive months.`,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  return alerts;
}

// ---------- Inbox notification builder ----------
// Returns unified list of inbox items for the current user
function buildInbox(currentUser, ROLES, data) {
  const role = ROLES[currentUser.role];
  const all = window.loadAllEntries();
  const readSet = new Set(JSON.parse(localStorage.getItem('gwl_read_' + currentUser.id) || '[]'));

  const items = [];

  // ----- Approval requests (only for users who can approve) -----
  if (role.privileges.approveEntries) {
    const pending = all.filter(e => e.status === 'pending');
    for (const e of pending) {
      // District manager only sees their own district
      if (currentUser.role === 'manager' && e.district !== currentUser.district) continue;
      items.push({
        id: 'apv_' + e.id,
        type: 'approval',
        entryId: e.id,
        severity: e.outlierFlags?.length ? 'high' : 'medium',
        title: `${e.district} · ${e.monthLabel} return needs review`,
        summary: `Submitted by ${e.submittedBy}. ${e.outlierFlags?.length ? e.outlierFlags.length + ' outlier flag(s) detected.' : 'No outliers detected.'}`,
        createdAt: e.submittedAt,
        unread: !readSet.has('apv_' + e.id),
      });
    }
  }

  // ----- Outlier alerts (entries with flags - relevant to submitter + their approver) -----
  for (const e of all) {
    if (!e.outlierFlags?.length) continue;
    const isMyEntry = e.submittedById === currentUser.id;
    const isApprover = role.privileges.approveEntries && (currentUser.role !== 'manager' || e.district === currentUser.district);
    if (!isMyEntry && !isApprover) continue;
    const id = 'out_' + e.id;
    items.push({
      id, type: 'outlier', entryId: e.id,
      severity: e.outlierFlags.some(f => f.severity === 'critical') ? 'critical' : e.outlierFlags.some(f => f.severity === 'high') ? 'high' : 'medium',
      title: `Outlier${e.outlierFlags.length>1?'s':''} in ${e.district} ${e.monthLabel}`,
      summary: e.outlierFlags.map(f => `${f.label} ${f.direction} baseline (${f.deviation>=0?'+':''}${f.deviation.toFixed(1)}%)`).join(' · '),
      createdAt: e.submittedAt,
      unread: !readSet.has(id),
    });
  }

  // ----- Performance alerts (only if user can view financials / NRW) -----
  if (role.privileges.viewFinancials || role.privileges.viewNRW) {
    const perf = computePerformanceAlerts(data);
    for (const a of perf) {
      if (currentUser.role === 'manager' && a.district !== currentUser.district) continue;
      if (a.metric === 'NRW' && !role.privileges.viewNRW) continue;
      items.push({
        ...a,
        unread: !readSet.has(a.id),
      });
    }
  }

  // ----- System messages (approvals / rejections of MY entries) -----
  for (const e of all) {
    if (e.submittedById !== currentUser.id) continue;
    if (e.status === 'approved' && e.approvedAt) {
      const id = 'sys_apv_' + e.id;
      items.push({
        id, type: 'system', entryId: e.id, severity: 'info',
        title: `Your ${e.monthLabel} entry was approved`,
        summary: `Approved by ${e.approvedBy} · ${e.district}${e.approvalNote ? ' · "' + e.approvalNote + '"' : ''}`,
        createdAt: e.approvedAt,
        unread: !readSet.has(id),
      });
    }
    if (e.status === 'rejected' && e.rejectedAt) {
      const id = 'sys_rej_' + e.id;
      items.push({
        id, type: 'system', entryId: e.id, severity: 'high',
        title: `Your ${e.monthLabel} entry was rejected`,
        summary: `Rejected by ${e.rejectedBy} · ${e.district} · Reason: ${e.rejectionReason || '(none)'}`,
        createdAt: e.rejectedAt,
        unread: !readSet.has(id),
      });
    }
  }

  items.sort((a,b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return items;
}

function markRead(currentUser, ids) {
  const key = 'gwl_read_' + currentUser.id;
  const set = new Set(JSON.parse(localStorage.getItem(key) || '[]'));
  for (const id of ids) set.add(id);
  localStorage.setItem(key, JSON.stringify([...set]));
}
function markAllRead(currentUser, items) {
  markRead(currentUser, items.map(i => i.id));
}

Object.assign(window, { detectOutliers, computePerformanceAlerts, buildInbox, markRead, markAllRead, linearRegress, migrateEntries });
