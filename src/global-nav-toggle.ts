const HEADER_SELECTOR = '.top[data-fallback-header="true"]';
const NAV_SELECTOR = 'nav.links[aria-label="Primary portal navigation"]';
const TOGGLE_CLASS = 'global-menu-toggle';
const OPEN_CLASS = 'global-menu-open';
const NAV_ID = 'primary-portal-navigation';

function closeMenu(header: HTMLElement, toggle: HTMLButtonElement) {
  header.classList.remove(OPEN_CLASS);
  document.body.classList.remove(OPEN_CLASS);
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', 'Open global navigation menu');
}

function openMenu(header: HTMLElement, toggle: HTMLButtonElement) {
  header.classList.add(OPEN_CLASS);
  document.body.classList.add(OPEN_CLASS);
  toggle.setAttribute('aria-expanded', 'true');
  toggle.setAttribute('aria-label', 'Close global navigation menu');
}

function ensureGlobalMenu(header: HTMLElement) {
  const shell = header.querySelector<HTMLElement>('.shell.nav, .nav');
  const brand = header.querySelector<HTMLElement>('.brand');
  const nav = header.querySelector<HTMLElement>(NAV_SELECTOR);

  if (!shell || !brand || !nav) return;

  nav.id = nav.id || NAV_ID;
  nav.setAttribute('data-global-menu', 'true');

  let toggle = header.querySelector<HTMLButtonElement>(`.${TOGGLE_CLASS}`);
  if (!toggle) {
    toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = TOGGLE_CLASS;
    toggle.setAttribute('aria-label', 'Open global navigation menu');
    toggle.setAttribute('aria-controls', nav.id);
    toggle.setAttribute('aria-expanded', 'false');
    toggle.innerHTML = '<span></span><span></span><span></span>';
    brand.insertAdjacentElement('afterend', toggle);
  }

  toggle.onclick = () => {
    const isOpen = header.classList.contains(OPEN_CLASS);
    if (isOpen) closeMenu(header, toggle);
    else openMenu(header, toggle);
  };

  nav.onclick = (event) => {
    const target = event.target instanceof Element ? event.target.closest('a,button') : null;
    if (target) closeMenu(header, toggle);
  };
}

function ensureAllGlobalMenus() {
  document.querySelectorAll<HTMLElement>(HEADER_SELECTOR).forEach(ensureGlobalMenu);
}

if (typeof window !== 'undefined') {
  ensureAllGlobalMenus();

  const observer = new MutationObserver(() => ensureAllGlobalMenus());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    document.querySelectorAll<HTMLElement>(`${HEADER_SELECTOR}.${OPEN_CLASS}`).forEach((header) => {
      const toggle = header.querySelector<HTMLButtonElement>(`.${TOGGLE_CLASS}`);
      if (toggle) closeMenu(header, toggle);
    });
  });

  document.addEventListener('click', (event) => {
    document.querySelectorAll<HTMLElement>(`${HEADER_SELECTOR}.${OPEN_CLASS}`).forEach((header) => {
      if (event.target instanceof Node && header.contains(event.target)) return;
      const toggle = header.querySelector<HTMLButtonElement>(`.${TOGGLE_CLASS}`);
      if (toggle) closeMenu(header, toggle);
    });
  });
}
