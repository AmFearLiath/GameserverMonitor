import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthMeResponse } from '../api.js';
import { Input } from '../components/primitives/Input.js';
import brandIcon from '../theme/logo_bw.png';

type HeaderProps = {
  pageTitle: string;
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  authUser: AuthMeResponse;
  onOpenProfile?: () => void;
  onLogout: () => void;
  onOpenPublicHome?: () => void;
};

export const Header = ({
  globalSearch,
  onGlobalSearchChange,
  authUser,
  onOpenProfile,
  onLogout,
  onOpenPublicHome
}: HeaderProps): JSX.Element => {
  const { t } = useTranslation();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocumentClick = (event: MouseEvent): void => {
      if (!profileMenuRef.current) {
        return;
      }

      const target = event.target;
      if (target instanceof Node && !profileMenuRef.current.contains(target)) {
        setIsProfileMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', onDocumentClick);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
    };
  }, []);

  return (
    <header className="header">
      <div className="header-row">
        <div className="header-brand">
          <img className="header-logo" src={brandIcon} alt={t('ui.header.brand_name')} />
        </div>
        <div className="header-right">
          {onOpenPublicHome ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onOpenPublicHome}
            >
              {t('ui.header.open_public_home')}
            </button>
          ) : null}
          <Input
            id="global-search"
            placeholder={t('ui.header.search_placeholder')}
            value={globalSearch}
            onChange={(event) => {
              onGlobalSearchChange(event.target.value);
            }}
          />
          <div className="profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="profile-menu-trigger"
              aria-label={t('ui.header.user_menu')}
              aria-expanded={isProfileMenuOpen}
              onClick={() => {
                setIsProfileMenuOpen((prev) => !prev);
              }}
            >
              <div className="avatar">{authUser.username.slice(0, 1).toUpperCase()}</div>
            </button>

            {isProfileMenuOpen ? (
              <div className="profile-menu-popup" role="menu">
                <button
                  type="button"
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onOpenProfile?.();
                  }}
                >
                  {t('ui.header.user_profile')}
                </button>
                <button
                  type="button"
                  className="profile-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setIsProfileMenuOpen(false);
                    onLogout();
                  }}
                >
                  {t('ui.auth.logout')}
                </button>
              </div>
            ) : null}
          </div>
          <div className="user-chip" aria-label={t('ui.header.user_avatar')}>
            <span>{authUser.username}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
