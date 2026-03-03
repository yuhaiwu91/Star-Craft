import React, { useState, useEffect, useRef } from 'react';

// 战机配置
const BATTLEPLANES = {
  battleplane1: {
    name: '蓝隼-Alpha',
    subtitle: '新手标准型 / 均衡基础机',
    attack: 45,
    health: 60,
    bulletType: 'double',
    description: '流线型机身、双侧推进器、标准能量核心',
    features: ['稳定输出', '容错率高', '适合前期关卡']
  },
  battleplane2: {
    name: '苍雷-β',
    subtitle: '高爆发穿透型',
    attack: 70,
    health: 45,
    bulletType: 'pierce',
    description: '机翼更宽，核心发光明显',
    features: ['适合密集敌群', '站位要求高', '不适合近距离硬扛']
  },
  battleplane3: {
    name: '星穹-γ',
    subtitle: '范围清场型',
    attack: 40,
    health: 55,
    bulletType: 'spread',
    description: '侧翼展开式设计，动力核心更大',
    features: ['覆盖范围广', '单体爆发较弱', '适合小怪波段']
  },
  battleplane4: {
    name: '天穹-Ω',
    subtitle: '终极均衡强化型',
    attack: 65,
    health: 75,
    bulletType: 'homing',
    description: '最厚重机体，核心三段发光',
    features: ['操作难度最低', '适合Boss战', '综合性能最强']
  }
};

// 敌机配置
const ENEMY_TYPES = {
  basic: { health: 30, speed: 2, score: 10, image: 'enemyplane1.png' },
  fast: { health: 20, speed: 4, score: 15, image: 'enemyplane2.png' },
  heavy: { health: 60, speed: 1, score: 25, image: 'enemyplane3.png' }
};

// 成就配置
const ACHIEVEMENTS = [
  { id: 'firstBlood', name: '第一滴血', description: '击败第一个敌人', condition: (stats) => stats.kills >= 1 },
  { id: 'survivor', name: '生存者', description: '存活超过3分钟', condition: (stats) => stats.survivalTime >= 180 },
  { id: 'sharpshooter', name: '神枪手', description: '击败50个敌人', condition: (stats) => stats.kills >= 50 },
  { id: 'invincible', name: '无敌', description: '不受伤通过第3关', condition: (stats) => stats.level >= 3 && stats.damageTaken === 0 },
  { id: 'collector', name: '收藏家', description: '收集10个道具', condition: (stats) => stats.itemsCollected >= 10 }
];

function App() {
  const canvasRef = useRef(null);
  const [gameState, setGameState] = useState('menu'); // menu, playing, paused, gameover
  const [selectedPlane, setSelectedPlane] = useState(null);
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(3);
  const [achievements, setAchievements] = useState([]);
  const [stats, setStats] = useState({
    kills: 0,
    survivalTime: 0,
    damageTaken: 0,
    itemsCollected: 0,
    level: 1
  });

  const gameRef = useRef({
    player: null,
    enemies: [],
    bullets: [],
    items: [],
    keys: {},
    lastTime: 0,
    startTime: 0,
    invincible: false,
    invincibleTime: 0,
    shield: false,
    images: {}
  });

  // 加载图片
  useEffect(() => {
    const loadImages = async () => {
      const imageNames = [
        'battleplane1', 'battleplane2', 'battleplane3', 'battleplane4',
        'enemyplane1', 'enemyplane2', 'enemyplane3'
      ];

      for (const name of imageNames) {
        const img = new Image();
        img.src = `/${name}.png`;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        gameRef.current.images[name] = img;
      }
    };

    loadImages();
  }, []);

  // 射击子弹
  const shootBullet = () => {
    const { player, bullets } = gameRef.current;
    if (!player) return;

    const now = Date.now();
    if (now - (player.lastShot || 0) < 200) return;
    player.lastShot = now;

    switch (player.bulletType) {
      case 'double':
        bullets.push(
          { x: player.x - 15, y: player.y, width: 4, height: 15, speed: 8, damage: player.attack },
          { x: player.x + 15, y: player.y, width: 4, height: 15, speed: 8, damage: player.attack }
        );
        break;
      case 'pierce':
        bullets.push({ x: player.x, y: player.y, width: 6, height: 20, speed: 10, damage: player.attack, pierce: true });
        break;
      case 'spread':
        bullets.push(
          { x: player.x - 20, y: player.y, width: 4, height: 12, speed: 7, damage: player.attack, angle: -0.3 },
          { x: player.x, y: player.y, width: 4, height: 12, speed: 7, damage: player.attack, angle: 0 },
          { x: player.x + 20, y: player.y, width: 4, height: 12, speed: 7, damage: player.attack, angle: 0.3 }
        );
        break;
      case 'homing':
        bullets.push({ x: player.x, y: player.y, width: 5, height: 15, speed: 6, damage: player.attack, homing: true });
        break;
    }
  };

  // 键盘事件
  useEffect(() => {
    const handleKeyDown = (e) => {
      gameRef.current.keys[e.key] = true;
      if (e.key === ' ' && gameState === 'playing') {
        e.preventDefault();
        shootBullet();
      }
      if (e.key === 'p' || e.key === 'P') {
        setGameState(prev => prev === 'playing' ? 'paused' : 'playing');
      }
    };

    const handleKeyUp = (e) => {
      gameRef.current.keys[e.key] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [gameState]);

  // 生成敌机
  const spawnEnemy = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const types = ['basic', 'fast', 'heavy'];
    const weights = [0.6, 0.3, 0.1];
    const rand = Math.random();
    let type = 'basic';
    let sum = 0;
    for (let i = 0; i < types.length; i++) {
      sum += weights[i];
      if (rand < sum) {
        type = types[i];
        break;
      }
    }

    const config = ENEMY_TYPES[type];
    gameRef.current.enemies.push({
      x: Math.random() * (canvas.width - 50),
      y: -50,
      width: 50,
      height: 50,
      speed: config.speed + level * 0.2,
      health: config.health,
      maxHealth: config.health,
      score: config.score,
      type: type,
      image: config.image
    });
  };

  // 生成道具
  const spawnItem = (x, y) => {
    const types = ['tripleShot', 'shield'];
    const type = types[Math.floor(Math.random() * types.length)];
    gameRef.current.items.push({
      x, y,
      width: 30,
      height: 30,
      speed: 2,
      type
    });
  };

  // 碰撞检测
  const checkCollision = (a, b) => {
    return a.x < b.x + b.width &&
           a.x + a.width > b.x &&
           a.y < b.y + b.height &&
           a.y + a.height > b.y;
  };

  // 开始游戏
  const startGame = (planeKey) => {
    setSelectedPlane(planeKey);
    setGameState('playing');
    setScore(0);
    setLevel(1);
    setLives(3);
    setAchievements([]);
    setStats({
      kills: 0,
      survivalTime: 0,
      damageTaken: 0,
      itemsCollected: 0,
      level: 1
    });

    const canvas = canvasRef.current;
    const planeConfig = BATTLEPLANES[planeKey];

    gameRef.current = {
      ...gameRef.current,
      player: {
        x: canvas.width / 2,
        y: canvas.height - 100,
        width: 60,
        height: 60,
        speed: 5,
        health: planeConfig.health,
        maxHealth: planeConfig.health,
        attack: planeConfig.attack,
        bulletType: planeConfig.bulletType,
        image: planeKey
      },
      enemies: [],
      bullets: [],
      items: [],
      keys: {},
      lastTime: Date.now(),
      startTime: Date.now(),
      invincible: false,
      invincibleTime: 0,
      shield: false,
      lastSpawn: 0
    };
  };

  // 游戏循环
  useEffect(() => {
    if (gameState !== 'playing') return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let animationId;
    const gameLoop = () => {
      const now = Date.now();
      const deltaTime = now - gameRef.current.lastTime;
      gameRef.current.lastTime = now;

      // 更新生存时间
      const survivalTime = Math.floor((now - gameRef.current.startTime) / 1000);
      setStats(prev => ({ ...prev, survivalTime }));

      // 清空画布
      ctx.fillStyle = '#0a0e27';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const { player, enemies, bullets, items, keys } = gameRef.current;

      // 移动玩家
      if (player) {
        if (keys['ArrowLeft'] || keys['a'] || keys['A']) player.x -= player.speed;
        if (keys['ArrowRight'] || keys['d'] || keys['D']) player.x += player.speed;
        if (keys['ArrowUp'] || keys['w'] || keys['W']) player.y -= player.speed;
        if (keys['ArrowDown'] || keys['s'] || keys['S']) player.y += player.speed;

        player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
        player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));

        // 绘制玩家
        if (gameRef.current.images[player.image]) {
          if (gameRef.current.invincible && Math.floor(now / 100) % 2 === 0) {
            ctx.globalAlpha = 0.5;
          }
          ctx.drawImage(gameRef.current.images[player.image], player.x - player.width/2, player.y - player.height/2, player.width, player.height);
          ctx.globalAlpha = 1;
        }

        // 绘制血条
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(player.x - player.width/2, player.y - player.height/2 - 10, player.width, 4);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(player.x - player.width/2, player.y - player.height/2 - 10, player.width * (player.health / player.maxHealth), 4);
      }

      // 更新和绘制子弹
      for (let i = bullets.length - 1; i >= 0; i--) {
        const bullet = bullets[i];

        if (bullet.homing && enemies.length > 0) {
          const nearest = enemies.reduce((closest, enemy) => {
            const dist = Math.hypot(enemy.x - bullet.x, enemy.y - bullet.y);
            return dist < closest.dist ? { enemy, dist } : closest;
          }, { dist: Infinity }).enemy;

          if (nearest) {
            const angle = Math.atan2(nearest.y - bullet.y, nearest.x - bullet.x);
            bullet.x += Math.cos(angle) * bullet.speed;
            bullet.y += Math.sin(angle) * bullet.speed;
          }
        } else if (bullet.angle !== undefined) {
          bullet.x += Math.sin(bullet.angle) * bullet.speed;
          bullet.y -= bullet.speed;
        } else {
          bullet.y -= bullet.speed;
        }

        if (bullet.y < -20) {
          bullets.splice(i, 1);
          continue;
        }

        ctx.fillStyle = '#00ffff';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#00ffff';
        ctx.fillRect(bullet.x - bullet.width/2, bullet.y - bullet.height/2, bullet.width, bullet.height);
        ctx.shadowBlur = 0;
      }

      // 生成敌机
      if (now - gameRef.current.lastSpawn > 2000 - level * 100) {
        spawnEnemy();
        gameRef.current.lastSpawn = now;
      }

      // 更新和绘制敌机
      for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        enemy.y += enemy.speed;

        if (enemy.y > canvas.height) {
          enemies.splice(i, 1);
          setScore(prev => Math.max(0, prev - 5));
          continue;
        }

        // 绘制敌机
        if (gameRef.current.images[enemy.image]) {
          ctx.drawImage(gameRef.current.images[enemy.image], enemy.x - enemy.width/2, enemy.y - enemy.height/2, enemy.width, enemy.height);
        }

        // 绘制血条
        ctx.fillStyle = '#ff0000';
        ctx.fillRect(enemy.x - enemy.width/2, enemy.y - enemy.height/2 - 10, enemy.width, 4);
        ctx.fillStyle = '#00ff00';
        ctx.fillRect(enemy.x - enemy.width/2, enemy.y - enemy.height/2 - 10, enemy.width * (enemy.health / enemy.maxHealth), 4);

        // 子弹碰撞
        for (let j = bullets.length - 1; j >= 0; j--) {
          const bullet = bullets[j];
          if (checkCollision(bullet, enemy)) {
            enemy.health -= bullet.damage;
            if (!bullet.pierce) {
              bullets.splice(j, 1);
            }

            if (enemy.health <= 0) {
              enemies.splice(i, 1);
              setScore(prev => prev + enemy.score);
              setStats(prev => ({ ...prev, kills: prev.kills + 1 }));

              if (Math.random() < 0.2) {
                spawnItem(enemy.x, enemy.y);
              }
              break;
            }
          }
        }

        // 玩家碰撞
        if (player && checkCollision(player, enemy)) {
          if (gameRef.current.shield) {
            gameRef.current.shield = false;
            enemies.splice(i, 1);
          } else if (!gameRef.current.invincible) {
            player.health -= 20;
            setStats(prev => ({ ...prev, damageTaken: prev.damageTaken + 20 }));
            gameRef.current.invincible = true;
            gameRef.current.invincibleTime = now;
            enemies.splice(i, 1);

            if (player.health <= 0) {
              setLives(prev => {
                const newLives = prev - 1;
                if (newLives <= 0) {
                  setGameState('gameover');
                } else {
                  player.health = player.maxHealth;
                }
                return newLives;
              });
            }
          }
        }
      }

      // 更新无敌时间
      if (gameRef.current.invincible && now - gameRef.current.invincibleTime > 2000) {
        gameRef.current.invincible = false;
      }

      // 更新和绘制道具
      for (let i = items.length - 1; i >= 0; i--) {
        const item = items[i];
        item.y += item.speed;

        if (item.y > canvas.height) {
          items.splice(i, 1);
          continue;
        }

        // 绘制道具
        ctx.fillStyle = item.type === 'shield' ? '#ffff00' : '#ff00ff';
        ctx.shadowBlur = 15;
        ctx.shadowColor = ctx.fillStyle;
        ctx.beginPath();
        ctx.arc(item.x, item.y, item.width/2, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // 玩家拾取
        if (player && checkCollision(player, item)) {
          items.splice(i, 1);
          setStats(prev => ({ ...prev, itemsCollected: prev.itemsCollected + 1 }));

          if (item.type === 'shield') {
            gameRef.current.shield = true;
          } else if (item.type === 'tripleShot') {
            const oldType = player.bulletType;
            player.bulletType = 'spread';
            setTimeout(() => { player.bulletType = oldType; }, 10000);
          }
        }
      }

      // 检查关卡升级
      if (score >= level * 100) {
        setLevel(prev => prev + 1);
        setStats(prev => ({ ...prev, level: prev.level + 1 }));
        gameRef.current.enemies = [];
      }

      // 检查成就
      ACHIEVEMENTS.forEach(ach => {
        if (!achievements.find(a => a.id === ach.id) && ach.condition(stats)) {
          setAchievements(prev => [...prev, ach]);
        }
      });

      animationId = requestAnimationFrame(gameLoop);
    };

    gameLoop();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [gameState, score, level, lives, achievements, stats]);

  return (
    <div className="w-screen h-screen bg-gradient-to-b from-space-dark via-space-blue to-space-purple overflow-hidden">
      {/* 星空背景 */}
      <div className="absolute inset-0 overflow-hidden">
        {[...Array(100)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-white rounded-full animate-pulse-slow"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`
            }}
          />
        ))}
      </div>

      {/* 主菜单 */}
      {gameState === 'menu' && (
        <div className="relative z-10 flex flex-col items-center justify-center h-full p-4">
          <h1 className="text-6xl md:text-8xl font-bold text-white text-glow mb-8 animate-float">
            星际先锋
          </h1>
          <p className="text-xl text-blue-200 mb-12">选择你的战机</p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl">
            {Object.entries(BATTLEPLANES).map(([key, plane]) => (
              <div
                key={key}
                onClick={() => startGame(key)}
                className="glass rounded-xl p-6 cursor-pointer hover:glow transition-all transform hover:scale-105"
              >
                <div className="w-full h-40 flex items-center justify-center mb-4">
                  <img src={`/${key}.png`} alt={plane.name} className="max-h-full object-contain mix-blend-screen" style={{filter: 'drop-shadow(0 0 10px rgba(59, 130, 246, 0.5))'}} />
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">{plane.name}</h3>
                <p className="text-sm text-blue-200 mb-4">{plane.subtitle}</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between text-white">
                    <span>攻击力:</span>
                    <span className="text-red-400">{plane.attack}</span>
                  </div>
                  <div className="flex justify-between text-white">
                    <span>血量:</span>
                    <span className="text-green-400">{plane.health}</span>
                  </div>
                  <div className="mt-4 space-y-1">
                    {plane.features.map((feature, i) => (
                      <div key={i} className="text-xs text-blue-300">• {feature}</div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 游戏界面 */}
      {(gameState === 'playing' || gameState === 'paused') && (
        <div className="relative z-10 h-full flex flex-col">
          {/* 顶部信息栏 */}
          <div className="glass p-4 flex justify-between items-center">
            <div className="flex gap-6 text-white">
              <div>分数: <span className="text-yellow-400 font-bold">{score}</span></div>
              <div>关卡: <span className="text-blue-400 font-bold">{level}</span></div>
              <div>生命: <span className="text-red-400 font-bold">{'❤️'.repeat(lives)}</span></div>
            </div>
            <button
              onClick={() => setGameState(gameState === 'playing' ? 'paused' : 'playing')}
              className="glass px-4 py-2 rounded-lg text-white hover:glow"
            >
              {gameState === 'playing' ? '暂停' : '继续'}
            </button>
          </div>

          {/* 游戏画布 */}
          <div className="flex-1 flex items-center justify-center p-4">
            <canvas
              ref={canvasRef}
              width={800}
              height={600}
              className="border-2 border-blue-500 rounded-lg glow max-w-full"
            />
          </div>

          {/* 暂停界面 */}
          {gameState === 'paused' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
              <div className="glass rounded-xl p-8 text-center">
                <h2 className="text-4xl font-bold text-white mb-6">游戏暂停</h2>
                <div className="space-y-4">
                  <button
                    onClick={() => setGameState('playing')}
                    className="w-full glass px-6 py-3 rounded-lg text-white hover:glow"
                  >
                    继续游戏
                  </button>
                  <button
                    onClick={() => setGameState('menu')}
                    className="w-full glass px-6 py-3 rounded-lg text-white hover:glow"
                  >
                    返回主菜单
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 游戏结束界面 */}
      {gameState === 'gameover' && (
        <div className="relative z-10 flex items-center justify-center h-full">
          <div className="glass rounded-xl p-8 max-w-md text-center">
            <h2 className="text-5xl font-bold text-white text-glow mb-6">游戏结束</h2>
            <div className="space-y-4 mb-8">
              <div className="text-2xl text-white">最终分数: <span className="text-yellow-400">{score}</span></div>
              <div className="text-xl text-white">到达关卡: <span className="text-blue-400">{level}</span></div>
              {achievements.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xl text-white mb-3">获得成就:</h3>
                  <div className="space-y-2">
                    {achievements.map(ach => (
                      <div key={ach.id} className="glass p-3 rounded-lg">
                        <div className="text-yellow-400 font-bold">{ach.name}</div>
                        <div className="text-sm text-blue-200">{ach.description}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => setGameState('menu')}
              className="w-full glass px-6 py-3 rounded-lg text-white hover:glow"
            >
              返回主菜单
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
