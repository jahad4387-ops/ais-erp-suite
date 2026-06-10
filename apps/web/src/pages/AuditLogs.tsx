import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { zhAction, zhActor, zhObjectType } from '../i18n';

const { Title, Text } = Typography;

type AuditLogRecord = {
  id: string;
  actorId: string;
  action: string;
  objectType: string;
  objectId: string;
  occurredAt: string;
};

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [actorFilter, setActorFilter] = useState('');
  const [objectTypeFilter, setObjectTypeFilter] = useState<string | undefined>();
  const [actionFilter, setActionFilter] = useState('');

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await api.get('/audit-logs');
      setLogs(data || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const objectTypeOptions = useMemo(
    () =>
      Array.from(new Set(logs.map((log) => log.objectType)))
        .sort()
        .map((objectType) => ({ value: objectType, label: zhObjectType(objectType) })),
    [logs],
  );

  const filteredLogs = useMemo(
    () =>
      logs.filter((log) => {
        const actorMatch = actorFilter.trim() === '' || log.actorId.toLowerCase().includes(actorFilter.trim().toLowerCase());
        const objectTypeMatch = !objectTypeFilter || log.objectType === objectTypeFilter;
        const actionMatch = actionFilter.trim() === '' || log.action.toLowerCase().includes(actionFilter.trim().toLowerCase());
        return actorMatch && objectTypeMatch && actionMatch;
      }),
    [actionFilter, actorFilter, logs, objectTypeFilter],
  );

  return (
    <Space orientation="vertical" size={16} style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <Title level={3} style={{ marginTop: 0 }}>
            操作日志
          </Title>
          <Text type="secondary">按用户、模块和动作筛选系统操作记录。</Text>
        </div>
        <Button data-testid="audit-log-refresh" icon={<ReloadOutlined />} onClick={fetchAuditLogs} loading={loading}>
          刷新
        </Button>
      </div>

      <Space wrap>
        <Input
          allowClear
          placeholder="操作人"
          value={actorFilter}
          onChange={(event) => setActorFilter(event.target.value)}
          style={{ width: 220 }}
        />
        <Select
          allowClear
          placeholder="模块"
          value={objectTypeFilter}
          onChange={setObjectTypeFilter}
          options={objectTypeOptions}
          style={{ width: 220 }}
        />
        <Input
          allowClear
          placeholder="动作"
          value={actionFilter}
          onChange={(event) => setActionFilter(event.target.value)}
          style={{ width: 220 }}
        />
      </Space>

      <Table
        loading={loading}
        rowKey="id"
        dataSource={filteredLogs}
        columns={[
          { title: '时间', dataIndex: 'occurredAt' },
          { title: '操作人', dataIndex: 'actorId', render: (value: string) => zhActor(value) },
          {
            title: '模块',
            dataIndex: 'objectType',
            render: (value: string) => <Tag color="blue">{zhObjectType(value)}</Tag>,
          },
          { title: '动作', dataIndex: 'action', render: (value: string) => zhAction(value) },
          { title: '对象 ID', dataIndex: 'objectId' },
        ]}
      />
    </Space>
  );
};
