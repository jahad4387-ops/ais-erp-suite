import React, { useEffect, useState } from 'react';
import { Button, Descriptions, Space, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { zhStatus } from '../i18n';

type DeploymentConfigResponse = {
  deploymentMode: string;
  platformStore: string;
  database: {
    provider: string;
    configured: boolean;
    urlPresent: boolean;
  };
  jwt: {
    secretConfigured: boolean;
    previousSecretsPresent: boolean;
    rotation: {
      required: boolean;
      configured: boolean;
      approvedByPresent: boolean;
      expiresAt: string | null;
      monitorRefPresent: boolean;
      rollbackRefPresent: boolean;
    };
  };
  attachmentStorage: {
    provider: string;
    configured: boolean;
    rootPresent: boolean;
    external?: {
      endpointPresent: boolean;
      bucketPresent: boolean;
      credentialRefPresent: boolean;
      retentionDaysConfigured: boolean;
      retentionDays: number | null;
    };
  };
  ai: {
    ocr: {
      provider: string;
      model: string;
      configured: boolean;
      commandPresent: boolean;
    };
    llmDraft: {
      provider: string;
      model: string;
      configured: boolean;
      timeoutMs: number | null;
      maxTokens: number | null;
      baseUrlPresent: boolean;
      apiKeyRefPresent: boolean;
      redaction: string;
    };
  };
  restoreDrill: {
    enabled: boolean;
    silentSandbox: boolean;
    outboundBlocked: boolean;
    blockedChannels: string[];
    envVar: string | null;
  };
};

const statusTag = (configured: boolean) => <Tag color={configured ? 'green' : 'red'}>{configured ? '已配置' : '缺失'}</Tag>;
const configTag = (configured: boolean | undefined, label: string, code: string) => (
  <Tag color={configured ? 'green' : 'red'} title={code}>
    {label}
  </Tag>
);
const inactiveConfigTag = (label: string, code: string) => (
  <Tag color="default" title={code}>
    {label}：未启用
  </Tag>
);

export const DeploymentConfig: React.FC = () => {
  const [config, setConfig] = useState<DeploymentConfigResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchConfig = async () => {
    setLoading(true);
    try {
      const data = await api.get('/deployment/config');
      setConfig(data);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchConfig();
  }, []);

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%', maxWidth: 900 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>部署配置</h2>
        <Button data-testid="deployment-config-check" icon={<ReloadOutlined />} loading={loading} onClick={fetchConfig}>
          检查
        </Button>
      </div>

      <Descriptions bordered column={2}>
        <Descriptions.Item label="部署模式">{zhStatus(config?.deploymentMode)}</Descriptions.Item>
        <Descriptions.Item label="平台存储">{zhStatus(config?.platformStore)}</Descriptions.Item>
        <Descriptions.Item label="数据库类型">{zhStatus(config?.database.provider)}</Descriptions.Item>
        <Descriptions.Item label="数据库状态">
          {config ? statusTag(config.database.configured) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="JWT 密钥">{config ? statusTag(config.jwt.secretConfigured) : '-'}</Descriptions.Item>
        <Descriptions.Item label="JWT 轮换">
          {config ? statusTag(!config.jwt.rotation.required || config.jwt.rotation.configured) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="附件存储">{zhStatus(config?.attachmentStorage.provider)}</Descriptions.Item>
        <Descriptions.Item label="存储状态">
          {config ? statusTag(config.attachmentStorage.configured) : '-'}
        </Descriptions.Item>
        <Descriptions.Item label="本地 OCR">{zhStatus(config?.ai.ocr.provider)}</Descriptions.Item>
        <Descriptions.Item label="OCR 状态">{config ? statusTag(config.ai.ocr.configured) : '-'}</Descriptions.Item>
        <Descriptions.Item label="OCR 命令">{config ? statusTag(config.ai.ocr.commandPresent) : '-'}</Descriptions.Item>
        <Descriptions.Item label="草稿大模型">{zhStatus(config?.ai.llmDraft.provider)}</Descriptions.Item>
        <Descriptions.Item label="大模型状态">{config ? statusTag(config.ai.llmDraft.configured) : '-'}</Descriptions.Item>
        <Descriptions.Item label="恢复演练">{config ? statusTag(config.restoreDrill.enabled) : '-'}</Descriptions.Item>
        <Descriptions.Item label="外发阻断">
          {config ? (
            <Space wrap>
              {statusTag(config.restoreDrill.outboundBlocked)}
              <span>{config.restoreDrill.blockedChannels.join(', ')}</span>
            </Space>
          ) : (
            '-'
          )}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap>
        {configTag(config?.database.urlPresent, '数据库连接地址', 'DATABASE_URL')}
        {configTag(config?.jwt.secretConfigured, 'JWT 密钥', 'AIS_JWT_SECRET')}
        {configTag(
          !config?.jwt.previousSecretsPresent || config.jwt.rotation.approvedByPresent,
          'JWT 轮换审批人',
          'AIS_JWT_ROTATION_APPROVED_BY',
        )}
        {configTag(
          !config?.jwt.previousSecretsPresent || Boolean(config.jwt.rotation.expiresAt),
          'JWT 轮换到期时间',
          'AIS_JWT_ROTATION_EXPIRES_AT',
        )}
        {configTag(
          !config?.jwt.previousSecretsPresent || config.jwt.rotation.monitorRefPresent,
          'JWT 轮换监控引用',
          'AIS_JWT_ROTATION_MONITOR_REF',
        )}
        {configTag(
          !config?.jwt.previousSecretsPresent || config.jwt.rotation.rollbackRefPresent,
          'JWT 轮换回滚引用',
          'AIS_JWT_ROTATION_ROLLBACK_REF',
        )}
        {configTag(Boolean(config?.attachmentStorage.provider), '附件存储提供方', 'AIS_ATTACHMENT_STORAGE_PROVIDER')}
        {configTag(config?.attachmentStorage.rootPresent, '附件存储根目录', 'AIS_ATTACHMENT_STORAGE_ROOT')}
        {config?.attachmentStorage.provider === 'external' ? (
          <>
            {configTag(config.attachmentStorage.external?.endpointPresent, '外部附件端点', 'AIS_ATTACHMENT_EXTERNAL_ENDPOINT')}
            {configTag(config.attachmentStorage.external?.bucketPresent, '外部附件存储桶', 'AIS_ATTACHMENT_EXTERNAL_BUCKET')}
            {configTag(
              config.attachmentStorage.external?.credentialRefPresent,
              '外部附件凭据引用',
              'AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF',
            )}
            {configTag(config.attachmentStorage.external?.retentionDaysConfigured, '附件保留天数', 'AIS_ATTACHMENT_RETENTION_DAYS')}
          </>
        ) : (
          <>
            {inactiveConfigTag('外部附件端点', 'AIS_ATTACHMENT_EXTERNAL_ENDPOINT')}
            {inactiveConfigTag('外部附件存储桶', 'AIS_ATTACHMENT_EXTERNAL_BUCKET')}
            {inactiveConfigTag('外部附件凭据引用', 'AIS_ATTACHMENT_EXTERNAL_CREDENTIAL_REF')}
            {inactiveConfigTag('附件保留天数', 'AIS_ATTACHMENT_RETENTION_DAYS')}
          </>
        )}
        {configTag(config?.ai.ocr.configured, 'OCR 提供方', 'AIS_OCR_PROVIDER')}
        {configTag(Boolean(config?.ai.ocr.model), 'OCR 模型', 'AIS_OCR_MODEL')}
        {configTag(config?.ai.ocr.commandPresent, 'OCR 本地命令', 'AIS_OCR_COMMAND')}
        {config?.ai.ocr.commandPresent
          ? configTag(true, 'OCR 命令参数模板', 'AIS_OCR_COMMAND_ARGS')
          : inactiveConfigTag('OCR 命令参数模板', 'AIS_OCR_COMMAND_ARGS')}
        {configTag(Boolean(config?.ai.llmDraft.provider), '草稿大模型提供方', 'AIS_LLM_DRAFT_PROVIDER')}
        {configTag(Boolean(config?.ai.llmDraft.model), '草稿大模型模型', 'AIS_LLM_DRAFT_MODEL')}
        {configTag(config?.ai.llmDraft.baseUrlPresent, '草稿大模型网关', 'AIS_LLM_DRAFT_BASE_URL')}
        {configTag(config?.ai.llmDraft.apiKeyRefPresent, '草稿大模型密钥引用', 'AIS_LLM_DRAFT_API_KEY_REF')}
        {configTag(Boolean(config?.ai.llmDraft.timeoutMs), '草稿大模型超时', 'AIS_LLM_DRAFT_TIMEOUT_MS')}
        {configTag(Boolean(config?.ai.llmDraft.maxTokens), '草稿大模型 Token 上限', 'AIS_LLM_DRAFT_MAX_TOKENS')}
        {configTag(Boolean(config?.ai.llmDraft.redaction), '草稿大模型脱敏策略', 'AIS_LLM_DRAFT_REDACTION')}
        {configTag(config?.restoreDrill.enabled, '恢复演练静默沙箱', 'RESTORE_DRILL')}
        {config?.restoreDrill.envVar === 'AIS_RESTORE_DRILL'
          ? configTag(config.restoreDrill.enabled, '恢复演练静默沙箱别名', 'AIS_RESTORE_DRILL')
          : inactiveConfigTag('恢复演练静默沙箱别名', 'AIS_RESTORE_DRILL')}
      </Space>
    </div>
  );
};
