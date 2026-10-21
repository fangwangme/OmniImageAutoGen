import { getHandle, setHandle } from './utils/idb.js';
import { createTranslator, normalizeLanguage, setStoredLanguage, type Language } from './i18n.js';
import { sanitizeCustomWarningPatterns, tryCompileWarningPattern, MAX_CUSTOM_WARNING_PATTERNS, CUSTOM_WARNING_PATTERNS_STORAGE_KEY } from './utils/warningPatterns.js';
import { toSafeTaskFilename } from './utils/taskQueue.js';
import { validateTasks } from './utils/taskValidation.js';
import { icon, escapeHtml as e } from './sidepanel/views/shared.js';
import type { AspectRatio, TaskItem } from './types.js';

type DirectoryPickerOptions = { id?:string;mode?:'read'|'readwrite';startIn?:FileSystemHandle|string };
declare global { interface Window { showDirectoryPicker(options?:DirectoryPickerOptions):Promise<FileSystemDirectoryHandle>; } }
const DEFAULTS = { generationTimeout:120,downloadTimeout:120,pageLoadTimeout:30,inputTimeout:5,stepDelay:1,taskInterval:5,pollInterval:1,maxRetries:3,maxConsecutiveFailures:5 };
type TimingKey = keyof typeof DEFAULTS;
const timingKeys = Object.keys(DEFAULTS) as TimingKey[];
const legacyKeys=['settings_inputPollInterval','settings_sendPollInterval','settings_generationPollInterval','settings_downloadPollInterval','settings_downloadStabilityInterval','settings_downloadDetectTimeout','settings_downloadStabilityTimeout'];
const sections=['general','folders','generation','timing','patterns','reset'] as const;
const parameters=new URL(location.href).searchParams;
const preview=parameters.has('preview') && !(globalThis.chrome && chrome.runtime && chrome.runtime.id);
const root=document.getElementById('settingsRoot')!;
let language:Language=normalizeLanguage(preview?parameters.get('lang') || undefined:undefined);
let t=createTranslator(language),ratio:AspectRatio='16:9',patterns:string[]=[],exampleTask:TaskItem|undefined;
let timingDrafts:Record<TimingKey,string>=Object.fromEntries(timingKeys.map(key=>[key,String(DEFAULTS[key])])) as Record<TimingKey,string>;
let folders:{source:{name?:string;state:'granted'|'prompt'|'denied'|'missing'},output:{name?:string;state:'granted'|'prompt'|'denied'|'missing'}}={source:{state:'missing'},output:{state:'missing'}};
let timingTimer:ReturnType<typeof setTimeout>|undefined,patternTimer:ReturnType<typeof setTimeout>|undefined,resetTimer:ReturnType<typeof setTimeout>|undefined;
let confirmReset=false,currentSection='general';
let observer:IntersectionObserver|undefined;
let resetting=false,saveError=false,pendingWrites:Promise<void>=Promise.resolve();
let optionsEpoch=0;

function queueWrite(write:()=>Promise<void>) {
  if(preview||resetting)return Promise.resolve();
  const epoch=optionsEpoch;
  const operation=pendingWrites.then(()=>resetting||epoch!==optionsEpoch?undefined:write());
  pendingWrites=operation.catch(()=>undefined);
  return operation;
}
const storageSet=(items:Record<string,unknown>)=>queueWrite(()=>chrome.storage.local.set(items));
const toSecondsNumber=(value:string,fallback:number)=>{const parsed=Number.parseFloat(value);return Number.isNaN(parsed)||parsed<=0?fallback:parsed;};
const toCountNumber=(value:string,fallback:number)=>{const parsed=Number.parseInt(value,10);return Number.isNaN(parsed)||parsed<0?fallback:parsed;};
const validTiming=(key:TimingKey)=>{const value=Number(timingDrafts[key]);return timingDrafts[key].trim()!==''&&Number.isFinite(value)&&(key==='maxRetries'||key==='maxConsecutiveFailures'?value>=0:value>0);};
const sectionHeader=(key:string,extra='')=>`<div class="section-header"><h2>${e(t('op.'+key))}</h2>${extra}</div>`;
function setSaveStatus(error=false) {
  saveError=error;
  const element=document.getElementById('saveStatus');if(!element)return;
  element.innerHTML=`${icon(error?'alert':'check')}<span>${e(t(error?'op.saveFailed':'op.autoSave'))}</span>`;
  element.className='save-status'+(error?' error':'');
  if(!error){void element.offsetWidth;element.classList.add('saved');}
}
function renderFolder(folder:'source'|'output') {
  const status=folders[folder],isGranted=status.state==='granted',missing=status.state==='missing';
  const name=status.name || t('op.notSet'),example=toSafeTaskFilename(exampleTask?.name || '0000_000.png');
  return `<div class="setting-row"><div class="setting-description folder-description"><span class="setting-label">${e(t('op.'+folder))}</span><span class="setting-help">${e(t('op.'+folder+'Help'))}</span><span class="folder-summary"><span class="folder-name">${e(name)}</span><span class="access-badge ${isGranted?'granted':missing?'':'needed'}">${e(t(isGranted?'op.accessGranted':missing?'op.notSet':'op.accessNeeded'))}</span></span>${folder==='output'?`<div class="folder-tree"><span>${e(status.name || 'Output')}/</span><span>├─ chatgpt/${e(example)}</span><span>└─ gemini/${e(example)}</span></div>`:''}</div><button type="button" class="control-button" data-action="folder" data-value="${folder}">${e(t('op.change'))}</button></div>`;
}
function renderTiming() {
  return timingKeys.map(key=>`<div class="setting-row timing-row"><div class="setting-description"><label for="${key}">${e(t('op.'+key))}</label><span class="setting-help">${e(t('op.'+key+'Help'))}</span></div><div class="timing-control"><input id="${key}" class="timing-input" type="number" min="${key==='maxRetries'||key==='maxConsecutiveFailures'?'0':'0.001'}" step="${key==='maxRetries'||key==='maxConsecutiveFailures'?'1':'any'}" data-timing="${key}" value="${e(timingDrafts[key])}" aria-invalid="${!validTiming(key)}"><span class="timing-unit">${e(t(key==='maxRetries'?'op.times':key==='maxConsecutiveFailures'?'op.images':'op.sec'))}</span></div></div>`).join('');
}
function updateWatchdog() {
  const element=document.getElementById('watchdogSeconds');
  if(element)element.textContent=`${toSecondsNumber(timingDrafts.generationTimeout,120)+toSecondsNumber(timingDrafts.downloadTimeout,120)+15}s`;
}
function renderPatternRows() {
  const element=document.getElementById('patternRows');if(!element)return;
  element.innerHTML=patterns.map((value,index)=>`<div class="pattern-row"><label for="pattern${index}" class="visually-hidden">${e(t('op.pattern',{index:index+1}))}</label><input id="pattern${index}" class="pattern-input" type="text" autocomplete="off" spellcheck="false" data-pattern="${index}" value="${e(value)}"><button type="button" class="pattern-remove" data-action="remove-pattern" data-value="${index}" aria-label="${e(t('op.removePattern',{index:index+1}))}">${icon('close')}</button></div>`).join('');
  const count=document.getElementById('patternCount');if(count)count.textContent=`${patterns.length} / ${MAX_CUSTOM_WARNING_PATTERNS}`;
  const add=document.getElementById('addPattern') as HTMLButtonElement|null;if(add)add.disabled=patterns.length>=MAX_CUSTOM_WARNING_PATTERNS;
  validatePatterns();
}
function validatePatterns() {
  const invalid=patterns.map((value,index)=>value.trim()&&!tryCompileWarningPattern(value.trim()).regex?index:-1).filter(index=>index>=0);
  root.querySelectorAll<HTMLInputElement>('[data-pattern]').forEach(input=>input.setAttribute('aria-invalid',String(invalid.includes(Number(input.dataset.pattern)))));
  const status=document.getElementById('patternError');if(status)status.textContent=invalid.length?t('op.patternsInvalid',{count:invalid.length}):'';
  return invalid;
}
function trackSections() {
  observer?.disconnect();
  observer=new IntersectionObserver(entries=>{
    const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top);
    if(visible[0])currentSection=visible[0].target.id;
    root.querySelectorAll<HTMLAnchorElement>('.settings-nav a').forEach(link=>link.setAttribute('aria-current',String(link.hash==='#'+currentSection)));
  },{rootMargin:'-80px 0px -60% 0px',threshold:0});
  root.querySelectorAll('.settings-section').forEach(section=>observer!.observe(section));
}
function render() {
  t=createTranslator(language);document.documentElement.lang=language==='zh'?'zh-CN':'en';document.title=`OmniImageAutoGen / ${t('op.settings')}`;
  const example=toSafeTaskFilename(exampleTask?.name || '0000_000.png');
  const prompt=exampleTask?exampleTask.prompt.slice(0,60)+(exampleTask.prompt.length>60?'…':''):'Editorial illustration, 16:9. [NARRATIVE] …';
  root.innerHTML=`<header class="settings-header"><div class="header-inner"><div class="settings-logo"><svg width="28" height="28" viewBox="0 0 26 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="2" y="6" width="14" height="14" rx="2"/><rect x="10" y="2" width="14" height="14" rx="2" class="logo-sheet"/><path d="M13 12l3-3 5 5"/></svg><span>OmniImageAutoGen</span><span>/ ${e(t('op.settings'))}</span></div><span id="saveStatus" class="save-status${saveError?' error':''}" role="status">${icon(saveError?'alert':'check')}<span>${e(t(saveError?'op.saveFailed':'op.autoSave'))}</span></span></div></header><div class="settings-layout"><nav class="settings-nav" aria-label="${e(t('op.sections'))}">${sections.map(id=>`<a href="#${id}" aria-current="${currentSection===id}">${e(t('op.'+id))}</a>`).join('')}</nav><main class="settings-main"><section id="general" class="settings-section"><h2>${e(t('op.general'))}</h2><div class="settings-card"><div class="setting-row"><div class="setting-description"><label for="languageSelect">${e(t('op.language'))}</label><span class="setting-help">${e(t('op.languageHelp'))}</span></div><select id="languageSelect" class="language-select"><option value="en" ${language==='en'?'selected':''}>English</option><option value="zh" ${language==='zh'?'selected':''}>简体中文</option></select></div></div></section><section id="folders" class="settings-section"><h2>${e(t('op.folders'))}</h2><div class="settings-card">${renderFolder('source')}${renderFolder('output')}</div></section><section id="generation" class="settings-section"><h2>${e(t('op.generation'))}</h2><div class="settings-card"><fieldset class="setting-row ratio-fieldset" aria-labelledby="ratioLabel"><div class="setting-description"><legend id="ratioLabel">${e(t('op.ratio'))}</legend><span class="setting-help">${e(t('op.ratioHelp'))}</span></div><div class="ratio-segments">${(['1:1','3:4','4:3','9:16','16:9'] as const).map(value=>`<button type="button" data-action="ratio" data-value="${value}" aria-pressed="${ratio===value}">${value}</button>`).join('')}</div></fieldset><div class="prompt-example"><span class="setting-label">${e(t('op.whatSent'))}</span><span class="setting-help">${e(t('op.promptHelp'))}</span><pre>name: ${e(example)}\nprompt: ${e(prompt)}</pre></div></div></section><section id="timing" class="settings-section">${sectionHeader('timing',`<button type="button" class="link-button" data-action="defaults">${e(t('op.restoreDefaults'))}</button>`)}<div class="settings-card">${renderTiming()}<div class="watchdog-note">${icon('clock')}<span>${e(t('op.watchdogBefore'))} <span id="watchdogSeconds" class="mono"></span> ${e(t('op.watchdogAfter'))}</span></div></div></section><section id="patterns" class="settings-section">${sectionHeader('patterns','<span id="patternCount" class="pattern-count"></span>')}<div class="settings-card"><div class="pattern-help">${e(t('op.patternsHelp'))} <span class="mono">*</span> ${e(t('op.wildcardHelp'))} <span class="mono">/regex/flags</span>.</div><div class="pattern-content"><div id="patternRows" class="pattern-rows"></div><div id="patternError" class="pattern-error" role="alert"></div><button id="addPattern" type="button" class="pattern-add" data-action="add-pattern">${icon('plus')}${e(t('op.addPattern'))}</button></div></div></section><section id="reset" class="settings-section"><h2>${e(t('op.reset'))}</h2><div class="settings-card setting-row reset-card"><div class="setting-description folder-description"><span class="setting-label">${e(t('op.resetEverything'))}</span><span class="setting-help">${e(t('op.resetHelp'))}</span></div><button type="button" class="control-button reset-button ${confirmReset?'confirm':''}" data-action="reset">${e(t(confirmReset?'op.confirmReset':'op.resetButton'))}</button></div></section></main></div>`;
  updateWatchdog();renderPatternRows();trackSections();
}
async function readFolders() {
  const epoch=optionsEpoch;
  const statuses=await Promise.all((['source','output'] as const).map(async folder=>{
    const handle=await getHandle<FileSystemDirectoryHandle>(folder+'Handle');
    if(!handle)return {state:'missing' as const};
    return {name:handle.name,state:handle.queryPermission?await handle.queryPermission({mode:'readwrite'}):'prompt' as const};
  }));
  if(epoch===optionsEpoch)folders={source:statuses[0],output:statuses[1]};
}
function resetDrafts() {
  optionsEpoch++;
  if(timingTimer)clearTimeout(timingTimer);if(patternTimer)clearTimeout(patternTimer);if(resetTimer)clearTimeout(resetTimer);
  timingTimer=patternTimer=resetTimer=undefined;
  confirmReset=false;language='en';ratio='16:9';patterns=[];exampleTask=undefined;
  timingDrafts=Object.fromEntries(timingKeys.map(key=>[key,String(DEFAULTS[key])])) as Record<TimingKey,string>;
  render();
  const epoch=optionsEpoch;
  void readFolders().then(()=>{if(epoch===optionsEpoch)render();}).catch(()=>setSaveStatus(true));
}
async function saveTiming() {
  if(timingKeys.some(key=>!validTiming(key))){setSaveStatus(true);return;}
  const values=Object.fromEntries(timingKeys.map(key=>['settings_'+key,key==='maxRetries'||key==='maxConsecutiveFailures'?toCountNumber(timingDrafts[key],DEFAULTS[key]):toSecondsNumber(timingDrafts[key],DEFAULTS[key])]));
  await storageSet(values);if(!preview)await chrome.storage.local.remove(legacyKeys);setSaveStatus();
}
async function savePatterns() {
  if(validatePatterns().length){setSaveStatus(true);return;}
  await storageSet({[CUSTOM_WARNING_PATTERNS_STORAGE_KEY]:sanitizeCustomWarningPatterns(patterns.map(value=>value.trim()).filter(Boolean))});setSaveStatus();
}
async function handleAction(button:HTMLElement) {
  if(resetting)return;
  const value=button.dataset.value;
  switch(button.dataset.action){
    case 'folder': {
      if(preview)return;
      const folder=value as 'source'|'output';
      try {
        const handle=await window.showDirectoryPicker({id:'gemini-autogen-'+folder,mode:'readwrite'});
        await setHandle(folder+'Handle',handle);await storageSet({[folder+'Subfolder']:handle.name});
        await readFolders();render();setSaveStatus();
      }catch(error){if(!(error instanceof DOMException&&error.name==='AbortError'))throw error;}
      break;
    }
    case 'ratio': ratio=value as AspectRatio;await storageSet({settings_aspectRatio:ratio});root.querySelectorAll<HTMLElement>('[data-action=ratio]').forEach(element=>element.setAttribute('aria-pressed',String(element.dataset.value===ratio)));setSaveStatus();break;
    case 'defaults':
      if(timingTimer)clearTimeout(timingTimer);
      timingDrafts=Object.fromEntries(timingKeys.map(key=>[key,String(DEFAULTS[key])])) as Record<TimingKey,string>;
      root.querySelectorAll<HTMLInputElement>('[data-timing]').forEach(input=>{input.value=timingDrafts[input.dataset.timing as TimingKey];input.setAttribute('aria-invalid','false');});updateWatchdog();await saveTiming();break;
    case 'add-pattern':
      if(patterns.length>=MAX_CUSTOM_WARNING_PATTERNS){document.getElementById('patternError')!.textContent=t('op.patternsMax',{max:MAX_CUSTOM_WARNING_PATTERNS});return;}
      patterns.push('');renderPatternRows();root.querySelector<HTMLInputElement>(`[data-pattern="${patterns.length-1}"]`)?.focus();break;
    case 'remove-pattern':patterns.splice(Number(value),1);renderPatternRows();if(patternTimer)clearTimeout(patternTimer);await savePatterns();break;
    case 'reset':
      if(!confirmReset){confirmReset=true;button.classList.add('confirm');button.textContent=t('op.confirmReset');resetTimer=setTimeout(()=>{confirmReset=false;const current=root.querySelector<HTMLElement>('[data-action=reset]');current?.classList.remove('confirm');if(current)current.textContent=t('op.resetButton');},4000);return;}
      if(resetting)return;
      resetting=true;
      if(resetTimer)clearTimeout(resetTimer);if(timingTimer)clearTimeout(timingTimer);if(patternTimer)clearTimeout(patternTimer);
      try {
        if(!preview){await pendingWrites;await chrome.storage.local.clear();await chrome.runtime.sendMessage({action:'RESET_STATE'});}
        location.reload();
      } catch(error) {
        resetting=false;render();throw error;
      }
      break;
  }
}
root.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLElement>('[data-action]');
  if(!button||button instanceof HTMLButtonElement&&button.disabled)return;
  void handleAction(button).catch(()=>setSaveStatus(true));
});
root.addEventListener('input',event=>{
  if(resetting)return;
  const input=event.target;if(!(input instanceof HTMLInputElement))return;
  if(input.dataset.timing){const key=input.dataset.timing as TimingKey;timingDrafts[key]=input.value;input.setAttribute('aria-invalid',String(!validTiming(key)));updateWatchdog();if(timingTimer)clearTimeout(timingTimer);timingTimer=setTimeout(()=>{void saveTiming().catch(()=>setSaveStatus(true));},400);}
  if(input.dataset.pattern!==undefined){patterns[Number(input.dataset.pattern)]=input.value;validatePatterns();if(patternTimer)clearTimeout(patternTimer);patternTimer=setTimeout(()=>{void savePatterns().catch(()=>setSaveStatus(true));},250);}
});
root.addEventListener('change',event=>{
  if(resetting)return;
  const input=event.target;if(!(input instanceof HTMLSelectElement)||input.id!=='languageSelect')return;
  language=normalizeLanguage(input.value);render();
  void queueWrite(()=>setStoredLanguage(language)).then(()=>setSaveStatus()).catch(()=>setSaveStatus(true));
});
async function init() {
  if(preview){folders={source:{name:'Downloads',state:'granted'},output:{name:'Output',state:'granted'}};patterns=['*content policy*','/try again later/i'];render();return;}
  const onStorage=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
    if(area!=='local')return;
    const resetKeys=[...timingKeys.map(key=>'settings_'+key),'uiLanguage','ui_platform','settings_aspectRatio','sourceSubfolder','outputSubfolder','currentTaskRunSeq'];
    if(resetKeys.some(key=>changes[key]?.oldValue!==undefined&&changes[key]?.newValue===undefined)){resetDrafts();return;}
    if(changes.uiLanguage&&normalizeLanguage(changes.uiLanguage.newValue)!==language){language=normalizeLanguage(changes.uiLanguage.newValue);render();}
    if(changes.custom_warning_patterns){const next=sanitizeCustomWarningPatterns(changes.custom_warning_patterns.newValue),current=sanitizeCustomWarningPatterns(patterns.map(value=>value.trim()).filter(Boolean));if(JSON.stringify(next)!==JSON.stringify(current)){patterns=next;renderPatternRows();}}
  };
  const onMessage=(message:{action?:string})=>{if(message.action==='RESET_STATE')resetDrafts();};
  chrome.storage.onChanged.addListener(onStorage);
  chrome.runtime.onMessage.addListener(onMessage);
  window.addEventListener('unload',()=>{if(timingTimer)clearTimeout(timingTimer);if(patternTimer)clearTimeout(patternTimer);if(resetTimer)clearTimeout(resetTimer);observer?.disconnect();chrome.storage.onChanged.removeListener(onStorage);chrome.runtime.onMessage.removeListener(onMessage);},{once:true});
  const epoch=optionsEpoch,stored=await chrome.storage.local.get(null);
  if(epoch!==optionsEpoch)return;
  language=normalizeLanguage(stored.uiLanguage);ratio=(['1:1','3:4','4:3','9:16','16:9'].includes(stored.settings_aspectRatio)?stored.settings_aspectRatio:'16:9') as AspectRatio;
  for(const key of timingKeys)timingDrafts[key]=String(stored['settings_'+key]??(key==='pollInterval'?stored.settings_generationPollInterval??stored.settings_downloadPollInterval??stored.settings_inputPollInterval??stored.settings_sendPollInterval??stored.settings_downloadStabilityInterval:undefined)??DEFAULTS[key]);
  patterns=sanitizeCustomWarningPatterns(stored.custom_warning_patterns);
  const validation=validateTasks(stored.loadedTasksRaw??stored.loadedTasks);if(!('fatal' in validation))exampleTask=validation.tasks[0];
  await readFolders();if(epoch!==optionsEpoch)return;render();
  if(location.hash)requestAnimationFrame(()=>document.getElementById(location.hash.slice(1))?.scrollIntoView());
}
void init().catch(()=>{render();setSaveStatus(true);});
