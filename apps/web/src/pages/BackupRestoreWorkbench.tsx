import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Checkbox, Descriptions, Form, Input, InputNumber, Select, Space, Table, Tabs, Tag, Typography, message } from 'antd';
import { AuditOutlined, CloudDownloadOutlined, DatabaseOutlined, PlayCircleOutlined, ReloadOutlined, SafetyCertificateOutlined } from '@ant-design/icons';
import { api } from '../api';
import { useAppContext } from '../context/AppContext';

const { Text, Title } = Typography;

type DeploymentConfigResponse = {
  restoreDrill: {
    enabled: boolean;
    silentSandbox: boolean;
    outboundBlocked: boolean;
    blockedChannels: string[];
    envVar: string | null;
  };
};

type BackupJob = {
  id: string;
  accountSetId: string;
  backupType: string;
  status: string;
  dryRun: boolean;
  businessMutation: boolean;
  includeAttachments: boolean;
  retentionDays: number | null;
  requestedBy: string;
  createdAt: string;
  completedAt: string;
  snapshotRef: string;
  checksum: string;
  manifest: {
    accountSetCode: string;
    tableCounts: Record<string, number>;
  };
  attachmentHashVerification: {
    status: string;
    attachmentCount: number;
    verifiedCount: number;
    failedCount: number;
  };
};

type RestoreJob = {
  id: string;
  accountSetId: string;
  sourceBackupJobId: string;
  status: string;
  dryRun: boolean;
  restoreMode: string;
  targetEnvironment: string;
  restorePointLabel: string | null;
  requestedBy: string;
  createdAt: string;
  completedAt: string;
  businessMutation: boolean;
  outboundBlocked: boolean;
  blockedChannels: string[];
  impactScope: {
    accountSetId: string;
    accountSetCode: string;
    sourceBackupJobId: string;
    tableCounts: Record<string, number>;
  };
  validation: {
    status: string;
    backupChecksum: string;
    attachmentHashVerification: string;
  };
};

type MigrationJob = {
  id: string;
  accountSetId: string;
  jobType: string;
  sourceType: string;
  targetObjectType: string;
  status: string;
  dryRun: boolean;
  businessMutation: boolean;
  sourceSummary: {
    rowCount: number;
    columns: string[];
  };
  fieldMapping: Record<string, string>;
  validation: {
    status: string;
    rowCount?: number;
    requiredFields?: string[];
    errors?: Array<{ rowIndex: number; field: string; message: string }>;
    trialBalance?: {
      debit: number;
      credit: number;
      difference: number;
    };
  } | null;
  errorReport: unknown;
  importSummary: {
    status?: string;
    importedRows?: number;
    fiscalYear?: number;
    periodNo?: number;
  } | null;
  createdAt: string;
  completedAt: string | null;
};

type SecurityEvent = {
  id: string;
  accountSetId: string | null;
  eventType: string;
  severity: string;
  actorId: string;
  objectType: string | null;
  objectId: string | null;
  message: string;
  payload: Record<string, unknown>;
  createdAt: string;
};

const defaultMigrationRows = [
  { accountCode: '1001', debit: 0, credit: 0 },
  { accountCode: '2001', debit: 0, credit: 0 },
];

const defaultMigrationFieldMapping = {
  accountCode: 'accountCode',
  debit: 'debit',
  credit: 'credit',
};

const defaultPartnerMigrationRows = [
  {
    legacyCode: 'S-001',
    partnerName: '示例供应商',
    type: 'supplier',
    taxRate: 0.13,
    creditLimit: 0,
    paymentTerms: '30D',
    settlementMethod: 'bank',
    enabled: true,
  },
  {
    legacyCode: 'C-001',
    partnerName: '示例客户',
    type: 'customer',
    taxRate: 0.06,
    creditLimit: 5000,
    paymentTerms: 'COD',
    settlementMethod: 'bank',
    enabled: true,
  },
];

const defaultPartnerMigrationFieldMapping = {
  code: 'legacyCode',
  name: 'partnerName',
  partnerType: 'type',
  taxRate: 'taxRate',
  creditLimit: 'creditLimit',
  paymentTerms: 'paymentTerms',
  settlementMethod: 'settlementMethod',
  isEnabled: 'enabled',
};

const defaultInventoryItemMigrationRows = [
  {
    legacySku: 'RM-001',
    itemName: '示例原材料',
    uom: 'kg',
    category: 'raw',
    itemType: 'raw_material',
    costMethod: 'fifo',
    batchManaged: true,
    manufactured: false,
  },
  {
    legacySku: 'FG-001',
    itemName: '示例产成品',
    uom: 'pcs',
    category: 'finished',
    itemType: 'finished_good',
    costMethod: 'moving_average',
    batchManaged: false,
    manufactured: true,
  },
];

const defaultInventoryItemMigrationFieldMapping = {
  code: 'legacySku',
  name: 'itemName',
  unit: 'uom',
  category: 'category',
  itemType: 'itemType',
  costMethod: 'costMethod',
  isBatchManaged: 'batchManaged',
  isManufactured: 'manufactured',
};

const jsonPretty = (value: unknown) => JSON.stringify(value, null, 2);

const statusColor = (status?: string) => {
  if (status === 'completed' || status === 'dry_run_completed' || status === 'passed' || status === 'imported') return 'green';
  if (status === 'failed' || status === 'validation_failed') return 'red';
  if (status === 'created' || status === 'pending') return 'gold';
  if (status === 'skipped') return 'default';
  return 'blue';
};

const severityColor = (severity?: string) => {
  if (severity === 'high' || severity === 'critical') return 'red';
  if (severity === 'medium') return 'orange';
  if (severity === 'low') return 'blue';
  return 'default';
};

const zhStatus = (status?: string) => {
  const text: Record<string, string> = {
    completed: '已完成',
    dry_run_completed: '演练完成',
    imported: '已导入',
    validation_failed: '校验失败',
    created: '已创建',
    pending: '待处理',
    full: '全量',
    incremental: '增量',
    opening_balance: '期初余额',
    partner: '伙伴档案',
    partner_master: '伙伴档案',
    inventory_item: '存货档案',
    inventory_item_master: '存货档案',
    excel: 'Excel',
    csv: 'CSV',
    legacy_erp: '旧 ERP',
    silent_sandbox: '静默沙箱',
    restore_drill: '恢复演练',
    completed_empty: '无附件',
    skipped: '已跳过',
    passed: '通过',
    failed: '失败',
    permission_denied: '权限拒绝',
    idempotency_scope_mismatch: '幂等范围冲突',
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  };
  return text[status ?? ''] ?? status ?? '-';
};

const rowCountTotal = (tableCounts?: Record<string, number>) =>
  Object.values(tableCounts ?? {}).reduce((sum, value) => sum + Number(value ?? 0), 0);

const parseJsonInput = (value: unknown, fallback: unknown, label: string) => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} 必须是合法 JSON。`);
  }
};

export const BackupRestoreWorkbench: React.FC = () => {
  const [backupForm] = Form.useForm();
  const [restoreForm] = Form.useForm();
  const [migrationForm] = Form.useForm();
  const [migrationImportForm] = Form.useForm();
  const { currentAccountSetId, currentAccountSetName, currentUser } = useAppContext();
  const [deploymentConfig, setDeploymentConfig] = useState<DeploymentConfigResponse | null>(null);
  const [backupJobs, setBackupJobs] = useState<BackupJob[]>([]);
  const [restoreJobs, setRestoreJobs] = useState<RestoreJob[]>([]);
  const [migrationJobs, setMigrationJobs] = useState<MigrationJob[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const backupOptions = useMemo(
    () =>
      backupJobs.map((job) => ({
        value: job.id,
        label: `${zhStatus(job.backupType)} · ${job.snapshotRef}`,
      })),
    [backupJobs],
  );

  const applyMigrationTemplate = useCallback(
    (jobType: string) => {
      const isPartnerMaster = jobType === 'partner_master';
      const isInventoryItemMaster = jobType === 'inventory_item_master';
      migrationForm.setFieldsValue({
        jobType,
        sourceType: isPartnerMaster || isInventoryItemMaster ? 'legacy_erp' : 'excel',
        targetObjectType: isPartnerMaster ? 'partner' : isInventoryItemMaster ? 'inventory_item' : 'opening_balance',
        sourceRows: jsonPretty(
          isPartnerMaster ? defaultPartnerMigrationRows : isInventoryItemMaster ? defaultInventoryItemMigrationRows : defaultMigrationRows,
        ),
        fieldMapping: jsonPretty(
          isPartnerMaster
            ? defaultPartnerMigrationFieldMapping
            : isInventoryItemMaster
              ? defaultInventoryItemMigrationFieldMapping
              : defaultMigrationFieldMapping,
        ),
      });
    },
    [migrationForm],
  );

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    setLoading(true);
    try {
      const [config, backups, restores, migrations, security] = await Promise.all([
        api.get('/deployment/config'),
        api.get(`/ops/backups?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
        api.get(`/ops/restores?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
        api.get(`/ops/migrations/jobs?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
        api.get(`/security/events?accountSetId=${encodeURIComponent(currentAccountSetId)}`),
      ]);
      setDeploymentConfig(config);
      setBackupJobs(backups?.items ?? []);
      setRestoreJobs(restores?.items ?? []);
      setMigrationJobs(migrations?.items ?? []);
      setSecurityEvents(security?.items ?? []);
      const currentBackupJobId = restoreForm.getFieldValue('backupJobId');
      const firstBackupJobId = backups?.items?.[0]?.id;
      if (!currentBackupJobId && firstBackupJobId) {
        restoreForm.setFieldValue('backupJobId', firstBackupJobId);
      }
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [currentAccountSetId, restoreForm]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const createBackup = async () => {
    if (!currentAccountSetId) return;
    const values = await backupForm.validateFields();
    setSubmitting(true);
    try {
      await api.post('/ops/backups', {
        accountSetId: currentAccountSetId,
        backupType: values.backupType,
        includeAttachments: values.includeAttachments,
        retentionDays: values.retentionDays,
        requestedBy: currentUser,
      });
      message.success('备份任务已创建。');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const runRestoreDrill = async () => {
    if (!currentAccountSetId) return;
    const values = await restoreForm.validateFields();
    setSubmitting(true);
    try {
      await api.post('/ops/restores/execute', {
        accountSetId: currentAccountSetId,
        backupJobId: values.backupJobId,
        dryRun: true,
        targetEnvironment: 'restore_drill',
        restorePointLabel: values.restorePointLabel,
        requestedBy: currentUser,
      });
      message.success('恢复演练 dry-run 已完成。');
      await fetchData();
    } catch (error: any) {
      if (error?.data?.code === 'RESTORE_DRILL_REQUIRED') {
        message.error(error.message);
      } else {
        message.error(error.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const createMigrationJob = async () => {
    if (!currentAccountSetId) return;
    const values = await migrationForm.validateFields();
    let sourceRows: unknown;
    let fieldMapping: unknown;
    try {
      sourceRows = parseJsonInput(values.sourceRows, defaultMigrationRows, '源数据行');
      fieldMapping = parseJsonInput(values.fieldMapping, defaultMigrationFieldMapping, '字段映射');
      if (!Array.isArray(sourceRows)) throw new Error('源数据行必须是 JSON 数组。');
      if (!fieldMapping || Array.isArray(fieldMapping) || typeof fieldMapping !== 'object') throw new Error('字段映射必须是 JSON 对象。');
    } catch (error: any) {
      message.error(error.message);
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/ops/migrations/jobs', {
        accountSetId: currentAccountSetId,
        jobType: values.jobType,
        sourceType: values.sourceType,
        targetObjectType: values.targetObjectType,
        sourceRows,
        fieldMapping,
        requestedBy: currentUser,
      });
      message.success('迁移任务已创建。');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const runMigrationDryRun = async (job: MigrationJob) => {
    setSubmitting(true);
    try {
      await api.post(`/ops/migrations/jobs/${encodeURIComponent(job.id)}/dry-run`, {
        requestedBy: currentUser,
      });
      message.success('迁移 dry-run 校验已完成。');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const runMigrationImport = async (job: MigrationJob) => {
    const values = await migrationImportForm.validateFields();
    setSubmitting(true);
    try {
      await api.post(`/ops/migrations/jobs/${encodeURIComponent(job.id)}/import`, {
        fiscalYear: values.fiscalYear,
        periodNo: values.periodNo,
        requestedBy: currentUser,
      });
      message.success('迁移任务已正式导入。');
      await fetchData();
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  const backupRestorePane = (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <Alert
        type={deploymentConfig?.restoreDrill.enabled ? 'success' : 'warning'}
        showIcon
        title={deploymentConfig?.restoreDrill.enabled ? '恢复演练静默沙箱已启用' : '恢复演练静默沙箱未启用'}
        description={
          deploymentConfig?.restoreDrill.enabled
            ? `外发通道已阻断：${deploymentConfig.restoreDrill.blockedChannels.join(', ')}`
            : '执行恢复演练前，请在测试环境设置 RESTORE_DRILL=true 或 AIS_RESTORE_DRILL=true。'
        }
      />

      <Descriptions bordered column={4} size="small">
        <Descriptions.Item label="当前账套">{currentAccountSetName || currentAccountSetId || '-'}</Descriptions.Item>
        <Descriptions.Item label="静默沙箱">
          <Tag color={deploymentConfig?.restoreDrill.enabled ? 'green' : 'orange'}>
            {deploymentConfig?.restoreDrill.enabled ? '已启用' : '未启用'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="外发阻断">
          <Tag color={deploymentConfig?.restoreDrill.outboundBlocked ? 'green' : 'red'}>
            {deploymentConfig?.restoreDrill.outboundBlocked ? '已阻断' : '未阻断'}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="阻断通道">{deploymentConfig?.restoreDrill.blockedChannels.join(', ') || '-'}</Descriptions.Item>
      </Descriptions>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 420px) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 16, width: '100%' }}>
          <Card title="创建备份任务" size="small">
            <Form
              form={backupForm}
              layout="vertical"
              initialValues={{
                backupType: 'full',
                includeAttachments: true,
                retentionDays: 30,
              }}
            >
              <Form.Item name="backupType" label="备份类型" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'full', label: '全量备份' },
                    { value: 'incremental', label: '增量备份' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="includeAttachments" valuePropName="checked">
                <Checkbox>包含附件 Hash 校验</Checkbox>
              </Form.Item>
              <Form.Item name="retentionDays" label="保留天数">
                <InputNumber min={1} style={{ width: '100%' }} />
              </Form.Item>
              <Button
                data-testid="backup-restore-create-backup"
                type="primary"
                icon={<CloudDownloadOutlined />}
                loading={submitting}
                disabled={!currentAccountSetId}
                onClick={createBackup}
              >
                创建备份
              </Button>
            </Form>
          </Card>

          <Card title="恢复演练 dry-run" size="small">
            <Form
              form={restoreForm}
              layout="vertical"
              initialValues={{
                targetEnvironment: 'restore_drill',
                restorePointLabel: 'phase6-restore-drill',
              }}
            >
              <Form.Item name="backupJobId" label="源备份任务" rules={[{ required: true }]}>
                <Select options={backupOptions} placeholder="请选择备份任务" />
              </Form.Item>
              <Form.Item name="targetEnvironment" label="目标环境">
                <Input disabled value="restore_drill" />
              </Form.Item>
              <Form.Item name="restorePointLabel" label="演练标签">
                <Input />
              </Form.Item>
              <Button
                data-testid="backup-restore-run-drill"
                icon={<SafetyCertificateOutlined />}
                loading={submitting}
                disabled={!currentAccountSetId || backupOptions.length === 0}
                onClick={runRestoreDrill}
              >
                执行恢复演练
              </Button>
            </Form>
          </Card>
        </div>

        <Table
          rowKey="id"
          size="small"
          loading={loading}
          dataSource={backupJobs}
          pagination={{ pageSize: 5 }}
          columns={[
            { title: '备份任务', dataIndex: 'id', ellipsis: true },
            { title: '类型', dataIndex: 'backupType', render: (value: string) => zhStatus(value) },
            { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusColor(value)}>{zhStatus(value)}</Tag> },
            { title: '业务行数', render: (_, row) => rowCountTotal(row.manifest.tableCounts) },
            {
              title: '附件校验',
              dataIndex: 'attachmentHashVerification',
              render: (value: BackupJob['attachmentHashVerification']) => (
                <Tag color={statusColor(value.status)}>
                  {zhStatus(value.status)} · {value.verifiedCount}/{value.attachmentCount}
                </Tag>
              ),
            },
            { title: 'Checksum', dataIndex: 'checksum', ellipsis: true },
          ]}
        />
      </div>

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={restoreJobs}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: '恢复任务', dataIndex: 'id', ellipsis: true },
          { title: '源备份', dataIndex: 'sourceBackupJobId', ellipsis: true },
          { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusColor(value)}>{zhStatus(value)}</Tag> },
          { title: '模式', dataIndex: 'restoreMode', render: (value: string) => zhStatus(value) },
          {
            title: '外发阻断',
            dataIndex: 'outboundBlocked',
            render: (value: boolean, row) => (
              <Space size={4} wrap>
                <Tag color={value ? 'green' : 'red'}>{value ? '已阻断' : '未阻断'}</Tag>
                <Text type="secondary">{row.blockedChannels.join(', ')}</Text>
              </Space>
            ),
          },
          { title: '影响范围', dataIndex: 'impactScope', render: (value: RestoreJob['impactScope']) => `${value.accountSetCode} · ${rowCountTotal(value.tableCounts)} 行` },
          { title: '校验', dataIndex: ['validation', 'status'], render: (value: string) => <Tag color={statusColor(value)}>{zhStatus(value)}</Tag> },
        ]}
      />
    </div>
  );

  const migrationPane = (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <Alert
        type="info"
        showIcon
        title="迁移任务先 dry-run 校验，再允许正式导入。当前前端默认支持期初余额迁移。"
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 460px) 1fr', gap: 16, alignItems: 'start' }}>
        <Card title="创建迁移任务" size="small">
          <Form
            form={migrationForm}
            layout="vertical"
            initialValues={{
              jobType: 'opening_balance',
              sourceType: 'excel',
              targetObjectType: 'opening_balance',
              sourceRows: jsonPretty(defaultMigrationRows),
              fieldMapping: jsonPretty(defaultMigrationFieldMapping),
            }}
          >
            <Space size={8} style={{ width: '100%' }} align="start">
              <Form.Item name="jobType" label="任务类型" rules={[{ required: true }]} style={{ minWidth: 136 }}>
                <Select
                  options={[
                    { value: 'opening_balance', label: '期初余额' },
                    { value: 'partner_master', label: '伙伴档案' },
                    { value: 'inventory_item_master', label: '存货档案' },
                  ]}
                  onChange={applyMigrationTemplate}
                />
              </Form.Item>
              <Form.Item name="sourceType" label="来源" rules={[{ required: true }]} style={{ minWidth: 112 }}>
                <Select
                  options={[
                    { value: 'excel', label: 'Excel' },
                    { value: 'csv', label: 'CSV' },
                    { value: 'legacy_erp', label: '旧 ERP' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="targetObjectType" label="目标对象" rules={[{ required: true }]} style={{ minWidth: 136 }}>
                <Select
                  options={[
                    { value: 'opening_balance', label: '期初余额' },
                    { value: 'partner', label: '伙伴档案' },
                    { value: 'inventory_item', label: '存货档案' },
                  ]}
                />
              </Form.Item>
            </Space>
            <Form.Item name="sourceRows" label="源数据行 JSON" rules={[{ required: true }]}>
              <Input.TextArea autoSize={{ minRows: 7, maxRows: 12 }} />
            </Form.Item>
            <Form.Item name="fieldMapping" label="字段映射 JSON" rules={[{ required: true }]}>
              <Input.TextArea autoSize={{ minRows: 4, maxRows: 8 }} />
            </Form.Item>
            <Button
              data-testid="ops-migration-create-job"
              type="primary"
              icon={<DatabaseOutlined />}
              loading={submitting}
              disabled={!currentAccountSetId}
              onClick={createMigrationJob}
            >
              创建迁移任务
            </Button>
          </Form>
        </Card>

        <Card title="正式导入参数" size="small">
          <Form
            form={migrationImportForm}
            layout="inline"
            initialValues={{
              fiscalYear: new Date().getFullYear(),
              periodNo: 1,
            }}
          >
            <Form.Item name="fiscalYear" label="会计年度" rules={[{ required: true }]}>
              <InputNumber min={2000} max={2100} />
            </Form.Item>
            <Form.Item name="periodNo" label="期间" rules={[{ required: true }]}>
              <InputNumber min={1} max={12} />
            </Form.Item>
          </Form>
          <Table
            rowKey="id"
            size="small"
            loading={loading}
            dataSource={migrationJobs}
            pagination={{ pageSize: 6 }}
            style={{ marginTop: 16 }}
            columns={[
              { title: '迁移任务', dataIndex: 'id', ellipsis: true },
              { title: '类型', dataIndex: 'jobType', render: (value: string) => zhStatus(value) },
              { title: '来源', dataIndex: 'sourceType', render: (value: string) => zhStatus(value) },
              { title: '状态', dataIndex: 'status', render: (value: string) => <Tag color={statusColor(value)}>{zhStatus(value)}</Tag> },
              { title: '行数', dataIndex: ['sourceSummary', 'rowCount'] },
              {
                title: '校验',
                dataIndex: 'validation',
                render: (value: MigrationJob['validation']) => {
                  const trialBalance = value?.trialBalance;
                  const status = value?.status ?? '-';
                  return (
                    <Space size={4} wrap>
                      <Tag color={statusColor(status)}>{zhStatus(status)}</Tag>
                      {trialBalance ? <Text type="secondary">差额 {trialBalance.difference}</Text> : null}
                    </Space>
                  );
                },
              },
              {
                title: '导入',
                dataIndex: 'importSummary',
                render: (value: MigrationJob['importSummary']) =>
                  value?.importedRows ? `${value.importedRows} 行 · ${value.fiscalYear}-${value.periodNo}` : '-',
              },
              {
                title: '操作',
                render: (_, job) => (
                  <Space size={8} wrap>
                    <Button
                      data-testid="ops-migration-run-dry-run"
                      size="small"
                      icon={<PlayCircleOutlined />}
                      loading={submitting}
                      onClick={() => runMigrationDryRun(job)}
                    >
                      dry-run
                    </Button>
                    <Button
                      data-testid="ops-migration-run-import"
                      size="small"
                      loading={submitting}
                      disabled={job.status !== 'dry_run_completed' || job.validation?.status !== 'passed'}
                      onClick={() => runMigrationImport(job)}
                    >
                      正式导入
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </div>
  );

  const securityPane = (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <Text type="secondary">集中查看权限拒绝、幂等范围冲突等 Phase 6 安全事件。</Text>
        <Button data-testid="ops-security-events-refresh" icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>
          刷新安全事件
        </Button>
      </div>
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={securityEvents}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '时间', dataIndex: 'createdAt', ellipsis: true },
          { title: '事件', dataIndex: 'eventType', render: (value: string) => zhStatus(value) },
          { title: '级别', dataIndex: 'severity', render: (value: string) => <Tag color={severityColor(value)}>{zhStatus(value)}</Tag> },
          { title: '操作者', dataIndex: 'actorId', ellipsis: true },
          {
            title: '对象',
            render: (_, row) => (
              <Space size={4} wrap>
                <Text>{row.objectType || '-'}</Text>
                {row.objectId ? <Text type="secondary">{row.objectId}</Text> : null}
              </Space>
            ),
          },
          { title: '消息', dataIndex: 'message', ellipsis: true },
        ]}
      />
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            运维工作台
          </Title>
          <Text type="secondary">账套备份恢复、历史数据迁移与安全事件审计集中处理。</Text>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>
          刷新
        </Button>
      </div>

      <Tabs
        defaultActiveKey="backup"
        items={[
          {
            key: 'backup',
            label: (
              <Space size={6}>
                <CloudDownloadOutlined />
                备份恢复
              </Space>
            ),
            children: backupRestorePane,
          },
          {
            key: 'migration',
            label: (
              <Space size={6}>
                <DatabaseOutlined />
                迁移任务
              </Space>
            ),
            children: migrationPane,
          },
          {
            key: 'security',
            label: (
              <Space size={6}>
                <AuditOutlined />
                安全审计
              </Space>
            ),
            children: securityPane,
          },
        ]}
      />
    </div>
  );
};
