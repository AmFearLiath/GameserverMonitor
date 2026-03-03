import type { ReactNode } from 'react';
import type { AuthMeResponse } from '../api.js';
import type { ThemeMode } from '../theme/index.js';
import { Header } from './Header.js';
import { Sidebar, type AppPage } from './Sidebar.js';

type AppLayoutProps = {
  activePage: AppPage;
  pageTitle: string;
  onNavigate: (page: AppPage) => void;
  isSidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  theme: ThemeMode;
  onThemeChange: (next: ThemeMode) => void;
  locale: string;
  onLocaleToggle: () => void;
  authUser: AuthMeResponse;
  onOpenProfile: () => void;
  onLogout: () => void;
  onOpenPublicHome: () => void;
  children: ReactNode;
};

export const AppLayout = ({
  activePage,
  pageTitle,
  onNavigate,
  isSidebarCollapsed,
  onToggleSidebar,
  globalSearch,
  onGlobalSearchChange,
  theme,
  onThemeChange,
  locale,
  onLocaleToggle,
  authUser,
  onOpenProfile,
  onLogout,
  onOpenPublicHome,
  children
}: AppLayoutProps): JSX.Element => {
  return (
    <main className="app-shell">
      <Header
        pageTitle={pageTitle}
        globalSearch={globalSearch}
        onGlobalSearchChange={onGlobalSearchChange}
        authUser={authUser}
        onOpenProfile={onOpenProfile}
        onLogout={onLogout}
        onOpenPublicHome={onOpenPublicHome}
      />
      <section className={`app-body ${isSidebarCollapsed ? 'sidebar-collapsed' : ''}`.trim()}>
        <Sidebar
          activePage={activePage}
          onNavigate={onNavigate}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={onToggleSidebar}
          theme={theme}
          onThemeChange={onThemeChange}
          locale={locale}
          onLocaleToggle={onLocaleToggle}
        />
        <section className="content-shell">
          <section className="content-area">{children}</section>
        </section>
      </section>
    </main>
  );
};
