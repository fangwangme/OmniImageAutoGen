import { createTranslator, normalizeLanguage } from './i18n.js';
import { createPanelStore, type LogEntry } from './sidepanel/state.js';
import { createTaskLifecycle } from './sidepanel/taskLifecycle.js';
import { restoreInitialState, refreshSetup } from './sidepanel/initState.js';
import { loadTasksFile, openSettings } from './sidepanel/uiBindings.js';
import { requestFolderPermission } from './sidepanel/folderStatus.js';
import { renderSetupView } from './sidepanel/views/setupView.js';
import { renderRunningView } from './sidepanel/views/runningView.js';
import { renderFinishedView } from './sidepanel/views/finishedView.js';
import { copyLogText } from './sidepanel/views/logCard.js';
import { applyPreviewState } from './sidepanel/preview.js';
import { toSafeTaskFilename } from './utils/taskQueue.js';
import type { PlatformId, SessionMode, AspectRatio } from './types.js';
import type { PanelMessage } from './sidepanel/panelTypes.js';

const store = createPanelStore(), state = store.state;
const parameters = new URL(location.href).searchParams;
const preview = parameters.has('preview') && !(globalThis.chrome && chrome.runtime && chrome.runtime.id);
const runtime = preview ? null : createTaskLifecycle(store);
const fileInput = document.getElementById('jsonFile') as HTMLInputElement;
const views = { setup: document.getElementById('setupView')!, running: document.getElementById('runningView')!, finished: document.getElementById('finishedView')! };
let sessionSaveTimer: ReturnType<typeof setTimeout> | undefined;
let resetting = false;
let lastLogEntry: LogEntry | undefined;

function cancelSessionSave() {
  if(sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = undefined;
}

function render() {
  const active = document.activeElement;
  const sessionFocused = active instanceof HTMLInputElement && active.id === 'sessionUrl';
  const selection = sessionFocused ? [active.selectionStart, active.selectionEnd] : undefined;
  const focusedAction = active instanceof HTMLElement ? active.dataset.action : undefined;
  const focusedValue = active instanceof HTMLElement ? active.dataset.value : undefined;
  const focusedView = active instanceof Element ? active.closest('.panel-view') : null;
  const target = views[state.view], mainScroll = target.querySelector('main')?.scrollTop || 0;
  const logScroll = target.querySelector('.log-output')?.scrollTop || 0;
  for(const [name,element] of Object.entries(views)) element.hidden = name !== state.view;
  target.innerHTML = state.view === 'setup' ? renderSetupView(state) : state.view === 'running' ? renderRunningView(state) : renderFinishedView(state);
  document.documentElement.lang = state.language === 'zh' ? 'zh-CN' : 'en';
  document.title = 'OmniImageAutoGen';
  const main = target.querySelector('main'); if(main) main.scrollTop = mainScroll;
  const log = target.querySelector('.log-output');
  const latestLogEntry = state.logs.at(-1);
  if(log) log.scrollTop = latestLogEntry && latestLogEntry !== lastLogEntry ? log.scrollHeight : logScroll;
  lastLogEntry = latestLogEntry;
  if(sessionFocused) {
    const input = target.querySelector<HTMLInputElement>('#sessionUrl');
    input?.focus({preventScroll:true});
    // A text input with URL keyboard hints keeps its caret across validation renders.
    if(input && selection?.[0] !== null) { try { input.setSelectionRange(selection![0],selection![1]); } catch {} }
  } else if(focusedAction && focusedView === target) {
    const replacement = Array.from(target.querySelectorAll<HTMLElement>('[data-action]')).find(element=>element.dataset.action===focusedAction&&element.dataset.value===focusedValue);
    if(!(replacement instanceof HTMLButtonElement && replacement.disabled)) replacement?.focus({preventScroll:true});
  }
}
store.subscribe(render);
const persist = async (items: Record<string, unknown>) => { if(!preview) await chrome.storage.local.set(items); };
const refresh = async () => { if(!preview) await refreshSetup(store); else store.render(); };
async function flushSession() {
  cancelSessionSave();
  await persist({ [`sessionUrl_${state.platform}`]:state.sessionUrls[state.platform],ui_platform:state.platform,ui_sessionMode:state.sessionMode });
}
async function copy(text: string, button: HTMLElement) {
  if(!text) return;
  await navigator.clipboard.writeText(text);
  const original = button.innerHTML;
  button.textContent = createTranslator(state.language)('ui.copied');
  setTimeout(() => { if(button.isConnected) button.innerHTML = original; },800);
}
async function selectPlatform(platform: PlatformId) {
  await flushSession();
  state.platform = platform; state.setupMessage = undefined;
  await persist({ui_platform:platform});
  await refresh();
}
async function handleAction(button: HTMLElement) {
  const action = button.dataset.action, value = button.dataset.value;
  if((state.run.isRunning || state.starting) && ['platform','session-mode','choose-file','active-tab','switch-platform'].includes(action || '')) return;
  switch(action) {
    case 'settings': if(!preview) await openSettings(); break;
    case 'choose-folder': if(!preview) await openSettings('#folders'); break;
    case 'platform': await selectPlatform(value as PlatformId); break;
    case 'session-mode':
      await flushSession(); state.sessionMode = value as SessionMode; state.setupMessage = undefined;
      await persist({ui_sessionMode:state.sessionMode}); store.render(); break;
    case 'active-tab':
      if(!preview) state.activeTabUrl = (await chrome.tabs.query({active:true,currentWindow:true}))[0]?.url || '';
      state.sessionUrls[state.platform] = state.activeTabUrl;
      await flushSession(); store.render(); break;
    case 'switch-platform': {
      const url = state.sessionUrls[state.platform];
      await flushSession(); state.platform = value as PlatformId; state.sessionUrls[state.platform] = url;
      state.sessionMode = 'existing'; await flushSession(); await refresh(); break;
    }
    case 'choose-file': fileInput.value = ''; fileInput.click(); break;
    case 'allow-folder':
      if(!preview) await requestFolderPermission(value as 'source'|'output');
      else state.folderStatus[value as 'source'|'output'].state = 'granted';
      await refresh(); break;
    case 'allow-halted':
      if(!preview) {
        // Permission requests stay directly in this user gesture.
        const folders = (['source','output'] as const).filter(folder=>state.folderStatus[folder].state !== 'granted');
        for(const folder of folders) await requestFolderPermission(folder);
      }
      else state.folderStatus.output.state = 'granted';
      await refresh(); break;
    case 'start':
      await flushSession(); if(runtime) await runtime.start(); else {applyPreviewState(store,'running');store.render();} break;
    case 'stop': if(runtime) await runtime.stop(); else {state.run.isRunning=false;state.run.outcome='stopped';state.run.endTime=Date.now();state.view='finished';store.render();} break;
    case 'reset':
      cancelSessionSave();
      if(runtime) { resetting=true;try{await runtime.reset();}finally{resetting=false;} }
      else {applyPreviewState(store,'setup');state.view='setup';store.render();} break;
    case 'toggle-log': state.logCollapsed=!state.logCollapsed;await persist({logCollapsed:state.logCollapsed});store.render();break;
    case 'log-all': state.logFilter='all';store.render();break;
    case 'log-issues': state.logFilter='issues';store.render();break;
    case 'clear-log': state.logs=[];store.render();break;
    case 'copy-log': await copy(copyLogText(state),button);break;
    case 'copy-session': await copy(state.run.sessionUrl,button);break;
    case 'copy-filename': await copy(toSafeTaskFilename(state.run.taskQueue[state.run.currentIndex]?.name || '').replace(/\.[^.]+$/,''),button);break;
    case 'open-chat': if(!preview) await chrome.tabs.create({url:state.run.sessionUrl || state.run.homeUrl,active:true});break;
    case 'back-setup': state.view='setup';await refresh();break;
    case 'rerun':
      if(!state.run.sessionUrl) {state.view='setup';await refresh();break;}
      state.sessionMode='existing';state.sessionUrls[state.platform]=state.run.sessionUrl;await flushSession();
      await refresh();
      if(runtime) await runtime.start();else{applyPreviewState(store,'running');store.render();}break;
  }
}
document.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLElement>('[data-action]');
  if(!button || button instanceof HTMLButtonElement && button.disabled) return;
  void handleAction(button).catch(error=>{store.addLog('error',error instanceof Error?error.message:String(error));});
});
document.addEventListener('input',event=>{
  const input=event.target;
  if(!(input instanceof HTMLInputElement)||input.id!=='sessionUrl'||state.run.isRunning||state.starting) return;
  state.sessionUrls[state.platform]=input.value;state.setupMessage=undefined;
  if(sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer=setTimeout(()=>{void flushSession().catch(error=>store.addLog('error',String(error)));},300);
  store.render();
});
fileInput.addEventListener('change',()=>{if(fileInput.files?.[0]&&!preview) void loadTasksFile(store,fileInput.files[0]).then(refresh).catch(error=>store.addLog('error',String(error)));});

async function init() {
  if(preview) {applyPreviewState(store,parameters.get('preview') || 'setup');state.language=normalizeLanguage(parameters.get('lang') || undefined);store.render();return;}
  await restoreInitialState(store);
  const onMessage=(message:PanelMessage)=>runtime!.handlePanelMessage(message);
  chrome.runtime.onMessage.addListener(onMessage);
  const activeChanged=()=>{if(!state.run.isRunning&&!state.starting) void refresh();};
  const onUpdated=(_tabId:number,change:chrome.tabs.TabChangeInfo)=>{if(change.url) activeChanged();};
  chrome.tabs.onActivated.addListener(activeChanged);chrome.tabs.onUpdated.addListener(onUpdated);
  const onStorage=(changes:Record<string,chrome.storage.StorageChange>,area:string)=>{
    if(area!=='local') return;
    const removed=(key:string)=>changes[key]?.oldValue!==undefined && changes[key]?.newValue===undefined;
    const externalClear=removed('currentTaskRunSeq') || ((state.run.isRunning||state.starting)&&removed('loadedTasks')) || (removed('loadedTasks') && ['ui_platform','uiLanguage','settings_aspectRatio'].some(removed));
    if(externalClear&&!resetting) {cancelSessionSave();resetting=true;void runtime!.reset({clearStorage:false}).finally(()=>{resetting=false;});return;}
    if(changes.uiLanguage) state.language=normalizeLanguage(changes.uiLanguage.newValue);
    if(changes.settings_aspectRatio) state.aspectRatio=(['1:1','3:4','4:3','9:16','16:9'].includes(changes.settings_aspectRatio.newValue)?changes.settings_aspectRatio.newValue:'16:9') as AspectRatio;
    if(changes.settings_downloadTimeout) state.run.downloadTimeout=Number(changes.settings_downloadTimeout.newValue)||120;
    if(changes.logCollapsed) state.logCollapsed=Boolean(changes.logCollapsed.newValue);
    for(const platform of ['chatgpt','gemini'] as const) if(changes[`sessionUrl_${platform}`]) state.sessionUrls[platform]=changes[`sessionUrl_${platform}`].newValue || '';
    if(changes.custom_warning_patterns) void chrome.tabs.query({url:['https://gemini.google.com/*','https://chatgpt.com/*']}).then(tabs=>Promise.allSettled(tabs.filter(tab=>tab.id!==undefined).map(tab=>chrome.tabs.sendMessage(tab.id!,{action:'RELOAD_WARNING_PATTERNS'}))));
    if(!state.run.isRunning&&!state.starting&&(changes.sourceSubfolder||changes.outputSubfolder)) void refresh();
    store.render();
  };
  chrome.storage.onChanged.addListener(onStorage);
  window.addEventListener('unload',()=>{
    cancelSessionSave();
    chrome.runtime.onMessage.removeListener(onMessage);chrome.tabs.onActivated.removeListener(activeChanged);chrome.tabs.onUpdated.removeListener(onUpdated);chrome.storage.onChanged.removeListener(onStorage);runtime!.dispose();
  },{once:true});
  store.render();
}
void init().catch(error=>{store.addLog('error',String(error));});
