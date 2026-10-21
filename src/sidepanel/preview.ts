import { createRunState, type PanelStore, type LogEntry } from './state.js';
import { validateTasks } from '../utils/taskValidation.js';

// Development fixtures contain fabricated chats and prompts, and never access extension APIs.
export function applyPreviewState(store: PanelStore, preview: string) {
  const state = store.state, now = Date.now();
  const tasks = Array.from({ length: 75 }, (_, index) => ({ name: `${String(index).padStart(4, '0')}_000.png`, prompt: 'Editorial illustration, 16:9. [NARRATIVE] …' }));
  tasks[12 + 9].name = '0931_220.png'; tasks[12 + 23].name = '0712_340.png'; tasks[12 + 41].name = '1544_010.png';
  state.loadedTasksRaw = tasks; state.loadedTasks = tasks; state.loadedTasksFileName = '5. Image Prompts.json';
  state.tasksState = { hasFile: true, tasks, issues: [], total: 75 };
  state.platform = 'gemini'; state.sessionMode = 'new'; state.activeTabUrl = 'https://gemini.google.com/u/2/app/preview-session';
  state.sessionUrls = { gemini: 'https://gemini.google.com/u/2/app/preview-session', chatgpt: 'https://chatgpt.com/c/preview-chat' };
  state.folderStatus = { source: { state: 'granted', name: 'Downloads' }, output: { state: 'granted', name: 'Output' } };
  state.existingFiles = new Set(tasks.slice(0, 12).map(task => task.name.toLowerCase()));
  if (preview === 'setup-attention') {
    state.platform = 'chatgpt'; state.sessionMode = 'existing'; state.sessionUrls.chatgpt = state.sessionUrls.gemini;
    state.folderStatus.output.state = 'prompt'; state.loadedTasksFileName = 'Image Prompts (draft).json';
    const raw: unknown[] = tasks.map(task => ({ ...task }));
    raw[13] = { ...tasks[13], prompt: '' }; raw[30] = { prompt: tasks[30].prompt };
    raw[47] = { ...tasks[47], name: '1544_010.png' }; raw[51] = { ...tasks[51], name: '1544_010.PNG' };
    // Keep the template's three issues by giving its independent run-example task a fresh name.
    raw[53] = { ...tasks[53], name: 'preview_0053.png' };
    const result = validateTasks(raw);
    if (!('fatal' in result)) { state.loadedTasksRaw = raw; state.loadedTasks = result.tasks; state.tasksState = { hasFile: true, ...result }; }
    return;
  }
  if (preview === 'setup') return;
  state.run = createRunState('gemini', 'existing');
  const run = state.run;
  run.taskQueue = tasks.slice(12); run.currentIndex = 23; run.isRunning = true; run.startTime = now - 3720000;
  run.sessionUrl = state.sessionUrls.gemini; run.sessionPending = false; run.homeUrl = 'https://gemini.google.com/u/2/app';
  run.savedCount = 21; run.skippedCount = 1; run.failedCount = 1; run.attempt = 2; run.currentTaskMode = 'download-only';
  for (let index = 0; index < 23; index++) run.results.set(index, { outcome: index === 9 ? 'skipped-warning' : index === 17 ? 'failed' : 'saved', ...(index === 17 ? {error:'Timeout waiting for download',errorType:'download' as const,retries:3} : {}) });
  run.stages = { 'open-session': { status: 'done', meta: '4s' }, 'image-mode': { status: 'reused' }, 'send-prompt': { status: 'reused' }, generate: { status: 'reused' }, download: { status: 'active', startedAt: now - 14000 }, save: { status: 'todo' } };
  const logs: [string, LogEntry['level'], string][] = [['22:58:11','ok','#23 0659_120.png saved'],['22:58:16','info','#24 0712_340.png · attempt 1'],['22:58:23','info','prompt sent · reply bound'],['22:59:11','info','image ready · download clicked'],['23:01:11','error','no new file in 120s'],['23:01:11','warn','retry 1/3 · download only'],['23:01:19','info','reply found · download clicked']];
  state.logs = logs.map(([time,level,message]) => ({ time,level,message,verbose:false,timestamp:`2026-10-08T${time}+08:00` }));
  state.view = 'running';
  if (preview === 'pending-session') { run.sessionPending = true; run.sessionUrl = ''; run.sessionMode = 'new'; run.startTime = now - 4000; run.currentIndex = 0; run.savedCount = run.skippedCount = run.failedCount = 0; run.results.clear(); run.attempt = 1; run.currentTaskMode = 'full'; run.stages = { 'open-session': {status:'done',meta:'4s'},'image-mode':{status:'active'},'send-prompt':{status:'todo'},generate:{status:'todo'},download:{status:'todo'},save:{status:'todo'} }; state.logs = []; }
  if (['finished','stopped','halted'].includes(preview)) {
    state.view = 'finished'; run.isRunning = false; run.endTime = now; run.outcome = preview as 'finished'|'stopped'|'halted';
    state.existingFiles = new Set([...state.existingFiles, ...Array.from(run.results.entries()).filter(([, result])=>result.outcome==='saved').map(([index])=>run.taskQueue[index].name.toLowerCase())]);
    if (preview === 'finished') {
      run.currentIndex = 63; run.startTime = now - 9660000; run.savedCount = 61; run.results.clear();
      for(let index=0;index<63;index++) run.results.set(index,{outcome:index===9?'skipped-warning':index===41?'failed':'saved', ...(index===41?{error:'Timeout waiting for download',errorType:'download' as const,retries:3}:{})});
      state.existingFiles = new Set(tasks.filter((_,index)=>index!==21&&index!==53).map(task=>task.name.toLowerCase()));
    }
    if (preview === 'halted') { run.haltReason = 'Output folder access expired'; run.haltErrorType = 'folder'; state.folderStatus.output.state = 'prompt'; }
  }
}
