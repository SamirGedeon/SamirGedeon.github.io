/* All information and links remain readable without JavaScript. */
const localization = window.SamirI18n;
function t(message, values = {}) {
  if (localization) return localization.t(message, values);
  return message.replace(/\{(\w+)\}/g, (match, key) => values[key] ?? match);
}
const root = document.documentElement;
const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
const compactScreen = matchMedia('(max-width: 767px)');
const lowPower = Boolean(navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
root.classList.toggle('is-low-power', lowPower);
let motionPreference = null;
try { motionPreference = localStorage.getItem('samir-motion'); } catch { /* Storage is optional. */ }
const motionButton = document.querySelector('#motion-toggle');
const motionLabel = document.querySelector('#motion-label');
const motionListeners = [];
function reducedMotion() { return systemMotion.matches || motionPreference === 'reduced'; }
function motionAllowed() { return !reducedMotion() && !compactScreen.matches && !lowPower && !document.hidden; }
function updateMotion() {
  root.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  motionLabel.textContent = t(systemMotion.matches ? 'Movimento reduzido pelo dispositivo' : reducedMotion() ? 'Ativar movimento' : 'Reduzir movimento');
  motionButton.disabled = systemMotion.matches;
  motionListeners.forEach(refresh => refresh());
}
motionButton.addEventListener('click', () => {
  motionPreference = reducedMotion() ? 'full' : 'reduced';
  try { localStorage.setItem('samir-motion', motionPreference); } catch { /* Keep the session choice. */ }
  updateMotion();
});
systemMotion.addEventListener('change', updateMotion);
compactScreen.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
updateMotion();

const portraitSlider = document.querySelector('#portrait-slider');
const portraitScene = document.querySelector('#portrait-scene');
const designSide = portraitScene.querySelector('.design-side');
const codeSide = portraitScene.querySelector('.code-side');
const artNotes = portraitScene.querySelector('.art-notes');
const codeNotes = portraitScene.querySelector('.code-notes');
const codeRain = portraitScene.querySelector('.code-rain');
let portraitFrame = 0, portraitTarget = 50, portraitAmount = 50;
function cancelPortraitMotion() { cancelAnimationFrame(portraitFrame); portraitFrame = 0; }
function applyPortrait(value) {
  const amount = Math.max(0, Math.min(100, Number(value) || 0));
  portraitAmount = amount;
  portraitSlider.value = String(Math.round(amount * 10) / 10);
  portraitScene.style.setProperty('--split', `${amount}%`);
  portraitScene.style.setProperty('--photo-shift', `${(amount - 50) * .45}px`);
  portraitScene.style.setProperty('--design-emphasis', String(Math.min(1, .5 + amount / 100)));
  portraitScene.style.setProperty('--code-emphasis', String(Math.min(1, .5 + (100 - amount) / 100)));
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const designVisibility = ease((amount - 10) / 25);
  const codeVisibility = ease((90 - amount) / 25);
  portraitScene.style.setProperty('--design-visibility', String(designVisibility));
  portraitScene.style.setProperty('--code-visibility', String(codeVisibility));
  portraitScene.style.setProperty('--art-notes', String(ease((amount - 90) / 10)));
  portraitScene.style.setProperty('--code-notes', String(ease((10 - amount) / 10)));
  portraitScene.dataset.portraitMode = amount >= 90 ? 'design' : amount <= 10 ? 'code' : 'balanced';
  codeSide.hidden = amount >= 90;
  codeRain.hidden = amount >= 90;
  designSide.hidden = amount <= 10;
  artNotes.hidden = amount < 90;
  codeNotes.hidden = amount > 10;
  portraitSlider.setAttribute('aria-valuetext', amount >= 95 ? t('Lado visual: design') : amount <= 5 ? t('Bastidores: código') : t('{amount}% design e {code}% código', { amount: Math.round(amount), code: 100 - Math.round(amount) }));
}
function setPortrait(value) { cancelPortraitMotion(); portraitTarget = Number(value); applyPortrait(value); }
function drawPortraitMotion() {
  portraitFrame = 0;
  if (!motionAllowed()) return;
  const distance = portraitTarget - portraitAmount;
  if (Math.abs(distance) < .08) { applyPortrait(portraitTarget); return; }
  applyPortrait(portraitAmount + distance * .19);
  portraitFrame = requestAnimationFrame(drawPortraitMotion);
}
function animatePortrait(value) {
  portraitTarget = Math.max(0, Math.min(100, value));
  if (!portraitFrame) portraitFrame = requestAnimationFrame(drawPortraitMotion);
}
portraitSlider.addEventListener('pointerdown', cancelPortraitMotion);
portraitSlider.addEventListener('input', () => setPortrait(portraitSlider.value));
portraitSlider.addEventListener('keydown', event => {
  cancelPortraitMotion();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault(); setPortrait(Number(portraitSlider.value) + (event.key === 'ArrowLeft' ? -1 : 1));
  }
});
portraitScene.addEventListener('pointermove', event => {
  if (event.pointerType !== 'mouse' || event.buttons || !motionAllowed()) return;
  const bounds = portraitScene.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
  // A soft central dead zone preserves the iconic half-art / half-photo resting pose.
  const normalized = Math.abs(ratio - .5) < .035 ? .5 : ratio;
  animatePortrait(Math.max(0, Math.min(100, 50 + (.5 - normalized) * 170)));
});
portraitScene.addEventListener('pointerleave', () => {
  if (!motionAllowed() || document.activeElement === portraitSlider) return;
  animatePortrait(50);
});
motionListeners.push(() => { if (!motionAllowed()) cancelPortraitMotion(); });
document.querySelectorAll('[data-portrait]').forEach(button => button.addEventListener('click', () => setPortrait(button.dataset.portrait)));
portraitSlider.hidden = false;
document.querySelector('.portrait-presets').hidden = false;
setPortrait(50);

const editorTabs = [...document.querySelectorAll('[data-editor]')];
const editorPanels = [...document.querySelectorAll('.editor-panel')];
const editorFilenames = { sobre: 'sobre.md', estudos: 'estudos.json', projetos: 'projetos.js' };
const editorLanguages = { sobre: 'Markdown', estudos: 'JSON', projetos: 'JavaScript' };
const openEditorFiles = new Set(editorTabs.map(tab => tab.dataset.editor));
let selectedEditor = null;
let lastClosedFilename = null;
function renderEditorAnnouncement() {
  document.querySelector('#editor-announcement').textContent = lastClosedFilename ? t('{file} fechado.', { file: lastClosedFilename }) + (selectedEditor ? '' : ' ' + t('Nenhum arquivo aberto.')) : '';
}
function renderEditorState() {
  editorTabs.forEach(tab => {
    const open = openEditorFiles.has(tab.dataset.editor);
    const selected = open && tab === selectedEditor;
    tab.hidden = !open;
    tab.closest('[data-editor-shell]').hidden = !open;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
    document.querySelector(`[data-close-file="${tab.dataset.editor}"]`).setAttribute('tabindex', selected ? '0' : '-1');
    tab.closest('[data-editor-shell]').classList.toggle('is-selected', selected);
  });
  editorPanels.forEach(panel => {
    panel.hidden = !selectedEditor || panel.id !== `panel-${selectedEditor.dataset.editor}`;
    panel.setAttribute('role', 'tabpanel');
  });
  document.querySelector('#editor-empty').hidden = Boolean(selectedEditor);
  document.querySelector('#editor-breadcrumb').textContent = selectedEditor ? `samir-portfolio / ${editorFilenames[selectedEditor.dataset.editor]}` : `samir-portfolio / ${t('Workspace')}`;
  document.querySelector('#editor-language').textContent = selectedEditor ? editorLanguages[selectedEditor.dataset.editor] : t('Workspace');
  renderEditorAnnouncement();
  document.querySelectorAll('[data-open-file]').forEach(shortcut => {
    if (selectedEditor && shortcut.dataset.openFile === selectedEditor.dataset.editor) shortcut.setAttribute('aria-current', 'true');
    else shortcut.removeAttribute('aria-current');
  });
}
function selectEditor(tab, focus = false) {
  if (!tab) return;
  lastClosedFilename = null;
  openEditorFiles.add(tab.dataset.editor);
  selectedEditor = tab;
  renderEditorState();
  if (focus) tab.focus();
}
function closeEditor(tab) {
  if (!openEditorFiles.has(tab.dataset.editor)) return;
  const before = editorTabs.filter(item => openEditorFiles.has(item.dataset.editor));
  const index = before.indexOf(tab);
  openEditorFiles.delete(tab.dataset.editor);
  const remaining = editorTabs.filter(item => openEditorFiles.has(item.dataset.editor));
  if (selectedEditor === tab) selectedEditor = remaining[index] || remaining[index - 1] || null;
  lastClosedFilename = editorFilenames[tab.dataset.editor];
  renderEditorState();
  if (selectedEditor) selectedEditor.focus();
  else document.querySelector('#editor-empty').querySelector('[data-open-file]').focus();
}
editorTabs.forEach(tab => {
  tab.addEventListener('click', () => selectEditor(tab));
  tab.addEventListener('keydown', event => {
    const open = editorTabs.filter(item => openEditorFiles.has(item.dataset.editor));
    const index = open.indexOf(tab);
    let next;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (index + 1) % open.length;
    if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') next = (index - 1 + open.length) % open.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = open.length - 1;
    if (event.key === 'Delete') { event.preventDefault(); closeEditor(tab); return; }
    if (next !== undefined) { event.preventDefault(); selectEditor(open[next], true); }
  });
  document.querySelector(`[data-close-file="${tab.dataset.editor}"]`).addEventListener('click', () => closeEditor(tab));
});
selectEditor(editorTabs.find(tab => `#panel-${tab.dataset.editor}` === location.hash) || editorTabs[0]);
document.querySelector('.editor-tablist').hidden = false;
document.querySelector('.editor-tabbar').hidden = false;
document.querySelector('.editor-tablist').setAttribute('aria-orientation', 'horizontal');

const cards = [...document.querySelectorAll('.project-card')];
const filterButtons = [...document.querySelectorAll('[data-filter]')];
function setFilter(filter) {
  filterButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === filter)));
  let visible = 0;
  cards.forEach(card => {
    card.hidden = filter !== 'all' && card.dataset.category !== filter;
    if (!card.hidden) visible++;
  });
  document.querySelector('.project-grid').classList.toggle('is-filtered', filter !== 'all');
  document.querySelector('#filter-status').textContent = t('{count} projetos exibidos.', { count: visible });
}
filterButtons.forEach(button => button.addEventListener('click', () => setFilter(button.dataset.filter)));
// A direct link to a project remains useful even if the visitor just filtered it out.
function revealLinkedProject(hash = location.hash) {
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.slice(1))); } catch { return; }
  if (target?.classList.contains('project-card') && target.hidden) {
    setFilter('all');
    return target;
  }
}
addEventListener('hashchange', () => {
  revealLinkedProject()?.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
});
document.addEventListener('click', event => {
  const anchor = event.target.closest('a[href^="#"]');
  if (!anchor) return;
  const hash = anchor.getAttribute('href');
  const revealed = revealLinkedProject(hash);
  // Browsers do not dispatch hashchange when the destination is already current.
  if (revealed && hash === location.hash) revealed.scrollIntoView({ behavior: reducedMotion() ? 'instant' : 'smooth', block: 'start' });
});

const previews = {
  drew: { title: 'Drew Studio', src: 'assets/projects/drew.png', alt: 'Captura real da página inicial do Drew Studio.', repo: 'https://github.com/SamirGedeon/Lading-Page' },
  estoque: { title: 'Controle de estoque', src: 'assets/projects/estoque.png', alt: 'Captura real do formulário, indicadores e tabela do painel de estoque.', repo: 'https://github.com/SamirGedeon/estoque-spring-api' },
  fruta: { title: 'Fruta — Vitrine de sabores', src: 'assets/projects/fruta.png', alt: 'Captura real da vitrine Fruta com sabor morango.', repo: 'https://github.com/SamirGedeon/Site-Refri' }
};
const dialog = document.querySelector('#project-dialog');
let previousFocus = null;
let activePreview = null;
function renderPreviewLanguage() {
  if (!activePreview) return;
  document.querySelector('#preview-title').textContent = t(activePreview.title);
  document.querySelector('#preview-image').alt = t(activePreview.alt);
}
if (typeof dialog.showModal === 'function') {
  document.querySelectorAll('[data-preview]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      const preview = previews[button.dataset.preview];
      previousFocus = button;
      activePreview = preview;
      document.querySelector('#preview-title').textContent = t(preview.title);
      const image = document.querySelector('#preview-image');
      image.src = preview.src;
      image.alt = t(preview.alt);
      document.querySelector('#preview-repo').href = preview.repo;
      dialog.showModal();
      document.body.classList.add('dialog-open');
      document.querySelector('#close-preview').focus();
    });
  });
  document.querySelector('#close-preview').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('dialog-open');
    previousFocus?.focus();
  });
}

// A high-resolution GPU fluid, awakened by pointer input and suspended outside the section.
function setupInkTrail() {
  const canvas = document.querySelector('#ink-canvas');
  const section = document.querySelector('#contato');
  const hint = document.querySelector('.ink-hint');
  const factory = window.SamirFluid?.create;
  if (!canvas || !section || typeof factory !== 'function') {
    if (canvas) canvas.hidden = true;
    if (hint) hint.hidden = true;
    return () => {};
  }
  let engine = null, failed = false, lost = false, visible = true;
  let frame = 0, lastFrame = 0, lastInput = -Infinity, lastPoint = null, pending = null;
  let color = null, colorTime = -Infinity, mask = [];
  const lifetime = 7000, fadeStart = 5000;
  const allowed = () => motionAllowed() && visible && !failed && !lost;
  function stop(release = false) {
    cancelAnimationFrame(frame); frame = 0; lastFrame = 0; lastPoint = null; pending = null; canvas.hidden = true;
    if (engine) {
      try { engine.clear(); } catch { /* A lost context needs no clearing. */ }
      if (release) { try { engine.destroy(); } catch { /* Context cleanup is optional. */ } engine = null; }
    }
  }
  function fail() { failed = true; stop(true); canvas.hidden = true; if (hint) hint.hidden = true; }
  function rebuildMask(bounds = section.getBoundingClientRect()) {
    mask = [...section.querySelectorAll('h2, .contact-eyebrow, .section-kicker, .contact-bottom p, .contact-bottom a, .ink-hint, .contact-arrow')].map(target => {
      const box = target.getBoundingClientRect();
      return { x: box.left - bounds.left - 7, y: box.top - bounds.top - 7, width: box.width + 14, height: box.height + 14 };
    }).filter(box => box.width > 14 && box.height > 14).slice(0,12);
  }
  function resize() {
    if (!engine) return;
    const bounds = section.getBoundingClientRect();
    engine.setSize(Math.max(1,bounds.width), Math.max(1,bounds.height), devicePixelRatio || 1);
    rebuildMask(bounds);
  }
  function initialize() {
    if (engine) return true;
    try {
      engine = factory(canvas, { onFailure: () => { failed = true; } });
      if (!engine) { fail(); return false; }
      resize(); return true;
    } catch { fail(); return false; }
  }
  function pigment(now) {
    if (!color || now - colorTime >= 100) {
      const hue = Math.random() * 6, index = Math.floor(hue), fraction = hue - index;
      color = [[1,fraction,0],[1-fraction,1,0],[0,1,fraction],[0,1-fraction,1],[fraction,0,1],[1,0,1-fraction]][index].map(channel => channel * .15);
      colorTime = now;
    }
    return color;
  }
  function render(now) {
    frame = 0;
    const quiet = now - lastInput;
    if (!allowed() || quiet >= lifetime || !engine) { stop(!allowed()); return; }
    try {
      if (pending) { engine.splat({ ...pending, color: pigment(now) }); pending = null; }
      const dt = lastFrame ? Math.max(0,(now-lastFrame) / 1000) : 1 / 60;
      lastFrame = now;
      engine.step(Math.min(dt,1 / 60));
      const opacity = quiet <= fadeStart ? 1 : Math.max(0,(lifetime-quiet) / (lifetime-fadeStart));
      engine.render({ opacity, mask });
    } catch { fail(); return; }
    frame = requestAnimationFrame(render);
  }
  function refresh() {
    const enabled = motionAllowed() && !failed && !lost;
    if (hint) hint.hidden = !enabled;
    if (!enabled) stop(true);
    else if (engine) rebuildMask();
  }
  section.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || !allowed()) return;
    const bounds = section.getBoundingClientRect();
    const x = Math.max(0,Math.min(bounds.width,event.clientX-bounds.left));
    const y = Math.max(0,Math.min(bounds.height,event.clientY-bounds.top));
    if (lastPoint && Math.hypot(x-lastPoint.x,y-lastPoint.y) < .05) return;
    if (!initialize()) return;
    const now = performance.now();
    const continuous = lastPoint && now-lastInput < 160;
    const dx = continuous ? x-lastPoint.x : 0, dy = continuous ? y-lastPoint.y : 0;
    pending = { x, y, dx: (pending?.dx || 0)+dx, dy: (pending?.dy || 0)+dy };
    lastPoint = {x,y}; lastInput = now; canvas.hidden = false;
    if (!frame) frame = requestAnimationFrame(render);
  }, { passive: true });
  section.addEventListener('pointerleave', () => { lastPoint = null; });
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) stop(true);
  }, { threshold: 0 }) : null;
  observer?.observe(section);
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; stop(true); refresh(); });
  canvas.addEventListener('webglcontextrestored', () => { lost = false; failed = false; refresh(); });
  addEventListener('resize', () => { if (!allowed()) return; try { stop(); resize(); } catch { fail(); } }, {passive:true});
  document.fonts?.ready.then(() => { if (engine) rebuildMask(); });
  refresh();
  return refresh;
}

motionListeners.push(setupInkTrail());
document.querySelector('.project-filters').hidden = false;
motionButton.hidden = false;

/** Dependency-free, event-driven spatial desk. Call once after the HTML exists. */
function setupTechScene({ motionAllowed = () => true } = {}) {
  const section = document.querySelector('#tecnologias');
  if (!section) return { refresh() {}, destroy() {} };
  const stage = section.querySelector('.tech-stage');
  const orbit = section.querySelector('.tech-orbit');
  const buttons = [...section.querySelectorAll('[data-tech]')];
  const coreLabel = section.querySelector('#tech-core-label');
  const connection = section.querySelector('#tech-link-path');
  const connectionFlow = section.querySelector('#tech-link-flow');
  const detail = section.querySelector('#tech-detail');
  const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const smallScreen = matchMedia('(max-width: 767px)');
  const constrained = Boolean(navigator.connection?.saveData || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2));
  const records = {
    java: { index: '01 / LINGUAGEM', title: 'Java', copy: 'Estudo Java para desenvolver APIs e organizar a lógica das aplicações. O Controle de estoque utiliza Java 17 com Spring Boot.', link: '#projeto-estoque' },
    spring: { index: '02 / BACK-END', title: 'Spring Boot', copy: 'No Controle de estoque, Spring Boot conecta a API de produtos ao painel web, com busca, validações e acesso aos dados via JDBC.', link: '#projeto-estoque' },
    python: { index: '03 / LINGUAGEM', title: 'Python', copy: 'Uso Python no Catálogo de jogos: uma API com listagem em JSON e filtro dos jogos que estão em andamento.', link: '#projeto-jogos' },
    django: { index: '04 / ESTUDOS', title: 'Django REST', copy: 'Estudo APIs no ecossistema Django. No Catálogo de jogos, a listagem atual usa Django com JsonResponse e o gerenciamento acontece pelo Django Admin.', link: '#projeto-jogos' },
    dados: { index: '05 / DADOS', title: 'SQL / MySQL', copy: 'Estudo SQL e MySQL para organizar e consultar dados. No Controle de estoque, a persistência confirmada usa SQL com JDBC e banco H2.', link: '#projeto-estoque' },
    html: { index: '06 / ESTRUTURA', title: 'HTML', copy: 'A estrutura das páginas é parte do que desenvolvo nos projetos web. No Drew Studio, ela organiza a apresentação, os serviços e o formulário de briefing.', link: '#projeto-drew' },
    css: { index: '07 / INTERFACE', title: 'CSS', copy: 'Exploro composição, responsividade e apresentação visual. A vitrine Fruta combina cores, imagens e transições entre três sabores.', link: '#projeto-fruta' },
    javascript: { index: '08 / INTERAÇÃO', title: 'JavaScript', copy: 'Uso JavaScript para dar função à interface: o carrossel da Fruta responde aos indicadores e ao teclado, e o Drew Studio gera um briefing para download.', link: '#projeto-fruta' }
  };
  // Positions are the actual card centers in the 560×400 local orbit plane.
  const positions = { java: [-182,-94], spring: [-44,-130], python: [111,-108], django: [205,34], dados: [114,158], html: [-28,151], css: [-182,140], javascript: [-235,14] };
  let visible = false, frame = 0, pointerX = 0, pointerY = 0, detailAnimation = null;
  const canAnimate = () => !systemMotion.matches && !smallScreen.matches && !constrained && document.documentElement.dataset.motion !== 'reduced' && motionAllowed() && !document.hidden;
  function connect(key) {
    const [x,y] = positions[key];
    const length = Math.hypot(x,y-4);
    const sx = x / length * 62, sy = 4 + (y-4) / length * 62;
    const bendX = (sx+x) * .5 - (y-4) * .1;
    const bendY = (sy+y) * .5 + x * .1;
    const path = `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${bendX.toFixed(1)} ${bendY.toFixed(1)} ${x} ${y}`;
    connection.setAttribute('d', path);
    connectionFlow.setAttribute('d', path);
  }
  const clickHandlers = new Map();
  buttons.forEach((button,index) => {
    button.style.setProperty('--tech-phase', `${-index * .8}s`);
    const handler = () => {
      const item = records[button.dataset.tech];
      if (!item) return;
      const changed = section.dataset.activeTech !== button.dataset.tech;
      for (const other of buttons) other.setAttribute('aria-pressed', String(other === button));
      section.dataset.activeTech = button.dataset.tech;
      coreLabel.textContent = t(item.title);
      connect(button.dataset.tech);
      section.querySelector('#tech-detail-index').textContent = t(item.index);
      section.querySelector('#tech-detail-title').textContent = t(item.title);
      section.querySelector('#tech-detail-copy').textContent = t(item.copy);
      const link = section.querySelector('#tech-detail-link');
      link.href = item.link;
      link.setAttribute('aria-label', t('Explorar projeto relacionado a {title}', { title: item.title }));
      detailAnimation?.cancel();
      if (changed && visible && canAnimate() && typeof detail.animate === 'function') {
        detailAnimation = detail.animate([{opacity:.5,transform:'translateY(8px)'},{opacity:1,transform:'translateY(0)'}],{duration:300,easing:'cubic-bezier(.2,.7,.2,1)'});
      }
    };
    clickHandlers.set(button, handler);
    button.addEventListener('click', handler);
  });
  function render() {
    frame = 0;
    if (!visible || !canAnimate()) return;
    const rect = section.getBoundingClientRect();
    const progress = Math.max(0, Math.min(1, (innerHeight * .85 - rect.top) / (innerHeight + rect.height)));
    orbit.style.setProperty('--tech-rx', `${-19 + progress * 32 - pointerY * 3}deg`);
    orbit.style.setProperty('--tech-ry', `${-18 + progress * 35 + pointerX * 4}deg`);
    orbit.style.setProperty('--tech-rz', `${-3 + progress * 5}deg`);
  }
  function requestRender() {
    if (visible && canAnimate() && !frame) frame = requestAnimationFrame(render);
  }
  function refresh() {
    cancelAnimationFrame(frame); frame = 0;
    const enabled = canAnimate();
    section.classList.toggle('tech-static', !enabled);
    section.classList.toggle('is-tech-active', enabled && visible);
    if (!enabled) {
      pointerX = pointerY = 0;
      detailAnimation?.cancel();
      orbit.style.removeProperty('--tech-rx');
      orbit.style.removeProperty('--tech-ry');
      orbit.style.removeProperty('--tech-rz');
    } else requestRender();
  }
  function onPointer(event) {
    if (!visible || !canAnimate() || event.pointerType !== 'mouse' || event.buttons) return;
    const bounds = stage.getBoundingClientRect();
    pointerX = Math.max(-1,Math.min(1,(event.clientX-bounds.left) / bounds.width * 2 - 1));
    pointerY = Math.max(-1,Math.min(1,(event.clientY-bounds.top) / bounds.height * 2 - 1));
    requestRender();
  }
  function leavePointer() { pointerX = pointerY = 0; requestRender(); }
  stage.addEventListener('pointermove', onPointer, {passive:true});
  stage.addEventListener('pointerleave', leavePointer);
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    section.classList.toggle('is-tech-active', visible && canAnimate());
    if (visible) requestRender();
    else { cancelAnimationFrame(frame); frame = 0; pointerX = pointerY = 0; detailAnimation?.cancel(); }
  }, { threshold: .01 }) : null;
  if (observer) observer.observe(stage);
  else visible = true;
  const attributeObserver = typeof MutationObserver === 'function' ? new MutationObserver(refresh) : null;
  attributeObserver?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  addEventListener('scroll', requestRender, { passive: true });
  addEventListener('resize', refresh, { passive: true });
  document.addEventListener('visibilitychange', refresh);
  systemMotion.addEventListener('change', refresh);
  smallScreen.addEventListener('change', refresh);
  const initial = buttons.find(button => button.getAttribute('aria-pressed') === 'true') || buttons[0];
  if (initial) clickHandlers.get(initial)();
  refresh();
  return {
    refresh,
    localize() {
      const selected = buttons.find(button => button.dataset.tech === section.dataset.activeTech) || initial;
      if (selected) clickHandlers.get(selected)();
    },
    destroy() {
      cancelAnimationFrame(frame); detailAnimation?.cancel();
      section.classList.remove('is-tech-active');
      observer?.disconnect(); attributeObserver?.disconnect();
      removeEventListener('scroll', requestRender); removeEventListener('resize', refresh);
      document.removeEventListener('visibilitychange', refresh);
      systemMotion.removeEventListener('change', refresh); smallScreen.removeEventListener('change', refresh);
      stage.removeEventListener('pointermove', onPointer); stage.removeEventListener('pointerleave', leavePointer);
      for (const [button, handler] of clickHandlers) button.removeEventListener('click', handler);
    }
  };
}

const techScene = setupTechScene({ motionAllowed });
motionListeners.push(techScene.refresh);

/** Call after the existing editor tab setup. The top tabs stay the only ARIA tabs. */
function setupEditorWorkspace() {
  document.querySelectorAll('[data-open-file]').forEach(shortcut => shortcut.addEventListener('click', event => {
    const tab = editorTabs.find(item => item.dataset.editor === shortcut.dataset.openFile);
    if (!tab) return;
    event.preventDefault();
    selectEditor(tab, true);
    shortcut.closest('details')?.removeAttribute('open');
  }));
  // Escape dismisses the compact file picker and returns focus to its trigger.
  const picker = document.querySelector('.editor-files-menu');
  picker.addEventListener('keydown', event => {
    if (event.key === 'Escape' && picker.hasAttribute('open')) {
      event.preventDefault(); picker.removeAttribute('open'); picker.querySelector('summary').focus();
    }
  });
}

setupEditorWorkspace();


// Theme choices persist; an untouched preference follows the operating system.
const colorScheme = matchMedia('(prefers-color-scheme: dark)');
const themeButton = document.querySelector('#theme-toggle');
const themeLabel = document.querySelector('#theme-label');
let themePreference = null;
try { const stored = localStorage.getItem('samir-theme'); if (stored === 'light' || stored === 'dark') themePreference = stored; } catch { /* Storage is optional. */ }
function applyTheme() {
  const theme = themePreference || (colorScheme.matches ? 'dark' : 'light');
  root.dataset.theme = theme;
  const action = t(theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
  themeLabel.textContent = t(theme === 'dark' ? 'Claro' : 'Escuro');
  themeButton.setAttribute('aria-label', action);
  themeButton.setAttribute('title', action);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0d0b12' : '#faf7f3');
}
themeButton.addEventListener('click', () => {
  themePreference = root.dataset.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('samir-theme', themePreference); } catch { /* Keep the session choice. */ }
  applyTheme();
});
colorScheme.addEventListener('change', () => { if (!themePreference) applyTheme(); });
applyTheme(); themeButton.hidden = false;

// Scroll reveals are finite and keep the native page scroll and all content available.
function setupScrollReveals() {
  if (typeof IntersectionObserver !== 'function') return () => {};
  const items = [...document.querySelectorAll('.section-heading, .project-card, .about-copy, .tech-heading, .editor-v3, .contact-main, .contact-bottom')];
  const seen = new WeakSet();
  let observer;
  items.forEach(item => {
    item.classList.add('scroll-reveal');
    if (item.classList.contains('project-card')) item.style.setProperty('--reveal-delay', `${cards.indexOf(item) % 2 * 90}ms`);
  });
  function reveal(item) { item.classList.remove('reveal-pending'); seen.add(item); }
  function refresh() {
    observer?.disconnect();
    if (!motionAllowed()) { items.forEach(item => item.classList.remove('reveal-pending')); return; }
    observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { reveal(entry.target); observer.unobserve(entry.target); }
    }), { rootMargin: '0px 0px 24px 0px', threshold: .02 });
    items.forEach(item => {
      if (seen.has(item) || item.getBoundingClientRect().top < innerHeight) reveal(item);
      else { item.classList.add('reveal-pending'); observer.observe(item); }
    });
  }
  refresh(); return refresh;
}
motionListeners.push(setupScrollReveals());

// Update text in place. Filters, selected technologies, dialogs and open files keep their state.
localization?.subscribe(() => {
  updateMotion();
  applyPortrait(portraitAmount);
  renderEditorState();
  const activeFilter = filterButtons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';
  setFilter(activeFilter);
  renderPreviewLanguage();
  techScene.localize();
  applyTheme();
});
