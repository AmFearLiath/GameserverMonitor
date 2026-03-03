import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import brandIcon from '../theme/logo_bw.png';

type LoginProps = {
  onLogin: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  onRegister: (username: string, email: string, password: string) => Promise<void>;
  onDiscordLogin: (rememberMe: boolean) => Promise<void>;
  embedded?: boolean;
  onClose?: () => void;
};

type AuthMode = 'login' | 'register';

export const Login = ({ onLogin, onRegister, onDiscordLogin, embedded = false, onClose }: LoginProps): JSX.Element => {
  const { t } = useTranslation();
  const resolveAuthErrorKey = (key: string): string => {
    if (key === 'error.api_unauthorized') {
      return 'ui.login.invalid_credentials';
    }

    return key;
  };
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const content = (
    <>
      <div className="login-brand">
        <img className="login-brand-logo" src={brandIcon} alt={t('ui.header.brand_name')} />
      </div>
      <div className="row-between">
        <h1 className="section-title">{t('ui.login.title')}</h1>
        {embedded && onClose ? (
          <Button variant="ghost" type="button" onClick={onClose} aria-label={t('ui.login.close_modal')}>
            ×
          </Button>
        ) : null}
      </div>
        <form
          className="form-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setIsLoading(true);
            setErrorKey(null);
            try {
              if (authMode === 'login') {
                await onLogin(username, password, rememberMe);
              } else {
                await onRegister(username, email, password);
              }
            } catch (error) {
              const key = error instanceof Error ? error.message : 'error.api_internal_error';
              setErrorKey(resolveAuthErrorKey(key));
            } finally {
              setIsLoading(false);
            }
          }}
        >
          <Input
            id="login-username"
            label={t('ui.login.username')}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
            }}
          />
          {authMode === 'register' ? (
            <Input
              id="login-email"
              label={t('ui.login.email')}
              type="email"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
              }}
            />
          ) : null}
          <Input
            id="login-password"
            label={t('ui.login.password')}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
          {authMode === 'login' ? (
            <label className="login-remember">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(event) => {
                  setRememberMe(event.target.checked);
                }}
              />
              <span>{t('ui.login.remember_me')}</span>
            </label>
          ) : null}
          {errorKey ? <p className="text-danger">{t(errorKey)}</p> : null}
          <Button variant="primary" type="submit" disabled={isLoading}>
            {isLoading ? t('ui.login.loading') : authMode === 'login' ? t('ui.login.submit') : t('ui.login.register_submit')}
          </Button>
          <Button
            variant="secondary"
            type="button"
            disabled={isLoading}
            onClick={async () => {
              setIsLoading(true);
              setErrorKey(null);
              try {
                await onDiscordLogin(rememberMe);
              } catch (error) {
                const key = error instanceof Error ? error.message : 'error.api_internal_error';
                setErrorKey(resolveAuthErrorKey(key));
              } finally {
                setIsLoading(false);
              }
            }}
          >
            {t('ui.login.discord')}
          </Button>
          <Button
            variant="ghost"
            type="button"
            disabled={isLoading}
            onClick={() => {
              setAuthMode((prev) => (prev === 'login' ? 'register' : 'login'));
              setErrorKey(null);
            }}
          >
            {authMode === 'login' ? t('ui.login.switch_to_register') : t('ui.login.switch_to_login')}
          </Button>
        </form>
    </>
  );

  if (embedded) {
    return <Card className="modal-card login-modal-card">{content}</Card>;
  }

  return (
    <main className="login-shell">
      <Card className="login-card">{content}</Card>
    </main>
  );
};
