(() => {
  'use strict';

  const pathways = [
    {id:'learners-alumni',title:'Learners and alumni',icon:'fa-user-graduate',category:'learning talent',audience:'learner',tags:['Learning','Alumni','Career'],description:'Connect around study support, peer practice, portfolio development, certification preparation and career progression.',search:'learners alumni peers study groups career opportunities portfolio mentoring'},
    {id:'mentors-study-groups',title:'Mentors and study groups',icon:'fa-people-group',category:'learning',audience:'learner',tags:['Mentoring','Study groups','Certification'],description:'Find structured support for learning plans, technical practice, certification goals and accountability checkpoints.',search:'mentors study groups coaching exam preparation accountability peer support'},
    {id:'instructors-facilitators',title:'Instructors and facilitators',icon:'fa-chalkboard-user',category:'delivery',audience:'instructor',tags:['Instructor','Facilitation','Delivery'],description:'Join delivery teams, respond to teaching requirements and collaborate on practical, instructor-led learning.',search:'instructors facilitators teaching delivery classes workshops availability course delivery',href:'https://portal.skunkworksacademy.com/',hrefLabel:'Portal'},
    {id:'subject-matter-experts',title:'Subject-matter experts and reviewers',icon:'fa-microscope',category:'delivery project',audience:'instructor',tags:['SME','Review','Quality'],description:'Source technical review, assessment validation, lab verification and courseware quality assurance.',search:'subject matter experts reviewers courseware assessment quality assurance technical review'},
    {id:'employers-talent',title:'Employers and talent teams',icon:'fa-building',category:'talent',audience:'employer',tags:['Hiring','Cohorts','Workforce'],description:'Request role-aligned training, assessed talent, graduate pipelines and workforce capability development.',search:'employers talent teams recruitment hiring assessed candidates cohorts workforce skills',href:'https://jobs.skunkworksacademy.com/',hrefLabel:'Jobs'},
    {id:'placements-projects',title:'Placements and applied projects',icon:'fa-briefcase',category:'talent project',audience:'learner',tags:['Placement','Capstone','Portfolio'],description:'Route learners into internships, capstones, supervised project work and portfolio-building opportunities.',search:'internships placements capstones work experience projects graduate experience portfolio'},
    {id:'technology-partners',title:'Technology and certification partners',icon:'fa-handshake',category:'partner delivery',audience:'partner',tags:['Vendors','Certification','Enablement'],description:'Coordinate certification programmes, instructor enablement, labs, campaigns and customer training delivery.',search:'technology partners vendors certification programmes enablement labs campaigns customer training ibm microsoft cisco red hat'},
    {id:'delivery-partners',title:'Training and delivery partners',icon:'fa-network-wired',category:'partner delivery regional',audience:'partner',tags:['Delivery','Regional','Cohorts'],description:'Build scalable delivery capacity through verified instructors, training venues, labs and regional implementation support.',search:'delivery partners training providers subcontractors regional instructors classrooms onsite remote cohorts'},
    {id:'labs-capstone-teams',title:'Labs and capstone teams',icon:'fa-flask-vial',category:'project learning',audience:'learner',tags:['Labs','Projects','Evidence'],description:'Form teams around guided environments, technical challenges, demos and evidence-based assessments.',search:'labs project teams sandboxes practical capstones demos technical exercises proof competence',href:'https://labs.skunkworksacademy.com/',hrefLabel:'Labs'},
    {id:'courseware-publishing',title:'Courseware and publishing collaborators',icon:'fa-pen-ruler',category:'project delivery',audience:'instructor',tags:['Courseware','Publishing','Assessment'],description:'Connect authors, instructional designers, lab developers, reviewers and publishing operations.',search:'courseware publishing authors instructional design labs assessments documentation reviewers content',href:'https://publish.skunkworksacademy.com/',hrefLabel:'Publish'},
    {id:'regional-communities',title:'Regional communities',icon:'fa-earth-africa',category:'regional partner',audience:'partner',tags:['Regional','SADC','International'],description:'Route collaboration across South Africa, Cameroon, Botswana, Rwanda, Portugal and Mexico, subject to local capacity and consent.',search:'regional communities south africa cameroon botswana rwanda portugal mexico sadc international markets'},
    {id:'enterprise-public-programmes',title:'Enterprise, education and public programmes',icon:'fa-landmark',category:'partner regional talent',audience:'employer',tags:['Enterprise','Education','Public sector'],description:'Connect programme owners with training architecture, instructors, labs, talent pipelines and implementation support.',search:'enterprise government education public sector programmes workforce academies tenders cohorts implementation'}
  ];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const normalise = (value) => String(value || '').trim().toLowerCase();
  const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));

  const header = $('[data-nav]');
  const menuToggle = $('[data-nav-toggle]');
  function setMenu(open) {
    if (!header || !menuToggle) return;
    header.setAttribute('data-open', String(open));
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.setAttribute('aria-label', open ? 'Close navigation' : 'Toggle navigation');
  }
  menuToggle?.addEventListener('click', () => setMenu(header?.getAttribute('data-open') !== 'true'));
  $('#academy-nav')?.addEventListener('click', (event) => { if (event.target instanceof Element && event.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && header?.getAttribute('data-open') === 'true') { setMenu(false); menuToggle?.focus(); } });
  window.addEventListener('resize', () => { if (window.innerWidth > 980) setMenu(false); });

  const grid = $('#connectionGrid');
  function cardMarkup(item) {
    const external = item.href ? `<a class="card-link" href="${escapeHtml(item.href)}"><i class="fa-solid fa-arrow-up-right-from-square"></i>${escapeHtml(item.hrefLabel)}</a>` : '';
    return `<article class="card" data-connection-card data-id="${escapeHtml(item.id)}" data-category="${escapeHtml(item.category)}" data-search="${escapeHtml(item.search)}">
      <div class="card-top"><span class="card-icon"><i class="fa-solid ${escapeHtml(item.icon)}"></i></span><button class="save-button" type="button" data-save-path="${escapeHtml(item.id)}" aria-pressed="false"><i class="fa-regular fa-bookmark"></i> Save</button></div>
      <h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description)}</p>
      <div class="tag-row">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="card-actions"><button class="plan-link" type="button" data-plan-path="${escapeHtml(item.title)}" data-plan-audience="${escapeHtml(item.audience)}"><i class="fa-solid fa-route"></i>Plan this connection</button>${external}</div>
    </article>`;
  }
  if (grid) grid.innerHTML = pathways.map(cardMarkup).join('');

  const cards = $$('[data-connection-card]');
  const search = $('#connectionSearch');
  const filters = $$('[data-filter]');
  const resultStatus = $('#resultStatus');
  const emptyState = $('#emptyState');
  let activeFilter = 'all';
  function updateResults() {
    const query = normalise(search?.value);
    let visible = 0;
    cards.forEach((card) => {
      const categories = normalise(card.getAttribute('data-category')).split(/\s+/);
      const haystack = normalise(`${card.textContent} ${card.getAttribute('data-search') || ''}`);
      const matchesFilter = activeFilter === 'all' || categories.includes(activeFilter);
      const matchesQuery = !query || query.split(/\s+/).every((term) => haystack.includes(term));
      card.hidden = !(matchesFilter && matchesQuery);
      if (!card.hidden) visible += 1;
    });
    if (resultStatus) resultStatus.textContent = `${visible} ${visible === 1 ? 'pathway' : 'pathways'} shown`;
    if (emptyState) emptyState.hidden = visible !== 0;
  }
  search?.addEventListener('input', updateResults);
  filters.forEach((button) => button.addEventListener('click', () => {
    activeFilter = button.getAttribute('data-filter') || 'all';
    filters.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    updateResults();
  }));

  const storageKey = 'swa.connections.saved.v1';
  const preferenceKey = 'swa.connections.preferences.v1';
  const savedConnections = $('#savedConnections');
  const savedEmpty = $('#savedEmpty');
  const savedCount = $('#savedCount');
  function readSaved() {
    try { const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]'); return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : []; }
    catch { return []; }
  }
  function writeSaved(ids) { try { localStorage.setItem(storageKey, JSON.stringify(ids)); } catch {} }
  function renderSaved() {
    const ids = readSaved();
    if (savedCount) savedCount.textContent = String(ids.length);
    $$('[data-save-path]').forEach((button) => {
      const saved = ids.includes(button.getAttribute('data-save-path'));
      button.setAttribute('aria-pressed', String(saved));
      button.dataset.saved = String(saved);
      button.innerHTML = saved ? '<i class="fa-solid fa-bookmark"></i> Saved' : '<i class="fa-regular fa-bookmark"></i> Save';
    });
    if (!savedConnections || !savedEmpty) return;
    savedConnections.replaceChildren();
    savedEmpty.hidden = ids.length > 0;
    ids.map((id) => pathways.find((item) => item.id === id)).filter(Boolean).forEach((item) => {
      const row = document.createElement('div');
      row.className = 'saved-item';
      row.innerHTML = `<div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></div>`;
      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'small-button'; remove.textContent = 'Remove';
      remove.addEventListener('click', () => { writeSaved(readSaved().filter((savedId) => savedId !== item.id)); renderSaved(); });
      row.append(remove); savedConnections.append(row);
    });
  }
  $$('[data-save-path]').forEach((button) => button.addEventListener('click', () => {
    const id = button.getAttribute('data-save-path'); if (!id) return;
    const saved = readSaved(); writeSaved(saved.includes(id) ? saved.filter((item) => item !== id) : [...saved, id]); renderSaved();
  }));
  $('#clearSaved')?.addEventListener('click', () => { writeSaved([]); renderSaved(); });

  const planner = $('#connectionPlanner');
  const audience = $('#plannerAudience');
  const outcome = $('#plannerOutcome');
  const region = $('#plannerRegion');
  const engagement = $('#plannerEngagement');
  const path = $('#plannerPath');
  const summary = $('#plannerSummary');
  const output = $('#plannerOutput');
  const briefNode = $('#plannerBrief');
  const copyButton = $('#copyBrief');
  const emailButton = $('#emailBrief');
  function savePreferences() {
    try { localStorage.setItem(preferenceKey, JSON.stringify({audience:audience?.value || '',outcome:outcome?.value || '',region:region?.value || '',engagement:engagement?.value || '',path:path?.value || ''})); } catch {}
  }
  function restorePreferences() {
    try {
      const value = JSON.parse(localStorage.getItem(preferenceKey) || '{}');
      [[audience,value.audience],[outcome,value.outcome],[region,value.region],[engagement,value.engagement],[path,value.path]].forEach(([field,next]) => { if (field && next) field.value = next; });
    } catch {}
  }
  function nextStep(value) {
    return ({learning:'Confirm the learning goal, current level, timeline and preferred support format.',delivery:'Provide the topic, dates, modality, delegate count, location and instructor requirements.',talent:'Provide the role profile, competencies, work arrangement, location and selection process.',partnership:'Define the partner objective, commercial model, target market and decision owners.',project:'Define scope, deliverables, environment, roles, evidence requirements and deadlines.'})[value] || 'Confirm scope, participants, timing, evidence and the first actionable next step.';
  }
  function buildBrief() {
    return ['SKUNKWORKS ACADEMY CONNECTION BRIEF','',`Requester role: ${audience?.selectedOptions?.[0]?.textContent || ''}`,`Connection pathway: ${path?.value || 'To be matched by the Academy'}`,`Primary outcome: ${outcome?.selectedOptions?.[0]?.textContent || ''}`,`Region: ${region?.value || ''}`,`Preferred engagement: ${engagement?.value || ''}`,'','Requirement and intended result:',summary?.value.trim() || '','',`Recommended next step: ${nextStep(outcome?.value || '')}`,'','Consent: Permission-based introduction requested. Share only information required to evaluate this connection.'].join('\n');
  }
  $$('[data-plan-path]').forEach((button) => button.addEventListener('click', () => {
    if (path) path.value = button.getAttribute('data-plan-path') || '';
    const role = button.getAttribute('data-plan-audience');
    if (audience && role && Array.from(audience.options).some((option) => option.value === role)) audience.value = role;
    savePreferences(); $('#planner')?.scrollIntoView({behavior:'smooth',block:'start'}); setTimeout(() => outcome?.focus(), 400);
  }));
  planner?.addEventListener('change', savePreferences);
  planner?.addEventListener('reset', () => setTimeout(() => { try { localStorage.removeItem(preferenceKey); } catch {} if (output) output.hidden = true; }, 0));
  planner?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!(planner instanceof HTMLFormElement) || !planner.reportValidity()) return;
    const brief = buildBrief();
    if (briefNode) briefNode.textContent = brief;
    if (output) output.hidden = false;
    if (emailButton) emailButton.href = `mailto:training@skunkworks.africa?subject=${encodeURIComponent('Skunkworks Academy Connection Request')}&body=${encodeURIComponent(brief)}`;
    savePreferences(); output?.scrollIntoView({behavior:'smooth',block:'nearest'});
  });
  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    const area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.append(area); area.select(); document.execCommand('copy'); area.remove();
  }
  copyButton?.addEventListener('click', async () => {
    const text = briefNode?.textContent || ''; if (!text) return;
    try { await copyText(text); copyButton.innerHTML = '<i class="fa-solid fa-check"></i> Copied'; setTimeout(() => { copyButton.innerHTML = '<i class="fa-solid fa-copy"></i> Copy brief'; }, 1600); }
    catch { copyButton.textContent = 'Copy failed'; }
  });

  $('[data-year]')?.replaceChildren(String(new Date().getFullYear()));
  restorePreferences();
  renderSaved();
  updateResults();
})();
