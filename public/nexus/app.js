import { createWorld, makeAvatar } from "./world.js";
import {
  COURSE,
  ISLANDS,
  BRIDGES,
  CRYSTALS,
  makePlayer,
  stepPlayer,
  clamp,
  validBlock,
  canPlace,
  blockSolid,
} from "./physics.mjs";
const $ = (id) => document.getElementById(id);
const SAVE_KEY = "nexus-isles-v1";
let save = {},
  saveOK = true;
try {
  save = JSON.parse(localStorage.getItem(SAVE_KEY) || "{}") || {};
} catch {
  saveOK = false;
}
if (typeof save !== "object" || Array.isArray(save)) save = {};
save.crystals = [
  ...new Set(
    Array.isArray(save.crystals)
      ? save.crystals.filter((i) => Number.isInteger(i) && i >= 0 && i < 12)
      : [],
  ),
];
save.blocks = (Array.isArray(save.blocks) ? save.blocks : [])
  .filter(validBlock)
  .slice(0, 150)
  .filter(
    (b, i, a) =>
      a.findIndex((c) => c.x === b.x && c.z === b.z && c.level === b.level) ===
      i,
  );
save.best = Number.isFinite(save.best) && save.best > 0 ? save.best : null;
save.skin = save.skin === 1 ? 1 : 0;
let mode = "explore",
  skin = save.skin,
  world,
  avatar,
  player = makePlayer(),
  active = false,
  initializing = false;
let yaw = 0.28,
  pitch = 0.38,
  distance = 14,
  checkpoint = { x: 0, y: 0, z: 7 },
  ringIndex = 0,
  runTime = 0,
  runStarted = false,
  runFinished = false;
let elapsed = 0,
  lastTime = 0,
  accumulator = 0,
  mapClock = 0,
  netClock = 0,
  toastTimer,
  checkpointTimer,
  socket,
  reconnectTimer,
  socketGeneration = 0;
let soundOn = readSoundPref(),
  audioContext,
  stateSeen = false,
  particlePool = [],
  frameCount = 0,
  frameTime = 0,
  fps = 60,
  qualityReduced = false;
let blockMeshes = [],
  targetBlock = null,
  selectedColumn = null,
  room = new URL(location.href).searchParams.get("room") || "public",
  selfID = "";
if (!/^[a-zA-Z0-9_-]{1,32}$/.test(room)) room = "public";
const remote = new Map(),
  keys = new Set(),
  input = { x: 0, z: 0, jump: false, dash: false, holdJump: false },
  joy = { x: 0, z: 0, id: null },
  look = { id: null, x: 0, y: 0 };
let touchJump = false,
  aim = null;
const mobile =
  matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 0;
document.body.classList.toggle("touch-ui", mobile);
$("nickname").value =
  typeof save.nick === "string" ? save.nick.slice(0, 12) : "";
function persist() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    saveOK = true;
  } catch {
    saveOK = false;
    toast("저장 공간을 사용할 수 없어 이번 기록은 저장되지 않아요.");
  }
}
function toast(text, duration = 3000) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").hidden = true;
  }, duration);
}
// Static DOM actions stay available even if the 3D renderer cannot initialize.
document.querySelectorAll("[data-mode]").forEach((b) =>
  b.addEventListener("click", () => {
    mode = b.dataset.mode;
    document.querySelectorAll("[data-mode]").forEach((a) => {
      const on = a === b;
      a.classList.toggle("selected", on);
      a.setAttribute("aria-pressed", String(on));
    });
    document.querySelector(".panel-kicker span").textContent =
      `0${["explore", "parkour", "build"].indexOf(mode) + 1} / 03`;
  }),
);
document.querySelectorAll("[data-skin]").forEach((b) => {
  const on = Number(b.dataset.skin) === skin;
  b.classList.toggle("selected", on);
  b.setAttribute("aria-pressed", String(on));
  b.addEventListener("click", () => {
    skin = Number(b.dataset.skin);
    document.querySelectorAll("[data-skin]").forEach((a) => {
      a.classList.toggle("selected", a === b);
      a.setAttribute("aria-pressed", String(a === b));
    });
  });
});
function clearInput() {
  keys.clear();
  input.jump = input.dash = input.holdJump = touchJump = false;
  joy.x = joy.z = 0;
  joy.id = null;
  look.id = null;
  $("stick").style.transform = "";
}
function showModal(html) {
  clearInput();
  $("modal-body").innerHTML = html;
  if (!$("modal").open) $("modal").showModal();
  updateDuck();
}
function closeModal() {
  $("modal").close();
  clearInput();
  updateDuck();
}
$("close-modal").onclick = closeModal;
$("modal").addEventListener("close", clearInput);
function help() {
  showModal(
    `<div class="eyebrow">EXPLORER'S GUIDE</div><h2>구름 위에서 만나요.</h2><p>길을 잃어도 괜찮아요. 아래의 ‘복귀’를 누르면 마지막 체크포인트로 돌아옵니다.</p><div class="key-row"><span>이동 / 시점 회전</span><span>${mobile ? "왼손 스틱 / 화면 드래그" : "WASD·방향키 / 화면 드래그"}</span></div><div class="key-row"><span>2단 점프 / 활공</span><span>${mobile ? "점프 2번 / 두 번째 길게" : "Space 2번 / 두 번째 길게"}</span></div><div class="key-row"><span>짧게 빠르게 대시</span><span>${mobile ? "대시 버튼" : "Shift"}</span></div><div class="key-row"><span>블록 설치 / 회수</span><span>${mobile ? "위치 터치 후 설치 / 회수" : "위치 클릭 후 E / Q"}</span></div><p>탐험: 크리스털 12개를 모아 시작 섬의 포털로 돌아오세요.<br>파쿠르: 1~9 관문을 차례로 통과하세요.<br>건설: 정원에 재료 4종으로 최대 150개 블록을 쌓아요.</p><p>친구와 탐험 위치를 공유합니다. 수집·기록·건설물은 각자의 기기에 저장됩니다.</p><button id="help-done" class="primary">알겠어요, 출발!</button>`,
  );
  $("help-done").onclick = closeModal;
}
$("help").onclick = help;
$("lobby-help").onclick = (e) => {
  e.preventDefault();
  $("how-to-play").scrollIntoView({ behavior: "smooth", block: "start" });
};
$("menu").onclick = () => {
  showModal(
    `<div class="eyebrow">TAKE A BREATH</div><h2>잠깐 쉬어 갈까요?</h2><p>기록은 자동 저장돼요. ${saveOK ? "" : '<span class="save-warning">현재 이 브라우저에서는 저장을 사용할 수 없습니다.</span>'}</p><button class="primary" id="continue">계속 탐험하기</button><button class="secondary" id="menu-help">조작 방법 보기</button><button class="secondary" id="quality">그래픽: ${qualityReduced ? "가볍게" : "선명하게"} · 바꾸기</button><button class="secondary" id="return-lobby">시작 화면으로</button>`,
  );
  $("continue").onclick = closeModal;
  $("menu-help").onclick = help;
  $("return-lobby").onclick = returnLobby;
  $("quality").onclick = () => {
    qualityReduced = !qualityReduced;
    applyQuality();
    $("quality").textContent =
      `그래픽: ${qualityReduced ? "가볍게" : "선명하게"} · 바꾸기`;
  };
};
function applyQuality() {
  world.renderer.setPixelRatio(
    qualityReduced ? 1 : Math.min(devicePixelRatio, mobile ? 1.35 : 1.8),
  );
  world.renderer.shadowMap.enabled = !qualityReduced;
  world.scene.traverse((m) => {
    if (m.material)
      for (const material of Array.isArray(m.material)
        ? m.material
        : [m.material])
        material.needsUpdate = true;
  });
  world.resize();
}
// 소리 — Mixkit 무료 음원(public/nexus/audio/CREDITS.txt). 탐험·파쿠르·정원마다 배경음악이 따로 흐른다.
function readSoundPref() {
  try {
    return localStorage.getItem("nexus_sound") !== "off";
  } catch {
    return true;
  }
}
const SFX_GAIN = {
  jump: 0.45, jump2: 0.5, dash: 0.55, land: 0.5, crystal: 0.9, ring: 0.75,
  place: 0.55, remove: 0.5, respawn: 0.6, click: 0.35, error: 0.35,
  portal: 1, clear: 0.8, friend: 0.45,
};
const BGM = { explore: "bgm-explore", parkour: "bgm-parkour", build: "bgm-build" };
const MUSIC_LEVEL = 0.32;
const buffers = {},
  loadingSounds = {};
let musicGain, sfxGain, bgmSource = null, bgmName = "", windGain = null;
function ensureAudio() {
  if (audioContext) return audioContext;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  audioContext = new AC();
  musicGain = audioContext.createGain();
  sfxGain = audioContext.createGain();
  musicGain.gain.value = 0;
  sfxGain.gain.value = 0.9;
  musicGain.connect(audioContext.destination);
  sfxGain.connect(audioContext.destination);
  for (const n of Object.keys(SFX_GAIN)) loadSound(n);
  return audioContext;
}
function loadSound(name) {
  if (buffers[name]) return Promise.resolve(buffers[name]);
  return (loadingSounds[name] ||= fetch(`/nexus/audio/${name}.mp3`)
    .then((r) => {
      if (!r.ok) throw new Error(r.status);
      return r.arrayBuffer();
    })
    .then((b) => new Promise((ok, no) => audioContext.decodeAudioData(b, ok, no)))
    .then((buf) => (buffers[name] = buf))
    .catch(() => {
      delete loadingSounds[name];
      return null;
    }));
}
function sfx(name, volume = 1, rate = 1) {
  if (!soundOn || !audioContext) return;
  const buf = buffers[name];
  if (!buf) {
    loadSound(name);
    return;
  }
  const src = audioContext.createBufferSource(),
    g = audioContext.createGain();
  src.buffer = buf;
  src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
  g.gain.value = (SFX_GAIN[name] ?? 0.6) * volume;
  src.connect(g);
  g.connect(sfxGain);
  src.start();
}
// 모드가 바뀌면 1.2초 동안 곡을 겹쳐 넘긴다.
function playMusic(key) {
  const name = key && BGM[key];
  if (!soundOn || !audioContext || !name) return stopMusic();
  if (name === bgmName && bgmSource) return;
  bgmName = name;
  loadSound(name).then((buf) => {
    if (!buf || bgmName !== name || !soundOn) return;
    const now = audioContext.currentTime,
      old = bgmSource;
    const src = audioContext.createBufferSource(),
      g = audioContext.createGain();
    src.buffer = buf;
    src.loop = true;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(1, now + 1.2);
    src.connect(g);
    g.connect(musicGain);
    src.start();
    bgmSource = { src, g };
    musicGain.gain.setTargetAtTime(duckLevel(), now, 0.3);
    if (old) fadeOut(old);
  });
}
function fadeOut(node) {
  const now = audioContext.currentTime;
  node.g.gain.cancelScheduledValues(now);
  node.g.gain.setValueAtTime(Math.max(0.0001, node.g.gain.value), now);
  node.g.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
  node.src.stop(now + 1.3);
}
function stopMusic() {
  bgmName = "";
  if (bgmSource && audioContext) fadeOut(bgmSource);
  bgmSource = null;
}
// 결과 창이 떠 있으면 음악을 낮춰 팡파르가 들리게 한다.
function duckLevel() {
  return $("modal").open ? MUSIC_LEVEL * 0.35 : MUSIC_LEVEL;
}
function updateDuck() {
  if (audioContext && musicGain)
    musicGain.gain.setTargetAtTime(duckLevel(), audioContext.currentTime, 0.25);
}
// 활공하는 동안만 바람 소리가 커진다.
function updateWind(gliding) {
  if (!audioContext || !soundOn) return;
  if (!windGain) {
    const buf = buffers.wind;
    if (!buf) {
      loadSound("wind");
      return;
    }
    const src = audioContext.createBufferSource();
    windGain = audioContext.createGain();
    windGain.gain.value = 0;
    src.buffer = buf;
    src.loop = true;
    src.connect(windGain);
    windGain.connect(sfxGain);
    src.start();
  }
  windGain.gain.setTargetAtTime(gliding ? 0.55 : 0, audioContext.currentTime, gliding ? 0.15 : 0.3);
}
function paintSoundButton() {
  $("sound").style.color = soundOn ? "#bdffb7" : "#ffffff";
  $("sound").setAttribute("aria-label", soundOn ? "소리 끄기" : "소리 켜기");
}
paintSoundButton();
$("sound").onclick = () => {
  soundOn = !soundOn;
  try {
    localStorage.setItem("nexus_sound", soundOn ? "on" : "off");
  } catch {}
  if (soundOn) {
    ensureAudio()?.resume();
    loadSound("wind");
    if (active) playMusic(mode);
    sfx("click");
  } else {
    stopMusic();
    if (windGain) windGain.gain.value = 0;
  }
  paintSoundButton();
  toast(soundOn ? "배경 음악과 효과음 켜짐" : "소리 꺼짐", 1400);
};
$("play").onclick = async () => {
  if (initializing) return;
  initializing = true;
  $("play").disabled = true;
  save.nick = $("nickname").value.trim().slice(0, 12) || "구름 탐험가";
  save.skin = skin;
  persist();
  $("lobby").hidden = true;
  $("game").hidden = false;
  $("loading").hidden = false;
  document.body.classList.add("playing");
  if (soundOn) {
    ensureAudio()?.resume();
    loadSound("wind");
  }
  try {
    if (!world) {
      world = await createWorld($("viewport"), mobile);
      for (const b of save.blocks) blockMeshes.push(world.createBlock(b));
      setupControls();
      setupParticles();
    }
    if (avatar) {
      world.scene.remove(avatar);
      disposeAvatar(avatar);
    }
    avatar = makeAvatar(skin);
    world.scene.add(avatar);
    world.collectibles.forEach((c) => {
      c.mesh.visible = !save.crystals.includes(c.id);
    });
    active = true;
    world.resize();
    setMode(mode);
    connect();
    $("loading").hidden = true;
    if (!lastTime) {
      lastTime = performance.now();
      requestAnimationFrame(frame);
    }
    if (!save.seenHelp) {
      toast(
        mobile
          ? "왼손으로 이동 · 오른손으로 점프 · 화면 드래그로 시점 회전"
          : "WASD 이동 · Space 2단 점프 · 드래그로 시점 회전",
        6500,
      );
      save.seenHelp = true;
      persist();
    }
    if (!saveOK)
      toast(
        "브라우저 저장을 사용할 수 없습니다. 이번 플레이만 유지됩니다.",
        6000,
      );
  } catch (err) {
    console.error(err);
    $("loading-copy").textContent =
      "3D 실행에 실패했어요. 최신 Chrome·Edge에서 하드웨어 가속을 켜고 다시 시도해 주세요.";
    const back = document.createElement("button");
    back.className = "primary";
    back.textContent = "시작 화면으로 돌아가기";
    back.onclick = () => location.reload();
    $("loading").append(back);
  } finally {
    initializing = false;
    $("play").disabled = false;
  }
};
function returnLobby() {
  closeModal();
  active = false;
  clearInput();
  disconnect();
  persist();
  $("game").hidden = true;
  $("lobby").hidden = false;
  document.body.classList.remove("playing");
  stopMusic();
  updateWind(false);
}
function setMode(next) {
  mode = next;
  clearInput();
  ringIndex = 0;
  runTime = 0;
  runStarted = false;
  runFinished = false;
  aim = null;
  for (const n of ["explore", "parkour", "build"])
    $("mode-" + n).classList.toggle("active", n === mode);
  $("build-controls").hidden = mode !== "build";
  world.ghost.visible = false;
  checkpoint =
    mode === "build"
      ? { x: 0, y: 0, z: 31 }
      : mode === "parkour"
        ? { x: 0, y: 0, z: -10 }
        : { x: 0, y: 0, z: 7 };
  resetPosition();
  if (mode === "build") {
    yaw = Math.PI;
    player.angle = 0;
  } else {
    yaw = 0.28;
    player.angle = Math.PI;
  }
  pitch = 0.38;
  world.rings.forEach((r) => {
    r.material.color.set("#80ffdf");
    r.material.emissive.set("#33d6b0");
  });
  if (mode === "parkour")
    toast("첫 관문을 통과하면 타이머 시작! 1~9번 순서로 도전하세요.", 4500);
  if (mode === "build")
    toast("정원의 바닥을 선택하고 블록을 설치하세요. E 설치 · Q 회수", 4500);
  updateHUD();
  updateCamera(1);
  playMusic(mode);
}
for (const n of ["explore", "parkour", "build"])
  $("mode-" + n).onclick = () => {
    if (n !== mode) sfx("click");
    setMode(n);
  };
function resetPosition() {
  Object.assign(player, makePlayer(), checkpoint);
  player.vx = player.vy = player.vz = 0;
  accumulator = 0;
}
$("respawn").onclick = () => {
  resetPosition();
  sfx("respawn");
  toast("체크포인트로 돌아왔어요.");
};
function checkpointAt(c) {
  checkpoint = { x: c.x, y: c.y, z: c.z };
  $("checkpoint").hidden = false;
  clearTimeout(checkpointTimer);
  checkpointTimer = setTimeout(() => {
    $("checkpoint").hidden = true;
  }, 2000);
}
function updateHUD() {
  $("crystal-count").textContent = save.crystals.length;
  if (mode === "explore") {
    $("quest-label").textContent = "STORY QUEST";
    $("quest-title").textContent = save.complete
      ? "포털의 수호자"
      : "잠든 포털을 깨워라";
    $("quest-copy").textContent =
      save.crystals.length >= 12
        ? "여명의 섬 중앙 포털 안으로 들어가세요."
        : "지도 속 빛을 따라 크리스털 12개를 모으세요.";
    $("quest-status").textContent =
      `빛의 크리스털 ${save.crystals.length} / 12`;
    $("quest-progress").style.width = `${(save.crystals.length / 12) * 100}%`;
  }
  if (mode === "parkour") {
    $("quest-label").textContent = "SKY RUN";
    $("quest-title").textContent = runFinished
      ? "하늘의 길을 열었어요!"
      : "하늘의 관문";
    $("quest-copy").textContent =
      "빛나는 고리를 순서대로 통과하세요. 낙하해도 체크포인트에서 계속!";
    $("quest-status").textContent =
      `관문 ${ringIndex} / 9  ·  ${runTime.toFixed(1)}초${save.best ? `  ·  최고 ${save.best.toFixed(1)}초` : ""}`;
    $("quest-progress").style.width = `${(ringIndex / 9) * 100}%`;
  }
  if (mode === "build") {
    $("quest-label").textContent = "MAKER’S GARDEN";
    $("quest-title").textContent = "상상을 쌓는 시간";
    $("quest-copy").textContent =
      "바닥을 골라 쌓아 보세요. 같은 칸을 선택하면 위로 쌓입니다. 내 건설물은 자동 저장돼요.";
    $("quest-status").textContent =
      `${save.blocks.length} / 150 블록 · ${saveOK ? "기기에 저장됨" : "저장 사용 불가"}`;
    $("quest-progress").style.width = `${(save.blocks.length / 150) * 100}%`;
  }
  $("build-count").textContent = `${save.blocks.length} / 150`;
}
function setupControls() {
  window.addEventListener("keydown", (e) => {
    if (
      !active ||
      $("modal").open ||
      /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)
    )
      return;
    if (
      ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
        e.code,
      )
    )
      e.preventDefault();
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === "Space") {
      input.jump = true;
    }
    if (e.code === "ShiftLeft" || e.code === "ShiftRight") input.dash = true;
    if (e.code === "KeyE" && mode === "build") placeBlock();
    if (e.code === "KeyQ" && mode === "build") removeBlock();
    if (e.code === "KeyR") $("respawn").click();
    if (e.code === "Escape") $("menu").click();
  });
  window.addEventListener("keyup", (e) => keys.delete(e.code));
  window.addEventListener("blur", clearInput);
  document.addEventListener("visibilitychange", () => {
    clearInput();
    accumulator = 0;
    if (document.hidden && audioContext) audioContext.suspend();
    else if (soundOn && audioContext) audioContext.resume();
  });
  const canvas = $("viewport");
  canvas.addEventListener("pointerdown", (e) => {
    if (!active || $("modal").open || look.id !== null) return;
    look.id = e.pointerId;
    look.x = e.clientX;
    look.y = e.clientY;
    look.startX = e.clientX;
    look.startY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (look.id !== e.pointerId) return;
    yaw -= (e.clientX - look.x) * 0.006;
    pitch = clamp(pitch + (e.clientY - look.y) * 0.0035, 0.12, 1.05);
    look.x = e.clientX;
    look.y = e.clientY;
  });
  function endLook(e) {
    if (look.id !== e.pointerId) return;
    if (
      mode === "build" &&
      Math.hypot(e.clientX - look.startX, e.clientY - look.startY) < 8
    ) {
      const r = canvas.getBoundingClientRect();
      aim = {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: (-(e.clientY - r.top) / r.height) * 2 + 1,
      };
      updateBuildTarget();
    }
    look.id = null;
  }
  canvas.addEventListener("pointerup", endLook);
  canvas.addEventListener("pointercancel", () => {
    look.id = null;
  });
  canvas.addEventListener("lostpointercapture", () => {
    look.id = null;
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      distance = clamp(distance + e.deltaY * 0.01, 5, 18);
    },
    { passive: false },
  );
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  const joystick = $("joystick");
  function moveJoy(e) {
    const r = joystick.getBoundingClientRect(),
      x = e.clientX - r.left - r.width / 2,
      y = e.clientY - r.top - r.height / 2,
      radius = r.width * 0.34,
      length = Math.hypot(x, y),
      ratio = Math.min(1, radius / Math.max(1, length));
    joy.x = (x * ratio) / radius;
    joy.z = (y * ratio) / radius;
    $("stick").style.transform = `translate(${x * ratio}px,${y * ratio}px)`;
  }
  joystick.addEventListener("pointerdown", (e) => {
    if (joy.id !== null) return;
    e.preventDefault();
    joy.id = e.pointerId;
    joystick.setPointerCapture(e.pointerId);
    moveJoy(e);
  });
  joystick.addEventListener("pointermove", (e) => {
    if (joy.id === e.pointerId) moveJoy(e);
  });
  const stopJoy = (e) => {
    if (joy.id === e.pointerId) {
      joy.id = null;
      joy.x = joy.z = 0;
      $("stick").style.transform = "";
    }
  };
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    joystick.addEventListener(event, stopJoy);
  $("jump").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.jump = true;
    touchJump = true;
    $("jump").setPointerCapture(e.pointerId);
  });
  for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
    $("jump").addEventListener(event, () => {
      touchJump = false;
    });
  $("dash").addEventListener("pointerdown", (e) => {
    e.preventDefault();
    input.dash = true;
  });
  window.addEventListener("resize", () => {
    if (active) world.resize();
  });
}
function movementInput() {
  let x =
    (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
    (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0) +
    joy.x;
  let z =
    (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0) -
    (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) +
    joy.z;
  input.x = x * Math.cos(yaw) + z * Math.sin(yaw);
  input.z = z * Math.cos(yaw) - x * Math.sin(yaw);
  input.holdJump = keys.has("Space") || touchJump;
}
function updateCamera(dt) {
  const t = world.T,
    target = new t.Vector3(player.x, player.y + 1.35, player.z),
    offset = new t.Vector3(
      Math.sin(yaw) * Math.cos(pitch) * distance,
      Math.sin(pitch) * distance,
      Math.cos(yaw) * Math.cos(pitch) * distance,
    );
  world.camera.position.lerp(
    target.clone().add(offset),
    1 - Math.exp(-dt * 12),
  );
  world.camera.lookAt(target);
}
function collectAndProgress(dt) {
  for (const c of world.collectibles)
    if (
      c.mesh.visible &&
      Math.hypot(player.x - c.x, player.y + 1 - c.y, player.z - c.z) < 1.45
    ) {
      c.mesh.visible = false;
      save.crystals.push(c.id);
      persist();
      burst(c.x, c.y, c.z, "#9affde");
      sfx("crystal", 1, 1 + save.crystals.length * 0.012);
      toast(`빛의 크리스털 발견! ${save.crystals.length} / 12`, 1700);
      updateHUD();
    }
  if (mode === "parkour") {
    if (runStarted && !runFinished) runTime += dt;
    const gate = COURSE[ringIndex];
    if (
      gate &&
      Math.hypot(player.x - gate.x, player.z - gate.z) < 1.8 &&
      Math.abs(player.y + 0.9 - (gate.y + 1.8)) < 2.1
    ) {
      runStarted = true;
      world.rings[ringIndex].material.color.set("#ffd38c");
      world.rings[ringIndex].material.emissive.set("#c98b39");
      ringIndex++;
      checkpointAt(gate);
      burst(gate.x, gate.y + 2, gate.z, "#d3ffb9");
      if (ringIndex < 9) sfx("ring", 1, 1 + ringIndex * 0.03);
      if (ringIndex === 9) {
        sfx("clear");
        runFinished = true;
        save.best = save.best ? Math.min(save.best, runTime) : runTime;
        persist();
        setTimeout(showRunResult, 600);
      }
    }
  }
  if (
    mode === "explore" &&
    save.crystals.length === 12 &&
    !save.complete &&
    Math.hypot(player.x, player.z + 8) < 2.2 &&
    player.y < 3
  ) {
    save.complete = true;
    persist();
    sfx("portal");
    burst(0, 3, -8, "#b6ffce", 48);
    showModal(
      '<div class="result"><img class="reward" src="/nexus/assets/relic.webp" alt="빛의 크리스털 보상"><div class="eyebrow">THE PORTAL AWAKENS</div><h2>포털의 수호자가 되었어요!</h2><p>흩어진 12개의 빛을 모두 되찾았어요.<br>이제 하늘의 관문에 도전하거나, 나만의 정원을 만들어 보세요.</p><button id="finish-explore" class="primary">계속 탐험하기</button></div>',
    );
    $("finish-explore").onclick = closeModal;
    updateHUD();
  }
  const zone =
    player.z > 25
      ? "상상의 정원"
      : player.x > 40
        ? "크리스털 유적"
        : player.z < -68
          ? "바람의 성소"
          : player.z < -14
            ? "하늘의 관문"
            : "여명의 섬";
  $("zone-name").textContent = zone;
  if (mode === "explore" && player.grounded) {
    if (zone === "크리스털 유적" && checkpoint.x !== 46)
      checkpointAt({ x: 46, y: 3, z: 0 });
    else if (zone === "바람의 성소" && checkpoint.z !== -72)
      checkpointAt({ x: 0, y: 6, z: -72 });
    else if (zone === "여명의 섬" && (checkpoint.x !== 0 || checkpoint.z !== 7))
      checkpoint = { x: 0, y: 0, z: 7 };
  }
}
function showRunResult() {
  if (!active || mode !== "parkour" || !runFinished) return;
  showModal(
    `<div class="result"><img class="reward" src="/nexus/assets/sky-trial.webp" alt="하늘의 관문"><div class="eyebrow">SKY RUN COMPLETE</div><h2>하늘의 길을 열었어요!</h2><strong>${runTime.toFixed(1)}<small style="font-size:16px"> 초</small></strong><p>9개 관문 통과 · 내 최고 ${save.best.toFixed(1)}초<br>낙하 후 복귀한 시간도 기록에 포함됩니다.</p><button id="again" class="primary">기록에 다시 도전</button><button id="keep-exploring" class="secondary">자유 탐험으로</button></div>`,
  );
  $("again").onclick = () => {
    closeModal();
    setMode("parkour");
  };
  $("keep-exploring").onclick = () => {
    closeModal();
    setMode("explore");
  };
}
function updateBuildTarget() {
  if (mode !== "build") {
    world.ghost.visible = false;
    return;
  }
  let x, z;
  if (aim) {
    const hit = world.pickGround(aim.x, aim.y, [...blockMeshes, world.ground]);
    if (hit) {
      x = hit.object.userData.block?.x ?? Math.round(hit.point.x / 1.5) * 1.5;
      z =
        hit.object.userData.block?.z ??
        30 + Math.round((hit.point.z - 30) / 1.5) * 1.5;
    }
  }
  if (x === undefined) {
    x = Math.round(player.x + Math.sin(player.angle) * 3.5);
    z = Math.round(player.z + Math.cos(player.angle) * 3.5);
  }
  // Integer centers form a clean two-unit build grid with room for walking.
  x = Math.round(x / 2) * 2;
  z = 30 + Math.round((z - 30) / 2) * 2;
  const column = save.blocks.filter((b) => b.x === x && b.z === z);
  const level = column.length ? Math.max(...column.map((b) => b.level)) + 1 : 0;
  selectedColumn = { x, z };
  targetBlock = { x, z, level, material: Number($("material").value) };
  world.ghost.visible = validBlock(targetBlock);
  world.ghost.position.set(x, level * 1.5 + 0.75, z);
  world.ghost.material.color.set(
    canPlace(save.blocks, targetBlock, player) ? "#bdffc0" : "#ff9f99",
  );
}
function placeBlock() {
  updateBuildTarget();
  if (!canPlace(save.blocks, targetBlock, player)) {
    sfx("error");
    toast(
      "정원 안 9m 이내에, 몸과 겹치지 않게 설치하세요. 최대 8층·150개입니다.",
    );
    return;
  }
  const b = { ...targetBlock };
  save.blocks.push(b);
  blockMeshes.push(world.createBlock(b));
  persist();
  sfx("place", 1, 0.92 + b.level * 0.03);
  burst(b.x, b.level * 1.5 + 1, b.z, "#caffae", 8);
  updateHUD();
}
function removeBlock() {
  updateBuildTarget();
  const candidates = save.blocks
    .filter((b) => b.x === selectedColumn.x && b.z === selectedColumn.z)
    .sort((a, b) => b.level - a.level);
  const b = candidates[0];
  if (!b || Math.hypot(player.x - b.x, player.z - b.z) > 9) {
    sfx("error");
    toast("가까운 블록이 있는 칸을 먼저 선택하세요.");
    return;
  }
  const i = save.blocks.indexOf(b);
  world.scene.remove(blockMeshes[i]);
  blockMeshes.splice(i, 1);
  save.blocks.splice(i, 1);
  persist();
  sfx("remove");
  updateHUD();
}
$("place").onclick = placeBlock;
$("remove").onclick = removeBlock;
function setupParticles() {
  const T = world.T,
    g = new T.BoxGeometry(0.09, 0.09, 0.09),
    m = new T.MeshBasicMaterial({ color: "#c5fff0" });
  for (let i = 0; i < 70; i++) {
    const mesh = new T.Mesh(g, m);
    mesh.visible = false;
    world.scene.add(mesh);
    particlePool.push({ mesh, life: 0, vx: 0, vy: 0, vz: 0 });
  }
}
function burst(x, y, z, color, count = 18) {
  let n = 0;
  for (const p of particlePool) {
    if (p.life > 0) continue;
    p.life = 0.5 + Math.random() * 0.5;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.vx = (Math.random() - 0.5) * 6;
    p.vy = 2 + Math.random() * 5;
    p.vz = (Math.random() - 0.5) * 6;
    if (++n >= count) break;
  }
}
function drawMap() {
  const c = $("minimap"),
    ctx = c.getContext("2d"),
    scale = 1.03,
    originX = 60,
    originZ = 118,
    mx = (x) => originX + x * scale,
    mz = (z) => originZ + z * scale;
  ctx.fillStyle = "#143c48";
  ctx.fillRect(0, 0, 180, 180);
  ctx.strokeStyle = "#5b9a9740";
  ctx.lineWidth = 0.5;
  for (let i = 0; i < 180; i += 20) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 180);
    ctx.moveTo(0, i);
    ctx.lineTo(180, i);
    ctx.stroke();
  }
  for (const p of [...ISLANDS, ...BRIDGES, ...COURSE]) {
    ctx.fillStyle =
      p.kind === "bridge"
        ? "#9e9371"
        : p.kind === "course"
          ? "#86bdb1"
          : "#74a48d";
    ctx.fillRect(
      mx(p.x - p.w / 2),
      mz(p.z - p.d / 2),
      p.w * scale,
      p.d * scale,
    );
  }
  for (const c of world.collectibles)
    if (c.mesh.visible) {
      ctx.fillStyle = "#8effed";
      ctx.beginPath();
      ctx.arc(mx(c.x), mz(c.z), 2.1, 0, Math.PI * 2);
      ctx.fill();
    }
  for (const r of remote.values()) {
    ctx.fillStyle = "#d4c6fc";
    ctx.beginPath();
    ctx.arc(mx(r.target.x), mz(r.target.z), 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.translate(mx(player.x), mz(player.z));
  ctx.rotate(-player.angle + Math.PI);
  ctx.fillStyle = "#e8ffb8";
  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(3.8, 4);
  ctx.lineTo(0, 2);
  ctx.lineTo(-3.8, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (mode === "parkour" && COURSE[ringIndex]) {
    const p = COURSE[ringIndex];
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.arc(mx(p.x), mz(p.z), 5, 0, Math.PI * 2);
    ctx.stroke();
  }
}
function disconnect() {
  socketGeneration++;
  clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  for (const r of remote.values()) {
    world.scene.remove(r.mesh);
    disposeAvatar(r.mesh);
  }
  remote.clear();
}
function disposeAvatar(mesh) {
  const textures = new Set(),
    materials = new Set();
  mesh.traverse((o) => {
    if (o.material) {
      materials.add(o.material);
      if (o.material.map) textures.add(o.material.map);
    }
  });
  textures.forEach((t) => t.dispose());
  materials.forEach((m) => m.dispose());
}
function connect() {
  if (!active) return;
  clearTimeout(reconnectTimer);
  const gen = ++socketGeneration;
  if (socket) {
    socket.onclose = null;
    socket.close();
  }
  const ws = new WebSocket(
    `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/nexus/ws?room=${encodeURIComponent(room)}`,
  );
  socket = ws;
  stateSeen = false;
  $("network").textContent = "친구 월드에 연결 중";
  ws.onopen = () =>
    ws.send(JSON.stringify({ type: "hello", nick: save.nick, skin }));
  ws.onmessage = (event) => {
    if (gen !== socketGeneration) return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.type === "welcome") selfID = msg.id;
    if (msg.type === "state") {
      const present = new Set();
      for (const p of msg.players) {
        if (p.id === selfID) continue;
        present.add(p.id);
        let r = remote.get(p.id);
        if (!r) {
          const mesh = makeAvatar(p.skin, p.nick);
          world.scene.add(mesh);
          mesh.position.set(p.x, p.y, p.z);
          r = { mesh, target: p };
          remote.set(p.id, r);
          if (stateSeen) sfx("friend");
        }
        r.target = p;
      }
      for (const [id, r] of remote)
        if (!present.has(id)) {
          world.scene.remove(r.mesh);
          disposeAvatar(r.mesh);
          remote.delete(id);
        }
      stateSeen = true;
      $("network").textContent =
        `${room === "public" ? "공개 월드" : "초대 월드"} · ${msg.players.length}명 접속`;
    }
  };
  ws.onclose = (event) => {
    if (gen !== socketGeneration || !active) return;
    for (const r of remote.values()) {
      world.scene.remove(r.mesh);
      disposeAvatar(r.mesh);
    }
    remote.clear();
    $("network").textContent =
      event.code === 1013
        ? "월드가 가득 찼어요 · 혼자 탐험"
        : "혼자 탐험 · 연결 재시도 중";
    reconnectTimer = setTimeout(connect, event.code === 1013 ? 15000 : 5000);
  };
  ws.onerror = () => {
    $("network").textContent = "혼자 탐험 · 연결 확인 중";
  };
}
$("invite").onclick = async () => {
  if (room === "public") {
    room = crypto.randomUUID().slice(0, 8);
    const u = new URL(location.href);
    u.searchParams.set("room", room);
    history.replaceState(null, "", u);
    disconnect();
    connect();
  }
  const link = new URL("/nexus/", location.origin);
  link.searchParams.set("room", room);
  try {
    await navigator.clipboard.writeText(link.href);
    toast("친구 초대 링크를 복사했어요. 같은 링크로 만나세요!", 4000);
  } catch {
    showModal(
      '<h2>친구 초대</h2><p>아래 링크를 복사해 친구에게 보내주세요.</p><input class="invite-field" id="invite-link" readonly>',
    );
    $("invite-link").value = link.href;
    $("invite-link").select();
  }
};
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.075);
  lastTime = now;
  if (!active || document.hidden) return;
  elapsed += dt;
  frameCount++;
  frameTime += dt;
  if (frameTime > 3) {
    fps = Math.round(frameCount / frameTime);
    if (fps < 26 && !qualityReduced) {
      qualityReduced = true;
      applyQuality();
      toast("부드러운 플레이를 위해 그래픽을 가볍게 조절했어요.");
    }
    frameCount = frameTime = 0;
  }
  if (!$("modal").open) {
    movementInput();
    accumulator += dt;
    const solids = [...world.solids, ...save.blocks.map(blockSolid)];
    while (accumulator >= 1 / 60) {
      const jumpsBefore = player.jumps,
        dashBefore = player.dash,
        airBefore = !player.grounded,
        vyBefore = player.vy;
      stepPlayer(player, input, solids, 1 / 60);
      input.jump = input.dash = false;
      if (player.jumps > jumpsBefore) sfx(player.jumps >= 2 ? "jump2" : "jump");
      if (player.dash > 0 && dashBefore <= 0) sfx("dash");
      if (airBefore && player.grounded && vyBefore < -7)
        sfx("land", Math.min(1, -vyBefore / 18));
      collectAndProgress(1 / 60);
      accumulator -= 1 / 60;
    }
    if (
      player.y < -26 ||
      Math.abs(player.x) > 250 ||
      Math.abs(player.z) > 250
    ) {
      resetPosition();
      sfx("respawn");
      toast("괜찮아요! 체크포인트에서 다시 출발해요.", 2300);
    }
  } else {
    accumulator = 0;
  }
  avatar.position.set(player.x, player.y, player.z);
  const delta = Math.atan2(
    Math.sin(player.angle - avatar.rotation.y),
    Math.cos(player.angle - avatar.rotation.y),
  );
  avatar.rotation.y += delta * Math.min(1, dt * 14);
  avatar.userData.animate(
    elapsed,
    Math.hypot(player.vx, player.vz),
    !player.grounded,
    player.gliding,
  );
  updateCamera(dt);
  world.update(elapsed, player);
  for (const r of remote.values()) {
    const p = r.target;
    const d = r.mesh.position.distanceTo(new world.T.Vector3(p.x, p.y, p.z));
    r.mesh.position.lerp(
      new world.T.Vector3(p.x, p.y, p.z),
      Math.min(1, dt * 12),
    );
    r.mesh.rotation.y = p.angle;
    r.mesh.userData.animate(elapsed, Math.min(7, d * 18), p.air, p.glide);
  }
  for (const p of particlePool)
    if (p.life > 0) {
      p.life -= dt;
      p.mesh.visible = p.life > 0;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.vy -= 10 * dt;
      p.mesh.scale.setScalar(Math.max(0.01, p.life));
    }
  mapClock += dt;
  if (mapClock > 0.12) {
    drawMap();
    if (mode === "parkour") updateHUD();
    if (mode === "build") updateBuildTarget();
    mapClock = 0;
  }
  netClock += dt;
  if (
    netClock > 0.075 &&
    socket?.readyState === 1 &&
    socket.bufferedAmount < 8192
  ) {
    socket.send(
      JSON.stringify({
        type: "pose",
        x: player.x,
        y: player.y,
        z: player.z,
        angle: player.angle,
        air: !player.grounded,
        glide: player.gliding,
      }),
    );
    netClock = 0;
  }
  updateWind(player.gliding && !$("modal").open);
  world.renderer.render(world.scene, world.camera);
}
window.addEventListener("pagehide", () => {
  persist();
  disconnect();
});
// Read-only diagnostics for browser validation and performance investigations.
window.nexusInspect = () => ({
  active,
  mode,
  player: { ...player },
  checkpoint: { ...checkpoint },
  crystals: [...save.crystals],
  blocks: save.blocks.map((b) => ({ ...b })),
  targetBlock: targetBlock && { ...targetBlock },
  ringIndex,
  runTime,
  runFinished,
  complete: !!save.complete,
  best: save.best,
  peers: remote.size,
  room,
  fps,
  qualityReduced,
  joystick: { x: joy.x, z: joy.z, active: joy.id !== null },
  yaw,
  pitch,
  drawCalls: world?.renderer.info.render.calls,
  triangles: world?.renderer.info.render.triangles,
});
