(() => {
  'use strict';

  const canvas = document.querySelector('#gameCanvas');
  const ctx = canvas.getContext('2d');
  const ui = {
    score: document.querySelector('#score'), multiplier: document.querySelector('#multiplier'), best: document.querySelector('#best'),
    start: document.querySelector('#startScreen'), pause: document.querySelector('#pauseScreen'), over: document.querySelector('#gameOverScreen'),
    finalScore: document.querySelector('#finalScore'), finalCores: document.querySelector('#finalCores'), sound: document.querySelector('#soundButton'),
    powerStatus: document.querySelector('#powerStatus'), powerTimer: document.querySelector('#powerTimer'), powerLabel: document.querySelector('#powerLabel'),
    boneStatus: document.querySelector('#boneStatus'), boneLabel: document.querySelector('#boneLabel'), boneCount: document.querySelector('#boneCount')
  };

  let width = 900, height = 560, raf = 0, last = 0, state = 'menu', score = 0, cores = 0, combo = 1, comboTimer = 0;
  let muted = false, audio = null, shake = 0, spawnTimer = 0, coreTimer = 0, elapsed = 0, deathTime = 0, killer = null;
  let powerTimer = 0, proteinCooldown = 0, giantTimer = 0, nextGiantScore = 5000;
  let boneCount = 0, boneCooldown = 0, boneFeastTimer = 0;
  const keys = new Set(), enemies = [], particles = [], dogBits = [], baitBones = [], stars = [];
  const player = { x: 0, y: 0, r: 10, speed: 285, trail: [] };
  const core = { x: 0, y: 0, r: 11, pulse: 0 };
  const protein = { x: 0, y: 0, r: 14, pulse: 0, active: false };
  const bone = { x: 0, y: 0, r: 10, pulse: 0, active: false };
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

  function placeProtein() {
    protein.x = 70 + Math.random() * Math.max(40, width - 140);
    protein.y = 90 + Math.random() * Math.max(40, height - 170);
    protein.pulse = 0;
    protein.active = true;
  }

  function placeBone() {
    bone.x = 55 + Math.random() * Math.max(50, width - 110);
    bone.y = 75 + Math.random() * Math.max(45, height - 145);
    bone.pulse = Math.random() * Math.PI * 2; bone.active = true;
  }

  function reset() {
    score = 0; cores = 0; combo = 1; comboTimer = 0; elapsed = 0; spawnTimer = 1.2; coreTimer = 0;
    deathTime = 0; killer = null; powerTimer = 0; proteinCooldown = 7; protein.active = false; giantTimer = 0; nextGiantScore = 5000;
    boneCount = 0; boneCooldown = 2.5; boneFeastTimer = 0; bone.active = false;
    enemies.length = 0; particles.length = 0; dogBits.length = 0; baitBones.length = 0; player.trail.length = 0; player.x = width / 2; player.y = height / 2;
    ui.powerStatus.classList.remove('active');
    ui.boneStatus.classList.remove('feast'); ui.boneLabel.textContent = '🦴 КОСТОЧКИ'; ui.boneCount.textContent = '0/10';
    placeCore(); updateHud();
  }

  async function requestLandscape() {
    if (!matchMedia('(max-width: 900px)').matches || !screen.orientation?.lock) return;
    try { await screen.orientation.lock('landscape'); } catch { /* Safari показывает подсказку повернуть телефон. */ }
  }

  function start() {
    void requestLandscape();
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
    enemies.push({ x, y, r: 9 + Math.random() * 5, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, phase: Math.random() * 7, age: 0, eating: false, boneTarget: Math.floor(Math.random()*10) });
  }

  function burst(x, y, color, amount = 14) {
    for (let i = 0; i < amount; i++) { const a = Math.random() * Math.PI * 2, speed = 40 + Math.random() * 170; particles.push({ x, y, vx: Math.cos(a)*speed, vy: Math.sin(a)*speed, life: .35+Math.random()*.5, max: .85, color, size: 1+Math.random()*3 }); }
  }

  function puppyYelp() {
    if (muted) return;
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    [0, .055].forEach((delay, index) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = index ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(1050 - index * 180, now + delay);
      osc.frequency.exponentialRampToValueAtTime(360, now + delay + .2);
      gain.gain.setValueAtTime(.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(.055, now + delay + .018);
      gain.gain.exponentialRampToValueAtTime(.0001, now + delay + .23);
      osc.connect(gain).connect(audio.destination); osc.start(now + delay); osc.stop(now + delay + .24);
    });
  }

  function scatterDog(e) {
    burst(e.x, e.y, '#ff4f91', 30);
    for (let i = 0; i < 9; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 100 + Math.random() * 240;
      dogBits.push({ x:e.x, y:e.y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, angle, spin:(Math.random()-.5)*15, life:.65+Math.random()*.45, max:1.1, size:3+Math.random()*5 });
    }
    puppyYelp(); shake = 8; score += 150;
  }

  function activateGiant() {
    nextGiantScore += 5000; giantTimer = 10; player.x = width / 2; player.y = height / 2; shake = 18;
    proteinCooldown = Math.max(proteinCooldown, 10);
    ui.powerLabel.textContent = '🐾 ГИГАКОТ'; ui.powerTimer.textContent = '10.0'; ui.powerStatus.classList.add('active');
    cores++; combo = 8; comboTimer = 4; score += 600;
    burst(core.x, core.y, '#6ff7ed', 36); core.x = -1000; core.y = -1000;
    if (protein.active) {
      protein.active = false; powerTimer = Math.max(powerTimer, 20); proteinCooldown = 24;
      burst(protein.x, protein.y, '#ffe16b', 42);
    }
    enemies.forEach(e => { e.vx *= .72; e.vy *= .72; });
    tone(130, .25, 'sawtooth', .045); setTimeout(() => tone(260, .3, 'square', .04), 100);
  }

  function startBoneFeast() {
    boneCount = 0; boneFeastTimer = 10; bone.active = false; baitBones.length = 0;
    for (let i = 0; i < 10; i++) {
      baitBones.push({ x:55+Math.random()*Math.max(50,width-110), y:75+Math.random()*Math.max(45,height-145), angle:Math.random()*Math.PI, pulse:Math.random()*6 });
    }
    enemies.forEach((e,index)=>{e.boneTarget=index%baitBones.length;e.eating=false;});
    ui.boneStatus.classList.add('feast'); ui.boneLabel.textContent = '🦴 КОСТЯНОЙ ПИР'; ui.boneCount.textContent = '10.0с';
    baitBones.forEach(b=>burst(b.x,b.y,'#f5d8aa',5)); tone(190,.12,'square',.035); setTimeout(()=>tone(285,.16,'triangle',.035),80);
  }

  function endBoneFeast() {
    boneFeastTimer = 0; baitBones.length = 0; boneCooldown = 2;
    enemies.forEach(e=>{const angle=Math.random()*Math.PI*2,speed=70+Math.random()*45;e.vx=Math.cos(angle)*speed;e.vy=Math.sin(angle)*speed;e.eating=false;});
    ui.boneStatus.classList.remove('feast'); ui.boneLabel.textContent = '🦴 КОСТОЧКИ'; ui.boneCount.textContent = '0/10';
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
    if (giantTimer <= 0 && score >= nextGiantScore) activateGiant();
    if (boneFeastTimer > 0) {
      boneFeastTimer = Math.max(0,boneFeastTimer-dt); ui.boneCount.textContent = `${boneFeastTimer.toFixed(1)}с`;
      baitBones.forEach(b=>b.pulse+=dt*5);
      if (boneFeastTimer === 0) endBoneFeast();
    } else if (!bone.active) {
      boneCooldown -= dt; if (boneCooldown <= 0) placeBone();
    } else {
      bone.pulse += dt*5;
      if (Math.hypot(player.x-bone.x,player.y-bone.y) < player.r+bone.r+5) {
        bone.active=false; boneCount++; score+=90; burst(bone.x,bone.y,'#f5d8aa',18); tone(240+boneCount*18,.09,'triangle',.03);
        ui.boneCount.textContent = `${boneCount}/10`;
        if (boneCount >= 10) startBoneFeast(); else boneCooldown = 2+Math.random()*2.5;
      }
    }
    if (giantTimer > 0) {
      giantTimer = Math.max(0, giantTimer - dt); player.x = width / 2; player.y = height / 2;
      ui.powerLabel.textContent = '🐾 ГИГАКОТ'; ui.powerTimer.textContent = giantTimer.toFixed(1);
      if (giantTimer === 0) {
        placeCore();
        ui.powerLabel.textContent = '⚡ СУПЕРКОТ';
        ui.powerStatus.classList.toggle('active', powerTimer > 0);
      }
    } else if (powerTimer > 0) {
      powerTimer = Math.max(0, powerTimer - dt);
      ui.powerTimer.textContent = powerTimer.toFixed(1);
      ui.powerStatus.classList.toggle('active', powerTimer > 0);
    }
    if (!protein.active) {
      proteinCooldown -= dt;
      if (proteinCooldown <= 0) placeProtein();
    } else {
      protein.pulse += dt * 5;
      if (Math.hypot(player.x-protein.x, player.y-protein.y) < player.r+protein.r+5) {
        protein.active = false; proteinCooldown = 18 + Math.random() * 10; powerTimer = 20;
        ui.powerTimer.textContent = '20.0'; ui.powerStatus.classList.add('active');
        burst(protein.x, protein.y, '#ffe16b', 42); tone(330, .12, 'square', .04);
        setTimeout(() => tone(660, .16, 'triangle', .05), 90);
      }
    }
    if (comboTimer <= 0 && combo > 1) { combo = 1; updateHud(); }
    let dx = (keys.has('right') ? 1 : 0) - (keys.has('left') ? 1 : 0), dy = (keys.has('down') ? 1 : 0) - (keys.has('up') ? 1 : 0);
    if (dx || dy) { const m = Math.hypot(dx,dy); dx/=m; dy/=m; }
    const speedBoost = powerTimer > 0 ? 1.22 : 1;
    if (giantTimer <= 0) {
      player.x = Math.max(player.r, Math.min(width-player.r, player.x + dx*player.speed*speedBoost*dt)); player.y = Math.max(55+player.r, Math.min(height-player.r, player.y + dy*player.speed*speedBoost*dt));
    }
    player.trail.unshift({x:player.x,y:player.y}); if(player.trail.length>15) player.trail.pop();
    core.pulse += dt * 5; coreTimer += dt;
    if (Math.hypot(player.x-core.x, player.y-core.y) < player.r+core.r+4) {
      cores++; combo = Math.min(8, combo + 1); comboTimer = 4; score += 75 * combo; burst(core.x, core.y, '#6ff7ed', 20); tone(420 + combo*55, .11, 'triangle', .035); placeCore(); updateHud();
    }
    spawnTimer -= dt; if (spawnTimer <= 0) { spawnEnemy(); spawnTimer = Math.max(.34, 1.12 - elapsed*.012); }
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (boneFeastTimer > 0 && baitBones.length) {
        const target=baitBones[e.boneTarget%baitBones.length], bx=target.x-e.x, by=target.y-e.y, distance=Math.hypot(bx,by);
        if (distance > 13) {
          const feastSpeed=Math.max(72,Math.hypot(e.vx,e.vy));e.vx=bx/distance*feastSpeed;e.vy=by/distance*feastSpeed;e.eating=false;
        } else {
          e.vx=Math.sin(elapsed*8+e.phase)*3;e.vy=Math.cos(elapsed*7+e.phase)*3;e.eating=true;
        }
      } else e.eating=false;
      e.x += e.vx * dt; e.y += e.vy * dt; e.phase += dt * 5; e.age += dt;
      if (giantTimer > 0) {
        const top = 58 + e.r;
        if (e.x < e.r) { e.x = e.r; e.vx = Math.abs(e.vx); }
        if (e.x > width-e.r) { e.x = width-e.r; e.vx = -Math.abs(e.vx); }
        if (e.y < top) { e.y = top; e.vy = Math.abs(e.vy); }
        if (e.y > height-e.r) { e.y = height-e.r; e.vy = -Math.abs(e.vy); }
      }
      const hitRadius = giantTimer > 0 ? Math.max(width,height)*.42 : player.r;
      if (Math.hypot(player.x-e.x,player.y-e.y) < hitRadius+e.r-2) {
        if (powerTimer > 0 || giantTimer > 0) { scatterDog(e); enemies.splice(i, 1); continue; }
        gameOver(e);
      }
      const outside = e.x < -80 || e.x > width + 80 || e.y < -80 || e.y > height + 80;
      if (giantTimer <= 0 && (e.age > 20 || (e.age > 3 && outside))) enemies.splice(i, 1);
    }
    particles.forEach(p => { p.x+=p.vx*dt;p.y+=p.vy*dt;p.vx*=.97;p.vy*=.97;p.life-=dt; });
    for(let i=particles.length-1;i>=0;i--) if(particles[i].life<=0) particles.splice(i,1);
    dogBits.forEach(p => { p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=210*dt;p.angle+=p.spin*dt;p.life-=dt; });
    for(let i=dogBits.length-1;i>=0;i--) if(dogBits[i].life<=0) dogBits.splice(i,1);
    updateHud();
  }

  function drawGrid() {
    ctx.strokeStyle='#242b4a55';ctx.lineWidth=1;const gap=48, ox=(elapsed*8)%gap, oy=(elapsed*4)%gap;
    for(let x=-gap+ox;x<width+gap;x+=gap){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,height);ctx.stroke();}
    for(let y=-gap+oy;y<height+gap;y+=gap){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(width,y);ctx.stroke();}
    stars.forEach(s=>{ctx.fillStyle=`rgba(125,151,200,${s.a})`;ctx.fillRect(s.x*width,s.y*height,s.s,s.s);});
  }

  function drawBone(x,y,angle=0,scale=1,glow='#f5d8aa') {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);ctx.scale(scale,scale);ctx.shadowBlur=14;ctx.shadowColor=glow;ctx.strokeStyle='#8b684a';ctx.fillStyle='#f5d8aa';ctx.lineWidth=1;
    ctx.fillRect(-7,-3,14,6);
    [[-8,-4],[-8,4],[8,-4],[8,4]].forEach(([bx,by])=>{ctx.beginPath();ctx.arc(bx,by,4,0,Math.PI*2);ctx.fill();ctx.stroke();});
    ctx.restore();
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
    if (protein.active) {
      ctx.save(); ctx.translate(protein.x, protein.y + Math.sin(protein.pulse) * 2);
      ctx.shadowBlur = 30; ctx.shadowColor = '#ffe16b'; ctx.strokeStyle = '#ffe16b'; ctx.lineWidth = 2;
      ctx.fillStyle = '#592b79'; ctx.beginPath(); ctx.moveTo(-15,-3); ctx.lineTo(15,-3); ctx.lineTo(10,11); ctx.quadraticCurveTo(0,15,-10,11); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff3a1'; ctx.beginPath(); ctx.ellipse(0,-3,15,5,0,0,Math.PI*2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 8; ctx.shadowColor = '#a855f7'; ctx.fillStyle = '#a855f7';
      [-8,-3,3,8].forEach((x,index)=>{ctx.beginPath();ctx.arc(x,-3+(index%2)*2,3,0,Math.PI*2);ctx.fill();});
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = '900 9px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('P',0,8);
      ctx.restore();
    }
    if (bone.active) drawBone(bone.x,bone.y+Math.sin(bone.pulse)*2,Math.sin(bone.pulse*.45)*.25,1,'#f5d8aa');
    baitBones.forEach((b,index)=>drawBone(b.x,b.y+Math.sin(b.pulse+index)*1.5,b.angle,.85,'#ffb870'));
    player.trail.forEach((t,i)=>{ctx.beginPath();ctx.arc(t.x,t.y,Math.max(1,player.r*(1-i/player.trail.length)*.65),0,Math.PI*2);ctx.fillStyle=powerTimer>0?`rgba(255,225,107,${.34*(1-i/player.trail.length)})`:`rgba(111,247,237,${.23*(1-i/player.trail.length)})`;ctx.fill();});
    const deathAge = state === 'over' ? (performance.now() - deathTime) / 1000 : 0;
    ctx.save();
    ctx.translate(player.x, player.y);
    if (giantTimer > 0) {
      const targetScale = Math.max(width / 34, height / 25);
      const growth = Math.min(1, (10 - giantTimer) / .45);
      ctx.scale(1 + (targetScale - 1) * growth, 1 + (targetScale - 1) * growth);
    }
    if (state === 'over') ctx.rotate(Math.sin(deathAge * 24) * Math.max(0, .22 - deathAge * .16));
    if (powerTimer > 0) {
      const flutter = Math.sin(elapsed * 12) * 2;
      ctx.shadowBlur = 24; ctx.shadowColor = '#ff315d'; ctx.fillStyle = '#e31945'; ctx.strokeStyle = '#ff7793'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-7,-5); ctx.quadraticCurveTo(-20,2+flutter,-18,18); ctx.lineTo(-4,10); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,18+Math.sin(elapsed*8)*2,0,Math.PI*2); ctx.strokeStyle='#ffe16b66'; ctx.lineWidth=2; ctx.stroke();
    }
    ctx.shadowBlur = powerTimer > 0 ? 30 : 20; ctx.shadowColor = powerTimer > 0 ? '#ffe16b' : '#6ff7ed';
    ctx.strokeStyle = powerTimer > 0 ? '#ffe16b' : '#6ff7ed'; ctx.fillStyle = powerTimer > 0 ? '#fff7bd' : '#bffff9'; ctx.lineWidth = 2;
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
    if (powerTimer > 0) {
      ctx.fillStyle='#e31945';ctx.strokeStyle='#ffe16b';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-4,7);ctx.lineTo(0,5);ctx.lineTo(4,7);ctx.lineTo(0,11);ctx.closePath();ctx.fill();ctx.stroke();
    }
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
      if (e.eating) {
        ctx.fillStyle='#321322';ctx.beginPath();ctx.ellipse(0,6,4.5,2.7,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#f5d8aa';ctx.beginPath();ctx.arc(-6+Math.sin(elapsed*18+e.phase)*2,8,1.2,0,Math.PI*2);ctx.arc(6,7+Math.cos(elapsed*16)*2,1,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    });
    dogBits.forEach(p=>{
      ctx.save();ctx.globalAlpha=Math.max(0,p.life/p.max);ctx.translate(p.x,p.y);ctx.rotate(p.angle);
      ctx.shadowBlur=9;ctx.shadowColor='#ff4f91';ctx.fillStyle='#ff82ad';ctx.strokeStyle='#ff4f91';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(-p.size,-p.size*.7);ctx.lineTo(p.size,0);ctx.lineTo(-p.size,p.size*.7);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
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
  addEventListener('resize',resize);
  addEventListener('orientationchange',()=>setTimeout(resize,150));
  window.visualViewport?.addEventListener('resize',resize);
  resize();player.x=width/2;player.y=height/2;placeCore();draw();
})();
