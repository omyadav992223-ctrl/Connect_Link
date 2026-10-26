// =============================================================================
// qa_browser_e2e.mjs — End-to-end verification of clocking UI & sequential logic
// Runs against the real Google Chrome headless browser and production build.
// =============================================================================

import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

const DIST_DIR = path.resolve('dist');

function getMime(file) {
  if (file.endsWith('.html')) return 'text/html';
  if (file.endsWith('.js')) return 'application/javascript';
  if (file.endsWith('.css')) return 'text/css';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.svg')) return 'image/svg+xml';
  return 'text/plain';
}

const server = http.createServer((req, res) => {
  const urlPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(DIST_DIR, urlPath.split('?')[0]);
  console.log('[Server REQ]', req.url, 'exists:', fs.existsSync(filePath));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': getMime(filePath) });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

async function run() {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  console.log(`[QA Server] Serving dist/ on http://127.0.0.1:${port}`);

  const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const cdpPort = 9223;
  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    '--remote-allow-origins=*',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-extensions',
    'about:blank'
  ]);

  let passedAll = true;

  try {
    // Wait for Chrome CDP to be available
    let connected = false;
    let wsUrl = '';
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 200));
      try {
        const resp = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
        const json = await resp.json();
        wsUrl = json.webSocketDebuggerUrl;
        connected = true;
        break;
      } catch (err) {}
    }

    if (!connected) throw new Error('Could not connect to Chrome CDP');

    // Create a new tab
    const newTabResp = await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' });
    const tabData = await newTabResp.json();
    const tabWsUrl = tabData.webSocketDebuggerUrl;

    console.log(`[QA] Connected to page: ${tabWsUrl}`);

    const ws = new WebSocket(tabWsUrl);
    await new Promise(res => ws.onopen = res);

    let msgId = 1;
    const pending = new Map();
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.method === 'Runtime.consoleAPICalled') {
        console.log('[Browser Console]', data.params.type, data.params.args.map(a => a.value || a.description));
      }
      if (data.method === 'Runtime.exceptionThrown') {
        console.error('[Browser Exception]', data.params.exceptionDetails.exception?.description || data.params.exceptionDetails.text);
      }
      if (data.method === 'Network.responseReceived') {
        // console.log('[Network]', data.params.response.url, data.params.response.status);
      }
      if (data.id && pending.has(data.id)) {
        pending.get(data.id)(data);
        pending.delete(data.id);
      }
    };

    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = msgId++;
        pending.set(id, (msg) => {
          if (msg.error) rej(msg.error);
          else res(msg.result);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Log.enable');
    await send('Network.enable');

    console.log(`[QA] Navigating to http://127.0.0.1:${port}...`);
    await send('Page.navigate', { url: `http://127.0.0.1:${port}` });

    // Wait until module script loads and window.__app is mounted
    for (let i = 0; i < 50; i++) {
      await new Promise(r => setTimeout(r, 100));
      try {
        const ready = await evaluate(`!!window.__app`);
        if (ready) break;
      } catch (e) {}
    }

    async function evaluate(expression) {
      const res = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (res.exceptionDetails) {
        throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
      }
      return res.result?.value;
    }

    // Wait for page to initialize
    await new Promise(r => setTimeout(r, 600));

    console.log('\n--- Test 1: Verify Initial UI & DOM Structure ---');
    const title = await evaluate(`document.title`);
    console.log('Document title:', title);
    if (!title.includes('Circuit Link')) throw new Error('Incorrect title');

    const hasButtons = await evaluate(`({
      step: !!document.getElementById('btn-clock-step'),
      play: !!document.getElementById('btn-clock-play'),
      reset: !!document.getElementById('btn-clock-reset'),
      clear: !!document.getElementById('btn-clear'),
      preset: !!document.getElementById('btn-preset')
    })`);
    console.log('Control buttons present:', hasButtons);
    if (!hasButtons.step || !hasButtons.play || !hasButtons.reset) {
      throw new Error('Clock control buttons missing');
    }

    console.log('\n--- Test 2: Clock controls when NO clock component exists (Blind-spot preset) ---');
    // Blind spot preset has no CLOCK component
    const hasApp = await evaluate(`!!window.__app`);
    console.log('App instance on window:', hasApp);
    await evaluate(`document.getElementById('btn-clock-step').click()`);
    const consoleHtml = await evaluate(`document.getElementById('panel-console')?.innerHTML`);
    console.log('Console HTML after step:', consoleHtml);
    const consoleText1 = await evaluate(`document.getElementById('panel-console')?.textContent ?? ''`);
    console.log('Console after step without clock:', consoleText1);
    if (!consoleText1.includes('No CLOCK component found')) {
      throw new Error('Expected "No CLOCK component found" log');
    }

    await evaluate(`document.getElementById('btn-clock-play').click()`);
    const consoleText2 = await evaluate(`document.getElementById('panel-console').textContent`);
    console.log('Console after play without clock:', consoleText2.split('\n')[0]);
    if (!consoleText2.includes('No CLOCK component on canvas to drive')) {
      throw new Error('Expected "No CLOCK component on canvas to drive" log');
    }

    await evaluate(`document.getElementById('btn-clock-reset').click()`);
    const consoleText3 = await evaluate(`document.getElementById('panel-console').textContent`);
    console.log('Console after reset:', consoleText3.split('\n')[0]);
    if (!consoleText3.includes('Clock and sequential state reset to initial')) {
      throw new Error('Expected reset log');
    }

    console.log('\n--- Test 3: Clear Canvas and Add Clock + DFF Divide-by-2 Circuit ---');
    // Clear graph cleanly
    await evaluate(`(() => {
      const app = window.__app;
      app.pauseClock();
      app.graph.clear();
      app.renderState.selectedIds.clear();
      app.onSelectComponent(null);
      app.propagate();
      app.updateCanvasHint();
    })()`);

    const hintVisible = await evaluate(`document.getElementById('canvas-hint').style.display !== 'none'`);
    console.log('Canvas hint visible after clear:', hintVisible);
    if (!hintVisible) throw new Error('Canvas hint should be visible when graph is empty');

    // Build Divide-by-2 D-Flip-Flop circuit via app.graph API
    await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.addComponent('CLOCK', { x: 50, y: 100 }, 'CLK');
      const dff = app.graph.addComponent('DFF', { x: 200, y: 100 }, 'DFF_DIV2');
      const led = app.graph.addComponent('LED', { x: 350, y: 100 }, 'OUT_Q');

      app.graph.addWire(clk.id, 'out', dff.id, 'in_CLK');
      app.graph.addWire(dff.id, 'out_QBAR', dff.id, 'in_D');
      app.graph.addWire(dff.id, 'out_Q', led.id, 'in');

      app.propagate();
      app.updateCanvasHint();
    })()`);

    const state0 = await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.getAllComponents().find(c => c.type === 'CLOCK');
      const dff = app.graph.getAllComponents().find(c => c.type === 'DFF');
      const led = app.graph.getAllComponents().find(c => c.type === 'LED');
      return {
        clk: clk.outputPorts[0].value,
        dff_Q: dff.outputPorts.find(p => p.id === 'out_Q').value,
        dff_QBAR: dff.outputPorts.find(p => p.id === 'out_QBAR').value,
        dff_D: dff.inputPorts.find(p => p.id === 'in_D').value,
        led: led.inputPorts[0].value
      };
    })()`);
    console.log('Initial state:', state0);
    if (state0.clk !== 0 || state0.dff_Q !== 0 || state0.dff_QBAR !== 1 || state0.dff_D !== 1 || state0.led !== 0) {
      throw new Error(`State 0 mismatch: ${JSON.stringify(state0)}`);
    }

    console.log('\n--- Test 4: Clock Step UI Button Verification ---');
    // Step 1: CLK 0 -> 1 (Rising Edge)
    await evaluate(`document.getElementById('btn-clock-step').click()`);
    const state1 = await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.getAllComponents().find(c => c.type === 'CLOCK');
      const dff = app.graph.getAllComponents().find(c => c.type === 'DFF');
      const led = app.graph.getAllComponents().find(c => c.type === 'LED');
      return {
        clk: clk.outputPorts[0].value,
        dff_Q: dff.outputPorts.find(p => p.id === 'out_Q').value,
        dff_QBAR: dff.outputPorts.find(p => p.id === 'out_QBAR').value,
        dff_D: dff.inputPorts.find(p => p.id === 'in_D').value,
        led: led.inputPorts[0].value
      };
    })()`);
    console.log('After Step 1 (Rising edge 0->1):', state1);
    if (state1.clk !== 1 || state1.dff_Q !== 1 || state1.dff_QBAR !== 0 || state1.dff_D !== 0 || state1.led !== 1) {
      throw new Error(`Step 1 failed: ${JSON.stringify(state1)}`);
    }

    // Step 2: CLK 1 -> 0 (Falling Edge, Hold Q=1)
    await evaluate(`document.getElementById('btn-clock-step').click()`);
    const state2 = await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.getAllComponents().find(c => c.type === 'CLOCK');
      const dff = app.graph.getAllComponents().find(c => c.type === 'DFF');
      const led = app.graph.getAllComponents().find(c => c.type === 'LED');
      return {
        clk: clk.outputPorts[0].value,
        dff_Q: dff.outputPorts.find(p => p.id === 'out_Q').value,
        led: led.inputPorts[0].value
      };
    })()`);
    console.log('After Step 2 (Falling edge 1->0, Hold):', state2);
    if (state2.clk !== 0 || state2.dff_Q !== 1 || state2.led !== 1) {
      throw new Error(`Step 2 failed: ${JSON.stringify(state2)}`);
    }

    // Step 3: CLK 0 -> 1 (Second Rising Edge, Toggle Q -> 0)
    await evaluate(`document.getElementById('btn-clock-step').click()`);
    const state3 = await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.getAllComponents().find(c => c.type === 'CLOCK');
      const dff = app.graph.getAllComponents().find(c => c.type === 'DFF');
      const led = app.graph.getAllComponents().find(c => c.type === 'LED');
      return {
        clk: clk.outputPorts[0].value,
        dff_Q: dff.outputPorts.find(p => p.id === 'out_Q').value,
        led: led.inputPorts[0].value
      };
    })()`);
    console.log('After Step 3 (Second rising edge 0->1, Toggle):', state3);
    if (state3.clk !== 1 || state3.dff_Q !== 0 || state3.led !== 0) {
      throw new Error(`Step 3 failed: ${JSON.stringify(state3)}`);
    }

    console.log('\n--- Test 5: Auto Clock Play / Pause & Repeated Clicks ---');
    // Start auto clock
    await evaluate(`document.getElementById('btn-clock-play').click()`);
    const isRunning = await evaluate(`window.__app.graph.state.running`);
    const playIcon = await evaluate(`document.getElementById('icon-clock-play').textContent.trim()`);
    console.log('Auto clock running:', isRunning, 'Icon:', playIcon);
    if (!isRunning || playIcon !== 'pause') throw new Error('Auto clock did not start properly');

    // Wait 300ms for pulses
    await new Promise(r => setTimeout(r, 350));

    // Pause auto clock
    await evaluate(`document.getElementById('btn-clock-play').click()`);
    const isPaused = await evaluate(`!window.__app.graph.state.running`);
    const pauseIcon = await evaluate(`document.getElementById('icon-clock-play').textContent.trim()`);
    console.log('Auto clock paused:', isPaused, 'Icon:', pauseIcon);
    if (!isPaused || pauseIcon !== 'play_arrow') throw new Error('Auto clock did not pause properly');

    // Test repeated clicks (rapid toggling)
    for (let i = 0; i < 6; i++) {
      await evaluate(`document.getElementById('btn-clock-play').click()`);
    }
    const finalRunState = await evaluate(`window.__app.graph.state.running`);
    console.log('After 6 rapid clicks, running state:', finalRunState);
    if (finalRunState) {
      // Pause it
      await evaluate(`document.getElementById('btn-clock-play').click()`);
    }

    console.log('\n--- Test 6: Clock Reset UI Button ---');
    await evaluate(`document.getElementById('btn-clock-reset').click()`);
    const resetState = await evaluate(`(() => {
      const app = window.__app;
      const clk = app.graph.getAllComponents().find(c => c.type === 'CLOCK');
      const dff = app.graph.getAllComponents().find(c => c.type === 'DFF');
      return {
        clk: clk.outputPorts[0].value,
        dff_Q: dff.outputPorts.find(p => p.id === 'out_Q').value,
        dff_QBAR: dff.outputPorts.find(p => p.id === 'out_QBAR').value
      };
    })()`);
    console.log('After Reset button:', resetState);
    if (resetState.clk !== 0 || resetState.dff_Q !== 0 || resetState.dff_QBAR !== 1) {
      throw new Error(`Reset state failed: ${JSON.stringify(resetState)}`);
    }

    console.log('\n--- Test 7: Safe Cleanup on Preset Reload while Auto Clock is Running ---');
    // Start auto clock
    await evaluate(`window.__app.startClock(5)`);
    console.log('Started clock at 5Hz. Now reloading blind-spot preset...');
    await evaluate(`document.getElementById('btn-preset').click()`);
    const presetRunning = await evaluate(`window.__app.graph.state.running`);
    const compCount = await evaluate(`window.__app.graph.getAllComponents().length`);
    console.log('After preset load, clock running:', presetRunning, 'Components:', compCount);
    if (presetRunning) throw new Error('Preset load did not cleanly pause the clock');
    if (compCount !== 14) throw new Error(`Expected 14 components in preset, got ${compCount}`);

    console.log('\n--- Test 8: End-to-End Test of JKFF, TFF, SR_LATCH ---');
    const seqTestRes = await evaluate(`(() => {
      const app = window.__app;
      app.graph.clear();
      const jk = app.graph.addComponent('JKFF', { x: 50, y: 50 }, 'JK');
      const t = app.graph.addComponent('TFF', { x: 200, y: 50 }, 'T');
      const sr = app.graph.addComponent('SR_LATCH', { x: 350, y: 50 }, 'SR');

      // Test JKFF Set
      jk.inputPorts.find(p => p.id === 'in_J').value = 1;
      jk.inputPorts.find(p => p.id === 'in_K').value = 0;
      jk.inputPorts.find(p => p.id === 'in_CLK').value = 0;
      app.propagate();
      jk.inputPorts.find(p => p.id === 'in_CLK').value = 1;
      app.propagate();
      const jkSetQ = jk.outputPorts.find(p => p.id === 'out_Q').value;

      // Test JKFF Toggle
      jk.inputPorts.find(p => p.id === 'in_J').value = 1;
      jk.inputPorts.find(p => p.id === 'in_K').value = 1;
      jk.inputPorts.find(p => p.id === 'in_CLK').value = 0;
      app.propagate();
      jk.inputPorts.find(p => p.id === 'in_CLK').value = 1;
      app.propagate();
      const jkTogQ = jk.outputPorts.find(p => p.id === 'out_Q').value;

      // Test TFF Toggle
      t.inputPorts.find(p => p.id === 'in_T').value = 1;
      t.inputPorts.find(p => p.id === 'in_CLK').value = 0;
      app.propagate();
      t.inputPorts.find(p => p.id === 'in_CLK').value = 1;
      app.propagate();
      const tTogQ = t.outputPorts.find(p => p.id === 'out_Q').value;

      // Test SR Latch
      sr.inputPorts.find(p => p.id === 'in_S').value = 1;
      sr.inputPorts.find(p => p.id === 'in_R').value = 0;
      app.propagate();
      const srSetQ = sr.outputPorts.find(p => p.id === 'out_Q').value;

      sr.inputPorts.find(p => p.id === 'in_S').value = 0;
      sr.inputPorts.find(p => p.id === 'in_R').value = 0;
      app.propagate();
      const srHoldQ = sr.outputPorts.find(p => p.id === 'out_Q').value;

      sr.inputPorts.find(p => p.id === 'in_S').value = 1;
      sr.inputPorts.find(p => p.id === 'in_R').value = 1;
      app.propagate();
      const srInvQ = sr.outputPorts.find(p => p.id === 'out_Q').value;

      return { jkSetQ, jkTogQ, tTogQ, srSetQ, srHoldQ, srInvQ };
    })()`);
    console.log('Sequential logic tests:', seqTestRes);
    if (seqTestRes.jkSetQ !== 1 || seqTestRes.jkTogQ !== 0 || seqTestRes.tTogQ !== 1 ||
        seqTestRes.srSetQ !== 1 || seqTestRes.srHoldQ !== 1 || seqTestRes.srInvQ !== 'X') {
      throw new Error(`Sequential components test failed: ${JSON.stringify(seqTestRes)}`);
    }

    console.log('\n--- Test 9: Combinational Cycle Detection ---');
    const cycleRes = await evaluate(`(() => {
      const app = window.__app;
      app.graph.clear();
      const a = app.graph.addComponent('AND', { x: 50, y: 50 }, 'GATE_A');
      const b = app.graph.addComponent('OR', { x: 150, y: 50 }, 'GATE_B');
      app.graph.addWire(a.id, 'out_Y', b.id, 'in_A');
      app.graph.addWire(b.id, 'out_Y', a.id, 'in_A');
      app.propagate();
      return app.graph.state.components.size;
    })()`);
    const cycleLog = await evaluate(`document.getElementById('panel-console').textContent`);
    console.log('Console after combinational cycle wire:', cycleLog.split('\n')[0]);
    if (!cycleLog.includes('Combinational cycle detected')) {
      throw new Error('Combinational cycle was not flagged in console');
    }

    console.log('\n--- Test 10: Blind-Spot Preset, 20cm Default Threshold & Mock Hardware Telemetry ---');
    await evaluate(`document.getElementById('btn-preset').click()`);
    await evaluate(`document.getElementById('btn-hw-mode').click()`);

    // Ingest simulated telemetry: Left obstacle at boundary L=20cm (<=20cm default threshold), Right clear R=21cm (>20cm), Left Indicator IL=1
    const hwRes = await evaluate(`(() => {
      const app = window.__app;
      const hw = app.hardware;
      // Ingest message via handleData directly on controller
      hw['handleData']('L=20,R=21,IL=1,IR=0\\n');
      
      const compL = app.graph.getAllComponents().find(c => c.label === 'L');
      const compR = app.graph.getAllComponents().find(c => c.label === 'R');
      const compWL = app.graph.getAllComponents().find(c => c.label === 'W_L');
      const compAlert = app.graph.getAllComponents().find(c => c.label === 'ALERT');
      const compSafe = app.graph.getAllComponents().find(c => c.label === 'SAFE');
      const compBuzzer = app.graph.getAllComponents().find(c => c.label === 'BUZZER');

      return {
        L: compL.outputPorts[0].value,
        R: compR.outputPorts[0].value,
        W_L: compWL.inputPorts[0].value,
        ALERT: compAlert.inputPorts[0].value,
        SAFE: compSafe.inputPorts[0].value,
        BUZZER: compBuzzer.inputPorts[0].value
      };
    })()`);
    console.log('Hardware telemetry results (at 20cm boundary):', hwRes);
    if (hwRes.L !== 1 || hwRes.R !== 0 || hwRes.W_L !== 1 || hwRes.ALERT !== 1 || hwRes.SAFE !== 0 || hwRes.BUZZER !== 1) {
      throw new Error(`Hardware evaluation mismatch at 20cm threshold: ${JSON.stringify(hwRes)}`);
    }

    // Fail-safe test: invalid reading on L (L=-1 error code) must fail safe (SAFE must NOT be 1)
    const faultRes = await evaluate(`(() => {
      const app = window.__app;
      const hw = app.hardware;
      hw['handleData']('L=-1,R=50,IL=0,IR=0\\n');

      const compL = app.graph.getAllComponents().find(c => c.label === 'L');
      const compSafe = app.graph.getAllComponents().find(c => c.label === 'SAFE');
      const compBuzzer = app.graph.getAllComponents().find(c => c.label === 'BUZZER');

      return {
        L: compL.outputPorts[0].value,
        SAFE: compSafe.inputPorts[0].value,
        BUZZER: compBuzzer.inputPorts[0].value
      };
    })()`);
    console.log('Hardware sensor fault results (L=-1):', faultRes);
    if (faultRes.L !== 'X' || faultRes.SAFE === 1 || faultRes.BUZZER === 1) {
      throw new Error(`Sensor fault did not fail safely: ${JSON.stringify(faultRes)}`);
    }

    console.log('\n--- Test 11: Digital Waveform Viewer UI & Sampling Verification ---');
    // 1. Switch to Waveforms dock tab
    await evaluate(`document.querySelector('[data-tab="wave"]').click()`);
    const waveTabActive = await evaluate(`document.getElementById('panel-wave').classList.contains('dock-panel-active')`);
    console.log('Waveform panel active:', waveTabActive);
    if (!waveTabActive) throw new Error('Waveform tab did not activate panel-wave');

    // 2. Verify controls exist
    const waveControls = await evaluate(`({
      btnRecord: !!document.getElementById('wave-btn-record'),
      btnClear: !!document.getElementById('wave-btn-clear'),
      btnPicker: !!document.getElementById('wave-btn-picker'),
      preSeq: !!document.getElementById('wave-pre-seq'),
      preIo: !!document.getElementById('wave-pre-io'),
      preAll: !!document.getElementById('wave-pre-all'),
    })`);
    console.log('Waveform controls present:', waveControls);
    if (!waveControls.btnRecord || !waveControls.btnClear || !waveControls.btnPicker) {
      throw new Error('Waveform controls missing');
    }

    // 3. Clear trace
    await evaluate(`document.getElementById('wave-btn-clear').click()`);
    const stepCountAfterClear = await evaluate(`window.__app.wavePanel.getEngine().getStepCount()`);
    console.log('Step count after clear:', stepCountAfterClear);
    if (stepCountAfterClear !== 0) throw new Error(`Expected step count 0 after clear, got ${stepCountAfterClear}`);

    // 4. Select sequential & clock signals or IO
    await evaluate(`document.getElementById('wave-pre-io').click()`);
    const traceCount = await evaluate(`window.__app.wavePanel.getEngine().getTraces().length`);
    console.log('Traces selected via preset:', traceCount);
    if (traceCount === 0) throw new Error('Expected at least 1 trace for IO preset');

    // 5. Trigger a simulation step and verify discrete sample capture
    await evaluate(`(() => {
      const app = window.__app;
      const compL = app.graph.getAllComponents().find(c => c.label === 'L');
      app.graph.toggleInput(compL.id);
      app.propagate();
    })()`);
    const stepCount1 = await evaluate(`window.__app.wavePanel.getEngine().getStepCount()`);
    console.log('Step count after 1 propagation:', stepCount1);
    if (stepCount1 !== 1) throw new Error(`Expected step count 1, got ${stepCount1}`);

    // 6. Test pause / resume
    await evaluate(`document.getElementById('wave-btn-record').click()`);
    const isWavePaused = await evaluate(`!window.__app.wavePanel.getEngine().isRecording()`);
    console.log('Waveform recording paused:', isWavePaused);
    if (!isWavePaused) throw new Error('Waveform recording failed to pause');

    // Trigger step while paused -> step count must remain 1
    await evaluate(`(() => {
      const app = window.__app;
      const compL = app.graph.getAllComponents().find(c => c.label === 'L');
      app.graph.toggleInput(compL.id);
      app.propagate();
    })()`);
    const stepCountPaused = await evaluate(`window.__app.wavePanel.getEngine().getStepCount()`);
    console.log('Step count while paused:', stepCountPaused);
    if (stepCountPaused !== 1) throw new Error(`Expected step count to stay 1 while paused, got ${stepCountPaused}`);

    // Resume recording
    await evaluate(`document.getElementById('wave-btn-record').click()`);
    const isWaveResumed = await evaluate(`window.__app.wavePanel.getEngine().isRecording()`);
    console.log('Waveform recording resumed:', isWaveResumed);
    if (!isWaveResumed) throw new Error('Waveform recording failed to resume');

    // Trigger step after resume -> step count becomes 2
    await evaluate(`(() => {
      const app = window.__app;
      const compL = app.graph.getAllComponents().find(c => c.label === 'L');
      app.graph.toggleInput(compL.id);
      app.propagate();
    })()`);
    const stepCountResumed = await evaluate(`window.__app.wavePanel.getEngine().getStepCount()`);
    console.log('Step count after resume propagation:', stepCountResumed);
    if (stepCountResumed !== 2) throw new Error(`Expected step count 2, got ${stepCountResumed}`);

    // 7. Verify canvas rendering & signal picker UI
    await evaluate(`document.getElementById('wave-btn-picker').click()`);
    const pickerVisible = await evaluate(`!!document.querySelector('.wave-picker-box')`);
    const hasCanvas = await evaluate(`!!document.getElementById('wave-canvas')`);
    console.log('Signal picker box visible:', pickerVisible, 'Canvas element rendered:', hasCanvas);
    if (!pickerVisible || !hasCanvas) throw new Error('Waveform picker or canvas missing');

    console.log('\n--- Test 12: Waveform Panel Non-Interference & Circuit Save/Load Roundtrip ---');
    // Verify that all waveform panel actions (tab switching, pause, clear, presets) do not alter circuit state
    const nonInterferenceRes = await evaluate(`(() => {
      const app = window.__app;
      // Get baseline state of L, R, W_L, BUZZER
      const getVal = (label) => {
        const c = app.graph.getAllComponents().find(comp => comp.label === label);
        return c.outputPorts.length > 0 ? c.outputPorts[0].value : c.inputPorts[0].value;
      };

      const baseline = {
        L: getVal('L'),
        R: getVal('R'),
        IL: getVal('IL'),
        IR: getVal('IR'),
        W_L: getVal('W_L'),
        BUZZER: getVal('BUZZER')
      };

      // Perform waveform operations
      document.getElementById('wave-btn-clear').click();
      document.getElementById('wave-pre-seq').click();
      document.getElementById('wave-btn-record').click(); // toggle
      document.getElementById('wave-pre-all').click();
      document.querySelector('[data-tab="tt"]').click(); // switch to truth table
      document.querySelector('[data-tab="wave"]').click(); // switch back

      const after = {
        L: getVal('L'),
        R: getVal('R'),
        IL: getVal('IL'),
        IR: getVal('IR'),
        W_L: getVal('W_L'),
        BUZZER: getVal('BUZZER')
      };

      // Verify save/load serializer roundtrip via history stack (uses CircuitSerializer.serialize & deserialize)
      const initialCompCount = app.graph.getAllComponents().length;
      app.pushHistory(); // Serializes current graph
      app.graph.clear();
      app.undo(); // Deserializes and calls switchGraph
      const roundtripOk = app.graph.getAllComponents().length === initialCompCount;

      return {
        baseline,
        after,
        identical: JSON.stringify(baseline) === JSON.stringify(after),
        roundtripOk
      };
    })()`);

    console.log('Waveform non-interference & save/load check:', nonInterferenceRes);
    if (!nonInterferenceRes.identical) {
      throw new Error('Waveform panel actions altered circuit state!');
    }
    if (!nonInterferenceRes.roundtripOk) {
      throw new Error('CircuitSerializer JSON roundtrip failed!');
    }

    console.log('\n✅ ALL 12 BROWSER END-TO-END QA TESTS PASSED SUCCESSFULLY!');
  } catch (err) {
    passedAll = false;
    console.error('\n❌ Browser QA failed:', err);
  } finally {
    chrome.kill();
    server.close();
    process.exit(passedAll ? 0 : 1);
  }
}

run();
