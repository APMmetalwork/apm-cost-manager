
let sb = null;
let currentProjectId = null;
let projects = [];

const APM_URL = 'https://spfztpokbpomqtiqgggz.supabase.co';
const APM_KEY = 'sb_publishable_xPXU0xL_YaiWA6k9PWc0Xg_4QYeypNi';

window.addEventListener('load', () => {
  connectSupabase(APM_URL, APM_KEY);
  document.getElementById('boqQty').addEventListener('input', calcBOQTotal);
  document.getElementById('boqRate').addEventListener('input', calcBOQTotal);
});

function calcBOQTotal() {
  const q = parseFloat(document.getElementById('boqQty').value) || 0;
  const r = parseFloat(document.getElementById('boqRate').value) || 0;
  document.getElementById('boqItemTotal').value = 'SAR ' + (q * r).toLocaleString('en-SA', {minimumFractionDigits: 2, maximumFractionDigits: 2});
}

async function connectSupabase(url, key) {
  try {
    sb = supabase.createClient(url, key);
    const { error } = await sb.from('apm_projects').select('id').limit(1);
    if (error && error.code === '42P01') {
    showToast('Tables not found. Run the setup SQL in Supabase first.', 'error');
    document.getElementById('statusDot').className = 'status-dot disconnected';
    document.getElementById('statusText').textContent = 'Tables missing';
    return;
    }
    document.getElementById('statusDot').className = 'status-dot connected';
    document.getElementById('statusText').textContent = 'Connected';
    showPage('dashboard');
    loadProjects();
    setTimeout(initUserCheck, 800);
  } catch(e) {
    document.getElementById('statusDot').className = 'status-dot disconnected';
    document.getElementById('statusText').textContent = 'Connection failed';
    showToast('Connection failed: ' + e.message, 'error');
  }
}

async function loadProjects() {
  if (!sb) return;
  const { data } = await sb.from('apm_projects').select('*').order('created_at', { ascending: false });
  projects = data || [];
  const sel = document.getElementById('projectSelect');
  const prev = sel.value;
  sel.innerHTML = '<option value="">-- Select Project --</option>';
  projects.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
  if (prev && projects.find(p => p.id === prev)) {
    sel.value = prev;
  }
}

let wizStep = 0;

function wizTab(n) {
  wizStep = n;
  for (let i = 0; i < 4; i++) {
    document.getElementById('wtab' + i).classList.toggle('active', i === n);
    document.getElementById('ws' + i).classList.toggle('active', i === n);
  }
  document.getElementById('wizNextBtn').textContent =
    n === 3 ? 'Create Project' : 'Next';
}

function wizBack() {
  if (wizStep > 0) wizTab(wizStep - 1);
}

function wizNext() {
  if (wizStep < 3) {
    wizTab(wizStep + 1);
  } else {
    saveProject();
  }
}

function addWizBOQRow() {
  const c = document.getElementById('wizBOQRows');
  const d = document.createElement('div');
  d.className = 'wiz-boq-row';
  d.innerHTML =
    '<input type="text" placeholder="Description e.g. Steel frame"/>' +
    '<input type="text" placeholder="Unit (m2, ton)"/>' +
    '<input type="number" placeholder="Qty"/>' +
    '<input type="number" placeholder="Unit Rate (SAR)"/>';
  c.appendChild(d);
}

function initWizard() {
  wizStep = 0;
  wizTab(0);
  const c = document.getElementById('wizBOQRows');
  if (c) { c.innerHTML = ''; addWizBOQRow(); }
}

async function saveProject() {
  const name = document.getElementById('projName').value.trim();
  if (!name) {
    showToast('Project name required', 'error');
    wizTab(0);
    return;
  }
  const { data: np, error } = await sb.from('apm_projects').insert({
    name,
    client: document.getElementById('projClient').value,
    start_date: document.getElementById('projStart').value || null,
    end_date: document.getElementById('projEnd').value || null,
    description: document.getElementById('projDesc').value,
    status: document.getElementById('projStatus')?.value || 'active',
    budget_purchases: parseFloat(
    document.getElementById('wBudPurchases').value) || 0,
    budget_payroll: parseFloat(
    document.getElementById('wBudPayroll').value) || 0,
    budget_direct: parseFloat(
    document.getElementById('wBudDirect').value) || 0,
    budget_indirect: parseFloat(
    document.getElementById('wBudIndirect').value) || 0,
    budget_goci: parseFloat(
    document.getElementById('wBudGOCI').value) || 0,
    tier1_name: document.getElementById('wTier1Name').value,
    tier1_max: parseFloat(
    document.getElementById('wTier1Max').value) || 0,
    tier2_name: document.getElementById('wTier2Name').value,
    tier2_max: parseFloat(
    document.getElementById('wTier2Max').value) || 0,
    tier3_name: document.getElementById('wTier3Name').value,
  }).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  const rows = document.querySelectorAll('#wizBOQRows .wiz-boq-row');
  for (const row of rows) {
    const inp = row.querySelectorAll('input');
    const desc = inp[0].value.trim();
    if (!desc) continue;
    await sb.from('apm_boq').insert({
    project_id: np.id,
    description: desc,
    unit: inp[1].value,
    qty: parseFloat(inp[2].value) || 0,
    unit_rate: parseFloat(inp[3].value) || 0,
    });
  }
  closeModal('projectModal');
  showToast('Project created!', 'success');
  await writeAudit('add', 'project', 'New project created: ' + name, null);
  initWizard();
  await loadProjects();
  document.getElementById('projectSelect').value = np.id;
  selectProject(np.id);
}

let currentPage = 'dashboard';
function navigate(page, el) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (el) el.classList.add('active');
  showPage(page);
  loadCurrentPage();
}

function showPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
}

function loadCurrentPage() {
  if (!currentProjectId && currentPage !== 'compare' &&
    currentPage !== 'suppliers') return;
  const map = {
    dashboard: loadDashboard,
    boq: loadBOQ,
    purchases: loadPurchases,
    payroll: loadPayroll,
    direct: loadDirect,
    indirect: loadIndirect,
    goci: loadGOCI,
    compare: loadCompare,
    'purchase-requests': loadPurchaseRequests,
    suppliers: loadSuppliers,
    remarks: loadRemarks,
    audit: loadAudit,
    import: resetImport
  };
  if (map[currentPage]) map[currentPage]();
}

const sar = v => 'SAR ' + Math.abs(v).toLocaleString('en-SA', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const sum = (arr, key) => arr.reduce((a, b) => a + (parseFloat(b[key]) || 0), 0);
let dashData = {};

function getFilter(prefix) {
  const f = document.getElementById(prefix + 'From');
  const t = document.getElementById(prefix + 'To');
  return { from: f ? f.value : null, to: t ? t.value : null };
}
function clearFilter(prefix) {
  const f = document.getElementById(prefix + 'From');
  const t = document.getElementById(prefix + 'To');
  if (f) f.value = '';
  if (t) t.value = '';
}

async function loadCompare() {
  if (!sb || !projects.length) return;
  const rows = [
    'BOQ Value', 'Purchases', 'Payroll',
    'Direct Costs', 'Indirect Costs', 'GOCI',
    'Total Costs', 'Net Margin', 'Margin %'
  ];
  const head = document.getElementById('compareHead');
  const body = document.getElementById('compareBody');
  if (!head || !body) return;
  head.innerHTML = '<th>Category</th>' +
    projects.map(p => '<th style="color:var(--accent)">' + p.name + '</th>').join('');
  body.innerHTML =
    '<tr><td colspan="' + (projects.length + 1) +
    '" style="text-align:center;color:var(--text3);padding:20px">Loading...</td></tr>';
  const ac = Math.max(projects.length, 1);
  const allData = await Promise.all(projects.map(async p => {
    const pid = p.id;
    const [boq, pur, pay, dir, ind, goc] = await Promise.all([
    sb.from('apm_boq').select('qty,unit_rate').eq('project_id', pid),
    sb.from('apm_purchases').select('amount').eq('project_id', pid),
    sb.from('apm_payroll').select('amount').eq('project_id', pid),
    sb.from('apm_direct_costs').select('amount').eq('project_id', pid),
    sb.from('apm_indirect_costs').select('amount'),
    sb.from('apm_goci').select('amount').eq('project_id', pid)
    ]);
    const tBOQ = (boq.data || []).reduce(
    (a, b) => a + (b.qty || 0) * (b.unit_rate || 0), 0);
    const tPur = sum(pur.data || [], 'amount');
    const tPay = sum(pay.data || [], 'amount');
    const tDir = sum(dir.data || [], 'amount');
    const tInd = sum(ind.data || [], 'amount') / ac;
    const tGoc = sum(goc.data || [], 'amount');
    const tCosts = tPur + tPay + tDir + tInd + tGoc;
    const margin = tBOQ - tCosts;
    const pct = tBOQ > 0
    ? ((margin / tBOQ) * 100).toFixed(1) + '%' : '--';
    return [tBOQ, tPur, tPay, tDir, tInd, tGoc, tCosts, margin, pct];
  }));
  body.innerHTML = rows.map((label, i) => {
    const isPct = i === 8;
    const cells = allData.map(d => {
    if (isPct) return '<td class="td-right td-mono">' + d[i] + '</td>';
    let col = '';
    if (i === 7) col = d[i] >= 0 ? 'color:var(--green)' : 'color:var(--red)';
    if (i === 0) col = 'color:var(--accent)';
    if (i === 6) col = 'color:var(--red)';
    return '<td class="td-right td-mono" style="' + col + '">' +
    sar(d[i]) + '</td>';
    }).join('');
    const bold = ['BOQ Value','Total Costs','Net Margin','Margin %']
    .includes(label) ? 'font-weight:500' : '';
    return '<tr><td style="' + bold + '">' + label + '</td>' + cells + '</tr>';
  }).join('');
}

async function exportTableExcel(type) {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const p = projects.find(x => x.id === currentProjectId) || {};
  const wb = XLSX.utils.book_new();
  const tables = {
    boq: { table: 'apm_boq', name: 'BOQ',
    cols: ['description','unit','qty','unit_rate'],
    heads: ['Description','Unit','Qty','Unit Rate (SAR)'] },
    purchases: { table: 'apm_purchases', name: 'Purchases',
    cols: ['entry_date','description','supplier','payment_method','amount','ref_no'],
    heads: ['Date','Description','Supplier','Payment','Amount','Ref'] },
    payroll: { table: 'apm_payroll', name: 'Payroll',
    cols: ['entry_date','employee','pay_type','payment_method','amount'],
    heads: ['Date','Employee','Type','Payment','Amount'] },
    direct: { table: 'apm_direct_costs', name: 'Direct Costs',
    cols: ['entry_date','description','category','payment_method','amount'],
    heads: ['Date','Description','Category','Payment','Amount'] },
    indirect: { table: 'apm_indirect_costs', name: 'Indirect Costs',
    cols: ['entry_date','description','category','amount'],
    heads: ['Date','Description','Category','Full Amount (SAR)'] },
    goci: { table: 'apm_goci', name: 'GOCI',
    cols: ['entry_date','description','category','ref_no','amount'],
    heads: ['Date','Description','Category','Ref','Amount'] }
  };
  const cfg = tables[type];
  if (!cfg) return;
  let q = sb.from(cfg.table).select('*').order('entry_date', {ascending: false});
  if (type !== 'indirect') q = q.eq('project_id', currentProjectId);
  const { data } = await q;
  const rows = (data || []).map(r => cfg.cols.map(c => r[c] || ''));
  const ws = XLSX.utils.aoa_to_sheet([cfg.heads, ...rows]);
  ws['!cols'] = cfg.heads.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, cfg.name);
  XLSX.writeFile(wb,
    'APM_' + (p.name || 'export').replace(/\s+/g, '_') +
    '_' + cfg.name + '.xlsx');
  showToast('Excel downloaded', 'success');
}

async function exportExcel() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const p = projects.find(x => x.id === currentProjectId) || {};
  const d = dashData;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['APM Metal Works -- ' + (p.name || '')],
    ['Client', p.client || '--'],
    ['Generated', new Date().toLocaleDateString('en-SA')],
    [],
    ['Category', 'Budget (SAR)', 'Actual (SAR)', 'Variance'],
    ['Purchases', p.budget_purchases || 0, d.tPur || 0,
    (p.budget_purchases || 0) - (d.tPur || 0)],
    ['Payroll', p.budget_payroll || 0, d.tPay || 0,
    (p.budget_payroll || 0) - (d.tPay || 0)],
    ['Direct Costs', p.budget_direct || 0, d.tDir || 0,
    (p.budget_direct || 0) - (d.tDir || 0)],
    ['Indirect Costs', p.budget_indirect || 0, d.tInd || 0,
    (p.budget_indirect || 0) - (d.tInd || 0)],
    ['GOCI', p.budget_goci || 0, d.tGoc || 0,
    (p.budget_goci || 0) - (d.tGoc || 0)],
    [],
    ['Total Costs', '', d.tCosts || 0],
    ['Net Margin', '', d.margin || 0],
    ['Margin %', '', (d.pct || 0) + '%']
  ]);
  ws['!cols'] = [{wch:20},{wch:18},{wch:18},{wch:18}];
  XLSX.utils.book_append_sheet(wb, ws, 'Summary');
  XLSX.writeFile(wb,
    'APM_' + (p.name || 'report').replace(/\s+/g, '_') + '.xlsx');
  showToast('Excel downloaded', 'success');
}

async function exportPDF() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const p = projects.find(x => x.id === currentProjectId) || {};
  const d = dashData;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('APM Metal Works', 14, 20);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('Project: ' + (p.name || '--'), 14, 28);
  doc.setFontSize(10);
  doc.text('Generated: ' + new Date().toLocaleDateString('en-SA'), 14, 35);
  doc.autoTable({
    startY: 42,
    head: [['Category', 'Budget (SAR)', 'Actual (SAR)', 'Variance']],
    body: [
    ['Purchases', sar(p.budget_purchases||0), sar(d.tPur||0),
    sar((p.budget_purchases||0)-(d.tPur||0))],
    ['Payroll', sar(p.budget_payroll||0), sar(d.tPay||0),
    sar((p.budget_payroll||0)-(d.tPay||0))],
    ['Direct Costs', sar(p.budget_direct||0), sar(d.tDir||0),
    sar((p.budget_direct||0)-(d.tDir||0))],
    ['Indirect Costs', sar(p.budget_indirect||0), sar(d.tInd||0),
    sar((p.budget_indirect||0)-(d.tInd||0))],
    ['GOCI', sar(p.budget_goci||0), sar(d.tGoc||0),
    sar((p.budget_goci||0)-(d.tGoc||0))],
    ['TOTAL COSTS', '--', sar(d.tCosts||0), '--'],
    ['NET MARGIN', '--', sar(d.margin||0) + ' (' + d.pct + '%)', '--']
    ],
    styles: { fontSize: 10 },
    headStyles: { fillColor: [30, 30, 30] }
  });
  doc.save('APM_' + (p.name||'report').replace(/\s+/g,'_') + '_Report.pdf');
  showToast('PDF downloaded', 'success');
}

async function exportComparePDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('APM Metal Works -- Project Comparison', 14, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Generated: ' + new Date().toLocaleDateString('en-SA'), 14, 25);
  const rows = [
    'BOQ Value','Purchases','Payroll','Direct Costs',
    'Indirect Costs','GOCI','Total Costs','Net Margin','Margin %'
  ];
  const ac = Math.max(projects.length, 1);
  const allData = await Promise.all(projects.map(async p => {
    const pid = p.id;
    const [boq,pur,pay,dir,ind,goc] = await Promise.all([
    sb.from('apm_boq').select('qty,unit_rate').eq('project_id',pid),
    sb.from('apm_purchases').select('amount').eq('project_id',pid),
    sb.from('apm_payroll').select('amount').eq('project_id',pid),
    sb.from('apm_direct_costs').select('amount').eq('project_id',pid),
    sb.from('apm_indirect_costs').select('amount'),
    sb.from('apm_goci').select('amount').eq('project_id',pid)
    ]);
    const tBOQ = (boq.data||[]).reduce(
    (a,b)=>a+(b.qty||0)*(b.unit_rate||0),0);
    const tPur=sum(pur.data||[],'amount'),tPay=sum(pay.data||[],'amount');
    const tDir=sum(dir.data||[],'amount');
    const tInd=sum(ind.data||[],'amount')/ac;
    const tGoc=sum(goc.data||[],'amount');
    const tCosts=tPur+tPay+tDir+tInd+tGoc;
    const margin=tBOQ-tCosts;
    return [tBOQ,tPur,tPay,tDir,tInd,tGoc,tCosts,margin,
    tBOQ>0?((margin/tBOQ)*100).toFixed(1)+'%':'--'];
  }));
  doc.autoTable({
    startY: 30,
    head: [['Category', ...projects.map(p => p.name)]],
    body: rows.map((l, i) => [l, ...allData.map(d => i===8?d[i]:sar(d[i]))]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [30,30,30] }
  });
  doc.save('APM_Comparison.pdf');
  showToast('PDF downloaded', 'success');
}

async function exportCompareExcel() {
  const wb = XLSX.utils.book_new();
  const rows = [
    'BOQ Value','Purchases','Payroll','Direct Costs',
    'Indirect Costs','GOCI','Total Costs','Net Margin','Margin %'
  ];
  const ac = Math.max(projects.length, 1);
  const allData = await Promise.all(projects.map(async p => {
    const pid = p.id;
    const [boq,pur,pay,dir,ind,goc] = await Promise.all([
    sb.from('apm_boq').select('qty,unit_rate').eq('project_id',pid),
    sb.from('apm_purchases').select('amount').eq('project_id',pid),
    sb.from('apm_payroll').select('amount').eq('project_id',pid),
    sb.from('apm_direct_costs').select('amount').eq('project_id',pid),
    sb.from('apm_indirect_costs').select('amount'),
    sb.from('apm_goci').select('amount').eq('project_id',pid)
    ]);
    const tBOQ=(boq.data||[]).reduce(
    (a,b)=>a+(b.qty||0)*(b.unit_rate||0),0);
    const tPur=sum(pur.data||[],'amount'),tPay=sum(pay.data||[],'amount');
    const tDir=sum(dir.data||[],'amount');
    const tInd=sum(ind.data||[],'amount')/ac;
    const tGoc=sum(goc.data||[],'amount');
    const tCosts=tPur+tPay+tDir+tInd+tGoc;
    const margin=tBOQ-tCosts;
    return [tBOQ,tPur,tPay,tDir,tInd,tGoc,tCosts,margin,
    tBOQ>0?((margin/tBOQ)*100).toFixed(1)+'%':'--'];
  }));
  const ws = XLSX.utils.aoa_to_sheet([
    ['Category', ...projects.map(p => p.name)],
    ...rows.map((l, i) => [l, ...allData.map(d => d[i])])
  ]);
  XLSX.utils.book_append_sheet(wb, ws, 'Comparison');
  XLSX.writeFile(wb, 'APM_Comparison.xlsx');
  showToast('Excel downloaded', 'success');
}

async function loadDashboard() {
  if (!currentProjectId || !sb) return;
  const pid = currentProjectId;
  const ac = Math.max(projects.length, 1);
  const [boq, pur, pay, dir, ind, goc, prs] = await Promise.all([
    sb.from('apm_boq').select('qty,unit_rate').eq('project_id', pid),
    sb.from('apm_purchases').select('amount').eq('project_id', pid),
    sb.from('apm_payroll').select('amount').eq('project_id', pid),
    sb.from('apm_direct_costs').select('amount').eq('project_id', pid),
    sb.from('apm_indirect_costs').select('amount'),
    sb.from('apm_goci').select('amount').eq('project_id', pid),
    sb.from('apm_purchase_requests').select('status').eq('project_id', pid)
  ]);
  const tBOQ = (boq.data || []).reduce(
    (a, b) => a + (b.qty || 0) * (b.unit_rate || 0), 0);
  const tPur = sum(pur.data || [], 'amount');
  const tPay = sum(pay.data || [], 'amount');
  const tDir = sum(dir.data || [], 'amount');
  const tInd = sum(ind.data || [], 'amount') / ac;
  const tGoc = sum(goc.data || [], 'amount');
  const tCosts = tPur + tPay + tDir + tInd + tGoc;
  const margin = tBOQ - tCosts;
  const pct = tBOQ > 0 ? ((margin / tBOQ) * 100).toFixed(1) : '0.0';
  const pending = (prs.data || []).filter(r => r.status === 'submitted').length;
  dashData = { tBOQ, tPur, tPay, tDir, tInd, tGoc, tCosts, margin, pct };

  document.getElementById('sumBOQ').textContent = sar(tBOQ);
  document.getElementById('sumCosts').textContent = sar(tCosts);
  document.getElementById('sumMargin').textContent = sar(margin);
  document.getElementById('sumMarginPct').textContent = pct + '%';
  document.getElementById('sumMargin').style.color =
    margin >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('sumMarginPct').style.color =
    margin >= 0 ? 'var(--blue)' : 'var(--red)';
  const pEl = document.getElementById('sumPending');
  if (pEl) pEl.textContent = pending;

  document.getElementById('brPurchases').textContent = sar(tPur);
  document.getElementById('brPayroll').textContent = sar(tPay);
  document.getElementById('brDirect').textContent = sar(tDir);
  document.getElementById('brIndirect').textContent = sar(tInd);
  document.getElementById('brGOCI').textContent = sar(tGoc);

  if (tCosts > 0) {
    document.getElementById('barPurchases').style.width =
    ((tPur / tCosts) * 100) + '%';
    document.getElementById('barPayroll').style.width =
    ((tPay / tCosts) * 100) + '%';
    document.getElementById('barDirect').style.width =
    ((tDir / tCosts) * 100) + '%';
    document.getElementById('barIndirect').style.width =
    ((tInd / tCosts) * 100) + '%';
    document.getElementById('barGOCI').style.width =
    ((tGoc / tCosts) * 100) + '%';
  }

  const p = projects.find(x => x.id === pid) || {};
  const bva = [
    { l: 'Purchases', b: p.budget_purchases || 0, a: tPur, c: 'var(--teal)' },
    { l: 'Payroll', b: p.budget_payroll || 0, a: tPay, c: 'var(--green)' },
    { l: 'Direct', b: p.budget_direct || 0, a: tDir, c: 'var(--blue)' },
    { l: 'Indirect', b: p.budget_indirect || 0, a: tInd, c: 'var(--amber)' },
    { l: 'GOCI', b: p.budget_goci || 0, a: tGoc, c: 'var(--purple)' },
  ];
  const grid = document.getElementById('bvaGrid');
  if (grid) {
    grid.innerHTML = bva.map(x => {
    const pct2 = x.b > 0 ? Math.min((x.a / x.b) * 100, 100) : 0;
    const ov = x.b > 0 && x.a > x.b;
    const col = ov ? 'var(--red)' : x.c;
    return '<div class="bva-card">' +
    '<div class="bva-label">' + x.l + '</div>' +
    '<div class="bva-row"><span class="k">Budget</span>' +
    '<span class="v">' + sar(x.b) + '</span></div>' +
    '<div class="bva-row"><span class="k">Actual</span>' +
    '<span class="v" style="color:' + col + '">' + sar(x.a) + '</span></div>' +
    '<div class="bva-row"><span class="k">Remaining</span>' +
    '<span class="v" style="color:' +
    (ov ? 'var(--red)' : 'var(--green)') + '">' +
    sar(x.b - x.a) + '</span></div>' +
    '<div class="bva-bar-wrap"><div class="bva-bar" style="width:' +
    pct2 + '%;background:' + col + '"></div></div>' +
    '</div>';
    }).join('');
  }

  const alertEl = document.getElementById('costAlerts');
  if (alertEl) {
    const alerts = [];
    bva.forEach(x => {
    if (x.b <= 0) return;
    const pct3 = (x.a / x.b) * 100;
    if (pct3 >= 100) {
    alerts.push({
    type: 'error',
    msg: x.l + ' is over budget by ' + sar(x.a - x.b) +
    ' (' + pct3.toFixed(0) + '% of budget used)'
    });
    } else if (pct3 >= 80) {
    alerts.push({
    type: 'warning',
    msg: x.l + ' has used ' + pct3.toFixed(0) +
    '% of its budget -- ' + sar(x.b - x.a) + ' remaining'
    });
    }
    });
    if (tCosts > 0 && tBOQ > 0 && tCosts > tBOQ) {
    alerts.push({
    type: 'error',
    msg: 'Total costs exceed BOQ value by ' + sar(tCosts - tBOQ) +
    ' -- project is running at a loss'
    });
    }
    if (margin > 0 && pct < 10 && tBOQ > 0) {
    alerts.push({
    type: 'warning',
    msg: 'Margin is very low at ' + pct +
    '% -- consider reviewing costs'
    });
    }
    if (!alerts.length) {
    alertEl.innerHTML = '';
    } else {
    alertEl.innerHTML = alerts.map(a => {
    const bg = a.type === 'error'
    ? 'var(--red-bg)' : 'var(--amber-bg)';
    const border = a.type === 'error'
    ? 'rgba(224,92,92,0.25)' : 'rgba(224,164,92,0.25)';
    const col = a.type === 'error'
    ? 'var(--red)' : 'var(--amber)';
    const icon = a.type === 'error' ? '!' : '~';
    return '<div style="background:' + bg + ';border:1px solid ' +
    border + ';border-radius:var(--radius-sm);padding:10px 14px;' +
    'font-size:13px;color:' + col + ';margin-bottom:8px;' +
    'display:flex;align-items:center;gap:10px;">' +
    '<span style="font-weight:700;font-size:15px;">' + icon + '</span>' +
    a.msg + '</div>';
    }).join('');
    }
  }
}

async function loadBOQ() {
  if (!currentProjectId || !sb) return;
  const { data } = await sb.from('apm_boq').select('*').eq('project_id', currentProjectId).order('created_at');
  const tbody = document.getElementById('boqTableBody');
  const tfoot = document.getElementById('boqTfoot');
  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No BOQ items yet.</td></tr>';
    tfoot.style.display = 'none'; return;
  }
  tfoot.style.display = '';
  let total = 0;
  tbody.innerHTML = data.map((r, i) => {
    const t = (r.qty || 0) * (r.unit_rate || 0);
    total += t;
    const rd = JSON.stringify(r).replace(/"/g, '&quot;');
    return '<tr>' +
    '<td>' + (i+1) + '</td>' +
    '<td>' + r.description + '</td>' +
    '<td>' + (r.unit || '--') + '</td>' +
    '<td class="td-right td-mono">' +
    (r.qty||0).toLocaleString('en-SA') + '</td>' +
    '<td class="td-right td-mono">' + sar(r.unit_rate||0) + '</td>' +
    '<td class="td-right td-mono" style="color:var(--accent)">' +
    sar(t) + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" ' +
    'onclick="editBOQ(' + rd + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(\'apm_boq\',\'' + r.id + '\',loadBOQ)">x</button>' +
    '</td></tr>';
  }).join('');
  document.getElementById('boqTotal').textContent = sar(total);
}

function editBOQ(r) {
  document.getElementById('boqEditId').value = r.id;
  document.getElementById('boqDesc').value = r.description || '';
  document.getElementById('boqUnit').value = r.unit || '';
  document.getElementById('boqQty').value = r.qty || '';
  document.getElementById('boqRate').value = r.unit_rate || '';
  document.getElementById('boqNotes').value = r.notes || '';
  calcBOQTotal();
  openModal('boqModal');
}

async function saveBOQ() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const desc = document.getElementById('boqDesc').value.trim();
  if (!desc) { showToast('Description required', 'error'); return; }
  const editId = document.getElementById('boqEditId')?.value || '';
  const payload = {
    project_id: currentProjectId,
    description: desc,
    unit: document.getElementById('boqUnit').value,
    qty: parseFloat(document.getElementById('boqQty').value) || 0,
    unit_rate: parseFloat(document.getElementById('boqRate').value) || 0,
    notes: document.getElementById('boqNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_boq').update(payload).eq('id', editId)
    : await sb.from('apm_boq').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('boqEditId'))
    document.getElementById('boqEditId').value = '';
  closeModal('boqModal');
  showToast('BOQ item saved', 'success');
  loadBOQ();
}

async function loadPurchases() {
  if (!currentProjectId || !sb) return;
  const f = getFilter('pur');
  let q = sb.from('apm_purchases').select('*')
    .eq('project_id', currentProjectId)
    .order('entry_date', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const { data } = await q;
  const tbody = document.getElementById('purchasesTableBody');
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="7">No purchases yet.</td></tr>';
    ['pCash','pTransfer','pTotal'].forEach(
    id => document.getElementById(id).textContent = 'SAR 0.00');
    return;
  }
  document.getElementById('pCash').textContent =
    sar(sum(data.filter(r => r.payment_method === 'cash'), 'amount'));
  document.getElementById('pTransfer').textContent =
    sar(sum(data.filter(r => r.payment_method === 'transfer'), 'amount'));
  document.getElementById('pTotal').textContent = sar(sum(data, 'amount'));
  tbody.innerHTML = data.map(r => '<tr>' +
    '<td>' + r.entry_date + '</td>' +
    '<td>' + r.description + '</td>' +
    '<td>' + (r.supplier || '--') + '</td>' +
    '<td><span class="badge badge-purchase">' + r.payment_method + '</span></td>' +
    '<td class="td-right td-mono" style="color:var(--teal)">' +
    sar(r.amount) + '</td>' +
    '<td style="font-size:12px;color:var(--text2)">' +
    (r.remarks || r.notes || '--') + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" onclick="editPurchase(' +
    JSON.stringify(r).replace(/"/g, '&quot;') + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(&quot;apm_purchases&quot;,&quot;' + r.id + '&quot;,loadPurchases)">x</button>' +
    '</td></tr>'
  ).join('');
}

function editPurchase(r) {
  document.getElementById('purEditId').value = r.id;
  document.getElementById('purDate').value = r.entry_date || '';
  document.getElementById('purDesc').value = r.description || '';
  document.getElementById('purSupplier').value = r.supplier || '';
  document.getElementById('purMethod').value = r.payment_method || 'cash';
  document.getElementById('purAmount').value = r.amount || '';
  document.getElementById('purRef').value = r.ref_no || '';
  document.getElementById('purNotes').value = r.remarks || r.notes || '';
  openModal('purchaseModal');
}

async function savePurchase() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const amt = parseFloat(document.getElementById('purAmount').value);
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const editId = document.getElementById('purEditId')?.value || '';
  const payload = {
    project_id: currentProjectId,
    entry_date: document.getElementById('purDate').value ||
    new Date().toISOString().split('T')[0],
    description: document.getElementById('purDesc').value,
    supplier: document.getElementById('purSupplier').value,
    payment_method: document.getElementById('purMethod').value,
    amount: amt,
    ref_no: document.getElementById('purRef').value,
    notes: document.getElementById('purNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_purchases').update(payload).eq('id', editId)
    : await sb.from('apm_purchases').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('purEditId'))
    document.getElementById('purEditId').value = '';
  closeModal('purchaseModal');
  showToast('Purchase saved', 'success');
  loadPurchases();
}

async function loadPayroll() {
  if (!currentProjectId || !sb) return;
  const f = getFilter('pay');
  let q = sb.from('apm_payroll').select('*')
    .eq('project_id', currentProjectId)
    .order('entry_date', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const { data } = await q;
  const tbody = document.getElementById('payrollTableBody');
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="7">No payroll entries yet.</td></tr>';
    ['paySalary','payOvertime','payMedical','payTermination'].forEach(
    id => document.getElementById(id).textContent = 'SAR 0.00');
    return;
  }
  document.getElementById('paySalary').textContent =
    sar(sum(data.filter(r => r.pay_type === 'salary'), 'amount'));
  document.getElementById('payOvertime').textContent =
    sar(sum(data.filter(r => r.pay_type === 'overtime'), 'amount'));
  document.getElementById('payMedical').textContent =
    sar(sum(data.filter(r => r.pay_type === 'medical_insurance'), 'amount'));
  document.getElementById('payTermination').textContent =
    sar(sum(data.filter(r => r.pay_type === 'termination'), 'amount'));
  const tl = {
    salary: 'Salary', overtime: 'Overtime',
    medical_insurance: 'Medical Ins.', termination: 'Termination', other: 'Other'
  };
  tbody.innerHTML = data.map(r =>
    '<tr><td>' + r.entry_date + '</td><td>' + r.employee + '</td>' +
    '<td><span class="badge badge-payroll">' + (tl[r.pay_type] || r.pay_type) +
    '</span></td><td>' + r.payment_method + '</td>' +
    '<td class="td-right td-mono" style="color:var(--green)">' +
    sar(r.amount) + '</td>' +
    '<td style="font-size:12px;color:var(--text2)">' +
    (r.notes || '--') + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" onclick="editPayroll(' +
    JSON.stringify(r).replace(/"/g, '&quot;') + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(&quot;apm_payroll&quot;,&quot;' + r.id + '&quot;,loadPayroll)">x</button></td></tr>'
  ).join('');
}

function editPayroll(r) {
  document.getElementById('payEditId').value = r.id;
  document.getElementById('payDate').value = r.entry_date || '';
  document.getElementById('payEmployee').value = r.employee || '';
  document.getElementById('payType').value = r.pay_type || 'salary';
  document.getElementById('payMethod').value = r.payment_method || 'bank';
  document.getElementById('payAmount').value = r.amount || '';
  document.getElementById('payNotes').value = r.notes || '';
  openModal('payrollModal');
}

async function savePayroll() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const amt = parseFloat(document.getElementById('payAmount').value);
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const editId = document.getElementById('payEditId')?.value || '';
  const payload = {
    project_id: currentProjectId,
    entry_date: document.getElementById('payDate').value ||
    new Date().toISOString().split('T')[0],
    employee: document.getElementById('payEmployee').value,
    pay_type: document.getElementById('payType').value,
    payment_method: document.getElementById('payMethod').value,
    amount: amt,
    notes: document.getElementById('payNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_payroll').update(payload).eq('id', editId)
    : await sb.from('apm_payroll').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('payEditId'))
    document.getElementById('payEditId').value = '';
  closeModal('payrollModal');
  showToast('Payroll saved', 'success');
  loadPayroll();
}

async function loadDirect() {
  if (!currentProjectId || !sb) return;
  const f = getFilter('dir');
  let q = sb.from('apm_direct_costs').select('*')
    .eq('project_id', currentProjectId)
    .order('entry_date', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const { data } = await q;
  const tbody = document.getElementById('directTableBody');
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="7">No direct cost entries.</td></tr>';
    ['dirCommission','dirEngineering','dirFood','dirTransport'].forEach(
    id => document.getElementById(id).textContent = 'SAR 0.00');
    return;
  }
  document.getElementById('dirCommission').textContent =
    sar(sum(data.filter(r => r.category === 'commission'), 'amount'));
  document.getElementById('dirEngineering').textContent =
    sar(sum(data.filter(r => r.category === 'engineering'), 'amount'));
  document.getElementById('dirFood').textContent =
    sar(sum(data.filter(r => r.category === 'food'), 'amount'));
  document.getElementById('dirTransport').textContent =
    sar(sum(data.filter(r => r.category === 'transportation'), 'amount'));
  const cl = {
    commission: 'Commission', engineering: 'Engineering',
    food: 'Food', transportation: 'Transport', other: 'Other'
  };
  tbody.innerHTML = data.map(r =>
    '<tr><td>' + r.entry_date + '</td><td>' + r.description + '</td>' +
    '<td><span class="badge badge-direct">' + (cl[r.category] || r.category) +
    '</span></td><td>' + r.payment_method + '</td>' +
    '<td class="td-right td-mono" style="color:var(--blue)">' +
    sar(r.amount) + '</td>' +
    '<td style="font-size:12px;color:var(--text2)">' +
    (r.notes || '--') + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" onclick="editDirect(' +
    JSON.stringify(r).replace(/"/g, '&quot;') + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(&quot;apm_direct_costs&quot;,&quot;' + r.id + '&quot;,loadDirect)">x</button></td></tr>'
  ).join('');
}

function editDirect(r) {
  document.getElementById('dirEditId').value = r.id;
  document.getElementById('dirDate').value = r.entry_date || '';
  document.getElementById('dirDesc').value = r.description || '';
  document.getElementById('dirCategory').value = r.category || 'commission';
  document.getElementById('dirMethod').value = r.payment_method || 'cash';
  document.getElementById('dirAmount').value = r.amount || '';
  document.getElementById('dirNotes').value = r.notes || '';
  openModal('directModal');
}

async function saveDirectCost() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const amt = parseFloat(document.getElementById('dirAmount').value);
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const editId = document.getElementById('dirEditId')?.value || '';
  const payload = {
    project_id: currentProjectId,
    entry_date: document.getElementById('dirDate').value ||
    new Date().toISOString().split('T')[0],
    description: document.getElementById('dirDesc').value,
    category: document.getElementById('dirCategory').value,
    payment_method: document.getElementById('dirMethod').value,
    amount: amt,
    notes: document.getElementById('dirNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_direct_costs').update(payload).eq('id', editId)
    : await sb.from('apm_direct_costs').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('dirEditId'))
    document.getElementById('dirEditId').value = '';
  closeModal('directModal');
  showToast('Direct cost saved', 'success');
  loadDirect();
}

async function loadIndirect() {
  if (!currentProjectId || !sb) return;
  const ac = Math.max(projects.length, 1);
  const f = getFilter('ind');
  let q = sb.from('apm_indirect_costs').select('*')
    .order('entry_date', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const { data } = await q;
  const tbody = document.getElementById('indirectTableBody');
  const info = document.getElementById('indirectSplitInfo');
  if (info) {
    info.style.display = 'block';
    info.textContent = 'Costs split equally across ' + ac +
    ' active project' + (ac > 1 ? 's' : '') +
    '. Each project pays 1/' + ac + ' of each entry.';
  }
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="7">No entries yet.</td></tr>';
    ['indElec','indWater','indRent'].forEach(
    id => document.getElementById(id).textContent = 'SAR 0.00');
    return;
  }
  const share = r => r.amount / ac;
  document.getElementById('indElec').textContent =
    sar(data.filter(r => r.category === 'electricity').reduce(
    (a, r) => a + share(r), 0));
  document.getElementById('indWater').textContent =
    sar(data.filter(r => r.category === 'water').reduce(
    (a, r) => a + share(r), 0));
  document.getElementById('indRent').textContent =
    sar(data.filter(r => r.category === 'rent').reduce(
    (a, r) => a + share(r), 0));
  const cl = {
    electricity: 'Electricity', water: 'Water',
    rent: 'Factory Rent', maintenance: 'Maintenance', other: 'Other'
  };
  tbody.innerHTML = data.map(r =>
    '<tr><td>' + r.entry_date + '</td><td>' + r.description + '</td>' +
    '<td><span class="badge badge-indirect">' + (cl[r.category] || r.category) +
    '</span></td>' +
    '<td class="td-mono">' + sar(r.amount) + '</td>' +
    '<td style="font-size:12px;color:var(--text3)">/ ' + ac + '</td>' +
    '<td class="td-right td-mono" style="color:var(--amber)">' +
    sar(share(r)) + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" onclick="editIndirect(' +
    JSON.stringify(r).replace(/"/g, '&quot;') + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(&quot;apm_indirect_costs&quot;,&quot;' + r.id + '&quot;,loadIndirect)">x</button></td></tr>'
  ).join('');
}

function editIndirect(r) {
  document.getElementById('indEditId').value = r.id;
  document.getElementById('indDate').value = r.entry_date || '';
  document.getElementById('indDesc').value = r.description || '';
  document.getElementById('indCategory').value = r.category || 'electricity';
  document.getElementById('indMethod').value = r.payment_method || 'cash';
  document.getElementById('indAmount').value = r.amount || '';
  document.getElementById('indNotes').value = r.notes || '';
  openModal('indirectModal');
}

async function saveIndirectCost() {
  const amt = parseFloat(document.getElementById('indAmount').value);
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const editId = document.getElementById('indEditId')?.value || '';
  const payload = {
    entry_date: document.getElementById('indDate').value ||
    new Date().toISOString().split('T')[0],
    description: document.getElementById('indDesc').value,
    category: document.getElementById('indCategory').value,
    payment_method: document.getElementById('indMethod').value,
    amount: amt,
    notes: document.getElementById('indNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_indirect_costs').update(payload).eq('id', editId)
    : await sb.from('apm_indirect_costs').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('indEditId'))
    document.getElementById('indEditId').value = '';
  closeModal('indirectModal');
  showToast('Indirect cost saved -- split across ' + projects.length +
    ' projects', 'success');
  loadIndirect();
}

async function loadGOCI() {
  if (!currentProjectId || !sb) return;
  const f = getFilter('goc');
  let q = sb.from('apm_goci').select('*')
    .eq('project_id', currentProjectId)
    .order('entry_date', { ascending: false });
  if (f.from) q = q.gte('entry_date', f.from);
  if (f.to) q = q.lte('entry_date', f.to);
  const { data } = await q;
  const tbody = document.getElementById('gociTableBody');
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="7">No GOCI entries yet.</td></tr>';
    ['gociFees','gociPapers','gociTotal'].forEach(
    id => document.getElementById(id).textContent = 'SAR 0.00');
    return;
  }
  document.getElementById('gociFees').textContent =
    sar(sum(data.filter(r => r.category === 'government_fees'), 'amount'));
  document.getElementById('gociPapers').textContent =
    sar(sum(data.filter(r => r.category === 'official_papers'), 'amount'));
  document.getElementById('gociTotal').textContent = sar(sum(data, 'amount'));
  const cl = {
    government_fees: 'Gov. Fees', official_papers: 'Official Papers',
    municipality: 'Municipality', chamber: 'Chamber', other: 'Other'
  };
  tbody.innerHTML = data.map(r =>
    '<tr><td>' + r.entry_date + '</td><td>' + r.description + '</td>' +
    '<td><span class="badge badge-goci">' + (cl[r.category] || r.category) +
    '</span></td><td>' + (r.ref_no || '--') + '</td>' +
    '<td class="td-right td-mono" style="color:var(--purple)">' +
    sar(r.amount) + '</td>' +
    '<td style="font-size:12px;color:var(--text2)">' +
    (r.notes || '--') + '</td>' +
    '<td style="display:flex;gap:4px">' +
    '<button class="btn btn-sm btn-icon" onclick="editGOCI(' +
    JSON.stringify(r).replace(/"/g, '&quot;') + ')">e</button>' +
    '<button class="btn btn-danger btn-sm btn-icon" ' +
    'onclick="deleteRow(&quot;apm_goci&quot;,&quot;' + r.id + '&quot;,loadGOCI)">x</button></td></tr>'
  ).join('');
}

function editGOCI(r) {
  document.getElementById('gocEditId').value = r.id;
  document.getElementById('gociDate').value = r.entry_date || '';
  document.getElementById('gociDesc').value = r.description || '';
  document.getElementById('gociCategory').value =
    r.category || 'government_fees';
  document.getElementById('gociRef').value = r.ref_no || '';
  document.getElementById('gociAmount').value = r.amount || '';
  document.getElementById('gociNotes').value = r.notes || '';
  openModal('gociModal');
}

async function saveGOCI() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const amt = parseFloat(document.getElementById('gociAmount').value);
  if (!amt || amt <= 0) { showToast('Enter a valid amount', 'error'); return; }
  const editId = document.getElementById('gocEditId')?.value || '';
  const payload = {
    project_id: currentProjectId,
    entry_date: document.getElementById('gociDate').value ||
    new Date().toISOString().split('T')[0],
    description: document.getElementById('gociDesc').value,
    category: document.getElementById('gociCategory').value,
    ref_no: document.getElementById('gociRef').value,
    amount: amt,
    notes: document.getElementById('gociNotes').value
  };
  const { error } = editId
    ? await sb.from('apm_goci').update(payload).eq('id', editId)
    : await sb.from('apm_goci').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  if (document.getElementById('gocEditId'))
    document.getElementById('gocEditId').value = '';
  closeModal('gociModal');
  showToast('GOCI saved', 'success');
  loadGOCI();
}

function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
  }
});

let toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  setTheme(next);
}
function setTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const btn = document.getElementById('themeBtn');
  if (btn) btn.textContent = t === 'dark' ? ' Light' : ' Dark';
  localStorage.setItem('apm_theme', t);
}

(function() {
  const saved = localStorage.getItem('apm_theme') || 'dark';
  setTheme(saved);
})();

async function loadRemarks() {
  if (!currentProjectId || !sb) return;
  const { data } = await sb.from('apm_remarks').select('*').eq('project_id', currentProjectId).order('created_at', { ascending: false });
  const tbody = document.getElementById('remarksTableBody');
  if (!tbody) return;
  if (!data || !data.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No remarks yet.</td></tr>'; return; }
  const cats = { purchase:'Purchase', payroll:'Payroll', direct:'Direct Cost', indirect:'Indirect Cost', goci:'GOCI', purchase_request:'Purchase Request', general:'General' };
  tbody.innerHTML = data.map(r => `<tr>
    <td>${r.entry_date || r.created_at?.split('T')[0] || '--'}</td>
    <td><span class="badge badge-indirect">${cats[r.category] || r.category}</span></td>
    <td style="font-size:12px">${r.ref || '--'}</td>
    <td>${r.written_by || '--'}</td>
    <td>${r.remark_text}</td>
    <td><button class="btn btn-danger btn-sm btn-icon" onclick="deleteRow('apm_remarks','${r.id}',loadRemarks)"></button></td>
  </tr>`).join('');
}
async function saveRemark() {
  if (!currentProjectId) { showToast('Select a project first', 'error'); return; }
  const text = document.getElementById('remText').value.trim();
  if (!text) { showToast('Remark text required', 'error'); return; }
  const { error } = await sb.from('apm_remarks').insert({
    project_id: currentProjectId,
    entry_date: document.getElementById('remDate').value || today(),
    category: document.getElementById('remCategory').value,
    ref: document.getElementById('remRef').value,
    written_by: document.getElementById('remBy').value,
    remark_text: text
  });
  if (error) { showToast(error.message, 'error'); return; }
  closeModal('remarkModal'); showToast('Remark saved', 'success'); loadRemarks();
}

async function loadPurchaseRequests() {
  if (!sb) return;
  const filt = document.getElementById('prFilter')?.value || '';
  let q = sb.from('apm_purchase_requests').select('*').order('created_at', { ascending: false });
  if (currentProjectId) q = q.eq('project_id', currentProjectId);
  if (filt) q = q.eq('status', filt);
  const { data } = await q; const rows = data || [];
  const setC = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setC('prDraft', rows.filter(r => r.status === 'draft').length);
  setC('prSubmitted', rows.filter(r => r.status === 'submitted').length);
  setC('prApproved', rows.filter(r => r.status === 'approved').length);
  setC('prRejected', rows.filter(r => r.status === 'rejected').length);
  setC('prPurchased', rows.filter(r => r.status === 'purchased').length);
  const flags = rows.filter(r => r.amount > 50000 && r.status === 'submitted')
    .map(r => `<div style="background:rgba(224,122,92,0.1);
    border:1px solid rgba(224,122,92,0.2);border-radius:6px;
    padding:8px 12px;font-size:12px;color:#e07a5c;margin-bottom:8px;"> Large request ${sar(r.amount)} from "${r.supplier || 'unknown'}" -- consider getting a second quote.</div>`);
  const flagEl = document.getElementById('prAIFlags');
  if (flagEl) flagEl.innerHTML = flags.join('');
  const tbody = document.getElementById('prTableBody');
  if (!tbody) return;
  if (!rows.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No purchase requests yet.</td></tr>'; return; }
  const bc = { draft:'badge-draft', submitted:'badge-submitted', approved:'badge-approved', rejected:'badge-rejected', purchased:'badge-purchased' };
  const proj = projects.find(p => p.id === currentProjectId) || {};
  const tierLbl = r => {
    if (r.amount <= (proj.tier1_max || 0)) return proj.tier1_name || 'Tier 1';
    if (r.amount <= (proj.tier2_max || 0)) return proj.tier2_name || 'Tier 2';
    return proj.tier3_name || 'Tier 3';
  };
  tbody.innerHTML = rows.map(r => `<tr>
    <td>${r.entry_date || '--'}</td><td>${r.description}</td><td>${r.supplier || '--'}</td>
    <td style="font-size:12px">${tierLbl(r)}</td>
    <td class="td-right td-mono">${sar(r.amount)}</td>
    <td><span class="badge ${bc[r.status] || ''}">${r.status}</span></td>
    <td><button class="btn btn-sm btn-icon" onclick="openPRDetail('${r.id}')"></button>
    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteRow('apm_purchase_requests','${r.id}',loadPurchaseRequests)"></button></td>
  </tr>`).join('');
}
async function savePR() {
  if (!currentProjectId) { showToast('Select a project first', 'error'); return; }
  const desc = document.getElementById('prDesc').value.trim();
  if (!desc) { showToast('Description required', 'error'); return; }
  const qty = parseFloat(document.getElementById('prQty').value) || 1;
  const unitPrice = parseFloat(document.getElementById('prUnitPrice').value) || 0;
  const editId = document.getElementById('prEditId').value;
  const payload = {
    project_id: currentProjectId,
    entry_date: document.getElementById('prDate').value || today(),
    supplier: document.getElementById('prSupplier').value,
    description: desc, qty, unit_price: unitPrice, amount: qty * unitPrice,
    reason: document.getElementById('prReason').value, status: 'draft'
  };
  const { error } = editId ? await sb.from('apm_purchase_requests').update(payload).eq('id', editId) : await sb.from('apm_purchase_requests').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  document.getElementById('prEditId').value = '';
  closeModal('prModal'); showToast('Saved as draft', 'success'); loadPurchaseRequests();
}
async function openPRDetail(id) {
  const { data: r } = await sb.from('apm_purchase_requests').select('*').eq('id', id).single();
  if (!r) return;
  document.getElementById('prEditId').value = id;
  document.getElementById('prModalTitle').textContent = 'Purchase Request -- ' + r.description;
  document.getElementById('prDate').value = r.entry_date || '';
  document.getElementById('prSupplier').value = r.supplier || '';
  document.getElementById('prDesc').value = r.description || '';
  document.getElementById('prQty').value = r.qty || 1;
  document.getElementById('prUnitPrice').value = r.unit_price || 0;
  document.getElementById('prTotal').value = sar(r.amount);
  document.getElementById('prReason').value = r.reason || '';
  document.getElementById('prStepsDisplay').style.display = 'block';
  const steps = ['draft','submitted','approved','purchased'];
  const order = steps.indexOf(r.status);
  steps.forEach((s, i) => {
    const el = document.getElementById('step-' + s); if (!el) return;
    el.className = 'step' + (i < order ? ' done' : i === order ? ' active' : '');
    if (r.status === 'rejected' && s === 'approved') el.className = 'step rejected';
  });
  const ab = document.getElementById('prActionBtns');
  document.getElementById('prActionArea').style.display = 'block';
  document.getElementById('prRemarkArea').style.display = 'block';
  ab.innerHTML = '';
  if (r.status === 'draft') ab.innerHTML = '<button class="btn btn-primary btn-sm" onclick="updatePRStatus(\'submitted\')">Submit for Approval</button>';
  else if (r.status === 'submitted') ab.innerHTML =
    '<button class="btn btn-success btn-sm" onclick="updatePRStatus(\'approved\')"> Approve</button> ' +
    '<button class="btn btn-danger btn-sm" onclick="updatePRStatus(\'rejected\')"> Reject</button>';
  else if (r.status === 'approved') ab.innerHTML = '<button class="btn btn-primary btn-sm" onclick="updatePRStatus(\'purchased\')">Mark as Purchased</button>';
  else ab.innerHTML = `<span style="font-size:12px;color:var(--text3)">Status: ${r.status} -- no further actions.</span>`;
  document.getElementById('prSaveBtn').style.display = r.status === 'draft' ? '' : 'none';
  openModal('prModal');
}
async function updatePRStatus(newStatus) {
  const id = document.getElementById('prEditId').value;
  const remark = document.getElementById('prApprovalRemark').value;
  const { error } = await sb.from('apm_purchase_requests').update({ status: newStatus, approval_remark: remark }).eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  if (newStatus === 'purchased') {
    const { data: r } = await sb.from('apm_purchase_requests').select('*').eq('id', id).single();
    if (r) await sb.from('apm_purchases').insert({
    project_id: r.project_id, entry_date: today(),
    description: r.description, supplier: r.supplier || '',
    payment_method: 'transfer', amount: r.amount,
    ref_no: 'PR-' + id.slice(0, 8),
    notes: 'Auto-created from approved purchase request'
    });
  }
  closeModal('prModal'); showToast('Status updated to ' + newStatus, 'success'); loadPurchaseRequests();
}
function calcPRTotal() {
  const q = parseFloat(document.getElementById('prQty')?.value) || 1;
  const u = parseFloat(document.getElementById('prUnitPrice')?.value) || 0;
  const el = document.getElementById('prTotal');
  if (el) el.value = sar(q * u);
}

async function loadSuppliers() {
  if (!sb) return;
  const { data: sups } = await sb.from('apm_suppliers').select('*').order('name');
  const { data: purs } = await sb.from('apm_purchases').select('supplier,amount,entry_date').order('entry_date', { ascending: false });
  const tbody = document.getElementById('supplierTableBody');
  if (!tbody) return;
  const flags = [];
  if (!sups || !sups.length) { tbody.innerHTML = '<tr class="empty-row"><td colspan="7">No suppliers yet.</td></tr>'; return; }
  tbody.innerHTML = sups.map(s => {
    const sp = (purs || []).filter(p => p.supplier && p.supplier.toLowerCase() === s.name.toLowerCase());
    const tot = sum(sp, 'amount'), last = sp[0]?.entry_date || '--';
    let trend = '--', tc = 'var(--text3)';
    if (sp.length >= 4) {
    const r = sp.slice(0, 3), o = sp.slice(3, 6);
    const ar = sum(r, 'amount') / r.length, ao = sum(o, 'amount') / o.length;
    const df = ((ar - ao) / ao) * 100;
    if (df > 15) { trend = ' +' + df.toFixed(0) + '%'; tc = 'var(--red)'; flags.push(` "${s.name}" prices up ~${df.toFixed(0)}% -- consider requesting a new quote.`); }
    else if (df < -10) { trend = ' ' + df.toFixed(0) + '%'; tc = 'var(--green)'; }
    else { trend = 'Stable'; tc = 'var(--text2)'; }
    }
    return `<tr>
    <td style="font-weight:500">${s.name}</td><td>${s.category || '--'}</td><td>${s.contact || '--'}</td>
    <td style="color:${tc}">${trend}</td><td>${last}</td>
    <td class="td-right td-mono">${sar(tot)}</td>
    <td><button class="btn btn-sm btn-icon" onclick="editSupplier('${s.id}')"></button>
    <button class="btn btn-danger btn-sm btn-icon" onclick="deleteRow('apm_suppliers','${s.id}',loadSuppliers)"></button></td>
    </tr>`;
  }).join('');
  const flagEl = document.getElementById('supplierAIFlags');
  if (flagEl) flagEl.innerHTML = flags.map(f => `<div style="background:rgba(224,122,92,0.1);
    border:1px solid rgba(224,122,92,0.2);border-radius:6px;
    padding:8px 12px;font-size:12px;color:#e07a5c;margin-bottom:8px;"> ${f}</div>`).join('');
}
async function saveSupplier() {
  const name = document.getElementById('supName').value.trim();
  if (!name) { showToast('Name required', 'error'); return; }
  const editId = document.getElementById('supEditId').value;
  const payload = {
    name,
    category: document.getElementById('supCategory').value,
    contact: document.getElementById('supContact').value,
    phone: document.getElementById('supPhone').value,
    email: document.getElementById('supEmail').value,
    payment_terms: document.getElementById('supTerms').value,
    notes: document.getElementById('supNotes').value
  };
  const { error } = editId ? await sb.from('apm_suppliers').update(payload).eq('id', editId) : await sb.from('apm_suppliers').insert(payload);
  if (error) { showToast(error.message, 'error'); return; }
  document.getElementById('supEditId').value = '';
  closeModal('supplierModal'); showToast('Supplier saved', 'success'); loadSuppliers();
}
async function editSupplier(id) {
  const { data } = await sb.from('apm_suppliers').select('*').eq('id', id).single(); if (!data) return;
  document.getElementById('supEditId').value = id;
  document.getElementById('supName').value = data.name;
  document.getElementById('supCategory').value = data.category || 'materials';
  document.getElementById('supContact').value = data.contact || '';
  document.getElementById('supPhone').value = data.phone || '';
  document.getElementById('supEmail').value = data.email || '';
  document.getElementById('supTerms').value = data.payment_terms || 'cash';
  document.getElementById('supNotes').value = data.notes || '';
  openModal('supplierModal');
}

function sendWhatsApp() {
  if (!currentProjectId) { showToast('Select a project first', 'error'); return; }
  openModal('waModal');
}
function openWhatsApp() {
  const num = document.getElementById('waNumber').value.trim().replace(/\D/g, '');
  if (!num) { showToast('Enter a WhatsApp number', 'error'); return; }
  const proj = projects.find(p => p.id === currentProjectId) || {};
  const d = dashData;
  const proj_name = proj.name || '--';
  const msg = '*APM Metal Works -- Cost Summary*\n' +
    'Project: ' + proj_name + '\n\n' +
    'BOQ Value: ' + sar(d.tBOQ || 0) + '\n\nCosts:\n' +
    'Purchases: ' + sar(d.tPur || 0) + '\n' +
    'Payroll: ' + sar(d.tPay || 0) + '\n' +
    'Direct: ' + sar(d.tDir || 0) + '\n' +
    'Indirect: ' + sar(d.tInd || 0) + '\n' +
    'GOCI: ' + sar(d.tGoc || 0) + '\n\n' +
    'Total: ' + sar(d.tCosts || 0) + '\n' +
    'Margin: ' + sar(d.margin || 0) + ' (' + (d.pct || 0) + '%)';
  closeModal('waModal');
  window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
}

let importWorkbook = null;
let importRows = [];
let importHeaders = [];

const importSchema = {
  boq: [
    { field: 'description', label: 'Description', required: true },
    { field: 'unit', label: 'Unit' },
    { field: 'qty', label: 'Quantity' },
    { field: 'unit_rate', label: 'Unit Rate (SAR)' },
  ],
  purchases: [
    { field: 'entry_date', label: 'Date' },
    { field: 'description', label: 'Description', required: true },
    { field: 'supplier', label: 'Supplier' },
    { field: 'amount', label: 'Amount (SAR)', required: true },
    { field: 'payment_method', label: 'Payment Method' },
    { field: 'ref_no', label: 'Reference / Invoice No.' },
  ],
  payroll: [
    { field: 'entry_date', label: 'Date' },
    { field: 'employee', label: 'Employee Name', required: true },
    { field: 'pay_type', label: 'Type (salary/overtime/etc)' },
    { field: 'amount', label: 'Amount (SAR)', required: true },
    { field: 'payment_method', label: 'Payment Method' },
  ],
  direct: [
    { field: 'entry_date', label: 'Date' },
    { field: 'description', label: 'Description', required: true },
    { field: 'category', label: 'Category' },
    { field: 'amount', label: 'Amount (SAR)', required: true },
    { field: 'payment_method', label: 'Payment Method' },
  ],
  indirect: [
    { field: 'entry_date', label: 'Date' },
    { field: 'description', label: 'Description', required: true },
    { field: 'category', label: 'Category (electricity/water/rent)' },
    { field: 'amount', label: 'Amount (SAR)', required: true },
  ],
  goci: [
    { field: 'entry_date', label: 'Date' },
    { field: 'description', label: 'Description', required: true },
    { field: 'category', label: 'Category' },
    { field: 'ref_no', label: 'Reference No.' },
    { field: 'amount', label: 'Amount (SAR)', required: true },
  ],
};

function handleImportFile(file) {
  if (!file) return;
  const ext = file.name.split('.').pop().toLowerCase();
  document.getElementById('importFileName').textContent = file.name;
  if (ext === 'csv') {
    const reader = new FileReader();
    reader.onload = e => {
    const data = XLSX.read(e.target.result, { type: 'string' });
    importWorkbook = data;
    processWorkbook();
    };
    reader.readAsText(file);
  } else {
    const reader = new FileReader();
    reader.onload = e => {
    importWorkbook = XLSX.read(e.target.result, { type: 'array' });
    processWorkbook();
    };
    reader.readAsArrayBuffer(file);
  }
}

function processWorkbook() {
  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = 'block';
  const sheets = importWorkbook.SheetNames;
  const sel = document.getElementById('importSheetSelect');
  sel.innerHTML = sheets.map(
    s => '<option value="' + s + '">' + s + '</option>'
  ).join('');
  if (sheets.length > 1) {
    document.getElementById('importSheetSelector').style.display = 'block';
  }
  loadSheetData();

  const projSel = document.getElementById('importTargetProject');
  projSel.innerHTML = '<option value="">-- Select project --</option>' +
    projects.map(p =>
    '<option value="' + p.id + '">' + p.name + '</option>'
    ).join('');
}

function loadSheetData() {
  const sheetName = document.getElementById('importSheetSelect').value ||
    importWorkbook.SheetNames[0];
  const ws = importWorkbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!data || data.length < 2) {
    showToast('Sheet appears to be empty', 'error'); return;
  }
  importHeaders = data[0].map(h => String(h).trim());
  importRows = data.slice(1).filter(row =>
    row.some(cell => cell !== '' && cell !== null)
  );
  document.getElementById('importFileStats').textContent =
    importHeaders.length + ' columns, ' + importRows.length + ' rows found';
  buildColumnMapper();
}

function buildColumnMapper() {
  const type = document.getElementById('importDataType').value;
  if (!type) return;
  const schema = importSchema[type];
  const mapper = document.getElementById('importColumnMapper');
  const fields = document.getElementById('importMapperFields');
  mapper.style.display = 'block';
  fields.innerHTML = schema.map(s => {
    const best = importHeaders.findIndex(h =>
    h.toLowerCase().includes(s.field.toLowerCase()) ||
    s.field.toLowerCase().includes(h.toLowerCase()) ||
    h.toLowerCase().includes(s.label.toLowerCase().split(' ')[0])
    );
    const opts = '<option value="">-- skip --</option>' +
    importHeaders.map((h, i) =>
    '<option value="' + i + '"' + (i === best ? ' selected' : '') +
    '>' + h + '</option>'
    ).join('');
    return '<div class="field">' +
    '<label>' + s.label + (s.required ? ' *' : '') + '</label>' +
    '<select id="map_' + s.field + '" onchange="updatePreview()" ' +
    'style="background:var(--surface2);border:1px solid var(--border2);' +
    'color:var(--text);font-family:var(--font);font-size:13px;' +
    'padding:7px 11px;border-radius:var(--radius-sm);">' +
    opts + '</select></div>';
  }).join('');
  updatePreview();
}

function updatePreview() {
  const type = document.getElementById('importDataType').value;
  if (!type) return;
  const schema = importSchema[type];
  const mapped = schema.map(s => {
    const sel = document.getElementById('map_' + s.field);
    return { field: s.field, colIdx: sel ? parseInt(sel.value) : -1 };
  }).filter(m => !isNaN(m.colIdx) && m.colIdx >= 0);
  if (!mapped.length) return;
  const preview = importRows.slice(0, 5);
  const thead = document.getElementById('importPreviewHead');
  const tbody = document.getElementById('importPreviewBody');
  thead.innerHTML = '<tr>' +
    mapped.map(m => '<th>' + m.field + '</th>').join('') + '</tr>';
  tbody.innerHTML = preview.map(row =>
    '<tr>' + mapped.map(m =>
    '<td style="font-size:12px">' + (row[m.colIdx] || '--') + '</td>'
    ).join('') + '</tr>'
  ).join('');
  document.getElementById('importPreviewTitle').textContent =
    'Preview (first 5 rows)';
  document.getElementById('importPreviewCount').textContent =
    importRows.length + ' total rows will be imported';
  document.getElementById('importPreviewWrap').style.display = 'block';
}

async function runImport() {
  const type = document.getElementById('importDataType').value;
  const pid = document.getElementById('importTargetProject').value;
  if (!type) { showToast('Select data type', 'error'); return; }
  if (!pid) { showToast('Select a project', 'error'); return; }
  const schema = importSchema[type];
  const mapped = {};
  schema.forEach(s => {
    const sel = document.getElementById('map_' + s.field);
    if (sel && sel.value !== '') mapped[s.field] = parseInt(sel.value);
  });
  const tableMap = {
    boq: 'apm_boq', purchases: 'apm_purchases',
    payroll: 'apm_payroll', direct: 'apm_direct_costs',
    indirect: 'apm_indirect_costs', goci: 'apm_goci'
  };
  const table = tableMap[type];
  let count = 0, errors = 0;
  for (const row of importRows) {
    const record = { project_id: pid };
    schema.forEach(s => {
    if (mapped[s.field] !== undefined) {
    let val = row[mapped[s.field]];
    if (s.field === 'amount' || s.field === 'qty' ||
    s.field === 'unit_rate') {
    val = parseFloat(String(val).replace(/[^0-9.-]/g, '')) || 0;
    } else if (s.field === 'entry_date' && val) {
    if (typeof val === 'number') {
    const d = new Date(Math.round((val - 25569) * 86400 * 1000));
    val = d.toISOString().split('T')[0];
    } else {
    val = String(val).trim();
    }
    } else {
    val = String(val || '').trim();
    }
    record[s.field] = val;
    }
    });
    if (!record.entry_date && type !== 'boq') {
    record.entry_date = new Date().toISOString().split('T')[0];
    }
    const { error } = await sb.from(table).insert(record);
    if (error) errors++;
    else count++;
  }
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'block';
  document.getElementById('importDoneMsg').textContent =
    count + ' records imported successfully.' +
    (errors > 0 ? ' ' + errors + ' rows had errors and were skipped.' : '');
  showToast(count + ' records imported!', 'success');
  await loadProjects();
}

function resetImport() {
  importWorkbook = null;
  importRows = [];
  importHeaders = [];
  document.getElementById('importFileInput').value = '';
  document.getElementById('importStep1').style.display = 'block';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = 'none';
  document.getElementById('importSheetSelector').style.display = 'none';
  document.getElementById('importColumnMapper').style.display = 'none';
  document.getElementById('importPreviewWrap').style.display = 'none';
  document.getElementById('importDataType').value = '';
}

function goToDashboard() {
  const nav = document.querySelector('.nav-item');
  navigate('dashboard', nav);
  resetImport();
}

async function printReport() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const p = projects.find(x => x.id === currentProjectId) || {};
  const d = dashData;
  const date = new Date().toLocaleDateString('en-SA');
  const bva = [
    { l:'Purchases', b:p.budget_purchases||0, a:d.tPur||0 },
    { l:'Payroll', b:p.budget_payroll||0, a:d.tPay||0 },
    { l:'Direct Costs', b:p.budget_direct||0, a:d.tDir||0 },
    { l:'Indirect Costs', b:p.budget_indirect||0, a:d.tInd||0 },
    { l:'GOCI', b:p.budget_goci||0, a:d.tGoc||0 },
  ];
  const bvaRows = bva.map(x => {
    const ov = x.b > 0 && x.a > x.b;
    const pct2 = x.b > 0 ? ((x.a/x.b)*100).toFixed(0) + '%' : '--';
    return '<tr>' +
    '<td>' + x.l + '</td>' +
    '<td style="text-align:right">' + sar(x.b) + '</td>' +
    '<td style="text-align:right;color:' +
    (ov ? '#e05c5c' : '#333') + '">' + sar(x.a) + '</td>' +
    '<td style="text-align:right;color:' +
    (ov ? '#e05c5c' : '#2a7a2a') + '">' + sar(x.b - x.a) + '</td>' +
    '<td style="text-align:right">' + pct2 + '</td>' +
    '</tr>';
  }).join('');

  const html = '<!DOCTYPE html><html><head>' +
    '<meta charset="UTF-8">' +
    '<title>APM Metal Works -- ' + (p.name||'') + '</title>' +
    '<style>' +
    'body{font-family:Arial,sans-serif;font-size:13px;color:#222;' +
    'margin:0;padding:32px;}' +
    'h1{font-size:20px;margin:0 0 4px;}' +
    'h2{font-size:14px;color:#555;font-weight:normal;margin:0 0 24px;}' +
    '.meta{display:flex;gap:32px;margin-bottom:24px;font-size:12px;color:#555;}' +
    '.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;}' +
    '.card{border:1px solid #ddd;border-radius:6px;padding:14px;}' +
    '.card .lbl{font-size:10px;text-transform:uppercase;' +
    'letter-spacing:0.06em;color:#888;margin-bottom:6px;}' +
    '.card .val{font-size:18px;font-weight:600;}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:28px;}' +
    'th{background:#f0f0f0;padding:8px 12px;text-align:left;' +
    'font-size:11px;text-transform:uppercase;letter-spacing:0.06em;' +
    'border-bottom:2px solid #ddd;}' +
    'td{padding:8px 12px;border-bottom:1px solid #eee;}' +
    '.section-title{font-size:13px;font-weight:600;margin-bottom:8px;' +
    'padding-bottom:4px;border-bottom:2px solid #c8a96e;color:#c8a96e;}' +
    '.footer{margin-top:40px;font-size:11px;color:#aaa;' +
    'border-top:1px solid #eee;padding-top:12px;}' +
    '@media print{body{padding:16px;}}' +
    '</style></head><body>' +
    '<h1>APM Metal Works</h1>' +
    '<h2>Project Cost Report</h2>' +
    '<div class="meta">' +
    '<span><strong>Project:</strong> ' + (p.name||'--') + '</span>' +
    '<span><strong>Client:</strong> ' + (p.client||'--') + '</span>' +
    '<span><strong>Generated:</strong> ' + date + '</span>' +
    '</div>' +
    '<div class="summary">' +
    '<div class="card"><div class="lbl">BOQ Value</div>' +
    '<div class="val" style="color:#c8a96e">' + sar(d.tBOQ||0) + '</div></div>' +
    '<div class="card"><div class="lbl">Total Costs</div>' +
    '<div class="val" style="color:#e05c5c">' + sar(d.tCosts||0) + '</div></div>' +
    '<div class="card"><div class="lbl">Net Margin</div>' +
    '<div class="val" style="color:' +
    ((d.margin||0)>=0?'#2a7a2a':'#e05c5c') + '">' +
    sar(d.margin||0) + '</div></div>' +
    '<div class="card"><div class="lbl">Margin %</div>' +
    '<div class="val">' + (d.pct||0) + '%</div></div>' +
    '</div>' +
    '<div class="section-title">Budget vs Actual</div>' +
    '<table><thead><tr>' +
    '<th>Category</th><th style="text-align:right">Budget</th>' +
    '<th style="text-align:right">Actual</th>' +
    '<th style="text-align:right">Remaining</th>' +
    '<th style="text-align:right">Used</th>' +
    '</tr></thead><tbody>' + bvaRows + '</tbody>' +
    '<tfoot><tr style="font-weight:600;background:#f9f9f9">' +
    '<td>TOTAL</td>' +
    '<td style="text-align:right">' +
    sar(bva.reduce((a,x)=>a+x.b,0)) + '</td>' +
    '<td style="text-align:right">' + sar(d.tCosts||0) + '</td>' +
    '<td style="text-align:right">' +
    sar(bva.reduce((a,x)=>a+x.b,0)-(d.tCosts||0)) + '</td>' +
    '<td></td></tr></tfoot></table>' +
    '<div class="footer">APM Metal Works -- Project Cost Manager -- ' +
    date + '</div>' +
    '</body></html>';

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

let currentUser = localStorage.getItem('apm_user') || '';

function initUserCheck() {
  if (!currentUser) {
    openModal('enteredByModal');
  }
}

function saveCurrentUser() {
  const name = document.getElementById('currentUserName').value.trim();
  if (!name) { showToast('Please enter your name', 'error'); return; }
  currentUser = name;
  if (document.getElementById('rememberUser').checked) {
    localStorage.setItem('apm_user', name);
  }
  closeModal('enteredByModal');
  showToast('Welcome, ' + name + '!', 'success');
}

async function writeAudit(action, category, description, reason) {
  if (!sb) return;
  try {
    await sb.from('apm_audit_log').insert({
    project_id: currentProjectId || null,
    action: action,
    category: category,
    description: description,
    entered_by: currentUser || 'Unknown',
    reason: reason || null,
    created_at: new Date().toISOString()
    });
  } catch(e) {
    console.log('Audit log error:', e.message);
  }
}

async function loadAudit() {
  if (!sb) return;
  let q = sb.from('apm_audit_log').select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (currentProjectId) q = q.eq('project_id', currentProjectId);
  const { data } = await q;
  const tbody = document.getElementById('auditTableBody');
  if (!tbody) return;
  if (!data || !data.length) {
    tbody.innerHTML =
    '<tr class="empty-row"><td colspan="6">No audit records yet.</td></tr>';
    return;
  }
  const actionClass = {
    add: 'audit-badge-add',
    edit: 'audit-badge-edit',
    delete: 'audit-badge-delete'
  };
  tbody.innerHTML = data.map(r => {
    const dt = new Date(r.created_at);
    const dateStr = dt.toLocaleDateString('en-SA') + ' ' +
    dt.toLocaleTimeString('en-SA', { hour:'2-digit', minute:'2-digit' });
    return '<tr>' +
    '<td style="font-size:12px;white-space:nowrap">' + dateStr + '</td>' +
    '<td><span class="audit-badge ' +
    (actionClass[r.action] || '') + '">' + r.action + '</span></td>' +
    '<td>' + (r.category || '--') + '</td>' +
    '<td>' + (r.description || '--') + '</td>' +
    '<td>' + (r.entered_by || '--') + '</td>' +
    '<td style="font-size:12px;color:var(--text2)">' +
    (r.reason || '--') + '</td>' +
    '</tr>';
  }).join('');
}

let pendingDelete = null;
function deleteRow(table, id, reloadFn) {
  pendingDelete = { table, id, reloadFn };
  document.getElementById('deleteReason').value = '';
  document.getElementById('deleteBy').value = currentUser || '';
  openModal('deleteModal');
}

async function confirmDelete() {
  const reason = document.getElementById('deleteReason').value.trim();
  const by = document.getElementById('deleteBy').value.trim();
  if (!reason) { showToast('Please enter a reason for deletion', 'error'); return; }
  if (!by) { showToast('Please enter your name', 'error'); return; }
  if (!pendingDelete) return;
  const { table, id, reloadFn } = pendingDelete;
  const { error } = await sb.from(table).delete().eq('id', id);
  if (error) { showToast(error.message, 'error'); return; }
  await writeAudit('delete', table.replace('apm_',''), 'Record deleted', reason);
  closeModal('deleteModal');
  showToast('Record deleted', 'success');
  reloadFn();
  if (currentPage === 'dashboard') loadDashboard();
  pendingDelete = null;
}

function getStatusBadge(status) {
  const map = {
    active: ['status-active', 'Active'],
    review: ['status-review', 'Under Review'],
    completed: ['status-completed', 'Completed'],
    archived: ['status-archived', 'Archived']
  };
  const s = map[status] || map['active'];
  return '<span class="status-badge ' + s[0] + '">' + s[1] + '</span>';
}

const _origSelectProject = selectProject;
function selectProject(id) {
  _origSelectProject(id);
  const proj = projects.find(p => p.id === id);
  const badge = document.getElementById('dashStatusBadge');
  if (badge && proj) {
    badge.innerHTML = getStatusBadge(proj.status || 'active');
  } else if (badge) {
    badge.innerHTML = '';
  }
}

async function exportAuditPackage() {
  if (!currentProjectId) {
    showToast('Select a project first', 'error'); return;
  }
  const p = projects.find(x => x.id === currentProjectId) || {};
  const wb = XLSX.utils.book_new();
  const tables = [
    { name:'BOQ', table:'apm_boq' },
    { name:'Purchases', table:'apm_purchases' },
    { name:'Payroll', table:'apm_payroll' },
    { name:'Direct Costs', table:'apm_direct_costs' },
    { name:'Indirect Costs', table:'apm_indirect_costs' },
    { name:'GOCI', table:'apm_goci' },
    { name:'Remarks', table:'apm_remarks' },
    { name:'Audit Log', table:'apm_audit_log' },
  ];
  for (const t of tables) {
    let q = sb.from(t.table).select('*').order('created_at', { ascending: true });
    if (t.table !== 'apm_indirect_costs' && t.table !== 'apm_audit_log' &&
    t.table !== 'apm_suppliers') {
    q = q.eq('project_id', currentProjectId);
    }
    const { data } = await q;
    if (!data || !data.length) continue;
    const headers = Object.keys(data[0]);
    const rows = data.map(r => headers.map(h => r[h] || ''));
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    XLSX.utils.book_append_sheet(wb, ws, t.name);
  }
  XLSX.writeFile(wb,
    'APM_Audit_' + (p.name||'project').replace(/\s+/g,'_') + '_' +
    new Date().toISOString().split('T')[0] + '.xlsx'
  );
  showToast('Audit package exported', 'success');
}

