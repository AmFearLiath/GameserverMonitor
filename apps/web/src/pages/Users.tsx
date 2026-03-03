import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import { Select } from '../components/primitives/Select.js';
import { Table } from '../components/primitives/Table.js';
import { Toggle } from '../components/primitives/Toggle.js';
import {
  createUserApi,
  deleteUserApi,
  fetchRolesApi,
  fetchUsersApi,
  updateUserApi,
  updateUserRolesApi,
  type UserDto
} from '../api.js';
import { confirmDeleteByName } from '../services/confirmDelete.js';

type UserAccountStatus = 'Active' | 'Disabled' | 'Pending';
type UserRole = string;
type UserManagementRow = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserAccountStatus;
  mfa_enabled: boolean;
  last_login: string;
  updated_at: string;
  roles: string[];
};

type UserFormState = {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserAccountStatus;
  mfa_enabled: boolean;
};

const createDefaultFormState = (): UserFormState => ({
  username: '',
  email: '',
  password: '',
  role: 'Viewer',
  status: 'Active',
  mfa_enabled: false
});

export const Users = (): JSX.Element => {
  const { t } = useTranslation();
  const getOptionLabel = (value: string): string => t(`ui.admin.option_values.${value}`);
  const [rows, setRows] = useState<UserManagementRow[]>([]);
  const [availableRoles, setAvailableRoles] = useState<UserRole[]>([]);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | UserRole>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | UserAccountStatus>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formState, setFormState] = useState<UserFormState>(createDefaultFormState());
  const [feedback, setFeedback] = useState<string | null>(null);

  const formatDateOrDash = (value: string | null): string => {
    if (!value) {
      return '-';
    }

    return new Date(value).toLocaleString();
  };

  const mapUserDto = useCallback(
    (user: UserDto): UserManagementRow => ({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.roles[0] ?? 'USER',
      roles: user.roles,
      status: user.is_enabled ? 'Active' : 'Disabled',
      mfa_enabled: false,
      last_login: formatDateOrDash(user.last_login_at),
      updated_at: formatDateOrDash(user.updated_at)
    }),
    []
  );

  const loadRows = useCallback(async (): Promise<void> => {
    const [users, roleRows] = await Promise.all([fetchUsersApi(), fetchRolesApi()]);
    setRows(users.map(mapUserDto));
    setAvailableRoles(roleRows.map((roleRow) => roleRow.key));
  }, [mapUserDto]);

  const roleOptions = useMemo(() => {
    const roleSet = new Set<UserRole>([...availableRoles, ...rows.map((row) => row.role)]);
    if (roleSet.size === 0) {
      roleSet.add('Admin');
      roleSet.add('Operator');
      roleSet.add('Viewer');
    }

    return Array.from(roleSet).sort((left, right) => left.localeCompare(right));
  }, [availableRoles, rows]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();

    return rows.filter((row) => {
      if (roleFilter !== 'ALL' && row.role !== roleFilter) {
        return false;
      }

      if (statusFilter !== 'ALL' && row.status !== statusFilter) {
        return false;
      }

      if (query.length === 0) {
        return true;
      }

      return row.username.toLowerCase().includes(query) || row.email.toLowerCase().includes(query) || row.id.toLowerCase().includes(query);
    });
  }, [roleFilter, rows, search, statusFilter]);

  const userStats = useMemo(
    () => ({
      total: rows.length,
      admins: rows.filter((row) => row.role === 'Admin').length,
      disabled: rows.filter((row) => row.status === 'Disabled').length,
      mfaEnabled: rows.filter((row) => row.mfa_enabled).length
    }),
    [rows]
  );

  const closeModal = (): void => {
    setIsModalOpen(false);
    setEditingUserId(null);
    setFormState(createDefaultFormState());
  };

  const openCreateModal = (): void => {
    const defaultRole = roleOptions.find((role) => role === 'Viewer') ?? roleOptions[0] ?? 'Viewer';
    setEditingUserId(null);
    setFormState({ ...createDefaultFormState(), role: defaultRole });
    setIsModalOpen(true);
  };

  const openEditModal = (row: UserManagementRow): void => {
    setEditingUserId(row.id);
    setFormState({
      username: row.username,
      email: row.email,
      role: row.role,
      status: row.status,
      password: '',
      mfa_enabled: row.mfa_enabled
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (): Promise<void> => {
    const username = formState.username.trim();
    const email = formState.email.trim().toLowerCase();

    if (username.length === 0 || email.length === 0) {
      return;
    }

    if (editingUserId) {
      await updateUserApi(editingUserId, {
        username,
        email,
        is_enabled: formState.status !== 'Disabled'
      });
      await updateUserRolesApi(editingUserId, [formState.role]);
      setFeedback(t('ui.users_page.feedback.saved'));
    } else {
      if (formState.password.trim().length < 8) {
        return;
      }

      await createUserApi({
        username,
        email,
        password: formState.password,
        is_enabled: formState.status !== 'Disabled',
        roles: [formState.role]
      });
      setFeedback(t('ui.users_page.feedback.created'));
    }

    await loadRows();
    closeModal();
  };

  return (
    <div className="page-stack">
      <div className="users-metrics-grid">
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.users_page.metrics.total_users')}</p>
          <p className="admin-metric-value">{userStats.total}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.users_page.metrics.admin_users')}</p>
          <p className="admin-metric-value">{userStats.admins}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.users_page.metrics.disabled_users')}</p>
          <p className="admin-metric-value">{userStats.disabled}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.users_page.metrics.mfa_enabled')}</p>
          <p className="admin-metric-value">{userStats.mfaEnabled}</p>
        </Card>
      </div>

      <Card className="users-toolbar-card">
        <div className="users-toolbar-grid">
          <Input
            id="users-search"
            label={t('ui.users_page.filters.search')}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
          />
          <Select
            id="users-role-filter"
            label={t('ui.users_page.filters.role')}
            value={roleFilter}
            options={[
              { value: 'ALL', label: t('ui.users_page.filters.all_roles') },
              ...roleOptions.map((role) => ({ value: role, label: getOptionLabel(role) }))
            ]}
            onChange={(event) => {
              setRoleFilter(event.target.value as 'ALL' | UserRole);
            }}
          />
          <Select
            id="users-status-filter"
            label={t('ui.users_page.filters.status')}
            value={statusFilter}
            options={[
              { value: 'ALL', label: t('ui.users_page.filters.all_statuses') },
              { value: 'Active', label: getOptionLabel('Active') },
              { value: 'Disabled', label: getOptionLabel('Disabled') },
              { value: 'Pending', label: getOptionLabel('Pending') }
            ]}
            onChange={(event) => {
              setStatusFilter(event.target.value as 'ALL' | UserAccountStatus);
            }}
          />
          <div className="users-toolbar-action">
            <Button variant="primary" onClick={openCreateModal}>
              {t('ui.users_page.actions.create')}
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        {feedback ? <p className="users-feedback">{feedback}</p> : null}
        <Table
          headers={[
            t('ui.users_page.columns.username'),
            t('ui.users_page.columns.email'),
            t('ui.users_page.columns.role'),
            t('ui.users_page.columns.status'),
            t('ui.users_page.columns.mfa'),
            t('ui.users_page.columns.last_login'),
            t('ui.users_page.columns.updated'),
            t('ui.users_page.columns.actions')
          ]}
          rows={
            filteredRows.length > 0
              ? filteredRows.map((row) => [
                  row.username,
                  row.email,
                  getOptionLabel(row.role),
                  getOptionLabel(row.status),
                  row.mfa_enabled ? t('ui.server_detail.yes') : t('ui.server_detail.no'),
                  row.last_login,
                  row.updated_at,
                  <div key={`${row.id}-actions`} className="users-row-actions">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        openEditModal(row);
                      }}
                    >
                      {t('ui.users_page.actions.edit')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await updateUserApi(row.id, {
                          is_enabled: row.status === 'Disabled'
                        });
                        await loadRows();
                      }}
                    >
                      {row.status === 'Disabled' ? t('ui.users_page.actions.enable') : t('ui.users_page.actions.disable')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        setFeedback(t('ui.users_page.feedback.saved'));
                      }}
                    >
                      {t('ui.users_page.actions.reset_password')}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        const confirmed = confirmDeleteByName(t('ui.users_page.actions.delete'), row.username);
                        if (!confirmed) {
                          return;
                        }

                        await deleteUserApi(row.id);
                        await loadRows();
                        setFeedback(t('ui.users_page.feedback.deleted'));
                      }}
                    >
                      {t('ui.users_page.actions.delete')}
                    </Button>
                  </div>
                ])
              : [[t('ui.users_page.empty'), '', '', '', '', '', '', '']]
          }
        />
      </Card>

      {isModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label={editingUserId ? t('ui.users_page.modal.edit_title') : t('ui.users_page.modal.create_title')}
          onClick={closeModal}
        >
          <div
            className="users-modal-wrap"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            <Card className="modal-card modal-card-users">
              <div className="row-between">
                <h3 className="section-title">{editingUserId ? t('ui.users_page.modal.edit_title') : t('ui.users_page.modal.create_title')}</h3>
                <Button variant="ghost" className="events-close-icon" onClick={closeModal} aria-label={t('ui.users_page.modal.close')}>
                  ×
                </Button>
              </div>

              <div className="users-modal-sections">
                <section className="server-add-section">
                  <h4 className="server-add-section-title">{t('ui.users_page.modal.sections.account')}</h4>
                  <div className="form-grid server-add-section-fields">
                    <Input
                      id="users-form-username"
                      label={t('ui.users_page.form.username')}
                      value={formState.username}
                      required
                      onChange={(event) => {
                        setFormState((prev) => ({ ...prev, username: event.target.value }));
                      }}
                    />
                    <Input
                      id="users-form-email"
                      label={t('ui.users_page.form.email')}
                      value={formState.email}
                      required
                      onChange={(event) => {
                        setFormState((prev) => ({ ...prev, email: event.target.value }));
                      }}
                    />
                    {!editingUserId ? (
                      <Input
                        id="users-form-password"
                        label={t('ui.login.password')}
                        type="password"
                        value={formState.password}
                        required
                        onChange={(event) => {
                          setFormState((prev) => ({ ...prev, password: event.target.value }));
                        }}
                      />
                    ) : null}
                  </div>
                </section>

                <section className="server-add-section">
                  <h4 className="server-add-section-title">{t('ui.users_page.modal.sections.permissions')}</h4>
                  <div className="form-grid server-add-section-fields">
                    <Select
                      id="users-form-role"
                      label={t('ui.users_page.form.role')}
                      value={formState.role}
                      options={roleOptions.map((role) => ({ value: role, label: getOptionLabel(role) }))}
                      onChange={(event) => {
                        setFormState((prev) => ({ ...prev, role: event.target.value as UserRole }));
                      }}
                    />
                    <Select
                      id="users-form-status"
                      label={t('ui.users_page.form.status')}
                      value={formState.status}
                      options={[
                        { value: 'Active', label: getOptionLabel('Active') },
                        { value: 'Disabled', label: getOptionLabel('Disabled') },
                        { value: 'Pending', label: getOptionLabel('Pending') }
                      ]}
                      onChange={(event) => {
                        setFormState((prev) => ({ ...prev, status: event.target.value as UserAccountStatus }));
                      }}
                    />
                    <Toggle
                      id="users-form-mfa"
                      label={t('ui.users_page.form.mfa_enabled')}
                      checked={formState.mfa_enabled}
                      onChange={(next) => {
                        setFormState((prev) => ({ ...prev, mfa_enabled: next }));
                      }}
                    />
                  </div>
                </section>
              </div>

              <div className="row-between">
                <Button variant="secondary" onClick={closeModal}>
                  {t('ui.admin.cancel')}
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    void handleSubmit();
                  }}
                  disabled={formState.username.trim().length === 0 || formState.email.trim().length === 0}
                >
                  {t('ui.admin.save')}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
};
