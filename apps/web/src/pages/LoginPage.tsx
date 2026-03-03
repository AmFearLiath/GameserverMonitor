import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type LoginPageProps = {
  onLogin: (username: string, password: string) => Promise<void>;
};

export const LoginPage = ({ onLogin }: LoginPageProps): JSX.Element => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin1234');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  return (
    <section className="card stack-md">
      <h2 className="page-title">{t('ui.login.title')}</h2>
      <form
        className="form-grid"
        onSubmit={async (event) => {
          event.preventDefault();
          setIsSubmitting(true);
          setErrorKey(null);

          try {
            await onLogin(username, password);
          } catch (error) {
            const fallbackKey = 'error.api_internal_error';
            const extractedKey = error instanceof Error ? error.message : fallbackKey;
            setErrorKey(extractedKey);
          } finally {
            setIsSubmitting(false);
          }
        }}
      >
        <label className="label" htmlFor="username">
          {t('ui.login.username')}
        </label>
        <input
          className="input"
          id="username"
          name="username"
          type="text"
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
        />
        <label className="label" htmlFor="password">
          {t('ui.login.password')}
        </label>
        <input
          className="input"
          id="password"
          name="password"
          type="password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {errorKey ? <p className="text-danger">{t(errorKey)}</p> : null}
        <button className="btn btn-primary" type="submit" disabled={isSubmitting}>
          {isSubmitting ? t('ui.login.loading') : t('ui.login.submit')}
        </button>
      </form>
    </section>
  );
};
