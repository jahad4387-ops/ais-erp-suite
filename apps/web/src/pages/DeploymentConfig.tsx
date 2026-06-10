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
      </Space>
    </div>
  );
};
