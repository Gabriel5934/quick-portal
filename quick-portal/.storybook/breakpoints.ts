/** The four breakpoints every route story is rendered at. */
export const VIEWPORTS = {
  mobile: {
    name: 'Celular (375×812)',
    styles: { width: '375px', height: '812px' },
    type: 'mobile',
  },
  tabletPortrait: {
    name: 'Tablet retrato (768×1024)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet',
  },
  tabletLandscape: {
    name: 'Tablet paisagem (1024×768)',
    styles: { width: '1024px', height: '768px' },
    type: 'tablet',
  },
  desktop: {
    name: 'Desktop (1440×900)',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop',
  },
} as const;

export type Breakpoint = keyof typeof VIEWPORTS;

/** Story fields that pin a story to one of the breakpoints. */
export const atBreakpoint = (breakpoint: Breakpoint) => ({
  globals: { viewport: { value: breakpoint, isRotated: false } },
});
