import { useTranslation } from 'react-i18next';
import type { ThemeMode } from '../theme/index.js';
import { Toggle } from '../components/primitives/Toggle.js';

export type AppPage = 'dashboard' | 'incidents' | 'servers' | 'admin' | 'users' | 'profile' | 'detail';

type SidebarProps = {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  locale: string;
  onLocaleToggle: () => void;
};

type SidebarGroup = {
  labelKey: string;
  pages: AppPage[];
};

const menuGroups: SidebarGroup[] = [
  { labelKey: 'ui.sidebar.groups.monitoring', pages: ['dashboard', 'servers', 'incidents'] },
  { labelKey: 'ui.sidebar.groups.management', pages: ['admin', 'users'] },
  { labelKey: 'ui.sidebar.groups.account', pages: ['profile'] }
];

const iconByPage: Record<AppPage, JSX.Element> = {
  dashboard: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="5" rx="1.5" />
      <rect x="13" y="10" width="8" height="11" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
    </svg>
  ),
  incidents: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.3 3.8L2.5 17.2A2 2 0 004.2 20h15.6a2 2 0 001.7-2.8L13.7 3.8a2 2 0 00-3.4 0z" />
      <path d="M12 9.2v4.8" />
      <path d="M12 17h.01" />
    </svg>
  ),
  servers: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="18" height="6" rx="1.5" />
      <path d="M7 7h.01" />
      <path d="M7 17h.01" />
      <path d="M11 7h7" />
      <path d="M11 17h7" />
    </svg>
  ),
  admin: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
      <path d="M3 12h2" />
      <path d="M19 12h2" />
      <path d="M12 3v2" />
      <path d="M12 19v2" />
      <path d="M5.6 5.6l1.4 1.4" />
      <path d="M17 17l1.4 1.4" />
      <path d="M18.4 5.6L17 7" />
      <path d="M7 17l-1.4 1.4" />
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z" />
      <path d="M17 10a2.8 2.8 0 100-5.6 2.8 2.8 0 000 5.6z" />
      <path d="M3.5 20a5.5 5.5 0 0111 0" />
      <path d="M14.5 20a4.5 4.5 0 019 0" />
    </svg>
  ),
  profile: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4 4 0 100-8 4 4 0 000 8z" />
      <path d="M4 21a8 8 0 0116 0" />
      <path d="M18.5 4.5h3" />
      <path d="M20 3v3" />
    </svg>
  ),
  detail: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="4" width="18" height="6" />
      <rect x="3" y="14" width="18" height="6" />
    </svg>
  )
};

export const Sidebar = ({ activePage, onNavigate, isCollapsed, onToggleCollapse, theme, onThemeChange, locale, onLocaleToggle }: SidebarProps): JSX.Element => {
  const { t } = useTranslation();
  const isDark = theme === 'dark';

  return (
    <aside className={`sidebar ${isCollapsed ? 'is-collapsed' : ''}`.trim()}>
      <div className="sidebar-top">
        <button
          type="button"
          className="sidebar-collapse-btn"
          onClick={onToggleCollapse}
          aria-label={t(isCollapsed ? 'ui.sidebar.expand' : 'ui.sidebar.collapse')}
          title={t(isCollapsed ? 'ui.sidebar.expand' : 'ui.sidebar.collapse')}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {isCollapsed ? <path d="M9 6l6 6-6 6" /> : <path d="M15 6l-6 6 6 6" />}
          </svg>
        </button>
      </div>
      <nav className="sidebar-nav" aria-label={t('ui.sidebar.aria')}>
        {menuGroups.map((group) => (
          <section key={group.labelKey} className="sidebar-nav-group" aria-label={t(group.labelKey)}>
            <p className="sidebar-group-label">{t(group.labelKey)}</p>
            {group.pages.map((page) => {
              const isActive = activePage === page;
              return (
                <button
                  key={page}
                  type="button"
                  className={`sidebar-link ${isActive ? 'is-active' : ''}`.trim()}
                  data-label={t(`ui.sidebar.${page}`)}
                  title={isCollapsed ? t(`ui.sidebar.${page}`) : undefined}
                  onClick={() => {
                    onNavigate(page);
                  }}
                >
                  <span className="sidebar-link-icon" aria-hidden="true">
                    {iconByPage[page]}
                  </span>
                  <span className="sidebar-link-label">{t(`ui.sidebar.${page}`)}</span>
                </button>
              );
            })}
          </section>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-preferences">
          <Toggle
            id="sidebar-theme-toggle"
            label={t('ui.sidebar.theme_toggle')}
            checked={isDark}
            onChange={(checked) => {
              onThemeChange(checked ? 'dark' : 'light');
            }}
          />
          <button className="sidebar-language" type="button" onClick={onLocaleToggle}>
            <span className={locale === 'en' ? 'is-active' : ''}>{t('ui.sidebar.locale_en')}</span>
            <span>/</span>
            <span className={locale === 'de' ? 'is-active' : ''}>{t('ui.sidebar.locale_de')}</span>
          </button>
        </div>
      </div>
    </aside>
  );
};
