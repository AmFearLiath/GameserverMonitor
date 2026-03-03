import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/primitives/Button.js';
import { Card } from '../components/primitives/Card.js';
import { Input } from '../components/primitives/Input.js';
import { Select } from '../components/primitives/Select.js';
import { Table } from '../components/primitives/Table.js';
import { Toggle } from '../components/primitives/Toggle.js';
import {
  createAlertChannelApi,
  createAlertPolicyApi,
  createExternalServerApi,
  createGameLabelApi,
  createNodeApi,
  createPanelApi,
  createRoleApi,
  createServerPresetApi,
  deleteRoleApi,
  deleteServerPresetApi,
  deleteGameLabelApi,
  deleteNodeApi,
  deletePanelApi,
  fetchAlertChannelsApi,
  fetchAlertPoliciesApi,
  fetchAppSettingsScopeApi,
  fetchGameLabelsApi,
  fetchNodes,
  fetchPanels,
  fetchRolesApi,
  fetchServerPresetsApi,
  saveAppSettingsScopeApi,
  sendAlertChannelTestApi,
  syncPanelApi,
  updateAlertChannelApi,
  updateAlertPolicyApi,
  updateGameLabelApi,
  updateNodeApi,
  updatePanelApi,
  updateRoleApi,
  updateServerPresetApi,
  validateNodeConfigApi,
  validatePanelConfigApi
} from '../api.js';
import { confirmDeleteByName } from '../services/confirmDelete.js';
import type { AdminEntityRow, AdminSection } from '../types.js';

type AdminSectionSettings = Record<string, string | boolean>;

type AdminTabKey = 'panels' | 'nodes' | 'servers' | 'games' | 'a2s' | 'alerts' | 'settings' | 'roles';
type AlertEntityFilter = 'all' | 'channels' | 'policies';

type AdminRowView = AdminEntityRow & {
  sourceSection: AdminSection;
};

type ServerHoster =
  | 'GENERIC'
  | 'GPORTAL'
  | 'NITRADO'
  | 'SHOCKBYTE'
  | 'APEX'
  | 'BISECT'
  | 'HOSTHAVOC'
  | 'SURVIVAL_SERVERS';

const tabOrder: AdminTabKey[] = ['panels', 'nodes', 'servers', 'games', 'a2s', 'alerts', 'settings', 'roles'];

type SettingField = {
  key: string;
  type: 'text' | 'toggle' | 'select' | 'password' | 'file' | 'static';
  options?: string[];
};

type ModalFieldGroup = {
  labelKey: string;
  fields: SettingField[];
};

const sectionSettingFields: Record<AdminTabKey, SettingField[]> = {
  panels: [],
  servers: [
    {
      key: 'server_default_hoster',
      type: 'select',
      options: ['GENERIC', 'GPORTAL', 'NITRADO', 'SHOCKBYTE', 'APEX', 'BISECT', 'HOSTHAVOC', 'SURVIVAL_SERVERS']
    },
    { key: 'server_default_protocol', type: 'select', options: ['UDP', 'TCP'] },
    { key: 'server_default_query_port_mode', type: 'select', options: ['SAME_AS_GAME', 'MANUAL_OPTIONAL', 'DISABLED'] },
    { key: 'server_default_prefer_a2s', type: 'toggle' },
    { key: 'server_auto_apply_preset_on_create', type: 'toggle' }
  ],
  games: [
    { key: 'allow_custom_labels', type: 'toggle' },
    { key: 'naming_pattern', type: 'text' },
    { key: 'require_published_state', type: 'toggle' }
  ],
  nodes: [],
  a2s: [
    { key: 'a2s_integration_enabled', type: 'toggle' },
    { key: 'a2s_timeout_ms', type: 'text' },
    { key: 'a2s_retry_count', type: 'text' }
  ],
  alerts: [
    { key: 'dedupe_window_sec', type: 'text' },
    { key: 'retry_failed_deliveries', type: 'toggle' },
    { key: 'test_message_enabled', type: 'toggle' },
    { key: 'cooldown_sec', type: 'text' },
    { key: 'escalation_enabled', type: 'toggle' },
    { key: 'send_resolved_notifications', type: 'toggle' }
  ],
  settings: [
    { key: 'strict_schema_validation', type: 'toggle' },
    { key: 'allow_profile_cloning', type: 'toggle' },
    { key: 'auto_update_enabled', type: 'toggle' },
    { key: 'default_timeout_ms', type: 'text' },
    { key: 'worker_check_interval_sec', type: 'text' },
    { key: 'worker_check_concurrency', type: 'text' }
  ],
  roles: [
    { key: 'role_change_requires_reason', type: 'toggle' },
    { key: 'default_new_user_role', type: 'select', options: [] },
    { key: 'role_delegation_enabled', type: 'toggle' }
  ]
};

const sectionStatusOptions: Record<AdminTabKey, string[]> = {
  panels: ['Active', 'Disabled'],
  servers: ['Active', 'Disabled'],
  games: ['Active', 'Draft'],
  nodes: ['Online', 'Offline', 'Maintenance'],
  a2s: ['Enabled'],
  alerts: ['Enabled', 'Disabled'],
  settings: ['Enabled'],
  roles: ['Active', 'Disabled']
};

const panelModalGroups: ModalFieldGroup[] = [
  {
    labelKey: 'ui.admin.modal_groups.panel_connection',
    fields: [
      { key: 'ptero_panel_url', type: 'text' },
      { key: 'ptero_panel_api_key_secret', type: 'password' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.panel_sync',
    fields: [
      { key: 'ptero_panel_sync_enabled', type: 'toggle' },
      { key: 'sync_interval_min', type: 'text' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.panel_visibility',
    fields: [{ key: 'show_in_dashboard_filters', type: 'toggle' }]
  }
];

const nodeModalGroups: ModalFieldGroup[] = [
  {
    labelKey: 'ui.admin.modal_groups.node_discovery',
    fields: [
      { key: 'auto_discovery', type: 'toggle' },
      { key: 'ptero_node_auto_import', type: 'toggle' },
      { key: 'ptero_node_sync_interval_sec', type: 'text' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.node_health',
    fields: [
      { key: 'healthcheck_interval_sec', type: 'text' },
      { key: 'maintenance_window_enabled', type: 'toggle' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.node_mapping',
    fields: [
      { key: 'ptero_node_panel_id', type: 'select' },
      { key: 'ptero_node_identifier_key', type: 'select', options: ['name', 'fqdn', 'ptero_node_id'] },
      { key: 'ptero_node_identifier_value', type: 'text' }
    ]
  }
];

const gameModalGroups: ModalFieldGroup[] = [
  {
    labelKey: 'ui.admin.modal_groups.game_identity',
    fields: [
      { key: 'game_icon_upload', type: 'file' },
      { key: 'game_icon_url', type: 'text' },
      { key: 'game_system_tags', type: 'text' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.game_capacity',
    fields: [{ key: 'game_max_players', type: 'text' }]
  },
  {
    labelKey: 'ui.admin.modal_groups.game_monitoring',
    fields: [
      { key: 'game_module_key', type: 'select', options: ['tcp_connect', 'enshrouded_query', 'a2s_query'] },
      { key: 'game_default_check_profile', type: 'select', options: ['default-tcp', 'http-query'] },
      { key: 'game_query_timeout_ms', type: 'text' },
      { key: 'game_restart_grace_sec', type: 'text' },
      { key: 'game_requires_query_endpoint', type: 'toggle' }
    ]
  }
];

const serverPresetModalGroups: ModalFieldGroup[] = [
  {
    labelKey: 'ui.admin.modal_groups.server_preset_identity',
    fields: [
      { key: 'server_preset_key', type: 'text' },
      {
        key: 'server_preset_hoster',
        type: 'select',
        options: ['GENERIC', 'GPORTAL', 'NITRADO', 'SHOCKBYTE', 'APEX', 'BISECT', 'HOSTHAVOC', 'SURVIVAL_SERVERS']
      }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.server_preset_connectivity',
    fields: [
      { key: 'server_preset_protocol', type: 'select', options: ['UDP', 'TCP'] },
      { key: 'server_preset_query_port_mode', type: 'select', options: ['SAME_AS_GAME', 'MANUAL_OPTIONAL', 'DISABLED'] },
      { key: 'server_preset_prefer_a2s', type: 'toggle' }
    ]
  },
  {
    labelKey: 'ui.admin.modal_groups.server_preset_notes',
    fields: [{ key: 'server_preset_notes', type: 'text' }]
  }
];

const entityModalGroups: Partial<Record<AdminTabKey, ModalFieldGroup[]>> = {
  panels: panelModalGroups,
  nodes: nodeModalGroups,
  servers: serverPresetModalGroups,
  games: gameModalGroups
};

const getDefaultEntitySettings = (targetTab: AdminTabKey): AdminSectionSettings => {
  if (targetTab === 'panels') {
    return {
      ptero_panel_url: '',
      ptero_panel_api_key_secret: '',
      ptero_panel_api_key_hint: '',
      ptero_panel_sync_enabled: true,
      sync_interval_min: '5',
      show_in_dashboard_filters: true
    };
  }

  if (targetTab === 'nodes') {
    return {
      auto_discovery: true,
      healthcheck_interval_sec: '30',
      maintenance_window_enabled: false,
      ptero_node_panel_id: '',
      ptero_node_auto_import: true,
      ptero_node_identifier_key: 'ptero_node_id',
      ptero_node_identifier_value: '',
      ptero_node_sync_interval_sec: '60'
    };
  }

  if (targetTab === 'games') {
    return {
      game_icon_upload: '',
      game_icon_url: '',
      game_system_tags: '',
      game_max_players: '100',
      game_module_key: 'tcp_connect',
      game_default_check_profile: 'default-tcp',
      game_query_timeout_ms: '1500',
      game_restart_grace_sec: '210',
      game_requires_query_endpoint: true
    };
  }

  if (targetTab === 'servers') {
    return {
      server_preset_key: '',
      server_preset_hoster: 'GENERIC',
      server_preset_protocol: 'UDP',
      server_preset_query_port_mode: 'SAME_AS_GAME',
      server_preset_prefer_a2s: false,
      server_preset_notes: ''
    };
  }

  if (targetTab === 'alerts') {
    return {
      alert_channel_config_enc: '',
      alert_cooldown_seconds: '300',
      alert_policy_channel_ids: ''
    };
  }

  return {};
};

type RolePermissionGroup = 'read' | 'operations' | 'infrastructure' | 'integrations' | 'security' | 'system';

const rolePermissionOptions: Array<{ id: string; key: string; group: RolePermissionGroup }> = [
  { id: 'dashboard.read', key: 'dashboard_read', group: 'read' },
  { id: 'incidents.read', key: 'incidents_read', group: 'read' },
  { id: 'servers.manage', key: 'servers_manage', group: 'operations' },
  { id: 'incidents.resolve', key: 'incidents_resolve', group: 'operations' },
  { id: 'alerts.manage', key: 'alerts_manage', group: 'operations' },
  { id: 'panels.manage', key: 'panels_manage', group: 'infrastructure' },
  { id: 'nodes.manage', key: 'nodes_manage', group: 'infrastructure' },
  { id: 'ptero.panels.manage', key: 'ptero_panels_manage', group: 'integrations' },
  { id: 'ptero.nodes.manage', key: 'ptero_nodes_manage', group: 'integrations' },
  { id: 'ptero.api_keys.manage', key: 'ptero_api_keys_manage', group: 'integrations' },
  { id: 'users.manage', key: 'users_manage', group: 'security' },
  { id: 'roles.manage', key: 'roles_manage', group: 'security' },
  { id: 'auth.sessions.manage', key: 'auth_sessions_manage', group: 'security' },
  { id: 'system.settings', key: 'system_settings', group: 'system' }
];

const rolePermissionColumns: RolePermissionGroup[][] = [
  ['read', 'infrastructure', 'system'],
  ['operations', 'integrations', 'security']
];

export const Admin = (): JSX.Element => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<AdminTabKey>('panels');
  const [rows, setRows] = useState<AdminRowView[]>([]);
  const [sectionSettings, setSectionSettings] = useState<AdminSectionSettings>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [draftAlertType, setDraftAlertType] = useState<'channels' | 'policies'>('channels');
  const [alertEntityFilter, setAlertEntityFilter] = useState<AlertEntityFilter>('all');
  const [draftName, setDraftName] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [draftEntitySettings, setDraftEntitySettings] = useState<AdminSectionSettings>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [entityFeedback, setEntityFeedback] = useState<string | null>(null);
  const [panelOptions, setPanelOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [validationFeedback, setValidationFeedback] = useState<string | null>(null);
  const [externalName, setExternalName] = useState('');
  const [externalHoster, setExternalHoster] = useState<ServerHoster>('GENERIC');
  const [externalHost, setExternalHost] = useState('');
  const [externalGamePort, setExternalGamePort] = useState('');
  const [externalQueryPort, setExternalQueryPort] = useState('');
  const [externalProtocol, setExternalProtocol] = useState<'UDP' | 'TCP'>('UDP');
  const [externalGameLabel, setExternalGameLabel] = useState('');
  const [externalPresetId, setExternalPresetId] = useState('');
  const [externalFeedback, setExternalFeedback] = useState<string | null>(null);
  const [isExternalModalOpen, setIsExternalModalOpen] = useState(false);
  const [serverPresetOptions, setServerPresetOptions] = useState<
    Awaited<ReturnType<typeof fetchServerPresetsApi>>
  >([]);
  const [externalGameLabelOptions, setExternalGameLabelOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [updateStatusSettings, setUpdateStatusSettings] = useState<AdminSectionSettings>({});
  const [alertChannelOptions, setAlertChannelOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [roleOptions, setRoleOptions] = useState<Array<{ key: string; name: string }>>([]);
  const activeTabRef = useRef<AdminTabKey>('panels');

  const parseChannelIds = (value: string): string[] => {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter((item, index, all) => item.length > 0 && all.indexOf(item) === index);
  };

  const parseBooleanSetting = (value: string | boolean | undefined): boolean => {
    if (typeof value === 'boolean') {
      return value;
    }

    if (typeof value !== 'string') {
      return false;
    }

    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  };

  const toPanelRow = (panel: Awaited<ReturnType<typeof fetchPanels>>[number]): AdminRowView => ({
    id: panel.id,
    name: panel.name,
    status: panel.is_enabled ? 'Active' : 'Disabled',
    updated_at: panel.updated_at,
    settings: {
      ptero_panel_url: panel.base_url,
      ptero_panel_sync_enabled: panel.is_enabled,
      ptero_panel_sync_status: panel.sync_status
    },
    sourceSection: 'panels'
  });

  const toNodeRow = (node: Awaited<ReturnType<typeof fetchNodes>>[number]): AdminRowView => ({
    id: node.id,
    name: node.name,
    status: node.is_enabled ? 'Online' : 'Offline',
    updated_at: node.updated_at,
    settings: {
      ptero_node_identifier_key: 'ptero_node_id',
      ptero_node_identifier_value: node.ptero_node_id,
      ptero_node_panel_id: node.panel_id,
      ptero_node_fqdn_or_ip: node.fqdn_or_ip ?? '',
      ptero_node_location: node.location ?? '',
      ptero_node_last_seen_at: node.last_seen_at ?? ''
    },
    sourceSection: 'nodes'
  });

  const toGameRow = (label: Awaited<ReturnType<typeof fetchGameLabelsApi>>[number]): AdminRowView => ({
    id: label.id,
    name: label.name,
    status: label.is_enabled ? 'Active' : 'Disabled',
    updated_at: label.updated_at,
    settings: (label.settings ?? {}) as AdminSectionSettings,
    sourceSection: 'game_labels'
  });

  const toAlertChannelRow = (channel: Awaited<ReturnType<typeof fetchAlertChannelsApi>>[number]): AdminRowView => ({
    id: channel.id,
    name: channel.name,
    status: channel.is_enabled ? 'Enabled' : 'Disabled',
    updated_at: channel.updated_at,
    settings: {
      alert_channel_type: channel.type
    },
    sourceSection: 'channels'
  });

  const toAlertPolicyRow = (policy: Awaited<ReturnType<typeof fetchAlertPoliciesApi>>[number]): AdminRowView => ({
    id: policy.id,
    name: policy.name,
    status: policy.is_enabled ? 'Enabled' : 'Disabled',
    updated_at: policy.updated_at,
    settings: {
      alert_cooldown_seconds: String(policy.cooldown_seconds),
      alert_policy_channel_ids: policy.channel_ids.join(',')
    },
    sourceSection: 'policies'
  });

  const toRoleRow = (role: Awaited<ReturnType<typeof fetchRolesApi>>[number]): AdminRowView => ({
    id: role.id,
    name: role.name,
    status: 'Active',
    updated_at: '-',
    settings: {
      role_key: role.key
    },
    permissions: Array.isArray(role.permissions) ? role.permissions : [],
    sourceSection: 'roles'
  });

  const toServerPresetRow = (preset: Awaited<ReturnType<typeof fetchServerPresetsApi>>[number]): AdminRowView => ({
    id: preset.id,
    name: `${preset.name} (${preset.hoster})`,
    status: 'Active',
    updated_at: preset.updated_at,
    settings: {
      server_preset_key: preset.key,
      server_preset_hoster: preset.hoster,
      server_preset_protocol: preset.protocol,
      server_preset_query_port_mode: preset.query_port_mode,
      server_preset_prefer_a2s: preset.prefer_a2s,
      server_preset_notes: preset.notes ?? '',
      server_preset_is_system: preset.is_system
    },
    sourceSection: 'servers'
  });

  const loadTabData = useCallback(async (targetTab: AdminTabKey): Promise<void> => {
    const isStaleRequest = (): boolean => activeTabRef.current !== targetTab;

    if (targetTab === 'panels') {
      const panels = await fetchPanels();
      if (isStaleRequest()) {
        return;
      }

      setPanelOptions(panels.map((panel) => ({ id: panel.id, name: panel.name })));
      setRows(panels.map(toPanelRow));
      setSectionSettings({});
      return;
    }

    if (targetTab === 'nodes') {
      const [nodes, panels] = await Promise.all([fetchNodes(), fetchPanels()]);
      if (isStaleRequest()) {
        return;
      }

      setPanelOptions(panels.map((panel) => ({ id: panel.id, name: panel.name })));
      setRows(nodes.map(toNodeRow));
      setSectionSettings({});
      return;
    }

    if (targetTab === 'servers') {
      const [presets, settings, gameLabels] = await Promise.all([
        fetchServerPresetsApi(),
        fetchAppSettingsScopeApi('servers'),
        fetchGameLabelsApi()
      ]);

      if (isStaleRequest()) {
        return;
      }

      setServerPresetOptions(presets);
      setExternalGameLabelOptions([
        { value: '', label: t('ui.server_detail.edit.no_game_label') },
        ...gameLabels
          .filter((label) => label.is_enabled)
          .map((label) => ({ value: label.name, label: label.name }))
      ]);
      setRows(presets.map(toServerPresetRow));
      setSectionSettings(settings);
      return;
    }

    if (targetTab === 'alerts') {
      const [channels, policies, settings] = await Promise.all([
        fetchAlertChannelsApi(),
        fetchAlertPoliciesApi(),
        fetchAppSettingsScopeApi('alerts')
      ]);

      if (isStaleRequest()) {
        return;
      }

      setAlertChannelOptions(channels.map((channel) => ({ id: channel.id, name: channel.name })));

      setRows([
        ...channels.map(toAlertChannelRow),
        ...policies.map(toAlertPolicyRow)
      ]);
      setSectionSettings(settings);
      return;
    }

    if (targetTab === 'settings' || targetTab === 'a2s') {
      const scope = targetTab === 'settings' ? 'settings' : 'a2s';
      const [settings, updates] = await Promise.all([
        fetchAppSettingsScopeApi(scope),
        targetTab === 'settings' ? fetchAppSettingsScopeApi('updates') : Promise.resolve({})
      ]);
      if (isStaleRequest()) {
        return;
      }

      setAlertChannelOptions([]);
      setRows([]);
      setSectionSettings(settings);
      setUpdateStatusSettings(updates);
      return;
    }

    if (targetTab === 'games') {
      const [labels, settings] = await Promise.all([
        fetchGameLabelsApi(),
        fetchAppSettingsScopeApi('games')
      ]);
      if (isStaleRequest()) {
        return;
      }

      setAlertChannelOptions([]);
      setRows(labels.map(toGameRow));
      setSectionSettings(settings);
      return;
    }

    if (targetTab === 'roles') {
      const [roles, settings] = await Promise.all([
        fetchRolesApi(),
        fetchAppSettingsScopeApi('roles')
      ]);
      if (isStaleRequest()) {
        return;
      }

      setAlertChannelOptions([]);
      setRoleOptions(roles.map((role) => ({ key: role.key, name: role.name })));
      setRows(roles.map(toRoleRow));

      const configuredDefaultRole = String(settings.default_new_user_role ?? '').trim();
      const configuredRoleUpper = configuredDefaultRole.toUpperCase();
      const normalizedDefaultRole =
        roles.find((role) => role.key === configuredRoleUpper)?.key ??
        roles.find((role) => role.name.trim().toUpperCase() === configuredRoleUpper)?.key ??
        configuredRoleUpper;

      setSectionSettings({
        ...settings,
        default_new_user_role: normalizedDefaultRole
      });
      return;
    }

    setAlertChannelOptions([]);
    setRows([]);
    setSectionSettings({});
    setUpdateStatusSettings({});
  }, [t]);

  useEffect(() => {
    activeTabRef.current = tab;
    setSearchQuery('');
    setEntityFeedback(null);
    setRows([]);
    setSectionSettings({});
    setValidationFeedback(null);
    const defaultStatus = sectionStatusOptions[tab][0] ?? 'Active';
    setDraftStatus(defaultStatus);
    if (tab !== 'alerts') {
      setDraftAlertType('channels');
    }
    setAlertEntityFilter('all');

    void loadTabData(tab);
  }, [tab, loadTabData]);

  useEffect(() => {
    if (tab !== 'servers') {
      return;
    }

    const defaultHoster = String(sectionSettings.server_default_hoster ?? 'GENERIC');
    const defaultProtocol = String(sectionSettings.server_default_protocol ?? 'UDP');

    setExternalHoster(
      defaultHoster === 'GPORTAL' ||
        defaultHoster === 'NITRADO' ||
        defaultHoster === 'SHOCKBYTE' ||
        defaultHoster === 'APEX' ||
        defaultHoster === 'BISECT' ||
        defaultHoster === 'HOSTHAVOC' ||
        defaultHoster === 'SURVIVAL_SERVERS'
        ? defaultHoster
        : 'GENERIC'
    );
    setExternalProtocol(defaultProtocol === 'TCP' ? 'TCP' : 'UDP');
  }, [sectionSettings.server_default_hoster, sectionSettings.server_default_protocol, tab]);

  const rowsForActiveTab = useMemo(() => {
    const belongsToTab = (row: AdminRowView): boolean => {
      if (tab === 'alerts') {
        const isAlertEntity = row.sourceSection === 'channels' || row.sourceSection === 'policies';
        if (!isAlertEntity) {
          return false;
        }

        if (alertEntityFilter === 'all') {
          return true;
        }

        return row.sourceSection === alertEntityFilter;
      }

      if (tab === 'games') {
        return row.sourceSection === 'game_labels';
      }

      return row.sourceSection === tab;
    };

    return rows.filter(belongsToTab);
  }, [rows, tab, alertEntityFilter]);

  const activeRows = useMemo(
    () => rowsForActiveTab.filter((row) => /active|online|enabled|admin/i.test(row.status)).length,
    [rowsForActiveTab]
  );

  const serverPresetsForSettings = useMemo(() => {
    if (tab !== 'servers') {
      return [] as Array<{
        id: string;
        name: string;
        hoster: string;
        key: string;
        is_system: boolean;
      }>;
    }

    const fromRows = rowsForActiveTab
      .filter((row) => row.sourceSection === 'servers')
      .map((row) => ({
        id: row.id,
        name: row.name,
        hoster: String(row.settings?.server_preset_hoster ?? 'GENERIC'),
        key: String(row.settings?.server_preset_key ?? row.id),
        is_system: Boolean(row.settings?.server_preset_is_system)
      }));

    if (fromRows.length > 0) {
      return fromRows;
    }

    return serverPresetOptions.map((preset) => ({
      id: preset.id,
      name: preset.name,
      hoster: preset.hoster,
      key: preset.key,
      is_system: preset.is_system
    }));
  }, [rowsForActiveTab, serverPresetOptions, tab]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
      return rowsForActiveTab;
    }

    return rowsForActiveTab.filter(
      (row) => row.name.toLowerCase().includes(normalizedQuery) || row.id.toLowerCase().includes(normalizedQuery)
    );
  }, [rowsForActiveTab, searchQuery]);

  const closeModal = (): void => {
    setIsModalOpen(false);
    setEditingRowId(null);
    setDraftName('');
    setDraftStatus(sectionStatusOptions[tab][0] ?? 'Active');
    setDraftPermissions([]);
    setDraftEntitySettings({});
    setDraftAlertType('channels');
    setValidationFeedback(null);
  };

  const resetExternalDraft = (): void => {
    const defaultHoster = String(sectionSettings.server_default_hoster ?? 'GENERIC');
    const defaultProtocol = String(sectionSettings.server_default_protocol ?? 'UDP');

    setExternalName('');
    setExternalHoster(
      defaultHoster === 'GPORTAL' ||
        defaultHoster === 'NITRADO' ||
        defaultHoster === 'SHOCKBYTE' ||
        defaultHoster === 'APEX' ||
        defaultHoster === 'BISECT' ||
        defaultHoster === 'HOSTHAVOC' ||
        defaultHoster === 'SURVIVAL_SERVERS'
        ? defaultHoster
        : 'GENERIC'
    );
    setExternalHost('');
    setExternalGamePort('');
    setExternalQueryPort('');
    setExternalProtocol(defaultProtocol === 'TCP' ? 'TCP' : 'UDP');
    setExternalGameLabel('');
    setExternalPresetId('');
  };

  const handleCreateExternalServer = async (): Promise<void> => {
    const name = externalName.trim();
    const host = externalHost.trim();
    const gamePort = Number(externalGamePort.trim());
    const queryPortRaw = externalQueryPort.trim();
    const queryPort = queryPortRaw.length > 0 ? Number(queryPortRaw) : undefined;

    if (!name || !host || !Number.isInteger(gamePort) || gamePort < 1 || gamePort > 65535) {
      setExternalFeedback(t('error.api_validation_error'));
      return;
    }

    if (queryPort !== undefined && (!Number.isInteger(queryPort) || queryPort < 1 || queryPort > 65535)) {
      setExternalFeedback(t('error.api_validation_error'));
      return;
    }

    try {
      await createExternalServerApi({
        name,
        host,
        game_port: gamePort,
        query_port: queryPort,
        protocol: externalProtocol,
        hoster: externalHoster,
        game_label: externalGameLabel.trim() || null
      });

      resetExternalDraft();
      setExternalFeedback(t('ui.admin.external_server.feedback.created'));
      setIsExternalModalOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error.api_internal_error';
      setExternalFeedback(t(message));
    }
  };

  const openCreateModal = (): void => {
    setEditingRowId(null);
    setDraftName('');
    setDraftStatus(sectionStatusOptions[tab][0] ?? 'Active');
    setDraftPermissions([]);
    setDraftEntitySettings(getDefaultEntitySettings(tab));
    setDraftAlertType('channels');
    setValidationFeedback(null);
    setIsModalOpen(true);
  };

  const openEditModal = (row: AdminRowView): void => {
    setEditingRowId(row.id);
    setDraftAlertType(row.sourceSection === 'policies' ? 'policies' : 'channels');
    setDraftName(row.name);
    setDraftStatus(row.status);
    setDraftPermissions([...(row.permissions ?? [])]);
    setDraftEntitySettings({ ...getDefaultEntitySettings(tab), ...(row.settings ?? {}) });
    setValidationFeedback(null);
    setIsModalOpen(true);
  };

  const getPermissionLabel = (permissionId: string): string => {
    const option = rolePermissionOptions.find((entry) => entry.id === permissionId);
    if (!option) {
      return permissionId;
    }

    return t(`ui.admin.permission_options.${option.key}`);
  };

  const refreshRows = async (): Promise<void> => {
    await loadTabData(tab);
  };

  const rowById = (id: string, sourceRows: AdminRowView[]): AdminRowView | undefined => {
    return sourceRows.find((row) => row.id === id);
  };

  const renderNameCell = (row: AdminRowView): JSX.Element | string => {
    if (row.sourceSection !== 'panels' && row.sourceSection !== 'nodes') {
      return row.name;
    }

    let indicatorClass = 'is-offline';
    let indicatorLabel = t('ui.admin.reachability.unreachable');

    if (row.sourceSection === 'panels') {
      const syncStatus = String(row.settings?.ptero_panel_sync_status ?? 'ERROR');
      const isEnabled = /active|enabled/i.test(row.status);

      if (!isEnabled) {
        indicatorClass = 'is-disabled';
        indicatorLabel = t('ui.admin.reachability.disabled');
      } else if (syncStatus === 'OK') {
        indicatorClass = 'is-online';
        indicatorLabel = t('ui.admin.reachability.reachable');
      } else if (syncStatus === 'DEGRADED') {
        indicatorClass = 'is-transition';
        indicatorLabel = t('ui.admin.reachability.degraded');
      }
    }

    if (row.sourceSection === 'nodes') {
      const isEnabled = /online|active|enabled/i.test(row.status);
      const hasLastSeen = String(row.settings?.ptero_node_last_seen_at ?? '').trim().length > 0;

      if (!isEnabled) {
        indicatorClass = 'is-disabled';
        indicatorLabel = t('ui.admin.reachability.disabled');
      } else if (hasLastSeen) {
        indicatorClass = 'is-online';
        indicatorLabel = t('ui.admin.reachability.reachable');
      }
    }

    return (
      <span className="admin-reachability">
        <span className={`admin-reachability-light ${indicatorClass}`.trim()} title={indicatorLabel} aria-label={indicatorLabel} />
        <span>{row.name}</span>
      </span>
    );
  };

  const runDraftValidation = async (): Promise<{ ok: boolean; resolvedNodeId?: string }> => {
    try {
      if (tab === 'panels') {
        const baseUrl = String(draftEntitySettings.ptero_panel_url ?? '').trim();
        const apiKey = String(draftEntitySettings.ptero_panel_api_key_secret ?? '').trim();

        if (editingRowId) {
          await validatePanelConfigApi({
            panel_id: editingRowId,
            base_url: baseUrl || undefined,
            api_key: apiKey || undefined
          });
        } else {
          if (!baseUrl || !apiKey) {
            setValidationFeedback(t('ui.admin.validation.missing_panel_credentials'));
            return { ok: false };
          }

          await validatePanelConfigApi({
            base_url: baseUrl,
            api_key: apiKey
          });
        }

        setValidationFeedback(t('ui.admin.validation.panel_ok'));
        return { ok: true };
      }

      if (tab === 'nodes') {
        const panelIdFromDraft = String(draftEntitySettings.ptero_node_panel_id ?? '').trim();
        const selectedPanelId = panelIdFromDraft || panelOptions[0]?.id;
        const identifierKeyRaw = String(draftEntitySettings.ptero_node_identifier_key ?? 'ptero_node_id').trim();
        const identifierKey =
          identifierKeyRaw === 'name' || identifierKeyRaw === 'fqdn' || identifierKeyRaw === 'ptero_node_id'
            ? identifierKeyRaw
            : 'ptero_node_id';
        const identifierValue = String(draftEntitySettings.ptero_node_identifier_value ?? '').trim();

        if (!selectedPanelId || !identifierValue) {
          setValidationFeedback(t('ui.admin.validation.missing_node_identity'));
          return { ok: false };
        }

        const validationResult = await validateNodeConfigApi({
          panel_id: selectedPanelId,
          ptero_node_id: identifierKey === 'ptero_node_id' ? identifierValue : undefined,
          identifier_key: identifierKey,
          identifier_value: identifierValue
        });

        setValidationFeedback(
          t('ui.admin.validation.node_ok', { mode: validationResult.matched_by })
        );
        return { ok: true, resolvedNodeId: validationResult.node_id };
      }

      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'error.api_precondition_failed';
      setValidationFeedback(t(message));
      return { ok: false };
    }
  };

  const tabLabelKey: Record<AdminTabKey, string> = {
    panels: 'ui.admin.sections.panels',
    nodes: 'ui.admin.sections.nodes',
    servers: 'ui.admin.sections.servers',
    games: 'ui.admin.sections.games',
    a2s: 'ui.admin.sections.a2s',
    alerts: 'ui.admin.sections.alerts',
    settings: 'ui.admin.sections.settings',
    roles: 'ui.admin.sections.roles'
  };

  const isSettingsOnlyTab = tab === 'settings' || tab === 'a2s';
  const hasSectionSettings = sectionSettingFields[tab].length > 0;
  const supportsRealCrud =
    tab === 'panels' || tab === 'nodes' || tab === 'servers' || tab === 'games' || tab === 'alerts' || tab === 'roles';
  const getOptionLabel = (value: string): string => t(`ui.admin.option_values.${value}`);
  const roleDefaultOptions = useMemo(() => {
    return roleOptions.map((role) => ({ value: role.key, label: role.name }));
  }, [roleOptions]);

  const currentVersion = String(updateStatusSettings.current_version ?? '0.1.0').trim();
  const latestVersion = String(updateStatusSettings.latest_version ?? '').trim();
  const hasVersionDifference = latestVersion.length > 0 && latestVersion !== '-' && latestVersion !== currentVersion;
  const hasUpdateAvailable = parseBooleanSetting(updateStatusSettings.update_available);
  const canManualUpdate = hasVersionDifference && hasUpdateAvailable;
  const manualUpdateUrl = String(updateStatusSettings.release_url ?? updateStatusSettings.repository_url ?? '').trim();

  const renderExternalHelp = (fieldKey: string): JSX.Element => {
    const fieldLabel = t(`ui.admin.external_server.fields.${fieldKey}`);
    const helperShort = t(`ui.admin.external_server.help_short.${fieldKey}`);
    const helperTooltip = t(`ui.admin.external_server.help_tooltip.${fieldKey}`);

    return (
      <div className="admin-setting-help-row">
        <button
          type="button"
          className="admin-info-icon"
          aria-label={t('ui.admin.settings.info_aria', { field: fieldLabel })}
          data-tooltip={helperTooltip}
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          i
        </button>
        <p className="text-muted admin-setting-help">{helperShort}</p>
      </div>
    );
  };

  const renderEntityField = (field: SettingField): JSX.Element => {
    const value = draftEntitySettings[field.key];
    const fieldLabel = t(`ui.admin.settings.fields.${field.key}`);
    const isPanelApiKeySecretField = field.key === 'ptero_panel_api_key_secret';
    const helperShort = t(`ui.admin.settings.help_short.${field.key}`);
    const helperTooltip = t(`ui.admin.settings.help_tooltip.${field.key}`);

    const helperContent = (
      <div className="admin-setting-help-row">
        <button
          type="button"
          className="admin-info-icon"
          aria-label={t('ui.admin.settings.info_aria', { field: fieldLabel })}
          data-tooltip={helperTooltip}
          onClick={(event) => {
            event.preventDefault();
          }}
        >
          i
        </button>
        <p className="text-muted admin-setting-help">{helperShort}</p>
      </div>
    );

    if (field.type === 'toggle') {
      return (
        <div key={`modal-${field.key}`} className="admin-setting-item">
          <Toggle
            id={`admin-modal-${field.key}`}
            label={fieldLabel}
            checked={Boolean(value)}
            onChange={(next) => {
              setDraftEntitySettings((prev) => ({ ...prev, [field.key]: next }));
            }}
          />
          {helperContent}
        </div>
      );
    }

    if (field.type === 'select') {
      const options =
        field.key === 'ptero_node_panel_id'
          ? panelOptions.map((option) => ({ value: option.id, label: option.name }))
          : (field.options ?? []).map((option) => ({ value: option, label: getOptionLabel(option) }));

      return (
        <div key={`modal-${field.key}`} className="admin-setting-item">
          <Select
            id={`admin-modal-${field.key}`}
            label={fieldLabel}
            value={String(value ?? '')}
            options={options}
            onChange={(event) => {
              setDraftEntitySettings((prev) => ({ ...prev, [field.key]: event.target.value }));
            }}
          />
          {helperContent}
        </div>
      );
    }

    if (field.type === 'file') {
      return (
        <div key={`modal-${field.key}`} className="admin-setting-item">
          <Input
            id={`admin-modal-${field.key}`}
            label={fieldLabel}
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              const nextFileName = file?.name ?? '';

              if (!file) {
                setDraftEntitySettings((prev) => ({ ...prev, [field.key]: '', game_icon_url: '' }));
                return;
              }

              const reader = new FileReader();
              reader.onload = () => {
                const dataUrl = typeof reader.result === 'string' ? reader.result : '';
                setDraftEntitySettings((prev) => ({
                  ...prev,
                  [field.key]: nextFileName,
                  game_icon_url: dataUrl
                }));
              };
              reader.onerror = () => {
                setDraftEntitySettings((prev) => ({ ...prev, [field.key]: nextFileName }));
              };
              reader.readAsDataURL(file);
            }}
          />
          {String(value ?? '').trim().length > 0 ? (
            <p className="text-muted admin-setting-help">{t('ui.admin.settings.notes.game_icon_selected', { file: String(value) })}</p>
          ) : null}
          {helperContent}
        </div>
      );
    }

    return (
      <div key={`modal-${field.key}`} className="admin-setting-item">
        <Input
          id={`admin-modal-${field.key}`}
          label={fieldLabel}
          type={field.type === 'password' ? 'password' : 'text'}
          value={String(value ?? '')}
          placeholder={isPanelApiKeySecretField ? t('ui.admin.settings.placeholders.ptero_panel_api_key_secret') : undefined}
          onChange={(event) => {
            setDraftEntitySettings((prev) => ({ ...prev, [field.key]: event.target.value }));
          }}
        />
        {isPanelApiKeySecretField ? (
          <p className="text-muted admin-setting-help">{t('ui.admin.settings.notes.ptero_panel_api_key_secret_keep')}</p>
        ) : null}
        {helperContent}
      </div>
    );
  };

  return (
    <div className="page-stack">
      <Card className="admin-tabs">
        {tabOrder.map((item) => (
          <button
            key={item}
            type="button"
            className={`admin-tab ${tab === item ? 'is-active' : ''}`.trim()}
            onClick={() => {
              setTab(item);
            }}
          >
            {t(tabLabelKey[item])}
          </button>
        ))}
      </Card>

      <div className="admin-metrics-grid">
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.admin.metrics.total_items')}</p>
          <p className="admin-metric-value">{isSettingsOnlyTab ? sectionSettingFields[tab].length : rows.length}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.admin.metrics.active_items')}</p>
          <p className="admin-metric-value">{isSettingsOnlyTab ? sectionSettingFields[tab].length : activeRows}</p>
        </Card>
        <Card className="admin-metric-card">
          <p className="text-muted admin-metric-label">{t('ui.admin.metrics.current_scope')}</p>
          <p className="admin-metric-value">{t(tabLabelKey[tab])}</p>
        </Card>
      </div>

      {hasSectionSettings ? (
      <Card className="admin-settings-card">
        <div className="row-between">
          <div>
            <h3 className="section-title">{tab === 'servers' ? t('ui.admin.servers_settings.title') : t('ui.admin.settings.title')}</h3>
            <p className="text-muted admin-section-description">{t(`ui.admin.section_descriptions.${tab}`)}</p>
          </div>
          <Button
            variant="secondary"
            onClick={async () => {
              const scope =
                tab === 'a2s'
                  ? 'a2s'
                  : tab === 'settings'
                    ? 'settings'
                    : tab === 'games'
                      ? 'games'
                      : tab === 'servers'
                        ? 'servers'
                        : tab === 'roles'
                          ? 'roles'
                          : 'alerts';
              const saved = await saveAppSettingsScopeApi(scope, sectionSettings);
              setSectionSettings(saved);
            }}
          >
            {t('ui.admin.settings.save')}
          </Button>
        </div>
        <div className="admin-settings-grid">
          {sectionSettingFields[tab].map((field) => {
            const value = sectionSettings[field.key];
            const fieldLabel = t(`ui.admin.settings.fields.${field.key}`);
            const helperShort = t(`ui.admin.settings.help_short.${field.key}`);
            const helperTooltip = t(`ui.admin.settings.help_tooltip.${field.key}`);

            const helperContent = (
              <div className="admin-setting-help-row">
                <button
                  type="button"
                  className="admin-info-icon"
                  aria-label={t('ui.admin.settings.info_aria', { field: fieldLabel })}
                  data-tooltip={helperTooltip}
                  onClick={(event) => {
                    event.preventDefault();
                  }}
                >
                  i
                </button>
                <p className="text-muted admin-setting-help">{helperShort}</p>
              </div>
            );

            if (field.type === 'static') {
              return (
                <div key={field.key} className="admin-setting-item">
                  <p className="field-label">{fieldLabel}</p>
                </div>
              );
            }

            if (field.type === 'toggle') {
              return (
                <div key={field.key} className="admin-setting-item">
                  <Toggle
                    id={`admin-setting-${field.key}`}
                    label={fieldLabel}
                    checked={Boolean(value)}
                    onChange={(next) => {
                      setSectionSettings((prev) => ({ ...prev, [field.key]: next }));
                    }}
                  />
                  {helperContent}
                </div>
              );
            }

            if (field.type === 'select') {
              const options =
                tab === 'roles' && field.key === 'default_new_user_role'
                  ? roleDefaultOptions
                  : (field.options ?? []).map((option) => ({ value: option, label: getOptionLabel(option) }));

              return (
                <div key={field.key} className="admin-setting-item">
                  <Select
                    id={`admin-setting-${field.key}`}
                    label={fieldLabel}
                    value={String(value ?? '')}
                    options={options}
                    onChange={(event) => {
                      setSectionSettings((prev) => ({ ...prev, [field.key]: event.target.value }));
                    }}
                  />
                  {helperContent}
                </div>
              );
            }

            return (
              <div key={field.key} className="admin-setting-item">
                <Input
                  id={`admin-setting-${field.key}`}
                  label={fieldLabel}
                  value={String(value ?? '')}
                  onChange={(event) => {
                    setSectionSettings((prev) => ({ ...prev, [field.key]: event.target.value }));
                  }}
                />
                {helperContent}
              </div>
            );
          })}
        </div>
        {tab === 'settings' ? (
          <div className="admin-setting-item">
            <p className="field-label">{t('ui.admin.settings.update_status.title')}</p>
            <p className="text-muted admin-setting-help">
              {t('ui.admin.settings.update_status.current', {
                version: currentVersion
              })}
            </p>
            <p className="text-muted admin-setting-help">
              {t('ui.admin.settings.update_status.latest', {
                version: latestVersion || '-'
              })}
            </p>
            <p className="text-muted admin-setting-help">
              {t(
                canManualUpdate
                  ? 'ui.admin.settings.update_status.available'
                  : 'ui.admin.settings.update_status.none'
              )}
            </p>
            {canManualUpdate ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (!manualUpdateUrl) {
                    return;
                  }

                  window.open(manualUpdateUrl, '_blank', 'noopener,noreferrer');
                }}
                disabled={!manualUpdateUrl}
              >
                {t('ui.admin.settings.update_status.manual_update')}
              </Button>
            ) : null}
          </div>
        ) : null}
        {tab === 'servers' ? (
          <div className="admin-setting-item">
            <p className="field-label">{t('ui.admin.servers_settings.presets_from_db')}</p>
            <p className="text-muted admin-setting-help">{t('ui.admin.servers_settings.presets_from_db_help')}</p>
            <div className="admin-permission-badges">
              {serverPresetsForSettings.length > 0 ? (
                serverPresetsForSettings.map((preset) => (
                  <span key={`server-preset-overview-${preset.id}`} className="admin-permission-badge">
                    {preset.name} ({preset.hoster}){preset.is_system ? ' · System' : ''}
                  </span>
                ))
              ) : (
                <span className="text-muted">{t('ui.admin.permissions.empty')}</span>
              )}
            </div>
          </div>
        ) : null}
      </Card>
      ) : null}

      {!isSettingsOnlyTab ? (
        <Card className="admin-entities-card">
          <div className="row-between admin-entities-toolbar">
            <h3 className="section-title">{t('ui.admin.entities.title')}</h3>
            <div className={`admin-entities-toolbar-actions${tab === 'alerts' ? ' is-alerts' : ''}`.trim()}>
              {tab === 'alerts' ? (
                <Select
                  id="admin-alert-entity-filter"
                  label={t('ui.admin.entities.alert_filter')}
                  value={alertEntityFilter}
                  options={[
                    { value: 'all', label: t('ui.admin.entities.alert_filter_options.all') },
                    { value: 'channels', label: t('ui.admin.entities.alert_filter_options.channels') },
                    { value: 'policies', label: t('ui.admin.entities.alert_filter_options.policies') }
                  ]}
                  onChange={(event) => {
                    setAlertEntityFilter(event.target.value as AlertEntityFilter);
                  }}
                />
              ) : null}
              <Input
                id="admin-search"
                label={t('ui.admin.entities.search')}
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                }}
              />
              <Button
                variant="primary"
                disabled={!supportsRealCrud}
                onClick={() => {
                  openCreateModal();
                }}
              >
                {t('ui.admin.create')}
              </Button>
              {tab === 'servers' ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetExternalDraft();
                    setExternalFeedback(null);
                    setIsExternalModalOpen(true);
                  }}
                  aria-label={t('ui.admin.external_server.title')}
                >
                  +
                </Button>
              ) : null}
            </div>
          </div>
          {entityFeedback ? <p className="text-muted admin-setting-help">{entityFeedback}</p> : null}
          <Table
            headers={
              tab === 'roles'
                ? [
                    t('ui.admin.columns.id'),
                    t('ui.admin.columns.name'),
                    t('ui.admin.columns.permissions'),
                    t('ui.admin.columns.status'),
                    t('ui.admin.columns.updated_at'),
                    t('ui.admin.columns.actions')
                  ]
                : tab === 'alerts'
                  ? [
                      t('ui.admin.columns.id'),
                      t('ui.admin.columns.name'),
                      t('ui.admin.columns.type'),
                      t('ui.admin.columns.status'),
                      t('ui.admin.columns.updated_at'),
                      t('ui.admin.columns.actions')
                    ]
                : [
                    t('ui.admin.columns.id'),
                    t('ui.admin.columns.name'),
                    t('ui.admin.columns.status'),
                    t('ui.admin.columns.updated_at'),
                    t('ui.admin.columns.actions')
                  ]
            }
            rows={filteredRows.map((row) => [
              row.id,
              renderNameCell(row),
              ...(tab === 'roles'
                ? [
                    <div key={`${row.id}-permissions`} className="admin-permission-badges">
                      {(row.permissions ?? []).length > 0 ? (
                        (row.permissions ?? []).map((permission) => (
                          <span key={`${row.id}-${permission}`} className="admin-permission-badge">
                            {getPermissionLabel(permission)}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">{t('ui.admin.permissions.empty')}</span>
                      )}
                    </div>
                  ]
                : tab === 'alerts'
                  ? [
                      row.sourceSection === 'policies'
                        ? t('ui.admin.alert_types.policy')
                        : t('ui.admin.alert_types.channel')
                    ]
                : []),
              getOptionLabel(row.status),
              row.updated_at,
              <div key={`${row.id}-actions`} className="admin-row-actions">
                {tab === 'alerts' && row.sourceSection === 'channels' ? (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await sendAlertChannelTestApi(row.id);
                        setEntityFeedback(t('ui.admin.feedback.alert_test_sent', { name: row.name }));
                      } catch (error) {
                        const message = error instanceof Error ? error.message : 'error.api_internal_error';
                        setEntityFeedback(t(message));
                      }
                    }}
                  >
                    {t('ui.admin.actions.send_test')}
                  </Button>
                ) : null}
                <Button
                  variant="secondary"
                  onClick={() => {
                    openEditModal(row);
                  }}
                >
                  {t('ui.admin.actions.edit')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={async () => {
                    const confirmed = confirmDeleteByName(t('ui.admin.actions.delete'), row.name);
                    if (!confirmed) {
                      return;
                    }

                    if (tab === 'panels') {
                      await deletePanelApi(row.id);
                    } else if (tab === 'nodes') {
                      await deleteNodeApi(row.id);
                    } else if (tab === 'games') {
                      await deleteGameLabelApi(row.id);
                    } else if (tab === 'servers') {
                      await deleteServerPresetApi(row.id);
                    } else if (tab === 'roles') {
                      await deleteRoleApi(row.id);
                    } else {
                      return;
                    }
                    await refreshRows();
                  }}
                  disabled={tab === 'servers' && Boolean(row.settings?.server_preset_is_system)}
                >
                  {t('ui.admin.actions.delete')}
                </Button>
              </div>
            ])}
          />
        </Card>
      ) : null}

      {isExternalModalOpen && tab === 'servers' ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('ui.admin.external_server.title')}>
          <Card className="modal-card modal-card-admin">
            <div className="row-between">
              <div>
                <h3 className="section-title">{t('ui.admin.external_server.title')}</h3>
                <p className="text-muted admin-section-description">{t('ui.admin.external_server.description')}</p>
              </div>
              <Button
                variant="ghost"
                className="events-close-icon"
                onClick={() => {
                  setIsExternalModalOpen(false);
                }}
                aria-label={t('ui.admin.modal.close')}
              >
                ×
              </Button>
            </div>
            <div className="admin-external-grid">
              <section className="admin-external-section">
                <p className="admin-external-section-title">{t('ui.admin.external_server.sections.identity')}</p>
                <div className="admin-external-section-fields">
                  <Input
                    id="admin-external-name"
                    label={t('ui.admin.external_server.fields.name')}
                    value={externalName}
                    onChange={(event) => {
                      setExternalName(event.target.value);
                    }}
                  />
                  {renderExternalHelp('name')}
                  <Select
                    id="admin-external-preset"
                    label={t('ui.admin.external_server.fields.preset')}
                    value={externalPresetId}
                    options={[
                      { value: '', label: t('ui.admin.external_server.presets.none') },
                      ...serverPresetOptions.map((preset) => ({ value: preset.id, label: `${preset.name} (${preset.hoster})` }))
                    ]}
                    onChange={(event) => {
                      const presetId = event.target.value;
                      setExternalPresetId(presetId);

                      const preset = serverPresetOptions.find((item) => item.id === presetId);
                      if (!preset) {
                        return;
                      }

                      setExternalHoster(preset.hoster);
                      setExternalProtocol(preset.protocol);

                      if (preset.query_port_mode === 'SAME_AS_GAME' && externalGamePort.trim().length > 0) {
                        setExternalQueryPort(externalGamePort.trim());
                      }
                      if (preset.query_port_mode === 'DISABLED') {
                        setExternalQueryPort('');
                      }
                    }}
                  />
                  {renderExternalHelp('preset')}
                  <Select
                    id="admin-external-hoster"
                    label={t('ui.admin.external_server.fields.hoster')}
                    value={externalHoster}
                    options={[
                      { value: 'GENERIC', label: t('ui.admin.external_server.hosters.generic') },
                      { value: 'GPORTAL', label: t('ui.admin.external_server.hosters.gportal') },
                      { value: 'NITRADO', label: t('ui.admin.external_server.hosters.nitrado') },
                      { value: 'SHOCKBYTE', label: t('ui.admin.external_server.hosters.shockbyte') },
                      { value: 'APEX', label: t('ui.admin.external_server.hosters.apex') },
                      { value: 'BISECT', label: t('ui.admin.external_server.hosters.bisect') },
                      { value: 'HOSTHAVOC', label: t('ui.admin.external_server.hosters.hosthavoc') },
                      { value: 'SURVIVAL_SERVERS', label: t('ui.admin.external_server.hosters.survival_servers') }
                    ]}
                    onChange={(event) => {
                      const nextHoster =
                        event.target.value === 'GPORTAL' ||
                        event.target.value === 'NITRADO' ||
                        event.target.value === 'SHOCKBYTE' ||
                        event.target.value === 'APEX' ||
                        event.target.value === 'BISECT' ||
                        event.target.value === 'HOSTHAVOC' ||
                        event.target.value === 'SURVIVAL_SERVERS'
                          ? event.target.value
                          : 'GENERIC';

                      setExternalHoster(nextHoster);

                      if (nextHoster === 'GPORTAL' || nextHoster === 'NITRADO') {
                        setExternalProtocol('UDP');
                        if (externalGamePort.trim().length > 0 && externalQueryPort.trim().length === 0) {
                          setExternalQueryPort(externalGamePort.trim());
                        }
                      }
                    }}
                  />
                  {renderExternalHelp('hoster')}
                  <Select
                    id="admin-external-game-label"
                    label={t('ui.admin.external_server.fields.game_label')}
                    value={externalGameLabel}
                    options={externalGameLabelOptions}
                    onChange={(event) => {
                      setExternalGameLabel(event.target.value);
                    }}
                  />
                  {renderExternalHelp('game_label')}
                </div>
              </section>

              <section className="admin-external-section">
                <p className="admin-external-section-title">{t('ui.admin.external_server.sections.connectivity')}</p>
                <div className="admin-external-section-fields">
                  <Input
                    id="admin-external-host"
                    label={t('ui.admin.external_server.fields.host')}
                    value={externalHost}
                    onChange={(event) => {
                      setExternalHost(event.target.value);
                    }}
                  />
                  {renderExternalHelp('host')}
                  <Input
                    id="admin-external-game-port"
                    label={t('ui.admin.external_server.fields.game_port')}
                    value={externalGamePort}
                    onChange={(event) => {
                      const value = event.target.value;
                      setExternalGamePort(value);

                      if ((externalHoster === 'GPORTAL' || externalHoster === 'NITRADO') && externalQueryPort.trim().length === 0) {
                        setExternalQueryPort(value.trim());
                      }
                    }}
                  />
                  {renderExternalHelp('game_port')}
                  <Input
                    id="admin-external-query-port"
                    label={t('ui.admin.external_server.fields.query_port')}
                    value={externalQueryPort}
                    onChange={(event) => {
                      setExternalQueryPort(event.target.value);
                    }}
                  />
                  {renderExternalHelp('query_port')}
                  <Select
                    id="admin-external-protocol"
                    label={t('ui.admin.external_server.fields.protocol')}
                    value={externalProtocol}
                    options={[
                      { value: 'UDP', label: 'UDP' },
                      { value: 'TCP', label: 'TCP' }
                    ]}
                    onChange={(event) => {
                      setExternalProtocol(event.target.value === 'TCP' ? 'TCP' : 'UDP');
                    }}
                  />
                  {renderExternalHelp('protocol')}
                </div>
              </section>
            </div>
            <div className="row-between">
              {externalFeedback ? <p className="text-muted">{externalFeedback}</p> : <div />}
              <Button
                variant="primary"
                onClick={() => {
                  void handleCreateExternalServer();
                }}
                disabled={externalName.trim().length === 0 || externalHost.trim().length === 0 || externalGamePort.trim().length === 0}
              >
                {t('ui.admin.external_server.actions.create')}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}

      {isModalOpen && !isSettingsOnlyTab ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={t('ui.admin.modal_title')}>
          <Card className="modal-card modal-card-admin">
            <div className="row-between">
              <h3 className="section-title">{editingRowId ? t('ui.admin.modal.edit_title') : t('ui.admin.modal.create_title')}</h3>
              <Button variant="ghost" className="events-close-icon" onClick={closeModal} aria-label={t('ui.admin.modal.close')}>
                ×
              </Button>
            </div>
            <div className="form-grid admin-modal-grid">
              <Input
                id="admin-draft-name"
                label={t('ui.admin.form.name')}
                value={draftName}
                onChange={(event) => {
                  setDraftName(event.target.value);
                }}
              />
              <Select
                id="admin-draft-status"
                label={t('ui.admin.form.status')}
                value={draftStatus}
                options={sectionStatusOptions[tab].map((statusOption) => ({ value: statusOption, label: getOptionLabel(statusOption) }))}
                onChange={(event) => {
                  setDraftStatus(event.target.value);
                }}
              />
              {tab === 'alerts' ? (
                <Select
                  id="admin-draft-alert-type"
                  label={t('ui.admin.form.alert_type')}
                  value={draftAlertType}
                  options={[
                    { value: 'channels', label: t('ui.admin.alert_types.channel') },
                    { value: 'policies', label: t('ui.admin.alert_types.policy') }
                  ]}
                  onChange={(event) => {
                    setDraftAlertType(event.target.value as 'channels' | 'policies');
                  }}
                />
              ) : null}
              {tab === 'alerts' && draftAlertType === 'channels' ? (
                <div className="admin-alert-form-section">
                  <Input
                    id="admin-alert-channel-config"
                    label={t('ui.admin.form.alert_channel_config')}
                    value={String(draftEntitySettings.alert_channel_config_enc ?? '')}
                    onChange={(event) => {
                      setDraftEntitySettings((prev) => ({ ...prev, alert_channel_config_enc: event.target.value }));
                    }}
                  />
                  <p className="text-muted admin-setting-help">{t('ui.admin.alert_form.channel_config_help')}</p>
                </div>
              ) : null}
              {tab === 'alerts' && draftAlertType === 'policies' ? (
                <div className="admin-alert-form-section">
                  <Input
                    id="admin-alert-policy-cooldown"
                    label={t('ui.admin.form.alert_policy_cooldown')}
                    value={String(draftEntitySettings.alert_cooldown_seconds ?? '300')}
                    onChange={(event) => {
                      setDraftEntitySettings((prev) => ({ ...prev, alert_cooldown_seconds: event.target.value }));
                    }}
                  />
                  <p className="text-muted admin-setting-help">{t('ui.admin.alert_form.policy_cooldown_help')}</p>
                  <div className="admin-role-permissions">
                    <div className="row-between admin-role-permissions-head">
                      <span className="field-label">{t('ui.admin.form.alert_policy_channels')}</span>
                    </div>
                    <div className="admin-role-permissions-section-list">
                      {alertChannelOptions.length > 0 ? (
                        alertChannelOptions.map((channel) => {
                          const selected = parseChannelIds(String(draftEntitySettings.alert_policy_channel_ids ?? ''));
                          const checked = selected.includes(channel.id);

                          return (
                            <label key={channel.id} className="admin-permission-option">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => {
                                  const next = checked
                                    ? selected.filter((item) => item !== channel.id)
                                    : [...selected, channel.id];

                                  setDraftEntitySettings((prev) => ({
                                    ...prev,
                                    alert_policy_channel_ids: next.join(',')
                                  }));
                                }}
                              />
                              <span>{channel.name}</span>
                            </label>
                          );
                        })
                      ) : (
                        <span className="text-muted">{t('ui.admin.alert_form.policy_channels_empty')}</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}
              {tab === 'roles' ? (
                <div className="admin-role-permissions">
                  <div className="row-between admin-role-permissions-head">
                    <span className="field-label">{t('ui.admin.form.permissions')}</span>
                    <div className="admin-role-permissions-actions">
                      <button
                        type="button"
                        className="admin-mini-action"
                        onClick={() => {
                          setDraftPermissions(rolePermissionOptions.map((option) => option.id));
                        }}
                      >
                        {t('ui.admin.permissions.select_all')}
                      </button>
                      <button
                        type="button"
                        className="admin-mini-action"
                        onClick={() => {
                          setDraftPermissions([]);
                        }}
                      >
                        {t('ui.admin.permissions.clear')}
                      </button>
                    </div>
                  </div>
                  <div className="admin-role-permissions-grid">
                    {rolePermissionColumns.map((groups, columnIndex) => (
                      <div key={`permission-column-${columnIndex}`} className="admin-role-permissions-column">
                        {groups.map((group) => {
                          const options = rolePermissionOptions.filter((option) => option.group === group);
                          if (options.length === 0) {
                            return null;
                          }

                          return (
                            <section key={group} className="admin-role-permissions-section">
                              <p className="admin-role-permissions-section-title">
                                {t(`ui.admin.permissions.groups.${group}`)}
                              </p>
                              <div className="admin-role-permissions-section-list">
                                {options.map((option) => {
                                  const checked = draftPermissions.includes(option.id);
                                  return (
                                    <label key={option.id} className="admin-permission-option">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => {
                                          setDraftPermissions((previous) =>
                                            previous.includes(option.id)
                                              ? previous.filter((item) => item !== option.id)
                                              : [...previous, option.id]
                                          );
                                        }}
                                      />
                                      <span>{t(`ui.admin.permission_options.${option.key}`)}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            </section>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {(tab === 'panels' || tab === 'nodes' || tab === 'servers' || tab === 'games') ? (
                <div className={`admin-entity-modal-sections is-${tab}`}>
                  {(entityModalGroups[tab] ?? []).map((group) => (
                    <section
                      key={group.labelKey}
                      className={`admin-entity-modal-section is-${group.labelKey.replace('ui.admin.modal_groups.', '')}`}
                    >
                      <p className="admin-entity-modal-section-title">{t(group.labelKey)}</p>
                      <div className="admin-entity-modal-section-fields">
                        {group.fields.map((field) => renderEntityField(field))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="row-between">
              <Button
                variant="secondary"
                onClick={closeModal}
              >
                {t('ui.admin.cancel')}
              </Button>
              <div className="admin-entities-toolbar-actions">
                {(tab === 'panels' || tab === 'nodes') ? (
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      await runDraftValidation();
                    }}
                  >
                    {t('ui.admin.actions.validate_connection')}
                  </Button>
                ) : null}
                <Button
                  variant="primary"
                  onClick={async () => {
                    const input = {
                      name: draftName.trim(),
                      status: draftStatus,
                      permissions: tab === 'roles' ? draftPermissions : undefined,
                      settings: tab === 'panels' || tab === 'nodes' || tab === 'games' ? draftEntitySettings : undefined
                    };

                    if (input.name.length === 0) {
                      return;
                    }

                    try {
                      if (tab === 'panels') {
                        const panelPayload = {
                          name: input.name,
                          base_url: String(draftEntitySettings.ptero_panel_url ?? '').trim(),
                          api_key: String(draftEntitySettings.ptero_panel_api_key_secret ?? '').trim(),
                          is_enabled: /active|enabled/i.test(input.status)
                        };

                        if (!panelPayload.base_url) {
                          return;
                        }

                        const panelValidation = await runDraftValidation();
                        if (!panelValidation.ok) {
                          return;
                        }

                        const savedPanel = editingRowId
                          ? await updatePanelApi(editingRowId, panelPayload)
                          : await createPanelApi(panelPayload);

                        await syncPanelApi(savedPanel.id);
                      } else if (tab === 'nodes') {
                        const panelIdFromDraft = String(draftEntitySettings.ptero_node_panel_id ?? '').trim();
                        const selectedPanelId = panelIdFromDraft || panelOptions[0]?.id;
                        const identifierKeyRaw = String(draftEntitySettings.ptero_node_identifier_key ?? 'ptero_node_id').trim();
                        const identifierKey: 'ptero_node_id' | 'name' | 'fqdn' =
                          identifierKeyRaw === 'name' || identifierKeyRaw === 'fqdn' || identifierKeyRaw === 'ptero_node_id'
                            ? identifierKeyRaw
                            : 'ptero_node_id';
                        const pteroNodeId = String(draftEntitySettings.ptero_node_identifier_value ?? '').trim();

                        if (!selectedPanelId || !pteroNodeId) {
                          return;
                        }

                        const nodeValidation = await runDraftValidation();
                        if (!nodeValidation.ok) {
                          return;
                        }

                        const nodePayload = {
                          panel_id: selectedPanelId,
                          ptero_node_id: nodeValidation.resolvedNodeId ?? pteroNodeId,
                          name: input.name,
                          fqdn_or_ip: String(draftEntitySettings.ptero_node_fqdn_or_ip ?? '').trim() || null,
                          location: String(draftEntitySettings.ptero_node_location ?? '').trim() || null,
                          is_enabled: /online|active|enabled/i.test(input.status),
                          identifier_key: identifierKey,
                          identifier_value: pteroNodeId
                        };

                        if (editingRowId) {
                          await updateNodeApi(editingRowId, nodePayload);
                        } else {
                          await createNodeApi(nodePayload);
                        }
                      } else if (tab === 'games') {
                        const gamePayload = {
                          name: input.name,
                          is_enabled: /active|enabled/i.test(input.status),
                          settings: draftEntitySettings as Record<string, unknown>
                        };

                        if (editingRowId) {
                          await updateGameLabelApi(editingRowId, gamePayload);
                        } else {
                          await createGameLabelApi(gamePayload);
                        }
                      } else if (tab === 'alerts') {
                        if (draftAlertType === 'channels') {
                          const channelConfig = String(draftEntitySettings.alert_channel_config_enc ?? '').trim();
                          if (!editingRowId && channelConfig.length === 0) {
                            setValidationFeedback(t('error.api_validation_error'));
                            return;
                          }

                          const channelPayload = {
                            name: input.name,
                            is_enabled: /active|enabled/i.test(input.status),
                            config_enc: channelConfig,
                            type: 'DISCORD_WEBHOOK' as const
                          };

                          if (editingRowId && rowById(editingRowId, rows)?.sourceSection === 'channels') {
                            const updatePayload: Partial<{ name: string; is_enabled: boolean; config_enc: string }> = {
                              name: channelPayload.name,
                              is_enabled: channelPayload.is_enabled
                            };

                            if (channelConfig.length > 0) {
                              updatePayload.config_enc = channelConfig;
                            }

                            await updateAlertChannelApi(editingRowId, updatePayload);
                          } else {
                            await createAlertChannelApi(channelPayload);
                          }
                        } else {
                          const selectedChannelIds = parseChannelIds(String(draftEntitySettings.alert_policy_channel_ids ?? ''));
                          if (selectedChannelIds.length === 0) {
                            setValidationFeedback(t('error.api_validation_error'));
                            return;
                          }

                          const policyPayload = {
                            name: input.name,
                            channel_ids: selectedChannelIds,
                            cooldown_seconds: Number(draftEntitySettings.alert_cooldown_seconds ?? 300) || 300,
                            is_enabled: /active|enabled/i.test(input.status)
                          };

                          if (editingRowId && rowById(editingRowId, rows)?.sourceSection === 'policies') {
                            await updateAlertPolicyApi(editingRowId, {
                              name: policyPayload.name,
                              channel_ids: policyPayload.channel_ids,
                              cooldown_seconds: policyPayload.cooldown_seconds,
                              is_enabled: policyPayload.is_enabled
                            });
                          } else {
                            await createAlertPolicyApi(policyPayload);
                          }
                        }
                      } else if (tab === 'roles') {
                        const roleKey = String(draftEntitySettings.role_key ?? draftName)
                          .trim()
                          .toUpperCase()
                          .replace(/[^A-Z0-9]+/g, '_')
                          .replace(/^_+|_+$/g, '');

                        if (editingRowId) {
                          await updateRoleApi(editingRowId, {
                            name: input.name,
                            key: roleKey || undefined,
                            permissions: draftPermissions
                          });
                        } else {
                          await createRoleApi({
                            name: input.name,
                            key: roleKey || undefined,
                            permissions: draftPermissions
                          });
                        }
                      } else if (tab === 'servers') {
                        const presetPayload = {
                          key: String(draftEntitySettings.server_preset_key ?? draftName)
                            .trim()
                            .toUpperCase()
                            .replace(/[^A-Z0-9]+/g, '_')
                            .replace(/^_+|_+$/g, ''),
                          name: input.name,
                          hoster: String(draftEntitySettings.server_preset_hoster ?? 'GENERIC') as ServerHoster,
                          protocol: (String(draftEntitySettings.server_preset_protocol ?? 'UDP') === 'TCP' ? 'TCP' : 'UDP') as
                            | 'TCP'
                            | 'UDP',
                          query_port_mode: (
                            String(draftEntitySettings.server_preset_query_port_mode ?? 'SAME_AS_GAME')
                          ) as 'SAME_AS_GAME' | 'MANUAL_OPTIONAL' | 'DISABLED',
                          prefer_a2s: Boolean(draftEntitySettings.server_preset_prefer_a2s),
                          notes: String(draftEntitySettings.server_preset_notes ?? '').trim() || null
                        };

                        if (editingRowId) {
                          await updateServerPresetApi(editingRowId, presetPayload);
                        } else {
                          await createServerPresetApi(presetPayload);
                        }
                      } else {
                        return;
                      }

                      await refreshRows();
                      closeModal();
                    } catch (error) {
                      const message = error instanceof Error ? error.message : 'error.api_internal_error';
                      setValidationFeedback(t(message));
                    }
                  }}
                  disabled={draftName.trim().length === 0}
                >
                  {t('ui.admin.save')}
                </Button>
              </div>
            </div>
            {validationFeedback ? <p className="text-muted">{validationFeedback}</p> : null}
          </Card>
        </div>
      ) : null}
    </div>
  );
};
