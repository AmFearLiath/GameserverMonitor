import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTheme, getInitialTheme, persistTheme, type ThemeMode } from './theme/index.js';
import {
  fetchAuthMe,
  fetchDiscordAuthorizeUrl,
  login as loginApi,
  register as registerApi,
  type AuthMeResponse
} from './api.js';
import { AppLayout } from './layout/AppLayout.js';
import { Dashboard } from './pages/Dashboard.js';
import { ServerDetail } from './pages/ServerDetail.js';
import { Admin } from './pages/Admin.js';
import { Servers } from './pages/Servers.js';
import { Incidents } from './pages/Incidents.js';
import { Users } from './pages/Users.js';
import { Profile } from './pages/Profile.js';
import type { AppPage } from './layout/Sidebar.js';
import { PublicHome } from './pages/PublicHome.js';

const AUTH_TOKEN_STORAGE_KEY = 'gm.auth.access_token';

const getStoredAccessToken = (): string | null => {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY) ?? window.sessionStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
};

const persistAccessToken = (token: string, rememberMe: boolean): void => {
  if (rememberMe) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

const clearStoredAccessToken = (): void => {
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
};

export const App = (): JSX.Element => {
  const [activePage, setActivePage] = useState<AppPage>('dashboard');
  const [isPublicHomeOpen, setIsPublicHomeOpen] = useState(false);
  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredAccessToken());
  const [authUser, setAuthUser] = useState<AuthMeResponse | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(() => Boolean(getStoredAccessToken()));
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());
  const [globalSearch, setGlobalSearch] = useState('');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const { t, i18n } = useTranslation();

  const currentLocale = useMemo(() => i18n.language, [i18n.language]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const discordToken = url.searchParams.get('discord_token');
    const discordRemember = url.searchParams.get('discord_remember') === '1';
    if (!discordToken) {
      return;
    }

    persistAccessToken(discordToken, discordRemember);
    setAccessToken(discordToken);
    url.searchParams.delete('discord_token');
    url.searchParams.delete('discord_remember');
    window.history.replaceState({}, document.title, url.toString());
  }, []);

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (!accessToken) {
      setAuthUser(null);
      setIsAuthChecking(false);
      return;
    }

    let disposed = false;
    setIsAuthChecking(true);

    void fetchAuthMe(accessToken)
      .then((user) => {
        if (disposed) {
          return;
        }
        setAuthUser(user);
      })
      .catch(() => {
        if (disposed) {
          return;
        }
        clearStoredAccessToken();
        setAccessToken(null);
        setAuthUser(null);
      })
      .finally(() => {
        if (disposed) {
          return;
        }
        setIsAuthChecking(false);
      });

    return () => {
      disposed = true;
    };
  }, [accessToken]);

  const handleLogin = async (username: string, password: string, rememberMe: boolean): Promise<void> => {
    const response = await loginApi(username, password);
    persistAccessToken(response.access_token, rememberMe);
    setAccessToken(response.access_token);
    setAuthUser(response.user);
  };

  const handleRegister = async (username: string, email: string, password: string): Promise<void> => {
    const response = await registerApi(username, email, password);
    persistAccessToken(response.access_token, true);
    setAccessToken(response.access_token);
    setAuthUser(response.user);
  };

  const handleDiscordLogin = async (rememberMe: boolean): Promise<void> => {
    const payload = await fetchDiscordAuthorizeUrl(rememberMe);
    window.location.href = payload.authorize_url;
  };

  const handleLogout = (): void => {
    clearStoredAccessToken();
    setAccessToken(null);
    setAuthUser(null);
    setIsPublicHomeOpen(false);
    setSelectedServerId(null);
    setActivePage('dashboard');
  };

  const pageTitle =
    activePage === 'detail'
      ? t('ui.sidebar.servers')
      : activePage === 'admin'
        ? t('ui.sidebar.admin')
        : t(`ui.sidebar.${activePage}`);

  const renderCurrentPage = (): JSX.Element => {
    if (activePage === 'detail' && selectedServerId) {
      return (
        <ServerDetail
          serverId={selectedServerId}
          isAdmin={Boolean(authUser?.roles.includes('ADMIN'))}
          onOpenServer={(nextServerId) => {
            setSelectedServerId(nextServerId);
            setActivePage('detail');
          }}
          onBack={() => {
            setActivePage('servers');
            setSelectedServerId(null);
          }}
        />
      );
    }

    if (activePage === 'admin') {
      return <Admin />;
    }

    if (activePage === 'users') {
      return <Users />;
    }

    if (activePage === 'profile') {
      return <Profile />;
    }

    if (activePage === 'servers') {
      return (
        <Servers
          globalSearch={globalSearch}
          isAdmin={Boolean(authUser?.roles.includes('ADMIN'))}
          profileId={authUser?.id ?? 'anonymous'}
          onOpenServer={(serverId) => {
            setSelectedServerId(serverId);
            setActivePage('detail');
          }}
        />
      );
    }

    if (activePage === 'incidents') {
      return (
        <Incidents
          globalSearch={globalSearch}
          onOpenServer={(serverId) => {
            setSelectedServerId(serverId);
            setActivePage('detail');
          }}
        />
      );
    }

    return (
      <Dashboard
        globalSearch={globalSearch}
      />
    );
  };

  return (
    isAuthChecking ? (
      <main className="login-shell">
        <section className="card stack-md">
          <p className="text-muted">{t('ui.auth.checking')}</p>
        </section>
      </main>
    ) : authUser ? (
      isPublicHomeOpen ? (
        <PublicHome
          isAuthenticated
          isAdmin={Boolean(authUser?.roles.includes('ADMIN'))}
          onBackToAdmin={() => {
            setIsPublicHomeOpen(false);
          }}
          onLogin={handleLogin}
          onRegister={handleRegister}
          onDiscordLogin={handleDiscordLogin}
          locale={currentLocale}
          onLocaleToggle={() => {
            void i18n.changeLanguage(currentLocale === 'en' ? 'de' : 'en');
          }}
        />
      ) : (
      <AppLayout
        activePage={activePage}
        pageTitle={pageTitle}
        onNavigate={(page) => {
          if (page === 'detail') {
            return;
          }
          setActivePage(page);
        }}
        isSidebarCollapsed={isSidebarCollapsed}
        onToggleSidebar={() => {
          setIsSidebarCollapsed((prev) => !prev);
        }}
        globalSearch={globalSearch}
        onGlobalSearchChange={setGlobalSearch}
        theme={theme}
        onThemeChange={setTheme}
        locale={currentLocale}
        onLocaleToggle={() => {
          void i18n.changeLanguage(currentLocale === 'en' ? 'de' : 'en');
        }}
        authUser={authUser}
        onOpenProfile={() => {
          setActivePage('profile');
        }}
        onLogout={handleLogout}
        onOpenPublicHome={() => {
          setIsPublicHomeOpen(true);
        }}
      >
        {renderCurrentPage()}
      </AppLayout>
      )
    ) : (
      <PublicHome
        onLogin={handleLogin}
        onRegister={handleRegister}
        onDiscordLogin={handleDiscordLogin}
        locale={currentLocale}
        onLocaleToggle={() => {
          void i18n.changeLanguage(currentLocale === 'en' ? 'de' : 'en');
        }}
      />
    )
  );
};
