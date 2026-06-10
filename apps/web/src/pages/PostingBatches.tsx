import React, { useCallback, useEffect, useState } from 'react';
import { Button, Descriptions, Drawer, Space, Table, Tag, message } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { api } from '../api';
import { zhActor, zhStatus } from '../i18n';

type PostingBatchResult = {
  voucherId: string;
  status: 'success' | 'failed';
  journalEntryCount?: number;
  error?: string;
};

type PostingBatch = {
  id: string;
  accountSetId: string;
  fiscalYear: number;
  periodNo: number;
  voucherIds: string[];
  successCount: number;
  failedCount: number;
  status: 'success' | 'partial_failed' | 'failed';
  postedBy: string;
  createdAt?: string;
  results: PostingBatchResult[];
};

const statusColor = {
  success: 'green',
  partial_failed: 'orange',
  failed: 'red',
};

export const PostingBatches: React.FC = () => {
  const [batches, setBatches] = useState<PostingBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<PostingBatch | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const fetchBatches = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get('/posting/batches');
      setBatches(data || []);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBatches();
  }, [fetchBatches]);

  const openDetail = async (record: PostingBatch) => {
    setDetailLoading(true);
    try {
      const data = await api.get(`/posting/batches/${record.id}`);
      setSelectedBatch(data);
    } catch (error: any) {
      message.error(error.message);
    } finally {
      setDetailLoading(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 16, width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>记账批次</h2>
        <Button data-testid="posting-batch-refresh" icon={<ReloadOutlined />} onClick={fetchBatches}>
          刷新
        </Button>
      </div>

      <Table
        data-testid="posting-batch-results"
        dataSource={batches}
        rowKey="id"
        loading={loading}
        columns={[
          { title: '批次编号', dataIndex: 'id' },
          { title: '年度', dataIndex: 'fiscalYear' },
          { title: '期间', dataIndex: 'periodNo' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (status: PostingBatch['status']) => <Tag color={statusColor[status]}>{zhStatus(status)}</Tag>,
          },
          { title: '成功数', dataIndex: 'successCount' },
          { title: '失败数', dataIndex: 'failedCount' },
          { title: '记账人', dataIndex: 'postedBy', render: (value: string) => zhActor(value) },
          {
            title: '操作',
            key: 'actions',
            render: (_: unknown, record: PostingBatch) => (
              <Button size="small" onClick={() => openDetail(record)}>
                详情
              </Button>
            ),
          },
        ]}
      />

      <Drawer
        data-testid="posting-batch-detail"
        title="记账批次详情"
        open={Boolean(selectedBatch)}
        loading={detailLoading}
        width={720}
        onClose={() => setSelectedBatch(null)}
      >
        {selectedBatch ? (
          <div style={{ display: 'grid', gap: 16 }}>
            <Descriptions size="small" bordered column={2}>
              <Descriptions.Item label="批次编号">{selectedBatch.id}</Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={statusColor[selectedBatch.status]}>{zhStatus(selectedBatch.status)}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="账套">{selectedBatch.accountSetId}</Descriptions.Item>
              <Descriptions.Item label="期间">
                {selectedBatch.fiscalYear}-{String(selectedBatch.periodNo).padStart(2, '0')}
              </Descriptions.Item>
              <Descriptions.Item label="成功数">{selectedBatch.successCount}</Descriptions.Item>
              <Descriptions.Item label="失败数">{selectedBatch.failedCount}</Descriptions.Item>
              <Descriptions.Item label="记账人">{zhActor(selectedBatch.postedBy)}</Descriptions.Item>
              <Descriptions.Item label="创建时间">{selectedBatch.createdAt ?? '-'}</Descriptions.Item>
            </Descriptions>

            <Table
              dataSource={selectedBatch.results}
              rowKey="voucherId"
              pagination={false}
              size="small"
              columns={[
                { title: '凭证编号', dataIndex: 'voucherId' },
                {
                  title: '状态',
                  dataIndex: 'status',
                  render: (status: PostingBatchResult['status']) => (
                    <Tag color={status === 'success' ? 'green' : 'red'}>{zhStatus(status)}</Tag>
                  ),
                },
                { title: '分录数', dataIndex: 'journalEntryCount', render: (value?: number) => value ?? '-' },
                { title: '错误信息', dataIndex: 'error', render: (value?: string) => value ?? '-' },
              ]}
            />

            <Space wrap>
              {selectedBatch.voucherIds.map((voucherId) => (
                <Tag key={voucherId}>{voucherId}</Tag>
              ))}
            </Space>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
};
