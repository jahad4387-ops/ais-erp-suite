import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Descriptions, Space, Table, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { AgentDraftEntryButton } from '../components/AgentDraftEntryButton';
import { useAppContext } from '../context/AppContext';

type FixedAsset = {
  id: string;
  assetNo: string;
  name: string;
  currentDepartmentId?: string | null;
  currentDepartmentName?: string | null;
  responsiblePerson?: string | null;
  originalValue?: number;
  accumulatedDepreciation?: number;
  netValue?: number;
  status?: string;
};

type DepreciationRun = {
  id: string;
  runNo: string;
  fiscalYear: number;
  periodNo: number;
  dryRun: boolean;
  status: string;
  totalDepreciationAmount?: number;
};

type AssetCount = {
  id: string;
  countNo: string;
  status: string;
  dryRun: boolean;
  varianceCount?: number;
};

const assetStatusColor: Record<string, string> = {
  active: 'green',
  idle: 'gold',
  disposed: 'default',
};

const depreciationStatusColor: Record<string, string> = {
  calculated: 'blue',
  approved: 'gold',
  locked: 'green',
};

const countStatusColor: Record<string, string> = {
  preview: 'blue',
  committed: 'green',
  draft: 'default',
};

export const EquipmentManagement: React.FC = () => {
  const { currentAccountSetId, currentPeriod, currentYear } = useAppContext();
  const [assets, setAssets] = useState<FixedAsset[]>([]);
  const [depreciationRuns, setDepreciationRuns] = useState<DepreciationRun[]>([]);
  const [assetCounts, setAssetCounts] = useState<AssetCount[]>([]);

  const fetchData = useCallback(async () => {
    if (!currentAccountSetId) return;
    const encodedAccountSetId = encodeURIComponent(currentAccountSetId);
    const [assetRows, depreciationRows, countRows] = await Promise.all([
      api.get(`/fixed-assets?accountSetId=${encodedAccountSetId}`),
      api.get(`/depreciation-runs?accountSetId=${encodedAccountSetId}`),
      api.get(`/asset-counts?accountSetId=${encodedAccountSetId}`),
    ]);
    setAssets(assetRows ?? []);
    setDepreciationRuns(depreciationRows ?? []);
    setAssetCounts(countRows ?? []);
  }, [currentAccountSetId]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const currentPeriodRuns = depreciationRuns.filter(
    (run) => Number(run.fiscalYear) === Number(currentYear) && Number(run.periodNo) === Number(currentPeriod)
  );
  const latestCount = assetCounts[0];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0 }}>设备管理</h2>
        <Space>
          <AgentDraftEntryButton
            draftType="asset_change"
            sourceObjectType="equipment_management_page"
            userInstruction={`Analyze manufacturing equipment status for ${currentYear}-${String(currentPeriod).padStart(2, '0')}.`}
          >
            Agent
          </AgentDraftEntryButton>
          <Button icon={<ReloadOutlined />} onClick={fetchData}>刷新</Button>
        </Space>
      </div>

      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        description="设备管理复用固定资产、折旧计提和资产盘点数据，为供应链制造中心提供设备状态、折旧状态和盘点状态视图。"
      />

      <Descriptions bordered size="small" column={3} style={{ marginBottom: 16 }}>
        <Descriptions.Item label="设备状态">{assets.length} 台设备</Descriptions.Item>
        <Descriptions.Item label="折旧状态">{currentPeriodRuns.length} 张本期折旧单</Descriptions.Item>
        <Descriptions.Item label="盘点状态">{latestCount ? `${latestCount.countNo} / ${latestCount.status}` : '暂无盘点'}</Descriptions.Item>
      </Descriptions>

      <Table
        rowKey="id"
        dataSource={assets}
        pagination={{ pageSize: 8 }}
        columns={[
          { title: '设备编号', dataIndex: 'assetNo' },
          { title: '设备名称', dataIndex: 'name' },
          { title: '使用部门', render: (_, row) => row.currentDepartmentName ?? row.currentDepartmentId ?? '-' },
          { title: '责任人', dataIndex: 'responsiblePerson', render: (value) => value ?? '-' },
          { title: '原值', dataIndex: 'originalValue', render: (value) => value ?? 0 },
          { title: '累计折旧', dataIndex: 'accumulatedDepreciation', render: (value) => value ?? 0 },
          { title: '净值', dataIndex: 'netValue', render: (value) => value ?? 0 },
          {
            title: '设备状态',
            render: (_, row) => <Tag color={assetStatusColor[row.status ?? 'active'] ?? 'blue'}>{row.status ?? 'active'}</Tag>,
          },
          {
            title: 'Agent',
            render: (_, row) => (
              <AgentDraftEntryButton
                size="small"
                draftType="asset_change"
                sourceObjectType="equipment_asset"
                sourceObjectId={row.id}
                userInstruction={`Generate equipment maintenance or value-change advice for ${row.assetNo}.`}
              >
                Agent
              </AgentDraftEntryButton>
            ),
          },
        ]}
      />

      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={depreciationRuns}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: '折旧单号', dataIndex: 'runNo' },
          { title: '期间', render: (_, row) => `${row.fiscalYear}-${String(row.periodNo).padStart(2, '0')}` },
          { title: '模式', render: (_, row) => (row.dryRun ? <Tag>试算</Tag> : <Tag color="blue">正式</Tag>) },
          {
            title: '折旧状态',
            render: (_, row) => <Tag color={depreciationStatusColor[row.status] ?? 'default'}>{row.status}</Tag>,
          },
          { title: '折旧金额', dataIndex: 'totalDepreciationAmount', render: (value) => value ?? 0 },
        ]}
      />

      <Table
        style={{ marginTop: 16 }}
        rowKey="id"
        dataSource={assetCounts}
        pagination={{ pageSize: 5 }}
        columns={[
          { title: '盘点单号', dataIndex: 'countNo' },
          { title: '模式', render: (_, row) => (row.dryRun ? <Tag>预览</Tag> : <Tag color="blue">正式</Tag>) },
          {
            title: '盘点状态',
            render: (_, row) => <Tag color={countStatusColor[row.status] ?? 'default'}>{row.status}</Tag>,
          },
          { title: '差异数量', dataIndex: 'varianceCount', render: (value) => value ?? 0 },
        ]}
      />
    </div>
  );
};
