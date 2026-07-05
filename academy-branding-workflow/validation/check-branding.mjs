import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const requiredFiles = [
  'index.html',
  'package.json',
  'README.md',
  'src/main.tsx',
  'src/App.tsx',
  'src/styles.css',
  'src/site-theme.css',
  'src/mobile-optimisation.css',
  'src/global-nav-compat.css',
  'academy-branding-workflow/README.md',
  'academy-branding-workflow/brand-tokens.json',
  'academy-branding-workflow/portal-theme-reference.css',
  'academy-branding-workflow/component-patterns.md',
  'academy-branding-workflow/implementation-workflow.md',
  'academy-branding-workflow/lovable-implementation-brief.md'
];

const requiredContent = [
  {
    file: 'index.html',
    text: '<html lang="en-ZA">',
    description: 'HTML language is aligned to South Africa locale'
  },
  {
    file: 'index.html',
    text: 'data-skunkworks-head="mandatory-v1"',
    description: 'mandatory Skunkworks head marker exists'
  },
  {
    file: 'index.html',
    text: '<meta name="skunkworks:org" content="skunkworks-academy" />',
    description: 'repository organization metadata exists'
  },
  {
    file: 'index.html',
    text: '<meta name="skunkworks:repo" content="portal" />',
    description: 'repository name metadata exists'
  },
  {
    file: 'index.html',
    text: '<link rel="canonical" href="https://portal.skunkworksacademy.com/" />',
    description: 'canonical portal URL exists'
  },
  {
    file: 'index.html',
    text: 'https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-black.png',
    description: 'black favicon reference exists'
  },
  {
    file: 'index.html',
    text: 'https://raw.githubusercontent.com/skunkworks-academy/.github/refs/heads/main/images/favicon-white.png',
    description: 'white favicon reference exists'
  },
  {
    file: 'src/main.tsx',
    text: 'import "./styles.css";',
    description: 'base styles import exists'
  },
  {
    file: 'src/main.tsx',
    text: 'import "./site-theme.css";',
    description: 'site theme override import exists'
  },
  {
    file: 'src/main.tsx',
    text: 'import "./mobile-optimisation.css";',
    description: 'mobile optimisation import exists'
  },
  {
    file: 'src/main.tsx',
    text: 'import "./global-nav-compat.css";',
    description: 'global navigation compatibility import exists'
  },
  {
    file: 'src/App.tsx',
    text: 'const globalNav = [',
    description: 'portal global navigation array exists'
  },
  {
    file: 'src/App.tsx',
    text: 'https://skunkworksacademy.com/self-paced/',
    description: 'self-paced navigation link exists'
  },
  {
    file: 'src/App.tsx',
    text: 'https://labs.skunkworksacademy.com/',
    description: 'labs navigation link exists'
  },
  {
    file: 'src/App.tsx',
    text: 'https://jobs.skunkworksacademy.com/',
    description: 'jobs navigation link exists'
  },
  {
    file: 'src/App.tsx',
    text: 'https://docs.skunkworksacademy.com/',
    description: 'docs navigation link exists'
  },
  {
    file: 'src/App.tsx',
    text: 'https://ibm.skunkworksacademy.com/',
    description: 'IBM navigation link exists'
  },
  {
    file: 'src/styles.css',
    text: '--teal:#0f766e',
    description: 'portal teal token exists'
  },
  {
    file: 'src/site-theme.css',
    text: '--academy-accent: #7c3aed;',
    description: 'Academy purple accent token exists'
  },
  {
    file: 'src/site-theme.css',
    text: '--academy-accent-2: #06b6d4;',
    description: 'Academy cyan accent token exists'
  },
  {
    file: 'src/mobile-optimisation.css',
    text: 'prefers-reduced-motion: reduce',
    description: 'reduced motion support exists'
  },
  {
    file: 'src/global-nav-compat.css',
    text: 'body.swa-has-global-nav .top[data-fallback-header="true"]',
    description: 'global nav fallback compatibility exists'
  }
];

const errors = [];

function read(file) {
  const fullPath = join(root, file);
  return readFileSync(fullPath, 'utf8');
}

for (const file of requiredFiles) {
  if (!existsSync(join(root, file))) {
    errors.push(`Missing required file: ${file}`);
  }
}

for (const check of requiredContent) {
  const fullPath = join(root, check.file);
  if (!existsSync(fullPath)) {
    errors.push(`Cannot check missing file: ${check.file}`);
    continue;
  }

  if (!read(check.file).includes(check.text)) {
    errors.push(`Missing expected content in ${check.file}: ${check.description}`);
  }
}

if (existsSync(join(root, 'src/main.tsx'))) {
  const main = read('src/main.tsx');
  const importOrder = [
    'import "./styles.css";',
    'import "./site-theme.css";',
    'import "./mobile-optimisation.css";',
    'import "./global-nav-compat.css";'
  ];
  const positions = importOrder.map((item) => main.indexOf(item));
  if (positions.some((position) => position === -1) || positions.some((position, index) => index > 0 && position < positions[index - 1])) {
    errors.push('src/main.tsx stylesheet import order has drifted from the approved brand chain.');
  }
}

if (errors.length) {
  console.error('Skunkworks Academy branding validation failed.');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Skunkworks Academy branding validation passed.');
console.log(`Validated ${requiredFiles.length} files and ${requiredContent.length} content checks.`);
