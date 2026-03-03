import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchUserProfileApi, updateUserProfileApi } from '../api.js';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import { Select } from '../components/primitives/Select.js';
import { Toggle } from '../components/primitives/Toggle.js';

const timezoneOptions = [
  'UTC',
  'Europe/Berlin',
  'Europe/Vienna',
  'Europe/Zurich',
  'Europe/London',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles'
];

export const Profile = (): JSX.Element => {
  const { t } = useTranslation();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackKey, setFeedbackKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [timezone, setTimezone] = useState('Europe/Berlin');
  const [locale, setLocale] = useState('de');
  const [notifyEmail, setNotifyEmail] = useState(false);
  const [notifyDiscord, setNotifyDiscord] = useState(true);
  const [clientApiKey, setClientApiKey] = useState('');
  const [clientApiKeyHint, setClientApiKeyHint] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;

    const load = async (): Promise<void> => {
      setIsLoading(true);
      setErrorKey(null);
      setFeedbackKey(null);

      try {
        const profile = await fetchUserProfileApi();
        if (disposed) {
          return;
        }

        setUsername(profile.username);
        setEmail(profile.email);
        setDisplayName(profile.display_name ?? '');
        setAvatarUrl(profile.avatar_url ?? '');
        setTimezone(profile.timezone ?? 'Europe/Berlin');
        setLocale(profile.locale ?? 'de');
        setNotifyEmail(profile.settings.notify_email === true);
        setNotifyDiscord(profile.settings.notify_discord !== false);
        setClientApiKey('');
        setClientApiKeyHint(profile.client_api_key_hint);
      } catch (error) {
        if (disposed) {
          return;
        }
        const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
        setErrorKey(messageKey);
      } finally {
        if (!disposed) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      disposed = true;
    };
  }, []);

  const handleSave = async (): Promise<void> => {
    setIsSaving(true);
    setErrorKey(null);
    setFeedbackKey(null);

    try {
      const updated = await updateUserProfileApi({
        display_name: displayName.trim() || null,
        avatar_url: avatarUrl.trim() || null,
        timezone: timezone.trim() || null,
        locale: locale.trim() || null,
        ptero_client_api_key: clientApiKey.trim().length > 0 ? clientApiKey.trim() : undefined,
        settings: {
          notify_email: notifyEmail,
          notify_discord: notifyDiscord
        }
      });

      setClientApiKey('');
      setClientApiKeyHint(updated.client_api_key_hint);
      setFeedbackKey('ui.profile.saved');
    } catch (error) {
      const messageKey = error instanceof Error ? error.message : 'error.api_internal_error';
      setErrorKey(messageKey);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="page-stack">
      <Card className="stack-md">
        <h2 className="section-title">{t('ui.profile.title')}</h2>
        <p className="text-muted">{t('ui.profile.subtitle')}</p>

        {isLoading ? <p className="text-muted">{t('ui.profile.loading')}</p> : null}

        {!isLoading ? (
          <div className="form-grid">
            <Input id="profile-username" label={t('ui.profile.username')} value={username} disabled />
            <Input id="profile-email" label={t('ui.profile.email')} value={email} disabled />
            <Input
              id="profile-display-name"
              label={t('ui.profile.display_name')}
              value={displayName}
              onChange={(event) => {
                setDisplayName(event.target.value);
              }}
            />
            <Input
              id="profile-avatar-url"
              label={t('ui.profile.avatar_url')}
              value={avatarUrl}
              onChange={(event) => {
                setAvatarUrl(event.target.value);
              }}
            />
            <Select
              id="profile-timezone"
              label={t('ui.profile.timezone')}
              value={timezone}
              options={timezoneOptions.map((value) => ({ value, label: value }))}
              onChange={(event) => {
                setTimezone(event.target.value);
              }}
            />
            <Select
              id="profile-locale"
              label={t('ui.profile.locale')}
              value={locale}
              options={[
                { value: 'de', label: 'Deutsch' },
                { value: 'en', label: 'English' }
              ]}
              onChange={(event) => {
                setLocale(event.target.value);
              }}
            />
          </div>
        ) : null}
      </Card>

      <Card className="stack-md">
        <h3 className="section-title">{t('ui.profile.ptero_title')}</h3>
        <p className="text-muted">{t('ui.profile.ptero_description')}</p>

        <Input
          id="profile-client-api-key"
          label={t('ui.profile.client_api_key')}
          type="password"
          value={clientApiKey}
          placeholder={clientApiKeyHint ?? t('ui.profile.client_api_key_placeholder')}
          onChange={(event) => {
            setClientApiKey(event.target.value);
          }}
        />

        <div className="form-grid">
          <Toggle
            id="profile-notify-email"
            label={t('ui.profile.notify_email')}
            checked={notifyEmail}
            onChange={setNotifyEmail}
          />
          <Toggle
            id="profile-notify-discord"
            label={t('ui.profile.notify_discord')}
            checked={notifyDiscord}
            onChange={setNotifyDiscord}
          />
        </div>

        <div className="row-between">
          <div>
            {feedbackKey ? <p className="text-muted">{t(feedbackKey)}</p> : null}
            {errorKey ? <p className="text-muted">{t(errorKey)}</p> : null}
          </div>
          <Button variant="primary" onClick={() => void handleSave()} disabled={isLoading || isSaving}>
            {t('ui.profile.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
};
