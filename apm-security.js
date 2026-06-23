// ================================================================
// APM ERP -- Shared Security Layer (apm-security.js)
// Loaded by every module. Handles read-only, anomaly detection,
// and data watermarking invisibly.
// ================================================================

const APM_SEC = (function(){
  const SB_URL = 'https://spfztpokbpomqtiqgggz.supabase.co';
  const SB_KEY = 'sb_publishable_xPXU0xL_YaiWA6k9PWc0Xg_4QYeypNi';

  let _perm = null;      // {can_edit, can_export}
  let _anomaly = null;   // anomaly settings
  let _wmCode = null;    // this session's watermark code
  let _userName = null;
  let _moduleName = null;

  function getSess(){
    try{ return JSON.parse(sessionStorage.getItem('apm_auth')||'{}'); }
    catch(e){ return {}; }
  }

  function makeSB(){
    const s = getSess();
    return supabase.createClient(SB_URL, SB_KEY, {
      global:{ headers:{ Authorization:'Bearer '+(s.access_token||SB_KEY) }},
      auth:{ persistSession:false, autoRefreshToken:false }
    });
  }

  // Generate a unique watermark code for this user+session
  function genWMCode(userName, module){
    const ts = Date.now().toString(36).toUpperCase();
    const rand = Math.random().toString(36).slice(2,6).toUpperCase();
    const initials = userName.trim().split(' ').map(w=>w[0]||'').join('').toUpperCase().slice(0,3);
    return initials + '-' + ts + '-' + rand;
  }

  // Embed watermark invisibly in a DOM element using zero-width characters
  // ZWJ = \u200D (zero width joiner), ZWNJ = \u200C (zero width non-joiner)
  // Encodes each bit of the watermark code as ZWJ (1) or ZWNJ (0)
  function encodeWM(code){
    let bits = '';
    for(let i=0; i<code.length; i++){
      const c = code.charCodeAt(i).toString(2).padStart(8,'0');
      bits += c.split('').map(b => b==='1' ? '\u200D' : '\u200C').join('');
    }
    return bits;
  }

  // Inject watermark into page invisibly
  function injectWatermark(code){
    const el = document.createElement('span');
    el.id = '_apm_wm';
    el.style.cssText = 'position:absolute;opacity:0;font-size:0;pointer-events:none;user-select:none';
    el.setAttribute('aria-hidden','true');
    el.textContent = encodeWM(code);
    document.body.appendChild(el);
    // Also add to print footer
    const style = document.createElement('style');
    style.textContent = `@media print { body::after { content: "APM-${code}"; font-size:6px; color:#ddd; position:fixed; bottom:4px; right:4px; } }`;
    document.head.appendChild(style);
  }

  // Layer 4: Anomaly detection
  async function checkAnomaly(sb, userName, module){
    try{
      // Load settings
      const{data:settings}=await sb.from('apm_anomaly_settings').select('key,value');
      if(!settings)return;
      const cfg={};
      settings.forEach(s=>cfg[s.key]=s.value);
      if(cfg.anomaly_detection!=='on')return;

      const now = new Date();
      const hour = now.getHours();
      const afterHour = parseInt(cfg.alert_after_hour||'20');
      const beforeHour = parseInt(cfg.alert_before_hour||'6');
      const maxMods = parseInt(cfg.alert_modules_per_min||'5');

      const alerts = [];

      // Check time anomaly
      if(hour >= afterHour || hour < beforeHour){
        alerts.push(`Access outside normal hours (${now.toLocaleTimeString('en-GB')})`);
      }

      // Check rapid module switching (opened X modules in last 60 seconds)
      const oneMinAgo = new Date(Date.now()-60000).toISOString();
      const{data:recent}=await sb.from('apm_access_log')
        .select('module')
        .eq('user_name',userName)
        .gte('created_at',oneMinAgo);
      if(recent&&recent.length>=maxMods){
        alerts.push(`Opened ${recent.length} modules in under 1 minute`);
      }

      // Log anomalies
      if(alerts.length>0){
        await sb.from('apm_access_log').insert({
          user_name:userName,
          module:module,
          action:'ANOMALY: '+alerts.join(' | ')
        });
        // Show subtle warning to admin (stored, visible in access log)
        console.warn('APM Security: Anomaly detected for', userName, alerts);
      }
    }catch(e){}
  }

  // Layer 3: Apply read-only mode
  function applyReadOnly(){
    // Disable all save/delete/edit buttons
    const dangerSelectors = [
      'button.btn-gold',
      'button.btn-danger',
      '.qbtn',
      'button[onclick*="save"]',
      'button[onclick*="Save"]',
      'button[onclick*="delete"]',
      'button[onclick*="Delete"]',
      'button[onclick*="openModal"]',
      'button[onclick*="openEmp"]',
      'button[onclick*="openInv"]',
      'button[onclick*="openPO"]',
    ];
    // Wait for DOM to be ready, then apply
    setTimeout(()=>{
      dangerSelectors.forEach(sel=>{
        document.querySelectorAll(sel).forEach(el=>{
          el.disabled=true;
          el.style.opacity='0.4';
          el.style.cursor='not-allowed';
          el.title='Read-only access';
        });
      });
      // Add read-only banner
      const banner = document.createElement('div');
      banner.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#C8A96E;color:#0A0A0A;text-align:center;padding:8px;font-size:13px;font-weight:700;z-index:9999';
      banner.textContent='READ-ONLY MODE - You can view but not edit any data';
      document.body.appendChild(banner);
    }, 800);
  }

  // Main init - called by each module
  async function init(moduleName){
    _moduleName = moduleName;
    const sess = getSess();
    _userName = sess.user || 'Unknown';
    if(!_userName||_userName==='Unknown')return;

    const sb = makeSB();

    // Generate and inject watermark
    _wmCode = genWMCode(_userName, moduleName);
    injectWatermark(_wmCode);

    // Log watermark
    try{
      await sb.from('apm_watermarks').insert({
        user_name:_userName, module:moduleName, wm_code:_wmCode
      });
    }catch(e){}

    // Anomaly detection (non-blocking)
    checkAnomaly(sb, _userName, moduleName).catch(()=>{});

    // Check permissions
    try{
      const{data}=await sb.from('apm_user_permissions')
        .select('can_edit,can_export')
        .eq('user_name',_userName)
        .eq('module',moduleName)
        .eq('active',true)
        .limit(1);
      if(data&&data[0]){
        _perm = data[0];
        if(!_perm.can_edit)applyReadOnly();
      }
    }catch(e){}
  }

  // Expose watermark code for admin to check
  function getWMCode(){ return _wmCode; }
  function getPerms(){ return _perm; }
  function canEdit(){ return !_perm || _perm.can_edit !== false; }
  function canExport(){ return !_perm || _perm.can_export !== false; }

  return { init, getWMCode, getPerms, canEdit, canExport };
})();
