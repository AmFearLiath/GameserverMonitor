export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'gm.theme';

const isThemeMode = (value: string | null): value is ThemeMode => value === 'dark' || value === 'light';

export const getInitialTheme = (): ThemeMode => {
  const storedTheme = window.localStorage.getItem(STORAGE_KEY);
  if (isThemeMode(storedTheme)) {
    return storedTheme;
  }

  return 'dark';
};

export const applyTheme = (theme: ThemeMode): void => {
  document.documentElement.setAttribute('data-theme', theme);
};

export const persistTheme = (theme: ThemeMode): void => {
  window.localStorage.setItem(STORAGE_KEY, theme);
};
