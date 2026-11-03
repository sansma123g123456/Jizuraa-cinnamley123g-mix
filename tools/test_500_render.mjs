import fs from 'fs';
import { JSDOM } from 'jsdom';

const html = fs.readFileSync('index.html', 'utf8');

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true
});

const window = dom.window;

// Wait for scripts to initialize
setTimeout(() => {
  try {
    console.log('Testing 500% effect parameters...');
    const S = window.S;
    if (!S) {
      console.error('window.S not found!');
      process.exit(1);
    }
    
    // Set all fx sliders to 5.0 (500%)
    S.project.fx.motion = 5.0;
    S.project.fx.glitch = 5.0;
    S.project.fx.chroma = 5.0;
    S.project.fx.decor = 5.0;
    S.project.fx.density = 5.0;
    S.project.fx.texture = 5.0;
    S.project.fx.bgSwitch = 5.0;

    console.log('Re-planning with 500% fx...');
    window.replan();

    console.log('Plan generated with', S.plan.cuts.length, 'cuts and', S.plan.events.length, 'events.');

    const c = window.document.getElementById('view');
    const ctx = c.getContext('2d');

    console.log('Rendering 300 frames across timeline...');
    let errors = 0;
    const dur = S.plan.duration || 10;
    for (let i = 0; i < 300; i++) {
      const t = (i / 300) * dur;
      try {
        S.renderer.frame(ctx, S.plan, t, { scale: 1 });
      } catch (err) {
        console.error(`Render error at frame ${i} (t=${t.toFixed(2)}):`, err);
        errors++;
        if (errors > 10) break;
      }
    }

    if (errors === 0) {
      console.log('SUCCESS: All 300 frames rendered without error at 500% fx!');
    } else {
      console.log(`FAILED with ${errors} render errors.`);
    }

    process.exit(errors > 0 ? 1 : 0);
  } catch (e) {
    console.error('Exception during test:', e);
    process.exit(1);
  }
}, 500);
