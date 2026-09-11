(() => {
  'use strict';

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    score: document.querySelector('#score'), multiplier: document.querySelector('#multiplier'), best: document.querySelector('#best'),
    start: document.querySelector('#startScreen'), pause: document.querySelector('#pauseScreen'), over: document.querySelector('#gameOverScreen'),
    finalScore: document.querySelector('#finalScore'), finalCores: document.querySelector('#finalCores'), sound: document.querySelector('#soundButton')
  };

  let width = 900, height = 560, raf = 0, last = 0, state = 'menu', score = 0, cores = 0, combo = 1, comboTimer = 0;
  let muted = false, audio = null, shake = 0, spawnTimer = 0, coreTimer = 0, elapsed = 0, deathTime = 0, killer = null;
  const keys = new Set(), enemies = [], particles = [], stars = [];
  const player = { x: 0, y: 0, r: 10, speed: 285, trail: [] };
  const core = { x: 0, y: 0, r: 11, pulse: 0 };
  let best = Number(localStorage.getItem('neon-dash-best') || 0);
  ui.best.textContent = String(best).padStart(5, '0');

  function resize() {
    const box = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    width = box.width; height = box.height; canvas.width = width * dpr; canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!stars.length) for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), a: Math.random() * .6 + .15, s: Math.random() * 1.4 + .3 });
  }

  function tone(freq, duration = .07, type = 'sine', volume = .025) {
    if (muted) return;
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const osc = audio.createOscillator(), gain = audio.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.setValueAtTime(volume, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.0001, audio.currentTime + duration);
    osc.connect(gain).connect(audio.destination); osc.start(); osc.stop(audio.currentTime + duration);
  }

  function placeCore() {
    core.x = 60 + Math.random() * (width - 120); core.y = 80 + Math.random() * (height - 140); core.pulse = 0;
  }

  function reset() {
    score = 0; cores = 0; combo = 1; comboTimer = 0; elapsed = 0; spawnTimer = 1.2; coreTimer = 0;
    deathTime = 0; killer = null; enemies.length = 0; particles.length = 0; player.trail.length = 0; player.x = width / 2; player.y = height / 2;
    placeCore(); updateHud();
  }

  function start() {
    reset(); state = 'playing'; document.querySelectorAll('.overlay').forEach(el => el.classList.remove('visible')); last = performance.now();
    tone(240, .08, 'square'); setTimeout(() => tone(480, .1, 'square'), 80); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop);
  }

  function spawnEnemy() {
    const edge = Math.floor(Math.random() * 4), pad = 35;
    let x, y;
    if (edge === 0) { x = Math.random() * width; y = -pad; } else if (edge === 1) { x = width + pad; y = Math.random() * height; }
    else if (edge === 2) { x = Math.random() * width; y = height + pad; } else { x = -pad; y = Math.random() * height; }
    const targetX = width * .2 + Math.random() * width * .6;
    const targetY = height * .2 + Math.random() * height * .6;
    const angle = Math.atan2(targetY - y, targetX - x);
    const speed = 55 + Math.min(72, elapsed * 1.55) + Math.random() * 18;
    enemies.push({ x, y, r: 9 + Math.random() * 5, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, phase: Math.random() * 7, age: 0 });
  }

  function burst(x, y, color, amount = 14) {
    for (let i = 0; i < amount; i++) { const a = Math.random() * Math.PI * 2, speed = 40 + Math.random() * 170; particles.push({ x, y, vx: Math.cos(a)*speed, vy: Math.sin(a)*speed, life: .35+Math.random()*.5, max: .85, color, size: 1+Math.random()*3 }); }
  }

  function updateHud() { ui.score.textContent = String(Math.floor(score)).padStart(5, '0'); ui.multiplier.textContent = `×${combo}`; }

  function gameOver(catcher) {
    if (state !== 'playing') return;
    state = 'over'; deathTime = performance.now(); killer = catcher; killer.scary = true; shake = 14; burst(player.x, player.y, '#ff4f91', 40); tone(95, .35, 'sawtooth', .045);
    best = Math.max(best, Math.floor(score)); localStorage.setItem('neon-dash-best', best); ui.best.textContent = String(best).padStart(5, '0');
    ui.finalScore.textContent = Math.floor(score); ui.finalCores.textContent = cores;
    setTimeout(() => ui.over.classList.add('visible'), 1100);
  }

  function update(dt) {
    elapsed += dt; score += dt * (7 + combo * 2); comboTimer -= dt;
    if (comboTimer <= 0 && combo > 1) { combo = 1; updateHud(); }
    let dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (dx || dy) { const m = Math.hypot(dx,dy); dx/=m; dy/=m; }
    player.x = Math.max(player.r, Math.min(width-player.r, player.x + dx*player.speed*dt)); player.y = Math.max(55+player.r, Math.min(height-player.r, player.y + dy*player.speed*dt));
    player.trail.unshift({x:player.x,y:player.y}); if(player.trail.length>15) player.trail.pop();
    core.pulse += dt * 5; coreTimer += dt;
    if (Math.hypot(player.x-core.x, player.y-core.y) < player.r+core.r+4) {
      cores++; combo = Math.min(8, combo + 1); comboTimer = 4; score += 75 * combo; burst(core.x, core.y, '#6ff7ed', 20); tone(420 + combo*55, .11, 'triangle', .035); placeCore(); updateHud();
    }
    spawnTimer -= dt; if (spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.34, 1.12 - elapsed*.012); }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      e.x += e.vx * dt; e.y += e.vy * dt; e.phase += dt * 5; e.age += dt;
      if (Math.hypot(player.x-e.x,player.y-e.y) < player.r+e.r-2) gameOver(e);
      const outside = e.x < -80 || e.x > width + 80 || e.y < -80 || e.y > height + 80;
      if (e.age > 20 || (e.age > 3 && outside)) enemies.splice(i, 1);
    }
    particles.forEach(p => { p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt; });
    for(let i=particles.length-1;i>=0;i--) if(particles[i].life<=0) particles.splice(i,1);
    updateHud();
  }

  function drawGrid() {
    ctx.strokeStyle='#242b4a55';ctx.lineWidth=1;const gap=48, ox=(elapsed*8)%gap, oy=(elapsed*4)%gap;
    for(let x=-gap+ox;x<width+gap;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
    for(let y=-gap+oy;y<height+gap;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    stars.forEach(s=>{ctx.fillStyle=`rgba(125,151,200,${s.a})`;ctx.fillRect(s.x*width,s.y*height,s.s,s.s);});
  }

  function draw() {
    ctx.save(); if(shake>0){ctx.translate((Math.random()-.5)*shake,(Math.random()-.5)*shake);shake*=.88;}
    ctx.clearRect(-20,-20,width+40,height+40); const g=ctx.createRadialGradient(width*.5,height*.4,0,width*.5,height*.4,Math.max(width,height)*.75);g.addColorStop(0,'#111735');g.addColorStop(1,'#050713');ctx.fillStyle=g;ctx.fillRect(0,0,width,height);drawGrid();
    ctx.save();
    ctx.translate(core.x, core.y + Math.sin(core.pulse) * 1.5);
    ctx.shadowBlur = 24; ctx.shadowColor = '#6ff7ed'; ctx.strokeStyle = '#6ff7ed'; ctx.fillStyle = '#18384a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-12, -2); ctx.lineTo(12, -2); ctx.lineTo(8, 9); ctx.quadraticCurveTo(0, 12, -8, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -2, 12, 4, 0, 0, Math.PI * 2); ctx.fillStyle = '#79fff4'; ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 10; ctx.shadowColor = '#ffb84f'; ctx.fillStyle = '#ffb84f';
    [[-6,-3],[-1,-1],[4,-4],[7,0],[-4,1],[2,1]].forEach(([x,y]) => { ctx.beginPath(); ctx.arc(x, y, 2.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.shadowBlur = 0; ctx.fillStyle = '#ff4f91'; ctx.beginPath(); ctx.arc(0, 6, 2.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    player.trail.forEach((t,i)=>{ctx.beginPath();ctx.arc(t.x,t.y,Math.max(1,player.r*(1-i/player.trail.length)*.65),0,Math.PI*2);ctx.fillStyle=`rgba(111,247,237,${.23*(1-i/player.trail.length)})`;ctx.fill();});
    const deathAge = state === 'over' ? (performance.now() - deathTime) / 1000 : 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (state === 'over') ctx.rotate(Math.sin(deathAge * 24) * Math.max(0, .22 - deathAge * .16));
    ctx.shadowBlur = 20; ctx.shadowColor = '#6ff7ed';
    ctx.strokeStyle = '#6ff7ed'; ctx.fillStyle = '#bffff9'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(8, 5, 8, -.7, 1.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-9, -5); ctx.lineTo(-7, -14); ctx.lineTo(-1, -8); ctx.lineTo(5, -14); ctx.lineTo(9, -5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.fillStyle = '#091126';
    if (state !== 'over') {
      ctx.beginPath(); ctx.ellipse(-4, -1, 1.4, 2.2, 0, 0, Math.PI * 2); ctx.ellipse(4, -1, 1.4, 2.2, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const t = Math.min(1, deathAge / .7), eyeY = -1 - 25 * t + 13 * t * t;
      ctx.strokeStyle = '#d9fffb88'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-4, -1); ctx.lineTo(-4 - 16 * t, eyeY); ctx.moveTo(4, -1); ctx.lineTo(4 + 16 * t, eyeY); ctx.stroke();
      [[-4 - 18 * t, eyeY], [4 + 18 * t, eyeY]].forEach(([x,y], index) => {
        ctx.shadowBlur = 13; ctx.shadowColor = '#ffffff'; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 4.5, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#091126'; ctx.beginPath(); ctx.arc(x + (index ? -1 : 1), y + 1, 1.8, 0, Math.PI * 2); ctx.fill();
      });
    }
    ctx.fillStyle = '#ff4f91'; ctx.beginPath(); ctx.moveTo(-2, 3); ctx.lineTo(2, 3); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#d9fffb'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-5, 4); ctx.lineTo(-14, 2); ctx.moveTo(-5, 6); ctx.lineTo(-14, 7); ctx.moveTo(5, 4); ctx.lineTo(14, 2); ctx.moveTo(5, 6); ctx.lineTo(14, 7); ctx.stroke();
    ctx.restore();
    enemies.forEach(e => {
      ctx.save();
      ctx.translate(e.x, e.y); ctx.rotate(Math.sin(e.phase) * .08); ctx.scale(e.r / 12, e.r / 12);
      ctx.shadowBlur = 18; ctx.shadowColor = '#ff4f91'; ctx.strokeStyle = '#ff4f91'; ctx.fillStyle = '#ff9fc2'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(-9, -2, 4, 9, -.28, 0, Math.PI * 2); ctx.ellipse(9, -2, 4, 9, .28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;
      if (e.scary) {
        ctx.fillStyle = '#101329'; ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-2, -1); ctx.lineTo(-7, 0); ctx.closePath(); ctx.moveTo(7, -4); ctx.lineTo(2, -1); ctx.lineTo(7, 0); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 12; ctx.shadowColor = '#ff174f'; ctx.fillStyle = '#22020d'; ctx.beginPath(); ctx.ellipse(0, 5, 7.5, 5.5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff';
        [-5,-2,1,4].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 1); ctx.lineTo(x + 2, 1); ctx.lineTo(x + 1, 4); ctx.closePath(); ctx.fill(); });
        [-4,-1,2].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 9); ctx.lineTo(x + 2, 9); ctx.lineTo(x + 1, 6); ctx.closePath(); ctx.fill(); });
      } else {
        ctx.fillStyle = '#101329'; ctx.beginPath(); ctx.arc(-3.5, -2, 1.3, 0, Math.PI * 2); ctx.arc(3.5, -2, 1.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffd6e5'; ctx.beginPath(); ctx.ellipse(0, 4, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#101329'; ctx.beginPath(); ctx.ellipse(0, 2.5, 2.2, 1.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#101329'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, 6); ctx.arc(2, 6, 2, Math.PI, 0); ctx.stroke();
      }
      ctx.restore();
    });
    particles.forEach(p=>{ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,p.size,p.size);});ctx.globalAlpha=1;ctx.restore();
  }

  function loop(now) { const dt=Math.min(.033,(now-last)/1000);last=now;if(state==='playing')update(dt);draw();if(state==='playing'||state==='over')raf=requestAnimationFrame(loop); }
  function togglePause(){if(state==='playing'){state='paused';ui.pause.classList.add('visible');}else if(state==='paused'){state='playing';ui.pause.classList.remove('visible');last=performance.now();raf=requestAnimationFrame(loop);}}
  const keyMap={ArrowLeft:'left',a:'left',A:'left',ф:'left',Ф:'left',ArrowRight:'right',d:'right',D:'right',в:'right',В:'right',ArrowUp:'up',w:'up',W:'up',ц:'up',Ц:'up',ArrowDown:'down',s:'down',S:'down',ы:'down',Ы:'down'};
  addEventListener('keydown',e=>{if(keyMap[e.key]){e.preventDefault();keys.add(keyMap[e.key]);}if(e.key==='p'||e.key==='P'||e.key==='з'||e.key==='З')togglePause();}); addEventListener('keyup',e=>{if(keyMap[e.key])keys.delete(keyMap[e.key]);});
  document.querySelectorAll('[data-dir]').forEach(btn=>{const dir=btn.dataset.dir;btn.addEventListener('pointerdown',e=>{e.preventDefault();keys.add(dir);btn.setPointerCapture(e.pointerId);});btn.addEventListener('pointerup',()=>keys.delete(dir));btn.addEventListener('pointercancel',()=>keys.delete(dir));});
  document.querySelector('#startButton').addEventListener('click',start);document.querySelector('#restartButton').addEventListener('click',start);document.querySelector('#resumeButton').addEventListener('click',togglePause);
  ui.sound.addEventListener('click',()=>{muted=!muted;ui.sound.classList.toggle('muted',muted);ui.sound.textContent=muted?'○ БЕЗ ЗВУКА':'◉ ЗВУК';});
  addEventListener('resize',resize);resize();player.x=width/2;player.y=height/2;placeCore();draw();
})();
