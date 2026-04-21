import { useThemeContext } from '@/components/theme-provider';

/**
 * Backwards-compatible adapter around the new <ThemeProvider>. Existing
 * components that just need `isDark` / `toggleTheme` keep working without a
 * rewrite, while new components can call useThemeContext() directly for
 * three-state (light / dark / system) control.
 */
export function useTheme() {
  const { resolvedTheme, setTheme } = useThemeContext();
  const isDark = resolvedTheme === 'dark';
  const toggleTheme = () => setTheme(isDark ? 'light' : 'dark');
  return { isDark, toggleTheme };
}

