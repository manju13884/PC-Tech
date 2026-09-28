// Shared with the release workflow: do not maintain a second environment map.
export const targets = Object.freeze({
  nonproduction: { project: 'pc-tech', branch: 'main', database: '0d749a66-9654-4767-b56a-afd4f8bcd9a1', origins: ['https://pc-tech.pages.dev'] },
  production: { project: 'pc-tech-production', branch: 'production', database: 'e863e5c3-b60f-48a5-8fdd-862f1ac52eaf', origins: ['https://pc-tech-production.pages.dev', 'https://polarcanvas.in', 'https://www.polarcanvas.in'] },
})
