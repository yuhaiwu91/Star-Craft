import React, { useState, useEffect, useRef } from 'react';

// ─── 常量配置 ───────────────────────────────────────────────
const BATTLEPLANES = {
  battleplane1: {
    name: '蓝隼-Alpha', subtitle: '新手标准型 / 均衡基础机',
    attack: 45, health: 60, bulletType: 'double',
    features: ['稳定输出', '容错率高', '适合前期关卡']
  },
  battleplane2: {
    name: '苍雷-β', subtitle: '高爆发穿透型',
    attack: 70, health: 45, bulletType: 'pierce',
    features: ['适合密集敌群', '站位要求高', '不适合近距离硬扛']
  },
  battleplane3: {
    name: '星穹-γ', subtitle: '范围清场型',
    attack: 40, health: 55, bulletType: 'spread',
    features: ['覆盖范围广', '单体爆发较弱', '适合小怪波段']
  },
  battleplane4: {
    name: '天穹-Ω', subtitle: '终极均衡强化型',
    attack: 65, health: 75, bulletType: 'homing',
    features: ['操作难度最低', '适合Boss战', '综合性能最强']
  }
};

const ENEMY_CONFIGS = {
  basic: { health: 30, speed: 2, score: 10, image: 'enemyplane1', width: 50, height: 50 },
  fast:  { health: 20, speed: 4, score: 15, image: 'enemyplane2', width: 44, height: 44 },
  heavy: { health: 80, speed: 1, score: 30, image: 'enemyplane3', width: 60, height: 60 },
};

const ACHIEVEMENTS_DEF = [
  { id: 'firstBlood',   name: '第一滴血', description: '击败第一个敌人',     check: (g) => g.kills >= 1 },
  { id: 'survivor',     name: '生存者',   description: '存活超过3分钟',       check: (g) => g.survivalSec >= 180 },
  { id: 'sharpshooter', name: '神枪手',   description: '累计击败50个敌人',    check: (g) => g.kills >= 50 },
  { id: 'untouched',    name: '无懈可击', description: '不受伤通关第3关',     check: (g) => g.level >= 3 && g.damageTaken === 0 },
  { id: 'collector',    name: '收藏家',   description: '收集10个道具',        check: (g) => g.itemsCollected >= 10 },
];

// ─── 主组件 ──────────────────────────────────────────────────
export default function App() {
  const canvasRef   = useRef(null);
  // gameStateRef 用于在 rAF 回调中读取最新状态（无 stale closure）
  const gameStateRef = useRef('menu');

  // React state 只用于 UI 渲染
  const [gameState,  setGameStateUI]  = useState('loading');
  const [loadedCount, setLoadedCount] = useState(0);
  const [uiScore,    setUiScore]      = useState(0);
  const [uiLevel,    setUiLevel]      = useState(1);
  const [uiLives,    setUiLives]      = useState(3);
  const [uiAchievements, setUiAchievements] = useState([]);
  const [newAchievement, setNewAchievement] = useState(null);
  const TOTAL_IMAGES = 7;

  // 切换 gameState 同时更新 ref
  const setGameState = (s) => {
    gameStateRef.current = typeof s === 'function' ? s(gameStateRef.current) : s;
    setGameStateUI(gameStateRef.current);
  };

  // ── 全部游戏数据都在这个 ref 里，不触发重渲 ──
  const g = useRef({
    // 图片
    images: {},
    // 玩家
    player: null,
    selectedPlane: null,
    // 游戏对象
    enemies: [],
    bullets: [],
    items: [],
    particles: [],
    // 输入
    keys: {},
    touchTarget: null,
    // 计时
    startTime: 0,
    lastTime: 0,
    lastSpawn: 0,
    lastAutoShot: 0,
    // 统计（写在 ref 里，按需同步到 React state）
    score: 0,
    level: 1,
    lives: 3,
    kills: 0,
    survivalSec: 0,
    damageTaken: 0,
    itemsCollected: 0,
    // 状态标志
    invincible: false,
    invincibleTime: 0,
    shield: false,
    achievements: [],       // 已解锁 id 集合
    animId: null,
  });

  // ─── 预加载图片（并行，完成后才进入 menu）────────────────────
  useEffect(() => {
    const names = [
      'battleplane1','battleplane2','battleplane3','battleplane4',
      'enemyplane1','enemyplane2','enemyplane3'
    ];
    let done = 0;
    names.forEach(name => {
      const img = new Image();
      img.onload = img.onerror = () => {
        done++;
        setLoadedCount(done);
        if (done === names.length) setGameState('menu');
      };
      img.src = `/${name}.png`;
      g.current.images[name] = img;
    });
  }, []);

  // ─── 键盘 & 触摸事件（只注册一次）───────────────────────────
  useEffect(() => {
    const down = (e) => {
      g.current.keys[e.key] = true;
      if (e.key === ' ') { e.preventDefault(); fireBullet(); }
      if (e.key === 'p' || e.key === 'P') togglePause();
    };
    const up = (e) => { g.current.keys[e.key] = false; };

    window.addEventListener('keydown', down);
    window.addEventListener('keyup',   up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup',   up);
    };
  }, []); // 空依赖——永不重新绑定

  // ─── 辅助：发射子弹 ──────────────────────────────────────────
  const fireBullet = () => {
    const { player, bullets } = g.current;
    if (!player) return;
    const now = Date.now();
    if (now - (player.lastShot || 0) < 180) return;
    player.lastShot = now;

    const atk = player.attack;
    const cx = player.x, cy = player.y - player.height / 2;
    switch (player.bulletType) {
      case 'double':
        bullets.push(
          { x: cx - 14, y: cy, w: 4, h: 16, vy: -10, damage: atk, color: '#00eeff' },
          { x: cx + 14, y: cy, w: 4, h: 16, vy: -10, damage: atk, color: '#00eeff' }
        ); break;
      case 'pierce':
        bullets.push({ x: cx, y: cy, w: 6, h: 22, vy: -12, damage: atk, pierce: true, color: '#ff6600' });
        break;
      case 'spread':
        [-0.35, 0, 0.35].forEach(angle =>
          bullets.push({ x: cx + Math.sin(angle) * 20, y: cy, w: 4, h: 14, vy: -9, vx: Math.sin(angle) * 3, damage: atk, color: '#aa00ff' })
        ); break;
      case 'homing':
        bullets.push({ x: cx, y: cy, w: 5, h: 16, vy: -7, damage: atk, homing: true, color: '#ffdd00' });
        break;
    }
  };

  // ─── 辅助：切换暂停 ──────────────────────────────────────────
  const togglePause = () => {
    if (gameStateRef.current === 'playing') setGameState('paused');
    else if (gameStateRef.current === 'paused') setGameState('playing');
  };

  // ─── 开始游戏（不访问 canvas！）──────────────────────────────
  const startGame = (planeKey) => {
    if (g.current.animId) cancelAnimationFrame(g.current.animId);

    const cfg = BATTLEPLANES[planeKey];
    // 重置全部游戏数据，保留 images
    const images = g.current.images;
    g.current = {
      images,
      player: null,          // 等 canvas 就绪后再初始化
      selectedPlane: planeKey,
      enemies: [], bullets: [], items: [], particles: [],
      keys: {}, touchTarget: null,
      startTime: Date.now(), lastTime: Date.now(),
      lastSpawn: 0, lastAutoShot: 0,
      score: 0, level: 1, lives: 3,
      kills: 0, survivalSec: 0, damageTaken: 0, itemsCollected: 0,
      invincible: false, invincibleTime: 0, shield: false,
      achievements: [], animId: null,
      // 保存战机配置，供 canvas ready 时用
      _planeCfg: cfg,
    };
    setUiScore(0); setUiLevel(1); setUiLives(3); setUiAchievements([]);
    setGameState('playing');  // 触发 React 渲染 canvas
  };

  // ─── 游戏主循环（只依赖 gameState）─────────────────────────
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // ★ 在这里初始化玩家（canvas 已挂载，宽高已知）
    if (!g.current.player && g.current.selectedPlane) {
      const cfg = g.current._planeCfg;
      g.current.player = {
        x: canvas.width / 2,
        y: canvas.height - 90,
        width: 60, height: 60,
        speed: 5,
        health: cfg.health, maxHealth: cfg.health,
        attack: cfg.attack, bulletType: cfg.bulletType,
        image: g.current.selectedPlane,
        lastShot: 0,
      };
    }

    // 记录本次 effect 启动时的 rAF id，用于清理
    let localAnimId = null;

    const loop = () => {
      // 若已不在 playing 状态，停止循环
      if (gameStateRef.current !== 'playing') return;

      const now = Date.now();
      const W = canvas.width, H = canvas.height;
      const data = g.current;

      // ── 背景 ──────────────────────────────────────────────
      ctx.fillStyle = '#050a1a';
      ctx.fillRect(0, 0, W, H);
      // 星点
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      for (let s = 0; s < 3; s++) {
        const sx = (now * (0.02 + s * 0.01) * (s + 1) * 137.5) % W;
        const sy = (now * (0.01 + s * 0.005) * (s + 1) * 97.3) % H;
        ctx.fillRect(sx | 0, sy | 0, 1, 1);
      }

      const { player, enemies, bullets, items, particles, keys } = data;

      // ── 移动玩家 ──────────────────────────────────────────
      if (player) {
        if (keys['ArrowLeft']  || keys['a'] || keys['A']) player.x -= player.speed;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x += player.speed;
        if (keys['ArrowUp']    || keys['w'] || keys['W']) player.y -= player.speed;
        if (keys['ArrowDown']  || keys['s'] || keys['S']) player.y += player.speed;
        // 触摸跟随
        if (data.touchTarget) {
          const dx = data.touchTarget.x - player.x, dy = data.touchTarget.y - player.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 4) { player.x += dx / dist * player.speed; player.y += dy / dist * player.speed; }
        }
        player.x = Math.max(player.width/2, Math.min(W - player.width/2, player.x));
        player.y = Math.max(player.height/2, Math.min(H - player.height/2, player.y));

        // 自动射击（触摸模式 or 持续按空格）
        if (now - data.lastAutoShot > 200 && (data.touchTarget || keys[' '])) {
          data.lastAutoShot = now;
          fireBullet();
        }

        // 绘制玩家
        const blink = data.invincible && Math.floor(now / 120) % 2 === 0;
        if (!blink) {
          const img = data.images[player.image];
          if (img && img.complete) {
            ctx.save();
            ctx.shadowBlur = 18; ctx.shadowColor = '#4488ff';
            ctx.drawImage(img, player.x - player.width/2, player.y - player.height/2, player.width, player.height);
            ctx.restore();
          }
        }
        // 护盾圆圈
        if (data.shield) {
          ctx.save();
          ctx.strokeStyle = '#00ffee'; ctx.lineWidth = 2;
          ctx.shadowBlur = 12; ctx.shadowColor = '#00ffee';
          ctx.beginPath(); ctx.arc(player.x, player.y, player.width * 0.7, 0, Math.PI*2); ctx.stroke();
          ctx.restore();
        }
        // 血条
        const bx = player.x - player.width/2, by = player.y + player.height/2 + 4;
        ctx.fillStyle = '#333'; ctx.fillRect(bx, by, player.width, 4);
        ctx.fillStyle = player.health > player.maxHealth*0.5 ? '#00ff88' : '#ff4444';
        ctx.fillRect(bx, by, player.width * (player.health / player.maxHealth), 4);
      }

      // ── 子弹移动 & 绘制 ───────────────────────────────────
      for (let i = bullets.length - 1; i >= 0; i--) {
        const b = bullets[i];
        // 追踪弹
        if (b.homing && enemies.length > 0) {
          let nearest = null, minD = Infinity;
          enemies.forEach(e => { const d = Math.hypot(e.x-b.x, e.y-b.y); if(d<minD){minD=d;nearest=e;} });
          if (nearest) {
            const ang = Math.atan2(nearest.y - b.y, nearest.x - b.x);
            b.vx = (b.vx || 0) * 0.8 + Math.cos(ang) * 7 * 0.2;
            b.vy = (b.vy || -7) * 0.8 + Math.sin(ang) * 7 * 0.2;
          }
        }
        b.x += (b.vx || 0); b.y += b.vy;
        if (b.y < -30 || b.y > H+10 || b.x < -10 || b.x > W+10) { bullets.splice(i, 1); continue; }
        ctx.save();
        ctx.fillStyle = b.color || '#00eeff';
        ctx.shadowBlur = 8; ctx.shadowColor = b.color || '#00eeff';
        ctx.fillRect(b.x - b.w/2, b.y - b.h/2, b.w, b.h);
        ctx.restore();
      }

      // ── 生成敌机 ──────────────────────────────────────────
      const spawnInterval = Math.max(600, 2000 - data.level * 120);
      if (now - data.lastSpawn > spawnInterval) {
        data.lastSpawn = now;
        const rand = Math.random();
        const type = rand < 0.6 ? 'basic' : rand < 0.85 ? 'fast' : 'heavy';
        const cfg  = ENEMY_CONFIGS[type];
        enemies.push({
          x: cfg.width/2 + Math.random() * (W - cfg.width),
          y: -cfg.height,
          width: cfg.width, height: cfg.height,
          speed: cfg.speed + data.level * 0.15,
          health: cfg.health + data.level * 5,
          maxHealth: cfg.health + data.level * 5,
          score: cfg.score,
          type, image: cfg.image,
        });
      }

      // ── 敌机移动、碰撞、绘制 ─────────────────────────────
      for (let i = enemies.length - 1; i >= 0; i--) {
        const en = enemies[i];
        en.y += en.speed;

        if (en.y - en.height/2 > H) {
          enemies.splice(i, 1);
          data.score = Math.max(0, data.score - 5);
          setUiScore(data.score);
          continue;
        }

        // 子弹 vs 敌机
        let killed = false;
        for (let j = bullets.length - 1; j >= 0; j--) {
          const b = bullets[j];
          if (rectsOverlap(b.x-b.w/2, b.y-b.h/2, b.w, b.h, en.x-en.width/2, en.y-en.height/2, en.width, en.height)) {
            en.health -= b.damage;
            if (!b.pierce) bullets.splice(j, 1);
            if (en.health <= 0) {
              spawnParticles(particles, en.x, en.y, en.type);
              if (Math.random() < 0.22) spawnItem(items, en.x, en.y);
              data.score += en.score;
              data.kills++;
              setUiScore(data.score);
              enemies.splice(i, 1);
              killed = true;
              // 检查成就
              checkAchievements(data, setUiAchievements, setNewAchievement);
              break;
            }
          }
        }
        if (killed) continue;

        // 玩家 vs 敌机
        if (player && rectsOverlap(
          player.x - player.width/2, player.y - player.height/2, player.width, player.height,
          en.x - en.width/2, en.y - en.height/2, en.width, en.height
        )) {
          if (data.shield) {
            data.shield = false;
            spawnParticles(particles, en.x, en.y, en.type);
            enemies.splice(i, 1); continue;
          }
          if (!data.invincible) {
            player.health -= 20;
            data.damageTaken += 20;
            data.invincible = true;
            data.invincibleTime = now;
            enemies.splice(i, 1);
            if (player.health <= 0) {
              data.lives--;
              setUiLives(data.lives);
              if (data.lives <= 0) { setGameState('gameover'); return; }
              player.health = player.maxHealth;
            }
            continue;
          }
        }

        // 绘制敌机
        const eimg = data.images[en.image];
        if (eimg && eimg.complete) {
          ctx.save();
          ctx.shadowBlur = en.type === 'heavy' ? 20 : 10;
          ctx.shadowColor = en.type === 'heavy' ? '#ff4400' : en.type === 'fast' ? '#ff00ff' : '#ff2200';
          ctx.drawImage(eimg, en.x - en.width/2, en.y - en.height/2, en.width, en.height);
          ctx.restore();
        }
        // 血条
        const ex = en.x - en.width/2, ey = en.y - en.height/2 - 7;
        ctx.fillStyle = '#550000'; ctx.fillRect(ex, ey, en.width, 3);
        ctx.fillStyle = '#ff3300';
        ctx.fillRect(ex, ey, en.width * (en.health / en.maxHealth), 3);
      }

      // ── 无敌计时 ──────────────────────────────────────────
      if (data.invincible && now - data.invincibleTime > 2000) data.invincible = false;

      // ── 道具移动 & 拾取 & 绘制 ───────────────────────────
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i];
        it.y += 2;
        if (it.y > H + 20) { items.splice(i, 1); continue; }

        if (player && rectsOverlap(
          player.x - player.width/2, player.y - player.height/2, player.width, player.height,
          it.x - 15, it.y - 15, 30, 30
        )) {
          items.splice(i, 1);
          data.itemsCollected++;
          if (it.type === 'shield') {
            data.shield = true;
          } else {
            const old = player.bulletType;
            player.bulletType = 'spread';
            setTimeout(() => { if(player) player.bulletType = old; }, 10000);
          }
          checkAchievements(data, setUiAchievements, setNewAchievement);
          continue;
        }

        // 绘制道具
        const itColor = it.type === 'shield' ? '#00ffee' : '#ff44ff';
        ctx.save();
        ctx.shadowBlur = 18; ctx.shadowColor = itColor;
        ctx.strokeStyle = itColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(it.x, it.y, 13, 0, Math.PI*2); ctx.stroke();
        ctx.fillStyle = itColor + '44'; ctx.fill();
        ctx.fillStyle = itColor;
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(it.type === 'shield' ? '🛡' : '⚡', it.x, it.y);
        ctx.restore();
      }

      // ── 粒子效果 ─────────────────────────────────────────
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx; p.y += p.vy; p.vy += 0.1; p.life--;
        if (p.life <= 0) { particles.splice(i, 1); continue; }
        ctx.globalAlpha = p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.r, p.y - p.r, p.r*2, p.r*2);
        ctx.globalAlpha = 1;
      }

      // ── 生存时间 & 关卡 ───────────────────────────────────
      data.survivalSec = Math.floor((now - data.startTime) / 1000);
      const nextLevelScore = data.level * 150;
      if (data.score >= nextLevelScore) {
        data.level++;
        data.enemies = [];
        setUiLevel(data.level);
        checkAchievements(data, setUiAchievements, setNewAchievement);
        // 关卡升级提示
        ctx.save();
        ctx.fillStyle = 'rgba(0,255,200,0.85)';
        ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center';
        ctx.shadowBlur = 20; ctx.shadowColor = '#00ffcc';
        ctx.fillText(`★ 关卡 ${data.level} ★`, W/2, H/2);
        ctx.restore();
      }

      localAnimId = requestAnimationFrame(loop);
      g.current.animId = localAnimId;
    };

    localAnimId = requestAnimationFrame(loop);
    g.current.animId = localAnimId;

    return () => {
      if (localAnimId) cancelAnimationFrame(localAnimId);
    };
  }, [gameState]); // ★ 只依赖 gameState，不依赖任何会频繁变化的 state

  // ─── 触摸控制 ────────────────────────────────────────────────
  const handleTouch = (e) => {
    e.preventDefault();
    if (e.touches.length === 0) { g.current.touchTarget = null; return; }
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = e.touches[0];
    const scaleX = (canvasRef.current?.width || 800) / rect.width;
    const scaleY = (canvasRef.current?.height || 600) / rect.height;
    g.current.touchTarget = {
      x: (t.clientX - rect.left) * scaleX,
      y: (t.clientY - rect.top)  * scaleY,
    };
  };

  // ─── JSX ─────────────────────────────────────────────────────
  return (
    <div className="w-screen h-screen bg-[#050a1a] overflow-hidden relative">

      {/* 静态星空背景 */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({length: 120}, (_, i) => (
          <div key={i} className="absolute rounded-full bg-white"
            style={{
              width:  Math.random() < 0.1 ? 2 : 1,
              height: Math.random() < 0.1 ? 2 : 1,
              left: `${(i * 137.5) % 100}%`,
              top:  `${(i * 97.3)  % 100}%`,
              opacity: 0.3 + Math.random() * 0.7,
              animation: `pulse ${2 + (i%3)}s ease-in-out infinite`,
              animationDelay: `${(i * 0.07) % 3}s`,
            }} />
        ))}
      </div>

      {/* ══ 加载界面 ════════════════════════════════════════════ */}
      {gameState === 'loading' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full gap-8">
          <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-widest">
            星际先锋
          </h1>
          <div className="flex flex-col items-center gap-3 w-64">
            <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden border border-white/20">
              <div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-300"
                style={{ width: `${(loadedCount / TOTAL_IMAGES) * 100}%` }}
              />
            </div>
            <p className="text-cyan-300 text-sm tracking-widest">
              资源加载中 {loadedCount} / {TOTAL_IMAGES}
            </p>
          </div>
        </div>
      )}

      {/* ══ 主菜单 ══════════════════════════════════════════════ */}
      {gameState === 'menu' && (
        <div className="relative z-10 flex flex-col items-center h-full p-4 overflow-y-auto">
          <h1 className="text-5xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 mt-8 mb-2 drop-shadow-lg tracking-widest">
            星际先锋
          </h1>
          <p className="text-blue-300 text-sm mb-8 tracking-widest">STAR CRAFT · 选择你的战机</p>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-6xl w-full">
            {Object.entries(BATTLEPLANES).map(([key, plane]) => (
              <button key={key} onClick={() => startGame(key)}
                className="group relative rounded-2xl p-4 text-left transition-all duration-300
                           border border-blue-500/30 bg-white/5 backdrop-blur-sm
                           hover:border-cyan-400/80 hover:bg-white/10 hover:scale-105 hover:shadow-[0_0_30px_rgba(0,200,255,0.3)]">
                {/* 战机图片区 */}
                <div className="w-full h-32 flex items-center justify-center mb-3 rounded-xl bg-gradient-to-br from-blue-950/50 to-purple-950/50 overflow-hidden">
                  <img src={`/${key}.png`} alt={plane.name}
                    className="max-h-full max-w-full object-contain"
                    style={{ filter: 'drop-shadow(0 0 12px rgba(0,180,255,0.7))', mixBlendMode: 'screen' }} />
                </div>
                <h3 className="text-base font-bold text-white mb-0.5">{plane.name}</h3>
                <p className="text-xs text-blue-300 mb-2">{plane.subtitle}</p>
                {/* 属性条 */}
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 w-8">攻击</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-red-500 to-orange-400 h-1.5 rounded-full transition-all"
                        style={{width: `${plane.attack / 70 * 100}%`}} />
                    </div>
                    <span className="text-red-400 w-5 text-right">{plane.attack}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 w-8">血量</span>
                    <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                      <div className="bg-gradient-to-r from-green-500 to-emerald-400 h-1.5 rounded-full transition-all"
                        style={{width: `${plane.health / 75 * 100}%`}} />
                    </div>
                    <span className="text-green-400 w-5 text-right">{plane.health}</span>
                  </div>
                </div>
                <div className="mt-2 space-y-0.5">
                  {plane.features.map((f, i) => (
                    <div key={i} className="text-xs text-blue-400">· {f}</div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* 操作说明 */}
          <div className="mt-6 mb-4 border border-blue-500/20 rounded-xl bg-white/5 backdrop-blur-sm p-4 max-w-lg w-full text-xs text-blue-300 grid grid-cols-2 gap-2">
            <div>⌨️ 方向键 / WASD 移动</div>
            <div>🚀 空格键 射击</div>
            <div>⏸ P 键 暂停</div>
            <div>📱 触摸屏自动跟随射击</div>
          </div>
        </div>
      )}

      {/* ══ 游戏界面 ════════════════════════════════════════════ */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 h-full flex flex-col">
          {/* 顶栏 */}
          <div className="flex items-center justify-between px-4 py-2 bg-black/40 backdrop-blur-sm border-b border-white/10">
            <div className="flex gap-4 text-sm text-white">
              <span>分数 <span className="text-yellow-400 font-bold">{uiScore}</span></span>
              <span>关卡 <span className="text-cyan-400 font-bold">{uiLevel}</span></span>
              <span>生命 <span className="text-red-400 font-bold">{'♥ '.repeat(uiLives)}</span></span>
            </div>
            <button onClick={togglePause}
              className="text-sm px-3 py-1 rounded-lg border border-white/20 bg-white/10 text-white hover:bg-white/20 transition-colors">
              {gameState === 'playing' ? '暂停 P' : '继续 P'}
            </button>
          </div>

          {/* Canvas */}
          <div className="flex-1 flex items-center justify-center p-2 overflow-hidden">
            <canvas ref={canvasRef} width={800} height={600}
              className="max-w-full max-h-full rounded-xl border border-blue-500/40"
              style={{boxShadow: '0 0 30px rgba(0,100,255,0.3)'}}
              onTouchStart={handleTouch} onTouchMove={handleTouch} onTouchEnd={handleTouch} />
          </div>

          {/* 成就提示 */}
          {newAchievement && (
            <div className="absolute top-16 right-4 bg-yellow-500/90 text-black rounded-xl px-4 py-2 text-sm font-bold animate-bounce">
              🏆 成就解锁：{newAchievement.name}
            </div>
          )}

          {/* 暂停遮罩 */}
          {gameState === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="border border-white/20 rounded-2xl bg-white/10 backdrop-blur-md p-8 text-center min-w-64">
                <h2 className="text-3xl font-bold text-white mb-6">游戏暂停</h2>
                <div className="space-y-3">
                  <button onClick={() => setGameState('playing')}
                    className="w-full py-2.5 rounded-xl border border-cyan-400/60 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/20 transition-all">
                    继续游戏
                  </button>
                  <button onClick={() => setGameState('menu')}
                    className="w-full py-2.5 rounded-xl border border-red-400/60 bg-red-400/10 text-red-300 hover:bg-red-400/20 transition-all">
                    返回主菜单
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══ 游戏结束 ════════════════════════════════════════════ */}
      {gameState === 'gameover' && (
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="border border-white/20 rounded-2xl bg-white/10 backdrop-blur-md p-8 max-w-sm w-full text-center mx-4">
            <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400 mb-6">
              游戏结束
            </h2>
            <div className="space-y-2 text-white text-lg mb-6">
              <div>最终分数 <span className="text-yellow-400 font-bold text-2xl">{uiScore}</span></div>
              <div>到达关卡 <span className="text-cyan-400 font-bold">{uiLevel}</span></div>
            </div>
            {uiAchievements.length > 0 && (
              <div className="mb-6 text-left space-y-2">
                <p className="text-sm text-gray-400 mb-2">获得成就：</p>
                {uiAchievements.map(a => (
                  <div key={a.id} className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-1.5">
                    <span className="text-yellow-400">🏆</span>
                    <div>
                      <div className="text-yellow-300 text-sm font-bold">{a.name}</div>
                      <div className="text-gray-400 text-xs">{a.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => setGameState('menu')}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold hover:opacity-90 transition-all">
              返回主菜单
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── 纯函数工具 ──────────────────────────────────────────────
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx+bw && ax+aw > bx && ay < by+bh && ay+ah > by;
}

function spawnParticles(particles, x, y, type) {
  const count = type === 'heavy' ? 18 : 10;
  const colors = type === 'heavy' ? ['#ff4400','#ff8800','#ffcc00'] :
                 type === 'fast'  ? ['#ff00ff','#aa00ff','#ff44ff'] :
                                    ['#ff2200','#ff6600','#ffaa00'];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + Math.random() * 0.5;
    const speed = 1.5 + Math.random() * 3;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 1,
      r: 2 + Math.random() * 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 20 + Math.random() * 20 | 0,
      maxLife: 40,
    });
  }
}

function spawnItem(items, x, y) {
  items.push({ x, y, type: Math.random() < 0.5 ? 'shield' : 'tripleShot' });
}

function checkAchievements(data, setUiAchievements, setNewAchievement) {
  ACHIEVEMENTS_DEF.forEach(def => {
    if (!data.achievements.includes(def.id) && def.check(data)) {
      data.achievements.push(def.id);
      setUiAchievements(prev => [...prev, def]);
      setNewAchievement(def);
      setTimeout(() => setNewAchievement(null), 3000);
    }
  });
}
